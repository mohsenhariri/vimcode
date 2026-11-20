import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { COMMANDS } from "../../extension";
import type { TestCase } from "./extension.test";
import { waitFor } from "./waitFor";

export const commandModeTests: readonly TestCase[] = [
  {
    name: "allows another extension to acquire and retain the type command during command mode",
    async run() {
      const document = await vscode.workspace.openTextDocument({ content: "unchanged" });
      const editor = await vscode.window.showTextDocument(document);
      await waitFor(() => vscode.window.activeTextEditor === editor, "the typing fixture to become active");
      const originalCursor = editor.options.cursorStyle;
      const received: string[] = [];
      let typing: vscode.Disposable | undefined;
      try {
        await vscode.commands.executeCommand(COMMANDS.enterCommandMode);
        await waitFor(() => editor.options.cursorStyle === vscode.TextEditorCursorStyle.Block, "the command-mode block cursor");
        typing = vscode.commands.registerCommand("type", ({ text }: { text: string }) => received.push(text));
        await vscode.commands.executeCommand("type", { text: "f" });
        await vscode.commands.executeCommand(COMMANDS.exitCommandMode);
        await vscode.commands.executeCommand("type", { text: "g" });
        assert.deepEqual(received, ["f", "g"]);
        await waitFor(() => editor.options.cursorStyle === originalCursor, "the original cursor after leaving command mode");
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
      await waitFor(() => vscode.window.activeTextEditor === first, "the first editor to become active");
      const originalCursor = first.options.cursorStyle;
      const second = await vscode.workspace.openTextDocument({ content: "second" });
      try {
        first.options = { cursorStyle: vscode.TextEditorCursorStyle.Underline };
        await vscode.commands.executeCommand(COMMANDS.enterCommandMode);
        await waitFor(() => first.options.cursorStyle === vscode.TextEditorCursorStyle.Block, "the block cursor before switching editors");
        const next = await vscode.window.showTextDocument(second, { viewColumn: vscode.ViewColumn.Beside });
        await waitFor(() => vscode.window.activeTextEditor === next, "the second editor to become active");
        await vscode.commands.executeCommand(COMMANDS.exitCommandMode, { action: "editor.action.insertLineAfter" });
        assert.equal(next.document.getText(), "second");
        await waitFor(() => first.options.cursorStyle === vscode.TextEditorCursorStyle.Underline, "the restored underline cursor");
      } finally {
        await vscode.commands.executeCommand(COMMANDS.exitCommandMode);
        first.options = { cursorStyle: originalCursor };
      }
    }
  }
];
