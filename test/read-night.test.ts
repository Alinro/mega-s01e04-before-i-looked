import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

const night = '2026-10-28';
const valid = { at: '2026-10-28T23:00:02+01:00', job: 'job', status: 'ok', owner: 'rook' };
let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rig-reader-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function writeEvents(events: unknown[]) {
  writeFileSync(join(dir, `${night}.jsonl`), events.map((event) => JSON.stringify(event)).join('\n'));
}

describe('readNight', () => {
  it('reads the real fixture with five sorted jobs and one bad line', () => {
    const result = readNight('runs', night);
    expect(result?.badLines).toBe(1);
    expect(result?.totals).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(result?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(result?.rows[0]).toEqual({
      job: 'digest/render', owner: null, runs: 1, retries: 0,
      lastStatus: 'ok', lastError: null, hasFailed: false,
      firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
    });
    expect(result?.rows[1]).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(result?.rows[2]).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held' });
    expect(result?.rows[3]).toMatchObject({ lastStatus: 'fail', hasFailed: true, lastError: 'quota exceeded' });
  });

  it('distinguishes missing, empty, and wholly invalid logs', () => {
    expect(readNight(dir, night)).toBeNull();
    writeFileSync(join(dir, `${night}.jsonl`), '');
    expect(readNight(dir, night)).toEqual({ rows: [], badLines: 0, totals: { ok: 0, retry: 0, fail: 0 } });
    writeFileSync(join(dir, `${night}.jsonl`), '\n \r\n\t\n');
    expect(readNight(dir, night)).toEqual({ rows: [], badLines: 0, totals: { ok: 0, retry: 0, fail: 0 } });
    writeFileSync(join(dir, `${night}.jsonl`), 'broken\n');
    expect(readNight(dir, night)).toEqual({ rows: [], badLines: 1, totals: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts malformed JSON and invalid fields without losing valid events', () => {
    const { owner: _owner, ...missingOwner } = valid;
    const { at: _at, ...missingAt } = valid;
    const { job: _job, ...missingJob } = valid;
    const { status: _status, ...missingStatus } = valid;
    const invalid = [null, [], 5, 'text', {}, missingOwner, missingAt, missingJob, missingStatus,
      { ...valid, at: 42 }, { ...valid, at: 'not a date' },
      { ...valid, at: '2026-02-30T12:00:00Z' }, { ...valid, at: '2026-10-28T12:00:00' },
      { ...valid, job: null }, { ...valid, job: ' ' }, { ...valid, status: 'waiting' },
      { ...valid, status: ['ok'] }, { ...valid, status: { toString: 3 } },
      { ...valid, owner: 5 }, { ...valid, error: null },
      { ...valid, error: 3 },
    ];
    writeFileSync(join(dir, `${night}.jsonl`), '\n{broken\n' + invalid.map((event) => JSON.stringify(event)).join('\n')
      + '\n' + JSON.stringify(valid) + '\r\n' + JSON.stringify({ ...valid, owner: null }) + '\n\t\n');
    expect(readNight(dir, night)).toMatchObject({
      badLines: invalid.length + 1, totals: { ok: 2, retry: 0, fail: 0 },
      rows: [{ owner: null, runs: 2 }],
    });
  });

  it('orders by timestamp instant and preserves logged offsets and previous errors', () => {
    writeEvents([
      { ...valid, at: '2026-10-29T00:30:00+02:00', status: 'ok', owner: null },
      { ...valid, at: '2026-10-28T23:00:00+01:00', status: 'retry', error: 'latest error' },
      { ...valid, at: '2026-10-29T00:00:00+03:00', status: 'fail', error: 'first error' },
    ]);
    expect(readNight(dir, night)).toEqual({
      badLines: 0, totals: { ok: 1, retry: 1, fail: 1 },
      rows: [{
        job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'ok',
        lastError: 'latest error', hasFailed: true,
        firstAt: '2026-10-29T00:00:00+03:00', lastAt: '2026-10-29T00:30:00+02:00',
      }],
    });
  });

  it('uses later lines for equal instants, including an explicitly empty error', () => {
    writeEvents([
      { ...valid, at: '2026-10-29T00:00:00+02:00', status: 'fail', error: 'failure' },
      { ...valid, at: '2026-10-28T22:00:00Z', status: 'retry', owner: null, error: '' },
    ]);
    expect(readNight(dir, night)?.rows[0]).toEqual({
      job: 'job', owner: null, runs: 2, retries: 1, lastStatus: 'retry',
      lastError: '', hasFailed: true,
      firstAt: '2026-10-29T00:00:00+02:00', lastAt: '2026-10-28T22:00:00Z',
    });
  });

  it('rejects unsafe night names before reading outside the runs directory', () => {
    const runs = join(dir, 'runs');
    mkdirSync(runs);
    writeEvents([valid]);
    for (const unsafe of [`../${night}`, join(dir, night), `${night}/other`, `${night}\0`, `${night}.jsonl`]) {
      expect(readNight(runs, unsafe)).toBeNull();
    }
  });

  it('propagates filesystem errors other than a missing file', () => {
    mkdirSync(join(dir, `${night}.jsonl`));
    expect(() => readNight(dir, night)).toThrow();
  });
});
