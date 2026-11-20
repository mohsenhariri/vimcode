# Keyboard regression scenarios

Run from the repository root using Node.js 24. Each desktop run uses temporary user data and extensions directories. The keyboard driver sends events to that window through its own ephemeral loopback debugger port. The webview fixture reports the draft it actually received.

```sh
npm ci
npm test
npm run test:ui
npm run vsix
VIMCODE_VSIX="$PWD/vimcode-0.3.2.vsix" npm run test:ui
```

Use `VSCODE_TEST_VERSION=stable` or set `VSCODE_EXECUTABLE_PATH` to the VS Code application executable. To include the actual Codex sidebar, set `VIMCODE_CODEX_PATH` to the installed `openai.chatgpt-<version>` extension directory. On a Linux machine with an active Wayland desktop, use a private display for the run.

```sh
env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 xvfb-run -a npm run test:ui
```

## Release checks

| Scenario | Action | Expected result |
| --- | --- | --- |
| Webview editor and side view | Type `fgjhk` in each draft. Open the Command Palette and run **Vimium: Show IDE Navigation Hints**. Dismiss with Escape. | Each draft contains every letter exactly once. The IDE picker opens and dismisses. |
| Codex | With Codex installed, select its label in the IDE picker. Open the Command Palette from Codex and select the IDE hints command again. | The installed extension opens its sidebar and VimCode reopens its picker. |
| Editor | Type `f`, press Alt+J, then type a displayed label. | The editor inserts the first letter and moves to the selected line. |
| Command mode | Enter with Escape, type an unassigned key, move with `j`, then type `ix`. | The movement preserves document text. The editor inserts `x` once after exiting. |
| Explorer and picker | Press Shift+F in the Explorer tree. Use the picker’s arrow keys and Enter to select Search. | IDE hints open and the highlighted view receives keyboard focus. |
| Terminal and IDE hints | Disable the workbench overlay, focus the terminal, type `fgjhk`, press Alt+J, dismiss the picker with Escape, and type `p`. Repeat Alt+J and Escape with the overlay enabled, then type `q`. | Each shortcut opens the expected IDE hints. Escape returns keyboard focus to the terminal. The terminal receives exactly `fgjhkpq`. |
| Editor with the terminal visible | Leave the terminal panel open, focus a document, press Alt+J and select a line label. | The cursor jumps to the selected line and both the document text and terminal input are preserved. |
| Overlay | Set manual acceptance, open hints from a focused webview, type and erase a prefix, then cancel. Reopen, label a background tab and press Enter. | Filtering and cancellation preserve the draft. Enter activates the selected tab exactly once. |
| Unavailable overlay | Set the debug port to a local test endpoint that returns invalid JSON. | The IDE picker opens and accepts keyboard input. |
| Split editors and preview tabs | Focus a webview tab in another group using its label. Jump within a preview document. | Both operations reuse the existing tab and preserve its preview or pinned state. |

For a signed-in Codex smoke test, type an unsent draft containing `f F g j k`, move the view between the primary and secondary sidebars, invoke IDE hints and return to the draft. Check its exact text in both locations. On macOS, also try Option+J with the keyboard layout intended for release. On Windows, repeat with the menu bar visible.
