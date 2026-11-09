import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight } from './types.js';

interface RunEvent {
  at: string;
  instant: number;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('at' in value) || typeof value.at !== 'string'
    || !('job' in value) || typeof value.job !== 'string' || !value.job.trim()
    || !('status' in value) || (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail')
    || !('owner' in value) || (value.owner !== null && typeof value.owner !== 'string')
    || ('error' in value && typeof value.error !== 'string')) return null;

  // Require a timezone so ordering never depends on the server's local timezone.
  const timestamp = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value.at);
  const instant = Date.parse(value.at);
  if (!timestamp || !Number.isFinite(instant)) return null;
  const day = new Date(`${timestamp[1]}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || !day.toISOString().startsWith(timestamp[1])) return null;
  return {
    at: value.at, instant, job: value.job, status: value.status, owner: value.owner,
    ...('error' in value && typeof value.error === 'string' ? { error: value.error } : {}),
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  // Reject path components before touching the filesystem.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let log: string;
  try {
    log = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  let badLines = 0;
  const events: RunEvent[] = [];
  for (const line of log.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = parseEvent(line);
    if (event) events.push(event);
    else badLines++;
  }
  // Stable sorting preserves file order for equal instants.
  events.sort((a, b) => a.instant - b.instant);
  const rows = new Map<string, DigestRow>();
  const totals = { ok: 0, retry: 0, fail: 0 };
  for (const event of events) {
    totals[event.status]++;
    let row = rows.get(event.job);
    if (!row) {
      row = {
        job: event.job, owner: event.owner, runs: 0, retries: 0,
        lastStatus: event.status, lastError: null,
        firstAt: event.at, lastAt: event.at, hasFailed: false,
      };
      rows.set(event.job, row);
    }
    row.runs++;
    row.retries += event.status === 'retry' ? 1 : 0;
    row.hasFailed ||= event.status === 'fail';
    row.owner = event.owner;
    row.lastStatus = event.status;
    if (event.error !== undefined) row.lastError = event.error;
    row.lastAt = event.at;
  }
  return {
    rows: [...rows.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0),
    badLines,
    totals,
  };
};
