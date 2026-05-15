import { z } from "zod";
import type { CosmosClient } from "../client/cosmos.js";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: unknown, client: CosmosClient) => Promise<unknown>;
}

const ChipEnum = z.enum(["next_30", "next_hour", "tonight", "tomorrow_night"]);

export const TOOLS: ToolDef[] = [
  {
    name: "polarity_whoami",
    description:
      "Returns the polarity user id and cosmos account info that this MCP key is bound to. Cheap connectivity test. Call this first if the user asks who you know them as.",
    inputSchema: z.object({}).strict(),
    handler: async (_input, client) => client.whoami(),
  },
  {
    name: "polarity_export",
    description:
      "Export the user's full personal knowledge graph (nodes + edges + counts) as JSON in polarity/v1 format. Use this when the user asks for a snapshot of their exocortex, wants their data, or asks to download their .polarity file. Returns the full graph; can be large.",
    inputSchema: z.object({}).strict(),
    handler: async (_input, client) => client.export(),
  },
  {
    name: "polarity_get_graph",
    description:
      "Read the user's graph view. `entity` selects which projection: 'user' (the user's self-graph), 'cosmos' (the cosmos entity's view of them), or 'polarity' (the dyadic synchronization between the two). Use 'user' for general questions about what the user thinks, does, or knows. Use 'polarity' when comparing the user's self-image against the system's observation.",
    inputSchema: z
      .object({
        entity: z.enum(["user", "cosmos", "polarity"]).optional(),
      })
      .strict(),
    handler: async (input, client) => {
      const { entity } = input as { entity?: "user" | "cosmos" | "polarity" };
      return client.getGraph(entity);
    },
  },
  {
    name: "polarity_ask",
    description:
      "Ask a natural-language question over the user's personal knowledge graph. Cosmos synthesizes an answer from relevant nodes and edges. Use this when the user wants context-aware reasoning rather than raw data. Returns answer text plus cited node/edge ids.",
    inputSchema: z
      .object({
        query: z.string().min(1).max(2000),
      })
      .strict(),
    handler: async (input, client) => {
      const { query } = input as { query: string };
      return client.ask(query);
    },
  },
  {
    name: "polarity_observe",
    description:
      "Write a freeform observation about the user into their personal graph. Cosmos runs its extractor on the text. Use this when you notice something durable about the user during a session that they would want their other AI agents to know later. Examples: stated preferences, recurring frustrations, project context, relationships. Do not log ephemeral chat content. `source` should identify your client (e.g. 'claude-code', 'cursor'). `kind` defaults to 'observation'; use 'event' for things that happened, 'preference' for stated likes/dislikes.",
    inputSchema: z
      .object({
        text: z.string().min(1).max(4000),
        source: z.string().max(64).optional(),
        tags: z.array(z.string().max(32)).max(8).optional(),
        kind: z.enum(["observation", "event", "preference"]).optional(),
        confidence: z.number().min(0).max(1).optional(),
      })
      .strict(),
    handler: async (input, client) => client.observe(input as Parameters<CosmosClient["observe"]>[0]),
  },
  {
    name: "polarity_record_event",
    description:
      "Record a structured event in the user's graph. Convenience wrapper over polarity_observe with kind='event'. Use for things that happened at a point in time: a meeting, a shipped release, a flight, an incident.",
    inputSchema: z
      .object({
        text: z.string().min(1).max(4000),
        source: z.string().max(64).optional(),
        tags: z.array(z.string().max(32)).max(8).optional(),
        confidence: z.number().min(0).max(1).optional(),
      })
      .strict(),
    handler: async (input, client) =>
      client.observe({ ...(input as { text: string }), kind: "event" }),
  },
  {
    name: "polarity_record_preference",
    description:
      "Record a stated preference in the user's graph. Convenience wrapper over polarity_observe with kind='preference'. Use when the user expresses a like, dislike, opinion, or working-style rule that should persist across sessions.",
    inputSchema: z
      .object({
        text: z.string().min(1).max(4000),
        source: z.string().max(64).optional(),
        tags: z.array(z.string().max(32)).max(8).optional(),
        confidence: z.number().min(0).max(1).optional(),
      })
      .strict(),
    handler: async (input, client) =>
      client.observe({ ...(input as { text: string }), kind: "preference" }),
  },
  {
    name: "polarity_dump",
    description:
      "Write a short message tied to a location waypoint into the user's graph. PolarityGPS-style. Use only when the user is explicitly recording a place-anchored thought.",
    inputSchema: z
      .object({
        waypoint_id: z.string().min(1).max(128),
        name: z.string().min(1).max(128),
        lat: z.number().optional(),
        lon: z.number().optional(),
        message: z.string().min(1).max(500),
      })
      .strict(),
    handler: async (input, client) => client.dump(input as Parameters<CosmosClient["dump"]>[0]),
  },
  {
    name: "polarity_checkin",
    description:
      "Record that the user checked in at a waypoint. Triggers co-presence detection against other users' recent check-ins.",
    inputSchema: z
      .object({
        waypoint_id: z.string().min(1).max(128),
        name: z.string().min(1).max(128),
        lat: z.number().optional(),
        lon: z.number().optional(),
        occurred_at: z.string().datetime().optional(),
      })
      .strict(),
    handler: async (input, client) => client.checkin(input as Parameters<CosmosClient["checkin"]>[0]),
  },
  {
    name: "polarity_declare",
    description:
      "Declare future presence at a waypoint. `chip` is the time-window enum: next_30, next_hour, tonight, tomorrow_night.",
    inputSchema: z
      .object({
        waypoint_id: z.string().min(1).max(128),
        name: z.string().min(1).max(128),
        lat: z.number().optional(),
        lon: z.number().optional(),
        starts_at: z.string().datetime(),
        ends_at: z.string().datetime(),
        chip: ChipEnum,
      })
      .strict(),
    handler: async (input, client) =>
      client.declare(input as Parameters<CosmosClient["declare"]>[0]),
  },
];

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
