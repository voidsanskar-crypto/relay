import { describe, expect, it } from "vitest";

import { extractRoomCode, generateRoomCode, isValidRoomCode } from "@/lib/room-code";

describe("room codes", () => {
  it("generates three groups of four unambiguous characters", () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(code).not.toMatch(/[01ilo]/);
  });

  it("generates a different code for every room", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateRoomCode()));
    expect(codes.size).toBe(500);
  });

  it("rejects short or guessable codes", () => {
    expect(isValidRoomCode("abcd-efgh")).toBe(false);
    expect(isValidRoomCode("abcd-efgh-jkm1")).toBe(false);
    expect(isValidRoomCode("abcd-efgh-jkmn")).toBe(true);
  });

  it("reads the room code out of a pasted meeting link", () => {
    expect(extractRoomCode("https://relay.example.com/r/abcd-efgh-jkmn?x=1")).toBe("abcd-efgh-jkmn");
    expect(extractRoomCode("  ABCD-EFGH-JKMN ")).toBe("abcd-efgh-jkmn");
    expect(extractRoomCode("https://relay.example.com/")).toBeNull();
  });
});
