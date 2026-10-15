import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { authorize } from "./server/auth";
function localGate(env: Record<string, string>): Plugin {
  const install = (server: {
    middlewares: { use: (handler: any) => void };
  }) => {
    server.middlewares.use(async (req: any, res: any, next: () => void) => {
      try {
        const origin = `http://${req.headers.host}`;
        const chunks: Buffer[] = [];
        if (req.method === "POST")
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const request = new Request(new URL(req.url || "/", origin), {
          method: req.method,
          headers: req.headers,
          ...(req.method === "POST"
            ? { body: Buffer.concat(chunks).toString() }
            : {}),
        });
        const response = await authorize(request, {
          ...env,
          NODE_ENV: "development",
        });
        if (!response) return next();
        res.statusCode = response.status;
        response.headers.forEach((value, name) => res.setHeader(name, value));
        res.end(await response.text());
      } catch {
        res.statusCode = 500;
        res.end("Local server error");
      }
    });
  };
  return {
    name: "private-local-gate",
    configureServer: install,
    configurePreviewServer: install,
  };
}
export default defineConfig(({ mode }) => ({
  plugins: [localGate(loadEnv(mode, process.cwd(), "")), react()],
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } } },
}));
