# Changelog

## 0.3.2 - 2026-11-19

- Fixed `Alt+J` in the focused integrated terminal. It opens IDE navigation hints, and `Esc` returns to the terminal prompt.

## 0.3.1 - 2026-11-19

- Scoped keyboard navigation to the focused editor or workbench list and removed the global typing override, fixing lost keystrokes in extension views.
- Added Codex and Open View targets to the IDE picker. Webview, terminal and preview editor tabs can be selected in place, including across editor groups.
- Fixed overlapping hint sessions, native picker selection and overlay cancellation. The experimental overlay honors manual acceptance, checks the focused workbench and falls back on unusable endpoints.
- Added isolated desktop keyboard scenarios, VSIX installation tests and portable launcher checks.

## 0.3.0 - 2026-06-16

- Stopped activating editor hints from a bare `f` while editing. The editor is a text input, so plain `f` now types `f`.
- Added a lightweight editor command mode: `Esc` enters it (when it has nothing else to dismiss), then `f`/`Shift+F` show IDE hints, `g f` shows editor line-jump hints, `h`/`j`/`k`/`l` move, `g g`/`Shift+G` jump to top/bottom, `Ctrl+D`/`Ctrl+U` scroll, and `i`/`a`/`o`/`Esc` resume editing. Text insertion is suppressed and a `-- COMMAND --` status bar indicator is shown while active.
- Added a one-time status-bar hint when IDE hints fall back to the Quick Pick list because the workbench DOM overlay endpoint is unavailable, pointing to the `--remote-debugging-port` launch.
- Removed the dependency on VSCodeVim's `vim.mode` context for editor hints and scrolling.
- Fixed `Shift+F` opening IDE hints (and swallowing the keystroke) while typing in the editor; it now only triggers outside the editor or in command mode.
- Fixed bare `f` opening IDE hints while the integrated terminal is focused.
- Fixed bare `f`/`Shift+F`/`g …` opening IDE hints (and swallowing keystrokes) while a webview-based UI from another extension (e.g. a chat panel, docked as an editor tab or a side/bottom view) is focused, by requiring focus to be outside the editor area and outside any webview (`!editorAreaFocus && !webviewId`). The DOM overlay also refuses to draw when a webview/iframe holds focus.
- Added `Alt+J` inside a focused webview tab to show IDE hints on purpose — VimCode takes focus from the webview so the hint label can be typed. (`Alt+J` is used instead of `Alt+F` because `Alt+F` is the File-menu mnemonic, which fires before extension keybindings.) Editor line-jump hints also moved from `Alt+F` to `Alt+J`.
- `Show IDE Navigation Hints` now takes focus from a focused webview by default, so it works from the Command Palette for webviews that swallow `Alt` shortcuts and never forward them to VS Code (e.g. some chat panels).

## 0.2.0

- Replaced the static IDE hint picker with a Vimium-style hint session for Activity Bar targets, open editor tabs, Explorer controls, tree/list actions, panels, terminals, status bar focus, and settings.
- Added an experimental direct workbench DOM overlay via Chrome DevTools Protocol for VS Code windows launched with `--remote-debugging-port`.
- Added direct wrapper commands for common VS Code chrome actions and default non-editor keybindings for IDE navigation.
- Changed `f` outside the editor to open IDE hints instead of hinting the last active editor.

## 0.1.0

- Added editor hint mode with visible line labels, typed label matching, cancellation, backspace, and exact-match jump behavior.
- Added workbench navigation hints through Quick Pick for common VS Code targets.
- Added Vimium-style command contributions, default keybindings, settings, and extension-host tests.
