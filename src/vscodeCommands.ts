import * as vscode from "vscode";

export async function executeBuiltInCommand(command: string, ...args: readonly unknown[]): Promise<void> {
  const commands = await vscode.commands.getCommands(true);

  if (!commands.includes(command)) {
    await vscode.window.showWarningMessage(`Vimium: VS Code command is not available: ${command}`);
    return;
  }

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
