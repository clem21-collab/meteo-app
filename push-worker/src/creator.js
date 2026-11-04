const encoder = new TextEncoder();
const hex64 = /^[a-f0-9]{64}$/;
const toHex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");

async function sign(env, payload) {
  const secret = env.CREATOR_PAIRING_CODE;
  if (typeof secret !== "string" || !hex64.test(secret)) return "";
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

function matches(input, expected) {
  if (typeof input !== "string" || !hex64.test(input) || !expected) return false;
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

export async function creatorEntitlement(request, env) {
  const auth = request.headers.get("Authorization");
  const match = auth?.match(/^Bearer ([a-f0-9]{64})\.([a-f0-9]{64})$/);
  if (!match) return false;
  const [, nonce, signature] = match;
  return matches(signature, await sign(env, "meteo-creator-device-v1:" + nonce));
}

export async function creatorRoute(request, env, path) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
  if (!env.APP_ORIGIN || request.headers.get("Origin") !== env.APP_ORIGIN) {
    return new Response(null, { status: 403, headers });
  }
  headers["Access-Control-Allow-Origin"] = env.APP_ORIGIN;
  headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
  if (request.method !== "POST") return json({ premium: false }, 405);

  if (path === "/creator/status") {
    const premium = await creatorEntitlement(request, env);
    return json({ premium }, premium ? 200 : 401);
  }
  if (path !== "/creator/pair") return json({ premium: false }, 404);
  if (!hex64.test(env.CREATOR_PAIRING_CODE ?? "")) return json({ premium: false }, 503);
  let code;
  try { code = await request.text(); } catch { return json({ premium: false }, 400); }
  if (!matches(code, env.CREATOR_PAIRING_CODE)) return json({ premium: false }, 401);
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const signature = await sign(env, "meteo-creator-device-v1:" + nonce);
  return json({ premium: true, token: nonce + "." + signature });
}

export const creatorRevision = env => sign(env, "meteo-creator-alerts-v1");
