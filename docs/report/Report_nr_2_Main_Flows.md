1. Vault initialization
   - starts from: `user`
   - uses: `Popup`, `Options page`, `Extension service workers`, `indexedDB`
   - flow:
   1. `user` clicks on "setup vault" in `popup` or starts vault setup directly in `options page`
   2. `popup` opens `options page` with vault initialization form if needed
   3. `user` provides master password and current device name, then confirms vault creation
   4. `options page` sends vault initialization request and master password to `extension service worker`
   5. `extension service worker` generates a local vault display name and creates a `local vault descriptor`
   6. `extension service worker` creates the `vault master key`, device slot key, device signing key pair, recovery key source material, and the initial empty vault state
   7. `extension service worker` converts the recovery key source material to a BIP39 `recovery mnemonic key` for one-time display and creates a recovery-wrapped access slot for the `vault master key`
   8. `extension service worker` protects local keys with master-password-derived local protection keys and stores them as `device access material`
   9. `extension service worker` encrypts and signs the initial `vault snapshot` and stores it in `indexedDB`
   10. `extension service worker` stores the `local vault descriptor` and the unlocked vault runtime state
   11. `extension service worker` returns vault creation success, generated vault display name, and the `recovery mnemonic key` to `options page` for one-time display
   12. `options page` shows vault creation success and displays the generated vault display name and `recovery mnemonic key` with backup instructions to `user`

2. List local vaults
   - starts from: `user`
   - uses: `Popup`, `Extension service workers`, `indexedDB`
   - flow:
   1. `user` opens the extension on a device with local vault data
   2. `popup` asks `extension service worker` for local vaults available on this device
   3. `extension service worker` loads local vault descriptors from `indexedDB`
   4. `extension service worker` returns non-secret vault descriptors to `popup`
   5. `popup` shows generated vault display names so the user can choose which vault to unlock

3. Vault unlock
   - starts from: `user`
   - uses: `Popup`, `Extension service workers`, `indexedDB`, `storage.session`
   - flow:
   1. `user` selects a local vault descriptor, enters master password, and clicks on "unlock vault" in `popup`
   2. `popup` sends unlock request with selected vault id and master password to `extension service worker`
   3. `extension service worker` loads `device access material` for the selected vault from `indexedDB`
   4. `extension service worker` loads the selected `vault snapshot` from `indexedDB`
   5. `extension service worker` verifies the `vault snapshot` signature using the locally trusted device public signing key
   6. `extension service worker` derives the master-password root key, derives the local keys protection key, and unwraps local keys
   7. `extension service worker` finds the current device key slot, derives the device-slot protection key, and unwraps the `vault master key`
   8. `extension service worker` decrypts the `vault snapshot` content using the `vault master key`
   9. `extension service worker` stores the unlocked vault runtime state in `storage.session`, including vault id, device id, plaintext vault, `vault master key`, and device private signing key
   10. `extension service worker` confirms unlock success to `popup`
   11. `popup` shows unlocked vault state and search UI

4. Browse and search password entries
   - starts from: `user`
   - uses: `Popup`, `Extension service workers`, `storage.session`
   - flow:
   1. `user` enters search query or opens the vault entry list in `popup`
   2. `popup` sends browse/search request to `extension service worker`
   3. `extension service worker` loads the unlocked vault from `storage.session`
   4. `extension service worker` returns matching entry metadata to `popup`
   5. `popup` shows matching entries to `user`

5. Read password entry
   - starts from: `user`
   - uses: `Popup`, `Extension service workers`, `storage.session`
   - flow:
   1. `user` clicks selected password entry in `popup`
   2. `popup` sends selected password entry id to `extension service worker`
   3. `extension service worker` reads `entry details` from the unlocked vault in `storage.session`
   4. `extension service worker` sends `entry details` to `popup`
   5. `popup` shows `entry details`

6. Add new password entry
   - starts from: `user`
   - uses: `Popup`, `Extension service workers`, `storage.session`, `indexedDB`
   - flow:
   1. `user` clicks on "add password" in `popup`
   2. `popup` shows new password entry form
   3. `user` fills `full entry details` and submits the form
   4. `popup` sends `full entry details` to `extension service worker`
   5. `extension service worker` adds the new entry to the unlocked vault in `storage.session`
   6. `extension service worker` stores updated unlocked vault state back in `storage.session`
   7. `extension service worker` creates a new encrypted `vault snapshot` and stores it in `indexedDB`
   8. `extension service worker` marks local sync state as needing upload if sync is enabled
   9. `extension service worker` confirms success to `popup`
   10. `popup` shows updated vault state

