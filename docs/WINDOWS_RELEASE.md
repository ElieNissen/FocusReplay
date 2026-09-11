# Windows distribution and startup

## Confirmed 0.8.1 failure

Windows Code Integrity event 3077 rejected the extracted FocusReplay executable before the app started. Both the portable launcher and its application executable were unsigned. UI tests in development and passing CI do not prove that a distributed binary will pass Smart App Control.

The old portable NSIS launcher deletes and extracts its payload into a temporary directory on each launch. This adds decompression and possible antivirus scanning before Electron can start. The default release target is now a per-user NSIS installation: extraction happens during installation, and subsequent launches run the installed executable directly. User recordings remain in the existing user-data directory; uninstalling does not delete them. This removes repeat extraction, but startup timings still need measurement on the signed installed release.

## Signing is a release requirement

`npm run dist` requires code signing and must fail if a usable signing identity is unavailable. The former `win.signExecutable: false` override is removed. DLLs and the packaged PowerShell tracker are included in signing via `win.signExts`. A self-signed certificate is not a substitute for a publicly trusted code-signing identity.

Use a trusted RSA code-signing certificate or Microsoft's managed Artifact/Trusted Signing service. The publisher must complete the provider's identity verification and approve any charges. Do not commit certificates, private keys, passwords, tenant credentials or production signing configuration. For certificate-based signing, electron-builder supports `CSC_LINK` and `CSC_KEY_PASSWORD` in the build environment. For Microsoft managed signing, use a private electron-builder configuration with `win.azureSignOptions` and provider authentication; never invent the publisher identity.

Primary references: [Microsoft Smart App Control signing](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control), [electron-builder signing](https://www.electron.build/code-signing-win.html).

## Acceptance before distributing a release

1. Build with `npm run dist` using the real signing identity.
2. Check Authenticode validity on the installer, installed application, helper EXEs, DLLs and `activity.ps1`. Timestamp signatures. Validate the actual packaged output, not only the source tree.
3. Install and launch on a machine with Smart App Control enabled; check Code Integrity events, not just process exit codes.
4. Measure first launch and repeat launch until the session-start button is visible, using both a clean profile and a private copy of a populated profile. Do not enable sharing, music or recording for startup measurements.
5. Test recording/tracking/export separately in an explicitly authorized test session. Preserve all existing user sessions.

`npm run dist:unsigned` is only for local installer construction tests. Its output is not a Smart App Control fix or a distributable release. Do not recommend disabling Windows protection, adding antivirus exclusions or relabeling the unsigned executable as trusted. The source development workflow remains available for ordinary development, but is not evidence that a signed release works.
