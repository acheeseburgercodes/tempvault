# Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## Scope

Only TempVault binaries built from the public [`acheeseburgercodes/tempvault-cb`](https://github.com/acheeseburgercodes/tempvault-cb) repository by the checked-in GitHub Actions release workflow are eligible for signing. Third-party binaries bundled by Electron or npm are not submitted as TempVault-authored standalone artifacts.

Release signing is restricted to version tags matching `v*` and requires manual approval. The build uses the committed lockfile, produces a CycloneDX SBOM and SHA-256 manifest, and retains GitHub build provenance.

## Team roles

- Committer and reviewer: [acheeseburgercodes](https://github.com/acheeseburgercodes)
- Signing approver: [acheeseburgercodes](https://github.com/acheeseburgercodes)

Changes from contributors who are not committers require review before merge. Changes to build scripts, dependencies, GitHub Actions workflows, packaging configuration, and signing configuration receive the same review as application source code. Repository and SignPath access must use multi-factor authentication.

## Release controls

1. A release is created from a reviewed commit on the protected `main` branch.
2. CI must pass type checking, tests, production build, and the production-dependency vulnerability audit.
3. The release workflow builds the installer and portable executable from the tag using `npm ci`.
4. The signing workflow submits the GitHub-built artifact through SignPath's trusted GitHub connector.
5. The signing approver manually verifies the source tag, workflow run, version, artifact names, and hashes before approval.
6. Signed artifacts replace the corresponding unsigned assets on the GitHub release without changing their source tag.

## Privacy policy

See [PRIVACY.md](PRIVACY.md). In summary: **This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.**

The optional file agent sends selected local file context only to the user-configured Ollama service, which defaults to the loopback address `127.0.0.1`. TempVault does not include telemetry or automatic update checks.
