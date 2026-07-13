/**
 * Polarity Lab stack HTTP registry (generated — do not edit by hand).
 *
 * Literal full-URL fetch sites for codebase-memory + agent cross-repo maps.
 * Regenerate: node ~/cosmos/scripts/sync-lab-stack-from-manifest.mjs
 */

/** @cross-repo cosmos-mcp → cosmos POST /api/mcp */
export async function post_api_mcp(body: unknown) {
  return fetch('https://cosmos.polarity-lab.com/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** @cross-repo cosmos-mcp → cosmos POST /api/capture */
export async function post_api_capture(body: unknown) {
  return fetch('https://cosmos.polarity-lab.com/api/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** @cross-repo cosmos-mcp → cosmos POST /api/chat */
export async function post_api_chat(body: unknown) {
  return fetch('https://cosmos.polarity-lab.com/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** @cross-repo cosmos-mcp → cosmos POST /api/polarity/capture-turn */
export async function post_api_polarity_capture_turn(body: unknown) {
  return fetch('https://cosmos.polarity-lab.com/api/polarity/capture-turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const POLARITY_STACK_OUTBOUND = [
  'https://cosmos.polarity-lab.com/api/mcp',
  'https://cosmos.polarity-lab.com/api/capture',
  'https://cosmos.polarity-lab.com/api/chat',
  'https://cosmos.polarity-lab.com/api/polarity/capture-turn',
] as const;
