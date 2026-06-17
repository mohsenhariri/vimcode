import * as vscode from "vscode";

export async function executeBuiltInCommand(command: string, ...args: readonly unknown[]): Promise<void> {
  // Run directly instead of enumerating every command first: this is on the hot
  // path for held navigation keys, and a missing command surfaces as a rejection
  // we already handle below.
  try {
    await vscode.commands.executeCommand(command, ...args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await vscode.window.showWarningMessage(`Vimium: failed to run ${command}. ${message}`);
  }
}

export async function filterAvailableCommandTargets<T extends { readonly command: string }>(
  targets: readonly T[]
): Promise<readonly T[]> {
  const commands = new Set(await vscode.commands.getCommands(true));

  return targets.filter((target) => commands.has(target.command));
}
