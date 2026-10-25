# Rollback Checklist

Use this when a website release causes a production-impacting issue.

## Trigger

- Roll back when deployment, routing, content, download-link, or critical page
  failures affect production users.
- Assign one incident owner and one communication owner.

## Immediate Actions

- Identify the last known-good `master` tag and deployment artifact.
- Capture failing URLs, CDN/cache state, deployment ID, and relevant monitoring.
- Revert configuration or CDN changes first when that removes the issue.
- If code rollback is required, redeploy the last known-good artifact or prepare
  a hotfix branch from `master`.

## Hotfix Path

- Create `hotfix/<version-or-slug>` from `master`.
- Apply the smallest safe fix or revert.
- Run install and build checks for the changed surface.
- Open a PR to `master`, tag after merge, then merge or cherry-pick back to
  `develop`.

## After Recovery

- Document root cause, affected URLs, user impact, and prevention work.
- Update release notes and the project tracker with the final disposition.
