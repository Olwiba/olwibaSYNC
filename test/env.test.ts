import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseEnvExample } from '../src/env/parse-env-example';
import { writeEnvFile } from '../src/env/write-env-file';
import { generateEnvValue } from '../src/env/generate-value';

const EXAMPLE = [
  '# @genesis scope=server generate=random:base64:32 secret prompt="Auth secret"',
  'BETTER_AUTH_SECRET=""',
  '',
  '# a plain comment',
  'APP_NAME="Demo"',
  '',
  'UNDESCRIBED=1',
  '',
].join('\n');

describe('parseEnvExample', () => {
  test('reads the directive above each key', () => {
    const [secret] = parseEnvExample(EXAMPLE);
    expect(secret).toMatchObject({
      key: 'BETTER_AUTH_SECRET',
      generate: 'random:base64:32',
      secret: true,
      prompt: 'Auth secret',
    });
  });

  test('a key with no directive is still a key', () => {
    const keys = parseEnvExample(EXAMPLE).map((spec) => spec.key);
    // Dropping undescribed keys would make a "complete" report quietly partial.
    expect(keys).toEqual(['BETTER_AUTH_SECRET', 'APP_NAME', 'UNDESCRIBED']);
  });

  test('surrounding quotes are not part of the default', () => {
    const appName = parseEnvExample(EXAMPLE).find((spec) => spec.key === 'APP_NAME');
    expect(appName?.defaultValue).toBe('Demo');
  });

  test('a CRLF file parses identically', () => {
    // The directive match depends on a newline between it and the key, so a
    // CRLF file silently yielded nothing before line endings were normalised.
    const parsed = parseEnvExample(EXAMPLE.replace(/\n/g, '\r\n'));
    expect(parsed).toHaveLength(3);
    expect(parsed[0]?.generate).toBe('random:base64:32');
  });

  test('only known generate kinds are honoured', () => {
    const rogue = '# @genesis generate=curl:evil.sh\nX=1\n';
    expect(parseEnvExample(rogue)[0]?.generate).toBeUndefined();
  });
});

describe('generateEnvValue', () => {
  test('base64 and hex differ in shape and never repeat', () => {
    expect(generateEnvValue('random:base64:32')).not.toBe(generateEnvValue('random:base64:32'));
    expect(generateEnvValue('random:hex:32')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('writeEnvFile', () => {
  test('substitutes values while preserving every other line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'olwiba-env-'));
    const examplePath = join(dir, '.env.example');
    const outputPath = join(dir, '.env');
    writeFileSync(examplePath, EXAMPLE, 'utf8');

    writeEnvFile({ examplePath, outputPath, values: { BETTER_AUTH_SECRET: 'abc123' } });
    const written = readFileSync(outputPath, 'utf8');

    expect(written).toContain('BETTER_AUTH_SECRET=abc123');
    // Comments, blank lines and untouched keys survive, so the result stays
    // diffable against the example it came from.
    expect(written).toContain('# a plain comment');
    expect(written).toContain('APP_NAME="Demo"');
  });

  test('quotes a value that would otherwise break the line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'olwiba-env-'));
    const examplePath = join(dir, '.env.example');
    const outputPath = join(dir, '.env');
    writeFileSync(examplePath, 'TOKEN=""\n', 'utf8');

    writeEnvFile({ examplePath, outputPath, values: { TOKEN: 'has space #and hash' } });
    expect(readFileSync(outputPath, 'utf8')).toContain('TOKEN="has space #and hash"');
  });
});
