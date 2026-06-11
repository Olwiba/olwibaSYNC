import { existsSync, readFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';

export type PackageSection = 'dependencies' | 'devDependencies' | 'peerDependencies';

export type PackageJson = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export type TrackedPackage = {
  name: string;
  version: string;
};

export type UsageRecord = {
  packageName: string;
  section: PackageSection;
  declaredSpec: string;
};

export type InspectedManifest = {
  label: string;
  packageJsonPath: string;
  packageJson: PackageJson;
  usages: UsageRecord[];
};

export type UsageStatus = 'up_to_date' | 'update_recommended' | 'ahead_of_baseline' | 'manual_review';

export type UsageAnalysis = {
  status: UsageStatus;
  currentVersion: string;
  note: string;
};

export type PendingUpdate = {
  packageName: string;
  section: PackageSection;
  from: string;
  to: string;
};

export const SECTION_ORDER: PackageSection[] = ['dependencies', 'devDependencies', 'peerDependencies'];
export const NPM_REGISTRY = 'https://registry.npmjs.org';
export const GITHUB_PACKAGES_REGISTRY = 'https://npm.pkg.github.com';

export const PUBLIC_ECOSYSTEM_PACKAGES = [
  '@olwiba/cn',
  '@olwiba/docs',
  '@olwiba/ui',
  '@olwiba/dx',
  '@olwiba/sync',
  '@olwiba/render',
];

export const PRIVATE_ECOSYSTEM_PACKAGES: string[] = [];

export const PACKAGE_ALIASES: Record<string, string> = {
  cn: '@olwiba/cn',
  docs: '@olwiba/docs',
  ui: '@olwiba/ui',
  dx: '@olwiba/dx',
  sync: '@olwiba/sync',
  render: '@olwiba/render',
};

export const ALL_TRACKED_PACKAGE_NAMES = [
  ...PUBLIC_ECOSYSTEM_PACKAGES,
  ...PRIVATE_ECOSYSTEM_PACKAGES,
];

export async function fetchLatestVersion(packageName: string, registry: string, token?: string): Promise<string> {
  const encodedName = packageName.replace('/', '%2F');
  const url = `${registry}/${encodedName}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.npm.install-v1+json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    throw new Error(
      `Network error fetching ${packageName} from registry: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Registry returned HTTP ${response.status} for ${packageName}.\n` +
        `Check that the package exists at ${registry}${token ? '' : ' (no auth token provided)'}.`,
    );
  }

  const data = (await response.json()) as { 'dist-tags'?: { latest?: string } };
  const latest = data['dist-tags']?.latest;

  if (!latest) {
    throw new Error(
      `Could not determine latest version for ${packageName} — dist-tags.latest missing in registry response.`,
    );
  }

  return latest;
}

export async function loadTrackedPackages(token?: string): Promise<Map<string, TrackedPackage>> {
  const publicFetches = PUBLIC_ECOSYSTEM_PACKAGES.map(async (name) => {
    const version = await fetchLatestVersion(name, NPM_REGISTRY);
    return { name, version };
  });

  const privateFetches = token && PRIVATE_ECOSYSTEM_PACKAGES.length > 0
    ? PRIVATE_ECOSYSTEM_PACKAGES.map(async (name) => {
        const version = await fetchLatestVersion(name, GITHUB_PACKAGES_REGISTRY, token);
        return { name, version };
      })
    : [];

  const results = await Promise.allSettled([...publicFetches, ...privateFetches]);
  const trackedPackages = new Map<string, TrackedPackage>();

  for (const result of results) {
    if (result.status === 'rejected') {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.warn(`Warning: skipping baseline lookup — ${message}`);
      continue;
    }
    trackedPackages.set(result.value.name, result.value);
  }

  if (trackedPackages.size === 0) {
    throw new Error('Could not resolve any @olwiba/* package versions from the registry.');
  }

  return trackedPackages;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

export function resolvePackageJsonPath(target: string): string {
  const absoluteTarget = resolve(process.cwd(), target);
  const packageJsonPath = absoluteTarget.endsWith('package.json')
    ? absoluteTarget
    : join(absoluteTarget, 'package.json');

  if (!existsSync(packageJsonPath)) {
    throw new Error(`No package.json found for target: ${target}`);
  }

  return packageJsonPath;
}

export function inspectManifest(packageJsonPath: string, trackedPackages: Map<string, TrackedPackage>): InspectedManifest {
  const packageJson = readJsonFile<PackageJson>(packageJsonPath);
  const usages: UsageRecord[] = [];

  for (const section of SECTION_ORDER) {
    const declarations = packageJson[section];
    if (!declarations) continue;

    for (const [packageName, declaredSpec] of Object.entries(declarations)) {
      if (!trackedPackages.has(packageName)) continue;
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

export function analyzeUsage(declaredSpec: string, currentVersion: string): UsageAnalysis {
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

export function buildReportLine(usage: UsageRecord, analysis: UsageAnalysis): string {
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

export function collectRecommendedUpdateLines(
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

export function collectPendingUpdates(
  manifest: InspectedManifest,
  trackedPackages: Map<string, TrackedPackage>,
  packageFilters?: Set<string>,
): PendingUpdate[] {
  return manifest.usages.flatMap((usage) => {
    if (packageFilters && !packageFilters.has(usage.packageName)) return [];

    const trackedPackage = trackedPackages.get(usage.packageName);
    if (!trackedPackage) return [];

    const analysis = analyzeUsage(usage.declaredSpec, trackedPackage.version);
    if (analysis.status !== 'update_recommended') return [];

    return [
      {
        packageName: usage.packageName,
        section: usage.section,
        from: usage.declaredSpec,
        to: trackedPackage.version,
      },
    ];
  });
}

export function renderManifestSection(
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
      lines.push('- no tracked @olwiba/* package usage found');
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

export function resolveConsumerTargets(args: string[]): string[] {
  if (args.length > 0) {
    return args.map(resolvePackageJsonPath);
  }

  return [resolvePackageJsonPath(process.cwd())];
}

export function normalizePackageFilter(token: string): string {
  if (token.startsWith('@olwiba/')) return token;

  const mapped = PACKAGE_ALIASES[token];
  if (!mapped) {
    throw new Error(
      `Unknown package filter: ${token}. Use cn, docs, ui, dx, sync, render, or @olwiba/<name>.`,
    );
  }

  return mapped;
}

export function looksLikePath(token: string): boolean {
  if (token.startsWith('.') || token.startsWith('/') || token.includes('\\') || token.endsWith('package.json')) {
    return true;
  }

  return existsSync(resolve(process.cwd(), token));
}

export function parseSyncArgs(args: string[]): { filters: Set<string> | null; projectArgs: string[] } {
  const dashIndex = args.indexOf('--');
  const filterTokens =
    dashIndex === -1 ? args.filter((arg) => !looksLikePath(arg)) : args.slice(0, dashIndex).filter((arg) => arg !== '--');
  const projectArgs =
    dashIndex === -1 ? args.filter((arg) => looksLikePath(arg)) : args.slice(dashIndex + 1).filter((arg) => arg !== '--');

  const filters = filterTokens.length > 0 ? new Set(filterTokens.map(normalizePackageFilter)) : null;
  return { filters, projectArgs };
}

export function projectDirFromManifest(manifest: InspectedManifest): string {
  return dirname(manifest.packageJsonPath);
}
