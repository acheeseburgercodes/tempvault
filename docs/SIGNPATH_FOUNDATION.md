# SignPath Foundation application readiness

TempVault is prepared for a SignPath Foundation open-source code-signing application.

## Public evidence

- Public repository: <https://github.com/acheeseburgercodes/tempvault-cb>
- OSI-approved license: [MIT](../LICENSE)
- Released Windows application: [GitHub Releases](https://github.com/acheeseburgercodes/tempvault-cb/releases)
- Product documentation: [README](../README.md)
- Code signing policy and roles: [CODE_SIGNING_POLICY.md](../CODE_SIGNING_POLICY.md)
- Privacy policy: [PRIVACY.md](../PRIVACY.md)
- Security reporting: [SECURITY.md](../SECURITY.md)
- Automated release build: [release.yml](../.github/workflows/release.yml)
- SignPath submission workflow: [signpath.yml](../.github/workflows/signpath.yml)

## Application details

- Project name: `TempVault`
- Repository: `https://github.com/acheeseburgercodes/tempvault-cb`
- License: `MIT`
- Platform and artifact type: Windows x64, NSIS installer and portable executable
- Product name metadata: `TempVault`
- Maintainer, reviewer, and signing approver: `acheeseburgercodes`
- Privacy statement: TempVault does not transfer information unless specifically requested by the user; optional file-agent requests go to the user-configured Ollama endpoint, defaulting to `127.0.0.1`.

## SignPath onboarding values

After the Foundation approves the project, configure these GitHub repository values:

### Secret

- `SIGNPATH_API_TOKEN`

### Variables

- `SIGNPATH_ORGANIZATION_ID`
- `SIGNPATH_PROJECT_SLUG`
- `SIGNPATH_SIGNING_POLICY_SLUG`
- `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`

The SignPath artifact configuration should accept the ZIP uploaded by `signpath.yml`, sign only the two first-party TempVault `.exe` files, enforce product name `TempVault`, and enforce one consistent product/file version per signing request. The release policy should require manual approval and allow only tags based on the protected `main` branch.

## Account-side checks before submitting

- Enable multi-factor authentication on GitHub and SignPath accounts.
- Keep `main` protected and require the `verify` status check.
- Enable private vulnerability reporting and Dependabot alerts.
- Submit the Foundation form at <https://signpath.org/apply.html> using the public evidence above.

No SignPath credentials belong in this repository. The checked-in workflow remains ready but cannot submit a signing request until the Foundation creates the project and the repository secret/variables are configured.
