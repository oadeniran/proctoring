import { defineConfig } from "vite";

// The API URL comes from VITE_API_BASE (see .env.example); it defaults to
// http://localhost:8008/zonyxstudio for local dev. The backend sets CORS to
// allow all origins, so the dev server calls it directly — no proxy needed.
export default defineConfig({
  server: { port: 5173 },
});