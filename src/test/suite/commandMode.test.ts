import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { COMMANDS } from "../../extension";
import type { TestCase } from "./extension.test";

export const commandModeTests: readonly TestCase[] = [
  {
    name: "allows another extension to acquire and retain the type command during command mode",
    async run() {
      const document = await vscode.workspace.openTextDocument({ content: "unchanged" });
      const editor = await vscode.window.showTextDocument(document);
      const originalCursor = editor.options.cursorStyle;
      const received: string[] = [];
      let typing: vscode.Disposable | undefined;
      try {
        await vscode.commands.executeCommand(COMMANDS.enterCommandMode);
        assert.equal(editor.options.cursorStyle, vscode.TextEditorCursorStyle.Block);
        typing = vscode.commands.registerCommand("type", ({ text }: { text: string }) => received.push(text));
        await vscode.commands.executeCommand("type", { text: "f" });
        await vscode.commands.executeCommand(COMMANDS.exitCommandMode);
        await vscode.commands.executeCommand("type", { text: "g" });
        assert.deepEqual(received, ["f", "g"]);
        assert.equal(editor.options.cursorStyle, originalCursor);
        assert.equal(document.getText(), "unchanged");
      } finally {
        typing?.dispose();
        await vscode.commands.executeCommand(COMMANDS.exitCommandMode);
      }
    }
  },
  {
    name: "restores the previous editor cursor and drops pending edit actions after an editor switch",
    async run() {
      const first = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ content: "first" }));
      const originalCursor = first.options.cursorStyle;
      const second = await vscode.workspace.openTextDocument({ content: "second" });
      try {
        first.options = { cursorStyle: vscode.TextEditorCursorStyle.Underline };
        await vscode.commands.executeCommand(COMMANDS.enterCommandMode);
        const next = await vscode.window.showTextDocument(second, { viewColumn: vscode.ViewColumn.Beside });
        await vscode.commands.executeCommand(COMMANDS.exitCommandMode, { action: "editor.action.insertLineAfter" });
        assert.equal(next.document.getText(), "second");
        assert.equal(first.options.cursorStyle, vscode.TextEditorCursorStyle.Underline);
      } finally {
        await vscode.commands.executeCommand(COMMANDS.exitCommandMode);
        first.options = { cursorStyle: originalCursor };
      }
    }
  }
];
