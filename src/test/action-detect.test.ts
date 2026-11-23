import { describe, expect, it } from "vitest";

import { looksActionable, sameTask } from "@/lib/meeting/action-detect";

describe("spotting action items in the live transcript", () => {
  it("catches commitments", () => {
    expect(looksActionable("I'll send the project roadmap by Friday")).toBe(true);
    expect(looksActionable("We need to update the pricing page before launch")).toBe(true);
  });
  it("catches requests to someone", () => {
    expect(looksActionable("Can you share the deck with the design team")).toBe(true);
  });
  it("catches explicit action items and deadlines", () => {
    expect(looksActionable("Action item for Priya, the onboarding email")).toBe(true);
    expect(looksActionable("The draft contract is due by end of week")).toBe(true);
  });
  it("ignores small talk and filler", () => {
    expect(looksActionable("The weather has been really nice lately")).toBe(false);
    expect(looksActionable("Hmm let me think about that one")).toBe(false);
    expect(looksActionable("ok sure")).toBe(false);
  });
  it("treats the same task worded slightly differently as a duplicate", () => {
    expect(sameTask("Send the project roadmap", "send project roadmap!")).toBe(true);
    expect(sameTask("Send the project roadmap", "Book the venue")).toBe(false);
  });
});
