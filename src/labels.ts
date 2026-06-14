import { DEFAULT_HINT_CHARACTERS } from "./constants";

const SUPPORTED_HINT_CHARACTER_PATTERN = /^[a-z0-9]$/;

export function normalizeHintCharacters(value: unknown): string {
  const source = typeof value === "string" ? value.toLowerCase() : DEFAULT_HINT_CHARACTERS;
  const characters: string[] = [];
  const seen = new Set<string>();

  for (const character of source) {
    if (!SUPPORTED_HINT_CHARACTER_PATTERN.test(character) || seen.has(character)) {
      continue;
    }

    seen.add(character);
    characters.push(character);
  }

  return characters.length >= 2 ? characters.join("") : DEFAULT_HINT_CHARACTERS;
}

export function generateHintLabels(count: number, characters = DEFAULT_HINT_CHARACTERS): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("count must be a non-negative integer");
  }

  if (count === 0) {
    return [];
  }

  const normalizedCharacters = normalizeHintCharacters(characters);
  const labelLength = getLabelLength(count, normalizedCharacters.length);
  const labels: string[] = [];

  for (let index = 0; index < count; index += 1) {
    labels.push(formatFixedWidthLabel(index, labelLength, normalizedCharacters));
  }

  return labels;
}

function getLabelLength(count: number, alphabetSize: number): number {
  let labelLength = 1;
  let capacity = alphabetSize;

  while (capacity < count) {
    labelLength += 1;
    capacity *= alphabetSize;
  }

  return labelLength;
}

function formatFixedWidthLabel(index: number, labelLength: number, characters: string): string {
  const alphabetSize = characters.length;
  const label: string[] = new Array<string>(labelLength);
  let remaining = index;

  for (let position = labelLength - 1; position >= 0; position -= 1) {
    label[position] = characters[remaining % alphabetSize] ?? characters[0] ?? "a";
    remaining = Math.floor(remaining / alphabetSize);
  }

  return label.join("");
}
