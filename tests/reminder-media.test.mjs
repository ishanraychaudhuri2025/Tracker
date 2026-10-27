import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RINGTONE_UPLOAD_BYTES,
  isSupportedAudioMime,
  isRingtoneUploadSizeAllowed,
  parseReminderMedia,
} from "../src/lib/reminder-media.mjs";

const videoId = "dQw4w9WgXcQ";
const spotifyId = "4uLU6hMCjMI75M1A2tKUQC";

test("accepts YouTube watch, short, embed, and short-domain URLs", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=" + videoId,
    "https://m.youtube.com/shorts/" + videoId,
    "https://youtube-nocookie.com/embed/" + videoId,
    "https://youtu.be/" + videoId + "?t=12",
  ]) {
    const parsed = parseReminderMedia(url, "https://cadence-elite.vercel.app");
    assert.ok(parsed, url);
    assert.equal(parsed.provider, "YouTube");
    assert.match(parsed.embedUrl, /youtube-nocookie\.com\/embed\//);
    assert.match(parsed.embedUrl, /autoplay=1/);
    assert.match(parsed.embedUrl, /loop=1/);
  }
});

test("accepts supported Spotify track, album, playlist, episode, and show URLs", () => {
  for (const kind of ["track", "album", "playlist", "episode", "show"]) {
    const parsed = parseReminderMedia("https://open.spotify.com/" + kind + "/" + spotifyId);
    assert.ok(parsed, kind);
    assert.equal(parsed.provider, "Spotify");
    assert.equal(parsed.embedUrl, "https://open.spotify.com/embed/" + kind + "/" + spotifyId + "?utm_source=generator&autoplay=1");
  }
});

test("rejects unsafe or unsupported media URLs", () => {
  for (const url of [
    "http://youtu.be/" + videoId,
    "https://user:pass@open.spotify.com/track/" + spotifyId,
    "https://open.spotify.com:8443/track/" + spotifyId,
    "https://www.youtube.com.attacker.example/watch?v=" + videoId,
    "https://attacker.example/watch?v=" + videoId,
    "https://youtube.com/watch?v=bad",
    "https://open.spotify.com/artist/" + spotifyId,
    "not a url",
    "",
    undefined,
  ]) assert.equal(parseReminderMedia(url), null, String(url));
});

test("rejects attacker-controlled credentials and non-HTTPS links", () => {
  assert.equal(parseReminderMedia("https://open.spotify.com@attacker.example/track/" + spotifyId), null);
});

test("audio upload validation allows up to exactly 50 MiB and rejects larger or non-audio inputs", () => {
  assert.equal(MAX_RINGTONE_UPLOAD_BYTES, 50 * 1024 * 1024);
  assert.equal(isSupportedAudioMime("audio/mpeg"), true);
  assert.equal(isSupportedAudioMime("image/png"), false);
  assert.equal(isSupportedAudioMime(""), false);
  assert.equal(isRingtoneUploadSizeAllowed(0), false);
  assert.equal(isRingtoneUploadSizeAllowed(MAX_RINGTONE_UPLOAD_BYTES), true);
  assert.equal(isRingtoneUploadSizeAllowed(MAX_RINGTONE_UPLOAD_BYTES + 1), false);
  assert.equal(isRingtoneUploadSizeAllowed(-1), false);
  assert.equal(isRingtoneUploadSizeAllowed(Number.POSITIVE_INFINITY), false);
});
