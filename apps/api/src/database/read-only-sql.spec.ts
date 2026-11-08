import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Static guard: the API source must never contain data-changing or DDL statements. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

describe('read-only data access', () => {
  const files = sourceFiles(join(__dirname, '..'));

  it('finds the repositories', () => {
    expect(files.filter((f) => f.endsWith('.repository.ts')).length).toBeGreaterThanOrEqual(5);
  });

  it('contains no INSERT/UPDATE/DELETE/MERGE/DDL/PL-SQL blocks in SQL text', () => {
    const forbidden =
      /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|MERGE\s+INTO|CREATE\s+|ALTER\s+|DROP\s+|TRUNCATE\s+|GRANT\s+|REVOKE\s+|BEGIN\b|EXECUTE\s+IMMEDIATE)/i;
    let checked = 0;
    for (const f of files) {
      const sqlStrings = readFileSync(f, 'utf8').match(/`[^`]*\b(SELECT|FROM)\b[^`]*`/g) ?? [];
      for (const s of sqlStrings) {
        checked++;
        expect({ file: f, bad: forbidden.test(s) }).toEqual({ file: f, bad: false });
      }
    }
    expect(checked).toBeGreaterThanOrEqual(15);
  });
});
