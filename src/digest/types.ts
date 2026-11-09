export type DigestStatus = 'ok' | 'retry' | 'fail'

export interface DigestRow {
  job: string
  /** Owner of the chronologically latest event, including an explicit null. */
  owner: string | null
  /** Number of valid events for this job, including retries and failures. */
  runs: number
  retries: number
  lastStatus: DigestStatus
  /** Latest supplied error in chronological order, or null when none was supplied. */
  lastError: string | null
  /** Original timestamp strings, preserving their logged offsets. */
  firstAt: string
  lastAt: string
  /** True if any event failed, even when a later event succeeded. */
  hasFailed: boolean
}

/** Counts of valid log events by status, rather than counts of job rows. */
export interface DigestStatusCounts {
  ok: number
  retry: number
  fail: number
}

export interface DigestResult {
  /** One row per job, sorted in ascending job-name order. */
  rows: DigestRow[]
  /** Nonblank lines rejected because JSON or required event fields are invalid. */
  badLines: number
  totals: DigestStatusCounts
}

/**
 * Synchronously read runsDir/<night>.jsonl. A missing file returns null; an existing
 * empty file returns empty rows, zero badLines, and zero totals. Other I/O errors
 * propagate. Invalid lines are counted and skipped without losing valid events.
 *
 * Aggregate by timestamp instant, not file order. Equal timestamps use file order
 * (the later line wins for latest values); displayed timestamps keep their offsets.
 * src/digest/read-night.ts exports readNight using this shared function type.
 */
export type ReadNight = (runsDir: string, night: string) => DigestResult | null
