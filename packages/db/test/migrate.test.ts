import { describe, expect, it } from 'vitest';

import { splitStatements } from '../scripts/migrate.ts';

describe('splitStatements', () => {
  it('splits on line-ending semicolons and drops comment lines', () => {
    const sql = `-- header
CREATE TABLE a (
  id int -- trailing comments stay inside the statement
);

-- index
CREATE INDEX a_id ON a (id);
`;
    expect(splitStatements(sql)).toEqual([
      'CREATE TABLE a (\n  id int -- trailing comments stay inside the statement\n)',
      'CREATE INDEX a_id ON a (id)',
    ]);
  });

  it('returns nothing for a comment-only file', () => {
    expect(splitStatements('-- nothing here\n')).toEqual([]);
  });
});
