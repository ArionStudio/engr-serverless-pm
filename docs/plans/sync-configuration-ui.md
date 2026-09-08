# Sync configuration UI

Status: implemented; final validation recorded below, 2026-09-06.

The user corrected the delivery order: enable and test real sync before building
the entry workspace. The workspace checklist remains later work.

## Scope and review

Expose Sync on the options page after vault setup and unlock. Reuse CredentialForm
and sync review/status presentation with the exact preset, corrected contrast and
focus, no subtitles, and gallery coverage. Show the bucket, region, object prefix,
access key ID and secret access key. Include S3 setup information, optional
browser storage permission and the existing provisioning documentation.

Add narrow core read/test workflows for non-secret configuration and read-only
access testing. Compose them with the existing setup, credential replacement,
upload, review and resolution workflows. Keep AWS input mapping at the extension
boundary. Secrets remain local form drafts and encrypted device credentials.

Acceptance:

- Read access testing makes no remote write or local configuration change.
- Enable sync explicitly uploads the encrypted vault and distinguishes complete
  from uncertain upload. Existing remote data must not be overwritten by setup.
- When S3 contains a strictly newer authenticated copy of the same vault, show
  that result beside the credentials and require a separate **Use newer vault
  from S3** action. Recheck the exact reviewed local and remote identities before
  replacing the older local copy; never upload in this reconnect path.
- Reopening shows persisted configuration without revealing saved credentials.
- Check/retry, remote review and same-target credential replacement call actual
  workflows and report their results without raw provider errors.
- Lock/session changes, navigation and late responses clear drafts and private
  reviews. No UI timer owns vault locking or clipboard behavior.
- Request optional access to the exact SDK-resolved S3 HTTPS host on a user
  action. Existing CORS rules may remain but are not required. Verify signed
  requests without CORS headers, denial, revocation and conditional writes.
- Update gallery and screens navigation with all new states/variants. Run focused
  tests, full affected package gates, production/gallery builds, visual review and
  unpacked-Chrome checks. Live AWS writes require the user's configured account;
  controlled validation must not be described as a live S3 test.

Reviewed against UI-001/006/007, API-001/003/004, CORE-ARCH dependency direction,
SESSION ownership, SYNC conditional writes, and TEST-005/007. No entry/icon work,
new dependency, schema version or automatic destructive sync-disable action belongs
in this pass.

