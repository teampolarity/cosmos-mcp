// Verifies decodeMessageText's three-tier priority chain:
//   1. m.text wins when non-empty (fast path for old SMS rows).
//   2. attributedBody decodes via NSKeyedArchiver typedstream.
//   3. Regex carve-out catches malformed blobs the proper parser can't read.

import { describe, it, expect } from "vitest";
import { decodeMessageText } from "../../../src/sources/imessage/chat-db.js";

describe("decodeMessageText", () => {
  it("returns m.text when it is non-empty", () => {
    expect(decodeMessageText("hey what's up", null)).toBe("hey what's up");
  });

  it("ignores empty m.text and falls through to attributedBody", () => {
    // Construct a minimal blob that the typedstream parser will fail on
    // but the regex carve-out should still extract from.
    const buf = Buffer.concat([
      Buffer.from([0x00, 0x01]),
      Buffer.from("NSString"),
      Buffer.from([0x00, 0x01, 0x2b, 0x10]),
      Buffer.from("hello from attributedbody"),
      Buffer.from([0x86, 0x84]),
    ]);
    expect(decodeMessageText("", buf)).toBe("hello from attributedbody");
  });

  it("returns undefined when both text and attributedBody are absent", () => {
    expect(decodeMessageText(null, null)).toBeUndefined();
    expect(decodeMessageText(undefined, undefined)).toBeUndefined();
    expect(decodeMessageText("", Buffer.alloc(0))).toBeUndefined();
  });

  it("returns undefined when attributedBody has no NSString marker", () => {
    expect(decodeMessageText(null, Buffer.from([0x01, 0x02, 0x03, 0x04]))).toBeUndefined();
  });
});
