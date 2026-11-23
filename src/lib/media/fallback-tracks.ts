// Placeholder tracks so every peer connection always negotiates one audio and one video line,
// even for people without a camera or microphone. Real tracks swap in later via replaceTrack.
// Each returns null when the browser can't build one; callers then add an empty transceiver.
export function createSilentAudioTrack(): MediaStreamTrack | null {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const dest = ctx.createMediaStreamDestination();
    const track = dest.stream.getAudioTracks()[0] ?? null;
    if (track) track.enabled = false;
    return track;
  } catch (err) {
    console.warn("Silent audio placeholder unavailable", err);
    return null;
  }
}

export function createBlankVideoTrack(width = 640, height = 360): MediaStreamTrack | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, width, height);
    }
    if (typeof canvas.captureStream !== "function") return null;
    return canvas.captureStream(1).getVideoTracks()[0] ?? null;
  } catch (err) {
    console.warn("Blank video placeholder unavailable", err);
    return null;
  }
}
