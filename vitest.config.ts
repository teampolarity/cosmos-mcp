import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Bootstrap spins up a real loopback HTTP server with a freshly
    // bound port, so concurrency could collide port assignments. Run
    // serially.
    fileParallelism: false,
  },
});
