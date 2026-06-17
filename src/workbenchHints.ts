import * as vscode from "vscode";
import { COMMANDS, CONTEXT_KEYS } from "./constants";
import { getExtensionConfiguration } from "./configuration";
import type { ExtensionConfiguration } from "./configuration";
import { normalizeTypedCharacter, normalizeTypedHintPrefix } from "./hintInput";
import type { TypeHintCharacterArgs } from "./hintInput";
import { generateHintLabels } from "./labels";
import { executeBuiltInCommand, filterAvailableCommandTargets } from "./vscodeCommands";

type WorkbenchHintExecutor = () => Promise<void> | Thenable<void> | void;

export interface WorkbenchHintTarget {
  readonly title: string;
  readonly section: string;
  readonly description: string;
  readonly command?: string;
  readonly args?: readonly unknown[];
  readonly execute?: WorkbenchHintExecutor;
}

interface CommandWorkbenchHintTarget extends WorkbenchHintTarget {
  readonly command: string;
}

interface LabeledWorkbenchHintTarget extends WorkbenchHintTarget {
  readonly label: string;
}

interface WorkbenchHintItem extends vscode.QuickPickItem {
  readonly hintLabel: string;
  readonly target: LabeledWorkbenchHintTarget;
}

interface WorkbenchHintSession {
  targets: readonly LabeledWorkbenchHintTarget[];
  readonly autoAcceptExactHint: boolean;
  readonly quickPick: vscode.QuickPick<WorkbenchHintItem>;
  readonly disposables: vscode.Disposable[];
  prefix: string;
  isUpdatingQuickPick: boolean;
}

const WORKBENCH_TARGETS: readonly CommandWorkbenchHintTarget[] = [
  {
    title: "Explorer",
    section: "Activity Bar",
    description: "Open the file explorer",
    command: "workbench.view.explorer"
  },
  {
    title: "Search",
    section: "Activity Bar",
    description: "Search across files",
    command: "workbench.view.search"
  },
  {
    title: "Source Control",
    section: "Activity Bar",
    description: "Review repository changes",
    command: "workbench.view.scm"
  },
  {
    title: "Run and Debug",
    section: "Activity Bar",
    description: "Open run and debug",
    command: "workbench.view.debug"
  },
  {
    title: "Extensions",
    section: "Activity Bar",
    description: "Manage extensions",
    command: "workbench.view.extensions"
  },
  {
    title: "Focus Activity Bar",
    section: "Layout",
    description: "Move keyboard focus to the Activity Bar",
    command: "workbench.action.focusActivityBar"
  },
  {
    title: "Focus Side Bar",
    section: "Layout",
    description: "Move keyboard focus to the Side Bar",
    command: "workbench.action.focusSideBar"
  },
  {
    title: "Focus Files Explorer",
    section: "Explorer Buttons",
    description: "Move keyboard focus to the Explorer tree",
    command: "workbench.files.action.focusFilesExplorer"
  },
  {
    title: "Reveal Active File",
    section: "Explorer Buttons",
    description: "Reveal the active editor in the Explorer tree",
    command: "workbench.files.action.showActiveFileInExplorer"
  },
  {
    title: "New File",
    section: "Explorer Buttons",
    description: "Create a file in the Explorer",
    command: "explorer.newFile"
  },
  {
    title: "New Folder",
    section: "Explorer Buttons",
    description: "Create a folder in the Explorer",
    command: "explorer.newFolder"
  },
  {
    title: "Refresh Explorer",
    section: "Explorer Buttons",
    description: "Refresh the Explorer tree",
    command: "workbench.files.action.refreshFilesExplorer"
  },
  {
    title: "Collapse Explorer",
    section: "Explorer Buttons",
    description: "Collapse all folders in the Explorer",
    command: "workbench.files.action.collapseExplorerFolders"
  },
  {
    title: "Tree Up",
    section: "Focused List or Tree",
    description: "Move focus to the previous tree/list item",
    command: "list.focusUp"
  },
  {
    title: "Tree Down",
    section: "Focused List or Tree",
    description: "Move focus to the next tree/list item",
    command: "list.focusDown"
  },
  {
    title: "Tree Expand",
    section: "Focused List or Tree",
    description: "Expand the focused tree item",
    command: "list.expand"
  },
  {
    title: "Tree Collapse",
    section: "Focused List or Tree",
    description: "Collapse the focused tree item",
    command: "list.collapse"
  },
  {
    title: "Tree Open",
    section: "Focused List or Tree",
    description: "Open or select the focused tree/list item",
    command: "list.select"
  },
  {
    title: "Quick Open File",
    section: "Global",
    description: "Search files in the current workspace",
    command: "workbench.action.quickOpen"
  },
  {
    title: "Command Palette",
    section: "Global",
    description: "Run any VS Code command",
    command: "workbench.action.showCommands"
  },
  {
    title: "Editor Symbols",
    section: "Global",
    description: "Jump to a symbol in the active file",
    command: "workbench.action.gotoSymbol"
  },
  {
    title: "Workspace Symbols",
    section: "Global",
    description: "Search symbols across the workspace",
    command: "workbench.action.showAllSymbols"
  },
  {
    title: "Problems",
    section: "Panel Buttons",
    description: "Open diagnostics",
    command: "workbench.actions.view.problems"
  },
  {
    title: "Toggle Terminal",
    section: "Panel Buttons",
    description: "Open or hide the integrated terminal",
    command: "workbench.action.terminal.toggleTerminal"
  },
  {
    title: "Focus Status Bar",
    section: "Layout",
    description: "Move keyboard focus to the Status Bar",
    command: "workbench.action.focusStatusBar"
  },
  {
    title: "Settings",
    section: "Global",
    description: "Open VS Code settings",
    command: "workbench.action.openSettings"
  }
];

