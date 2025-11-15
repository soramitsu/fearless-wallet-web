# Prettier Workflow

Fearless Wallet uses Prettier 3 for formatting. CI enforces formatting on every
push and pull request, so matching the automated workflow locally saves
time during reviews.

## Commands

- `yarn format` — format every file in the repository using Prettier.
- `yarn format:check` — verify formatting without modifying files. Jenkins and
  GitHub Actions run this command as part of the default pipeline.

Both commands respect `.prettierignore`, so build outputs and caches stay
untouched.

## Pre-commit Integration

`lint-staged` runs Prettier before ESLint on staged files. If formatting fails,
the commit is aborted so you can address the changes immediately.

## Tips

- Run `yarn format:check` before pushing to avoid CI failures.
- Use `yarn format` when you intentionally reformat files (e.g., after large
  refactors or documentation updates).
