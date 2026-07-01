// Filter rules are the data-quality gate for browser sync: anything that
// slips through clutters the graph with feed reloads, OAuth callbacks,
// and inbox refreshes. Exercise the rules end-to-end through
// dedupeAndFilter so future rule-file edits get a visible diff.

import { describe, it, expect } from "vitest";
import { dedupeAndFilter, normalizeUrl } from "../../../src/sources/browser/filter.js";
import type { BrowserPage } from "../../../src/sources/browser/readers.js";

function page(overrides: Partial<BrowserPage> & Pick<BrowserPage, "url">): BrowserPage {
  let hostname = overrides.hostname;
  if (!hostname) {
    try { hostname = new URL(overrides.url).hostname; } catch { hostname = ""; }
  }
  return {
    url: overrides.url,
    title: overrides.title ?? "A reasonably long article title",
    visit_count: overrides.visit_count ?? 1,
    last_visit: overrides.last_visit ?? "2026-05-20T10:00:00.000Z",
    source: overrides.source ?? "zen",
    hostname,
  };
}

describe("normalizeUrl", () => {
  it("collapses /u/N/ Google Docs paths and any post-id suffix to one canonical form", () => {
    expect(normalizeUrl("https://docs.google.com/u/0/document/d/abc/edit"))
      .toBe("https://docs.google.com/document/d/abc/");
    expect(normalizeUrl("https://docs.google.com/u/2/document/d/abc/edit"))
      .toBe("https://docs.google.com/document/d/abc/");
    expect(normalizeUrl("https://docs.google.com/document/d/abc/edit?usp=share"))
      .toBe("https://docs.google.com/document/d/abc/");
  });

  it("normalizes Drive file URLs to /file/d/<id>/view regardless of /u/N/", () => {
    expect(normalizeUrl("https://drive.google.com/u/0/file/d/xyz/view?usp=foo"))
      .toBe("https://drive.google.com/file/d/xyz/view");
  });

  it("leaves URLs without a normalize-rule match unchanged", () => {
    const url = "https://www.example.com/articles/2026/hello?ref=feed";
    expect(normalizeUrl(url)).toBe(url);
  });
});

describe("dedupeAndFilter", () => {
  it("drops pages whose title is shorter than the min length", () => {
    const out = dedupeAndFilter([
      page({ url: "https://example.com/a", title: "Hi" }),
      page({ url: "https://example.com/b", title: "Long enough title here" }),
    ]);
    expect(out.map((p) => p.url)).toEqual(["https://example.com/b"]);
  });

  it("drops navigational LinkedIn feed reloads but keeps a real post", () => {
    const out = dedupeAndFilter([
      page({ url: "https://www.linkedin.com/feed/", title: "LinkedIn" }),
      page({
        url: "https://www.linkedin.com/posts/someone_topic-activity-123",
        title: "Read this take on AI agents",
      }),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].url).toContain("/posts/");
  });

  it("collapses /u/0/ and /u/2/ visits to the same Google Sheet into one row", () => {
    const out = dedupeAndFilter([
      page({
        url: "https://docs.google.com/u/0/spreadsheets/d/abc/edit",
        title: "Q2 forecast spreadsheet",
        visit_count: 3,
        last_visit: "2026-05-20T09:00:00.000Z",
      }),
      page({
        url: "https://docs.google.com/u/2/spreadsheets/d/abc/edit",
        title: "Q2 forecast spreadsheet",
        visit_count: 11,
        last_visit: "2026-05-22T12:00:00.000Z",
      }),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].visit_count).toBe(11);
    expect(out[0].last_visit).toBe("2026-05-22T12:00:00.000Z");
    expect(out[0].url).toBe("https://docs.google.com/spreadsheets/d/abc/");
  });

  it("merges duplicate visits across browsers, keeping the latest visit's source", () => {
    const out = dedupeAndFilter([
      page({
        url: "https://example.com/article",
        title: "A reasonable article title",
        source: "zen",
        visit_count: 1,
        last_visit: "2026-05-01T00:00:00.000Z",
      }),
      page({
        url: "https://example.com/article",
        title: "A reasonable article title",
        source: "safari",
        visit_count: 4,
        last_visit: "2026-05-22T00:00:00.000Z",
      }),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].source).toBe("safari");
    expect(out[0].visit_count).toBe(4);
  });

  it("returns results sorted by last_visit descending", () => {
    const out = dedupeAndFilter([
      page({ url: "https://example.com/older", last_visit: "2026-05-01T00:00:00.000Z" }),
      page({ url: "https://example.com/newer", last_visit: "2026-05-22T00:00:00.000Z" }),
      page({ url: "https://example.com/middle", last_visit: "2026-05-10T00:00:00.000Z" }),
    ]);
    expect(out.map((p) => p.url)).toEqual([
      "https://example.com/newer",
      "https://example.com/middle",
      "https://example.com/older",
    ]);
  });

  it("drops invalid URLs without crashing", () => {
    const out = dedupeAndFilter([
      page({ url: "not://a valid url like this" }),
      page({ url: "https://example.com/real" }),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].url).toBe("https://example.com/real");
  });

  it("when a duplicate URL has a longer title, the longer title wins", () => {
    const out = dedupeAndFilter([
      page({
        url: "https://example.com/x",
        title: "Short title that passes min",
        last_visit: "2026-05-22T00:00:00.000Z",
      }),
      page({
        url: "https://example.com/x",
        title: "A much longer and more descriptive title here",
        last_visit: "2026-05-23T00:00:00.000Z",
      }),
    ]);
    expect(out[0].title).toBe("A much longer and more descriptive title here");
  });
});
