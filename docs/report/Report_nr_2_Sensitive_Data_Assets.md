#### master password

- Security relevance: local access control; password-based root derivation input
- Where it lives: user memory
- What it is used for: provide the user secret used to derive the local password-based root key
- Protected by: user memory only / never stored by the system

#### KDF salt and parameters

- Security relevance: password hardening context; derivation uniqueness and reproducibility
- Where it lives: local persisted metadata
- What it is used for: derive the `master-password root key` consistently and securely from the `master password`
- Protected by: authenticated local persisted state

#### master-password root key

- Security relevance: local derivation root for dedicated protection subkeys
- Where it lives: runtime memory during unlock
- What it is used for: derive dedicated local protection subkeys for device-private-key protection and sync-credential protection
- Protected by: derived from the `master password` and local `KDF salt and parameters`; not persisted directly

#### recovery key source and recovery mnemonic key

- Security relevance: recovery of access to the vault
- Where it lives: user memory / user-kept backup
- What it is used for: recover access to the `vault master key` and re-establish local access
- Protected by: system-generated high-entropy recovery key source material encoded as a BIP39 mnemonic for user display; neither raw source material nor mnemonic is stored by the system

#### vault master key

- Security relevance: vault confidentiality and integrity
- Where it lives: wrapped in local persisted vault state and synced vault state
- What it is used for: encrypt and decrypt the canonical `vault snapshot`
- Protected by: wrapped access slots: per-device wrapped slots and one recovery-wrapped slot

#### device slot key

- Security relevance: key unwrapping of device access; device trust
- Where it lives: protected inside local `device access material` in `IndexedDB`, active in runtime memory during unlock
- What it is used for: unwrap this device's access slot for the `vault master key`
- Protected by: local keys protection key derived from the master password

#### device signing private key

- Security relevance: authentication, authorization, and signed update issuance
- Where it lives: protected inside local `device access material` in `IndexedDB`, active in `storage.session` while the vault is unlocked
- What it is used for: authenticate trusted-device operations and signed vault-related updates
- Protected by: local keys protection key derived from the master password while persisted; temporary unlocked-stage storage while active

#### local keys protection key

- Security relevance: confidentiality of locally stored device access material
- Where it lives: runtime memory during unlock
- What it is used for: locally protect and unlock the persisted local keys payload containing device slot key and device signing private key
- Protected by: derived as a dedicated subkey from the `master-password root key`

#### vault snapshot

- Security relevance: protected persisted vault state
- Where it lives: `IndexedDB`, `AWS S3`
- What it is used for: canonical persisted encrypted vault state
- Protected by: `vault master key`

#### unlocked vault

- Security relevance: plaintext working state during the unlocked vault stage
- Where it lives: `storage.session`
- What it is used for: local unlocked working state used for CRUD, search, copy, and autofill-related reads; currently includes vault id, device id, plaintext vault, `vault master key`, and device private signing key
- Protected by: temporary storage limited to the unlocked vault stage; removed on vault lock

#### local vault descriptor

- Security relevance: local non-secret vault selection metadata
- Where it lives: `IndexedDB`
- What it is used for: list vaults available on the current device before unlock using generated display names
- Protected by: local storage integrity checks where available; does not contain raw secrets

#### device access material

- Security relevance: local unlock material for one vault on one device
- Where it lives: `IndexedDB`
- What it is used for: derive local access from the master password, verify the stored vault snapshot with the device public signing key, and unwrap local keys
- Protected by: salts are non-secret metadata; local keys payload is wrapped with a master-password-derived local keys protection key

#### entry metadata

- Security relevance: protected application data; no direct cryptographic role
- Where it lives: inside `vault snapshot` and `unlocked vault`
- What it is used for: identify, organize, and search password entries
- Protected by: protection inherited from the enclosing vault structure

#### vault metadata

- Security relevance: security-relevant state; trust context; cryptographic context
- Where it lives: local persisted metadata / synced metadata
- What it is used for: identify vault state, versioning, device registry state, cloud object location, and cryptographic context
- Protected by: authenticated persisted/synced state and trusted-device update rules

#### clipboard password value

- Security relevance: temporary credential transfer outside protected storage
- Where it lives: clipboard
- What it is used for: temporary copy target for user credential use
- Protected by: no encryption in clipboard; extension can only clear the active clipboard value when it still matches the copied password

#### pending clipboard clear task

- Security relevance: runtime metadata used to clear a copied password later
- Where it lives: short-lived unlocked-session storage, for example MV3 `storage.session` with trusted-context access
- What it is used for: identify the scheduled clear action and copied clipboard value using action id, copied value hash, and expiry timestamp
- Protected by: does not store the password value; stored only in storage appropriate for sensitive runtime state; removed after clear, replacement copy, or vault lock

#### pending vault lock task

- Security relevance: runtime metadata used to distinguish current scheduled vault lock from stale alarm delivery
- Where it lives: short-lived extension runtime task storage
- What it is used for: identify the scheduled lock action using action id, vault id, and expiry timestamp
- Protected by: removed on vault lock, failed unlock rollback, or replacement unlock

#### cloud sync credentials

- Security relevance: authentication and authorization for the sync layer; cloud location binding
- Where it lives: encrypted inside the vault payload stored in `IndexedDB` and optionally in cloud sync storage
- What it is used for: authenticate to AWS S3 bucket and identify/access the correct cloud sync location
- Protected by: the Vault Key as part of normal vault encryption

#### cloud sync credential runtime access

- Security relevance: controls when sync credentials become usable
- Where it lives: unlocked vault runtime state during an active session
- What it is used for: provide provider configuration and credentials to the sync adapter
- Protected by: vault lock clears unlocked vault state; locked vault state has no usable sync credentials

#### enrollment secret

- Security relevance: protects the enrollment package while it is in the user transfer channel
- Where it lives: user transfer channel and transient new-device input
- What it is used for: decrypt the enrollment package once
- Protected by: high entropy, one-time use, transferred separately from the enrollment package

#### enrollment package

- Security relevance: trusted-device bootstrap metadata for adding a new device
- Where it lives: user transfer channel and transient runtime handling
- What it is used for: provide vault id, trusted public device keys, and a digest-bound source descriptor for the separate encrypted vault snapshot
- Protected by: encrypted with the enrollment secret; does not include full vault snapshot bytes, plaintext vault data, plaintext sync credentials, or device private keys

#### registered device signing public keys

- Security relevance: device trust and signature verification context
- Where it lives: local vault state / cloud vault metadata
- What it is used for: verify signed operations from trusted devices
- Protected by: authenticated vault metadata / trusted-device update rules
