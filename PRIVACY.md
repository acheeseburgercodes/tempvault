# Privacy policy

Last updated: 1 November 2026

TempVault is a local-first desktop application. This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

## Data stored locally

TempVault stores managed files, folder organization, and application settings in the configured vault directory. By default this is `D:\TempVault\storage`. A diagnostic startup log may be written to the Electron user-data directory when the application starts or encounters an error.

## Network access

TempVault has no telemetry, analytics, advertising, account system, automatic update service, or automatic cloud synchronization.

The optional **File agent** feature contacts a user-operated Ollama endpoint only when the user requests agent status or asks a question. Its default endpoint is `http://127.0.0.1:11434`, which is the local computer. File context used to answer the question is sent to that configured Ollama service. Users are responsible for the privacy terms of any non-local Ollama endpoint they configure.

Opening a user-selected external link delegates that link to the system browser. Opening or revealing a managed file delegates the action to Windows or the file's default application; those applications have their own privacy policies.

## Deletion and retention

Manual deletion and optional automatic deletion move files to the Windows Recycle Bin. Automatic deletion is disabled by default, applies only to unkept Temporary files after 14 days, and never includes files marked Kept.

## Contact

Privacy questions may be filed in the [TempVault issue tracker](https://github.com/acheeseburgercodes/tempvault-cb/issues). Do not include private files or sensitive personal information in a public issue.
