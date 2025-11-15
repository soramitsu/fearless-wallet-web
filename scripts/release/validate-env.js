#!/usr/bin/env node

/**
 * Release preflight helper. We validate the set of credentials that the
 * Jenkins pipeline requires whenever we build from a release branch so that we
 * fail fast if one is missing instead of producing unsigned artifacts.
 */

const { BRANCH_NAME = '', CHANGE_ID } = process.env;

const releaseBranches = ['master', 'develop'];
const isReleaseBranch = releaseBranches.includes(BRANCH_NAME);

if (!isReleaseBranch) {
  console.info(
    `[release] Skipping credential validation for branch "${
      BRANCH_NAME || 'unknown'
    }" (CHANGE_ID=${CHANGE_ID || 'n/a'}).`
  );
  process.exit(0);
}

const groups = [
  {
    label: 'Common extension signing secrets',
    keys: ['EXTENSION_PUBLIC_KEY'],
  },
  {
    label: 'Chrome Web Store upload',
    keys: ['OAUTH_CLIENT_ID_UPLOAD', 'OAUTH_CLIENT_SECRET_UPLOAD', 'OAUTH_REFRESH_TOKEN', 'OAUTH_ITEM_ID'],
    branches: ['master'],
  },
  {
    label: 'Google OAuth used in the extension itself',
    keys: ['OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET'],
  },
  {
    label: 'Firefox Add-ons upload',
    keys: ['MOZILLA_API_USER', 'MOZILLA_API_TOKEN'],
    branches: ['master'],
  },
];

const missing = [];

for (const group of groups) {
  const { label, keys, branches } = group;
  if (branches && !branches.includes(BRANCH_NAME)) {
    continue;
  }

  const missingKeys = keys.filter((key) => !process.env[key]);
  if (missingKeys.length) {
    missing.push({ label, keys: missingKeys });
  }
}

if (missing.length) {
  console.error(`[release] Missing required credentials for branch "${BRANCH_NAME}".`);
  for (const group of missing) {
    console.error(`> ${group.label}: ${group.keys.join(', ')}`);
  }
  console.error('Follow docs/release-checklist.md before rerunning the pipeline.');
  process.exit(1);
}

console.info(`[release] Release credentials validated for "${BRANCH_NAME}".`);
