import { spawn } from 'node:child_process';
import { realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Snapshot the real HTTP route; the rendered document stays outside this checkout.
const [mode, destination, ...extra] = process.argv.slice(2);
if (!['marked', 'clean'].includes(mode) || !destination || extra.length) {
  throw new Error('Usage: node scripts/save-preview.mjs <marked|clean> <outside-repo/index.html>');
}

const repo = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const requested = resolve(destination);
// Resolve the existing parent so a symlink cannot route output back into the checkout.
const output = resolve(await realpath(dirname(requested)), basename(requested));
const withinRepo = relative(repo, output);
if (!withinRepo || (!isAbsolute(withinRepo) && withinRepo !== '..' && !withinRepo.startsWith(`..${sep}`))) {
  throw new Error('Preview output must be outside the git checkout (create its parent directory first).');
}

const temporary = `${output}.${process.pid}.tmp`;
const env = { ...process.env };
// An existing environment value takes precedence over Node's .env loader, even when empty.
// lane() normalizes an empty marker to null, so clean mode also overrides a marked .env.
if (mode === 'clean') env.LANE_MARKER = '';
const child = spawn(process.execPath, [
  '--import', 'tsx', '--env-file-if-exists=.env', '--input-type=module', '--eval', `
    import { serve } from '@hono/node-server';
    import { createApp } from './src/app.tsx';
    import { loadConfig } from './src/config.ts';
    import { lane } from './src/lane.ts';
    process.on('disconnect', () => process.exit(0));
    if (${JSON.stringify(mode)} === 'marked' && lane().marker === null) {
      throw new Error('Marked preview requires LANE_MARKER in the environment or .env.');
    }
    serve({ fetch: createApp(loadConfig()).fetch, hostname: '127.0.0.1', port: 0 },
      ({ port }) => process.send({ port }));
  `,
], { cwd: repo, env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
// Consume diagnostics without copying a possible marker into a terminal or CI log.
child.stderr.resume();
const stopped = new Promise((accept) => child.once('exit', accept));

try {
  const port = await new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview server did not start within 15 seconds.')), 15_000);
    child.once('message', (message) => {
      clearTimeout(timer);
      if (!message || !Number.isInteger(message.port)) reject(new Error('Invalid server port.'));
      else accept(message.port);
    });
    child.once('error', () => { clearTimeout(timer); reject(new Error('Cannot start preview server.')); });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('Preview server exited; check dependencies, config, and marker setup.'));
    });
  });
  const response = await fetch(`http://127.0.0.1:${port}/digest/2026-10-28`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Digest returned HTTP ${response.status}.`);
  const html = await response.text();
  if (!response.headers.get('content-type')?.startsWith('text/html') || !html.startsWith('<!doctype html>')) {
    throw new Error('Digest did not return the expected HTML document.');
  }
  await writeFile(temporary, html, { flag: 'wx', mode: 0o600 });
  await rename(temporary, output);
  console.log(`Saved ${mode} digest to ${output}`);
} finally {
  await rm(temporary, { force: true });
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await stopped;
  }
}
