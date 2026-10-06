import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const version = "0.40.4";
const os = { darwin: "darwin", linux: "linux" }[process.platform];
const arch = { arm64: "arm64", x64: "amd64" }[process.arch];
if (!os || !arch)
  throw new Error(
    "Download PocketBase 0.40.4 for your platform from https://github.com/pocketbase/pocketbase/releases and set POCKETBASE_BINARY to its path.",
  );
const directory = fileURLToPath(
  new URL("../.pocketbase/bin/", import.meta.url),
);
await mkdir(directory, { recursive: true });
const archive = `pocketbase_${version}_${os}_${arch}.zip`;
const base = `https://github.com/pocketbase/pocketbase/releases/download/v${version}`;
const zipPath = join(directory, archive),
  checksumPath = join(directory, "checksums.txt");
// curl uses the platform's TLS certificate trust store. Verify the release checksum
// before extracting or running the downloaded binary.
for (const [file, target] of [
  [archive, zipPath],
  ["checksums.txt", checksumPath],
]) {
  execFileSync("curl", ["-fsSL", `${base}/${file}`, "-o", target], {
    stdio: "inherit",
  });
}
const expected = (await readFile(checksumPath, "utf8"))
  .split("\n")
  .find((line) => line.trim().endsWith(archive))
  ?.trim()
  .split(/\s+/)[0];
const actual = createHash("sha256")
  .update(await readFile(zipPath))
  .digest("hex");
if (!expected || actual !== expected)
  throw new Error(
    "PocketBase download checksum mismatch; installation stopped.",
  );
execFileSync("unzip", ["-o", "-q", zipPath, "pocketbase", "-d", directory], {
  stdio: "inherit",
});
await chmod(join(directory, "pocketbase"), 0o755);
await writeFile(join(directory, "version.txt"), version + "\n");
console.log(
  `PocketBase ${version} installed. Start it with npm run pocketbase:dev.`,
);