References checked September 6, 2026: [Chrome cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
and [S3 CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html).
The existing [S3 provisioning guide](../aws/s3/README.md) remains the deployment
source; IAM scope, public-access blocking and HTTPS enforcement remain required.
See [browser storage access](../aws/s3/README.md#browser-storage-access).

## Implementation and verification

Options exposes Sync for a completed, unlocked vault. The shared form supports
setup and same-target access-key repair. Configuration reads return only the
location; access tests are read-only. The screen connects upload, review and
explicit resolution choices to the composed core workflows. Session changes and
navigation clear secrets and ignore late responses. Returning from the AWS
console preserves an unfinished draft while the session remains valid.

Initial setup also connects a device whose selected S3 namespace already holds a
newer signed copy of that same vault. Discovery does not configure sync. The
screen keeps the entered credentials in memory, presents the existing-vault
state at readable status-panel scale and waits for the explicit reconnect
action. Core then repeats descriptor, signature, trust, key-slot, device-profile,
target and identity checks before atomically adopting the remote snapshot with
encrypted local credentials. Unsupported or changed remote state stays blocked.

The user's additional focus request is included: page-navigation targets have no
outline; controls use a 1px keyboard border with a 1px offset. Outline geometry
is excluded from control transitions. The gallery uses the same rules.

Validation on Chrome 152 with a disposable profile and intercepted S3 responses
used the real AWS SDK and signed requests. Access testing made zero writes;
enabling sync made one conditional encrypted upload. Verified equality, repair
and retry added no upload. Reload preserved the target; locking from another tab
removed the credential form. No unexpected console, page or CDP Log errors.
This is controlled browser validation, not a live AWS account test.

Validation covers core and extension behavior, type checks, lint, production
builds, gallery registration and the controlled unpacked-browser sync flow.
The build retains the existing warning about a chunk exceeding 500 kB.

After the user requested test cleanup, custom contrast/focus/variant audit
scripts, filename regex tests and duplicate gallery password tests were removed.
Visual appearance remains a gallery review task. Keep regression coverage for
secret cleanup, stale operations, sync convergence and provider boundaries.
`docs/ui-ux/verification/sync-options.verify.cjs` checks the actual extension/SDK
workflow; `unpacked.verify.cjs` checks Chrome packaging and runtime startup.
The component inventory maps 289 components/parts and 73 variant axes.

Live acceptance still requires the user's bucket, browser storage permission and
scoped access keys entered in Options. New-device enrollment and device-trust consumption UI
remain separate work; this pass reports that prerequisite when sync encounters
such a transition.

## Self-service S3 setup

The next step was corrected by the user: provide setup UI with instructions for
creating their own S3 storage before asking them to test an existing bucket.
Unconfigured Sync now opens an in-app guide with two methods: downloading and
deploying the repository's CloudFormation template, or creating the bucket and
scoped IAM policy manually. The guide includes private access, SSE-S3, versioning,
optional browser access, HTTPS enforcement, key creation, costs,
connection testing and troubleshooting.

The guide is a Sync feature presentation. A pure document generator prepares
AWS policy JSON from non-secret location inputs, rejecting wildcard and policy
variable injection. Existing sync use cases still own configuration and network
operations. No provisioning service, credentials in documentation or new
dependency is introduced. Browser permissions are handled outside core. Manual location values survive the
handoff to the credential form. Existing-storage users can go directly there.

Gallery family S04 registers the guide and its compound parts; the Screens page
has a visible **Set up S3** entry, both setup methods and a copy-failure state.
The provisioning guide records the checked AWS references. Validation adds
permission-scope regression coverage and a navigation test proving that reading
the guide does not contact S3. Browser review covers the actual template download,
manual policy copy and the connection handoff.

Historical validation before the host-permission change, September 6, 2026:
525 extension tests passed, followed by all 14 sync
tests after the final policy-input and labeling fixes. Type checks, lint,
production build and gallery inventory passed. Unpacked Chrome 152 downloaded
a byte-identical copy of the canonical template, generated CORS for its actual
extension ID and retained manual location values into the connection form.
The controlled sync flow still made one conditional upload across eight signed
requests, with no unexpected console or runtime errors. Gallery review covered
desktop and narrow layouts, template/manual methods and copy failure. The build's
existing large-chunk warning remains.

## Optional S3 host permission

Implemented September 6, 2026 after the user approved replacing per-installation
CORS setup. `BrowserS3AccessAdapter` resolves the host with the AWS SDK, requests
permission before the first await in a user action and checks it before each
network attempt. The production composition injects the guarded S3 factory;
core has no browser dependency. Redirects and endpoint mismatches are rejected.

The Sync page reports missing access for existing vaults, clears stale review and
access confirmations when that storage host's permission changes, and offers **Allow storage access**.
Late permission results cannot start work after the vault session changes.
New setup documents omit CORS and extension-origin fields. Existing AWS stacks
need no update to use this flow. The provisioning guide covers optional cleanup
of old CORS settings without replacing the bucket or changing access policy.

Validation:

- Full extension suite: 548 tests passed, followed by the final 25 focused tests
  including two added regressions for retry revocation and stale access feedback.
- Type/build, lint, gallery build and inventory passed. Gallery review covered
  desktop and 400px missing-permission layouts using the actual Sync page.
- Unpacked Chrome 152 ran the real application and SDK against controlled S3
  responses without CORS headers. Verified exact host grant, reads, conditional
  first upload, ETag-based equality, credential repair, revocation/restoration,
  persisted configuration and cross-page lock. The reusable script is
  `docs/ui-ux/verification/sync-options.verify.cjs`.
- Firefox 153.0.3 on Clarke ran the same bundled S3 and browser-permission
  adapters in a disposable extension/profile. Signed GET, ETag access,
  conditional PUT and permission-revocation rejection passed without CORS.
  This is network-adapter validation, not a complete Firefox application build.
- Browser automation pregranted the exact host through browser-owned mechanisms;
  it verified the real permission check and signed adapter requests. Controlled
  responses omitted CORS headers and rejected OPTIONS requests. Native prompt
  acceptance remains a manual browser check. Denial and session changes while
  a prompt is pending have application regression coverage.

No live AWS credentials or user vault data were used for these checks.
