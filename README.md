# Vim Workflow Tools

This repository contains a TypeScript VS Code extension scaffold for building Vim-oriented workflow commands.

## Features

- `Vim Workflow: Show Editing Context` reports the open workspace count and active editor.
- `Vim Workflow: Open Keyboard Shortcuts JSON` opens the user keybindings file.
- `vimWorkflowTools.showNotifications` controls whether user-invoked commands show information notifications.
- A custom `@vscode/test-electron` runner verifies the extension in an Extension Development Host.

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
