import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { DigestResult } from '../src/digest/types.js';

let runsDir: string;

function writeNight(night: string, contents: string) {
  writeFileSync(join(runsDir, `${night}.jsonl`), contents, 'utf8');
}

function appForRuns() {
  const config: RigConfig = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
  return createApp(config);
}

function digestRowsFromHtml(html: string) {
  const tableRows = [...html.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/gs)].slice(1);
  return tableRows.map(([, row]) => ({
    html: row,
    job: row?.match(/<td\b[^>]*>(.*?)<\/td>/s)?.[1]?.replace(/<[^>]+>/g, '').trim(),
  }));
}

describe('digest routes', () => {
  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  it('returns 404 from both routes when the night file is missing', async () => {
    const app = appForRuns();

    const html = await app.request('/digest/2026-11-08');
    const json = await app.request('/api/digest/2026-11-08');

    expect(html.status).toBe(404);
    expect(json.status).toBe(404);
  });

  it('serves an empty existing night as nothing ran and an empty digest result', async () => {
    writeNight('2026-11-08', '');
    const app = appForRuns();

    const htmlResponse = await app.request('/digest/2026-11-08');
    const jsonResponse = await app.request('/api/digest/2026-11-08');

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({
      rows: [],
      badLines: 0,
      totals: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('keeps valid events when a nonblank JSONL line is malformed', async () => {
    writeNight(
      '2026-11-08',
      [
        '{"at":"2026-11-08T09:00:00+01:00","job":"worker","status":"ok","owner":"Ada"}',
        '{this is not JSON}',
      ].join('\n'),
    );
    const app = appForRuns();

    const htmlResponse = await app.request('/digest/2026-11-08');
    const jsonResponse = await app.request('/api/digest/2026-11-08');

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('worker');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({
      rows: [
        {
          job: 'worker',
          owner: 'Ada',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-11-08T09:00:00+01:00',
          lastAt: '2026-11-08T09:00:00+01:00',
          hasFailed: false,
        },
      ],
      badLines: 1,
      totals: { ok: 1, retry: 0, fail: 0 },
    });
  });

  it('keeps JSON and HTML job order aligned and marks retries, failures, null owners, and original offsets', async () => {
    writeNight(
      '2026-11-08',
      [
        '{"at":"2026-11-08T01:30:00+02:00","job":"alpha","status":"fail","owner":"Ada","error":"first attempt failed"}',
        '{"at":"2026-11-08T01:45:00+02:00","job":"zeta","status":"retry","owner":"Zed"}',
        '{"at":"2026-11-08T02:00:00+02:00","job":"zeta","status":"retry","owner":"Zed"}',
        '{"at":"2026-11-08T02:15:00+02:00","job":"alpha","status":"ok","owner":null}',
        '{"at":"2026-11-08T02:30:00+02:00","job":"zeta","status":"retry","owner":"Zed"}',
        '{"at":"2026-11-08T03:00:00+02:00","job":"zeta","status":"ok","owner":"Zed"}',
      ].join('\n'),
    );
    const app = appForRuns();

    const htmlResponse = await app.request('/digest/2026-11-08');
    const jsonResponse = await app.request('/api/digest/2026-11-08');
    const html = await htmlResponse.text();
    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);

    const result = (await jsonResponse.json()) as DigestResult;
    const htmlRows = digestRowsFromHtml(html);

    expect(result.rows.map((row) => row.job)).toEqual(['alpha', 'zeta']);
    expect(htmlRows.map((row) => row.job)).toEqual(result.rows.map((row) => row.job));
    expect(result.rows[0]).toMatchObject({ owner: null, hasFailed: true, lastStatus: 'ok' });
    expect(result.rows[1]).toMatchObject({ retries: 3, hasFailed: false, lastStatus: 'ok' });
    expect(html).toContain('—');
    expect(html).toContain('2026-11-08T01:30:00+02:00');
    expect(html).toContain('2026-11-08T02:15:00+02:00');
    expect(htmlRows[0]?.html).toContain('warn');
    expect(htmlRows[1]?.html).toContain('warn');
  });
});
