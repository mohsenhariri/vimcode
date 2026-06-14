import * as vscode from "vscode";
import { DEFAULT_HINT_CHARACTERS, EXTENSION_NAMESPACE } from "./constants";
import { normalizeHintCharacters } from "./labels";

const DEFAULT_MAX_EDITOR_HINTS = 250;

export interface ExtensionConfiguration {
  readonly hintCharacters: string;
  readonly includeBlankLines: boolean;
  readonly maxEditorHints: number;
  readonly autoAcceptExactHint: boolean;
  readonly preferWorkbenchDomOverlay: boolean;
  readonly workbenchDomOverlayDebugPort: number;
}

export function getExtensionConfiguration(): ExtensionConfiguration {
  const configuration = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE);

  return {
    hintCharacters: normalizeHintCharacters(configuration.get<string>("hintCharacters", DEFAULT_HINT_CHARACTERS)),
    includeBlankLines: configuration.get<boolean>("includeBlankLines", false),
    maxEditorHints: clampInteger(configuration.get<number>("maxEditorHints", DEFAULT_MAX_EDITOR_HINTS), 1, 1000),
    autoAcceptExactHint: configuration.get<boolean>("autoAcceptExactHint", true),
    preferWorkbenchDomOverlay: configuration.get<boolean>("preferWorkbenchDomOverlay", true),
    workbenchDomOverlayDebugPort: clampInteger(
      configuration.get<number>("workbenchDomOverlayDebugPort", 9333),
      1,
      65535
    )
  };
}

function clampInteger(value: number | undefined, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(Math.max(Math.floor(value), minimum), maximum);
}
