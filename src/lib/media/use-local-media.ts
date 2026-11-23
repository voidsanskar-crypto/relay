import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createBlurredTrack, type BlurHandle } from "./blur";

export type DeviceLists = {
  audioinput: MediaDeviceInfo[];
  videoinput: MediaDeviceInfo[];
  audiooutput: MediaDeviceInfo[];
};

const PREFS_KEY = "relay:media-prefs";
type Prefs = { audioId?: string | undefined; videoId?: string | undefined; outputId?: string | undefined; blur?: boolean };

function readPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Prefs;
  } catch {
    return {};
  }
}
function writePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

export type LocalMedia = ReturnType<typeof useLocalMedia>;

export function useLocalMedia() {
  const [audioTrack, setAudioTrack] = useState<MediaStreamTrack | null>(null);
  const [cameraTrack, setCameraTrack] = useState<MediaStreamTrack | null>(null);
  const [devices, setDevices] = useState<DeviceLists>({ audioinput: [], videoinput: [], audiooutput: [] });
  const [audioId, setAudioId] = useState<string | undefined>();
  const [videoId, setVideoId] = useState<string | undefined>();
  const [outputId, setOutputId] = useState<string | undefined>();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [blurOn, setBlurOn] = useState(false);
  const [blurState, setBlurState] = useState<"off" | "loading" | "on" | "error">("off");
  const [blurTrack, setBlurTrack] = useState<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const tracksRef = useRef<{ audio: MediaStreamTrack | null; video: MediaStreamTrack | null }>({
    audio: null,
    video: null,
  });

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const list = await navigator.mediaDevices.enumerateDevices();
    setDevices({
      audioinput: list.filter((d) => d.kind === "audioinput" && d.deviceId),
      videoinput: list.filter((d) => d.kind === "videoinput" && d.deviceId),
      audiooutput: list.filter((d) => d.kind === "audiooutput" && d.deviceId),
    });
  }, []);

  const acquire = useCallback(
    async (kind: "audio" | "video" | "both", ids: { audioId?: string | undefined; videoId?: string | undefined }) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't access a camera or microphone.");
        return;
      }
      const wantAudio = kind !== "video";
      const wantVideo = kind !== "audio";
      const audio: MediaTrackConstraints | false = wantAudio
        ? { ...(ids.audioId ? { deviceId: { exact: ids.audioId } } : {}), echoCancellation: true, noiseSuppression: true }
        : false;
      const video: MediaTrackConstraints | false = wantVideo
        ? {
            ...(ids.videoId ? { deviceId: { exact: ids.videoId } } : {}),
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : false;

      const attempt = async (a: typeof audio, v: typeof video) =>
        navigator.mediaDevices.getUserMedia({ audio: a, video: v });

      let stream: MediaStream | null = null;
      let problem: string | null = null;
      try {
        stream = await attempt(audio, video);
      } catch (err) {
        // Fall back to whichever device works on its own.
        if (wantAudio && wantVideo) {
          try {
            stream = await attempt(audio, false);
            problem = "We couldn't reach your camera. You can still join with audio.";
          } catch {
            try {
              stream = await attempt(false, video);
              problem = "We couldn't reach your microphone. You can still join with video.";
            } catch {
              problem = describeMediaError(err);
            }
          }
        } else {
          problem = describeMediaError(err);
        }
      }
      setError(problem);
      if (!stream) return;

      const newAudio = stream.getAudioTracks()[0] ?? null;
      const newVideo = stream.getVideoTracks()[0] ?? null;
      if (newAudio) {
        tracksRef.current.audio?.stop();
        tracksRef.current.audio = newAudio;
        setAudioTrack(newAudio);
        setAudioId(newAudio.getSettings().deviceId);
      }
      if (newVideo) {
        tracksRef.current.video?.stop();
        tracksRef.current.video = newVideo;
        setCameraTrack(newVideo);
        setVideoId(newVideo.getSettings().deviceId);
      }
      await refreshDevices();
    },
    [refreshDevices],
  );

  // Initial acquisition.
  useEffect(() => {
    const prefs = readPrefs();
    setOutputId(prefs.outputId);
    setBlurOn(!!prefs.blur);
    acquire("both", { audioId: prefs.audioId, videoId: prefs.videoId }).finally(() => setReady(true));
    const onChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
      tracksRef.current.audio?.stop();
      tracksRef.current.video?.stop();
    };
  }, [acquire, refreshDevices]);

  useEffect(() => {
    if (audioTrack) audioTrack.enabled = micOn;
  }, [audioTrack, micOn]);

  // Background blur pipeline.
  useEffect(() => {
    if (!blurOn || !cameraTrack) {
      setBlurTrack(null);
      setBlurState("off");
      return;
    }
    let cancelled = false;
    let handle: BlurHandle | null = null;
    setBlurState("loading");
    createBlurredTrack(cameraTrack)
      .then((h) => {
        if (cancelled) {
          h.stop();
          return;
        }
        handle = h;
        setBlurTrack(h.track);
        setBlurState("on");
      })
      .catch((err) => {
        console.error("Background blur failed", err);
        if (!cancelled) setBlurState("error");
      });
    return () => {
      cancelled = true;
      handle?.stop();
    };
  }, [blurOn, cameraTrack]);

  const videoTrack = blurOn && blurTrack ? blurTrack : cameraTrack;

  useEffect(() => {
    if (videoTrack) videoTrack.enabled = camOn;
    if (cameraTrack && cameraTrack !== videoTrack) cameraTrack.enabled = camOn;
  }, [videoTrack, cameraTrack, camOn]);

  useEffect(() => {
    if (!ready) return;
    writePrefs({ audioId, videoId, outputId, blur: blurOn });
  }, [ready, audioId, videoId, outputId, blurOn]);

  const selectAudio = useCallback((id: string) => void acquire("audio", { audioId: id }), [acquire]);
  const selectVideo = useCallback((id: string) => void acquire("video", { videoId: id }), [acquire]);
  const retry = useCallback(() => void acquire("both", { audioId, videoId }), [acquire, audioId, videoId]);

  const previewStream = useMemo(() => (videoTrack ? new MediaStream([videoTrack]) : null), [videoTrack]);

  const stopAll = useCallback(() => {
    tracksRef.current.audio?.stop();
    tracksRef.current.video?.stop();
    blurTrack?.stop();
  }, [blurTrack]);

  return {
    ready,
    error,
    devices,
    audioTrack,
    cameraTrack,
    videoTrack,
    previewStream,
    audioId,
    videoId,
    outputId,
    selectAudio,
    selectVideo,
    setOutputId,
    micOn,
    setMicOn,
    camOn,
    setCamOn,
    blurOn,
    setBlurOn,
    blurState,
    retry,
    stopAll,
  };
}

function describeMediaError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return "Camera and microphone access is blocked. Allow access in your browser to be seen and heard.";
  if (name === "NotFoundError") return "No camera or microphone was found.";
  if (name === "NotReadableError") return "Your camera or microphone is being used by another app.";
  return "We couldn't start your camera or microphone.";
}
