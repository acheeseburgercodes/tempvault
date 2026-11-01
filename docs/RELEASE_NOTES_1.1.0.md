# TempVault 1.1.0

This release consolidates the complete TempVault desktop experience and prepares the project for a SignPath Foundation code-signing application.

## Highlights

- Multi-file, resizable preview board with Word, PDF, PowerPoint, media, image, and text support
- Type-folder library with animated, color-coded file groups
- Local-only Ollama file agent and in-app model-training guidance
- Optional, recoverable 14-day auto-delete for unkept temporary files
- Configurable light/dark appearance with primary, secondary, and accent presets
- Adaptive black/white Windows and title-bar icon treatment

## Reliability and security

- Updated Electron from 44.7.0 to the patched 44.10.1 release
- Updated Vitest and the CycloneDX toolchain
- Production dependency audit reports zero known vulnerabilities
- Renderer permission requests and renderer-initiated navigation are denied
- Added reproducible CI and release workflows using the committed lockfile
- Added CycloneDX SBOM and SHA-256 release manifests
- Added privacy, security, contribution, and code-signing policies

## Signing status

This is the public release used for the SignPath Foundation application. It is not yet signed by SignPath Foundation. Verify downloads using `SHA256SUMS.txt`. Future approved releases will be signed according to [the TempVault code-signing policy](https://github.com/acheeseburgercodes/tempvault-cb/blob/main/CODE_SIGNING_POLICY.md).

Free code signing provided by SignPath.io, certificate by SignPath Foundation.
