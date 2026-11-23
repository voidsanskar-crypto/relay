/** 0 = not connected yet / unknown, 1 = poor, 2 = fair, 3 = good. */
export type Quality = 0 | 1 | 2 | 3;

export type LinkSample = {
  /** Round-trip time in milliseconds, if the browser reported it. */
  rttMs: number | null;
  /** Share of incoming packets lost since the previous sample, 0–100. */
  lossPct: number | null;
};

/** Turns one connection's state and latest stats into a 0–3 signal score. */
export function scoreConnection(state: RTCPeerConnectionState | undefined, sample: LinkSample | undefined): Quality {
  if (state === "failed" || state === "disconnected") return 1;
  if (state !== "connected") return 0;
  const rtt = sample?.rttMs ?? 0;
  const loss = sample?.lossPct ?? 0;
  if (rtt > 400 || loss > 8) return 1;
  if (rtt > 150 || loss > 2) return 2;
  return 3;
}

/** Your own signal: how the room link is doing, then the average of your connections to others. */
export function selfQuality(status: "connecting" | "live" | "error", remotes: Quality[]): Quality {
  if (status === "error") return 1;
  if (status === "connecting") return 0;
  const known = remotes.filter((q) => q > 0);
  if (!known.length) return 3;
  const avg = Math.round(known.reduce<number>((sum, q) => sum + q, 0) / known.length);
  return avg >= 3 ? 3 : avg === 2 ? 2 : 1;
}

export function qualityLabel(q: Quality): string {
  return q === 3 ? "Good connection" : q === 2 ? "Fair connection" : q === 1 ? "Poor connection" : "Connecting";
}

type Counters = { lost: number; received: number };

/** Reads round-trip time and fresh packet loss from a peer connection's stats report. */
export function readLinkSample(report: RTCStatsReport, previous: Counters | undefined): { sample: LinkSample; counters: Counters } {
  let rttSec: number | null = null;
  let lost = 0;
  let received = 0;
  let selectedPair: string | undefined;
  report.forEach((stat: Record<string, unknown>) => {
    if (stat["type"] === "transport" && typeof stat["selectedCandidatePairId"] === "string") {
      selectedPair = stat["selectedCandidatePairId"];
    }
  });
  report.forEach((stat: Record<string, unknown>) => {
    if (stat["type"] === "candidate-pair") {
      const isSelected = selectedPair ? stat["id"] === selectedPair : stat["nominated"] === true && stat["state"] === "succeeded";
      if (isSelected && typeof stat["currentRoundTripTime"] === "number") rttSec = stat["currentRoundTripTime"];
    }
    if (stat["type"] === "inbound-rtp") {
      lost += typeof stat["packetsLost"] === "number" ? stat["packetsLost"] : 0;
      received += typeof stat["packetsReceived"] === "number" ? stat["packetsReceived"] : 0;
    }
  });
  let lossPct: number | null = null;
  if (previous) {
    const dLost = Math.max(0, lost - previous.lost);
    const dReceived = Math.max(0, received - previous.received);
    if (dLost + dReceived > 0) lossPct = (dLost / (dLost + dReceived)) * 100;
  }
  return { sample: { rttMs: rttSec === null ? null : rttSec * 1000, lossPct }, counters: { lost, received } };
}
