const MAX_ENDPOINT_LENGTH = 4096;
const ALLOWED_EXACT_HOSTS = new Set([
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "updates.push.services.mozilla.com",
  "push.apple.com",
  "web.push.apple.com",
]);
const ALLOWED_SUBDOMAIN_ROOTS = [
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

function isAllowedHost(hostname) {
  if (ALLOWED_EXACT_HOSTS.has(hostname)) return true;
  return ALLOWED_SUBDOMAIN_ROOTS.some((root) => hostname.endsWith("." + root));
}

/**
 * Return only validated fields required by Web Push, preventing arbitrary
 * user-supplied HTTPS URLs from becoming server-side fetch targets.
 *
 * @param {unknown} value
 * @returns {{ endpoint: string, keys: { p256dh: string, auth: string } } | null}
 */
export function normalizePushSubscription(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = /** @type {{endpoint?: unknown, keys?: {p256dh?: unknown, auth?: unknown}}} */ (value);
  if (typeof candidate.endpoint !== "string" || candidate.endpoint.length > MAX_ENDPOINT_LENGTH) return null;

  let endpoint;
  try {
    endpoint = new URL(candidate.endpoint);
  } catch {
    return null;
  }

  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) return null;
  if (endpoint.port && endpoint.port !== "443") return null;
  if (endpoint.hostname.endsWith(".")) return null;

  const hostname = endpoint.hostname.toLowerCase();
  if (!isAllowedHost(hostname) || endpoint.pathname === "/" || endpoint.pathname.length < 2) return null;

  const p256dh = candidate.keys?.p256dh;
  const auth = candidate.keys?.auth;
  if (typeof p256dh !== "string" || !/^[A-Za-z0-9_-]{80,120}$/.test(p256dh)) return null;
  if (typeof auth !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(auth)) return null;

  return { endpoint: endpoint.href, keys: { p256dh, auth } };
}

const EXACT_CADENCE_ORIGINS = new Set([
  "https://cadence-elite.vercel.app",
  "https://cadence-elite-git-main-ishan-e93e.vercel.app",
  "http://localhost:5173",
]);

/**
 * Allow the production site, local development, and Vercel-generated preview
 * URLs belonging to this Cadence project/team namespace. Require origin-only
 * strings so paths, credentials, and spoofed suffixes cannot widen the policy.
 *
 * @param {string} value
 */
export function isAllowedCadenceOrigin(value) {
  if (EXACT_CADENCE_ORIGINS.has(value)) return true;
  let origin;
  try {
    origin = new URL(value);
  } catch {
    return false;
  }
  if (origin.protocol !== "https:" || origin.origin !== value || origin.username || origin.password) return false;
  const hostname = origin.hostname.toLowerCase();
  return /^cadence(?:-elite)?-git-[a-z0-9-]+-ishan-e93e\.vercel\.app$/.test(hostname)
    || /^cadence-[a-z0-9]+-ishan-e93e\.vercel\.app$/.test(hostname);
}
