# Website logins

The popup lists saved logins matching the active page's exact origin: scheme,
host and port. Fill requires an unlocked vault and an explicit click on an
entry. It never submits the form. A sibling subdomain does not inherit access.

The browser adapter uses MV3 `activeTab` and `scripting` for manual Fill. It
checks the active tab and URL again before sending only the selected login and
password to frame 0. The content script checks its per-document random token,
current URL, inspected form identity, visible editable fields and form destination before inserting
values through native setters and input/change events. Inputs need a rendered
rectangle with positive width and height. Formless authentication copy comes
from a nearby semantic form, dialog, section or article, not global navigation.
A password-only field without such a boundary needs current-password metadata;
registration and password-change fields are never filled with a saved password.

Login detection is off initially. The popup's Login detection control requests
optional website permission and registers a bundled content script. Turning it
off removes the field action, stops local capture and unregisters the script. The
background also rejects further captures from already-open pages. Enabling it
injects the script into eligible active tabs immediately. No remote code is downloaded.

Trusted submit, sign-in button and Enter interactions can offer a captured
login for review. A submitted form is not proof that the website accepted the
password. The extension never writes a captured login to the vault automatically.
The popup’s Detected tab contains the visible detection switch and captured
login review plus the recognized form and fields before submission. Both Detected
and Vault offer matching entries for supported sign-in steps; Settings contains appearance,
device name and lock duration. The popup opens the existing entry editor for a new login or password update;
updates retain organization and use the existing stale-edit checks.

The background accepts messages only from this extension's top-frame content
script, on an allowed origin, with detection permission enabled. Capturing while
locked is ignored. Capture and popup requests expire after five seconds; the
background rechecks their deadline after waits and before the requested action.
The stored popup handoff carries that same deadline and is removed when consumed;
a later toolbar opening cannot reuse an expired handoff.
One background composition graph shares its session resources between browser
login handling and scheduled lock cleanup so locking wipes the material they used.
Pending credentials are encrypted with AES-GCM using an HKDF
key derived from the device-local protection key and bound to the unlocked
session, vault and tab. By default they expire after two minutes and are discarded
when reviewing on another origin. The optional “Keep detected login across page
changes” switch below Login detection retains new captures for the current
unlocked session, including redirects to another origin in the same tab. Review
uses the captured website and only offers updates to accounts on that original
origin. Fill continues to match the current page.

Captures stay encrypted in `chrome.storage.session`, are not written to disk or
synced, and disappear on browser shutdown. Saving, dismissing the proposal in Detected, closing the tab,
locking or replacing the vault session removes the capture. Closing the website
prompt only hides that notice; the proposal remains available in Detected. Turning off detection
or session retention clears waiting captures. A shared storage lock orders
capture writes, setting changes and cleanup; session-bound encryption prevents
old captures from being read during or after session invalidation. Lists and
website prompts never contain passwords. Worker startup also retries cleanup
for tabs that have already closed.

Saving an edited proposal clears its original capture by identity after the
local save. If that cleanup fails, the editor preserves the save receipt and
directs the user to dismiss the capture in Detected.

## Supported forms and limits

- HTTPS pages and loopback HTTP pages at localhost, 127.0.0.1 and [::1] used for local development.
- Visible top-level login forms, common form-less layouts and open shadow roots.
- Email/username steps with authentication context, then explicit password Fill.
- Registration and password-change recognition from autocomplete, labels, names,
  headings and submit actions. Existing passwords are never filled into these forms.
  Native action inputs and role buttons use their accessible names, including
  image alt text. Clicks inside open-shadow controls use the semantic button host.
- Focus and DOM changes refresh a small LFSPM action beside the recognized field.
  Its click opens Detected, with a toolbar fallback when the browser refuses.
  The request is bound to the active tab and consumed once; a failed opening
  removes only its own request, preserving any newer request.
