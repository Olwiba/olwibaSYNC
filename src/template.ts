/**
 * Template drift: how far a Genesis-spawned project has moved from the
 * template it came from.
 *
 * The package side of this ecosystem already has a propagation mechanism —
 * `@olwiba/*` ship through npm, and `check`/`sync` keep consumers current. The
 * template side has none. A project scaffolded from Genesis is a fork from the
 * moment it is created: every later Genesis fix has to be re-applied by hand,
 * and nothing reports that it is owed.
 *
 * This does not merge anything. It answers two questions:
 *
 *   1. Which files does this project share with Genesis, and which differ?
 *   2. Of the files Genesis changed since <ref>, which has this project *not*
 *      touched — i.e. which can be adopted without a manual merge?
 *
 * Question 2 needs no new state file. Comparing the project's copy against
 * Genesis at `ref` is enough: identical means the project never diverged from
 * that revision, so Genesis's newer version can be taken wholesale. Different
 * means both sides moved and a human has to decide.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';

/**
 * Never meaningful to compare: build output, installed packages, generated
 * files, local secrets. Mirrors what `genesis-start` refuses to copy — a file
 * it never delivers can't be drift.
 */
const IGNORED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.output',
  '.source',
  '.content-collections',
  '.vinxi',
  '.tanstack',
  'tmp-shadcn-blocks',
]);

const IGNORED_FILES = new Set([
  'bun.lock',
  'routeTree.gen.ts',
  'dev.db',
  'bash.exe.stackdump',
  '.DS_Store',
]);

/**
 * Local, per-project by definition — divergence here is never interesting.
 *
 * `.env.example` is deliberately *not* ignored: it is committed, and it carries
 * the `# @genesis` module and flag declarations, which makes it one of the most
 * drift-prone files in the template rather than a local secret.
 */
const IGNORED_PATTERNS = [/^\.env$/, /^\.env\.(?!example$)/, /\.db$/, /\.log$/];

export type DriftStatus =
  /** Byte-identical. */
  | 'identical'
  /** Both have it, contents differ. */
  | 'modified'
  /** Genesis has it, the project does not — stripped module, or deleted. */
  | 'absent';

export type FileDrift = {
  path: string;
  status: DriftStatus;
};

export type AdoptStatus =
  /** Genesis changed it; the project never diverged from `ref`. Safe to take. */
  | 'adoptable'
  /** Genesis changed it and so did the project. Needs a human. */
  | 'conflict'
  /** Genesis changed it; the project does not have the file at all. */
  | 'absent';

export type PendingChange = {
  path: string;
  status: AdoptStatus;
};

export function isIgnored(relativePath: string): boolean {
  const parts = relativePath.split(/[\\/]/);
  if (parts.some((part) => IGNORED_SEGMENTS.has(part))) return true;

  const name = parts[parts.length - 1] ?? '';
  if (IGNORED_FILES.has(name)) return true;
  return IGNORED_PATTERNS.some((pattern) => pattern.test(name));
}

/** Every comparable file in a template checkout, as repo-relative POSIX paths. */
export function listTemplateFiles(root: string, current = root, out: string[] = []): string[] {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const full = join(current, entry.name);
    const rel = relative(root, full).split(sep).join('/');
    if (isIgnored(rel)) continue;

    if (entry.isDirectory()) listTemplateFiles(root, full, out);
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Text files are compared ignoring line endings and trailing whitespace.
 *
 * A Windows checkout and a Linux one differ on every line of every file, which
 * would drown the signal completely. `.gitattributes` normalisation means the
 * committed bytes agree even when the working copies don't.
 */
function normalisedHash(path: string): string {
  const buffer = readFileSync(path);
  // Treat as binary if it contains a NUL in the first block.
  if (buffer.subarray(0, 8000).includes(0)) return hashFile(path);

  const text = buffer
    .toString('utf8')
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/, '\n');
  return createHash('sha256').update(text).digest('hex');
}

function sameContent(left: string, right: string): boolean {
  return normalisedHash(left) === normalisedHash(right);
}

/** Straight comparison of a project against a template checkout. */
export function compareToTemplate(templateRoot: string, projectRoot: string): FileDrift[] {
  return listTemplateFiles(templateRoot).map((path) => {
    const projectFile = join(projectRoot, path);
    if (!existsSync(projectFile)) return { path, status: 'absent' as const };

    return {
      path,
      status: sameContent(join(templateRoot, path), projectFile)
        ? ('identical' as const)
        : ('modified' as const),
    };
  });
}

/**
 * Classifies the files a template changed since `ref` by whether the project
 * can take the new version safely.
 *
 * `filesAtRef` maps a path to its contents in the template at `ref` — read from
 * the template's own git history by the caller, so no baseline file has to be
 * committed into the project.
 */
export function classifyPendingChanges(
  templateRoot: string,
  projectRoot: string,
  changedPaths: string[],
  filesAtRef: Map<string, string | null>,
): PendingChange[] {
  const pending: PendingChange[] = [];

  for (const path of changedPaths) {
    if (isIgnored(path)) continue;

    const templateFile = join(templateRoot, path);
    const projectFile = join(projectRoot, path);

    // Deleted from the template, or added after `ref` — nothing to adopt into.
    if (!existsSync(templateFile)) continue;
    if (!existsSync(projectFile)) {
      pending.push({ path, status: 'absent' });
      continue;
    }

    // Already agrees with the template's current version: the change has been
    // taken (or both sides landed the same edit independently — a shared
    // reformat does this to dozens of files). Nothing owed either way.
    if (sameContent(templateFile, projectFile)) continue;

    const atRef = filesAtRef.get(path);
    if (atRef === undefined || atRef === null) {
      // No `ref` version to compare against (new file since then): the project
      // has its own copy that the template did not give it.
      pending.push({ path, status: 'conflict' });
      continue;
    }

    const refHash = createHash('sha256')
      .update(atRef.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '\n'))
      .digest('hex');

    pending.push({
      path,
      // Project still matches the template at `ref` → it never diverged, so the
      // newer template version can replace it wholesale.
      status: refHash === normalisedHash(projectFile) ? 'adoptable' : 'conflict',
    });
  }

  return pending;
}

/** Drift grouped by top-level area, so the output reads as a work queue. */
export function summariseByArea(drift: FileDrift[]): Map<string, { modified: number; total: number }> {
  const areas = new Map<string, { modified: number; total: number }>();

  for (const entry of drift) {
    if (entry.status === 'absent') continue;

    const segments = entry.path.split('/');
    // Two levels for src/, one otherwise — "src/routes" is useful, "src" is not.
    const area =
      segments[0] === 'src' && segments.length > 2
        ? `${segments[0]}/${segments[1]}`
        : segments.length > 1
          ? segments[0]!
          : '(root)';

    const bucket = areas.get(area) ?? { modified: 0, total: 0 };
    bucket.total += 1;
    if (entry.status === 'modified') bucket.modified += 1;
    areas.set(area, bucket);
  }

  return new Map([...areas].sort((left, right) => right[1].modified - left[1].modified));
}
