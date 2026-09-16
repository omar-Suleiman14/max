# Max Cloud Backup: the packaged staging test

Unit and integration tests cannot prove Max Cloud Backup works. They run against
a fake `fetch`, so they prove the desktop service behaves correctly given a
well-behaved server. They say nothing about whether Clerk accepts the token Max
actually sends, whether the deployed Worker accepts the request shape, or
whether the bytes in R2 are the bytes that come back.

This is the procedure that does prove it. Run it against a packaged build, by
hand, and report the result. It is the only thing that counts as acceptance for
the cloud backup path.

## Before you start

You need four things. Max works without all of them; the cloud path needs them.

| What | Where it goes | Notes |
| --- | --- | --- |
| A Clerk publishable key | `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local` | Compiled into the renderer. Safe to ship. The literal `pk_test_placeholder_key` is treated as "not configured" on purpose. |
| A Clerk secret key | `wrangler secret put CLERK_SECRET_KEY` | **Worker only.** It must never appear in `.env.local` for a shipped build, in the renderer, or in any log. |
| A Clerk publishable key, again | `wrangler secret put CLERK_PUBLISHABLE_KEY` | The Worker needs both to start. |
| The Worker address | `MAX_BACKUP_WORKER_URL` in `.env.local` | Compiled into the Electron main process only. Defaults to `https://max-backup-worker.omaarsuliiman.workers.dev`. |

The Worker also needs an R2 bucket named `max-backups`, bound as
`BACKUPS_BUCKET`. That binding is in `worker/wrangler.toml`.

Check the Worker is alive and that its authentication is switched on before
doing anything else:

```bash
curl -s https://max-backup-worker.omaarsuliiman.workers.dev/health
curl -s -o /dev/null -w '%{http_code}\n' https://max-backup-worker.omaarsuliiman.workers.dev/v1/backups
```

The first must return `{"service":"max-backup-worker","status":"ok",...}`. The
second must return `401`. A `200` on the second means the Worker is serving
backups to anyone who asks, and you must stop and fix that before continuing.

## Build the packaged application

```bash
npm install
npm run setup:runtime
npm run make
```

Install the artefact from `out/make/`. Do not run `npm start`; a development run
does not prove a packaged build works, and the environment substitution that
puts the Worker address into the main process is what is being tested.

## The procedure

Do these in order. Record the result of each one. A step that does not happen is
a step that failed.

**1. Create representative local data.** Make a page, a database with at least
three property types, five records, and a relation between two databases. Write
down enough to recognise it later: the page title, the record titles, one
property value.

**2. Turn on Max Cloud Backup and sign in.** Settings, then Backup. Tick
**Use Max Cloud Backup**, then sign in. If the panel says cloud backup is
unavailable in this build, `MAX_BACKUP_WORKER_URL` did not reach the packaged
main process, and nothing after this will work.

**3. Create a cloud backup.** Press **Back up to the cloud now**. It must report
success, not a local-only backup with a cloud error. Note the time.

**4. Verify the remote listing.** Press **Refresh list**. The backup you just
made must appear, with a plausible size.

**5. Download the backup.** Press **Download** on that row. The message must say
the checksum was verified. Open the local backup history: the downloaded copy
must now be in it, named `max-cloud-<id>.maxbak`.

**6. Change or remove the local test data.** Delete two of the five records and
rename the page. This is the step that makes the restore meaningful; do not skip
it.

**7. Restore the backup.** Press **Restore** on the same row. Max takes a safety
snapshot of the current database before overwriting it, so step 6 is
recoverable.

**8. Restart Max.** Quit completely and reopen. Not a reload; a restart.

**9. Verify the restored data.** The page title, all five records, the property
value and the relation must all be back exactly as they were at step 1.

## The failure modes that also have to be checked

**A failed upload must leave a valid local backup.** Disconnect the network,
then press **Back up to the cloud now**. The message must name the step that
failed and must also say the local backup is safe. Check the local backup
history: a new local backup must be there and must verify.

**Cloud backup off must mean no network.** Untick **Use Max Cloud Backup**,
restart Max, and use it normally with the network disconnected. Nothing may warn,
fail or hang. Local backup must still work.

**The schedule must run and must skip.** Set the backup schedule to Daily, sign
in, and restart Max. A cloud backup must appear. Restart Max again within the
day: no second backup may appear, because `runScheduled` refuses to run twice
inside the window.

## Reading the diagnostics

Max writes one line per step to the main process log, prefixed
`[max-cloud-backup]`. Each line names the step, and a failure line carries the
HTTP status and a short remote message. The steps, in order, are
`authenticate`, `local-backup`, `upload`, `list`, `download`, `checksum`,
`import`, `restore` and `schedule`.

The Worker's 401 responses carry a `reason` saying which check failed:

| `reason` | What it means |
| --- | --- |
| `clerk-not-configured` | The Worker has no `CLERK_SECRET_KEY` or no `CLERK_PUBLISHABLE_KEY`. |
| `token-rejected` | Clerk would not verify the token. Usually expired, or a token from a different Clerk instance than the Worker's secret belongs to. |
| `token-missing-subject` | The token verified but carries no user, which should not happen with a session token. |
| `request-unauthenticated` | A request with no Bearer header failed the browser-shaped path. |

**Nothing in any of these lines may contain a token, a Clerk secret or an R2
credential.** Tokens are described, never printed: whether one is present, how
long it is, and how many seconds until it expires. If you ever see a token in a
log, that is a defect and it outranks whatever you were testing.

## What to report

Say which of the nine steps passed, which failed, and for any failure, the step
name and the diagnostic line. "It worked" is not a report. If the procedure was
not run at all, say that, because a cloud backup path that has only been unit
tested is a cloud backup path that has not been tested.
