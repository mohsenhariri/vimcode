# Changelog

## 0.2.0

- Replaced the static IDE hint picker with a Vimium-style hint session for Activity Bar targets, open editor tabs, Explorer controls, tree/list actions, panels, terminals, status bar focus, and settings.
- Added an experimental direct workbench DOM overlay via Chrome DevTools Protocol for VS Code windows launched with `--remote-debugging-port`.
- Added direct wrapper commands for common VS Code chrome actions and default non-editor keybindings for IDE navigation.
- Changed `f` outside the editor to open IDE hints instead of hinting the last active editor.

## 0.1.0

- Added editor hint mode with visible line labels, typed label matching, cancellation, backspace, and exact-match jump behavior.
- Added workbench navigation hints through Quick Pick for common VS Code targets.
- Added Vimium-style command contributions, default keybindings, settings, and extension-host tests.
