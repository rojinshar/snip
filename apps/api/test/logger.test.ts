import { describe, expect, it } from 'vitest';

import { createJsonLogger } from '../src/logger.ts';

describe('createJsonLogger', () => {
  it('writes one JSON object per call with timestamp, level and fields', () => {
    const lines: string[] = [];
    const logger = createJsonLogger(
      (line) => lines.push(line),
      () => new Date('2026-10-26T00:00:00.000Z'),
    );

    logger.info('request', { status: 200 });
    logger.error('boom');

    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { ts: '2026-10-26T00:00:00.000Z', level: 'info', msg: 'request', status: 200 },
      { ts: '2026-10-26T00:00:00.000Z', level: 'error', msg: 'boom' },
    ]);
  });
});
