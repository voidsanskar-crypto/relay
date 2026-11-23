import { useEffect, useRef, useState } from "react";

/** True when Space should keep its normal meaning: typing, drawing, or picking from a menu. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox']")) return true;
  if (target.closest("[role='menu'], [role='listbox'], [role='dialog'], [data-no-ptt]")) return true;
  return false;
}

/**
 * Hold Space while muted to talk; release to mute again.
 * Returns whether Space is currently holding the mic open.
 */
export function usePushToTalk({
  muted,
  enabled,
  setMicOn,
}: {
  muted: boolean;
  enabled: boolean;
  setMicOn: (on: boolean) => void;
}) {
  const [holding, setHolding] = useState(false);
  const holdingRef = useRef(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const setMicRef = useRef(setMicOn);
  setMicRef.current = setMicOn;

  useEffect(() => {
    if (!enabled) return;
    const release = () => {
      if (!holdingRef.current) return;
      holdingRef.current = false;
      setHolding(false);
      setMicRef.current(false);
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (holdingRef.current) {
        e.preventDefault();
        return;
      }
      if (e.repeat || !mutedRef.current || isTypingTarget(e.target)) return;
      e.preventDefault();
      holdingRef.current = true;
      setHolding(true);
      setMicRef.current(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !holdingRef.current) return;
      // Stop a focused button from also "clicking" on release.
      e.preventDefault();
      release();
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") release();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onHidden);
      release();
    };
  }, [enabled]);

  return holding;
}
