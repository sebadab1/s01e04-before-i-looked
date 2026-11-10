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

type DigestJson = { rows: Array<{ job: string }>; badLines: number };

function digestFromJson(payload: unknown): DigestJson {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('rows' in payload) ||
    !Array.isArray(payload.rows) ||
    !('badLines' in payload) ||
    typeof payload.badLines !== 'number'
  ) {
    throw new Error('Expected digest JSON to contain rows and badLines');
  }

  return { rows: payload.rows as Array<{ job: string }>, badLines: payload.badLines };
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
    const digest = digestFromJson(await apiResponse.json());
    expect(digest.rows.map(({ job }) => job)).toEqual(pageJobs);
    expect(digest.badLines).toBe(1);
    expect(pageJobs).toEqual(expectedJobs);
  });

  it('returns 404 for a night with no file from both routes', async () => {
    const app = createApp({ ...config, runsDir });

    const pageResponse = await app.request('/digest/2026-10-29');
    const apiResponse = await app.request('/api/digest/2026-10-29');

    expect(pageResponse.status).toBe(404);
    expect(apiResponse.status).toBe(404);
  });

  it('renders an empty night and returns no JSON rows', async () => {
    writeFileSync(join(runsDir, '2026-10-30.jsonl'), '');
    const app = createApp({ ...config, runsDir });

    const pageResponse = await app.request('/digest/2026-10-30');
    const apiResponse = await app.request('/api/digest/2026-10-30');

    expect(pageResponse.status).toBe(200);
    expect(await pageResponse.text()).toContain('nothing ran');
    expect(apiResponse.status).toBe(200);
    expect(digestFromJson(await apiResponse.json()).rows).toEqual([]);
  });

  it('keeps valid rows when a night contains a malformed line', async () => {
    const night = '2026-10-31';
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
    const digest = digestFromJson(await apiResponse.json());
    expect(digest.rows.map(({ job }) => job)).toEqual(['surviving/job']);
    expect(digest.badLines).toBe(1);
  });
});
