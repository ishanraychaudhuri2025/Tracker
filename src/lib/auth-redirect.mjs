// Always send account confirmation and password recovery to the canonical production origin.
// This avoids dynamically trusting arbitrary Vercel preview/alias origins as auth redirects.
export const AUTH_REDIRECT_URL = 'https://cadence-elite.vercel.app';
