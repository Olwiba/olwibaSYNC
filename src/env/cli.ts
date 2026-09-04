import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateEnvValue } from './generate-value';
import { parseEnvExample } from './parse-env-example';
import { writeEnvFile } from './write-env-file';

/**
 * `olwiba-sync env` — environment file utilities.
 *
 *   olwiba-sync env [directory]
 *   olwiba-sync env --check --keys src/env/env-keys.json [directory]
 *
 * Write mode fills a `.env` from the project's own `.env.example`, generating
 * values for keys whose directive asks for one and keeping every other line
 * exactly as written — comments, order and spacing included. A `.env` people
 * can diff against the example is worth more than a minimal one.
 *
 * Check mode compares the example against a generated key manifest and reports
 * drift in both directions. It is the same class of check the template runs on
 * itself; here it is pointed at a downstream project, which is where the two
 * actually drift apart.
 */
export async function runEnvCommand(args: string[]): Promise<void> {
  const check = args.includes('--check');
  const keysIndex = args.indexOf('--keys');
  const keysPath = keysIndex >= 0 ? args[keysIndex + 1] : undefined;

  // Everything that is not a flag or a flag's value is the target directory.
  const positional = args.filter((arg, index) => {
    if (arg.startsWith('--')) return false;
    if (keysIndex >= 0 && index === keysIndex + 1) return false;
    return true;
  });
  const directory = resolve(positional[0] ?? process.cwd());

  const examplePath = join(directory, '.env.example');
  if (!existsSync(examplePath)) {
    throw new Error(`No .env.example found in ${directory}`);
  }

  const specs = parseEnvExample(readFileSync(examplePath, 'utf8'));

  if (check) {
    if (!keysPath) throw new Error('--check requires --keys <path to env-keys.json>');
    const resolvedKeys = resolve(directory, keysPath);
    if (!existsSync(resolvedKeys)) throw new Error(`No key manifest at ${resolvedKeys}`);

    const manifest = JSON.parse(readFileSync(resolvedKeys, 'utf8')) as { keys?: string[] };
    const expected = new Set(manifest.keys ?? []);
    const declared = new Set(specs.map((spec) => spec.key));

    const missing = [...expected].filter((key) => !declared.has(key)).sort();
    const extra = [...declared].filter((key) => !expected.has(key)).sort();

    if (missing.length === 0 && extra.length === 0) {
      console.log(`.env.example matches ${expected.size} key(s) in ${keysPath}`);
      return;
    }

    if (missing.length) console.error(`Missing from .env.example: ${missing.join(', ')}`);
    if (extra.length) console.error(`Not in the manifest: ${extra.join(', ')}`);
    // Non-zero so this is usable as a CI gate, which is the only reason a
    // check mode exists separately from writing.
    process.exitCode = 1;
    return;
  }

  const outputPath = join(directory, '.env');
  if (existsSync(outputPath)) {
    // Refuses rather than merges. A .env holds the only copy of secrets on a
    // machine, and a tool that rewrites one is a tool that can destroy them.
    throw new Error(`${outputPath} already exists — remove it first or edit it by hand`);
  }

  const values: Record<string, string> = {};
  let generated = 0;
  for (const spec of specs) {
    if (!spec.generate) continue;
    values[spec.key] = generateEnvValue(spec.generate);
    generated += 1;
  }

  writeEnvFile({ examplePath, outputPath, values });
  console.log(
    `Wrote ${outputPath} from .env.example (${generated} generated value(s), ${specs.length} key(s))`,
  );
}
