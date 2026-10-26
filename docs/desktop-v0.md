# Snip desktop app v0: design

- **Status:** accepted
- **Author:** Rojin Sharma
- **Last updated:** 2026-10-26

## 1. Goal

Ship a macOS menu-bar app that turns any on-screen equation into LaTeX on the clipboard,
fast enough to feel instant. v0 is for the author's daily use: it is installed from a locally
built `.dmg` and is not distributed.

**Done means:**

1. Installs from a `.dmg` built with `npm run build:desktop`, and runs from `/Applications`.
2. A global hotkey works from any app (Preview, Chrome, Overleaf, Obsidian).
3. LaTeX lands on the clipboard with a median under 2 s from releasing the mouse to the
   clipboard (p95 under 3 s).
4. Every failure shows a clear notification and never writes bad output to the clipboard.
5. Used for real coursework for at least 3 days without blocking bugs.

## 2. Non-goals (v0)

Sign-in, accounts, free-tier quotas, payments, auto-update, code signing and notarization,
Windows, a hosted API, Typst/MathML output, and PDF-page conversion. Each is a later phase
(section 11).

## 3. User flow

1. The user presses the hotkey (default `⌘⇧2`, configurable).
2. The native macOS crosshair appears (the same UI as `⌘⇧4`). The user drags a box over the
   equation. Pressing `Esc` cancels silently.
3. A "Reading…" indicator shows in the menu bar.
4. LaTeX is copied to the clipboard, wrapped in the user's chosen delimiters, and a short
   notification confirms it ("Copied: `\int_0^1 x^2\,dx`").

## 4. Architecture

```
┌─────────────── apps/desktop (Tauri 2) ───────────────┐      ┌──── apps/api (Express) ────┐
│ Rust core                       Web UI (React/Vite)   │      │ POST /v1/recognize          │
│  • tray icon + menu (no Dock)    • settings window    │ HTTP │  • validate image           │
│  • global shortcut                                    │ ───► │  • @snip/engine (Gemini)    │──► Gemini 3.5
│  • capture via screencapture -i                       │      │  • KaTeX render check       │    Flash-Lite
│  • clipboard + notifications                          │ ◄─── │  { latex, engine, ms }      │
│  • settings store                                     │      │ Gemini key lives here only  │
└───────────────────────────────────────────────────────┘      └─────────────────────────────┘
```

**Why the app never calls Gemini directly:** anything shipped in the app, including an API
key, can be extracted. Routing through our API also gives us the place where auth, quotas and
billing will live, without changing the app.

**Reuse:** recognition and validation come from `packages/engine`, which is already
benchmarked and tested. The API is a thin HTTP layer over it.

## 5. Components

### 5.1 `apps/desktop`

| Concern        | Choice                                    | Notes                                                             |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| Shell          | Tauri 2                                   | Small binary; Rust for OS integration                             |
| Menu-bar only  | Tray icon + `ActivationPolicy::Accessory` | No Dock icon or app switcher entry                                |
| Hotkey         | `tauri-plugin-global-shortcut`            | Registered at launch; re-registered when changed                  |
| Region capture | `/usr/sbin/screencapture -i -x <tmp>.png` | Native crosshair; `-x` mutes the shutter; no file means cancelled |
| Clipboard      | `tauri-plugin-clipboard-manager`          | Text only                                                         |
| Notifications  | `tauri-plugin-notification`               | Success and errors                                                |
| Settings       | `tauri-plugin-store` (JSON in app data)   | Hotkey, delimiters, API URL                                       |
| UI             | React + Vite + TypeScript                 | Settings window only; the tray menu is native                     |

**Screen Recording permission.** Without it, macOS captures only the wallpaper and our own
windows. On first use the app checks with `CGPreflightScreenCaptureAccess`. If access is
missing it calls `CGRequestScreenCaptureAccess`, which prompts the user, and shows how to
enable it in System Settings. Note: unsigned dev builds may have to be re-granted after a
rebuild, because macOS ties the grant to the code signature. That is acceptable for v0;
signing fixes it.

**Image handling.** Retina captures can be large. Before upload, the app downscales the long
edge to at most 2000 px, which is ample for equations and keeps uploads small.

### 5.2 `apps/api`

| Concern    | Choice                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | Express + TypeScript (`tsx` in dev)                                                                                                                   |
| Body       | Raw image bytes (`image/png` or `image/jpeg`), up to 10 MB                                                                                            |
| Engine     | `@snip/engine` router: Gemini 3.5 Flash-Lite, falling back to 3.8 Flash only when the output fails the KaTeX check; 8 s timeout and 1 retry per model |
| Validation | KaTeX render check: invalid LaTeX is never returned                                                                                                   |
| Config     | `GEMINI_API_KEY`, `PORT` (default 8790), from the root `.env`                                                                                         |
| Logging    | One structured JSON line per request: id, status, ms, engine; no image data                                                                           |

**API contract (v0):**

