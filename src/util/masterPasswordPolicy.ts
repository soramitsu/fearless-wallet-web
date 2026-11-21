// What a NEW master password must be. The wallet's keys and its Google Drive backups are encrypted with it (scrypt
// N = 2^15), so a copy of either taken off the device can be guessed at offline; until 4.2.7 six characters of any
// kind were enough. A password an earlier version accepted keeps unlocking and exporting: this applies only when one
// is created or changed.

/** The shortest password made of at least two kinds of character (lower case, upper case, digits, other letters,
 * symbols). */
export const MASTER_PASSWORD_MIN_LENGTH = 8;

/** The shortest password made of one kind of character only, such as `password` or `12345678`. */
export const MASTER_PASSWORD_SINGLE_KIND_MIN_LENGTH = 12;

const KINDS = [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[\p{Lo}\p{Lt}\p{Lm}]/u];

function kindCount(characters: string[]): number {
  const kinds = new Set<number>();

  for (const character of characters) {
    const kind = KINDS.findIndex((pattern) => pattern.test(character));

    kinds.add(kind === -1 ? KINDS.length : kind);
  }

  return kinds.size;
}

/** Whether `password` may become the master password. Lengths count Unicode characters, not UTF-16 units. */
export function isAcceptableNewMasterPassword(password: string): boolean {
  if (typeof password !== 'string') return false;

  const characters = [...password];

  if (characters.length < MASTER_PASSWORD_MIN_LENGTH) return false;

  return characters.length >= MASTER_PASSWORD_SINGLE_KIND_MIN_LENGTH || kindCount(characters) >= 2;
}
