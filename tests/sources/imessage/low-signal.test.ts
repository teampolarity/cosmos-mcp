import { describe, it, expect } from "vitest";
import { isLowSignalMessage, isTapbackOrReactionMessage } from "../../../src/sources/imessage/low-signal.js";

describe("imessage low-signal", () => {
  it("rejects English tapbacks", () => {
    expect(isTapbackOrReactionMessage('Loved "see you tomorrow"')).toBe(true);
    expect(isTapbackOrReactionMessage("Emphasized « hello »")).toBe(true);
  });

  it("rejects French emphasize tapbacks", () => {
    const fr = "A ajouté des points d'exclamation à « if you favor convenience over reality »";
    expect(isTapbackOrReactionMessage(fr)).toBe(true);
    expect(isLowSignalMessage(fr)).toBe(true);
  });

  it("keeps substantive lines", () => {
    expect(isLowSignalMessage("still on the computer sorry, will look in the morning")).toBe(false);
  });
});