7. Update password entry
   - starts from: `user`
   - uses: `Popup`, `Extension service workers`, `storage.session`, `indexedDB`
   - flow:
   1. `user` opens selected password entry and clicks "edit" in `popup`
   2. `popup` shows edit form with current `entry details`
   3. `user` updates `full entry details` and submits the form
   4. `popup` sends updated `full entry details` to `extension service worker`
   5. `extension service worker` updates the entry in the unlocked vault in `storage.session`
   6. `extension service worker` stores updated unlocked vault state back in `storage.session`
   7. `extension service worker` creates a new encrypted `vault snapshot` and stores it in `indexedDB`
   8. `extension service worker` marks local sync state as needing upload if sync is enabled
   9. `extension service worker` confirms success to `popup`
   10. `popup` shows updated entry

8. Remove password entry
   - starts from: `user`
   - uses: `Popup`, `Extension service workers`, `storage.session`, `indexedDB`
   - flow:
   1. `user` opens selected password entry and clicks "remove" in `popup`
   2. `popup` asks `user` to confirm removal
   3. `user` confirms removal
   4. `popup` sends password entry id to `extension service worker`
   5. `extension service worker` removes the entry from the unlocked vault in `storage.session`
   6. `extension service worker` stores updated unlocked vault state back in `storage.session`
   7. `extension service worker` creates a new encrypted `vault snapshot` and stores it in `indexedDB`
   8. `extension service worker` marks local sync state as needing upload if sync is enabled
   9. `extension service worker` confirms success to `popup`
   10. `popup` shows updated vault state

9. Password generation
   - starts from: `user`
   - uses: `Popup`, `Extension service workers`
   - flow:
   1. `user` opens password generator in `popup`
   2. `user` selects generation rules and clicks "generate"
   3. `popup` sends generation parameters to `extension service worker`
   4. `extension service worker` generates a secure random password using browser cryptographic randomness
   5. `extension service worker` sends generated password back to `popup`
   6. `popup` shows generated password and allows `user` to accept it into a password entry form

10. Reveal password

- starts from: `user`
- uses: `Popup`, `Extension service workers`, `storage.session`
- flow:

1.  `user` opens selected password entry and clicks "reveal password" in `popup`
2.  `popup` sends password entry id to `extension service worker`
3.  `extension service worker` reads the password value from the unlocked vault in `storage.session`
4.  `extension service worker` sends password value to `popup`
5.  `popup` reveals the password value to `user`

6.  Copy to clipboard
    - starts from: `user`
    - uses: `Popup`, `Extension service workers`, `storage.session`, `Clipboard`
    - flow:
    1. `user` opens selected password entry and clicks "copy" in `popup`
    2. `popup` sends password entry id to `extension service worker`
    3. `extension service worker` reads the password value from the unlocked vault in `storage.session`
    4. `extension service worker` sends password value to `popup`
    5. `popup` copies the password value to `Clipboard`
    6. `popup` shows copy confirmation
    7. `popup` schedules clipboard clear after configured timeout

7.  Autofill password on page
    - starts from: `user`
    - uses: `Popup`, `Target web page`, `Content scripts`, `Extension service workers`, `storage.session`
    - flow:
    1. `user` opens a `Web Page` with login fields
    2. `user` opens `popup` and clicks "autofill password"
    3. `popup` sends the current page url to `extension service worker`
    4. `extension service worker` searches the unlocked vault in `storage.session` for matching entries
    5. `extension service worker` sends matching `entry identifications` to `popup`
    6. `popup` shows matching entries to `user`
    7. `user` selects the proper entry and confirms autofill
    8. `popup` sends selected password entry id to `extension service worker`
    9. `extension service worker` reads only the login and password fields needed for autofill and sends them with fill instructions to `content script`
    10. `content script` fills the `Web Page` using the provided fill instructions

