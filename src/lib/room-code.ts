// Room codes double as the access secret for a meeting: anyone holding the code can join,
// read its chat/transcript, and use its AI assistant. Keep them long and unguessable.
export const ROOM_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const GROUPS = 3;
const GROUP_LENGTH = 4;
const ROOM_CODE_PATTERN = /^[abcdefghjkmnpqrstuvwxyz23456789]{4}-[abcdefghjkmnpqrstuvwxyz23456789]{4}-[abcdefghjkmnpqrstuvwxyz23456789]{4}$/;

export function generateRoomCode(): string {
  const bytes = new Uint32Array(GROUPS * GROUP_LENGTH);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (n) => ROOM_CODE_ALPHABET[n % ROOM_CODE_ALPHABET.length]);
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    groups.push(chars.slice(g * GROUP_LENGTH, (g + 1) * GROUP_LENGTH).join(""));
  }
  return groups.join("-");
}

export function isValidRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(value);
}

/** Accepts a raw code or a pasted meeting link and returns the room code, or null. */
export function extractRoomCode(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  if (isValidRoomCode(trimmed)) return trimmed;
  const match = trimmed.match(/(?:^|\/)r\/([a-z0-9-]{14})(?:[/?#]|$)/);
  if (match?.[1] && isValidRoomCode(match[1])) return match[1];
  const loose = trimmed.match(/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}/);
  if (loose?.[0] && isValidRoomCode(loose[0])) return loose[0];
  return null;
}

export function roomUrl(code: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}/r/${code}`;
}
