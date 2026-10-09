# TempVault

TempVault is a private, local-first temporary file manager for Windows, built entirely with TypeScript, Electron, and React. It moves throwaway files off the system drive, organizes them automatically, and provides a review queue before anything is removed.

All managed data stays on this computer. The default storage location is:

```text
D:\TempVault\storage
├── Inbox\
├── Temporary\<Category>\<YYYY-MM>\
├── Kept\<Category>\<YYYY-MM>\
└── config.json
```

## Features

- Move files and folders in through the picker or drag and drop
- Watched Inbox that sorts stable files automatically
- Automatic category and modified-month organization
- Collision-safe naming (`name (1).ext`)
- Search, category filtering, sorting, and multi-select actions
- Review queue for temporary files older than a configurable age
- Keep/restore lifecycle, move-out workflow, and Windows Recycle Bin deletion
- Open files and reveal them in Explorer
- Optional launch at Windows sign-in
- Context-isolated, sandboxed renderer with a narrow typed IPC API
- Path-boundary checks that prevent managed actions from escaping the vault

## Development

Requirements: Windows 10/11 and Node.js 22 or newer.

```powershell
git clone https://github.com/acheeseburgercodes/tempvault.git D:\projects\tempvault
Set-Location D:\projects\tempvault
npm install
npm run dev
```

Useful commands:

```powershell
npm test          # core storage tests
npm run typecheck # TypeScript checks for main, preload, and renderer
npm run build     # production app bundle
npm run package   # NSIS installer and portable Windows executable
```

Set `TEMPVAULT_HOME` before starting the app to override the storage root for development or testing. The value must be an absolute path.

## Safety model

- Adding an item moves it into TempVault; it does not create a duplicate.
- Deletion uses the Windows Recycle Bin, so it is normally recoverable.
- In-progress downloads (`.part`, `.crdownload`, `.partial`, `.tmp`, `.download`) remain in Inbox.
- Files marked **Kept** never appear in the stale review queue.
- Renderer code has no direct Node.js or filesystem access.

## Project layout

```text
src/main/       Electron lifecycle, dialogs, watching, filesystem operations
src/preload/    Typed and context-isolated renderer bridge
src/renderer/   React desktop UI
src/shared/     Shared TypeScript contracts
tests/          Storage engine tests
```

## License

MIT
