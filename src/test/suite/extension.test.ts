import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  COMMANDS,
  collectEditorHintTargets,
  collectWorkbenchHintTargets,
  createEditorTabHintTargets,
  createWorkbenchHintItems,
  generateHintLabels,
  getWorkbenchHintTargetsForTest,
  normalizeHintCharacters,
  selectWorkbenchDevToolsTarget
} from "../../extension";

const extensionId = "harimo9.vimcode";

export interface TestCase {
  readonly name: string;
  run(): Promise<void> | void;
}

export const tests: readonly TestCase[] = [
  {
    name: "normalizes hint characters to supported unique keys",
    run() {
      assert.equal(normalizeHintCharacters("aA!!s1s"), "as1");
      assert.equal(normalizeHintCharacters("!"), "asdfghjklqwertyuiopzxcvbnm");
    }
  },
  {
    name: "generates fixed-width unique hint labels",
    run() {
      assert.deepEqual(generateHintLabels(4, "ab"), ["aa", "ab", "ba", "bb"]);
      assert.deepEqual(generateHintLabels(3, "abc"), ["a", "b", "c"]);
      assert.equal(new Set(generateHintLabels(100, "asdf")).size, 100);
    }
  },
  {
    name: "collects visible non-blank editor line targets",
    async run() {
      const document = await vscode.workspace.openTextDocument({
        content: "first\n\n  second\nthird",
        language: "plaintext"
      });
      const editor = await vscode.window.showTextDocument(document);
      const targets = collectEditorHintTargets(editor, {
        hintCharacters: "abc",
        includeBlankLines: false,
        maxEditorHints: 10
      });

      assert.ok(targets.length >= 3, `Expected at least three visible targets, got ${targets.length}`);
      assert.equal(targets[0]?.label, "a");
      assert.equal(targets[0]?.line, 0);
      assert.equal(targets[1]?.line, 2);
      assert.equal(targets[1]?.character, 2);
    }
  },
  {
    name: "collects blank editor lines when configured",
    async run() {
      const document = await vscode.workspace.openTextDocument({
        content: "first\n\nthird",
        language: "plaintext"
      });
      const editor = await vscode.window.showTextDocument(document);
      const targets = collectEditorHintTargets(editor, {
        hintCharacters: "abc",
        includeBlankLines: true,
        maxEditorHints: 10
      });

      assert.ok(
        targets.some((target) => target.line === 1),
        "Expected the blank line to be included as a hint target"
      );
    }
  },
  {
    name: "declares IDE workbench hint targets for VS Code chrome",
    run() {
      const targets = getWorkbenchHintTargetsForTest();
      const commands = new Set(targets.map((target) => target.command));

      assert.ok(commands.has("workbench.view.explorer"));
      assert.ok(commands.has("workbench.view.search"));
      assert.ok(commands.has("workbench.files.action.focusFilesExplorer"));
      assert.ok(commands.has("explorer.newFile"));
      assert.ok(commands.has("list.focusDown"));
      assert.ok(commands.has("list.expand"));
      assert.ok(commands.has("workbench.action.terminal.toggleTerminal"));
      assert.ok(commands.has("workbench.action.focusStatusBar"));
      assert.ok(targets.length <= 26, "Keep the default IDE hint list to one-key labels");
    }
  },
  {
    name: "creates Vimium-style IDE hint items with stable sections",
    run() {
      const items = createWorkbenchHintItems(getWorkbenchHintTargetsForTest(), "asdfghjklqwertyuiopzxcvbnm");

      assert.equal(items[0]?.hintLabel, "a");
      assert.match(items[0]?.label ?? "", /^A {2}Explorer$/);
      assert.equal(items[0]?.description, "Activity Bar");
      assert.ok(items.some((item) => item.description === "Explorer Buttons" && item.label.includes("New File")));
      assert.ok(items.every((item) => item.hintLabel.length === 1));
    }
  },
  {
    name: "does not choose an ambiguous workbench DevTools target",
    run() {
      const selectedTarget = selectWorkbenchDevToolsTarget(
        [
          {
            id: "first",
            type: "page",
            title: "other-project - Visual Studio Code - Insiders",
            url: "vscode-file://vscode-app/out/vs/code/electron-sandbox/workbench/workbench.html",
            webSocketDebuggerUrl: "ws://127.0.0.1:9333/first"
          },
          {
            id: "second",
            type: "page",
            title: "vs_code_vim - Visual Studio Code - Insiders",
            url: "vscode-file://vscode-app/out/vs/code/electron-sandbox/workbench/workbench.html",
            webSocketDebuggerUrl: "ws://127.0.0.1:9333/second"
          }
        ],
        {
          workspaceNames: []
        }
      );

      assert.equal(selectedTarget, undefined);
    }
  },
  {
    name: "ignores webviews and ordinary pages with a workbench-like title",
    run() {
      for (const url of [
        "https://example.com/workbench.html",
        "vscode-webview://fixture/index.html",
        "vscode-file://vscode-app/out/vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html"
      ]) {
        assert.equal(selectWorkbenchDevToolsTarget([{
          id: "fixture",
          type: "page",
          title: "Visual Studio Code",
          url,
          webSocketDebuggerUrl: "ws://127.0.0.1:9333/devtools/page/fixture"
        }], { workspaceNames: [] }), undefined);
      }
    }
  },
  {
    name: "selects a workbench DevTools target by current workspace hint",
    run() {
      const selectedTarget = selectWorkbenchDevToolsTarget(
        [
          {
            id: "first",
            type: "page",
            title: "other-project - Visual Studio Code - Insiders",
            url: "vscode-file://vscode-app/out/vs/code/electron-sandbox/workbench/workbench.html",
            webSocketDebuggerUrl: "ws://127.0.0.1:9333/first"
          },
          {
            id: "second",
            type: "page",
            title: "vs_code_vim - Visual Studio Code - Insiders",
            url: "vscode-file://vscode-app/out/vs/code/electron-sandbox/workbench/workbench.html",
            webSocketDebuggerUrl: "ws://127.0.0.1:9333/second"
          }
        ],
        {
          workspaceNames: ["vs_code_vim"]
        }
      );

      assert.equal(selectedTarget?.id, "second");
    }
  },
  {
    name: "creates IDE hint targets for open editor tabs",
    async run() {
      const document = await vscode.workspace.openTextDocument({
        content: "tab target",
        language: "plaintext"
      });

      await vscode.window.showTextDocument(document);

      const tabTargets = createEditorTabHintTargets();
      const allTargets = await collectWorkbenchHintTargets();

      assert.ok(tabTargets.length >= 1, "Expected at least one open editor tab target");
      assert.ok(
        tabTargets.some((target) => target.section.includes("Editor") && target.description.includes("tab")),
        "Expected editor tab targets to describe the tab position"
      );
      assert.ok(
        allTargets.some((target) => target.section.includes("Editor") && target.description.includes("tab")),
        "Expected collected IDE hint targets to include editor tabs"
      );
    }
  },
  {
    name: "uses available VS Code commands for IDE hint targets",
    async run() {
      const availableCommands = new Set(await vscode.commands.getCommands(true));
      const missingTargets = getWorkbenchHintTargetsForTest()
        .flatMap((target) =>
          target.command && !availableCommands.has(target.command)
            ? [`${target.section}: ${target.title} (${target.command})`]
            : []
        );

      assert.deepEqual(missingTargets, []);
    }
  },
  {
    name: "registers contributed commands after activation",
    async run() {
      const extension = vscode.extensions.getExtension(extensionId);

      assert.ok(extension, "Expected extension to be available in the extension host");
      await extension.activate();

      const commands = await vscode.commands.getCommands(true);

      for (const command of Object.values(COMMANDS)) {
        assert.ok(commands.includes(command), `Expected command to be registered: ${command}`);
      }
    }
  },
  {
    name: "executes an editor hint jump from typed label",
    async run() {
      const document = await vscode.workspace.openTextDocument({
        content: "alpha\nbeta\ngamma",
        language: "plaintext"
      });
      const editor = await vscode.window.showTextDocument(document);
      const extension = vscode.extensions.getExtension(extensionId);

      assert.ok(extension, "Expected extension to be available in the extension host");
      await extension.activate();
      editor.selection = new vscode.Selection(new vscode.Position(2, 0), new vscode.Position(2, 0));

      await vscode.commands.executeCommand(COMMANDS.enterHintMode);
      await vscode.commands.executeCommand(COMMANDS.typeHintCharacter, { character: "a" });

      assert.equal(vscode.window.activeTextEditor?.selection.active.line, 0);
    }
  },
  {
    name: "keeps public command list in sync",
    run() {
      assert.equal(new Set(Object.values(COMMANDS)).size, Object.values(COMMANDS).length);
      assert.ok(Object.values(COMMANDS).every((command) => command.startsWith("vimiumCode.")));
      assert.ok(Object.values(COMMANDS).includes("vimiumCode.focusActivityBar"));
      assert.ok(Object.values(COMMANDS).includes("vimiumCode.focusFilesExplorer"));
      assert.ok(Object.values(COMMANDS).includes("vimiumCode.listFocusDown"));
    }
  }
];
