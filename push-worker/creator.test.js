import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { creatorEntitlement, creatorRevision, creatorRoute } from "./src/creator.js";

test("association, validation et révocation de l’accès Créateur", async () => {
  const origin = "https://weather.example";
  const code = randomBytes(32).toString("hex");
  const env = { APP_ORIGIN: origin, CREATOR_PAIRING_CODE: code };
  const rotated = { ...env, CREATOR_PAIRING_CODE: randomBytes(32).toString("hex") };
  const request = (path, options = {}) => new Request(origin + path, {
    method: "POST", ...options, headers: { Origin: origin, ...options.headers }
  });
  const pair = (body, config = env) => creatorRoute(request("/creator/pair", { body }), config, "/creator/pair");
  assert.equal((await pair("0".repeat(64))).status, 401);
  assert.equal((await pair(code, { APP_ORIGIN: origin })).status, 503);

  const paired = await pair(code);
  assert.equal(paired.status, 200);
  assert.equal(paired.headers.get("Cache-Control"), "no-store");
  const { token } = await paired.json();
  assert.notEqual(token, code);
  assert.notEqual((await (await pair(code)).json()).token, token);
  const status = credential => request("/creator/status", { headers: { Authorization: "Bearer " + credential } });
  assert.equal(await creatorEntitlement(status(code), env), false);
  const altered = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
  assert.equal(await creatorEntitlement(status(altered), env), false);
  assert.equal(await creatorEntitlement(status(token), rotated), false);
  assert.notEqual(await creatorRevision(env), await creatorRevision(rotated));
  assert.equal((await creatorRoute(status(token), env, "/creator/status")).status, 200);
  assert.equal((await creatorRoute(request("/creator/status"), env, "/creator/status")).status, 401);
  assert.equal((await creatorRoute(request("/creator/pair", {
    headers: { Origin: "https://other.example" }, body: code
  }), env, "/creator/pair")).status, 403);
});
