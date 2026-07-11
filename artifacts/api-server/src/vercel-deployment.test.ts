import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

type VercelConfig = {
  framework?: string | null;
  outputDirectory?: string;
  functions?: Record<string, { includeFiles?: string }>;
  rewrites?: Array<{ source: string; destination: string }>;
};

const apiRoot = path.resolve(import.meta.dirname, "..");

test("Vercel deploys dist only inside the API function", async () => {
  const config = JSON.parse(
    await readFile(path.join(apiRoot, "vercel.json"), "utf8"),
  ) as VercelConfig;
  const vercelIgnore = await readFile(path.join(apiRoot, ".vercelignore"), "utf8");
  const workspaceVercelIgnore = await readFile(
    path.resolve(apiRoot, "../..", ".vercelignore"),
    "utf8",
  );

  assert.equal(
    Object.hasOwn(config, "outputDirectory"),
    false,
    "dist must not be published as Vercel static output",
  );
  assert.equal(config.framework, null);
  assert.equal(config.functions?.["api/index.js"]?.includeFiles, "dist/**");
  assert.match(vercelIgnore, /^\.env$/m);
  assert.match(vercelIgnore, /^\.env\.\*$/m);
  assert.match(vercelIgnore, /^\.vercel$/m);
  assert.match(vercelIgnore, /^dist$/m);
  assert.match(workspaceVercelIgnore, /^\.env$/m);
  assert.match(workspaceVercelIgnore, /^\.env\.\*$/m);
  assert.match(workspaceVercelIgnore, /^\.vercel$/m);
  assert.match(workspaceVercelIgnore, /^output$/m);
  assert.match(workspaceVercelIgnore, /^\.playwright-cli$/m);
  assert.deepEqual(config.rewrites, [
    { source: "/api/(.*)", destination: "/api/index.js" },
    { source: "/(.*)", destination: "/api/index.js" },
  ]);

  for (const rewrite of config.rewrites ?? []) {
    assert.doesNotMatch(rewrite.destination, /(?:^|\/)dist\/|index\.(?:mjs|map)$/);
  }

  for (const publicDirectory of ["public", "static", path.join("dist", "public")]) {
    const absoluteDirectory = path.join(apiRoot, publicDirectory);
    try {
      await access(absoluteDirectory);
    } catch {
      continue;
    }

    const entries = await readdir(absoluteDirectory, { recursive: true });
    assert.equal(
      entries.some((entry) => /(?:^|\/)index\.mjs(?:\.map)?$/.test(entry)),
      false,
      `${publicDirectory} contains the API server bundle`,
    );
  }
});
