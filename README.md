<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="./public/olwibaSYNC--light.gif" />
    <source media="(prefers-color-scheme: dark)" srcset="./public/olwibaSYNC.gif" />
    <img src="./public/olwibaSYNC.gif" alt="olwibaSYNC" style="width: 100%;" />
  </picture>
</p>

<p align="center">
  <strong>Check and sync @olwiba/* package versions against the live registry.</strong>
</p>

<p align="center">
  <a href="https://github.com/Olwiba/olwibaSYNC/issues/new?template=bug_report.md">🪲 Report a bug</a> ·
  <a href="https://github.com/Olwiba/olwibaSYNC/issues/new?template=feature_request.md">✨ Feature request</a>
</p>

<p align="center">
  <a href="https://github.com/sponsors/Olwiba"><img src="https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=22c55e" alt="Sponsor" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Olwiba/olwibaSYNC?label=license&logo=github" alt="License" /></a>
  <a href="https://github.com/Olwiba/olwibaSYNC/issues"><img src="https://img.shields.io/github/issues/Olwiba/olwibaSYNC" alt="Issues" /></a>
</p>

## What This Is

`@olwiba/sync` checks your project's `@olwiba/*` package versions against the live registry — and can apply updates when you're ready.

Works with any project using Olwiba packages, including [Genesis](https://github.com/Olwiba/genesis)-spawned apps.

## Installation

```bash
bun add @olwiba/sync
```

Or run without installing:

```bash
bunx @olwiba/sync
```

## Usage

```bash
# Check cwd (read-only, default)
bunx @olwiba/sync
bunx @olwiba/sync check

# Check a specific project
bunx @olwiba/sync check ./my-app

# Check then apply all recommended updates
bunx @olwiba/sync sync

# Apply updates for specific packages only
bunx @olwiba/sync sync cn ui

# Scoped project
bunx @olwiba/sync sync -- ./my-app
bunx @olwiba/sync sync cn -- ./my-app
```

Private packages require a GitHub token with `read:packages` scope:

```bash
PACKAGES_TOKEN=ghp_... bunx @olwiba/sync
```

## What's Included

**Drift report** Compares installed `@olwiba/*` versions against the live registry  
**Recommended updates** Lists exact version bumps needed per project  
**Sync** Applies updates via `bun add` (does not auto-commit)  
**Multi-project check** Inspect multiple consumer projects in one command  
**Package filters** Sync only the packages you name (`cn`, `ui`, `@olwiba/cn`, …)

## Ecosystem

- [genesis](https://github.com/Olwiba/genesis) — full-stack starter template
- [@olwiba/genesis-start](https://github.com/Olwiba/genesis-start) — scaffold a new baseline
- [@olwiba/cn](https://github.com/Olwiba/olwibaCN) — base UI primitives

## Contributing

Bug reports, pull requests & feature requests are welcome.
Open an issue first for anything beyond a small fix.

<br/>
<br/>

<p align="center">
  Built with 💖 by <a href="https://github.com/Olwiba">Olwiba</a>
</p>

<p align="center">
  <a href="https://buymeacoffee.com/olwiba"><img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black" alt="Buy Me A Coffee" /></a>
</p>
