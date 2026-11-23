import { useCallback, useEffect, useRef, useState } from "react";

import type { Bus, Stroke, StrokeMeta } from "./bus";

/** Shared whiteboard strokes, kept in sync with everyone in the room. */
export function useSharedBoard(bus: Bus, selfId: string, onRemoteClear?: (name: string) => void) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const synced = useRef(false);
  const clearRef = useRef(onRemoteClear);
  clearRef.current = onRemoteClear;

  const appendPoints = useCallback((meta: StrokeMeta, points: number[]) => {
    setStrokes((prev) => {
      const idx = prev.findIndex((s) => s.id === meta.id);
      if (idx === -1) return [...prev, { ...meta, points: [...points] }];
      const next = prev.slice();
      const current = next[idx]!;
      next[idx] = { ...current, points: current.points.concat(points) };
      return next;
    });
  }, []);

  useEffect(() => {
    const unsubscribe = bus.subscribe((event) => {
      switch (event.type) {
        case "board-points":
          appendPoints(event.stroke, event.points);
          break;
        case "board-remove":
          setStrokes((prev) => prev.filter((s) => s.id !== event.id));
          break;
        case "board-clear":
          setStrokes([]);
          clearRef.current?.(event.name);
          break;
        case "board-sync-request":
          if (event.from !== selfId && strokesRef.current.length) {
            // Stagger replies so one person usually answers.
            setTimeout(() => {
              bus.send({ type: "board-sync", to: event.from, strokes: strokesRef.current });
            }, Math.random() * 400);
          }
          break;
        case "board-sync":
          if (event.to === selfId && !synced.current) {
            synced.current = true;
            setStrokes((prev) => {
              const known = new Set(prev.map((s) => s.id));
              return [...event.strokes.filter((s) => !known.has(s.id)), ...prev];
            });
          }
          break;
        default:
          break;
      }
    });
    const t = setTimeout(() => bus.send({ type: "board-sync-request", from: selfId }), 1200);
    return () => {
      unsubscribe();
      clearTimeout(t);
    };
  }, [bus, selfId, appendPoints]);

  const draw = useCallback(
    (meta: StrokeMeta, points: number[]) => {
      appendPoints(meta, points);
      bus.send({ type: "board-points", stroke: meta, points });
    },
    [appendPoints, bus],
  );

  const undo = useCallback(() => {
    const mine = [...strokesRef.current].reverse().find((s) => s.author === selfId);
    if (!mine) return;
    setStrokes((prev) => prev.filter((s) => s.id !== mine.id));
    bus.send({ type: "board-remove", id: mine.id });
  }, [bus, selfId]);

  const clear = useCallback(
    (name: string) => {
      setStrokes([]);
      bus.send({ type: "board-clear", from: selfId, name });
    },
    [bus, selfId],
  );

  return { strokes, draw, undo, clear };
}
