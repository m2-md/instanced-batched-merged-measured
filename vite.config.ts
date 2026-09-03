import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Development plugin: when the demo is opened with `?bench=1` it POSTs the result
 * of the short sweep to /__bench, and we write bench-result.json into the project
 * root. It exists so the CPU table in the article can be filled from real output
 * instead of copied by hand; it does not touch the normal `npm run dev` flow.
 */
function benchSink(): Plugin {
  return {
    name: "bench-sink",
    configureServer(server) {
      server.middlewares.use("/__bench", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          const out = resolve(process.cwd(), "bench-result.json");
          writeFileSync(out, body);
          server.config.logger.info(`[bench-sink] wrote ${out} (${body.length} B)`);
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [benchSink()],
  server: {
    // WITHOUT cross-origin isolation Chrome rounds performance.now() to 100 µs —
    // the merged path's frame time shows up as a flat 0.0 ms. These two headers
    // isolate the page and take the clock to 5 µs resolution. Every asset comes
    // from the same origin, so require-corp breaks nothing.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