8.  Setup sync layer
    - starts from: `user`
    - uses: `Options page`, `S3 bucket`, `indexedDB`, `Extension service workers`
    - flow:
      [ `user` should complete S3 configuration before this flow ]
      [ `vault` should be unlocked so the master-password-derived sync-credentials protection key is available in runtime memory ]
    1. `user` clicks "setup sync" in `options page`
    2. `options page` shows sync configuration form
    3. `user` provides `cloud sync credentials` and submits the form
    4. `options page` sends sync configuration to `extension service worker`
    5. `extension service worker` uses AWS credentials to verify that the configured `AWS S3 bucket` is reachable and usable for sync
    6. `extension service worker` encrypts `cloud sync credentials` with the dedicated master-password-derived protection key and stores them in `indexedDB`
    7. `extension service worker` creates initial local sync state
    8. `options page` informs `user` that sync setup succeeded or failed

9.  Send update to sync layer
    - starts from: `user` / `extension service worker`
    - uses: `Popup`, `S3 bucket`, `indexedDB`, `Extension service workers`
    - note: password entry changes persist a new encrypted `vault snapshot` to `indexedDB`; sync upload uses the latest persisted snapshot
    - flow:
    1. `user` clicks "sync with cloud" in `popup` or `extension service worker` starts sync automatically
    2. [ `popup` ] sends sync request to `extension service worker`
    3. `extension service worker` loads the latest persisted encrypted local `vault snapshot` from `indexedDB`
    4. `extension service worker` loads `cloud sync credentials` and local sync state from `indexedDB`
    5. `extension service worker` uploads the latest persisted encrypted `vault snapshot` and related metadata to `S3 bucket`
    6. `extension service worker` updates local sync state in `indexedDB`
    7. [ `popup` ] receives sync result from `extension service worker`

10. Get update from sync layer
    - starts from: `user` / `extension service worker`
    - uses: `Popup`, `S3 bucket`, `indexedDB`, `storage.session`, `Extension service workers`
    - flow:
    1. `user` clicks "get cloud update" in `popup` or `extension service worker` starts sync automatically
    2. [ `popup` ] sends cloud update request to `extension service worker`
    3. `extension service worker` loads `cloud sync credentials` and local sync state from `indexedDB`
    4. `extension service worker` downloads the latest encrypted `vault snapshot` and related metadata from `S3 bucket`
    5. `extension service worker` verifies downloaded data and compares it with local sync state
    6. if no conflict exists and the vault is locked, `extension service worker` stores the remote canonical vault state locally in `indexedDB`
    7. if no conflict exists and the vault is unlocked, `extension service worker` decrypts the remote snapshot, stores the unlocked vault in `storage.session`, and stores the canonical encrypted vault state in `indexedDB`
    8. if conflict exists, `extension service worker` starts conflict resolution flow
    9. [ `popup` ] receives update result from `extension service worker`

11. Resolve conflicts between cloud and local
    - starts from: `extension service worker`
    - uses: `Popup`, `indexedDB`, `storage.session`, `Extension service workers`
    - flow:
      [ `vault` must be unlocked because conflict resolution compares decrypted local and remote vault states ]
    1. `extension service worker` loads local and remote vault states
    2. `extension service worker` decrypts both states and compares their content
    3. `extension service worker` detects added, removed, and updated entries and prepares conflict summary
    4. `extension service worker` sends conflict summary to `popup`
    5. `popup` shows differences and allows `user` to review conflicts
    6. `user` chooses the final resolved content in `popup`
    7. `popup` sends resolved result to `extension service worker`
    8. `extension service worker` creates a new encrypted `vault snapshot` from the resolved vault state and stores it in `indexedDB`
    9. `extension service worker` stores the resolved unlocked vault in `storage.session`
    10. `extension service worker` starts "Send update to sync layer" if resolution changed the vault state

12. New device enrollment
    - starts from: `user`
    - uses: `Options page`, `S3 bucket`, `indexedDB`, `Extension service workers`
    - flow:
      [ Need further consultation on topic ]

13. Device revocation
    - starts from: `user`
    - uses: `Options page`, `indexedDB`, `Extension service workers`
    - flow:
    1. `user` opens device list in `options page`
    2. `user` selects a registered device to revoke
    3. `options page` sends device revocation request to `extension service worker`
    4. `extension service worker` loads current local vault state
    5. `extension service worker` removes the revoked device from device registry and removes its registered public keys and wrapped access slot
    6. `extension service worker` rotates the `vault master key` and re-wraps access for remaining trusted devices and the recovery slot
    7. `extension service worker` stores updated local vault state in `indexedDB`
    8. `extension service worker` starts "Send update to sync layer"
    9. `options page` informs `user` that the revoked device should not receive future updates but may still retain previously available local data

