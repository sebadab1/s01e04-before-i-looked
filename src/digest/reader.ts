import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunRecord = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.at === 'string' &&
    typeof record.job === 'string' &&
    record.job.length > 0 &&
    (record.status === 'ok' || record.status === 'retry' || record.status === 'fail') &&
    Object.hasOwn(record, 'owner') &&
    (record.owner === null || typeof record.owner === 'string') &&
    (!Object.hasOwn(record, 'error') || typeof record.error === 'string')
  );
}

export const readNight: ReadNight = (runsDir, night) => {
  const contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  const rowsByJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      badLines += 1;
      continue;
    }

    if (!isRunRecord(value)) {
      badLines += 1;
      continue;
    }

    const previous = rowsByJob.get(value.job);
    if (previous) {
      rowsByJob.set(value.job, {
        ...previous,
        owner: value.owner,
        runs: previous.runs + 1,
        retries: previous.retries + (value.status === 'retry' ? 1 : 0),
        lastStatus: value.status,
        lastError: value.error ?? previous.lastError,
        lastAt: value.at,
      });
      continue;
    }

    rowsByJob.set(value.job, {
      job: value.job,
      owner: value.owner,
      runs: 1,
      retries: value.status === 'retry' ? 1 : 0,
      lastStatus: value.status,
      lastError: value.error ?? null,
      firstAt: value.at,
      lastAt: value.at,
    });
  }

  return { rows: [...rowsByJob.values()], badLines };
};
