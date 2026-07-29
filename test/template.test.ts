import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  classifyPendingChanges,
  compareToTemplate,
  isIgnored,
  listTemplateFiles,
  summariseByArea,
} from '../src/template';

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'olwiba-template-'));
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

describe('isIgnored', () => {
  test('skips build output, installed packages, and generated files', () => {
    expect(isIgnored('node_modules/foo/index.js')).toBe(true);
    expect(isIgnored('dist/server/server.js')).toBe(true);
    expect(isIgnored('.source/browser.ts')).toBe(true);
    expect(isIgnored('src/routeTree.gen.ts')).toBe(true);
    expect(isIgnored('bun.lock')).toBe(true);
  });

  test('skips local secrets and databases', () => {
    expect(isIgnored('.env')).toBe(true);
    expect(isIgnored('.env.local')).toBe(true);
    expect(isIgnored('dev.db')).toBe(true);
  });

  test('keeps .env.example — it carries the @genesis module declarations', () => {
    expect(isIgnored('.env.example')).toBe(false);
    expect(isIgnored('services/whatsapp/.env.example')).toBe(false);
    expect(isIgnored('.env.production')).toBe(true);
  });

  test('keeps real source and config', () => {
    expect(isIgnored('src/routes/(app)/route.tsx')).toBe(false);
    expect(isIgnored('.env.example')).toBe(false);
    expect(isIgnored('prisma/schema.prisma')).toBe(false);
    expect(isIgnored('package.json')).toBe(false);
  });
});

describe('listTemplateFiles', () => {
  test('walks the tree and excludes ignored paths', () => {
    const root = tree({
      'package.json': '{}',
      'src/app.ts': 'export const a = 1;',
      'node_modules/pkg/index.js': 'ignored',
      'dist/out.js': 'ignored',
      '.env': 'SECRET=1',
    });

    try {
      expect(listTemplateFiles(root).sort()).toEqual(['package.json', 'src/app.ts']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('compareToTemplate', () => {
  test('classifies identical, modified, and absent files', () => {
    const template = tree({
      'a.ts': 'same\n',
      'b.ts': 'template version\n',
      'c.ts': 'only in template\n',
    });
    const project = tree({
      'a.ts': 'same\n',
      'b.ts': 'project version\n',
      'extra.ts': 'project only\n',
    });

    try {
      const drift = compareToTemplate(template, project);
      const byPath = new Map(drift.map((entry) => [entry.path, entry.status]));

      expect(byPath.get('a.ts')).toBe('identical');
      expect(byPath.get('b.ts')).toBe('modified');
      expect(byPath.get('c.ts')).toBe('absent');
      // Project-only files are not template drift and are not reported.
      expect(byPath.has('extra.ts')).toBe(false);
    } finally {
      rmSync(template, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('CRLF and trailing whitespace do not count as divergence', () => {
    // A Windows checkout against a Linux one would otherwise report every
    // shared file as diverged, drowning the real signal completely.
    const template = tree({ 'a.ts': 'line one\nline two\n' });
    const project = tree({ 'a.ts': 'line one\r\nline two   \r\n' });

    try {
      expect(compareToTemplate(template, project)[0]!.status).toBe('identical');
    } finally {
      rmSync(template, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });
});

describe('classifyPendingChanges', () => {
  test('marks a file the project never touched as adoptable', () => {
    const template = tree({ 'a.ts': 'template moved on\n' });
    const project = tree({ 'a.ts': 'original\n' });

    try {
      const pending = classifyPendingChanges(
        template,
        project,
        ['a.ts'],
        new Map([['a.ts', 'original\n']]),
      );
      expect(pending).toEqual([{ path: 'a.ts', status: 'adoptable' }]);
    } finally {
      rmSync(template, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('marks a file both sides changed as a conflict', () => {
    const template = tree({ 'a.ts': 'template moved on\n' });
    const project = tree({ 'a.ts': 'project moved on too\n' });

    try {
      const pending = classifyPendingChanges(
        template,
        project,
        ['a.ts'],
        new Map([['a.ts', 'original\n']]),
      );
      expect(pending).toEqual([{ path: 'a.ts', status: 'conflict' }]);
    } finally {
      rmSync(template, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('skips a file that already agrees with the template', () => {
    // Both sides landed the same edit — e.g. a shared reformat. Counting this
    // as a conflict inflated the queue by a third on the first real run.
    const template = tree({ 'a.ts': 'converged\n' });
    const project = tree({ 'a.ts': 'converged\n' });

    try {
      const pending = classifyPendingChanges(
        template,
        project,
        ['a.ts'],
        new Map([['a.ts', 'original\n']]),
      );
      expect(pending).toEqual([]);
    } finally {
      rmSync(template, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('reports a changed file the project does not have', () => {
    const template = tree({ 'a.ts': 'template only\n' });
    const project = tree({ 'other.ts': 'x\n' });

    try {
      const pending = classifyPendingChanges(template, project, ['a.ts'], new Map());
      expect(pending).toEqual([{ path: 'a.ts', status: 'absent' }]);
    } finally {
      rmSync(template, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('treats a file with no version at ref as a conflict', () => {
    const template = tree({ 'a.ts': 'template added it\n' });
    const project = tree({ 'a.ts': 'project has its own\n' });

    try {
      const pending = classifyPendingChanges(
        template,
        project,
        ['a.ts'],
        new Map([['a.ts', null]]),
      );
      expect(pending).toEqual([{ path: 'a.ts', status: 'conflict' }]);
    } finally {
      rmSync(template, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('ignores generated paths even when the template changed them', () => {
    const template = tree({ 'bun.lock': 'a\n' });
    const project = tree({ 'bun.lock': 'b\n' });

    try {
      expect(classifyPendingChanges(template, project, ['bun.lock'], new Map())).toEqual([]);
    } finally {
      rmSync(template, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });
});

describe('summariseByArea', () => {
  test('groups src two levels deep and orders by divergence', () => {
    const summary = summariseByArea([
      { path: 'src/routes/a.tsx', status: 'modified' },
      { path: 'src/routes/b.tsx', status: 'modified' },
      { path: 'src/routes/c.tsx', status: 'identical' },
      { path: 'src/lib/x.ts', status: 'modified' },
      { path: 'package.json', status: 'identical' },
    ]);

    expect([...summary.keys()][0]).toBe('src/routes');
    expect(summary.get('src/routes')).toEqual({ modified: 2, total: 3 });
    expect(summary.get('src/lib')).toEqual({ modified: 1, total: 1 });
    expect(summary.get('(root)')).toEqual({ modified: 0, total: 1 });
  });

  test('excludes absent files from area totals', () => {
    const summary = summariseByArea([{ path: 'src/routes/gone.tsx', status: 'absent' }]);
    expect(summary.size).toBe(0);
  });
});
