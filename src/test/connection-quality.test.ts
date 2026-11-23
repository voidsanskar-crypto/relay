import { describe, expect, it } from "vitest";

import { readLinkSample, scoreConnection, selfQuality } from "@/lib/meeting/connection-quality";

describe("connection quality bars", () => {
  it("shows no bars while a connection is still being set up", () => {
    expect(scoreConnection("connecting", undefined)).toBe(0);
  });
  it("shows one bar when a connection has dropped", () => {
    expect(scoreConnection("disconnected", { rttMs: 50, lossPct: 0 })).toBe(1);
  });
  it("shows three bars for a fast, clean connection", () => {
    expect(scoreConnection("connected", { rttMs: 80, lossPct: 0.5 })).toBe(3);
  });
  it("drops to two bars for noticeable lag", () => {
    expect(scoreConnection("connected", { rttMs: 250, lossPct: 0 })).toBe(2);
  });
  it("drops to one bar for heavy packet loss", () => {
    expect(scoreConnection("connected", { rttMs: 60, lossPct: 12 })).toBe(1);
  });
  it("rates your own signal from the room link and your connections", () => {
    expect(selfQuality("error", [3])).toBe(1);
    expect(selfQuality("live", [])).toBe(3);
    expect(selfQuality("live", [3, 1])).toBe(2);
  });
  it("measures loss only from packets since the last check", () => {
    const report = new Map<string, Record<string, unknown>>([
      ["t", { id: "t", type: "transport", selectedCandidatePairId: "p" }],
      ["p", { id: "p", type: "candidate-pair", currentRoundTripTime: 0.12 }],
      ["in", { id: "in", type: "inbound-rtp", packetsLost: 15, packetsReceived: 1090 }],
    ]) as unknown as RTCStatsReport;
    const { sample } = readLinkSample(report, { lost: 5, received: 1000 });
    expect(sample.rttMs).toBe(120);
    expect(sample.lossPct).toBe(10);
  });
});
