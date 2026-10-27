import webpush from "web-push";

const SUB_KEY = "subscription:primary";
const STATE_KEY = "alert:last";

function cors(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = origin === env.APP_ORIGIN ? origin : env.APP_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(request, env) },
  });
}

function configureWebPush(env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    throw new Error("VAPID keys are missing");
  }
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || env.APP_URL,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
}

async function readBody(request) {
  const body = await request.json();
  if (!body || typeof body !== "object") throw new Error("Invalid JSON body");
  return body;
}

function validSubscription(sub) {
  return !!(
    sub &&
    typeof sub.endpoint === "string" &&
    sub.endpoint.startsWith("https://") &&
    sub.keys &&
    typeof sub.keys.p256dh === "string" &&
    typeof sub.keys.auth === "string"
  );
}

async function storeSubscription(request, env) {
  const body = await readBody(request);
  if (!validSubscription(body.subscription)) {
    return json({ ok: false, error: "Invalid push subscription" }, 400, request, env);
  }

  const lat = Number(body.latitude);
  const lon = Number(body.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return json({ ok: false, error: "Invalid coordinates" }, 400, request, env);
  }

  const record = {
    subscription: body.subscription,
    latitude: Math.max(-90, Math.min(90, lat)),
    longitude: Math.max(-180, Math.min(180, lon)),
    city: String(body.city || "Ma position").slice(0, 120),
    settings: {
      rain: body.settings?.rain !== false,
      rainThreshold: Number(body.settings?.rainThreshold || 70),
      wind: body.settings?.wind !== false,
      windThreshold: Number(body.settings?.windThreshold || 60),
      snow: body.settings?.snow !== false,
      storm: body.settings?.storm !== false,
    },
    updatedAt: Date.now(),
  };

  await env.PUSH_KV.put(SUB_KEY, JSON.stringify(record));
  return json({ ok: true }, 200, request, env);
}

async function unsubscribe(request, env) {
  await env.PUSH_KV.delete(SUB_KEY);
  await env.PUSH_KV.delete(STATE_KEY);
  return json({ ok: true }, 200, request, env);
}

async function sendPush(env, record, payload) {
  configureWebPush(env);
  try {
    await webpush.sendNotification(record.subscription, JSON.stringify(payload), {
      TTL: 3600,
      urgency: payload.urgency || "normal",
    });
    return true;
  } catch (error) {
    const status = Number(error?.statusCode || error?.status || 0);
    if (status === 404 || status === 410) {
      await env.PUSH_KV.delete(SUB_KEY);
      await env.PUSH_KV.delete(STATE_KEY);
      return false;
    }
    throw error;
  }
}

async function fetchForecast(record) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", record.latitude);
  url.searchParams.set("longitude", record.longitude);
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set(
    "hourly",
    "precipitation_probability,weather_code,wind_gusts_10m,temperature_2m",
  );

  const response = await fetch(url, { cf: { cacheTtl: 300 } });
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
  return response.json();
}

function firstFutureIndex(times) {
  const now = Date.now();
  const i = times.findIndex((t) => Date.parse(`${t}Z`) >= now - 15 * 60 * 1000);
  return i < 0 ? 0 : i;
}

function formatUtcHour(value) {
  const d = new Date(`${value}Z`);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function evaluateAlerts(data, record) {
  const h = data?.hourly;
  if (!h?.time?.length) return [];
  const s = record.settings || {};
  const start = firstFutureIndex(h.time);
  const end = Math.min(start + 7, h.time.length);
  const alerts = [];

  let bestRain = { value: -1, index: -1 };
  let bestWind = { value: -1, index: -1 };
  let snowIndex = -1;
  let stormIndex = -1;

  for (let i = start; i < end; i++) {
    const rain = Number(h.precipitation_probability?.[i]);
    const gust = Number(h.wind_gusts_10m?.[i]);
    const code = Number(h.weather_code?.[i]);
    if (Number.isFinite(rain) && rain > bestRain.value) bestRain = { value: rain, index: i };
    if (Number.isFinite(gust) && gust > bestWind.value) bestWind = { value: gust, index: i };
    if (snowIndex < 0 && [71, 73, 75, 77, 85, 86].includes(code)) snowIndex = i;
    if (stormIndex < 0 && [95, 96, 99].includes(code)) stormIndex = i;
  }

  if (s.storm !== false && stormIndex >= 0) {
    alerts.push({ type: "storm", priority: 4, title: "⛈️ Orage possible", body: `Orage possible vers ${formatUtcHour(h.time[stormIndex])} à ${record.city}.`, urgency: "high" });
  }
  if (s.snow !== false && snowIndex >= 0) {
    alerts.push({ type: "snow", priority: 3, title: "❄️ Neige prévue", body: `Neige possible vers ${formatUtcHour(h.time[snowIndex])} à ${record.city}.`, urgency: "normal" });
  }
  if (s.wind !== false && bestWind.index >= 0 && bestWind.value >= Number(s.windThreshold || 60)) {
    alerts.push({ type: "wind", priority: 2, title: "💨 Rafales fortes", body: `Rafales jusqu’à ${Math.round(bestWind.value)} km/h vers ${formatUtcHour(h.time[bestWind.index])} à ${record.city}.`, urgency: "normal" });
  }
  if (s.rain !== false && bestRain.index >= 0 && bestRain.value >= Number(s.rainThreshold || 70)) {
    alerts.push({ type: "rain", priority: 1, title: "🌧️ Pluie probable", body: `${Math.round(bestRain.value)} % de risque vers ${formatUtcHour(h.time[bestRain.index])} à ${record.city}.`, urgency: "normal" });
  }

  return alerts.sort((a, b) => b.priority - a.priority);
}

async function checkWeather(env) {
  const record = await env.PUSH_KV.get(SUB_KEY, "json");
  if (!record?.subscription) return;

  const forecast = await fetchForecast(record);
  const alerts = evaluateAlerts(forecast, record);
  if (!alerts.length) return;

  const alert = alerts[0];
  const previous = await env.PUSH_KV.get(STATE_KEY, "json");
  const now = Date.now();
  const blocked = previous?.type === alert.type && Number(previous?.blockedUntil || 0) > now;
  if (blocked) return;

  const sent = await sendPush(env, record, {
    title: alert.title,
    body: alert.body,
    urgency: alert.urgency,
    tag: `meteo-${alert.type}`,
    data: { url: `${env.APP_URL}?tab=alerts`, type: alert.type },
    icon: `${env.APP_URL}icon.svg`,
  });

  if (sent) {
    await env.PUSH_KV.put(
      STATE_KEY,
      JSON.stringify({ type: alert.type, sentAt: now, blockedUntil: now + 3 * 60 * 60 * 1000 }),
    );
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(request, env) });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, service: "meteo-push" }, 200, request, env);
    }
    if (url.pathname === "/config" && request.method === "GET") {
      if (!env.VAPID_PUBLIC_KEY) return json({ ok: false, error: "VAPID not configured" }, 503, request, env);
      return json({ vapidPublicKey: env.VAPID_PUBLIC_KEY }, 200, request, env);
    }
    if (url.pathname === "/subscribe" && request.method === "POST") {
      return storeSubscription(request, env);
    }
    if (url.pathname === "/unsubscribe" && request.method === "POST") {
      return unsubscribe(request, env);
    }

    return json({ ok: false, error: "Not found" }, 404, request, env);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(checkWeather(env));
  },
};
