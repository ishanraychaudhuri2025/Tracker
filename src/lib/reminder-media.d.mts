export type ReminderMedia = {
  provider: "YouTube" | "Spotify";
  originalUrl: string;
  embedUrl: string;
};

export const MAX_RINGTONE_UPLOAD_BYTES: number;
export function isSupportedAudioMime(mime: unknown): boolean;
export function isRingtoneUploadSizeAllowed(size: unknown): boolean;
export function parseReminderMedia(
  input: string | undefined,
  origin?: string,
): ReminderMedia | null;
