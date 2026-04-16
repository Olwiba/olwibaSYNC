# genesis-sync

> Inspect Genesis ecosystem package drift without writing downstream changes.

## What This Is

`genesis-sync` is the Phase 7 maintenance tool for the narrowest trustworthy sync contract:
- inspect ecosystem package/version drift against the live registry
- inspect consumer project package usage
- report recommended updates
- stay read-only

## Package

```
npm: genesis-sync
registry: private
```

## Status

**Implemented read-only v2 inspection path — consumer-first, registry-based**.

## Supported Now

- read-only `check` command
- live registry baseline fetch from GitHub Packages (`@olwiba/cn`, `@olwiba/docs`, `@olwiba/ui`)
- drift inspection across consumer project manifests
- recommended update reporting for exact version drift
- compatibility/manual-review notes for ranged package specs
- defaults to current working directory when no path is given

## Requirements

`PACKAGES_TOKEN` — a GitHub token with `read:packages` scope.

The `@olwiba/*` packages are private. You need access from the repository owner.
Copy `.env.example` to `.env` and fill in your token, or pass it inline.

## Usage

```bash
# Check the project in the current directory
genesis-sync

# Check an explicit path
genesis-sync check /path/to/my-project

# Check multiple paths
genesis-sync check /path/to/project-a /path/to/project-b

# Inline token
PACKAGES_TOKEN=ghp_... genesis-sync check
```

## What It Does Not Support Yet

- automatic package.json updates
- dependency installation
- migrations
- release automation
- multi-project directory crawling
- lockfile inspection or node_modules verification

## Output Contract

```
$ genesis-sync check

genesis-sync — read-only package drift inspection

Fetching current ecosystem package versions from registry...

Mode: inspection only
Current ecosystem package baseline (from registry):
- @olwiba/cn 0.1.12
- @olwiba/docs 0.1.13
- @olwiba/ui 0.0.20

Consumer project usage

my-project
- manifest: /path/to/my-project/package.json
- summary: 1 update recommended, 0 manual review, 0 ahead of baseline, 1 up to date
- [dependencies] @olwiba/cn 0.1.11 -> 0.1.12 | recommended update to 0.1.12
- [dependencies] @olwiba/ui 0.0.20 | up to date

Recommended updates
- my-project [dependencies] @olwiba/cn 0.1.11 -> 0.1.12

Compatibility notes
- none
```

## Related

- [genesis](https://github.com/Olwiba/genesis) — Template
- [genesis-start](https://github.com/Olwiba/genesis-start) — Scaffolding CLI
