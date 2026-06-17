# Vimium for VS Code

Keyboard-first navigation for VS Code, inspired by Vimium. This extension adds visible hint labels in the active editor and a Vimium-style IDE hint mode for open editor tabs, Activity Bar entries, Explorer buttons, panels, terminals, and focused lists or trees.

This project is not affiliated with Vimium.

## Features

- `Vimium: Show Editor Navigation Hints` overlays hint labels on visible editor lines.
- Type the shown label to jump the cursor directly to that line.
- `Esc` cancels hint mode, `Backspace` edits the typed label, and `Enter` accepts the remaining exact target.
- `Vimium: Show IDE Navigation Hints` assigns labels to current editor tabs, Activity Bar targets, Explorer controls, tree/list actions, global navigation, panels, terminals, status bar focus, and settings.
- When VS Code is launched through the Vimium wrapper, IDE hints use an experimental DOM overlay that draws labels directly over visible workbench buttons, tabs, rows, and controls.
- If the DOM overlay endpoint is unavailable, IDE hints fall back to the supported command-backed hint HUD/list.
- IDE hints auto-run when you type the exact displayed label.
- Direct wrapper commands are contributed for Activity Bar views, Side Bar focus, Explorer toolbar actions, tree/list movement, panels, terminal, status bar, and editor switching.

## Default Keys

| Key | Action | When |
| --- | --- | --- |
| `f` | Show IDE hints | Workbench, Side Bar, Activity Bar, or other non-editor focus |
| `f` | Show editor hints | Editor focus when the VSCodeVim extension reports Normal mode |
| `Alt+F` | Show editor hints | Editor focus |
| `Shift+F` | Show IDE hints | Any focus |
| `j` / `k` | Move down/up in focused VS Code list or tree | List/tree focus outside the editor |
| `h` / `l` | Collapse/expand focused tree item | List/tree focus outside the editor |
| `g e`, `g s`, `g c`, `g r`, `g x`, `g t` | Focus Explorer, Search, Source Control, Run and Debug, Extensions, or terminal | Non-editor focus |
| `Esc` | Cancel hint mode | Hint mode |
| `Backspace` | Delete typed hint character | Hint mode |
| `Enter` | Accept hint | Hint mode |
| `a`-`z`, `0`-`9` | Type hint character | Hint mode |

## Experimental Direct Workbench Overlays

VS Code does not expose private workbench DOM through the normal extension API. For a closer Vimium-style mode, this extension can optionally connect to VS Code's local Chrome DevTools Protocol endpoint and inject a temporary overlay into the workbench renderer.

Use the included launcher wrappers to make this look like a normal VS Code or VS Code Insiders flag:

```sh
./scripts/code --vim .
./scripts/code-insiders --vim .
```

The wrappers remove `--vim` before launching VS Code and add `--remote-debugging-port=9333` internally. These forms are also accepted:

```sh
./scripts/code-insiders --vim=true .
./scripts/code-insiders --vim=1 .
./scripts/code-insiders --vim-port=9444 .
```

To make the command exactly `code-insiders --vim`, put this repository's `scripts/` directory before `/usr/bin` in your `PATH`, or symlink the wrapper into a directory that already comes first:

```sh
ln -sf /path/to/vs_code_vim/scripts/code-insiders ~/.local/bin/code-insiders
ln -sf /path/to/vs_code_vim/scripts/code ~/.local/bin/code
```

The wrapper skips itself and delegates to the real `code` or `code-insiders` binary. Then run `Vimium: Show IDE Navigation Hints` or press the configured IDE hint key. If the endpoint is available, labels are drawn directly over visible workbench controls and typing a label dispatches a DOM click. If the endpoint is not available, the extension falls back to the supported command-backed IDE hint HUD/list.

The local DevTools port is powerful; only enable it on a trusted machine and do not expose it beyond localhost.

## Settings

- `vimiumCode.hintCharacters`: characters used to generate labels. Default: `asdfghjklqwertyuiopzxcvbnm`.
- `vimiumCode.maxEditorHints`: maximum visible editor line targets per session. Default: `250`.
- `vimiumCode.includeBlankLines`: include blank visible lines as targets. Default: `false`.
- `vimiumCode.autoAcceptExactHint`: jump as soon as the typed label exactly matches a target. Default: `true`.
- `vimiumCode.preferWorkbenchDomOverlay`: try experimental direct workbench DOM labels before falling back to the supported IDE hint HUD/list. Default: `true`.
- `vimiumCode.workbenchDomOverlayDebugPort`: local DevTools port for experimental direct workbench DOM labels. Default: `9333`.

Only letters and digits have default hint-mode keybindings. If you add punctuation to `vimiumCode.hintCharacters`, bind `vimiumCode.typeHintCharacter` manually with the desired `{ "character": "..." }` argument.

## Development

```sh
npm install
npm run compile
npm test
```

Use the `Run Extension` launch configuration in VS Code to start an Extension Development Host.

## Package

```sh
npm run vsix
```

The extension is bundled into `dist/extension.js` with `vscode` kept external, as required for VS Code extensions.

