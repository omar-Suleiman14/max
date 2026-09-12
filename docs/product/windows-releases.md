# Windows releases and updates

Max remains a generic, offline-first workspace. Release checks do not access workspace data or require cloud sign-in.

## Publish a release

1. Include the release workflow and updater changes in the commit being released.
2. Set `package.json` and the lockfile to the next stable version. Use a matching GitHub tag, for example `v0.4.5`.
3. In GitHub, publish a release for that tag. The **Release builds** workflow builds and tests the native artifacts and attaches them to that release, including the Windows `RELEASES` index and the `.nupkg` packages it names.
4. Wait for the workflow to finish successfully. Publishing a release does not make an update available until the installers finish uploading.
5. The Windows build verifies the `RELEASES` index and each package's size and checksum before uploading. After upload, run the **Update feed** workflow from the Actions tab with the release tag to verify the published downloads. This avoids checking an incomplete release while its installers are still building.

Prereleases do not advance the stable update feed. Manual workflow runs build artifacts without publishing an update. Existing versioned release assets are immutable; use a new version for changed binaries.

### One-time GitHub configuration

None. Updates are served from the repository's own releases using the built-in `GITHUB_TOKEN`, so there is no release server, no bucket and no third-party account to keep alive. The Cloudflare Worker is still used for optional cloud backups only; see `worker/`.

## Application behavior

Installed Squirrel Windows copies check 60 seconds after startup and every four hours. A check downloads an available update, and when one is ready the workspace raises a notification naming the version, with **Restart and install** and **Later**. Dismissing it is remembered for that version only, so the next release asks again. Settings → Danger still offers **Check for updates** and **Restart and install**. Restart is always explicit; checking never closes the workspace.

Development/portable builds and macOS/Linux report that this updater is unavailable. Users of older Max builds that do not contain this updater must install the first updater-enabled release manually once.

The typed preload API is `maxApi.updates.getStatus()`, `.check()`, and `.install()`. Feed URLs are configured in the main-process build, never supplied by the renderer. The default is:

`https://github.com/omar-Suleiman14/max/releases/latest/download`

GitHub redirects that path to the newest stable release's assets, which is exactly the shape Squirrel expects: a `RELEASES` index beside the full and delta `.nupkg` files it names. SHA-1 in that index is Squirrel's format requirement, not a substitute for Windows code signing.

## Verification on Windows (2026-09-09)

- Clean dependency installation and production-dependency audit: completed; no production advisories.
- Squirrel/ZIP packaging and size budgets: passed.
- Separate `MaxReleaseVerification` test identity: installed 0.3.0 silently, launched the packaged app, detected and applied local-feed 0.3.1, launched the updated app, then uninstalled successfully. Every process exited with code 0.
- Test SQLite file hash was unchanged across the upgrade and uninstall. Uninstall removed the executable and preserved user data.
- This verifies the real local Squirrel install/upgrade/uninstall path. A live GitHub release to installed app upgrade cannot be claimed until an actual stable release is published against the release-asset feed.
- Windows signing credentials are not configured. Installers are unsigned and can show Windows reputation warnings.
- The full dependency audit still reports 39 development-tool advisories (6 moderate, 32 high, 1 critical). Upgrading the Forge/build-tool chain is separate from this release slice; production dependencies have no reported advisories.

The final package uses the supplied `IMG_5053.PNG` artwork for the app and platform icons. Windows uses a 35-pixel native controls overlay without the File/Edit/View/Help menu. Development-mode Electron startup and the latest shell tests passed after correcting deferred-component initialization order.

Local evidence is in `.cache/release-verification/`; deliverable installers are in `out/make/squirrel.windows/x64/`. The test application's retained data is under `%APPDATA%/Max Release Verification`, separate from Max's data.