```
POST /v1/recognize
Content-Type: image/png

200 { "latex": "\\int_0^1 x^2\\,dx", "engine": "gemini-3.5-flash-lite", "ms": 1180 }
400 { "error": "invalid_image",    "message": "Could not read that image." }
413 { "error": "image_too_large",  "message": "Image is over 10 MB." }
422 { "error": "no_math_found",    "message": "No equation found in the selection." }
502 { "error": "upstream_failed",  "message": "Recognition is unavailable. Try again." }
GET /healthz → 200 { "status": "ok" }
```

Error bodies use stable `error` codes so the app can map them to messages and later
localize them.

## 6. Output formatting

Formatting happens in the app, so the API always returns bare LaTeX.

| Setting                | Example output    |
| ---------------------- | ----------------- |
| Inline `$…$` (default) | `$\frac{a}{b}$`   |
| Display `\[…\]`        | `\[\frac{a}{b}\]` |
| Display `$$…$$`        | `$$\frac{a}{b}$$` |
| None                   | `\frac{a}{b}`     |

## 7. Latency budget (mouse release → clipboard)

| Step                                                                    | Budget                   |
| ----------------------------------------------------------------------- | ------------------------ |
| Read capture, downscale, encode                                         | ≤ 100 ms                 |
| Upload to the local API                                                 | ≤ 50 ms                  |
| Gemini 3.5 Flash-Lite (measured on the paid tier: p50 1.2 s, p95 1.9 s) | ~1.2 s                   |
| KaTeX check, response, clipboard                                        | ≤ 50 ms                  |
| **Total target**                                                        | **p50 < 2 s, p95 < 3 s** |

The app records each step's duration in a debug log, so a slow snip can be attributed to
the step that caused it.

## 8. Error handling

| Situation                    | Behavior                                              |
| ---------------------------- | ----------------------------------------------------- |
| User presses `Esc`           | Nothing happens; no notification                      |
| Screen Recording not granted | Notification plus a link to the System Settings pane  |
| API unreachable or timed out | "Snip couldn't reach the server." Clipboard unchanged |
| `422 no_math_found`          | "No equation found in the selection."                 |
| Any other error              | Generic message; details in the debug log             |

Rule: the clipboard is only written on success.

## 9. Testing

- **Rust unit tests:** delimiter formatting, settings validation, mapping error codes to
  messages.
- **API tests (Vitest):** the HTTP layer with a fake engine. Covers every status code in
  the contract, body limits and content types. Tests never call Gemini.
- **Manual QA checklist** (`apps/desktop/QA.md`): first-run permission flow, hotkey from five
  apps, cancel, offline, wrong image, multi-monitor, Retina vs external display.
- **Latency check:** 20 real snips with step timings logged; p50 and p95 recorded in the PR.

## 10. Milestones

Each milestone is one branch and one PR-sized change, merged when checks pass and it runs.

| #   | Milestone                                                              | Proves                          |
| --- | ---------------------------------------------------------------------- | ------------------------------- |
| M1  | `apps/desktop` shell: tray app, hotkey, `screencapture -i` saves a PNG | Permissions, hotkey, capture UX |
| M2  | `apps/api` `POST /v1/recognize` over `@snip/engine`, with tests        | Server side works in isolation  |
| M3  | Wire the app to the API: clipboard, notifications, step timings        | End-to-end flow and latency     |
| M4  | `.dmg` build and install from it; QA checklist pass                    | Ships like a real app           |
| M5  | Settings window (hotkey, delimiters)                                   | Daily-use polish                |

## 11. Later phases (out of scope here)

1. **Recent-snip history:** the last snips in the menu-bar menu, one click to copy again.
2. **Accounts and quotas:** sign-in (magic link), API tokens per device, 200 free snips a
   month in Postgres.
3. **Hosting the API:** deploy `apps/api` (the hosting choice is made then); the app points
   at the hosted URL.
4. **Payments:** Stripe checkout and webhooks; plans enforced in the API.
5. **Distribution:** Apple Developer Program, signing, notarization, auto-update.
6. **Windows:** custom region-select overlay, since there is no `screencapture` equivalent.

## 12. Risks

| Risk                                                  | Likelihood | Mitigation                                                          |
| ----------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| Screen Recording re-prompts on every dev rebuild      | High       | Accept for v0; signing in a later phase fixes it                    |
| `screencapture -i` behavior changes in a macOS update | Low        | Capture is behind one Rust function; can switch to ScreenCaptureKit |
| Gemini latency spikes or outages                      | Medium     | 8 s timeout, 1 retry, clear error; the engine is swappable          |
| Hotkey conflicts with other apps                      | Medium     | Configurable; registration failure surfaced in the UI               |

## 13. Decisions

| Question                                                | Decision                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Default hotkey                                          | `⌘⇧2`: close to the macOS screenshot keys and changeable in settings                                                                       |
| Fallback when Flash-Lite's output fails the KaTeX check | Retry once with Gemini 3.8 Flash. Rare in practice (0 of 200 paid-tier outputs failed), so the extra cost and latency only hit those snips |
| Recent-snip history                                     | Out of v0; moved to later phases                                                                                                           |
