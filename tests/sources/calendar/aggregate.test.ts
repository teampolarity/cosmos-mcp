// aggregate() collapses the raw event list into one row per (summary,
// calendar) pair. The dedupe + attendee-union logic is what keeps a
// recurring standup from landing as 48 separate nodes.

import { describe, it, expect } from "vitest";
import {
  aggregate,
  dedupeAttendees,
  type Attendee,
  type NormalizedEvent,
} from "../../../src/sources/calendar/cli.js";

function evt(overrides: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    summary: overrides.summary ?? "Standup",
    calendar: overrides.calendar ?? "Work",
    start: overrides.start ?? "2026-05-20T15:00:00.000Z",
    has_attendees: overrides.has_attendees ?? false,
    has_recurrences: overrides.has_recurrences ?? false,
    attendees: overrides.attendees ?? [],
  };
}

describe("aggregate", () => {
  it("collapses repeated (summary, calendar) into one row with running first/last", () => {
    const out = aggregate([
      evt({ start: "2026-05-20T15:00:00.000Z" }),
      evt({ start: "2026-05-21T15:00:00.000Z" }),
      evt({ start: "2026-05-22T15:00:00.000Z" }),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].count).toBe(3);
    expect(out[0].first_at).toBe("2026-05-20T15:00:00.000Z");
    expect(out[0].last_at).toBe("2026-05-22T15:00:00.000Z");
  });

  it("treats summary case-insensitively when grouping", () => {
    const out = aggregate([
      evt({ summary: "Standup" }),
      evt({ summary: "STANDUP" }),
      evt({ summary: "  standup  " }),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].count).toBe(3);
  });

  it("keeps different calendars separate even with the same summary", () => {
    const out = aggregate([
      evt({ summary: "1:1", calendar: "Work" }),
      evt({ summary: "1:1", calendar: "Personal" }),
    ]);
    expect(out.length).toBe(2);
  });

  it("drops noise calendars (holidays, birthdays, Siri found events)", () => {
    const out = aggregate([
      evt({ summary: "Eid", calendar: "Religious Holidays" }),
      evt({ summary: "Thanksgiving", calendar: "US Holidays" }),
      evt({ summary: "Real event", calendar: "Work" }),
      evt({ summary: "Mom", calendar: "Facebook Birthdays" }),
      evt({ summary: "Siri-found brunch", calendar: "Siri Found Events" }),
    ]);
    expect(out.map((r) => r.summary)).toEqual(["Real event"]);
  });

  it("drops Birthday:/Anniversary: prefixed summaries even on non-noise calendars", () => {
    const out = aggregate([
      evt({ summary: "Birthday: Alice", calendar: "Work" }),
      evt({ summary: "Anniversary: Bob", calendar: "Work" }),
      evt({ summary: "Real meeting", calendar: "Work" }),
    ]);
    expect(out.map((r) => r.summary)).toEqual(["Real meeting"]);
  });

  it("unions and dedupes attendees across occurrences", () => {
    const alice: Attendee = { name: "Alice", email: "alice@example.com" };
    const bob: Attendee = { name: "Bob", email: "bob@example.com" };
    const out = aggregate([
      evt({ attendees: [alice], has_attendees: true }),
      evt({ attendees: [alice, bob], has_attendees: true }),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].attendees.length).toBe(2);
    expect(out[0].has_attendees).toBe(true);
  });

  it("results sorted by last_at descending", () => {
    const out = aggregate([
      evt({ summary: "Older", start: "2026-05-01T00:00:00.000Z" }),
      evt({ summary: "Newer", start: "2026-05-22T00:00:00.000Z" }),
      evt({ summary: "Middle", start: "2026-05-10T00:00:00.000Z" }),
    ]);
    expect(out.map((r) => r.summary)).toEqual(["Newer", "Middle", "Older"]);
  });

  it("drops events with empty summaries", () => {
    const out = aggregate([
      evt({ summary: "", calendar: "Work" }),
      evt({ summary: "   ", calendar: "Work" }),
      evt({ summary: "Real", calendar: "Work" }),
    ]);
    expect(out.map((r) => r.summary)).toEqual(["Real"]);
  });

  it("has_attendees / has_recurrences are OR-ed across occurrences", () => {
    const out = aggregate([
      evt({ has_attendees: false, has_recurrences: false }),
      evt({ has_attendees: true, has_recurrences: false }),
      evt({ has_attendees: false, has_recurrences: true }),
    ]);
    expect(out[0].has_attendees).toBe(true);
    expect(out[0].has_recurrences).toBe(true);
  });
});

describe("dedupeAttendees", () => {
  it("dedupes by lowercased email", () => {
    const out = dedupeAttendees([
      { name: "Alice", email: "ALICE@example.com" },
      { name: "Alice", email: "alice@example.com" },
    ]);
    expect(out.length).toBe(1);
  });

  it("falls back to name when email is missing", () => {
    const out = dedupeAttendees([
      { name: "Alice", email: null },
      { name: "alice", email: null },
      { name: "Alice", email: null },
    ]);
    expect(out.length).toBe(1);
  });

  it("drops entries with neither name nor email", () => {
    const out = dedupeAttendees([
      { name: null, email: null },
      { name: "Real", email: null },
    ]);
    expect(out.map((a) => a.name)).toEqual(["Real"]);
  });

  it("caps the list at 25 attendees", () => {
    const all: Attendee[] = Array.from({ length: 50 }, (_, i) => ({
      name: `Person ${i}`,
      email: `p${i}@example.com`,
    }));
    expect(dedupeAttendees(all).length).toBe(25);
  });
});
