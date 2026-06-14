import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { COMMANDS, formatEditingContext } from "../../extension";

export interface TestCase {
  readonly name: string;
  run(): Promise<void> | void;
}

export const tests: readonly TestCase[] = [
  {
    name: "formats context without an active editor",
    run() {
      assert.equal(
        formatEditingContext({
          workspaceFolderCount: 0
        }),
        "No workspace folder is open. No active editor."
      );
    }
  },
  {
    name: "formats context with one workspace and a TypeScript editor",
    run() {
      assert.equal(
        formatEditingContext({
          workspaceFolderCount: 1,
          activeEditorLabel: "src/extension.ts",
          languageId: "typescript"
        }),
        "1 workspace folder is open. Active editor: src/extension.ts (typescript)."
      );
    }
  },
  {
    name: "registers contributed commands after activation",
    async run() {
      const extension = vscode.extensions.getExtension("mohsen.vim-workflow-tools");

      assert.ok(extension, "Expected extension to be available in the extension host");
      await extension.activate();

      const commands = await vscode.commands.getCommands(true);

      assert.ok(commands.includes(COMMANDS.showEditingContext));
      assert.ok(commands.includes(COMMANDS.openKeyboardShortcuts));
    }
  }
];
