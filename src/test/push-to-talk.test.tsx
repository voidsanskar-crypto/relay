import { act, render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { usePushToTalk } from "@/lib/media/use-push-to-talk";

function Harness({ startOn = false }: { startOn?: boolean }) {
  const [micOn, setMicOn] = useState(startOn);
  const holding = usePushToTalk({ muted: !micOn, enabled: true, setMicOn });
  return (
    <div>
      <output data-testid="mic">{micOn ? "on" : "off"}</output>
      <output data-testid="hud">{holding ? "shown" : "hidden"}</output>
      <input data-testid="chat" />
      <textarea data-testid="notes" />
      <div data-no-ptt>
        <canvas data-testid="board" tabIndex={0} />
      </div>
      <button type="button" data-testid="btn">
        Mute
      </button>
    </div>
  );
}

const press = (target: Element, type: "keydown" | "keyup") =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent(type, { code: "Space", key: " ", bubbles: true, cancelable: true }));
  });

describe("Space push-to-talk", () => {
  it("unmutes while Space is held and mutes again on release", () => {
    const { getByTestId } = render(<Harness />);
    press(getByTestId("btn"), "keydown");
    expect(getByTestId("mic").textContent).toBe("on");
    expect(getByTestId("hud").textContent).toBe("shown");
    press(getByTestId("btn"), "keyup");
    expect(getByTestId("mic").textContent).toBe("off");
    expect(getByTestId("hud").textContent).toBe("hidden");
  });

  it("does nothing while typing in a text box", () => {
    const { getByTestId } = render(<Harness />);
    press(getByTestId("chat"), "keydown");
    expect(getByTestId("mic").textContent).toBe("off");
    press(getByTestId("notes"), "keydown");
    expect(getByTestId("mic").textContent).toBe("off");
  });

  it("does nothing on the whiteboard", () => {
    const { getByTestId } = render(<Harness />);
    press(getByTestId("board"), "keydown");
    expect(getByTestId("mic").textContent).toBe("off");
  });

  it("leaves an already-unmuted mic alone", () => {
    const { getByTestId } = render(<Harness startOn />);
    press(getByTestId("btn"), "keydown");
    press(getByTestId("btn"), "keyup");
    expect(getByTestId("mic").textContent).toBe("on");
    expect(getByTestId("hud").textContent).toBe("hidden");
  });
});
