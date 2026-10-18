import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import webpush from "npm:web-push@3.6.7";

type Json = Record<string, any>;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_ORIGIN = "https://streako-elite.vercel.app";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const allowedOrigins = new Set([APP_ORIGIN, "https://streako-elite-ishan-e93e.vercel.app", "http://localhost:5173"]);

function reply(value: Json, status = 200, origin = APP_ORIGIN) {
  return new Response(JSON.stringify(value), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : APP_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cadence-cron",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
  }});
}
function decodeB64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}
function encodeB64Url(value: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < value.length; i++) binary += String.fromCharCode(value[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function ensurePushConfig() {
  const read = async () => {
    const result = await admin.from("cadence_push_config").select("id,vapid_public_key,vapid_private_key,cron_secret").eq("id", true).single();
    if (result.error || !result.data) throw new Error("Push settings are not available. Apply the Cadence push migration first.");
    return result.data;
  };
  let config = await read();
  if (config.vapid_public_key && config.vapid_private_key) return config;
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!pub.x || !pub.y || !priv.d) throw new Error("Could not initialize Web Push keys.");
  const candidatePublic = encodeB64Url(new Uint8Array([4, ...decodeB64Url(pub.x), ...decodeB64Url(pub.y)]));
  const { error } = await admin.from("cadence_push_config").update({
    vapid_public_key: candidatePublic, vapid_private_key: priv.d, updated_at: new Date().toISOString(),
  }).eq("id", true).is("vapid_public_key", null);
  if (error) throw error;
  config = await read();
  if (!config.vapid_public_key || !config.vapid_private_key) throw new Error("Could not persist Web Push keys.");
  return config;
}
async function authenticateUser(request: Request) {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data.user ? null : data.user;
}
function validTimezone(value: unknown): string {
  if (typeof value !== "string" || value.length > 100) return "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return value; } catch { return "UTC"; }
}
function localParts(date: Date, timezone: string) {
  const values: Record<string, string> = {};
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).forEach((p) => { values[p.type] = p.value; });
  return { dayKey: values.year + "-" + values.month + "-" + values.day, time: values.hour + ":" + values.minute };
}
function dayIndex(dayKey: string) { return new Date(dayKey + "T12:00:00Z").getUTCDay(); }
function habitEndKey(h: Json): string | null {
  const months = Number(h.durationMonths || 0), start = String(h.durationStartedAt || h.createdAt || "");
  if (!months || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const [year0, month0, day0] = start.split("-").map(Number);
  const mi = year0 * 12 + month0 - 1 + months, year = Math.floor(mi / 12), month = mi % 12;
  const day = Math.min(day0, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}
function habitDueOn(h: Json, key: string) {
  if (h.createdAt && key < String(h.createdAt)) return false;
  const start = String(h.durationStartedAt || h.createdAt || "");
  if (h.durationMonths && start && key < start) return false;
  const end = habitEndKey(h); if (end && key >= end) return false;
  const day = dayIndex(key);
  if (h.frequency === "Weekdays") return day >= 1 && day <= 5;
  if (h.frequency === "Weekends") return day === 0 || day === 6;
  if (h.frequency === "3× / week") return [2, 4, 6].includes(day);
  if (h.frequency === "Custom") return Array.isArray(h.scheduleDays) && h.scheduleDays.includes(day);
  return true;
}
function taskOccursOn(t: Json, key: string) {
  const start = String(t.date || ""); if (key < start) return false;
  const repeat = t.recurrence || "None"; if (repeat === "None") return key === start;
  if (repeat === "Daily") return true;
  const day = dayIndex(key);
  if (repeat === "Weekdays") return day >= 1 && day <= 5;
  if (repeat === "Weekends") return day === 0 || day === 6;
  if (repeat === "Weekly") return day === dayIndex(start);
  if (repeat === "Monthly") {
    const target = Number(start.slice(8, 10)), [year, month] = key.split("-").map(Number);
    return Number(key.slice(8, 10)) === Math.min(target, new Date(Date.UTC(year, month, 0)).getUTCDate());
  }
  return false;
}
function taskIsDone(t: Json, key: string) {
  if ((t.recurrence || "None") !== "None") return Array.isArray(t.completedDates) && t.completedDates.includes(key);
  return String(t.date || "") === key && Boolean(t.completed);
}
function dueReminders(workspace: Json, timezone: string, now: Date) {
  const { dayKey, time } = localParts(now, timezone);
  const output: Array<{ key: string; payload: Json }> = [];
  for (const h of (Array.isArray(workspace.habits) ? workspace.habits : [])) {
    if (!h?.id || !h.reminderEnabled || !h.reminderTime || String(h.reminderTime) !== time || !habitDueOn(h, dayKey)) continue;
    if (h.logs && h.logs[dayKey]) continue;
    output.push({ key: "habit:" + h.id + ":" + dayKey + ":" + time, payload: {
      title: "Time for " + String(h.name || "your habit"), body: "A small step counts. Open Cadence to check in.",
      kind: "habit", id: String(h.id), soundUrl: typeof h.reminderSoundUrl === "string" ? h.reminderSoundUrl : "",
      url: APP_ORIGIN + "/?cadenceReminder=" + encodeURIComponent("habit:" + String(h.id)),
      tag: "cadence-habit-" + String(h.id) + "-" + dayKey,
    }});
  }
  for (const t of (Array.isArray(workspace.tasks) ? workspace.tasks : [])) {
    if (!t?.id || !t.time || !t.date || String(t.time) !== time || !taskOccursOn(t, dayKey) || taskIsDone(t, dayKey)) continue;
    output.push({ key: "task:" + t.id + ":" + dayKey + ":" + time, payload: {
      title: "Time for " + String(t.title || "your task"), body: "Your planned time has arrived. Open Cadence and take the next step.",
      kind: "task", id: String(t.id), url: APP_ORIGIN + "/?cadenceReminder=" + encodeURIComponent("task:" + String(t.id)),
      tag: "cadence-task-" + String(t.id) + "-" + dayKey,
    }});
  }
  return output;
}
async function sendPush(subscription: Json, config: Json, payload: Json) {
  webpush.setVapidDetails(APP_ORIGIN, config.vapid_public_key, config.vapid_private_key);
  await webpush.sendNotification(subscription, JSON.stringify({
    title: payload.title, body: payload.body, kind: payload.kind, id: payload.id, soundUrl: payload.soundUrl || "",
    url: payload.url || APP_ORIGIN + "/", tag: payload.tag || "cadence-notification",
  }), { TTL: 3600 });
}
async function handleTick() {
  const config = await ensurePushConfig();
  const { data: subscriptions, error: subError } = await admin.from("cadence_push_subscriptions")
    .select("id,user_id,endpoint,subscription,timezone,created_at");
  if (subError) throw subError;
  if (!subscriptions?.length) return { delivered: 0, subscriptions: 0 };
  const ids = Array.from(new Set(subscriptions.map((s: Json) => s.user_id)));
  const { data: workspaces, error: workspaceError } = await admin.from("tracker_workspaces")
    .select("user_id,habits,tasks").in("user_id", ids);
  if (workspaceError) throw workspaceError;
  const workspaceByUser = new Map((workspaces ?? []).map((w: Json) => [w.user_id, w]));
  const now = new Date(), cutoff = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const { data: timers, error: timerError } = await admin.from("cadence_push_focus_timers")
    .select("user_id,ends_at,label,delivered_at").lte("ends_at", now.toISOString()).gte("ends_at", cutoff);
  if (timerError) throw timerError;

  const outgoing: Array<{ row: Json; key: string; payload: Json; focusUser?: string }> = [];
  for (const row of subscriptions as Json[]) {
    const workspace = workspaceByUser.get(row.user_id);
    if (workspace) for (const item of dueReminders(workspace, validTimezone(row.timezone), now)) {
      outgoing.push({ row, key: String(row.id) + ":" + item.key, payload: item.payload });
    }
    for (const timer of (timers ?? []) as Json[]) {
      if (timer.user_id !== row.user_id || row.created_at > timer.ends_at) continue;
      outgoing.push({ row, key: String(row.id) + ":focus:" + timer.user_id + ":" + timer.ends_at, focusUser: String(timer.user_id), payload: {
        title: "Focus block complete", body: String(timer.label || "Your focus session") + " is finished. Take a short reset before your next block.",
        kind: "focus", id: String(timer.user_id), url: APP_ORIGIN + "/?cadenceReminder=focus",
        tag: "cadence-focus-" + String(timer.user_id) + "-" + String(timer.ends_at),
      }});
    }
  }
  if (!outgoing.length) return { delivered: 0, subscriptions: subscriptions.length };
  const keys = outgoing.map((x) => x.key), existing = new Set<string>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data, error } = await admin.from("cadence_push_deliveries").select("delivery_key").in("delivery_key", keys.slice(i, i + 100));
    if (error) throw error;
    for (const item of data ?? []) existing.add(String(item.delivery_key));
  }
  let delivered = 0;
  const focusSucceeded = new Set<string>(), focusFailed = new Set<string>();
  for (const item of outgoing) {
    if (existing.has(item.key)) continue;
    try {
      await sendPush(item.row.subscription, config, item.payload);
      const { error } = await admin.from("cadence_push_deliveries").insert({ delivery_key: item.key });
      if (error && error.code !== "23505") throw error;
      existing.add(item.key); delivered += 1;
      if (item.focusUser) focusSucceeded.add(item.focusUser);
    } catch (error) {
      if (item.focusUser) focusFailed.add(item.focusUser);
      const message = error instanceof Error ? error.message : String(error);
      if (/410|404|expired|invalid subscription/i.test(message)) await admin.from("cadence_push_subscriptions").delete().eq("id", item.row.id);
      console.error("Push delivery failed for subscription", item.row.id, message);
    }
  }
  for (const userId of focusSucceeded) if (!focusFailed.has(userId)) {
    await admin.from("cadence_push_focus_timers").update({ delivered_at: now.toISOString(), updated_at: now.toISOString() }).eq("user_id", userId).is("delivered_at", null);
  }
  return { delivered, subscriptions: subscriptions.length };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin") ?? APP_ORIGIN;
  if (request.method === "OPTIONS") return new Response("ok", { headers: {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : APP_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cadence-cron",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
  }});
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405, origin);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return reply({ error: "Push service is not configured." }, 500, origin);
  try {
    const body = await request.json().catch(() => ({})) as Json, action = String(body.action || "");
    if (action === "tick") {
      const config = await ensurePushConfig();
      if (!request.headers.get("x-cadence-cron") || request.headers.get("x-cadence-cron") !== config.cron_secret) return reply({ error: "Unauthorized scheduler request." }, 401, origin);
      return reply({ ok: true, ...(await handleTick()) }, 200, origin);
    }
    if (action === "public-key") {
      const config = await ensurePushConfig();
      return reply({ publicKey: config.vapid_public_key }, 200, origin);
    }
    const user = await authenticateUser(request);
    if (!user) return reply({ error: "Sign in to configure background notifications." }, 401, origin);
    if (action === "subscribe") {
      const subscription = body.subscription;
      if (!subscription || typeof subscription.endpoint !== "string" || !subscription.endpoint.startsWith("https://") || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return reply({ error: "The browser returned an invalid push subscription." }, 400, origin);
      }
      const { error } = await admin.from("cadence_push_subscriptions").upsert({
        user_id: user.id, endpoint: subscription.endpoint, subscription, timezone: validTimezone(body.timezone), updated_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });
      if (error) throw error;
      return reply({ ok: true, enabled: true }, 200, origin);
    }
    if (action === "unsubscribe") {
      const endpoint = String(body.endpoint || "");
      if (!endpoint.startsWith("https://")) return reply({ error: "Invalid push endpoint." }, 400, origin);
      const { error } = await admin.from("cadence_push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
      if (error) throw error;
      return reply({ ok: true, enabled: false }, 200, origin);
    }
    if (action === "focus-start") {
      const seconds = Math.max(1, Math.min(10800, Math.floor(Number(body.seconds) || 0)));
      if (!Number.isFinite(seconds) || seconds < 1) return reply({ error: "Choose a valid focus duration." }, 400, origin);
      const label = String(body.label || "Focus session").trim().slice(0, 100) || "Focus session";
      const { error } = await admin.from("cadence_push_focus_timers").upsert({
        user_id: user.id, ends_at: new Date(Date.now() + seconds * 1000).toISOString(), label,
        delivered_at: null, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
      return reply({ ok: true }, 200, origin);
    }
    if (action === "focus-stop") {
      const { error } = await admin.from("cadence_push_focus_timers").delete().eq("user_id", user.id);
      if (error) throw error;
      return reply({ ok: true }, 200, origin);
    }
    return reply({ error: "Unknown action." }, 400, origin);
  } catch (error) {
    console.error("cadence-push error:", error);
    return reply({ error: error instanceof Error ? error.message : "Unexpected push service error." }, 500, origin);
  }
});