export class WorkbenchHintController implements vscode.Disposable {
  private readonly statusBar: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private session: WorkbenchHintSession | undefined;

  public constructor(private readonly readConfiguration: () => ExtensionConfiguration = getExtensionConfiguration) {
    this.statusBar = vscode.window.createStatusBarItem("vimiumCode.workbenchHints", vscode.StatusBarAlignment.Left, 99);
    this.statusBar.name = "Vimium IDE Hint Mode";
    this.statusBar.command = COMMANDS.cancelHint;
    this.statusBar.tooltip = "Vimium IDE hint mode is active. Press Escape to cancel.";

    this.disposables.push(
      this.statusBar,
      vscode.window.tabGroups.onDidChangeTabs(() => this.refreshIfActive()),
      vscode.window.tabGroups.onDidChangeTabGroups(() => this.refreshIfActive()),
      vscode.window.onDidCloseTerminal(() => this.refreshIfActive()),
      vscode.window.onDidOpenTerminal(() => this.refreshIfActive())
    );
  }

  public get isActive(): boolean {
    return this.session !== undefined;
  }

  public async openHints(configuration: ExtensionConfiguration = this.readConfiguration()): Promise<void> {
    await this.cancelHint();
    const targets = await collectWorkbenchHintTargets();

    if (targets.length === 0) {
      await vscode.window.showInformationMessage("Vimium: no IDE targets are available in this VS Code window.");
      return;
    }

    const quickPick = vscode.window.createQuickPick<WorkbenchHintItem>();
    const labeledTargets = labelWorkbenchHintTargets(targets, configuration.hintCharacters);
    const session: WorkbenchHintSession = {
      targets: labeledTargets,
      autoAcceptExactHint: configuration.autoAcceptExactHint,
      quickPick,
      disposables: [],
      prefix: "",
      isUpdatingQuickPick: false
    };

    quickPick.ignoreFocusOut = false;
    quickPick.matchOnDescription = false;
    quickPick.matchOnDetail = false;

    session.disposables.push(
      quickPick.onDidChangeValue((value) => {
        if (!session.isUpdatingQuickPick) {
          void this.replacePrefixFromQuickPick(value);
        }
      }),
      quickPick.onDidAccept(() => {
        const [selectedItem] = quickPick.selectedItems;

        if (selectedItem) {
          void this.executeTarget(selectedItem.target);
        } else {
          void this.acceptHint();
        }
      }),
      quickPick.onDidHide(() => {
        if (this.session === session) {
          void this.cancelHint();
        }
      })
    );

    this.session = session;
    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.hintMode, true);
    this.renderSession();
    quickPick.show();
  }

  public async typeHintCharacter(args: TypeHintCharacterArgs | string | undefined): Promise<void> {
    const session = this.session;

    if (!session) {
      return;
    }

    const character = normalizeTypedCharacter(args);

    if (!character) {
      return;
    }

    await this.replacePrefix(`${session.prefix}${character}`);
  }

  public async acceptHint(): Promise<void> {
    const session = this.session;

    if (!session) {
      return;
    }

    const matchingTargets = getMatchingTargets(session.targets, session.prefix);
    const exactTarget = matchingTargets.find((target) => target.label === session.prefix);
    const target = exactTarget ?? (matchingTargets.length === 1 ? matchingTargets[0] : undefined);

    if (!target) {
      void vscode.window.setStatusBarMessage("Vimium: keep typing until one IDE hint remains.", 1200);
      return;
    }

    await this.executeTarget(target);
  }

  public backspaceHint(): void {
    const session = this.session;

    if (!session || session.prefix.length === 0) {
      return;
    }

    void this.replacePrefix(session.prefix.slice(0, -1));
  }

  public async cancelHint(): Promise<void> {
    this.clearSession();
    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.hintMode, false);
  }

  public dispose(): void {
    void this.cancelHint();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async refreshIfActive(): Promise<void> {
    const session = this.session;

    if (!session) {
      return;
    }

    const configuration = this.readConfiguration();
    const targets = await collectWorkbenchHintTargets();

    if (this.session !== session) {
      // The session was cancelled or replaced while awaiting; don't mutate it.
      return;
    }

    const labeledTargets = labelWorkbenchHintTargets(targets, configuration.hintCharacters);
    const nextPrefix = labeledTargets.some((target) => target.label.startsWith(session.prefix)) ? session.prefix : "";

    session.targets = labeledTargets;
    session.prefix = nextPrefix;
    this.renderSession();
  }

  private async replacePrefixFromQuickPick(value: string): Promise<void> {
    await this.replacePrefix(normalizeTypedHintPrefix(value));
  }

  private async replacePrefix(prefix: string): Promise<void> {
    const session = this.session;

    if (!session) {
      return;
    }

    const matchingTargets = getMatchingTargets(session.targets, prefix);

    if (matchingTargets.length === 0) {
      void vscode.window.setStatusBarMessage(`Vimium: no IDE hint matches "${prefix.toUpperCase()}".`, 1200);
      this.renderSession();
      return;
    }

    session.prefix = prefix;
    const exactTarget = matchingTargets.find((target) => target.label === prefix);

    if (exactTarget && session.autoAcceptExactHint) {
      await this.executeTarget(exactTarget);
      return;
    }

    this.renderSession();
  }

  private renderSession(): void {
    const session = this.session;

    if (!session) {
      return;
    }

    const matchingTargets = getMatchingTargets(session.targets, session.prefix);

    session.isUpdatingQuickPick = true;
    try {
      session.quickPick.title = `Vimium IDE Hints (${matchingTargets.length})`;
      session.quickPick.placeholder = session.prefix
        ? "Keep typing the shown label, Enter accepts the selected target"
        : "Type a shown label for tabs, Activity Bar entries, buttons, panels, or tree actions";
      session.quickPick.value = session.prefix.toUpperCase();
      session.quickPick.items = createWorkbenchHintItemsFromLabeledTargets(matchingTargets);
    } finally {
      session.isUpdatingQuickPick = false;
    }

    this.statusBar.text = `$(keyboard) Vimium IDE: ${matchingTargets.length}${session.prefix ? ` | ${session.prefix.toUpperCase()}` : ""}`;
    this.statusBar.show();
  }

  private async executeTarget(target: LabeledWorkbenchHintTarget): Promise<void> {
    if (!this.session) {
      return;
    }

    this.clearSession();
    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.hintMode, false);

    try {
      if (target.execute) {
        await target.execute();
        return;
      }

      if (target.command) {
        await executeBuiltInCommand(target.command, ...(target.args ?? []));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await vscode.window.showWarningMessage(`Vimium: failed to run ${target.title}. ${message}`);
    }
  }

  private clearSession(): void {
    const session = this.session;

    if (!session) {
      this.statusBar.hide();
      return;
    }

    this.session = undefined;

    for (const disposable of session.disposables) {
      disposable.dispose();
    }

    session.quickPick.dispose();
    this.statusBar.hide();
  }
}

