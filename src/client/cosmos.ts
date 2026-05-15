import type { Config } from "../config.js";

export interface CosmosRequestInit {
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  path: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
}

export class CosmosError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: unknown,
  ) {
    super(`Cosmos ${status} on ${path}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
}

export class CosmosClient {
  constructor(private readonly config: Config) {}

  async request<T = unknown>({ method = "GET", path, body, query }: CosmosRequestInit): Promise<T> {
    const url = new URL(path, this.config.cosmosUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {
      "X-Polarity-User-Id": this.config.polarityUserId,
      "Content-Type": "application/json",
      "User-Agent": "cosmos-mcp/0.1.0",
    };
    if (this.config.authMode === "system_key") {
      headers["X-System-Key"] = this.config.authToken;
    } else {
      headers["X-MCP-Key"] = this.config.authToken;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    let parsed: unknown = text;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep as text
      }
    }

    if (!res.ok) throw new CosmosError(res.status, path, parsed);
    return parsed as T;
  }

  // Read endpoints
  export() {
    return this.request<ExportResponse>({
      method: "POST",
      path: "/api/polarity/export",
      body: { polarity_user_id: this.config.polarityUserId },
    });
  }

  getGraph(entity?: "user" | "cosmos" | "polarity") {
    return this.request<GraphResponse>({
      method: "GET",
      path: "/api/polarity",
      query: { entity },
    });
  }

  ask(query: string) {
    return this.request<AskResponse>({
      method: "POST",
      path: "/api/polarity/ask",
      body: { polarity_user_id: this.config.polarityUserId, query },
    });
  }

  // Write endpoints
  observe(input: {
    text: string;
    source?: string;
    tags?: string[];
    kind?: "observation" | "event" | "preference";
    confidence?: number;
  }) {
    return this.request<ObserveResponse>({
      method: "POST",
      path: "/api/polarity/observe",
      body: { polarity_user_id: this.config.polarityUserId, ...input },
    });
  }

  dump(input: { waypoint_id: string; name: string; lat?: number; lon?: number; message: string }) {
    return this.request<DumpResponse>({
      method: "POST",
      path: "/api/polarity/dump",
      body: { polarity_user_id: this.config.polarityUserId, ...input },
    });
  }

  checkin(input: { waypoint_id: string; name: string; lat?: number; lon?: number; occurred_at?: string }) {
    return this.request<unknown>({
      method: "POST",
      path: "/api/polarity/checkin",
      body: { polarity_user_id: this.config.polarityUserId, ...input },
    });
  }

  declare(input: {
    waypoint_id: string;
    name: string;
    lat?: number;
    lon?: number;
    starts_at: string;
    ends_at: string;
    chip: "next_30" | "next_hour" | "tonight" | "tomorrow_night";
  }) {
    return this.request<unknown>({
      method: "POST",
      path: "/api/polarity/declare",
      body: { polarity_user_id: this.config.polarityUserId, ...input },
    });
  }

  edge(input: { waypoint_id_a: string; waypoint_id_b: string; label?: string }) {
    return this.request<unknown>({
      method: "POST",
      path: "/api/polarity/edge",
      body: input,
    });
  }

  whoami() {
    return this.request<WhoamiResponse>({
      method: "GET",
      path: "/api/polarity/whoami",
    });
  }
}

// Response shapes — loose, since cosmos owns the source of truth.

export interface PolarityNode {
  id: number;
  type: string;
  label: string;
  content: string | null;
  source: string | null;
  confidence: number | null;
  weight: number | null;
  last_observed: string | null;
  reinforcement_count: number | null;
  emotional_score?: number | null;
  functional_network?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PolarityEdge {
  id: number;
  from_id: number;
  to_id: number;
  label: string;
  strength: number;
  source: string | null;
  confidence: number | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface ExportResponse {
  format: string;
  exported_at: string;
  polarity_user_id: string;
  cosmos_user_id: number;
  nodes: PolarityNode[];
  edges: PolarityEdge[];
  counts: { nodes: number; edges: number };
}

export interface GraphResponse {
  nodes: PolarityNode[];
  edges?: PolarityEdge[];
  orbit_edges?: PolarityEdge[];
  communities?: unknown[];
  observations?: unknown[];
  user?: unknown;
  cosmos?: unknown;
  sync_edges?: unknown[];
}

export interface AskResponse {
  answer: string;
  cited_node_ids?: number[];
  cited_edge_ids?: number[];
}

export interface ObserveResponse {
  node_id: number;
  kind: string;
}

export interface DumpResponse {
  cosmos_user_id: number;
  location_node_id: number;
  message_node_id: number;
  edge_id: number;
}

export interface WhoamiResponse {
  polarity_user_id: string;
  cosmos_user_id: number;
  scopes?: string[];
  created_at?: string;
}
