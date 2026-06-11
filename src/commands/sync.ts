import {
  collectPendingUpdates,
  inspectManifest,
  loadTrackedPackages,
  parseSyncArgs,
  projectDirFromManifest,
  resolveConsumerTargets,
  type PackageSection,
  type PendingUpdate,
} from '../drift';
import { printCheckReport } from './check';

async function runBunAdd(projectDir: string, section: PackageSection, updates: PendingUpdate[]) {
  const specs = updates.map((update) => `${update.packageName}@${update.to}`);
  const args = ['bun', 'add', '--minimum-release-age', '0'];

  if (section === 'devDependencies') {
    args.push('-d');
  } else if (section === 'peerDependencies') {
    args.push('--peer');
  }

  args.push(...specs);

  const result = Bun.spawnSync(args, {
    cwd: projectDir,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  if (result.exitCode !== 0) {
    throw new Error(`bun add failed for ${section} updates in ${projectDir}`);
  }
}

async function applyUpdates(projectDir: string, updates: PendingUpdate[]) {
  const bySection = new Map<PackageSection, PendingUpdate[]>();

  for (const update of updates) {
    const existing = bySection.get(update.section) ?? [];
    existing.push(update);
    bySection.set(update.section, existing);
  }

  for (const section of ['dependencies', 'devDependencies', 'peerDependencies'] as PackageSection[]) {
    const sectionUpdates = bySection.get(section);
    if (!sectionUpdates?.length) continue;
    await runBunAdd(projectDir, section, sectionUpdates);
  }
}

export async function runSync(commandArgs: string[]) {
  const { filters, projectArgs } = parseSyncArgs(commandArgs);
  const token = process.env.PACKAGES_TOKEN;

  console.log('olwiba-sync — check and apply package updates');
  console.log('');
  console.log('Fetching current ecosystem package versions from registry...');

  const trackedPackages = await loadTrackedPackages(token);
  const consumerPackageJsonPaths = resolveConsumerTargets(projectArgs);
  const consumerManifests = consumerPackageJsonPaths
    .map((packageJsonPath) => inspectManifest(packageJsonPath, trackedPackages))
    .sort((left, right) => left.label.localeCompare(right.label));

  printCheckReport(trackedPackages, consumerManifests, 'check then apply');

  const allUpdates = consumerManifests.flatMap((manifest) =>
    collectPendingUpdates(manifest, trackedPackages, filters ?? undefined),
  );

  console.log('');
  console.log('Apply plan');
  if (filters) {
    console.log(`- package filter: ${[...filters].sort().join(', ')}`);
  } else {
    console.log('- package filter: all tracked @olwiba/* packages');
  }

  if (allUpdates.length === 0) {
    console.log('- no applicable updates');
    return;
  }

  for (const manifest of consumerManifests) {
    const manifestUpdates = collectPendingUpdates(manifest, trackedPackages, filters ?? undefined);
    if (manifestUpdates.length === 0) continue;

    const projectDir = projectDirFromManifest(manifest);
    console.log('');
    console.log(`${manifest.label}`);
    console.log(`- project: ${projectDir}`);

    for (const update of manifestUpdates) {
      console.log(`- [${update.section}] ${update.packageName} ${update.from} -> ${update.to}`);
    }

    await applyUpdates(projectDir, manifestUpdates);
    console.log('- applied');
  }

  console.log('');
  console.log('Done. Review package.json and lockfile before committing.');
}