export async function collectWorkbenchHintTargets(): Promise<readonly WorkbenchHintTarget[]> {
  const availableStaticTargets = await filterAvailableCommandTargets(WORKBENCH_TARGETS);
  const activityBarTargets = availableStaticTargets.filter((target) => target.section === "Activity Bar");
  const remainingStaticTargets = availableStaticTargets.filter((target) => target.section !== "Activity Bar");

  return [
    ...activityBarTargets,
    ...createEditorTabHintTargets(),
    ...createTerminalHintTargets(),
    ...remainingStaticTargets
  ];
}

export function createWorkbenchHintItems(
  targets: readonly WorkbenchHintTarget[],
  hintCharacters: string
): readonly WorkbenchHintItem[] {
  return createWorkbenchHintItemsFromLabeledTargets(labelWorkbenchHintTargets(targets, hintCharacters));
}

export function getWorkbenchHintTargetsForTest(): readonly WorkbenchHintTarget[] {
  return WORKBENCH_TARGETS;
}

export function createEditorTabHintTargets(
  tabGroups: readonly vscode.TabGroup[] = vscode.window.tabGroups.all
): readonly WorkbenchHintTarget[] {
  return tabGroups.flatMap((group, groupIndex) =>
    group.tabs.flatMap((tab, tabIndex) => {
      const execute = createTabExecutor(tab);

      if (!execute) {
        return [];
      }

      return [
        {
          title: formatTabTitle(tab),
          section: group.isActive ? "Editor Tabs" : `Editor Group ${formatViewColumn(group.viewColumn)}`,
          description: formatTabDescription(tab, groupIndex, tabIndex),
          execute
        }
      ];
    })
  );
}

