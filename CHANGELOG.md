# Changelog


## 0.2.1

### Added

- `workflow_dispatch` tag input on the publish workflow for manually republishing an existing tag.
- CHANGELOG covering 0.1.0 through 0.2.0.

### Changed

- Publish workflow now publishes with npm provenance attestation via OIDC trusted publishing.
- Exempted first-party `@olwiba/*` packages from the 7-day `minimumReleaseAge` cooldown — first-party releases are consumed same-day, and the gate was blocking lockfile verification and frozen installs. Names are listed explicitly since Bun does not support scope wildcards in `minimumReleaseAgeExcludes`.
- Removed remaining genesis branding from the README, `.env.example`, and CLI output.

## 0.2.0

### Added

- `sync` subcommand for the renamed `@olwiba/sync` CLI.

### Changed

- Renamed package from `@olwiba/genesis-sync` to `@olwiba/sync`; CLI binary is now `olwiba-sync`.

### Fixed

- Regenerated lockfile after the package rename so installs resolve `@olwiba/sync` correctly.

## 0.1.2

### Changed

- OSS prep: emerald rebrand, README refresh, banner GIFs, and gitignore cleanup.
- Switched publish workflow to npm OIDC trusted publishing (dropped bootstrap `NPM_TOKEN`).
- Re-resolved `@olwiba/dx` from public npm (lockfile was pinned to GitHub Packages).

## 0.1.1

### Added

- Dev banner on CLI startup.

### Changed

- Split registry resolution: public packages from npmjs.org; GitHub Packages token now optional.
- Added 7-day `minimumReleaseAge` supply-chain cooldown.

### Fixed

- Removed redundant npmrc auth step from publish workflow.

## 0.1.0

Initial release as `@olwiba/genesis-sync`.
