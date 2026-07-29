import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  classifyPendingChanges,
  compareToTemplate,
  summariseByArea,
  type PendingChange,
} from '../template';

type TemplateArgs = {
  projectRoot: string;
  templateRoot: string;
  since: string | null;
  listAll: boolean;
};

function fail(message: string): never {
  throw new Error(message);
}

/**
 * Locates the template checkout. `--template` wins; otherwise the nexus layout
 * is assumed, since that is where a private Genesis checkout actually lives.
 */
function resolveTemplateRoot(explicit: string | null, projectRoot: string): string {
  const candidates = explicit
    ? [explicit]
    : [
        process.env.GENESIS_TEMPLATE_PATH,
        join(projectRoot, '../../repos/genesis'),
        join(projectRoot, '../genesis'),
      ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const root = resolve(candidate);
    if (existsSync(join(root, 'package.json')) && existsSync(join(root, 'src/routes/__root.tsx'))) {
      return root;
    }
  }

  fail(
    'Template checkout not found. Pass --template <path>, or set GENESIS_TEMPLATE_PATH.\n' +
      'A Genesis checkout is required — this compares files, not published packages.',
  );
}

function parseArgs(args: string[]): TemplateArgs {
  let template: string | null = null;
  let since: string | null = null;
  let listAll = false;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--template') template = args[++index] ?? fail('--template needs a path');
    else if (arg === '--since') since = args[++index] ?? fail('--since needs a git ref');
    else if (arg === '--all') listAll = true;
    else if (arg.startsWith('-')) fail(`Unknown flag: ${arg}`);
    else positional.push(arg);
  }

  const projectRoot = resolve(positional[0] ?? process.cwd());
  if (!existsSync(join(projectRoot, 'package.json'))) {
    fail(`No package.json in ${projectRoot} — is that a project directory?`);
  }

  return { projectRoot, templateRoot: resolveTemplateRoot(template, projectRoot), since, listAll };
}

/**
 * stderr is discarded on purpose. `git show <ref>:<path>` is the intended way
 * to ask "did this exist at ref", and it answers no by writing `fatal: path
 * ... exists on disk, but not in <ref>` and exiting non-zero. Inheriting that
 * stream buries the actual report under one line of noise per new file.
 */
function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** Paths the template changed between `ref` and its working tree. */
function changedSince(templateRoot: string, ref: string): string[] {
  const output = git(templateRoot, ['diff', '--name-only', ref, '--']);
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function contentsAtRef(
  templateRoot: string,
  ref: string,
  paths: string[],
): Map<string, string | null> {
  const contents = new Map<string, string | null>();
  for (const path of paths) {
    try {
      contents.set(path, git(templateRoot, ['show', `${ref}:${path}`]));
    } catch {
      contents.set(path, null); // did not exist at ref
    }
  }
  return contents;
}

function percent(part: number, whole: number): string {
  return whole === 0 ? '0%' : `${Math.round((part / whole) * 100)}%`;
}

export async function runTemplate(args: string[]) {
  const { projectRoot, templateRoot, since, listAll } = parseArgs(args);

  console.log('olwiba-sync — template drift inspection (read-only)');
  console.log('');
  console.log(`Project:  ${projectRoot}`);
  console.log(`Template: ${templateRoot}`);

  const drift = compareToTemplate(templateRoot, projectRoot);
  const shared = drift.filter((entry) => entry.status !== 'absent');
  const modified = shared.filter((entry) => entry.status === 'modified');
  const absent = drift.filter((entry) => entry.status === 'absent');

  console.log('');
  console.log('Shared files');
  console.log(`- shared with template: ${shared.length}`);
  console.log(`- identical:            ${shared.length - modified.length}`);
  console.log(`- diverged:             ${modified.length} (${percent(modified.length, shared.length)})`);
  console.log(`- not in project:       ${absent.length} (stripped modules or deletions)`);

  console.log('');
  console.log('Divergence by area');
  const areas = summariseByArea(shared);
  if (areas.size === 0) {
    console.log('- none');
  } else {
    for (const [area, counts] of areas) {
      if (counts.modified === 0) continue;
      console.log(`- ${area}: ${counts.modified}/${counts.total} diverged`);
    }
  }

  if (since) {
    reportPending(templateRoot, projectRoot, since, listAll);
  } else {
    console.log('');
    console.log(
      'Pass --since <git-ref> to see which template changes this project can still adopt.',
    );
  }

  if (listAll) {
    console.log('');
    console.log('Diverged files');
    for (const entry of modified) console.log(`- ${entry.path}`);
  } else if (modified.length > 0) {
    console.log('');
    console.log('Pass --all to list every diverged file.');
  }
}

function reportPending(
  templateRoot: string,
  projectRoot: string,
  since: string,
  listAll: boolean,
) {
  let changedPaths: string[];
  try {
    changedPaths = changedSince(templateRoot, since);
  } catch {
    console.log('');
    console.log(`Could not read template history at "${since}" — is it a valid git ref?`);
    return;
  }

  const atRef = contentsAtRef(templateRoot, since, changedPaths);
  const pending = classifyPendingChanges(templateRoot, projectRoot, changedPaths, atRef);

  const byStatus = (status: PendingChange['status']) => pending.filter((p) => p.status === status);
  const adoptable = byStatus('adoptable');
  const conflicts = byStatus('conflict');
  const missing = byStatus('absent');

  console.log('');
  console.log(`Template changes since ${since}`);
  console.log(`- files the template changed: ${pending.length}`);
  console.log(`- adoptable (project untouched since ref): ${adoptable.length}`);
  console.log(`- conflicts (both sides changed):          ${conflicts.length}`);
  console.log(`- not present in project:                  ${missing.length}`);

  const show = (label: string, entries: PendingChange[], limit: number) => {
    if (entries.length === 0) return;
    console.log('');
    console.log(label);
    const visible = listAll ? entries : entries.slice(0, limit);
    for (const entry of visible) console.log(`- ${entry.path}`);
    if (!listAll && entries.length > visible.length) {
      console.log(`- ...and ${entries.length - visible.length} more (--all to list)`);
    }
  };

  show('Adoptable — copy from the template as-is', adoptable, 20);
  show('Conflicts — both sides changed, merge by hand', conflicts, 20);
}
