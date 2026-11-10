import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from './reader.js';

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function registerDigestApi(app: Hono, config: Pick<RigConfig, 'runsDir'>): void {
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return c.notFound();

    try {
      const { rows, badLines } = readNight(config.runsDir, night);
      const sortedRows = [...rows].sort((left, right) =>
        left.job < right.job ? -1 : left.job > right.job ? 1 : 0,
      );
      return c.json({ rows: sortedRows, badLines });
    } catch (error) {
      if (isMissingFile(error)) return c.notFound();
      throw error;
    }
  });
}
