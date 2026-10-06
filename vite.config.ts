import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), [
    "POCKETBASE_",
    "GOOGLE_",
    "APP_URL",
  ]);
  for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
  return {
    server: { watch: { ignored: ["**/.pocketbase/**"] } },
    plugins: [tanstackStart(), nitro({ preset: "node-server" }), react()],
  };
});
