# TempVault

[![Build](https://github.com/acheeseburgercodes/tempvault-cb/actions/workflows/ci.yml/badge.svg)](https://github.com/acheeseburgercodes/tempvault-cb/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/acheeseburgercodes/tempvault-cb)](https://github.com/acheeseburgercodes/tempvault-cb/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)

TempVault is a private, local-first temporary file manager for Windows. It moves throwaway files off the system drive, organizes them in a managed vault, previews common file types, and provides a review queue before anything is recycled.

## Download

Download the current Windows installer or portable build from [GitHub Releases](https://github.com/acheeseburgercodes/tempvault-cb/releases/latest). The Setup build is recommended for normal installation.

> **Signing status:** TempVault is prepared to apply for free code signing provided by SignPath.io, certificate by SignPath Foundation. Until approval and the first signed release, GitHub may show the binaries as unsigned. Always verify the SHA-256 values in `SHA256SUMS.txt`.

See the [Code signing policy](CODE_SIGNING_POLICY.md), [privacy policy](PRIVACY.md), and [security policy](SECURITY.md).

## Features

- Move files and folders into a temporary vault using the picker or drag and drop
- Watched Inbox with automatic category and month organization
- Search, category filtering, sorting, pagination, and multi-select actions
- Keep/restore lifecycle and recoverable Windows Recycle Bin deletion
- Optional 14-day auto-delete for unkept files, disabled by default
- Word, PDF, PowerPoint, text, image, audio, and video previews where supported
- Resizable, draggable multi-file preview board and detachable in-app previews
- Type-folder view with automatically grouped files
- Local-only file Q&A through Ollama at `127.0.0.1`, with no cloud fallback
- Dark/light themes and independent primary, secondary, and accent colors
- Context-isolated, sandboxed Electron renderer and a narrow typed IPC bridge

All managed data stays on the computer. The default storage location is:

```text
D:\TempVault\storage
├── Inbox\
├── Temporary\<Category>\<YYYY-MM>\
├── Kept\<Category>\<YYYY-MM>\
└── config.json
```

## Safety and privacy

- Adding an item moves it into TempVault rather than creating a duplicate.
- Deletion uses the Windows Recycle Bin.
- Files marked **Kept** are excluded from automatic deletion.
- Automatic deletion is opt-in and clearly described in Settings.
- Renderer code has no direct Node.js or filesystem access.
- Managed file operations enforce vault path boundaries.
- TempVault has no telemetry, analytics, advertising, account system, or automatic cloud upload.

Read the complete [privacy policy](PRIVACY.md) and report vulnerabilities according to [SECURITY.md](SECURITY.md).

## Development

Requirements: Windows 10/11 and Node.js 22 or newer.

```powershell
git clone https://github.com/acheeseburgercodes/tempvault-cb.git D:\projects\tempvault-cb
Set-Location D:\projects\tempvault-cb
npm ci
npm run dev
```

Useful commands:

```powershell
npm run verify    # type checks, tests, build, and production dependency audit
npm run package   # NSIS installer and portable Windows executable
npm run sbom      # reproducible CycloneDX production-dependency SBOM
```

Set `TEMPVAULT_HOME` before starting the app to override the storage root for development or testing. The value must be an absolute path.

## Reproducible release process

Release artifacts are built from a Git tag by [the release workflow](.github/workflows/release.yml) using `npm ci`. The workflow runs the complete verification suite, builds both Windows artifacts, creates a CycloneDX SBOM and SHA-256 manifest, and publishes them to GitHub Releases.

After SignPath Foundation approval, [the signing workflow](.github/workflows/signpath.yml) submits the exact GitHub-built artifacts to SignPath with verified origin metadata and waits for manual approval. See [SignPath application readiness](docs/SIGNPATH_FOUNDATION.md).

## Project layout

```text
src/main/       Electron lifecycle, dialogs, watching, filesystem operations
src/preload/    Typed and context-isolated renderer bridge
src/renderer/   React desktop UI
src/shared/     Shared TypeScript contracts
tests/          Storage-engine tests
docs/           Security, release, and local-model documentation
models/         Example Ollama Modelfile
```

## Local AI

TempVault only contacts Ollama when the user opens or uses the local file agent. The default endpoint is `http://127.0.0.1:11434`.

```powershell
ollama pull gemma3:4b
ollama create tempvault-agent -f .\models\Modelfile.example
ollama serve
```

See [docs/TRAIN_LOCAL_MODEL.md](docs/TRAIN_LOCAL_MODEL.md) for retrieval and external LoRA/QLoRA guidance.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
