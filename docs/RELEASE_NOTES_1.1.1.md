# TempVault 1.1.1

This patch release replaces the 1.1.0 Windows artifacts and is the release intended for the SignPath Foundation application.

## Fixed

- Added `zod` as an explicit production dependency so the clean packaged application can resolve the AI SDK at main-process startup.
- Prevented Electron Builder from attempting implicit GitHub publication when packaging a version tag.
- Added a clean-runner release gate and a packaged-application launch test to the release verification process.

## Included features

- Multi-file, resizable preview board with Word, PDF, PowerPoint, media, image, and text support
- Type-folder library with animated, color-coded file groups
- Local-only Ollama file agent and in-app model-training guidance
- Optional, recoverable 14-day auto-delete for unkept temporary files
- Configurable light/dark appearance with primary, secondary, and accent presets
- Adaptive black/white Windows and title-bar icon treatment

## Signing status

This release is not yet signed by SignPath Foundation. Verify downloads using `SHA256SUMS.txt`. Future approved releases will be signed according to [the TempVault code-signing policy](https://github.com/acheeseburgercodes/tempvault-cb/blob/main/CODE_SIGNING_POLICY.md).

Free code signing provided by SignPath.io, certificate by SignPath Foundation.
