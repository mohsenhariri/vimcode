# AGENTS.md

## What this is

VimCode is a VS Code extension that brings Vimium-style keyboard navigation to both the text editor (line-jump hints) and the IDE chrome (Activity Bar, tabs, panels, lists, terminals). It runs on the UI side (`extensionKind: ["ui"]`) and has no third-party runtime dependencies. VS Code provides the `vscode` module at runtime.

The user-facing name is **VimCode** (publisher `harimo`). Use the internal namespace `vimiumCode` for extension command IDs, context keys, and settings. See `EXTENSION_NAMESPACE` in [src/constants.ts](src/constants.ts).

## Commands

```sh
npm run compile      # type-check, lint, then build the extension and transpile tests with sourcemaps
npm run watch        # esbuild watch mode (rebuilds extension + tests on change)
npm run check-types  # tsc --noEmit only
npm run lint         # eslint src
npm run package      # type-check, lint, then build only the minified extension bundle
npm test             # compile, then run launcher and extension-host tests
npm run test:ui      # drive a desktop window with a contributed webview fixture
npm run vsix         # production package + `vsce package` -> .vsix
npm run clean        # remove dist/ and .vscode-test/
```

The [Makefile](Makefile) provides `build`, `package`, `test`, `compile`, `vsix`, and `clean` targets. Both `make build` and `make package` run the production build.

### Running / debugging in VS Code

Use the launch configs in [.vscode/launch.json](.vscode/launch.json).

- **Run Extension** — Extension Development Host.
- **Run Extension with DOM Overlay** — same, but launched with `--remote-debugging-port=9333` so the experimental workbench overlay path is exercised.
- **Run Extension Tests** — runs the test suite in the dev host.

### Tests

Tests are a plain array of `{ name, run() }` objects in [src/test/suite/extension.test.ts](src/test/suite/extension.test.ts). The suite runner in [src/test/suite/index.ts](src/test/suite/index.ts) executes them sequentially and reports failures together at the end. [scripts/run-tests.js](scripts/run-tests.js) uses `@vscode/test-electron` to run the suite in VS Code **1.120.0** and downloads that version when needed.

- There is **no built-in single-test filter**. To run one test, temporarily narrow the exported `tests` array.
- Tests import extension code through `../../extension`, which resolves to `dist/extension.js` at runtime. Re-export any new extension symbols used by the tests from [src/extension.ts](src/extension.ts).

## Build system

[esbuild.js](esbuild.js) bundles `dist/extension.js` with `vscode` kept external. Development builds also transpile `src/test/**` file by file into `dist/test/**`. Production builds (`--production`) emit only the minified extension bundle. `tsc --noEmit` handles type-checking.

## Architecture

`activate()` in [src/extension.ts](src/extension.ts) instantiates three long-lived controllers and registers the `vimiumCode.*` commands. The shared `typeHintCharacter`, `acceptHint`, and `backspaceHint` commands dispatch to `WorkbenchHintController` when its Quick Pick is active and to `EditorHintController` otherwise. Opening either hint mode cancels the other controller's session. The DOM overlay handles its own keyboard input in the renderer.

### The three controllers

- **[EditorHintController](src/editorHintController.ts)** — in-editor line-jump hints. Renders labels with a `TextEditorDecorationType` (`before` render option) on visible lines. [editorTargets.ts](src/editorTargets.ts) caps targets at `maxEditorHints` and skips blank lines unless `includeBlankLines` is enabled. The session auto-cancels on editor switch, visible range changes, or document edits.

- **[WorkbenchHintController](src/workbenchHints.ts)** — the supported fallback for IDE hints. It renders a `QuickPick` with available commands from `WORKBENCH_TARGETS` plus targets for open editor tabs and terminals. Typing an exact label runs the target when `autoAcceptExactHint` is enabled. Use `Enter` to accept a target manually.

- **[CommandModeController](src/commandModeController.ts)** owns the command-mode cursor and status item. Scoped keybindings handle motion and unassigned printable keys. The shared VS Code `type` command remains available to other extensions.

### Two-tier IDE hinting

IDE hints (`openWorkbenchHints` command) try the experimental overlay first when `preferWorkbenchDomOverlay` is enabled, which is the default.

1. **[workbenchDomOverlay.ts](src/workbenchDomOverlay.ts)** (experimental) — requires VS Code to be launched with `--remote-debugging-port` matching `workbenchDomOverlayDebugPort` (default `9333`). It selects a workbench page through the local Chrome DevTools endpoint and evaluates a script that draws labels over visible controls.
2. **WorkbenchHintController QuickPick** — used whenever the overlay returns `false`.

Keep `runWorkbenchDomOverlay` self-contained. The function is serialized with `.toString()` and runs in the VS Code renderer, where its imports, module-scope values, and closures from the extension host are unavailable. Its body includes its own label generator.

### Hint label generation

[labels.ts](src/labels.ts) generates fixed-width, base-N labels for editor and Quick Pick targets. `hintCharacters` is lowercased and deduplicated. Only `a`–`z` and `0`–`9` are supported, with the default alphabet used when fewer than two valid characters remain.

### Keybindings

Check the `when` clauses under `contributes.keybindings` in [package.json](package.json) when a key behaves differently depending on focus or mode.

- Bare workbench navigation requires positive focus on a VS Code list, tree or status bar. A webview may forward keydown events while owning its text input.
- In a document editor, `Alt+J` shows line hints. In command mode, `f` shows IDE hints and `g f` shows line hints. Elsewhere, `Alt+J` requests IDE hints when the focused control forwards the shortcut.
- The terminal-specific `Alt+J` binding uses `runCommands`, which VS Code includes in its default list of commands that skip the shell.
- Editor hint bindings require both document editor focus and `vimiumCode.hintMode`. The IDE picker handles native input, selection and acceptance. The renderer overlay owns its own focus and session cleanup.
- The extension registers its optional Codex target using the public `chatgpt.openSidebar` command when that command is available. **Open View…** delegates other extension views and their visibility conditions to VS Code.
- [UI scenarios](test-fixtures/UI-SCENARIOS.md) describe testing keyboard routing, optional Codex coverage, and running the installed VSIX in an isolated profile.

### Adding a command

A new command uses the same `vimiumCode.*` ID in each of these places.

1. `COMMANDS` in [src/constants.ts](src/constants.ts).
2. `contributes.commands` + `activationEvents` (+ keybindings if applicable) in [package.json](package.json).
3. `registerCommand` in `activate()` ([src/extension.ts](src/extension.ts)).

For forwarded workbench actions, use `executeBuiltInCommand` from [vscodeCommands.ts](src/vscodeCommands.ts) for user-facing error reporting.

## Known limitations

[KNOWN_ISSUES.md](KNOWN_ISSUES.md) documents the debug port requirement, webview keyboard limitations, menu mnemonics, and workbench overlay compatibility caveats.

## Security note

Keep the DevTools port bound to `localhost`. Use the opt-in launch flag to enable the local endpoint for the DOM overlay.
