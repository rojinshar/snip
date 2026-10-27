# Manual QA checklist

Run this on a build installed from the `.dmg`, before merging any milestone that touches
capture or permissions. Mark each item ✅/❌ in the PR description.

## M1: shell and capture

- [ ] Launch: the ∫ icon appears in the menu bar; there is no Dock icon.
- [ ] The menu shows **Snip Equation ⌘⇧2**, **Settings… ⌘,**, the version (greyed out),
      **Restart Snip** and **Quit Snip ⌘Q**.
- [ ] First snip without permission (reset with
      `tccutil reset ScreenCapture io.github.rojinshar.snip`): the system prompt appears;
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

Start the API first: `npm run dev:api`.

- [ ] Snip a single-line equation: `…` shows next to the icon, then "Copied to clipboard" with
      a preview; ⌘V pastes `$…$` LaTeX that compiles in Overleaf.
- [ ] Snip a multi-line aligned equation: it pastes as one `\begin{aligned}…` block.
- [ ] Snip something with no math (wallpaper, plain text): "No equation found", and the
      clipboard keeps its previous content.
- [ ] Stop the API and snip: "Snip couldn't reach the server", clipboard unchanged.
- [ ] Press ⌘⇧2 while a snip is still processing: it is ignored; no second capture.
- [ ] After 20 real snips: check `~/Library/Logs/io.github.rojinshar.snip/snips.jsonl` and
      record p50/p95 `total_ms` in the PR (target: p50 < 2000, p95 < 3000).
- [ ] The captures folder stays empty after snips (files are deleted).

## M4: install from the `.dmg`

- [ ] Quit any running Snip, then open the `.dmg` and drag Snip to Applications, replacing
      the old copy.
- [ ] Launch from Applications: the menu shows the new version.
- [ ] Log out and back in (or reboot): Snip is not running until launched. Launch at login is
      out of scope for v0.

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
