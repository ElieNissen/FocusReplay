# Code signing policy

Status: signing is being set up. No signed release or SignPath Foundation approval is claimed.

Repository owner ElieNissen maintains and reviews the project and approves releases. Signing credentials must remain outside source control. Signed artifacts must be built from reviewed repository source, pass the automated tests and release signature verification, and be reviewed on Windows with Smart App Control enabled before publication. Untrusted pull requests must never receive signing credentials. Never sign arbitrary uploaded executables.

We are preparing an application to SignPath Foundation's open-source program. Acceptance and an approved artifact configuration are required before using that service. Its rules restrict signing of upstream components; blanket re-signing of Electron, FFmpeg or third-party DLLs must not be used with a Foundation identity. A Foundation integration will need to preserve upstream signatures and have its exact packaging reviewed by SignPath. The generic certificate-based build configuration is not a ready-to-use Foundation signing integration.

If the project is accepted, update this page with the verified provider attribution and approved workflow. Do not display an approval badge or claim signed downloads before acceptance and validation. A future proprietary product requires a separate review of licensing and signing eligibility.

See [data handling](PRIVACY.md), [Windows release checks](WINDOWS_RELEASE.md), and [SignPath Foundation conditions](https://signpath.org/terms.html).
