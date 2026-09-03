import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Geliştirme eklentisi: demo `?bench=1` ile açıldığında kısa süpürmenin
 * sonucunu POST /__bench'e gönderir, biz de proje köküne bench-result.json
 * yazarız. Makaledeki CPU tablosunu elle kopyalamak yerine gerçek çıktıdan
 * doldurmak için var; normal `npm run dev` akışına dokunmaz.
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
          server.config.logger.info(`[bench-sink] ${out} yazıldı (${body.length} B)`);
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
    // Cross-origin isolation OLMADAN Chrome performance.now()'u 100 µs'ye
    // yuvarlar — merged yolun kare süresi olduğu gibi 0,0 ms görünür. Bu iki
    // başlık sayfayı izole edip saati 5 µs çözünürlüğe çıkarır. Bütün varlıklar
    // aynı origin'den geldiği için require-corp hiçbir şeyi kırmıyor.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
