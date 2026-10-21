# Cadence Windows Companion (early version)

This is an optional Windows desktop wrapper for the existing Cadence website. It runs Cadence in its own Chromium window, so Chrome itself can be closed while the companion stays running in the Windows system tray.

## What this version does

- Opens the production Cadence site in a desktop window.
- Keeps the page alive when you close the window; closing hides it to the system tray.
- Disables Chromium background throttling for the reminder page and configures desktop Chromium to permit autoplay.
- Offers an optional **Launch at Windows sign-in** tray setting.
- Lets you reopen Cadence or fully quit the companion from the tray menu.

## Important limitations

- This first version keeps the existing website reminder logic running in the companion. It does **not** yet add independent Windows Task Scheduler jobs or a separate native alarm engine.
- Sign in inside the companion window. Browser login state is not automatically shared with Chrome.
- The PC must be powered on, awake, connected if Cadence needs the network, and the companion must remain running. Windows sleep/shutdown and audio-device settings can still prevent an alarm from sounding.
- If the website changes its production URL, update `CADENCE_URL` in `main.cjs`.
- This is an early build and needs a local test on the target Windows machine before relying on it for important alarms.

## Build on Windows

1. Install Node.js 20.19+ (Node 22 LTS recommended).
2. Open PowerShell in this folder (`desktop`).
3. Run:

   ```powershell
   npm install
   npm start
   ```

4. Sign in to Cadence in the companion and allow notifications if prompted.
5. Test with a habit reminder scheduled a few minutes ahead. Close the companion window (it should hide to the tray), then close Chrome and wait for the reminder.
6. To create an installer, run:

   ```powershell
   npm run dist:win
   ```

The installer is written to `desktop/dist`.

## Exit behavior

Closing the window hides the app to the tray so reminders can continue. Use the tray menu's **Quit Cadence Companion** item to stop it completely.
