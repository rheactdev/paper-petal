// Integration checks use disposable databases and synthetic accounts only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { toJSONAsync, fromCrossJSON } from "seroval";
import { defaultSerovalDeserializerPlugins } from "@tanstack/react-start";
import PocketBase, { BaseAuthStore } from "pocketbase";

const root = fileURLToPath(new URL("../", import.meta.url));
const binary =
  process.env.POCKETBASE_BINARY || join(root, ".pocketbase/bin/pocketbase");
const temporary = await mkdtemp(join(tmpdir(), "paper-petal-auth-"));
const pbOrigin = "http://127.0.0.1:8091",
  origin = "http://127.0.0.1:3001";
const processes = [];
function start(binary, args, env = {}) {
  const child = spawn(binary, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  // Never print PocketBase's bootstrap link, tokens, passwords or response bodies.
  child.stdout.on("data", (data) => {
    logs += data;
  });
  child.stderr.on("data", (data) => {
    logs += data;
  });
  child.on("error", () => {});
  processes.push(child);
  return { child, logs: () => logs };
}
async function ready(url, process) {
  for (let i = 0; i < 100; i++) {
    if (process.child.exitCode !== null) {
      if (/operation not permitted|EPERM/.test(process.logs()))
        throw new Error(
          "Local test servers require permission to bind ports 8091 and 3001.",
        );
      throw new Error(
        "Test server stopped unexpectedly. Check the build, PocketBase migration and availability of ports 8091 and 3001.",
      );
    }
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Local test server did not become ready.");
}
try {
  const pbServer = start(binary, [
    "serve",
    "--http=127.0.0.1:8091",
    `--dir=${join(temporary, "data")}`,
    `--hooksDir=${join(temporary, "hooks")}`,
    `--publicDir=${join(temporary, "public")}`,
    "--migrationsDir=pocketbase/pb_migrations",
    "--automigrate=false",
  ]);
  await ready(`${pbOrigin}/api/health`, pbServer);
  const app = start(process.execPath, [".output/server/index.mjs"], {
    PORT: "3001",
    HOST: "127.0.0.1",
    POCKETBASE_URL: pbOrigin,
    APP_URL: origin,
    NODE_ENV: "production",
  });
  await ready(`${origin}/api/health`, app);
  const source = await readFile(
    join(root, ".output/server/_ssr/ssr.mjs"),
    "utf8",
  );
  const ids = {};
  for (const match of source.matchAll(
    /"([a-f0-9]{64})": \{\s*functionName: "(\w+)_createServerFn_handler"/g,
  ))
    ids[match[2]] = match[1];
  assert.ok(
    ids.signIn && ids.signUp && ids.getSession && ids.signOut,
    "Build must include account server functions.",
  );
  async function call(name, data, cookie, requestHeaders = { Origin: origin }) {
    const response = await fetch(`${origin}/_serverFn/${ids[name]}`, {
      method: name === "getSession" ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-tsr-serverFn": "true",
        ...requestHeaders,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body:
        data === undefined
          ? undefined
          : JSON.stringify(await toJSONAsync({ data })),
    });
    const body = await response.text();
    const parsed = response.headers.get("x-tss-serialized")
      ? fromCrossJSON(JSON.parse(body), {
          plugins: defaultSerovalDeserializerPlugins,
        })
      : null;
    return { response, body, value: parsed?.result ?? parsed };
  }
  const alice = {
    name: "Alice test",
    email: "alice@example.com",
    password: "Synthetic-test-47!",
    passwordConfirm: "Synthetic-test-47!",
  };
  const bob = { ...alice, name: "Bob test", email: "bob@example.com" };
  for (const headers of [
    {},
    { Origin: "https://untrusted.example" },
    { Origin: origin, "Sec-Fetch-Site": "cross-site" },
  ]) {
    const rejected = await call("signUp", alice, undefined, headers);
    assert.equal(rejected.response.status, 403);
    assert.equal(rejected.response.headers.get("set-cookie"), null);
  }
  const invalid = await call("signUp", {
    ...alice,
    passwordConfirm: "different",
  });
  assert.equal(invalid.response.headers.get("set-cookie"), null);
  const signup = await call("signUp", alice);
  assert.equal(signup.value.ok, true);
  const setCookie = signup.response.headers.get("set-cookie");
  assert.ok(
    setCookie &&
      /HttpOnly/i.test(setCookie) &&
      /Secure/i.test(setCookie) &&
      /SameSite=Lax/i.test(setCookie),
  );
  assert.ok(/Expires=/i.test(setCookie));
  const cookie = setCookie.split(";")[0],
    token = decodeURIComponent(cookie.split("=")[1]);
  assert.ok(!signup.body.includes(token));
  assert.deepEqual(Object.keys(signup.value.user).sort(), [
    "email",
    "id",
    "name",
  ]);
  assert.match(signup.response.headers.get("cache-control"), /no-store/);
  const duplicate = await call("signUp", alice);
  assert.equal(duplicate.value.ok, false);
  const wrong = await call("signIn", {
    email: alice.email,
    password: "incorrect-test",
  });
  assert.equal(wrong.value.ok, false);
  const login = await call("signIn", {
    email: alice.email,
    password: alice.password,
  });
  assert.equal(login.value.ok, true);
  const session = await call("getSession", undefined, cookie);
  assert.equal(session.value.user.email, alice.email);
  assert.equal(session.response.headers.get("set-cookie"), null);
  const html = await fetch(`${origin}/sign-in`, {
    headers: { Cookie: cookie },
  });
  const document = await html.text();
  assert.match(document, /You’re signed in/);
  assert.ok(document.includes(alice.email));
  assert.ok(!document.includes(token));
  const bobSignup = await call("signUp", bob);
  assert.equal(bobSignup.value.ok, true);
  const guest = await call("getSession");
  assert.equal(guest.value.user, null);
  const independent = await call("getSession", undefined, cookie);
  assert.equal(independent.value.user.email, alice.email);
  const rejectedToken = await call(
    "getSession",
    undefined,
    `${cookie.slice(0, cookie.lastIndexOf(".") + 1)}invalid-signature`,
  );
  assert.equal(rejectedToken.value.user, null);
  const pb = new PocketBase(pbOrigin, new BaseAuthStore());
  await pb.collection("users").authWithPassword(alice.email, alice.password);
  const own = await pb.collection("users").getList();
  assert.equal(own.items.length, 1);
  assert.equal(own.items[0].id, signup.value.user.id);
  await assert.rejects(pb.collection("users").getOne(bobSignup.value.user.id));
  await assert.rejects(
    pb.collection("users").update(signup.value.user.id, { verified: true }),
  );
  const anonymous = new PocketBase(pbOrigin, new BaseAuthStore());
  const bobCookie = bobSignup.response.headers.get("set-cookie").split(";")[0];
  const fontBytes = await readFile(join(root, "src/assets/fonts/Minuet.otf"));
  const stickerBytes = await readFile(
    join(root, "src/assets/stickers/MochiKichiGift/clover.png"),
  );
  async function uploadAsset(
    kind,
    bytes,
    name,
    sessionCookie,
    uploadOrigin = origin,
  ) {
    const data = new FormData();
    data.append("kind", kind);
    data.append("file", new File([bytes], name));
    const response = await fetch(`${origin}/api/assets`, {
      method: "POST",
      body: data,
      headers: {
        Origin: uploadOrigin,
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
    });
    const text = await response.text();
    const value = response.headers
      .get("content-type")
      ?.includes("application/json")
      ? JSON.parse(text)
      : { message: text };
    return { response, value };
  }
  assert.equal(
    (await uploadAsset("font", fontBytes, "My font.otf")).response.status,
    401,
  );
  assert.equal(
    (
      await uploadAsset(
        "font",
        fontBytes,
        "My font.otf",
        cookie,
        "https://untrusted.example",
      )
    ).response.status,
    403,
  );
  assert.equal(
    (
      await uploadAsset(
        "font",
        new TextEncoder().encode("not a font"),
        "Fake.otf",
        cookie,
      )
    ).response.status,
    400,
  );
  const uploaded = await uploadAsset("font", fontBytes, "My font.otf", cookie);
  assert.equal(
    uploaded.response.status,
    200,
    "Authenticated font upload must succeed.",
  );
  assert.equal(uploaded.value.mimeType, "font/otf");
  assert.equal(uploaded.value.file, undefined);
  const retry = await uploadAsset("font", fontBytes, "My font.otf", cookie);
  assert.equal(
    retry.value.id,
    uploaded.value.id,
    "Retries must not duplicate library assets.",
  );
  const stickerUpload = await uploadAsset(
    "sticker",
    stickerBytes,
    "My sticker.png",
    cookie,
  );
  assert.equal(stickerUpload.response.status, 200);
  const library = await fetch(`${origin}/api/assets`, {
    headers: { Cookie: cookie },
  });
  assert.equal((await library.json()).length, 2);
  const bobLibrary = await fetch(`${origin}/api/assets`, {
    headers: { Cookie: bobCookie },
  });
  assert.deepEqual(await bobLibrary.json(), []);
  const copied = await fetch(`${origin}/api/assets/${uploaded.value.id}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(copied.status, 200);
  assert.deepEqual(Buffer.from(await copied.arrayBuffer()), fontBytes);
  assert.equal(
    (
      await fetch(`${origin}/api/assets/${uploaded.value.id}`, {
        headers: { Cookie: bobCookie },
      })
    ).status,
    404,
  );
  assert.equal(
    (await fetch(`${origin}/api/assets/${uploaded.value.id}`)).status,
    401,
  );
  const privateAsset = await pb
    .collection("user_assets")
    .getOne(uploaded.value.id);
  assert.equal(
    (await fetch(pb.files.getURL(privateAsset, privateAsset.file))).status,
    403,
    "Knowing a file URL must not bypass ownership.",
  );
  await assert.rejects(
    pb
      .collection("user_assets")
      .update(privateAsset.id, { owner: bobSignup.value.user.id }),
  );
  await assert.rejects(pb.collection("user_assets").delete(privateAsset.id));
  await assert.rejects(
    anonymous
      .collection("users")
      .create({ ...alice, email: "privilege@example.com", verified: true }),
  );
  const out = await call("signOut", undefined, cookie);
  assert.equal(out.value.user, null);
  assert.match(out.response.headers.get("set-cookie"), /Max-Age=0/i);
  for (const name of await readdir(join(root, ".output/public/assets"))) {
    if (!name.endsWith(".js")) continue;
    const asset = await readFile(
      join(root, ".output/public/assets", name),
      "utf8",
    );
    assert.ok(
      !asset.includes("POCKETBASE_URL") &&
        !asset.includes("paper_petal_session") &&
        !asset.includes("authWithPassword"),
      "PocketBase and session implementation must stay out of client assets.",
    );
  }
  console.log(
    "Account integration passed: authentication, SSR, CSRF, private cookies, asset uploads/retries, protected downloads, account isolation, collection rules and server-only client bundle.",
  );
} finally {
  for (const child of processes) {
    if (child.exitCode === null && !child.killed) {
      const stopped = once(child, "exit");
      child.kill("SIGTERM");
      await stopped;
    }
  }
  await rm(temporary, { recursive: true, force: true });
}
