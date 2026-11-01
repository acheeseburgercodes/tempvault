# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.1.x | Yes |
| 1.0.x and older | No |

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/acheeseburgercodes/tempvault-cb/security/advisories/new). Do not open a public issue for an undisclosed vulnerability and do not attach private user files.

Include the affected version, reproduction steps, expected impact, and any suggested mitigation. The maintainer will acknowledge a complete report as soon as practical, investigate it, and coordinate a fix and disclosure timeline with the reporter.

## Security design

- Electron renderer sandboxing and context isolation are enabled.
- Node integration is disabled in the renderer.
- Browser permission requests are denied.
- New windows and renderer-initiated navigation are blocked.
- File operations validate that managed paths stay inside the vault.
- Deletion uses the Windows Recycle Bin.
- Production dependencies are audited in CI and release builds include a CycloneDX SBOM.
