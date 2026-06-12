# Changelog

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
