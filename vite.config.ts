import { defineConfig, loadEnv, type Plugin, type ViteDevServer, type PreviewServer } from "vite";
import reactPlugin from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAssistantRequest, type AssistantEnv } from "./server/assistant";

/** Read a Node request body completely. */
async function bodyOf(req: IncomingMessage): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of req) parts.push(part as Buffer);
  return Buffer.concat(parts);
}

/**
 * During `npm run dev` / `npm run preview`, answer /api/assistant in this Node process with the
 * same handler the server uses. The key comes from .env.local and never reaches the browser.
 */
function localAssistant(env: AssistantEnv): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith("/api/assistant")) return next();
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
      const request = new Request(new URL(req.url, "http://localhost"), {
        method: req.method,
        headers,
        body: req.method === "POST" ? await bodyOf(req) : undefined,
      });
      const response = await handleAssistantRequest(request, env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: { code: "provider_unavailable", message: "The local assistant server failed.", retryable: true } }));
    }
  };
  const attach = (server: ViteDevServer | PreviewServer) => void server.middlewares.use(handle);
  return { name: "clavis-local-assistant", configureServer: attach, configurePreviewServer: attach };
}

const VENDOR_CHUNKS: [RegExp, string][] = [
  [/[\\/]node_modules[\\/]three[\\/]/, "three"],
  [/[\\/]node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store)[\\/]/, "react"],
  [/[\\/]node_modules[\\/]zod[\\/]/, "zod"],
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const keys = ["MODEL_PROVIDER", "MODEL_API_KEY", "MODEL_ID", "MODEL_BASE_URL", "MODEL_EXPLAIN_ID", "META_API_BASE_URL", "META_MODEL_ID"] as const;
  const assistantEnv = Object.fromEntries(keys.map((k) => [k, env[k]])) as AssistantEnv;
  return {
    plugins: [reactPlugin(), localAssistant(assistantEnv)],
    server: { port: 5199, strictPort: true },
    build: {
      // three.js with its controls is one large library chunk, cached on its own
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: (id: string) => (id.includes("node_modules") ? (VENDOR_CHUNKS.find(([re]) => re.test(id))?.[1] ?? "vendor") : undefined),
        },
      },
    },
    test: { environment: "node", include: ["tests/**/*.test.ts"] },
  } as never;
});
