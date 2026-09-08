# Third-party software

FocusReplay's original application code is MIT licensed. Dependencies retain their own licenses.

- Electron: MIT, with Chromium and other bundled component notices included in the Electron distribution (`LICENSE.electron.txt`, `LICENSES.chromium.html`). Source: https://github.com/electron/electron
- React / React DOM: MIT. Source: https://github.com/facebook/react
- Lucide icons: ISC. Source: https://github.com/lucide-icons/lucide
- Vite, Playwright and electron-builder are build/test tools; their licenses remain in the development dependencies.
- `ffmpeg-static` 5.3.0: GPL-3.0-or-later package; downloads a separate FFmpeg executable. Source and build distribution: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1

## Windows MP4 encoder

The Windows x64 encoder supplied by that package identifies itself as **FFmpeg 6.1.1-essentials_build-www.gyan.dev**, built with GPL and version 3 enabled. FocusReplay invokes it as a separate process. Its license and original build README are retained alongside the binary as `ffmpeg.exe.LICENSE` and `ffmpeg.exe.README` in the packaged dependency, and copied to the application's `licenses` directory during packaging.

- Exact FFmpeg source revision identified by the build: https://github.com/FFmpeg/FFmpeg/commit/e38092ef93
- Upstream source release: https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz
- Build provider, build information and dependency source references: https://www.gyan.dev/ffmpeg/builds/
- GPL v3 license: https://www.gnu.org/licenses/gpl-3.0.html

No encoder binary is committed to this Git repository. Installing the development dependencies downloads it from its upstream distributor. Before distributing a public binary release, retain all notices and provide the corresponding source for the exact encoder and linked components as required by their licenses. The initial GitHub deliverable is source code; binary publication is not automated.
