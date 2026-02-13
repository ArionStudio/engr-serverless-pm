/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Compile-time tests for branded CryptoKey types.
 *
 * These tests use @ts-expect-error to verify that branded types prevent
 * key confusion at compile time. If any @ts-expect-error comment does NOT
 * produce a TS error, tsc will fail — proving the brand is working.
 *
 * Run with: pnpm --filter serverless-pm-extension run type-check
 */

import type {
  MasterKEK,
  VaultKey,
  SlotKEK,
  DeviceSigningPrivateKey,
  DeviceSigningPublicKey,
  DeviceAgreementPrivateKey,
  DeviceAgreementPublicKey,
} from "./crypto-keys.type";
import {
  asMasterKEK,
  asVaultKey,
  asSlotKEK,
  asSigningPrivateKey,
  asSigningPublicKey,
  asAgreementPrivateKey,
  asAgreementPublicKey,
} from "./crypto-keys.type";

// === Symmetric key brand isolation ===

function _acceptMasterKEK(_key: MasterKEK): void {}
function _acceptVaultKey(_key: VaultKey): void {}
function _acceptSlotKEK(_key: SlotKEK): void {}

declare const masterKEK: MasterKEK;
declare const vaultKey: VaultKey;
declare const slotKEK: SlotKEK;
declare const plainKey: CryptoKey;

// VaultKey is not assignable to MasterKEK
// @ts-expect-error — branded types prevent key confusion
_acceptMasterKEK(vaultKey);

// MasterKEK is not assignable to VaultKey
// @ts-expect-error — branded types prevent key confusion
_acceptVaultKey(masterKEK);

// SlotKEK is not assignable to MasterKEK
// @ts-expect-error — branded types prevent key confusion
_acceptMasterKEK(slotKEK);

// SlotKEK is not assignable to VaultKey
// @ts-expect-error — branded types prevent key confusion
_acceptVaultKey(slotKEK);

// Plain CryptoKey is not assignable to branded types
// @ts-expect-error — plain CryptoKey lacks brand
_acceptMasterKEK(plainKey);

// @ts-expect-error — plain CryptoKey lacks brand
_acceptVaultKey(plainKey);

// @ts-expect-error — plain CryptoKey lacks brand
_acceptSlotKEK(plainKey);

// === Asymmetric key brand isolation ===

function _acceptSigningPrivate(_key: DeviceSigningPrivateKey): void {}
function _acceptSigningPublic(_key: DeviceSigningPublicKey): void {}
function _acceptAgreementPrivate(_key: DeviceAgreementPrivateKey): void {}
function _acceptAgreementPublic(_key: DeviceAgreementPublicKey): void {}

declare const sigPriv: DeviceSigningPrivateKey;
declare const sigPub: DeviceSigningPublicKey;
declare const agrPriv: DeviceAgreementPrivateKey;
declare const agrPub: DeviceAgreementPublicKey;

// Signing private is not assignable to agreement private
// @ts-expect-error — different key roles
_acceptAgreementPrivate(sigPriv);

// Agreement public is not assignable to signing public
// @ts-expect-error — different key roles
_acceptSigningPublic(agrPub);

// Plain CryptoKey is not assignable to asymmetric branded types
// @ts-expect-error — plain CryptoKey lacks brand
_acceptSigningPrivate(plainKey);

// @ts-expect-error — plain CryptoKey lacks brand
_acceptAgreementPublic(plainKey);

// === Factory functions return correct branded types ===

declare const anyKey: CryptoKey;

const _m: MasterKEK = asMasterKEK(anyKey);
const _v: VaultKey = asVaultKey(anyKey);
const _s: SlotKEK = asSlotKEK(anyKey);
const _sp: DeviceSigningPrivateKey = asSigningPrivateKey(anyKey);
const _spu: DeviceSigningPublicKey = asSigningPublicKey(anyKey);
const _ap: DeviceAgreementPrivateKey = asAgreementPrivateKey(anyKey);
const _apu: DeviceAgreementPublicKey = asAgreementPublicKey(anyKey);
