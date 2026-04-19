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

#### recovery secret

- Security relevance: recovery of access to the vault
- Where it lives: user memory / user-kept backup
- What it is used for: recover access to the `vault master key` and re-establish local access
- Protected by: system-generated high-entropy secret; not stored by the system

#### vault master key

- Security relevance: vault confidentiality and integrity
- Where it lives: wrapped in local persisted vault state and synced vault state
- What it is used for: encrypt and decrypt the canonical `vault snapshot`
- Protected by: wrapped access slots: per-device wrapped slots and one recovery-wrapped slot

#### device agreement private key

- Security relevance: key unwrapping of device access; device trust
- Where it lives: `IndexedDB`
- What it is used for: unwrap this device's access slot for the `vault master key`
- Protected by: `device agreement protection key`

#### device signing private key

- Security relevance: authentication, authorization, and signed update issuance
- Where it lives: `IndexedDB`
- What it is used for: authenticate trusted-device operations and signed vault-related updates
- Protected by: `device signing protection key`

#### device agreement protection key

- Security relevance: confidentiality of locally stored device-agreement key material
- Where it lives: runtime memory during unlock
- What it is used for: locally protect the persisted `device agreement private key`
- Protected by: derived as a dedicated subkey from the `master-password root key`

#### device signing protection key

- Security relevance: confidentiality of locally stored device-signing key material
- Where it lives: runtime memory during unlock
- What it is used for: locally protect the persisted `device signing private key`
- Protected by: derived as a dedicated subkey from the `master-password root key`

#### temporary AWS credentials

- Security relevance: authenticated and authorized access to cloud sync resources
- Where it lives: runtime memory
- What it is used for: temporary authorized access to `AWS S3` through the sync layer
- Protected by: runtime memory only / not persisted

#### vault snapshot

- Security relevance: protected persisted vault state
- Where it lives: `IndexedDB`, `AWS S3`
- What it is used for: canonical persisted encrypted vault state
- Protected by: `vault master key`

#### unlocked vault

- Security relevance: plaintext working state during the unlocked vault stage
- Where it lives: `storage.session`
- What it is used for: local unlocked working state used for CRUD, search, copy, and autofill-related reads
- Protected by: temporary storage limited to the unlocked vault stage; removed on vault lock

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
- Protected by: no encryption in clipboard

#### cloud sync credentials

- Security relevance: authentication and authorization for the sync layer; cloud location binding
- Where it lives: `IndexedDB`
- What it is used for: authenticate to Cognito and identify/access the correct cloud sync location
- Protected by: `cloud sync credentials protection key`

#### cloud sync credentials protection key

- Security relevance: confidentiality of locally stored sync credentials
- Where it lives: runtime memory during unlock
- What it is used for: locally protect the persisted `cloud sync credentials`
- Protected by: derived as a dedicated subkey from the `master-password root key`

#### enrollment secret

- Security relevance: confidentiality and authentication of enrollment bootstrap
- Where it lives: user memory / user-kept transfer channel
- What it is used for: decrypt and authenticate the `enrollment package` during new-device enrollment
- Protected by: system-generated high-entropy secret; not stored by the system

#### enrollment package

- Security relevance: protected bootstrap data for new-device enrollment
- Where it lives: user transfer channel / new device input
- What it is used for: bootstrap new-device enrollment into an existing synced vault
- Protected by: authenticated encryption using the `enrollment secret`

#### registered device agreement public keys

- Security relevance: device trust and authorization context for key unwrapping
- Where it lives: local vault state / cloud vault metadata
- What it is used for: identify authorized device agreement keys for enrolled devices
- Protected by: authenticated vault metadata / trusted-device update rules

#### registered device signing public keys

- Security relevance: device trust and signature verification context
- Where it lives: local vault state / cloud vault metadata
- What it is used for: verify signed operations from trusted devices
- Protected by: authenticated vault metadata / trusted-device update rules
