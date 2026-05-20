# genesis-sync

> Read-only drift inspector for the Genesis ecosystem.

Checks your project's `@olwiba/*` package versions against the live registry and reports what's out of date. No writes, no installs — inspect only.

## Install

```bash
bun add @olwiba/genesis-sync
```

Or run without installing:

```bash
bunx @olwiba/genesis-sync
```

## Usage

```bash
# Check the project in the current directory
genesis-sync

# Check an explicit path
genesis-sync check /path/to/my-project

# Check multiple paths
genesis-sync check /path/to/project-a /path/to/project-b
```

## Token (optional)

Public packages (`@olwiba/cn`, `@olwiba/docs`, `@olwiba/ui`) are checked without any token.

To also include private packages (`@olwiba/genesis-render`, `@olwiba/genesis-sync`) in the baseline, add a GitHub token with `read:packages` scope:

```bash
PACKAGES_TOKEN=ghp_... genesis-sync
```

Or set it in `.env` — see `.env.example`.

## Example output

```
genesis-sync - read-only package drift inspection

Fetching current ecosystem package versions from registry...

Mode: inspection only
Current ecosystem package baseline (from registry):
- @olwiba/cn 0.1.15
- @olwiba/docs 0.1.25
- @olwiba/ui 0.0.28

Consumer project usage

my-project
- manifest: /path/to/my-project/package.json
- summary: 1 update recommended, 0 manual review, 0 ahead of baseline, 1 up to date
- [dependencies] @olwiba/cn 0.1.14 -> 0.1.15 | recommended update
- [dependencies] @olwiba/ui 0.0.28 | up to date

Recommended updates
- my-project [dependencies] @olwiba/cn 0.1.14 -> 0.1.15
```

## What it does

- Fetches current `@olwiba/*` versions from the live registry
- Compares against consumer project `package.json` manifests
- Reports exact version drift as recommended updates
- Reports ranged specs as compatibility notes
- Read-only — never modifies files

## Related

- [genesis](https://github.com/Olwiba/genesis) - Template
- [genesis-start](https://github.com/Olwiba/genesis-start) - Scaffolding CLI
