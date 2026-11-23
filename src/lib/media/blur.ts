// Browser-only background blur. Loads the segmentation model lazily the first time it's used.
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

const TASKS_VERSION = "1.2.3";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

let segmenterPromise: Promise<ImageSegmenter> | null = null;

function loadSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const make = (delegate: "GPU" | "CPU") =>
        ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "VIDEO",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
      try {
        return await make("GPU");
      } catch {
        return await make("CPU");
      }
    })();
    segmenterPromise.catch(() => {
      segmenterPromise = null;
    });
  }
  return segmenterPromise;
}

export type BlurHandle = { track: MediaStreamTrack; stop: () => void };

export async function createBlurredTrack(source: MediaStreamTrack, strength = 14): Promise<BlurHandle> {
  const segmenter = await loadSegmenter();
  const settings = source.getSettings();
  const width = settings.width ?? 1280;
  const height = settings.height ?? 720;

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([source]);
  await video.play();

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d")!;

  const person = document.createElement("canvas");
  person.width = width;
  person.height = height;
  const pctx = person.getContext("2d")!;

  const mask = document.createElement("canvas");
  const mctx = mask.getContext("2d")!;

  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(width / 18));
  small.height = Math.max(1, Math.round(height / 18));
  const sctx = small.getContext("2d")!;

  const supportsFilter = typeof ctx.filter === "string";
  let running = true;
  let lastTime = -1;

  const drawBackground = () => {
    if (supportsFilter) {
      ctx.filter = `blur(${strength}px)`;
      ctx.drawImage(video, -strength, -strength, width + strength * 2, height + strength * 2);
      ctx.filter = "none";
    } else {
      sctx.drawImage(video, 0, 0, small.width, small.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(small, 0, 0, width, height);
    }
  };

  const frame = () => {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      try {
        segmenter.segmentForVideo(video, performance.now(), (result) => {
          const confidence = result.confidenceMasks?.[0];
          if (!confidence) return;
          const mw = confidence.width;
          const mh = confidence.height;
          if (mask.width !== mw || mask.height !== mh) {
            mask.width = mw;
            mask.height = mh;
          }
          const values = confidence.getAsFloat32Array();
          const img = mctx.createImageData(mw, mh);
          for (let i = 0; i < values.length; i++) {
            img.data[i * 4 + 3] = Math.min(255, Math.max(0, (values[i] ?? 0) * 320 - 40));
          }
          mctx.putImageData(img, 0, 0);

          drawBackground();
          pctx.globalCompositeOperation = "copy";
          pctx.drawImage(video, 0, 0, width, height);
          pctx.globalCompositeOperation = "destination-in";
          pctx.drawImage(mask, 0, 0, width, height);
          ctx.drawImage(person, 0, 0);
        });
      } catch (err) {
        console.warn("Blur frame failed", err);
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const stream = out.captureStream(30);
  const track = stream.getVideoTracks()[0]!;
  return {
    track,
    stop: () => {
      running = false;
      track.stop();
      video.pause();
      video.srcObject = null;
    },
  };
}
