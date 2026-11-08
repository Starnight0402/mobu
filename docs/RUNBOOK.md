# Mobu runbook

What to do when something goes wrong. Production = the Convex prod deployment + GitHub Pages at mobu.prismintelligence.in (the Android app loads the same site, so anything below applies to it too).

## One-time setup

**1. Backup passphrase (required, or nightly backups refuse to run).**

```bash
openssl rand -base64 32
```

Put the output in your password manager first, then add it as a repository secret named `BACKUP_PASSPHRASE` (Settings → Secrets and variables → Actions). Without the passphrase the backups cannot be decrypted by anyone, including you.

**2. Run the first backup by hand:** Actions → Backup → Run workflow. Check that it goes green, including the *Restore drill* step.

## Safety nets that run on their own

| What | When | Where |
| --- | --- | --- |
| Typecheck, unit, integration, perf, bundle, E2E | Every push | `ci.yml` |
| Deploy only if all of the above pass | Push to `main` | `ci.yml` → `deploy.yml` |
| Post-deploy smoke test of the live site | After every deploy | `deploy.yml` |
| Encrypted backup of all data + photos, kept 90 days | Daily 03:00 IST | `backup.yml` |
| Restore drill: each backup is restored and counted | With every backup | `scripts/backup-drill.sh` |

A failure in any of them shows up as a red run in the Actions tab, and GitHub emails you.

## The site is broken after a deploy

1. Find the last good commit: Actions → CI → filter branch `main` → the most recent run where **Deploy to production** succeeded *before* the bad one. Copy its commit SHA.
2. Actions → **Rollback** → Run workflow → paste the SHA. It redeploys that exact commit (backend + frontend) in ~5 minutes and runs the smoke test against it. It skips the test suite on purpose, because that commit already passed it.
3. Fix forward on a branch; merging to `main` deploys through the full test suite again.

Rollback restores **code, not data**. If the bad deploy also damaged data, continue below.

If Convex refuses the rollback because the old schema doesn't match data written since, roll back to a newer commit, or fix forward. Convex refusing protects your data; don't force it.

## Data was lost or corrupted

1. **Take a fresh backup first** (Actions → Backup → Run workflow) so that the current state, including anything written after the last good backup, isn't lost.
2. Download the backup from before the damage (Actions → Backup → pick the run → Artifacts), or:

   ```bash
   gh run list --workflow backup.yml --repo Starnight0402/mobu
   gh run download <run-id> --repo Starnight0402/mobu
   ```

3. Verify and decrypt (prompts for the passphrase):

   ```bash
   sha256sum -c mobu-backup-YYYY-MM-DD.sha256
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in mobu-backup-YYYY-MM-DD.zip.enc -out backup.zip
   ```

4. Optional but wise: restore into your **dev** deployment first and look around (`npx convex import --replace-all backup.zip` with your dev deployment selected), or run `bash scripts/backup-drill.sh backup.zip` to restore it into a throwaway local backend.
5. Restore production. **This replaces everything**: whatever was written after the backup was taken is gone unless you re-enter it.

   ```bash
   npx convex import --prod --replace-all backup.zip
   ```

6. Delete the plaintext `backup.zip`. It contains every message and photo.

## A nightly backup failed

- **"BACKUP_PASSPHRASE secret is not set"**: do the one-time setup above.
- **Export step failed**: usually Convex or GitHub having a moment. Re-run it. If it keeps failing, check that `CONVEX_DEPLOY_KEY` is still valid (Convex dashboard → Settings → Deploy keys).
- **Restore drill failed** (the backup itself still uploaded): production data no longer fits the current schema, *or* something didn't round-trip. Treat this as urgent, because the next schema deploy would be refused too. The step log shows which table's count differs.

## A test is failing in CI and I'm sure the code is fine

Open the run, download the `playwright-report` artifact (E2E) for screenshots, a video and a trace (`npx playwright show-trace trace.zip`). Don't disable the test to get a deploy out. If production is broken, use Rollback, which doesn't need tests to pass.

## Raising or lowering performance budgets

- Bundle: `perf-budget.json`. Lower it when you shrink the bundle, so the gain is locked in.
- Cold load and round-trip times: `e2e/perf.spec.ts` and `e2e/couple.spec.ts`.
- Chat analysis: `tests/perf/chatAnalysis.perf.test.ts`.
