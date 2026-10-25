# Fearless browser wallet

Use this canonical checkout; do not create another web-wallet worktree without
an explicit user request. Check the branch and local changes before edits because
other chats share this checkout. Preserve unrelated changes.

The user confirmed on 25 October 2026 that the project does not use CI. Validate
releases locally with the pinned Node/Yarn toolchain, full tests, real-browser
and historical-upgrade checks, and the production package audits. Record the
source commit, commands, results, and artifact hashes. Hosted CI status is not a
release or merge prerequisite; do not wait for or repair hosted CI unless asked.
Never replace a failed local check with a claimed pass or skip a required package
or wallet-safety check to make a release appear ready.
