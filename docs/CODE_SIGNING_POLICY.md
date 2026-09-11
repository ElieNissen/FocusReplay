# Code signing policy

Status: signing is being set up. No signed release or SignPath Foundation approval is claimed.

Repository owner ElieNissen maintains and reviews the project and approves releases. Signing credentials must remain outside source control. Signed artifacts must be built from reviewed repository source, pass the automated tests and release signature verification, and be reviewed on Windows with Smart App Control enabled before publication. Untrusted pull requests must never receive signing credentials. Never sign arbitrary uploaded executables.

Direct downloads from GitHub and the product website remain a requirement. A publicly trusted signing provider that permits proprietary software is the preferred route. Microsoft Store package signing is an optional distribution route, not a replacement for signing the independently downloaded installer.

The SignPath Foundation application is paused and has not been submitted. Its open-source eligibility requirements do not match the desired freedom to develop a proprietary product. No signing provider has been contracted. This decision does not change the repository's existing license.

If the project is accepted, update this page with the verified provider attribution and approved workflow. Do not display an approval badge or claim signed downloads before acceptance and validation. A future proprietary product requires a separate review of licensing and signing eligibility.

See [data handling](PRIVACY.md), [Windows release checks](WINDOWS_RELEASE.md), and [SignPath Foundation conditions](https://signpath.org/terms.html).
