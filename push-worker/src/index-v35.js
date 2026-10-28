import base from "./index.js";

const MF_BASE = "https://public-api.meteofrance.fr/public/aromepi/1.0";
const MF_SERVICE = "MF-NWP-HIGHRES-AROMEPI-001-FRANCE-WMS";
const META_KEY = "mf:aromepi:meta:v1";

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

function cleanMfKey(raw) {
  let key = String(raw || "").trim();
  key = key.replace(/^['"]|['"]$/g, "").trim();
  key = key.replace(/^apikey\s*:\s*/i, "").trim();
  key = key.replace(/^bearer\s+/i, "").trim();
  return key;
}

async function mfFetch(url, env, accept = "*/*") {
  const key = cleanMfKey(env.METEOFRANCE_API_KEY);
  if (!key) throw new Error("METEOFRANCE_API_KEY is missing");

  const attempts = [];

  let response = await fetch(url, {
    headers: { accept, apikey: key },
    cf: { cacheTtl: 120 },
  });
  attempts.push(`header:${response.status}`);
  if (response.ok || ![401, 403].includes(response.status)) return response;

  const urlWithKey = new URL(url);
  urlWithKey.searchParams.set("apikey", key);
  response = await fetch(urlWithKey.toString(), {
    headers: { accept },
    cf: { cacheTtl: 120 },
  });
  attempts.push(`query:${response.status}`);
  if (response.ok || ![401, 403].includes(response.status)) return response;

  response = await fetch(url, {
    headers: { accept, Authorization: `Bearer ${key}` },
    cf: { cacheTtl: 120 },
  });
  attempts.push(`bearer:${response.status}`);

  if ([401, 403].includes(response.status)) {
    const body = await response.arrayBuffer();
    const headers = new Headers(response.headers);
    headers.set("x-mf-auth-attempts", attempts.join(","));
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  }
  return response;
}

function durationMs(value) {
  const m = String(value || "").match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return 0;
  return ((Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0)) * 1000);
}

function expandDimension(raw) {
  const values = [];
  for (const partRaw of String(raw || "").split(",")) {
    const part = partRaw.trim();
    if (!part) continue;
    const interval = part.split("/");
    if (interval.length === 3) {
      const start = Date.parse(interval[0]);
      const end = Date.parse(interval[1]);
      const step = durationMs(interval[2]);
      if (Number.isFinite(start) && Number.isFinite(end) && step > 0) {
        for (let t = start; t <= end && values.length < 500; t += step) values.push(new Date(t).toISOString().replace(".000Z", "Z"));
        continue;
      }
    }
    if (Number.isFinite(Date.parse(part))) values.push(new Date(part).toISOString().replace(".000Z", "Z"));
  }
  return [...new Set(values)].sort((a, b) => Date.parse(a) - Date.parse(b));
}

function dim(block, name) {
  const re = new RegExp(`<Dimension[^>]*name=["']${name}["'][^>]*>([\\s\\S]*?)<\\/Dimension>`, "i");
  return block.match(re)?.[1]?.trim() || "";
}

function parseCapabilities(xml) {
  const names = [...xml.matchAll(/<Name>([^<]*PRECIPITATION[^<]*)<\/Name>/gi)].map(m => ({ name: m[1].trim(), index: m.index || 0 }));
  if (!names.length) throw new Error("No precipitation layer found in AROME-PI WMS");
  names.sort((a, b) => {
    const score = x => x.name === "TOTAL_WATER_PRECIPITATION__GROUND_OR_WATER_SURFACE" ? 3 : /TOTAL_WATER_PRECIPITATION/i.test(x.name) ? 2 : 1;
    return score(b) - score(a);
  });
  const selected = names[0];
  const start = xml.lastIndexOf("<Layer", selected.index);
  const endPos = xml.indexOf("</Layer>", selected.index);
  const block = start >= 0 && endPos > start ? xml.slice(start, endPos + 8) : xml;

  const styles = [...block.matchAll(/<Style>[\s\S]*?<Name>([^<]+)<\/Name>[\s\S]*?<\/Style>/gi)].map(m => m[1].trim());
  const style = styles.find(s => /SHADING/i.test(s) && /(RR|PRECIP|RAIN)/i.test(s)) || styles.find(s => /SHADING/i.test(s)) || styles[0] || "";
  const refs = expandDimension(dim(block, "reference_time"));
  const times = expandDimension(dim(block, "time"));

  const bboxBlock = block.match(/<EX_GeographicBoundingBox>([\s\S]*?)<\/EX_GeographicBoundingBox>/i)?.[1] || "";
  const tag = name => Number(bboxBlock.match(new RegExp(`<${name}>([^<]+)<\\/${name}>`, "i"))?.[1]);
  const west = tag("westBoundLongitude"), east = tag("eastBoundLongitude"), south = tag("southBoundLatitude"), north = tag("northBoundLatitude");

  return {
    layer: selected.name,
    style,
    refs,
    times,
    bounds: [
      [Number.isFinite(south) ? south : 37.5, Number.isFinite(west) ? west : -12],
      [Number.isFinite(north) ? north : 55.4, Number.isFinite(east) ? east : 16],
    ],
  };
}

async function capabilities(env) {
  const cached = await env.PUSH_KV?.get(META_KEY, "json");
  if (cached?.cachedAt && Date.now() - cached.cachedAt < 180000) return cached;
  const url = `${MF_BASE}/wms/${MF_SERVICE}/GetCapabilities?service=WMS&version=1.3.0&language=fre`;
  const response = await mfFetch(url, env, "application/xml,text/xml,*/*");
  if (!response.ok) {
    const attempts = response.headers.get("x-mf-auth-attempts");
    throw new Error(`Météo-France GetCapabilities HTTP ${response.status}${attempts ? ` (${attempts})` : ""}`);
  }
  const parsed = parseCapabilities(await response.text());
  const result = { ...parsed, cachedAt: Date.now() };
  await env.PUSH_KV?.put(META_KEY, JSON.stringify(result), { expirationTtl: 300 });
  return result;
}

function chooseReference(refs) {
  const now = Date.now();
  const valid = refs.filter(x => Date.parse(x) <= now + 5 * 60000);
  return valid.at(-1) || refs.at(-1) || new Date(Math.floor(now / 3600000) * 3600000).toISOString().replace(".000Z", "Z");
}

function buildFrames(meta) {
  const now = Date.now();
  const ref = chooseReference(meta.refs || []);
  const refMs = Date.parse(ref);
  let candidates = (meta.times || []).filter(t => {
    const ms = Date.parse(t);
    return Number.isFinite(ms) && ms >= refMs && ms <= refMs + 6 * 3600000;
  });
  if (!candidates.length) {
    candidates = Array.from({ length: 25 }, (_, i) => new Date(refMs + i * 15 * 60000).toISOString().replace(".000Z", "Z"));
  }
  let future = candidates.filter(t => Date.parse(t) >= now - 5 * 60000 && Date.parse(t) <= now + 3 * 3600000);
  if (!future.length) future = candidates.slice(0, 13);
  future = future.slice(0, 13);
  return {
    referenceTime: ref,
    frames: future.map(t => ({
      time: t,
      minutes: Math.max(0, Math.round((Date.parse(t) - now) / 60000)),
    })),
  };
}

async function metaResponse(env) {
  const meta = await capabilities(env);
  const timeline = buildFrames(meta);
  return json({
    ok: true,
    source: "Météo-France AROME-PI",
    model: "AROME Prévision Immédiate",
    resolution: "~1,3 km",
    stepMinutes: 15,
    layer: meta.layer,
    style: meta.style,
    bounds: meta.bounds,
    ...timeline,
  }, 200, env);
}

function validIso(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && Number.isFinite(Date.parse(value));
}

async function imageResponse(request, env) {
  const requestUrl = new URL(request.url);
  const time = requestUrl.searchParams.get("time");
  const referenceTime = requestUrl.searchParams.get("reference_time");
  if (!validIso(time) || !validIso(referenceTime)) return json({ ok: false, error: "Invalid forecast time" }, 400, env);

  const meta = await capabilities(env);
  const [[south, west], [north, east]] = meta.bounds;
  const wms = new URL(`${MF_BASE}/wms/${MF_SERVICE}/GetMap`);
  wms.searchParams.set("service", "WMS");
  wms.searchParams.set("version", "1.3.0");
  wms.searchParams.set("crs", "EPSG:4326");
  wms.searchParams.set("layers", meta.layer);
  wms.searchParams.set("reference_time", referenceTime);
  wms.searchParams.set("time", time);
  wms.searchParams.set("bbox", `${south},${west},${north},${east}`);
  wms.searchParams.set("format", "image/png");
  wms.searchParams.set("height", "1024");
  wms.searchParams.set("width", "1024");
  wms.searchParams.set("transparent", "true");
  wms.searchParams.set("styles", meta.style || "");

  const response = await mfFetch(wms.toString(), env, "image/png,*/*");
  if (!response.ok) return json({ ok: false, error: `Météo-France GetMap HTTP ${response.status}` }, 502, env);
  const contentType = response.headers.get("Content-Type") || "image/png";
  if (!contentType.includes("image")) {
    const detail = (await response.text()).slice(0, 300);
    return json({ ok: false, error: "Météo-France did not return an image", detail }, 502, env);
  }
  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=180",
      ...cors(env),
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname.startsWith("/mf-nowcast/")) {
      return new Response(null, { status: 204, headers: cors(env) });
    }
    try {
      if (url.pathname === "/mf-nowcast/meta" && request.method === "GET") return await metaResponse(env);
      if (url.pathname === "/mf-nowcast/image" && request.method === "GET") return await imageResponse(request, env);
    } catch (error) {
      console.error("Météo-France proxy error", error);
      return json({ ok: false, error: error?.message || "Météo-France proxy error" }, 502, env);
    }
    return base.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === "function") return base.scheduled(controller, env, ctx);
  },
};