function labelWorkbenchHintTargets(
  targets: readonly WorkbenchHintTarget[],
  hintCharacters: string
): readonly LabeledWorkbenchHintTarget[] {
  const labels = generateHintLabels(targets.length, hintCharacters);

  return targets.map((target, index) => ({
    ...target,
    label: labels[index] ?? ""
  }));
}

function createWorkbenchHintItemsFromLabeledTargets(
  targets: readonly LabeledWorkbenchHintTarget[]
): readonly WorkbenchHintItem[] {
  return targets.map<WorkbenchHintItem>((target) => ({
    label: `${target.label.toUpperCase()}  ${target.title}`,
    description: target.section,
    detail: target.command ? `${target.description} (${target.command})` : target.description,
    alwaysShow: true,
    hintLabel: target.label,
    target
  }));
}

function createTerminalHintTargets(terminals: readonly vscode.Terminal[] = vscode.window.terminals): readonly WorkbenchHintTarget[] {
  return terminals.map((terminal, index) => ({
    title: terminal.name,
    section: "Terminal Tabs",
    description: `Focus terminal ${index + 1}`,
    execute: () => terminal.show(false)
  }));
}

function createTabExecutor(tab: vscode.Tab): WorkbenchHintExecutor | undefined {
  const input = tab.input;
  const viewColumn = tab.group.viewColumn;
  const showOptions: vscode.TextDocumentShowOptions = {
    viewColumn,
    preserveFocus: false,
    preview: false
  };

  if (input instanceof vscode.TabInputText) {
    return async () => {
      await vscode.window.showTextDocument(input.uri, showOptions);
    };
  }

  if (input instanceof vscode.TabInputTextDiff) {
    return async () => {
      await executeBuiltInCommand("vscode.diff", input.original, input.modified, tab.label, showOptions);
    };
  }

  if (input instanceof vscode.TabInputNotebook) {
    return async () => {
      const notebook = await vscode.workspace.openNotebookDocument(input.uri);

      await vscode.window.showNotebookDocument(notebook, showOptions);
    };
  }

  if (input instanceof vscode.TabInputCustom) {
    return async () => {
      await executeBuiltInCommand("vscode.openWith", input.uri, input.viewType, showOptions);
    };
  }

  return undefined;
}

function formatTabTitle(tab: vscode.Tab): string {
  const dirtySuffix = tab.isDirty ? " *" : "";
  const activePrefix = tab.isActive ? "Current: " : "";

  return `${activePrefix}${tab.label}${dirtySuffix}`;
}

function formatTabDescription(tab: vscode.Tab, groupIndex: number, tabIndex: number): string {
  const traits = [
    `group ${groupIndex + 1}`,
    `tab ${tabIndex + 1}`,
    tab.isPinned ? "pinned" : undefined,
    tab.isPreview ? "preview" : undefined
  ].filter((trait): trait is string => Boolean(trait));

  return `Open ${traits.join(", ")}`;
}

function formatViewColumn(viewColumn: vscode.ViewColumn): string {
  if (viewColumn >= vscode.ViewColumn.One && viewColumn <= vscode.ViewColumn.Nine) {
    return String(viewColumn);
  }

  return "Active";
}

function getMatchingTargets(
  targets: readonly LabeledWorkbenchHintTarget[],
  prefix: string
): readonly LabeledWorkbenchHintTarget[] {
  if (prefix.length === 0) {
    return targets;
  }

  return targets.filter((target) => target.label.startsWith(prefix));
}
