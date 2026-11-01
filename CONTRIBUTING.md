# Contributing to TempVault

Thank you for improving TempVault.

1. Open an issue for substantial behavioral or security-sensitive changes.
2. Create a focused branch and keep unrelated changes out of the pull request.
3. Run `npm ci` followed by `npm run verify`.
4. Add or update tests for storage, retention, IPC, or release behavior.
5. Describe user-visible behavior and security implications in the pull request.

All changes from non-committers require maintainer review. Build scripts, dependency updates, packaging files, and `.github/workflows` are security-sensitive and must be reviewed with the same care as application code.

Never commit secrets, signing tokens, private keys, user files, vault contents, or diagnostic logs.
