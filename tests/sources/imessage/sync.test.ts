import { describe, it, expect } from "vitest";
import { parseRetryAfterSec, syncImessage } from "../../../src/sources/imessage/sync.js";
import { defaultState } from "../../../src/sources/imessage/state.js";

describe("syncImessage", () => {
  it("parses d1 overload retry_after_sec", () => {
    expect(parseRetryAfterSec(503, JSON.stringify({
      error: "d1_overloaded: database busy — retry this thread in a minute",
      retry_after_sec: 60,
    }))).toBe(60);
    expect(parseRetryAfterSec(500, "nope")).toBeNull();
  });

  it("retries on 503 d1_overloaded then succeeds", async () => {
    const turns = [
      { turn_id: "imessage:m1", thread_id: "T1", from_handle: "+12025550100", occurred_at: "2026-05-17T08:00:00Z", participants: ["+12025550100", "self"] },
    ];
    let calls = 0;
    const sleeps: number[] = [];
    const result = await syncImessage({
      turns: (async function* () { yield turns; })(),
      state: defaultState(),
      apiBase: "https://cosmos.test",
      token: "tok",
      concurrency: 1,
      sleep: async (ms) => { sleeps.push(ms); },
      fetch: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(JSON.stringify({
            error: "d1_overloaded: database busy — retry this thread in a minute",
            retry_after_sec: 60,
          }), { status: 503 });
        }
        return new Response(JSON.stringify({
          persons_upserted: 1, threads_upserted: 1, turns_seen: 1, turns_skipped: 0, observations_created: 0,
        }), { status: 200 });
      },
    });
    expect(calls).toBe(2);
    expect(sleeps).toEqual([60_000]);
    expect(result.turns_seen).toBe(1);
  });

  it("groups turns by thread and posts each thread once, state-enriched", async () => {
    const turns = [
      { turn_id: "imessage:m1", thread_id: "T1", from_handle: "+12025550100", occurred_at: "2026-05-17T08:00:00Z", participants: ["+12025550100", "self"], participant_count: 4 },
      { turn_id: "imessage:m2", thread_id: "T1", from_handle: "self",          occurred_at: "2026-05-17T08:01:00Z", participants: ["+12025550100", "self"], participant_count: 4 },
      { turn_id: "imessage:m3", thread_id: "T2", from_handle: "+19175550199", occurred_at: "2026-05-17T08:02:00Z", participants: ["+19175550199", "self"] },
    ];
    const calls: any[] = [];
    const state = defaultState();
    state.handles["+12025550100"] = { name: "Theo", content_enabled: false };

    const result = await syncImessage({
      turns: (async function* () { yield turns; })(),
      state,
      apiBase: "https://cosmos.test",
      token: "tok",
      fetch: async (url: any, init: any) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({
          persons_upserted: 1, threads_upserted: 1, turns_seen: 2, turns_skipped: 0, observations_created: 0,
        }), { status: 200 });
      },
    });
    expect(calls.length).toBe(2);
    expect(calls[0].body.thread_id).toBe("T1");
    expect(calls[1].body.thread_id).toBe("T2");
    const theoParticipant = calls[0].body.participants.find((p: any) => p.handle === "+12025550100");
    expect(theoParticipant.name).toBe("Theo");
    expect(theoParticipant.is_self).toBe(false);
    const selfParticipant = calls[0].body.participants.find((p: any) => p.handle === "self");
    expect(selfParticipant.is_self).toBe(true);
    expect(calls[0].body.participant_count).toBe(4);
    expect(result.persons_upserted).toBe(2);
    expect(result.threads_upserted).toBe(2);
  });

  it("retries d1_overloaded 503 using retry_after_sec then succeeds", async () => {
    const turns = [
      { turn_id: "imessage:m1", thread_id: "T1", from_handle: "self", occurred_at: "2026-05-17T08:00:00Z", participants: ["self", "+16138646086"] },
    ];
    let hits = 0;
    const sleeps: number[] = [];
    const result = await syncImessage({
      turns: (async function* () { yield turns; })(),
      state: defaultState(),
      apiBase: "https://cosmos.test",
      token: "tok",
      sleep: async (ms) => { sleeps.push(ms); },
      fetch: async () => {
        hits += 1;
        if (hits === 1) {
          return new Response(JSON.stringify({
            error: "d1_overloaded: database busy — retry this thread in a minute",
            retry_after_sec: 60,
          }), { status: 503 });
        }
        return new Response(JSON.stringify({
          persons_upserted: 1, threads_upserted: 1, turns_seen: 1, turns_skipped: 0, observations_created: 0,
        }), { status: 200 });
      },
    });
    expect(hits).toBe(2);
    expect(sleeps).toEqual([60000]);
    expect(result.turns_seen).toBe(1);
  });
});
