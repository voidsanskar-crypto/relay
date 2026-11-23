import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, Eraser, Highlighter, Pen, Trash2, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Stroke, StrokeMeta, StrokeTool } from "@/lib/meeting/bus";
import { cn } from "@/lib/utils";

type BoardStyle = "white" | "black";

// Colors are stored as palette slots so a stroke reads well on either board style.
const PALETTE: Record<BoardStyle, string[]> = {
  white: ["#0f172a", "#e0532f", "#2563eb", "#059669", "#c2780a"],
  black: ["#f4f0e6", "#ff8a65", "#86c8ff", "#9be39b", "#ffd166"],
};
const BOARD_FILL = { white: "#fbfbf4", black: "#10231e" };
const COLOR_NAMES = ["Neutral", "Coral", "Blue", "Mint", "Amber"];
const WEIGHTS = ["Fine", "Medium", "Bold"];
const SIZES = [3, 6, 12];

function renderStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number, style: BoardStyle) {
  for (const s of strokes) {
    const pts = s.points;
    if (pts.length < 2) continue;
    ctx.save();
    const base = (s.size / 1000) * w;
    if (s.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = base * 4;
      ctx.strokeStyle = "#000";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = PALETTE[style][Number(s.color)] ?? PALETTE[style][0]!;
      ctx.lineWidth = s.tool === "marker" ? base * 3 : base;
      ctx.globalAlpha = s.tool === "marker" ? 0.35 : 1;
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const x0 = pts[0]! * w;
    const y0 = pts[1]! * h;
    ctx.moveTo(x0, y0);
    if (pts.length === 2) {
      ctx.lineTo(x0 + 0.01, y0 + 0.01);
    }
    for (let i = 2; i < pts.length - 2; i += 2) {
      const cx = pts[i]! * w;
      const cy = pts[i + 1]! * h;
      const nx = (pts[i]! + pts[i + 2]!) / 2;
      const ny = (pts[i + 1]! + pts[i + 3]!) / 2;
      ctx.quadraticCurveTo(cx, cy, nx * w, ny * h);
    }
    if (pts.length >= 4) ctx.lineTo(pts[pts.length - 2]! * w, pts[pts.length - 1]! * h);
    ctx.stroke();
    ctx.restore();
  }
}

// The ink is transparent while it is drawn so erasing reveals the same grid in the room and in a PNG.
function paintBoard(ctx: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number, style: BoardStyle) {
  ctx.clearRect(0, 0, w, h);
  renderStrokes(ctx, strokes, w, h, style);
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  if (style === "black") {
    ctx.lineWidth = w / 1550;
    ctx.strokeStyle = "#294038";
    ctx.beginPath();
    for (let col = 1; col < 48; col++) {
      const x = (col * w) / 48;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let row = 1; row < 27; row++) {
      const y = (row * h) / 27;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = BOARD_FILL[style];
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function Whiteboard({
  strokes,
  selfId,
  onDraw,
  onUndo,
  onClear,
  onClose,
}: {
  strokes: Stroke[];
  selfId: string;
  onDraw: (meta: StrokeMeta, points: number[]) => void;
  onUndo: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tool, setTool] = useState<StrokeTool>("pen");
  const [color, setColor] = useState(0);
  const [weight, setWeight] = useState(1);
  const [style, setStyle] = useState<BoardStyle>("black");
  const drawing = useRef<{ pointerId: number; meta: StrokeMeta; pending: number[]; timer: ReturnType<typeof setInterval> } | null>(null);

  // Keep the board at 16:9 inside its container so coordinates match for everyone.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      const w = Math.min(width, (height * 16) / 9);
      setSize({ w: Math.floor(w), h: Math.floor((w * 9) / 16) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(size.w * dpr);
    const height = Math.round(size.h * dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintBoard(ctx, strokes, size.w, size.h, style);
  }, [strokes, size, style]);

  const flush = useCallback(() => {
    const d = drawing.current;
    if (!d || d.pending.length === 0) return;
    const pts = d.pending;
    d.pending = [];
    onDraw(d.meta, pts);
  }, [onDraw]);

  useEffect(() => () => {
    if (drawing.current) {
      clearInterval(drawing.current.timer);
      flush();
      drawing.current = null;
    }
  }, [flush]);

  const pointFrom = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [
      Math.round(((e.clientX - rect.left) / rect.width) * 10000) / 10000,
      Math.round(((e.clientY - rect.top) / rect.height) * 10000) / 10000,
    ] as const;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || drawing.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const [x, y] = pointFrom(e);
    const meta: StrokeMeta = {
      id: crypto.randomUUID(),
      author: selfId,
      tool,
      color: String(color),
      size: SIZES[weight]!,
    };
    drawing.current = { pointerId: e.pointerId, meta, pending: [x, y], timer: setInterval(flush, 45) };
    flush();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drawing.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const [x, y] = pointFrom(e);
    d.pending.push(x, y);
  };
  const endStroke = (e: React.PointerEvent) => {
    const d = drawing.current;
    if (!d || d.pointerId !== e.pointerId) return;
    clearInterval(d.timer);
    flush();
    drawing.current = null;
  };

  const exportPng = () => {
    const w = 1920;
    const h = 1080;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    paintBoard(c.getContext("2d")!, strokes, w, h, style);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `relay-board-${new Date().toISOString().slice(0, 16).replace(":", "")}.png`;
    a.click();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-no-ptt>
      <div className="board-toolbar" role="group" aria-label="Drawing controls">
        <div className="flex items-center gap-1" role="group" aria-label="Tool">
          <ToolButton active={tool === "pen"} onClick={() => setTool("pen")} label="Pen">
            <Pen />
          </ToolButton>
          <ToolButton active={tool === "marker"} onClick={() => setTool("marker")} label="Highlighter">
            <Highlighter />
          </ToolButton>
          <ToolButton active={tool === "eraser"} onClick={() => setTool("eraser")} label="Eraser">
            <Eraser />
          </ToolButton>
        </div>
        <span aria-hidden="true" className="board-divider" />
        <div className="flex items-center gap-1.5" role="group" aria-label="Color">
          {PALETTE[style].map((c, i) => (
            <button
              key={c}
              type="button"
              aria-label={COLOR_NAMES[i]}
              title={COLOR_NAMES[i]}
              aria-pressed={color === i && tool !== "eraser"}
              onClick={() => {
                setColor(i);
                if (tool === "eraser") setTool("pen");
              }}
              className="board-swatch"
            >
              <span style={{ backgroundColor: c, color: style === "black" ? "#12251e" : "#fff" }}>
                {color === i && tool !== "eraser" && <Check size={14} strokeWidth={3} />}
              </span>
            </button>
          ))}
        </div>
        <span aria-hidden="true" className="board-divider" />
        <div className="flex items-center gap-1" role="group" aria-label="Thickness">
          {SIZES.map((s, i) => (
            <ToolButton key={s} active={weight === i} onClick={() => setWeight(i)} label={`${WEIGHTS[i]} stroke`}>
              <span className="rounded-full bg-current" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
            </ToolButton>
          ))}
        </div>
        <span aria-hidden="true" className="board-divider" />
        <div role="group" aria-label="Board surface" className="board-surfaces">
          {(["white", "black"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={style === s}
              onClick={() => setStyle(s)}
              className={cn(
                "rounded-md px-2.5 py-1 transition-colors",
                style === s ? "bg-background text-foreground" : "text-muted-foreground",
              )}
            >
              {s === "white" ? "Paper" : "Dark grid"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onUndo} title="Undo my last stroke">
            <Undo2 /> Undo
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear} title="Clear the board for everyone">
            <Trash2 /> Clear
          </Button>
          <Button size="sm" variant="ghost" onClick={exportPng} title="Download as image" aria-label="Download as image">
            <Download />
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close board">
            <X />
          </Button>
        </div>
      </div>
      <div ref={wrapRef} className="flex min-h-0 flex-1 items-center justify-center">
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-border shadow-dock",
            style === "white" ? "bg-board-light" : "bg-board-dark",
          )}
          style={{ width: size.w, height: size.h }}
        >
          <canvas
            ref={canvasRef}
            tabIndex={-1}
            className={cn("absolute inset-0 h-full w-full touch-none outline-none", tool === "eraser" ? "cursor-cell" : "cursor-crosshair")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onLostPointerCapture={endStroke}
            aria-label="Shared whiteboard"
          />
          {strokes.length === 0 && (
            <p
              className={cn(
                "pointer-events-none absolute inset-0 flex items-center justify-center text-sm",
                style === "white" ? "text-foreground/70" : "text-board-light/75",
              )}
            >
              Draw anywhere — everyone in the room sees it live
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className="board-tool"
    >
      {children}
    </button>
  );
}
