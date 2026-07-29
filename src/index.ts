#!/usr/bin/env bun
import { printBanner } from '@olwiba/dx';
import { projectBanner } from './project.config';
import { runCheck } from './commands/check';
import { runSync } from './commands/sync';
import { runTemplate } from './commands/template';

await printBanner(projectBanner);

const HELP_FLAGS = new Set(['-h', '--help']);

function printHelp() {
  console.log(`
olwiba-sync

@olwiba/* package drift inspection and sync.

Usage:
  olwiba-sync
  olwiba-sync check
  olwiba-sync check <project-dir> [more-project-dirs...]
  olwiba-sync sync
  olwiba-sync sync [cn] [ui] [...] [-- <project-dir>]
  olwiba-sync env [directory]
  olwiba-sync env --check --keys src/env/env-keys.json [directory]
  olwiba-sync template [project-dir] [--template <path>] [--since <ref>] [--all]

Commands:
  check (default)  Read-only drift report for @olwiba/* package versions
  sync             Check, then apply recommended updates via bun add
  env              Environment file utilities
  template         Read-only file drift against the Genesis template

Package filters (sync only):
  cn, docs, ui, dx, sync, render, or @olwiba/<name>
  Omit filters to update all drifted tracked packages.

Template drift (template only):
  --template <path>  Genesis checkout (default: nexus layout, or GENESIS_TEMPLATE_PATH)
  --since <ref>      Split template changes since <ref> into adoptable vs conflicting
  --all              List every file instead of a capped sample

Default target:
  current working directory
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.some((arg) => HELP_FLAGS.has(arg))) {
    printHelp();
    process.exit(0);
  }

  const [command = 'check', ...commandArgs] = args;

  if (command === 'env') {
    const { runEnvCommand } = await import('./env/cli');
    await runEnvCommand(commandArgs);
    return;
  }

  if (command === 'check') {
    await runCheck(commandArgs);
    return;
  }

  if (command === 'sync') {
    await runSync(commandArgs);
    return;
  }

  if (command === 'template') {
    await runTemplate(commandArgs);
    return;
  }

  throw new Error(
    `Unsupported command: ${command}. Use "check", "sync", "env", or "template".`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
