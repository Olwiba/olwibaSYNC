#!/usr/bin/env bun
import { existsSync, readFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';

type PackageSection = 'dependencies' | 'devDependencies' | 'peerDependencies';

type PackageJson = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

type TrackedPackage = {
  name: string;
  version: string;
};

type UsageRecord = {
  packageName: string;
  section: PackageSection;
  declaredSpec: string;
};

type InspectedManifest = {
  label: string;
  packageJsonPath: string;
  packageJson: PackageJson;
  usages: UsageRecord[];
};

type UsageStatus = 'up_to_date' | 'update_recommended' | 'ahead_of_baseline' | 'manual_review';

type UsageAnalysis = {
  status: UsageStatus;
  currentVersion: string;
  note: string;
};

const HELP_FLAGS = new Set(['-h', '--help']);
const SECTION_ORDER: PackageSection[] = ['dependencies', 'devDependencies', 'peerDependencies'];
const REGISTRY_URL = 'https://npm.pkg.github.com';

const ECOSYSTEM_PACKAGES = [
  '@olwiba/cn',
  '@olwiba/docs',
  '@olwiba/genesis-render',
  '@olwiba/genesis-sync',
  '@olwiba/ui',
];

function printHelp() {
  console.log(`
genesis-sync

Read-only Genesis ecosystem drift inspection.

Usage:
  genesis-sync
  genesis-sync check
  genesis-sync check <project-dir> [more-project-dirs...]

Requirements:
  PACKAGES_TOKEN — GitHub token with read:packages scope

Default target:
  current working directory
`);
}

function getToken(): string {
  const token = process.env.PACKAGES_TOKEN;
  if (!token) {
    console.error(
      'Error: PACKAGES_TOKEN is not set.\n' +
      'genesis-sync needs a GitHub token with read:packages scope to fetch the current\n' +
      'published versions of @olwiba/* and @genesis/* packages from the registry.\n' +
      '\n' +
      'Copy .env.example to .env and fill in your token, or set it inline:\n' +
      '  PACKAGES_TOKEN=ghp_... genesis-sync check'
    );
    process.exit(1);
  }
  return token;
}

async function fetchLatestVersion(packageName: string, token: string): Promise<string> {
  const encodedName = packageName.replace('/', '%2F');
  const url = `${REGISTRY_URL}/${encodedName}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.npm.install-v1+json',
      },
    });
  } catch (error) {
    throw new Error(
      `Network error fetching ${packageName} from registry: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Registry returned HTTP ${response.status} for ${packageName}.\n` +
      `Check that GITHUB_PACKAGES_TOKEN has read:packages scope and the package exists at ${REGISTRY_URL}.`
    );
  }

  const data = await response.json() as { 'dist-tags'?: { latest?: string } };
  const latest = data['dist-tags']?.latest;

  if (!latest) {
    throw new Error(
      `Could not determine latest version for ${packageName} — dist-tags.latest missing in registry response.`
    );
  }

  return latest;
}

async function loadTrackedPackages(token: string): Promise<Map<string, TrackedPackage>> {
  const results = await Promise.allSettled(
    ECOSYSTEM_PACKAGES.map(async (name) => {
      const version = await fetchLatestVersion(name, token);
      return { name, version };
    })
  );

  const trackedPackages = new Map<string, TrackedPackage>();

  for (const result of results) {
    if (result.status === 'rejected') {
      throw new Error(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
    trackedPackages.set(result.value.name, result.value);
  }

  return trackedPackages;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

function resolvePackageJsonPath(target: string): string {
  const absoluteTarget = resolve(process.cwd(), target);
  const packageJsonPath = absoluteTarget.endsWith('package.json')
    ? absoluteTarget
    : join(absoluteTarget, 'package.json');

  if (!existsSync(packageJsonPath)) {
    throw new Error(`No package.json found for target: ${target}`);
  }

  return packageJsonPath;
}

function inspectManifest(packageJsonPath: string, trackedPackages: Map<string, TrackedPackage>): InspectedManifest {
  const packageJson = readJsonFile<PackageJson>(packageJsonPath);
  const usages: UsageRecord[] = [];

  for (const section of SECTION_ORDER) {
    const declarations = packageJson[section];
    if (!declarations) {
      continue;
    }

    for (const [packageName, declaredSpec] of Object.entries(declarations)) {
      if (!trackedPackages.has(packageName)) {
        continue;
      }

      usages.push({ packageName, section, declaredSpec });
    }
  }

  return {
    label: packageJson.name ?? basename(dirname(packageJsonPath)),
    packageJsonPath,
    packageJson,
    usages: usages.sort((left, right) => {
      if (left.packageName === right.packageName) {
        return SECTION_ORDER.indexOf(left.section) - SECTION_ORDER.indexOf(right.section);
      }
      return left.packageName.localeCompare(right.packageName);
    }),
  };
}

function parseExactVersion(spec: string): { major: number; minor: number; patch: number } | null {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(spec.trim())) {
    return null;
  }

  const [core] = spec.trim().split('-');
  const [major, minor, patch] = core.split('.').map(Number);
  return { major, minor, patch };
}

function compareExactVersions(left: string, right: string): number {
  const leftVersion = parseExactVersion(left);
  const rightVersion = parseExactVersion(right);

  if (!leftVersion || !rightVersion) {
    throw new Error(`Cannot compare non-exact versions: ${left} vs ${right}`);
  }

  if (leftVersion.major !== rightVersion.major) return leftVersion.major - rightVersion.major;
  if (leftVersion.minor !== rightVersion.minor) return leftVersion.minor - rightVersion.minor;
  return leftVersion.patch - rightVersion.patch;
}

function analyzeUsage(declaredSpec: string, currentVersion: string): UsageAnalysis {
  if (!parseExactVersion(declaredSpec)) {
    return {
      status: 'manual_review',
      currentVersion,
      note: `manual review: non-exact spec (${declaredSpec})`,
    };
  }

  const comparison = compareExactVersions(declaredSpec, currentVersion);

  if (comparison === 0) {
    return { status: 'up_to_date', currentVersion, note: 'up to date' };
  }

  if (comparison < 0) {
    return {
      status: 'update_recommended',
      currentVersion,
      note: `recommended update to ${currentVersion}`,
    };
  }

  return {
    status: 'ahead_of_baseline',
    currentVersion,
    note: `declared version is newer than current registry baseline (${currentVersion})`,
  };
}

function buildReportLine(usage: UsageRecord, analysis: UsageAnalysis): string {
  if (analysis.status === 'up_to_date') {
    return `- [${usage.section}] ${usage.packageName} ${usage.declaredSpec} | ${analysis.note}`;
  }

  if (analysis.status === 'update_recommended') {
    return `- [${usage.section}] ${usage.packageName} ${usage.declaredSpec} -> ${analysis.currentVersion} | ${analysis.note}`;
  }

  return `- [${usage.section}] ${usage.packageName} ${usage.declaredSpec} | ${analysis.note}`;
}

function summarizeAnalyses(analyses: UsageAnalysis[]) {
  return analyses.reduce(
    (summary, analysis) => {
      summary[analysis.status] += 1;
      return summary;
    },
    { up_to_date: 0, update_recommended: 0, ahead_of_baseline: 0, manual_review: 0 },
  );
}

function collectRecommendedUpdates(
  manifest: InspectedManifest,
  trackedPackages: Map<string, TrackedPackage>,
): string[] {
  return manifest.usages.flatMap((usage) => {
    const trackedPackage = trackedPackages.get(usage.packageName);
    if (!trackedPackage) return [];

    const analysis = analyzeUsage(usage.declaredSpec, trackedPackage.version);
    if (analysis.status !== 'update_recommended') return [];

    return [
      `- ${manifest.label} [${usage.section}] ${usage.packageName} ${usage.declaredSpec} -> ${trackedPackage.version}`,
    ];
  });
}

function renderManifestSection(
  title: string,
  manifests: InspectedManifest[],
  trackedPackages: Map<string, TrackedPackage>,
): string {
  const lines = [title];

  for (const manifest of manifests) {
    lines.push('');
    lines.push(manifest.label);
    lines.push(`- manifest: ${manifest.packageJsonPath}`);

    if (manifest.usages.length === 0) {
      lines.push('- no tracked @olwiba/* or @genesis/* package usage found');
      continue;
    }

    const analyses = manifest.usages.map((usage) => {
      const trackedPackage = trackedPackages.get(usage.packageName);
      if (!trackedPackage) throw new Error(`Tracked package missing for ${usage.packageName}`);
      return analyzeUsage(usage.declaredSpec, trackedPackage.version);
    });

    const summary = summarizeAnalyses(analyses);
    lines.push(
      `- summary: ${summary.update_recommended} update recommended, ${summary.manual_review} manual review, ${summary.ahead_of_baseline} ahead of baseline, ${summary.up_to_date} up to date`,
    );

    manifest.usages.forEach((usage, index) => {
      lines.push(buildReportLine(usage, analyses[index]));
    });
  }

  return lines.join('\n');
}

function resolveConsumerTargets(args: string[]): string[] {
  if (args.length > 0) {
    return args.map(resolvePackageJsonPath);
  }

  return [resolvePackageJsonPath(process.cwd())];
}

async function main() {
  const args = process.argv.slice(2);

  if (args.some((arg) => HELP_FLAGS.has(arg))) {
    printHelp();
    process.exit(0);
  }

  const [command = 'check', ...targetArgs] = args;
  if (command !== 'check') {
    throw new Error(`Unsupported command: ${command}. Only "check" is available in read-only v1.`);
  }

  const token = getToken();

  console.log('genesis-sync — read-only package drift inspection');
  console.log('');
  console.log('Fetching current ecosystem package versions from registry...');

  const trackedPackages = await loadTrackedPackages(token);

  const consumerPackageJsonPaths = resolveConsumerTargets(targetArgs);
  const consumerManifests = consumerPackageJsonPaths
    .map((packageJsonPath) => inspectManifest(packageJsonPath, trackedPackages))
    .sort((left, right) => left.label.localeCompare(right.label));

  const recommendations = consumerManifests.flatMap((manifest) =>
    collectRecommendedUpdates(manifest, trackedPackages),
  );

  const compatibilityNotes = consumerManifests.flatMap((manifest) =>
    manifest.usages.flatMap((usage) => {
      const trackedPackage = trackedPackages.get(usage.packageName);
      if (!trackedPackage) return [];

      const analysis = analyzeUsage(usage.declaredSpec, trackedPackage.version);
      if (analysis.status !== 'manual_review') return [];

      return [
        `- ${manifest.label} [${usage.section}] ${usage.packageName} uses ${usage.declaredSpec}; read-only v1 does not rewrite ranged or comparator-based specs`,
      ];
    }),
  );

  console.log('');
  console.log('Mode: inspection only');
  console.log('Current ecosystem package baseline (from registry):');
  for (const trackedPackage of [...trackedPackages.values()].sort((left, right) => left.name.localeCompare(right.name))) {
    console.log(`- ${trackedPackage.name} ${trackedPackage.version}`);
  }

  console.log('');
  console.log(renderManifestSection('Consumer project usage', consumerManifests, trackedPackages));

  console.log('');
  console.log('Recommended updates');
  if (recommendations.length === 0) {
    console.log('- none');
  } else {
    for (const rec of recommendations) {
      console.log(rec);
    }
  }

  console.log('');
  console.log('Compatibility notes');
  if (compatibilityNotes.length === 0) {
    console.log('- none');
  } else {
    for (const note of compatibilityNotes) {
      console.log(note);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
