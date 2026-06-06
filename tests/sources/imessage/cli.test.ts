import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cliSource = readFileSync(resolve(process.cwd(), "src/sources/imessage/cli.ts"), "utf8");

describe("imessage sync CLI media captioning contract", () => {
  it("runs captioning by default and keeps an explicit opt-out", () => {
    expect(cliSource).toContain('const caption = !rest.includes("--no-caption");');
    expect(cliSource).toContain("captioning iMessage photos and videos");
    expect(cliSource).toContain("captionImessageAttachments({");
    expect(cliSource).toContain("maxItems: null");
    expect(cliSource).toContain("--no-caption        skip automatic image/video captioning for this run");
  });
});
