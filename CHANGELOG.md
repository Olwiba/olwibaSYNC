# Changelog



## 0.2.2

### Added

- `template` command: a read-only file-level drift report of a Genesis-spawned project against the template it came from, grouped by area so it reads as a work queue. `--template <path>` selects the Genesis checkout (defaults to the nexus layout or `GENESIS_TEMPLATE_PATH`), `--all` lists every file instead of a capped sample. Never writes to the project.
- `template --since <ref>` splits what the template changed into **adoptable** (the project never diverged from `ref`, so the new version can be taken wholesale), **conflict** (both sides moved), and **absent** (the project does not have the file). Requires no baseline file committed into the project.
- CI workflow running the test suite on push and pull request — previously nothing ran the suite outside publish-on-tag. The typecheck step is present but commented out.
- Test coverage for template drift and the `env` command.

### Fixed

- `olwiba-sync env` now works. Three modules it imports (`src/env/cli.ts`, `types.ts`, `parse-env-example.ts`) were never committed alongside the rest of the command, so the CLI threw `Cannot find module './env/cli'` at runtime and `tsc` failed on every run — while `--help` advertised the command the whole time. Check mode agrees with Genesis's own `env:check` at 97 keys; write mode generates only what a directive asks for, keeps every other line of the example verbatim, and refuses to overwrite an existing `.env`.
- `parse-env-example` normalises line endings before matching, so a CRLF `.env.example` no longer matches nothing and reports an empty file as a clean one.
- Template text comparison normalises line endings and trailing whitespace, so a Windows checkout compared against a Linux one does not report every shared file as diverged. Files both sides changed that now agree are skipped rather than counted as conflicts.
- Pinned `@olwiba/dx` to `0.0.23` and re-resolved the lockfile. Every fresh install in the workspace was exiting non-zero: the lockfile recorded npm-style tarball paths for versions GitHub Packages serves under `/download/<scope>/<pkg>/<version>/<sha>`, and `^0.0.10` resolved to an unpublished exact version under 0.x semantics.
- `tsconfig` requested `bun-types` while the package declares `@types/bun`, which provides `bun`; `typecheck` failed on the missing type library regardless of the code.

### Changed

- Release notifications now post to `OPS_WEBHOOK_RELEASES` (a separate channel from product deploys), with the embed matching what `notifyOps` sends at runtime — severity colours, a `ref · ci · releases` footer, and a timestamp — plus severity gating via `vars.OPS_MIN_SEVERITY`.
- Renamed `DISCORD_WEBHOOK_URL` to `OPS_WEBHOOK_DEPLOYS` to match the Genesis ops notification vocabulary. The repository secret must be set, or the notify step skips quietly and exits 0.

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
