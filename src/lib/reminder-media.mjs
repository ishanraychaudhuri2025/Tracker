/**
 * Pure validation and URL normalization for custom reminder soundtracks.
 * Kept independent of React so security-sensitive input rules can be tested
 * directly with Node's built-in test runner.
 */
export const MAX_RINGTONE_UPLOAD_BYTES = 20 * 1024 * 1024;

/** @param {unknown} mime */
export function isSupportedAudioMime(mime) {
  return typeof mime === "string" && mime.startsWith("audio/");
}

/** @param {unknown} size */
export function isRingtoneUploadSizeAllowed(size) {
  return typeof size === "number"
    && Number.isFinite(size)
    && size >= 0
    && size <= MAX_RINGTONE_UPLOAD_BYTES;
}

/**
 * @typedef {{ provider: "YouTube" | "Spotify", originalUrl: string, embedUrl: string }} ReminderMedia
 */

/**
 * Parse only supported YouTube/Spotify media URLs.
 * @param {string | undefined} input
 * @param {string} [origin]
 * @returns {ReminderMedia | null}
 */
export function parseReminderMedia(input, origin = "https://cadence-elite.vercel.app") {
  if (typeof input !== "string" || !input.trim()) return null;
  try {
    const parsed = new URL(input.trim());
    // Accept only secure, credential-free provider URLs with no custom port.
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443")) return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be" || host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      const videoId = host === "youtu.be"
        ? segments[0]
        : parsed.searchParams.get("v") || (["embed", "shorts", "live"].includes(segments[0] || "") ? segments[1] : undefined);
      if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) return null;
      const query = new URLSearchParams({
        autoplay: "1",
        mute: "0",
        controls: "1",
        rel: "0",
        playsinline: "1",
        loop: "1",
        playlist: videoId,
        enablejsapi: "1",
        origin,
      });
      return {
        provider: "YouTube",
        originalUrl: parsed.toString(),
        embedUrl: "https://www.youtube-nocookie.com/embed/" + videoId + "?" + query.toString(),
      };
    }
    if (host === "open.spotify.com") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      const types = ["track", "album", "playlist", "episode", "show"];
      const typeIndex = segments.findIndex((segment) => types.includes(segment));
      const type = segments[typeIndex];
      const mediaId = segments[typeIndex + 1];
      if (!type || !mediaId || !/^[a-zA-Z0-9]+$/.test(mediaId)) return null;
      return {
        provider: "Spotify",
        originalUrl: parsed.toString(),
        embedUrl: "https://open.spotify.com/embed/" + type + "/" + mediaId + "?utm_source=generator&autoplay=1",
      };
    }
  } catch {
    return null;
  }
  return null;
}
