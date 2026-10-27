# Manual QA checklist

Run this on a build installed from the `.dmg`, before merging any milestone that touches
capture or permissions. Mark each item ✅/❌ in the PR description.

## M1: shell and capture

- [ ] Launch: the ∫ icon appears in the menu bar; there is no Dock icon.
- [ ] The menu shows **Snip Equation ⌘⇧2**, **Settings… ⌘,**, the version (greyed out),
      **Restart Snip** and **Quit Snip ⌘Q**.
- [ ] First snip without permission (reset with
      `tccutil reset ScreenCapture com.rojinsharma.snip`): the system prompt appears;
      System Settings opens at Screen Recording; the notification explains what to do.
- [ ] Press ⌘⇧2 again before granting: only the notification shows; System Settings does not
      reopen.
- [ ] Grant access, choose **Restart Snip**, and snip: the crosshair appears.
- [ ] Drag a box over an equation: the capture contains the equation, not just the
      wallpaper (check with `SNIP_KEEP_CAPTURES=1`).
- [ ] Press `Esc` during selection: no notification, no file.
- [ ] `⌘⇧2` works while each of these is focused: Preview (PDF), Chrome, VS Code, Obsidian,
      Finder.
- [ ] Press `⌘⇧2` twice quickly: only one capture starts.
- [ ] External display: capture a region on the second screen.
- [ ] **Quit Snip** exits the app, and the icon disappears.

## M3: recognition and clipboard

Release builds use the hosted API and need an access key (see Beta below).

- [ ] Snip a single-line equation: `…` shows next to the icon, then "Copied to clipboard" with
      a preview; ⌘V pastes `$…$` LaTeX that compiles in Overleaf.
- [ ] Snip a multi-line aligned equation: it pastes as one `\begin{aligned}…` block.
- [ ] Snip something with no math (wallpaper, plain text): "No equation found", and the
      clipboard keeps its previous content.
- [ ] Stop the API and snip: "Snip couldn't reach the server", clipboard unchanged.
- [ ] Press ⌘⇧2 while a snip is still processing: it is ignored; no second capture.
- [ ] After 20 real snips: check `~/Library/Logs/com.rojinsharma.snip/snips.jsonl` and
      record p50/p95 `total_ms` in the PR (target: p50 < 2000, p95 < 3000).
- [ ] The captures folder stays empty after snips (files are deleted).

## M4 and B4: install the signed release

- [ ] `npm run release:desktop` ends with "Ready to distribute" and both `spctl` checks say
      `accepted, source=Notarized Developer ID`.
- [ ] Quit any running Snip, open the `.dmg` and drag Snip to Applications, replacing the old
      copy. Launching it shows no "unverified developer" warning.
- [ ] The menu shows the new version.
- [ ] Grant Screen Recording once. After installing the next signed release over it, snips
      still work without granting again.
- [ ] On a second Mac (or a fresh user account), download the `.dmg` from where testers will
      get it and install: no warnings, and the key from an invite works.

## M5: settings

- [ ] **Settings…** opens the window in front of other apps; choosing it again focuses the
      same window instead of opening a second one.
- [ ] It shows the current hotkey (⇧⌘2) and **Inline `$…$`** selected.
- [ ] Click the hotkey, press ⌃⌥L: the field shows ⌃⌥L, the menu shows ⌃⌥L next to Snip
      Equation, ⌃⌥L starts a snip and ⇧⌘2 no longer does.
- [ ] Click the hotkey and press ⇧⌘2 (the current one) while recording: it records instead of
      starting a snip.
- [ ] Click the hotkey and press Esc: nothing changes; the old hotkey still works.
- [ ] Press ⇧A: the window says to include ⌘, ⌃ or ⌥, and the old hotkey still works.
- [ ] Close the window while recording: the hotkey still works.
- [ ] Choose **Display `\[…\]`**, snip: the clipboard has `\[…\]`. Repeat for `$$…$$` and
      Plain LaTeX.
- [ ] Quit and relaunch Snip: the hotkey and delimiters are kept.
- [ ] Corrupt `settings.json` (type junk into it) and relaunch: Snip starts with defaults.
- [ ] Light and dark mode both look right.

## Beta: hosted API and access key

- [ ] Remove the access key in Settings, then snip: "Snip needs your access key", and the
      settings window opens.
- [ ] Paste a malformed key: the window explains the expected format; nothing is saved.
- [ ] Settings shows usage under the key: "N of 100,000 snips this month · resets Nov 1",
      and N goes up after a snip (reopen Settings).
- [ ] Paste a well-formed but wrong key and Save: "Checking…", then "This key isn't
      accepted…"; the previous key stays saved.
- [ ] Turn off Wi-Fi and Save a key: "Couldn't reach Snip…"; nothing is saved.
- [ ] Revoke your key (`npm run keys -- revoke --id <id>`), then snip: "Access key not
      accepted", and the settings window opens. Create a new key afterwards.
- [ ] Paste the owner key and Save: the window shows `Saved: snip_…` with the last four
      characters only. Snip works with `npm run dev:api` stopped.
- [ ] Quit and relaunch: the key is still saved, and no Keychain prompt appears at any point.
- [ ] `ls -l ~/Library/Application\ Support/com.rojinsharma.snip/access-key` shows
      `-rw-------`, and `settings.json` does not contain the key.
- [ ] Turn off Wi-Fi and snip: "Snip couldn't reach the server", clipboard unchanged.
- [ ] A successful snip shows ✓ next to the ∫ icon for about 2 seconds; a failure shows !;
      Esc shows nothing. This works while sharing the screen, when notifications are muted.
- [ ] Set your quota to your current usage (`npm run keys -- quota --id <id> --quota <used>`)
      and snip: "Monthly snips used up … reset on Nov 1". Restore the quota afterwards.

## 0.6.0: text with math, no-math speed, open at login, update cadence

- [ ] Snip a sentence with inline math (a textbook line): it pastes as plain text with each
      formula in `$…$`, whatever the delimiter setting, with no extra `$` around it all.
- [ ] Snip a pure formula: it still uses the chosen delimiter setting.
- [ ] Snip something with no math (a photo, a plain heading): "No equation found" in about
      1–2 seconds, not 4–5.
- [ ] After the first launch of a release build, Snip is listed in System Settings → General
      → Login Items, and **Open Snip at login** is checked in Settings.
- [ ] Uncheck it: Snip leaves Login Items. Restart the Mac: Snip does not start. Check it
      again: it returns, and Snip starts after a restart.
- [ ] Turn Snip off in System Settings → Login Items, then relaunch Snip: it stays off (Snip
      only adds itself on the very first run).
