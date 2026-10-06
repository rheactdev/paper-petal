import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
const root = fileURLToPath(new URL("../", import.meta.url));
const binary =
  process.env.POCKETBASE_BINARY ||
  fileURLToPath(new URL("../.pocketbase/bin/pocketbase", import.meta.url));
if (!existsSync(binary))
  throw new Error(
    "PocketBase is not installed. Run npm run pocketbase:setup first.",
  );
const child = spawn(
  binary,
  [
    "serve",
    "--http=127.0.0.1:8090",
    "--dir=.pocketbase/data",
    "--migrationsDir=pocketbase/pb_migrations",
    "--hooksDir=.pocketbase/hooks",
    "--publicDir=.pocketbase/public",
    "--automigrate=false",
  ],
  { cwd: root, stdio: ["inherit", "pipe", "pipe"] },
);
for (const stream of [child.stdout, child.stderr]) {
  createInterface({ input: stream }).on("line", (line) => {
    if (line.includes("/#/pbinstall/")) {
      console.log(
        "First-time administrator setup link omitted from logs. See README for administrator setup.",
      );
    } else console.log(line);
  });
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", () => {
  console.error("Could not start PocketBase.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
