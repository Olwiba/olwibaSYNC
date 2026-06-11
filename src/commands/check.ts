import {
  collectRecommendedUpdateLines,
  loadTrackedPackages,
  inspectManifest,
  renderManifestSection,
  resolveConsumerTargets,
  analyzeUsage,
  type InspectedManifest,
  type TrackedPackage,
} from '../drift';

export async function runCheck(targetArgs: string[]) {
  const token = process.env.PACKAGES_TOKEN;

  console.log('olwiba-sync — read-only package drift inspection');
  console.log('');
  console.log('Fetching current ecosystem package versions from registry...');

  const trackedPackages = await loadTrackedPackages(token);

  const consumerPackageJsonPaths = resolveConsumerTargets(targetArgs);
  const consumerManifests = consumerPackageJsonPaths
    .map((packageJsonPath) => inspectManifest(packageJsonPath, trackedPackages))
    .sort((left, right) => left.label.localeCompare(right.label));

  printCheckReport(trackedPackages, consumerManifests, 'inspection only');
}

export function printCheckReport(
  trackedPackages: Map<string, TrackedPackage>,
  consumerManifests: InspectedManifest[],
  modeLabel: string,
) {
  const recommendations = consumerManifests.flatMap((manifest) =>
    collectRecommendedUpdateLines(manifest, trackedPackages),
  );

  const compatibilityNotes = consumerManifests.flatMap((manifest) =>
    manifest.usages.flatMap((usage) => {
      const trackedPackage = trackedPackages.get(usage.packageName);
      if (!trackedPackage) return [];

      const analysis = analyzeUsage(usage.declaredSpec, trackedPackage.version);
      if (analysis.status !== 'manual_review') return [];

      return [
        `- ${manifest.label} [${usage.section}] ${usage.packageName} uses ${usage.declaredSpec}; non-exact specs are not auto-updated`,
      ];
    }),
  );

  console.log('');
  console.log(`Mode: ${modeLabel}`);
  console.log('Current ecosystem package baseline (from registry):');
  for (const trackedPackage of [...trackedPackages.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
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
