import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatPanel } from "@/components/relay/ChatPanel";

// Recent Chrome returns a Promise from scrollIntoView. If a panel's effect hands that value back
// to React, React treats it as a cleanup and the whole meeting page crashes on re-render/unmount.
describe("meeting panels auto-scroll", () => {
  const original = Element.prototype.scrollIntoView;
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn(() => Promise.resolve()) as unknown as typeof original;
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  it("chat panel survives new messages and unmount when scrollIntoView returns a Promise", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = render(<ChatPanel messages={[]} selfId="me" selfName="Ankit" onSend={() => undefined} />);
    view.rerender(
      <ChatPanel
        messages={[{ id: "1", sender: "Guest", senderId: "g", body: "hi", sentAt: new Date().toISOString() }]}
        selfId="me"
        selfName="Ankit"
        onSend={() => undefined}
      />,
    );
    expect(() => view.unmount()).not.toThrow();
    const effectWarnings = errors.mock.calls.filter((args) => String(args[0]).includes("must not return anything"));
    expect(effectWarnings).toHaveLength(0);
    errors.mockRestore();
  });
});
