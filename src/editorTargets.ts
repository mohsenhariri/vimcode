import * as vscode from "vscode";
import { generateHintLabels } from "./labels";

export interface EditorHintTarget {
  readonly label: string;
  readonly line: number;
  readonly character: number;
  readonly range: vscode.Range;
  readonly preview: string;
}

export interface CollectEditorTargetsOptions {
  readonly hintCharacters: string;
  readonly includeBlankLines: boolean;
  readonly maxEditorHints: number;
}

export function collectEditorHintTargets(
  editor: vscode.TextEditor,
  options: CollectEditorTargetsOptions
): readonly EditorHintTarget[] {
  const locations = collectVisibleLocations(editor, options);
  const labels = generateHintLabels(locations.length, options.hintCharacters);

  return locations.map((location, index) => ({
    ...location,
    label: labels[index] ?? ""
  }));
}

function collectVisibleLocations(
  editor: vscode.TextEditor,
  options: CollectEditorTargetsOptions
): readonly Omit<EditorHintTarget, "label">[] {
  const document = editor.document;
  const locations: Omit<EditorHintTarget, "label">[] = [];
  const seenLines = new Set<number>();
  const visibleRanges = editor.visibleRanges.length > 0
    ? editor.visibleRanges
    : [new vscode.Range(editor.selection.active, editor.selection.active)];

  for (const visibleRange of visibleRanges) {
    const startLine = Math.max(0, visibleRange.start.line);
    const endLine = Math.min(document.lineCount - 1, visibleRange.end.line);

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      if (locations.length >= options.maxEditorHints) {
        return locations;
      }

      if (seenLines.has(lineNumber)) {
        continue;
      }

      seenLines.add(lineNumber);
      const line = document.lineAt(lineNumber);

      if (!options.includeBlankLines && line.isEmptyOrWhitespace) {
        continue;
      }

      const character = line.isEmptyOrWhitespace ? 0 : line.firstNonWhitespaceCharacterIndex;
      const range = createDecorationRange(line, character);

      locations.push({
        line: lineNumber,
        character,
        range,
        preview: formatPreview(line.text)
      });
    }
  }

  return locations;
}

function createDecorationRange(line: vscode.TextLine, character: number): vscode.Range {
  if (line.text.length === 0) {
    const position = new vscode.Position(line.lineNumber, 0);

    return new vscode.Range(position, position);
  }

  const safeCharacter = Math.min(character, Math.max(0, line.text.length - 1));

  return new vscode.Range(line.lineNumber, safeCharacter, line.lineNumber, safeCharacter + 1);
}

function formatPreview(text: string): string {
  const trimmed = text.trim();

  if (trimmed.length <= 80) {
    return trimmed;
  }

  return `${trimmed.slice(0, 77)}...`;
}
