# genesis-sync

> CLI tool for keeping Genesis projects up to date.

## What This Is

Utility CLI that checks for and applies updates to `@olwiba/*` and `@genesis/*` packages across your projects.

## Package

```
npm: genesis-sync
registry: private (Verdaccio)
```

## Status

**Future implementation** — Not yet built.

## Planned Features

- Check for outdated packages
- Update `@olwiba/cn`, `@olwiba/ui`, `@genesis/renderer`
- Run migrations if schema changes
- Multi-project sync support

## Planned Usage

```bash
# Check for updates
genesis-sync check

# Update packages
genesis-sync update

# Update all projects in a directory
genesis-sync update --all ./projects/
```

## Planned Flow

```
$ genesis-sync check

Checking @olwiba/cn... 1.0.0 → 1.2.0 (update available)
Checking @olwiba/ui... 1.1.0 → 1.2.0 (update available)
Checking @genesis/renderer... 1.0.0 (up to date)

$ genesis-sync update

Updating @olwiba/cn to 1.2.0... done
Updating @olwiba/ui to 1.2.0... done
Running migrations... none required
Done!
```

## Related

- [genesis](https://github.com/Olwiba/genesis) — Template
- [genesis-start](https://github.com/Olwiba/genesis-start) — Scaffolding CLI
