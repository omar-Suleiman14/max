# Windows releases and updates

Max remains a generic, offline-first workspace. Release checks do not access workspace data or require cloud sign-in.

## Publish a release

1. Include the release workflow and updater changes in the commit being released.
2. Set `package.json` and the lockfile to the next stable version. Use a matching GitHub tag, for example `v0.3.1`.
3. In GitHub, publish a release for that tag. The **Release builds** workflow builds/tests the native artifacts, attaches them to that release, and uploads the Windows packages to Cloudflare. No manual Worker upload is needed for each version.
4. Wait for the workflow to finish successfully. Publishing a release does not make an update available until the package uploads finish.

Prereleases do not advance the stable update feed. Manual workflow runs build artifacts without publishing an update. Existing versioned release assets are immutable; use a new version for changed binaries.

### One-time GitHub configuration

Repository Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`: configured for this repository.
- `CLOUDFLARE_API_TOKEN`: **still required**. Create a Cloudflare token with R2 object read/write permissions restricted to the `max-releases` bucket and save it in GitHub Actions secrets. Do not paste it into source files or use the local Wrangler OAuth token in CI.

Worker deployment and the `max-releases` bucket are configured. The separate `max-backups` bucket remains private. Subsequent release publishing only needs R2 access; it does not redeploy the Worker.

## Application behavior

Installed Squirrel Windows copies check 60 seconds after startup and every four hours. A check downloads an available update. A top-bar **Update ready** button opens Settings → Danger. The same section provides **Check for updates** and **Restart and install**. Restart is explicit; checking does not close the workspace.

Development/portable builds and macOS/Linux report that this updater is unavailable. Users of older Max builds that do not contain this updater must install the first updater-enabled release manually once.

The typed preload API is `maxApi.updates.getStatus()`, `.check()`, and `.install()`. Feed URLs are configured in the main-process build, never supplied by the renderer. The default is:

`https://max-backup-worker.omaarsuliiman.workers.dev/v1/releases/windows/x64/RELEASES`

The public Worker only serves allowlisted `RELEASES` and versioned full/delta `.nupkg` files through GET/HEAD. The index is uncached; versioned packages are immutable. Publishing validates the tag, index, SHA-1 checksums and file sizes, rejects downgrades/changed packages, uploads packages first, and advances the index last. SHA-1 is Squirrel's format requirement, not a substitute for Windows code signing.

## Verification on Windows (2026-09-09)

- Clean dependency installation and production-dependency audit: completed; no production advisories.
- Squirrel/ZIP packaging and size budgets: passed.
- Separate `MaxReleaseVerification` test identity: installed 0.3.0 silently, launched the packaged app, detected and applied local-feed 0.3.1, launched the updated app, then uninstalled successfully. Every process exited with code 0.
- Test SQLite file hash was unchanged across the upgrade and uninstall. Uninstall removed the executable and preserved user data.
- Release checksum validation dry-run and live Worker endpoint checked. The live feed remains empty until the first stable package is published.
- This verifies the real local Squirrel install/upgrade/uninstall path. A live GitHub → Cloudflare → installed-app release cannot be claimed until the token is configured and an actual release is published.
- Windows signing credentials are not configured. Installers are unsigned and can show Windows reputation warnings.
- The full dependency audit still reports 39 development-tool advisories (6 moderate, 32 high, 1 critical). Upgrading the Forge/build-tool chain is separate from this release slice; production dependencies have no reported advisories.

The final package uses the supplied `IMG_5053.PNG` artwork for the app and platform icons. Windows uses a 35-pixel native controls overlay without the File/Edit/View/Help menu. Development-mode Electron startup and the latest shell tests passed after correcting deferred-component initialization order.

Local evidence is in `.cache/release-verification/`; deliverable installers are in `out/make/squirrel.windows/x64/`. The test application's retained data is under `%APPDATA%/Max Release Verification`, separate from Max's data.
