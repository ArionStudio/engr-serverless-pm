# Audited stash batches

This document records the September 8 extraction. Batches 01–07 subsequently merged through PRs [#98](https://github.com/ArionStudio/engr-serverless-pm/pull/98), [#99](https://github.com/ArionStudio/engr-serverless-pm/pull/99), [#100](https://github.com/ArionStudio/engr-serverless-pm/pull/100), [#101](https://github.com/ArionStudio/engr-serverless-pm/pull/101), [#102](https://github.com/ArionStudio/engr-serverless-pm/pull/102), [#103](https://github.com/ArionStudio/engr-serverless-pm/pull/103), and [#104](https://github.com/ArionStudio/engr-serverless-pm/pull/104). Batch 08 contains the final icon integration and this record. Each applied batch was reviewed against its merged predecessor; merged stash objects remain under backup refs.

This set replaces the earlier overlapping review batches for the purpose of preparing PRs. Older stashes are preserved; do not combine them with this set.

## Merge order

| Batch | Local review branch suffix | Scope                                                                                                                                   | Base                       |
| ----- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 01    | `01-sync-foundations`      | Sync foundations, initial Sync UI and PR #98 review fixes                                                                               | `origin/main` at `094567a` |
| 02    | `02-entry-workspace`       | Visible entry contracts, Options workspace and popup quick access                                                                       | Batch 01                   |
| 03    | `03-guided-s3-setup`       | Guided S3 setup, IAM instructions, layout and browser host access                                                                       | Batch 02                   |
| 04    | `04-vault-recovery`        | Forgotten-password recovery and numbered recovery paste                                                                                 | Batch 03                   |
| 05    | `05-vault-management`      | Organization model/codec and consumers, vault/device/settings/sync management, complete application UI and actionable revocation errors | Batch 04                   |
| 06    | `06-browser-integration`   | Website capture/fill, optional session retention and Firefox packaging                                                                  | Batch 05                   |
| 07    | `07-structured-search`     | `@` login, `#` tag, `/` folder, `:` website, suggestions and filter chips                                                               | Batch 06                   |
| 08    | `08-site-icons-and-audit`  | Optional browser icons, settings/provider integration and audit documentation                                                           | Batch 07                   |

Full branch names start with `review/audit-20260908-`. Stash descriptions start with `LFSPM audit 2026-09-08 batch`. The machine-readable manifest in `.local/full-audit/stash-batches.json` records exact base, commit, tree and stash IDs. Use those IDs rather than numeric stash positions, which change whenever another stash is created.

Batch 05 is the largest. The organization schema, snapshot codec, fixtures, sync review and application consumers must change together to keep the extension buildable. It includes passwordless entry contracts and optional browser display components; the production browser-login capability and content runtime arrive in Batch 06. Search and icon integration have their own later deltas, including their gallery changes and relevant regressions.

## Review and create PRs

The local review branches end at each cumulative batch. Review the first against `origin/main` and each later branch against the previous review branch. Batch 01 matched [PR #98](https://github.com/ArionStudio/engr-serverless-pm/pull/98), including its two review fixes. The remaining batches include those fixes in their bases.

For a normal PR after its predecessor has merged, start a fresh branch from the updated main and apply only that batch's stash ID:

```sh
git switch -c feature/next-reviewed-batch origin/main
git stash apply <stash-id-from-manifest>
# Inspect, validate and commit this batch before publishing its PR.
```

Merge each reviewed PR before applying the next batch. The original extraction branches contain cumulative diffs and are historical checkpoints; do not open all eight against main simultaneously.

These batches are sequential. At extraction, their ordered replay matched the audited tree without conflicts. Subsequent review fixes and other changes to main can require conflict resolution when applying a later batch. The same files may appear in several batches where a later feature extends an earlier implementation.

The original branch and older stashes remain available. Full pre-audit and audited checkpoints are retained under `refs/backups/full-audit/`. Prefer `stash apply` over `pop` while reviewing so the saved batch is retained.

## September 8 follow-up changes

Batch 05 includes specific device-revocation errors and safe key replacement instructions. Batch 06 includes the optional setting to retain detected logins across page changes, encrypted session cleanup, original-website matching, and its tests and gallery states. Their shared gallery edits are split by feature. Later batches are rebuilt on those updated trees.

The stash manifest was regenerated after these additions. Superseded stash objects and the original complete working tree remain under `refs/backups/stash-fold/`; the nine older pre-audit stashes remain on the stash list. At extraction, the active eight-batch sequence was at the top of the list in merge order. Merged batches are removed from the active stash list only after their merge is verified.
