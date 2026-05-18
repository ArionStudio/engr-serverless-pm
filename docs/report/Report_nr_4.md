# Problems

## 1. Vault Access Recovery With Sync Enabled

### Problem

`vault access recovery` allows the user to recover access to the `vault master key` when the user has lost the master password.

The problem is that the master password protects local device access material, not only the `device slot key` but also the `device private signing key`. Those two are needed to use the vault as a trusted device.

So after losing the master password, the recovery key can recover the `vault master key`, but it does not recover the current device as a trusted signing device. Because of that, recovery cannot safely create normal synced vault updates.

### Proposed Solution

Rework recovery as recovery-authorized device enrollment.

In this model, the recovery key is used to recover the `vault master key`, and then the current device is added again as a trusted device with fresh local device access material.

The important flaw is that recovery is not only recovery. It is also an enrollment/trust update operation.
