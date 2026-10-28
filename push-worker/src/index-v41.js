import base from "./index-v35.js";

const TOKEN_URL = "https://portail-api.meteofrance.fr/token";
const TOKEN_KEY = "mf:oauth:token:v1";
const VIGILANCE_CACHE_KEY = "mf:vigilance:current:v1";
const VIGILANCE_URL = "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours";

const PHENOMENA = {
  "1": "Vent",
  "2": "Pluie-inondation",
  "3": "Orages",
  "4": "Crues",
  "5": "Neige-verglas",
  "6": "Canicule",
  "7": "Grand froid",
  "8": "Avalanches",
  "9": "Vagues-submersion",
};

const COLORS = {
  1: { name: "Vert", hex: "#31a24c" },
  2: { name: "Jaune", hex: "#f5d547" },
  3: { name: "Orange", hex: "#f49a24" },
  4: { name: "Rouge", hex: "#d9363e" },
};

function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.APP_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(data, status, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env) },
  });
}

function cleanApplicationId(raw) {
  let value = String(raw || "").trim().replace(/^['"]|['"]$/g, "").trim();
  value = value.replace(/^authorization\s*:\s*basic\s+/i, "").trim();
  value = value.replace(/^basic\s+/i, "").trim();
  return value;
}

async function getOauthToken(env, forceRefresh = false) {
  const applicationId = cleanApplicationId(env.METEOFRANCE_APPLICATION_ID);
  if (!applicationId) throw new Error("METEOFRANCE_APPLICATION_ID is missing");

  if (!forceRefresh && env.PUSH_KV) {
    const cached = await env.PUSH_KV.get(TOKEN_KEY, "json");
    if (cached?.accessToken && Number(cached.expiresAt || 0) > Date.now() + 60000) return cached.accessToken;
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${applicationId}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error(`Météo-France OAuth HTTP ${response.status}`);
  const data = await response.json();
  if (!data?.access_token) throw new Error("OAuth response has no access_token");

  const expiresIn = Math.max(300, Number(data.expires_in || 3600));
  const expiresAt = Date.now() + expiresIn * 1000;
  await env.PUSH_KV?.put(TOKEN_KEY, JSON.stringify({ accessToken: data.access_token, expiresAt }), {
    expirationTtl: Math.max(300, Math.floor(expiresIn - 60)),
  });
  return data.access_token;
}

async function fetchVigilance(env, force = false) {
  if (!force && env.PUSH_KV) {
    const cached = await env.PUSH_KV.get(VIGILANCE_CACHE_KEY, "json");
    if (cached?.cachedAt && Date.now() - cached.cachedAt < 5 * 60 * 1000 && cached?.data) return cached.data;
  }

  let token = await getOauthToken(env, false);
  let response = await fetch(VIGILANCE_URL, {
    headers: { Accept: "application/json,*/*", Authorization: `Bearer ${token}` },
    cf: { cacheTtl: 180 },
  });
  if (response.status === 401) {
    await env.PUSH_KV?.delete(TOKEN_KEY);
    token = await getOauthToken(env, true);
    response = await fetch(VIGILANCE_URL, {
      headers: { Accept: "application/json,*/*", Authorization: `Bearer ${token}` },
      cf: { cacheTtl: 180 },
    });
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 180);
    if (response.status === 403) throw new Error("Abonnement API Vigilance Météo-France requis");
    throw new Error(`Vigilance Météo-France HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const data = await response.json();
  await env.PUSH_KV?.put(VIGILANCE_CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), data }), { expirationTtl: 360 });
  return data;
}

function parseDepartment(data, department) {
  const code = String(department || "").trim().toUpperCase();
  if (!/^(?:\d{2,3}|2A|2B)$/.test(code)) throw new Error("Code département invalide");
  const product = data?.product || data;
  const periods = Array.isArray(product?.periods) ? product.periods : [];
  const parsed = periods.map(period => {
    const domains = period?.timelaps?.domain_ids || [];
    const domain = domains.find(item => String(item?.domain_id || "").toUpperCase() === code);
    if (!domain) return null;
    const phenomena = (domain.phenomenon_items || []).map(item => {
      const level = Number(item?.phenomenon_max_color_id || 1);
      return {
        id: String(item?.phenomenon_id || ""),
        name: PHENOMENA[String(item?.phenomenon_id || "")] || `Phénomène ${item?.phenomenon_id || "?"}`,
        level,
        color: COLORS[level]?.name || "Vert",
        colorHex: COLORS[level]?.hex || COLORS[1].hex,
        timeline: (item?.timelaps_items || []).map(x => ({
          begin: x?.begin_time || null,
          end: x?.end_time || null,
          level: Number(x?.color_id || 1),
        })),
      };
    }).sort((a,b) => b.level - a.level);
    const level = Number(domain?.max_color_id || Math.max(1, ...phenomena.map(x => x.level)));
    return {
      term: period?.echeance || "J",
      begin: period?.begin_validity_time || null,
      end: period?.end_validity_time || null,
      level,
      color: COLORS[level]?.name || "Vert",
      colorHex: COLORS[level]?.hex || COLORS[1].hex,
      phenomena,
    };
  }).filter(Boolean);

  const maxLevel = periods.length ? Math.max(...parsed.map(x => x.level), 1) : 1;
  return {
    ok: true,
    source: "Météo-France Vigilance",
    department: code,
    updateTime: product?.update_time || data?.meta?.product_datetime || null,
    maxLevel,
    maxColor: COLORS[maxLevel]?.name || "Vert",
    maxColorHex: COLORS[maxLevel]?.hex || COLORS[1].hex,
    periods: parsed,
  };
}

async function vigilanceResponse(request, env) {
  const url = new URL(request.url);
  const department = url.searchParams.get("department");
  if (!department) return json({ ok: false, error: "department is required" }, 400, env);
  const data = await fetchVigilance(env, url.searchParams.get("refresh") === "1");
  return json(parseDepartment(data, department), 200, env);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname === "/vigilance") {
      return new Response(null, { status: 204, headers: cors(env) });
    }
    try {
      if (request.method === "GET" && url.pathname === "/vigilance") return await vigilanceResponse(request, env);
    } catch (error) {
      console.error("Vigilance proxy error", error);
      return json({ ok: false, error: error?.message || "Vigilance indisponible" }, 502, env);
    }
    return base.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === "function") return base.scheduled(controller, env, ctx);
  },
};
