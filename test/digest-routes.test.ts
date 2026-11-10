import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const fixture = fileURLToPath(new URL('../runs/2026-10-28.jsonl', import.meta.url));
const expectedJobs = [
  'digest/render',
  'fixtures/refresh',
  'lane/sync',
  'notes/backup',
  'rig/rotate-logs',
];

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

let runsDir: string;

function jobsInPage(html: string, jobs: string[]) {
  for (const job of jobs) expect(html).toContain(job);

  return jobs
    .map((job) => ({ job, index: html.indexOf(job) }))
    .sort((left, right) => left.index - right.index)
    .map(({ job }) => job);
}

function rowsFromJson(payload: unknown): Array<{ job: string }> {
  if (typeof payload !== 'object' || payload === null || !('rows' in payload) || !Array.isArray(payload.rows)) {
    throw new Error('Expected digest JSON to contain a rows array');
  }

  return payload.rows as Array<{ job: string }>;
}

describe('digest routes', () => {
  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
    copyFileSync(fixture, join(runsDir, '2026-10-28.jsonl'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  it('renders 2026-10-28 and returns the same sorted jobs from the JSON route', async () => {
    const app = createApp({ ...config, runsDir });
    const pageResponse = await app.request('/digest/2026-10-28');
    const apiResponse = await app.request('/api/digest/2026-10-28');

    expect(pageResponse.status).toBe(200);
    expect(apiResponse.status).toBe(200);

    const pageJobs = jobsInPage(await pageResponse.text(), expectedJobs);
    const apiRows = rowsFromJson(await apiResponse.json());
    expect(apiRows.map(({ job }) => job)).toEqual(pageJobs);
    expect(pageJobs).toEqual(expectedJobs);
  });

  it('returns 404 for a night with no file from both routes', async () => {
    const app = createApp({ ...config, runsDir });

    const pageResponse = await app.request('/digest/missing-night');
    const apiResponse = await app.request('/api/digest/missing-night');

    expect(pageResponse.status).toBe(404);
    expect(apiResponse.status).toBe(404);
  });

  it('renders an empty night and returns no JSON rows', async () => {
    writeFileSync(join(runsDir, 'empty-night.jsonl'), '');
    const app = createApp({ ...config, runsDir });

    const pageResponse = await app.request('/digest/empty-night');
    const apiResponse = await app.request('/api/digest/empty-night');

    expect(pageResponse.status).toBe(200);
    expect(await pageResponse.text()).toContain('nothing ran');
    expect(apiResponse.status).toBe(200);
    expect(rowsFromJson(await apiResponse.json())).toEqual([]);
  });

  it('keeps valid rows when a night contains a malformed line', async () => {
    const night = 'malformed-night';
    writeFileSync(
      join(runsDir, `${night}.jsonl`),
      [
        JSON.stringify({
          at: '2026-10-28T10:00:00-04:00',
          job: 'surviving/job',
          status: 'ok',
          owner: null,
        }),
        '{"at":"truncated"',
      ].join('\n'),
    );
    const app = createApp({ ...config, runsDir });

    const pageResponse = await app.request(`/digest/${night}`);
    const apiResponse = await app.request(`/api/digest/${night}`);

    expect(pageResponse.status).toBe(200);
    expect(jobsInPage(await pageResponse.text(), ['surviving/job'])).toEqual(['surviving/job']);
    expect(apiResponse.status).toBe(200);
    expect(rowsFromJson(await apiResponse.json()).map(({ job }) => job)).toEqual(['surviving/job']);
  });
});
