import test from "node:test";
import assert from "node:assert/strict";
import { normalizePushSubscription } from "../supabase/functions/cadence-push/push-endpoint.mjs";

const keys = { p256dh: "A".repeat(87), auth: "B".repeat(22) };
const validSubscription = (endpoint = "https://fcm.googleapis.com/fcm/send/subscription-token") => ({ endpoint, keys });

test("accepts a valid FCM subscription and normalizes the URL", () => {
  const result = normalizePushSubscription(validSubscription());
  assert.ok(result);
  assert.equal(result.endpoint, "https://fcm.googleapis.com/fcm/send/subscription-token");
  assert.deepEqual(result.keys, keys);
});

test("accepts supported Mozilla, Apple, and Windows push services", () => {
  for (const endpoint of [
    "https://updates.push.services.mozilla.com/wpush/v2/token",
    "https://web.push.apple.com/device/token",
    "https://web.notify.windows.com/w/?token=abc",
  ]) assert.ok(normalizePushSubscription(validSubscription(endpoint)), endpoint);
});

test("rejects non-HTTPS, user-info tricks, arbitrary hosts, and internal IP targets", () => {
  for (const endpoint of [
    "http://fcm.googleapis.com/fcm/send/token",
    "https://fcm.googleapis.com@127.0.0.1/admin",
    "https://127.0.0.1/latest/meta-data",
    "https://localhost/admin",
    "https://fcm.googleapis.com.attacker.example/fcm/send/token",
    "https://attacker.example/fcm/send/token",
    "https://fcm.googleapis.com:8443/fcm/send/token",
  ]) assert.equal(normalizePushSubscription(validSubscription(endpoint)), null, endpoint);
});

test("rejects malformed or oversized subscription payloads", () => {
  assert.equal(normalizePushSubscription(null), null);
  assert.equal(normalizePushSubscription([]), null);
  assert.equal(normalizePushSubscription({ endpoint: "https://fcm.googleapis.com/x" }), null);
  assert.equal(normalizePushSubscription(validSubscription("https://fcm.googleapis.com/" + "x".repeat(5000))), null);
  assert.equal(normalizePushSubscription({ ...validSubscription(), keys: { p256dh: "invalid", auth: "invalid" } }), null);
});

import { isAllowedCadenceOrigin } from "../supabase/functions/cadence-push/push-endpoint.mjs";

test("allows canonical, local, and Cadence-owned Vercel preview origins", () => {
  for (const origin of [
    "https://cadence-elite.vercel.app",
    "https://cadence-elite-git-main-ishan-e93e.vercel.app",
    "https://cadence-git-security-phase-2-hardening-ishan-e93e.vercel.app",
    "https://cadence-rneynqvan-ishan-e93e.vercel.app",
    "http://localhost:5173",
  ]) assert.equal(isAllowedCadenceOrigin(origin), true, origin);
});

test("rejects untrusted, malformed, insecure, or non-origin CORS values", () => {
  for (const origin of [
    "https://cadence-elite.vercel.app.attacker.example",
    "https://attacker-cadence-git-main-ishan-e93e.vercel.app",
    "http://cadence-git-preview-ishan-e93e.vercel.app",
    "https://cadence-git-preview-ishan-e93e.vercel.app:8443",
    "https://cadence-git-preview-ishan-e93e.vercel.app/path",
    "https://user@cadence-git-preview-ishan-e93e.vercel.app",
    "not-an-origin",
  ]) assert.equal(isAllowedCadenceOrigin(origin), false, origin);
});