- Password-only Fill and capture require current-password metadata or explicit
  sign-in context. An ambiguous Password/Continue or lone Confirm password step
  requires manual entry and does not produce a captured login.
- Current-password fields for Fill; consistent new/confirmation passwords for
  capture. OTP fields are excluded.
- Cross-origin form destinations, hidden/read-only/disabled fields, ambiguous
  forms and embedded-frame login forms require manual entry.
- Each page in an identifier-first flow can be filled explicitly. The extension
  does not carry typed usernames across page navigation for capture, and it does
  not fill on page load. Browser restrictions may require opening the toolbar manually
  after choosing Review login.

A website can read a password after the user fills its form. Origin checks
cannot protect a user from a compromised website on that same origin.

## Verification

Focused tests cover the session and origin boundaries, real encrypted capture
storage and tamper rejection, tab/document changes before Fill, DOM field
selection, synthetic-event suppression, and the editor review boundary. The
component gallery exposes matching, captured, update, unavailable, unsupported
form and error states, plus the actual website prompt. Browser verification uses
a disposable profile and controlled credentials, never an existing user vault.

## Reference approach

Field recognition and observation were compared with Bitwarden clients commit
`5b6242f15550b16d789da6f22d3d99bda0b31683`, particularly
`collect-autofill-content.service.ts` and
`inline-menu-field-qualification.service.ts`. LFSPM implements these concepts
independently. No Bitwarden source was copied or bundled. This is not full
Bitwarden autofill parity; iframe filling, cross-page capture correlation and
an inline list of decrypted vault entries remain outside this implementation.

## Email-link accounts

An explicit email/sign-in-link submission can capture the email and website
without a password. An identifier-only Next/Continue step does not. Captures
never include the emailed token or link. Review preselects the email-link option;
Add/Update commands require explicit `withoutPassword` intent to persist an empty
entry password. Normal password writes retain strength and weak-password consent
checks. Empty passwords use the current entry schema, without a migration or
invented password. Visible entry metadata exposes `hasPassword` so details omit
password reveal/copy for these accounts.

A matching saved account suppresses email-only capture, even if it already has a
password. Email-only captures never propose a password update. The user can fill
the saved email on the website and request a fresh link there.

### Popup refresh and validation

The sync panel is visible only on the main Vault list, and remains mounted when navigating other popup pages so a single check survives tab changes. Opening or unlocking a completed vault starts its check. It reads the
local snapshot version vector and, when sync is configured and browser storage
access is already granted, downloads and verifies S3 through the existing sync
review use case. Focus changes and popup tab navigation do not start more S3
requests. There is no background permission prompt. Disabled sync and missing
permission remain visible beside the configuration action. Relevant permission
grants and removals refresh the local access status even when Detected is open;
this refresh does not itself start another S3 request.

The popup displays verified equality, remote changes awaiting explicit review,
local changes needing upload, provider errors, and the local version vector.
`Sync now` rechecks S3; `Retry upload` uses the existing conditional upload path.
Remote resolutions are reviewed and applied inside the popup using the existing
sync controls and snapshot identity guards. Opening the popup alone never
resolves conflicts or accepts device-trust changes. Locking or switching vaults
invalidates pending UI work, and entry drafts are not remounted by a sync check.

Submitting an invalid entry form focuses and scrolls to the first invalid field,
including another submission of the same weak password. Passwordless email-link
entries still require explicit intent; ordinary blank password writes are rejected.

### Same-document sign-in navigation

Chromium may retain a content script's original `MessageSender.url` after
`history.pushState` navigation. Opening the toolbar popup therefore requires a
trusted top-frame extension sender, enabled detection, the same origin as the
current tab, and an active tab, without requiring identical paths or fragments.
The popup opens in that tab's browser window. Capture likewise requires the
reported page URL to share the trusted sender and current tab origin. Fill still
revalidates the current URL, document token and recognized form before inserting
any credentials.
