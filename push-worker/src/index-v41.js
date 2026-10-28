import base from "./index-v35.js";
import webpush from "web-push";

const TOKEN_URL = "https://portail-api.meteofrance.fr/token";
const TOKEN_KEY = "mf:oauth:token:v1";
const VIGILANCE_CACHE_KEY = "mf:vigilance:current:v1";
const VIGILANCE_URL = "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours";
const ADVANCED_SUB_KEY = "subscription:advanced-v41";
const RAIN_STATE_KEY = "alert:v41:rain-soon";
const VIG_STATE_KEY = "alert:v41:vigilance";

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

function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.APP_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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

  const maxLevel = parsed.length ? Math.max(...parsed.map(x => x.level), 1) : 1;
  return {
    ok: true,
    source: "Météo-France Vigilance",
    department: code,
    updateTime: product?.update_time || data?.meta?.product_datetime || product?.meta?.product_datetime || null,
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

function validSubscription(sub) {
  return !!(sub && typeof sub.endpoint === "string" && sub.endpoint.startsWith("https://") && sub.keys?.p256dh && sub.keys?.auth);
}

async function interceptSubscribe(request, env, ctx) {
  let body;
  try { body = await request.clone().json(); } catch { return base.fetch(request, env, ctx); }
  if (!validSubscription(body?.subscription)) return base.fetch(request, env, ctx);

  const settings = body.settings || {};
  const advanced = {
    subscription: body.subscription,
    latitude: Number(body.latitude),
    longitude: Number(body.longitude),
    city: String(body.city || "Ma position").slice(0, 120),
    department: String(body.department || "").trim().toUpperCase().slice(0, 3),
    settings: {
      rainSoon: settings.rainSoon !== false,
      rainSoonMinutes: clamp(settings.rainSoonMinutes, 15, 60, 30),
      rainSoonMinMm: clamp(settings.rainSoonMinMm, 0.1, 4, 0.1),
      vigilance: settings.vigilance !== false,
      vigilanceLevel: clamp(settings.vigilanceLevel, 2, 4, 3),
    },
    updatedAt: Date.now(),
  };
  if (Number.isFinite(advanced.latitude) && Number.isFinite(advanced.longitude)) {
    await env.PUSH_KV.put(ADVANCED_SUB_KEY, JSON.stringify(advanced));
  }

  const baseBody = {
    ...body,
    settings: { ...settings, rainSoon: false },
  };
  const forwarded = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(baseBody),
  });
  return base.fetch(forwarded, env, ctx);
}

