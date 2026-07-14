import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { SETTINGS_HTML } from "../../src/settings/page.js";

describe("settings page", () => {
  it("ships an inline script that parses before source controls initialize", () => {
    const script = SETTINGS_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];

    expect(script).toBeTruthy();
    expect(() => new vm.Script(script, { filename: "settings-inline.js" })).not.toThrow();
  });
});
