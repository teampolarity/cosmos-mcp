import type { ZodTypeAny } from "zod";

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
  additionalProperties?: boolean;
};

// Minimal zod -> JSON Schema converter for the tool schemas in this package.
// Intentionally introspects zod internals (`_def`) — kept narrow on purpose to
// avoid pulling zod-to-json-schema as a dep.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  const def = schema._def as any;

  switch (def.typeName) {
    case "ZodObject": {
      const shape = typeof def.shape === "function" ? def.shape() : def.shape;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape as Record<string, ZodTypeAny>)) {
        const child = value;
        properties[key] = zodToJsonSchema(child);
        if (!child.isOptional()) required.push(key);
      }
      const out: JsonSchema = { type: "object", properties, additionalProperties: false };
      if (required.length > 0) out.required = required;
      return out;
    }
    case "ZodString": {
      const out: JsonSchema = { type: "string" };
      const checks = (def.checks ?? []) as Array<{ kind: string; value?: unknown }>;
      for (const c of checks) {
        if (c.kind === "min" && typeof c.value === "number") out.minLength = c.value;
        if (c.kind === "max" && typeof c.value === "number") out.maxLength = c.value;
        if (c.kind === "datetime") out.format = "date-time";
      }
      return out;
    }
    case "ZodNumber": {
      const out: JsonSchema = { type: "number" };
      const checks = (def.checks ?? []) as Array<{ kind: string; value?: unknown }>;
      for (const c of checks) {
        if (c.kind === "min" && typeof c.value === "number") out.minimum = c.value;
        if (c.kind === "max" && typeof c.value === "number") out.maximum = c.value;
      }
      return out;
    }
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: def.values as string[] };
    case "ZodArray":
      return { type: "array", items: zodToJsonSchema(def.type as ZodTypeAny) };
    case "ZodOptional":
      return zodToJsonSchema(def.innerType as ZodTypeAny);
    case "ZodNullable":
      return zodToJsonSchema(def.innerType as ZodTypeAny);
    default:
      return {};
  }
}