function configureWebPush(env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw new Error("VAPID keys are missing");
  webpush.setVapidDetails(env.VAPID_SUBJECT || env.APP_URL, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

async function sendAdvancedPush(env, record, payload) {
  configureWebPush(env);
  try {
    await webpush.sendNotification(record.subscription, JSON.stringify(payload), { TTL: 3600, urgency: payload.urgency || "normal" });
    return true;
  } catch (error) {
    const status = Number(error?.statusCode || error?.status || 0);
    if (status === 404 || status === 410) {
      await env.PUSH_KV.delete(ADVANCED_SUB_KEY);
      return false;
    }
    throw error;
  }
}

async function fetchMinutely(record) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", record.latitude);
  url.searchParams.set("longitude", record.longitude);
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("minutely_15", "precipitation,rain,weather_code");
  url.searchParams.set("forecast_minutely_15", "8");
  const response = await fetch(url, { cf: { cacheTtl: 300 } });
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
  return response.json();
}

function intensityLabel(mm) {
  if (mm >= 1.5) return "forte";
  if (mm >= 0.5) return "modérée";
  return "faible";
}

async function checkPreciseRain(env, record) {
  if (record.settings?.rainSoon === false) return;
  const data = await fetchMinutely(record);
  const m = data?.minutely_15;
  if (!m?.time?.length) return;
  const now = Date.now();
  let start = m.time.findIndex(t => Date.parse(`${t}Z`) >= now - 5 * 60 * 1000);
  if (start < 0) start = 0;
  const amount = i => Number(m.rain?.[i] ?? m.precipitation?.[i] ?? 0);
  const threshold = clamp(record.settings?.rainSoonMinMm, 0.1, 4, 0.1);
  if (amount(start) >= threshold) return;
  const maxMinutes = clamp(record.settings?.rainSoonMinutes, 15, 60, 30);

  let found = -1;
  for (let i = start + 1; i < m.time.length; i++) {
    const minutes = Math.round((Date.parse(`${m.time[i]}Z`) - now) / 60000);
    if (minutes > maxMinutes) break;
    if (minutes >= 0 && amount(i) >= threshold) { found = i; break; }
  }
  if (found < 0) return;

  const minutes = Math.max(5, Math.round((Date.parse(`${m.time[found]}Z`) - now) / 300000) * 5);
  let end = found;
  while (end + 1 < m.time.length && amount(end + 1) >= threshold) end++;
  const peak = Math.max(...Array.from({ length: end - found + 1 }, (_, k) => amount(found + k)));
  const fingerprint = `${record.city}|${m.time[found]}|${threshold}`;
  const previous = await env.PUSH_KV.get(RAIN_STATE_KEY, "json");
  if (previous?.fingerprint === fingerprint || Number(previous?.blockedUntil || 0) > now) return;

  const sent = await sendAdvancedPush(env, record, {
    title: "🌧️ Pluie bientôt",
    body: `Pluie ${intensityLabel(peak)} prévue dans environ ${minutes} min à ${record.city}.`,
    urgency: "high",
    tag: "meteo-rain-soon-v41",
    data: { url: `${env.APP_URL}?tab=alerts`, type: "rainSoon" },
    icon: `${env.APP_URL}icon.svg`,
  });
  if (sent) await env.PUSH_KV.put(RAIN_STATE_KEY, JSON.stringify({ fingerprint, sentAt: now, blockedUntil: now + 90 * 60 * 1000 }));
}

async function checkVigilance(env, record) {
  if (record.settings?.vigilance === false || !record.department) return;
  let raw;
  try { raw = await fetchVigilance(env, false); } catch (error) { console.warn("Vigilance alert skipped", error?.message || error); return; }
  const parsed = parseDepartment(raw, record.department);
  const today = parsed.periods.find(p => p.term === "J") || parsed.periods[0];
  if (!today) return;
  const threshold = clamp(record.settings?.vigilanceLevel, 2, 4, 3);
  if (Number(today.level || 1) < threshold) return;
  const phenomena = (today.phenomena || []).filter(p => Number(p.level) >= threshold).map(p => p.name);
  const fingerprint = `${record.department}|${parsed.updateTime || ""}|${today.level}|${phenomena.join(",")}`;
  const previous = await env.PUSH_KV.get(VIG_STATE_KEY, "json");
  if (previous?.fingerprint === fingerprint) return;

  const sent = await sendAdvancedPush(env, record, {
    title: `⚠️ Vigilance ${today.color} Météo-France`,
    body: `${record.city} (${record.department})${phenomena.length ? ` • ${phenomena.join(", ")}` : ""}.`,
    urgency: Number(today.level) >= 3 ? "high" : "normal",
    tag: "meteo-vigilance-v41",
    data: { url: `${env.APP_URL}?tab=alerts`, type: "vigilance" },
    icon: `${env.APP_URL}icon.svg`,
  });
  if (sent) await env.PUSH_KV.put(VIG_STATE_KEY, JSON.stringify({ fingerprint, sentAt: Date.now() }));
}

async function checkAdvancedAlerts(env) {
  const record = await env.PUSH_KV.get(ADVANCED_SUB_KEY, "json");
  if (!record?.subscription) return;
  await Promise.allSettled([checkPreciseRain(env, record), checkVigilance(env, record)]);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname === "/vigilance") {
      return new Response(null, { status: 204, headers: cors(env) });
    }
    try {
      if (request.method === "GET" && url.pathname === "/vigilance") return await vigilanceResponse(request, env);
      if (request.method === "POST" && url.pathname === "/subscribe") return await interceptSubscribe(request, env, ctx);
      if (request.method === "POST" && url.pathname === "/unsubscribe") {
        await Promise.all([env.PUSH_KV.delete(ADVANCED_SUB_KEY), env.PUSH_KV.delete(RAIN_STATE_KEY), env.PUSH_KV.delete(VIG_STATE_KEY)]);
        return base.fetch(request, env, ctx);
      }
    } catch (error) {
      console.error("V4.1 worker error", error);
      return json({ ok: false, error: error?.message || "Service météo V4.1 indisponible" }, 502, env);
    }
    return base.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === "function") base.scheduled(controller, env, ctx);
    ctx.waitUntil(checkAdvancedAlerts(env));
  },
};
