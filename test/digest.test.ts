import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const fixtureRunsDir = fileURLToPath(new URL('../runs/', import.meta.url));

describe('readNight', () => {
  it('aggregates the fixture into five jobs and counts its malformed line', () => {
    const result = readNight(fixtureRunsDir, '2026-10-28');

    expect(result.rows).toHaveLength(5);
    expect(result.badLines).toBe(1);
    expect(result.rows.map(({ job }) => job)).toEqual([
      'rig/rotate-logs',
      'lane/sync',
      'fixtures/refresh',
      'notes/backup',
      'digest/render',
    ]);

    expect(result.rows.find(({ job }) => job === 'lane/sync')).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
    expect(result.rows.find(({ job }) => job === 'fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
    });
    expect(result.rows.find(({ job }) => job === 'notes/backup')).toMatchObject({
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
    expect(result.rows.find(({ job }) => job === 'digest/render')).toMatchObject({
      owner: null,
      runs: 1,
    });
  });

  it('counts malformed JSON and invalid records without losing valid rows', () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    const night = 'test-night';
    const file = join(runsDir, `${night}.jsonl`);
    const validRecord = {
      at: '2026-10-28T10:00:00-04:00',
      job: 'valid/job',
      status: 'ok',
      owner: null,
    };

    try {
      writeFileSync(
        file,
        [
          JSON.stringify(validRecord),
          '{"at":"truncated"',
          JSON.stringify({ ...validRecord, status: 'running' }),
        ].join('\n'),
      );

      const result = readNight(runsDir, night);
      expect(result.badLines).toBe(2);
      expect(result.rows).toEqual([
        {
          job: 'valid/job',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: validRecord.at,
          lastAt: validRecord.at,
        },
      ]);
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });
});
