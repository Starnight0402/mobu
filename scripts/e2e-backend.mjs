#!/usr/bin/env node
/**
 * Boots a throwaway local Convex backend for the Playwright E2E suite.
 *
 * - Runs from a staged copy in .e2e-backend/ so `convex dev` never rewrites the
 *   real .env.local or touches your cloud deployment. No Convex account needed
 *   (anonymous local mode).
 * - Adds a wipe mutation to the STAGED copy only (it never ships), and wipes
 *   every table on start, so each run begins with zero users.
 * - Generates fresh auth signing keys each run.
 * - Serves 200 on http://127.0.0.1:3299 once ready; Playwright waits on that.
 */
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, '.e2e-backend');
const cli = path.join(root, 'node_modules', 'convex', 'bin', 'main.js');
const SITE_URL = process.env.E2E_SITE_URL ?? 'http://127.0.0.1:4173';
const READY_PORT = 3299;
const env = { ...process.env, CONVEX_AGENT_MODE: 'anonymous' };

// --- stage ----------------------------------------------------------------
mkdirSync(dir, { recursive: true });
rmSync(path.join(dir, 'convex'), { recursive: true, force: true });
cpSync(path.join(root, 'convex'), path.join(dir, 'convex'), { recursive: true });
for (const f of ['package.json', 'tsconfig.json']) cpSync(path.join(root, f), path.join(dir, f));
if (!existsSync(path.join(dir, 'node_modules'))) {
  symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
}
writeFileSync(
  path.join(dir, 'convex', 'e2eReset.ts'),
  `import { internalMutation } from "./_generated/server";
import schema from "./schema";
// Test-only. Exists solely in the staged .e2e-backend copy.
export const wipe = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of Object.keys(schema.tables)) {
      for (const doc of await ctx.db.query(table as any).collect()) await ctx.db.delete(doc._id);
    }
  },
});
`,
);

const convex = (...args) => {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd: dir, env, encoding: 'utf8' });
  // Node 24 on Windows can abort with this libuv assertion during process
  // teardown, *after* the command finished its work. Linux CI never hits it.
  const teardownCrash = /UV_HANDLE_CLOSING/.test(r.stderr ?? '');
  if (r.status !== 0 && !teardownCrash) throw new Error(`convex ${args.slice(0, 2).join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};

// --- run --------------------------------------------------------------------
// Pinned so E2E doesn't change underneath us whenever Convex publishes a
// backend release. Bump deliberately (CI caches binaries keyed on this file).
const BACKEND_VERSION = process.env.E2E_CONVEX_BACKEND ?? 'precompiled-2026-10-22-1447815';
// Starting downloads the backend and its dashboard from GitHub releases; a
// transient download failure there shouldn't fail the build.
const MAX_ATTEMPTS = 3;

let dev;
let ready = false;

function start(attempt) {
  let log = '';
  dev = spawn(
    process.execPath,
    [cli, 'dev', '--tail-logs', 'disable', '--local-backend-version', BACKEND_VERSION],
    { cwd: dir, env },
  );
  const onOutput = (chunk) => {
    const text = chunk.toString();
    log += text;
    if (process.env.E2E_VERBOSE) process.stdout.write(text);
    if (!ready && /Convex functions ready/.test(text)) {
      ready = true;
      try {
        configure();
      } catch (err) {
        console.error(err.message);
        shutdown(1);
      }
    }
  };
  dev.stdout.on('data', onOutput);
  dev.stderr.on('data', onOutput);
  dev.on('exit', (code) => {
    if (ready) process.exit(code ?? 1);
    console.error(`convex dev exited before ready (attempt ${attempt}/${MAX_ATTEMPTS}, code ${code}):\n${log}`);
    if (attempt >= MAX_ATTEMPTS) process.exit(code ?? 1);
    setTimeout(() => start(attempt + 1), 5_000 * attempt);
  });
}
start(1);

function configure() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trimEnd().replace(/\n/g, ' ');
  const jwks = JSON.stringify({ keys: [{ use: 'sig', ...publicKey.export({ format: 'jwk' }) }] });

  convex('env', 'set', 'SITE_URL', SITE_URL);
  convex('env', 'set', 'JWT_PRIVATE_KEY', '--', pem);
  convex('env', 'set', 'JWKS', jwks);
  convex('run', 'e2eReset:wipe');

  http.createServer((_req, res) => res.end('ready')).listen(READY_PORT, '127.0.0.1');
  console.log(`E2E backend ready on http://127.0.0.1:3210 (signal on :${READY_PORT})`);
}

function shutdown(code = 0) {
  dev.kill();
  process.exit(code);
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