14. Vault access recovery using recovery mnemonic key
    - starts from: `user`
    - uses: `Options page`, `indexedDB`, `Extension service workers`
    - flow:
    1. `user` opens "recover vault access" in `options page`
    2. `options page` asks for the `recovery mnemonic key` and a new local master password
    3. `user` provides the `recovery mnemonic key` and new local master password
    4. `options page` sends recovery request to `extension service worker`
    5. `extension service worker` loads local vault state from `indexedDB`
    6. `extension service worker` converts the `recovery mnemonic key` back to recovery key source material and uses it to recover access to the `vault master key`
    7. `extension service worker` creates fresh local device private key material for the current device and protects it with keys derived from the new local master password
    8. `extension service worker` updates local vault state so the current device has valid access again
    9. `extension service worker` stores updated local state in `indexedDB`
    10. [ if sync is enabled ] `extension service worker` may start "Send update to sync layer"
    11. `options page` informs `user` that local access was recovered

15. Change master password
    - starts from: `user`
    - uses: `Options page`, `indexedDB`, `Extension service workers`
    - flow:
    1. `user` opens "change master password" in `options page`
    2. `options page` informs `user` that master password change is local to the current device
    3. `user` provides current master password and new master password
    4. `options page` sends password change request to `extension service worker`
    5. `extension service worker` loads local password-protected state from `indexedDB`
    6. `extension service worker` verifies the current master password
    7. `extension service worker` re-protects local password-protected state with protection keys derived from the new master password
    8. `extension service worker` stores updated local state in `indexedDB`
    9. `options page` informs `user` that the master password was changed on the current device

16. Vault lock
    - starts from: `user` / `extension service worker`
    - uses: `Popup`, `indexedDB`, `storage.session`, `Extension service workers`
    - flow:
    1. `user` clicks "lock vault" in `popup` or `extension service worker` starts lock automatically
    2. [ `popup` ] sends lock request to `extension service worker`
    3. `extension service worker` removes the unlocked vault from `storage.session`
    4. `extension service worker` clears temporary vault-unlock state that should not remain available after lock
    5. `extension service worker` clears temporary runtime state
    6. [ `popup` ] receives locked state confirmation from `extension service worker`

17. Remove files from cloud sync
    - starts from: `user`
    - uses: `Options page`, `S3 bucket`, `indexedDB`, `Extension service workers`
    - flow:
    1. `user` opens "remove files from cloud sync" in `options page`
    2. `options page` shows destructive action warning and asks `user` for confirmation
    3. `user` confirms cloud file removal
    4. `options page` sends cloud file removal request to `extension service worker`
    5. `extension service worker` loads `cloud sync credentials` from `indexedDB`
    6. `extension service worker` deletes remote vault data from `S3 bucket`
    7. `options page` informs `user` that files stored in cloud sync were removed, while the local vault and local sync configuration remain available

18. Delete vault
    - starts from: `user`
    - uses: `Options page`, `indexedDB`, `storage.session`, `Extension service workers`
    - flow:
    1. `user` opens "delete vault" in `options page`
    2. `options page` shows destructive action warning and explains that this flow deletes local vault data only
    3. `options page` informs `user` that removing files from cloud sync is a separate action
    4. `user` confirms local vault deletion
    5. `options page` sends vault deletion request to `extension service worker`
    6. `extension service worker` removes local vault descriptor, local vault state, local sync state, device access material, and session state from local storage
    7. `extension service worker` clears temporary runtime state
    8. `options page` informs `user` that the local vault was deleted from the device

19. Remove local sync credentials
    - starts from: `user`
    - uses: `Options page`, `S3 bucket`, `indexedDB`, `Extension service workers`
    - flow:
    1. `user` opens "remove sync" in `options page`
    2. `options page` shows warning, explains that files must be removed from cloud sync first so orphaned files do not stay in the cloud, and asks `user` for confirmation
    3. `user` confirms sync removal
    4. `options page` sends sync removal request to `extension service worker`
    5. `extension service worker` starts "Remove files from cloud sync"
    6. after cloud file removal succeeds, `extension service worker` removes local sync state and encrypted `cloud sync credentials` from `indexedDB`
    7. `options page` informs `user` that local sync credentials were removed, sync is disabled until it is set up again, and the local vault remains available
