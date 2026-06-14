export interface TypeHintCharacterArgs {
  readonly character?: string;
}

const SUPPORTED_TYPED_CHARACTER_PATTERN = /^[a-z0-9]$/;

export function normalizeTypedCharacter(args: TypeHintCharacterArgs | string | undefined): string | undefined {
  const rawCharacter = typeof args === "string" ? args : args?.character;

  if (!rawCharacter) {
    return undefined;
  }

  const character = rawCharacter.toLowerCase();

  return SUPPORTED_TYPED_CHARACTER_PATTERN.test(character) ? character : undefined;
}

export function normalizeTypedHintPrefix(value: string): string {
  return Array.from(value.toLowerCase()).filter((character) => SUPPORTED_TYPED_CHARACTER_PATTERN.test(character)).join("");
}
