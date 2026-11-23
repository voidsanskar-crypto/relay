// Cheap first pass over a finished transcript line: only lines that sound like a task or
// commitment are sent to the AI to be turned into an action item.

const FILLER =
  /\b(let me (think|see|check that)|let's see|i'll be honest|i will say|we'll see|i'm going to be honest|you know what i mean)\b/gi;

const STRONG = [
  /\baction items?\b/i,
  /\bto-?dos?\b/i,
  /\bfollow[- ]?up\b/i,
  /\bdeadline\b/i,
  /\bremind (me|us|them|everyone)\b/i,
  /\bby (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|end of (the )?(day|week|month)|eod|eow|next (week|month))\b/i,
];

const COMMITMENT =
  /\b(i'll|i will|i'm going to|i am going to|i can take|we'll|we will|we need to|we should|we have to|let's|you'll|can you|could you|would you|please|make sure|someone needs to|needs? to)\s+\w+/i;

export function looksActionable(text: string): boolean {
  const cleaned = text.replace(FILLER, " ").replace(/\s+/g, " ").trim();
  if (cleaned.split(" ").length < 4) return false;
  return STRONG.some((r) => r.test(cleaned)) || COMMITMENT.test(cleaned);
}

/** Same task said twice ("Send the roadmap" / "send roadmap!") shouldn't pop up twice. */
export function sameTask(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\b(the|a|an|to|our|my)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return norm(a) === norm(b);
}
