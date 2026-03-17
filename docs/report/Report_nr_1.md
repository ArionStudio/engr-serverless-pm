# Report nr 1

---

IMPORTANT: I generated many things in the `docs/` folder with AI to help me clearly describe my ideas and thoughts, because I am a kind of chaotic person. This report was written by me, and only the grammar was improved using AI because I want it to be understandable.

## 1. Technology chosen for the project

## 1.1 Frontend

It is a web browser extension, so the best choice for the project is TypeScript.
For it I chose Vite as a bundler because it's lightweight and fast, and I used it in previous projects.
It is also easy to configure for developing browser add-ons.

## 1.2 Design

For the frontend, on top of it I chose React, TailwindCSS, and Shadcn as a components library.
As for React, I chose it because I work with it daily. I think it fits the project well enough and, if used correctly, should not provide risk points for our architecture.
I want the project to be usable and to look good. Building a good-looking project is a hard task, and I think that it's not the best way to start a project.
So I chose Shadcn as a base for that exact reason. It's a well-maintained library that allows us to build a good-looking project without wasting time on designing it.
As for design per se, I will try to keep it similar to other products on the market, like Bitwarden.

More detailed architecture and design decisions are described in:

- [Security specification](../security/security-specification.md)
- [Architecture diagrams](../architecture/)

## 1.3 Storage

For storage, we will distinguish 3 points where data will live.

1. RAM - this is the only place where data will be decrypted and accessible by the user directly, only after login and for the short time that the user unlocked the vault.
2. IndexedDB - here we will store locally encrypted vaults that will allow offline access to the data.
   For the API layer, I will use Dexie.js, which allows us to easily use IndexedDB, which is a little legacy as a browser API.
3. Cloud - here we will also store encrypted vaults that will allow us to sync and preserve data between devices.
   For cloud, I will use AWS S3 as the default provider.

## 2. Architecture

The next part is our architecture design. Our password manager is a local-first application that doesn't need any connection to the internet to work.
The only part that requires it is the synchronization layer that will allow us to move our data between devices.

This project is generally simple, but it needs to be secure. I know that all the logic there will stack, and without proper structure it will create a mess.
The most important parts also need to be easy to test and review. That leads us to the need for separation of concerns.
For it I chose Hexagonal Architecture, which gives us the option to separate frontend and security logic in our app.

Its implementation requires us to do some boilerplate code, but it also gives us a clean and extendable structure.
The next thing is that I want it to be extendable. Hexagonal architecture uses ports and adapters that will allow us to easily implement new variants for a new sync provider or different crypto algorithms.

Project architecture is described in:

- [Architecture overview and diagrams](../architecture/)
- [Key hierarchy diagram](../architecture/01-key-hierarchy.puml)
- [Key derivation flow](../architecture/flow/01-key-derivation-master-kek.flow.puml)

## 3. Data security approach

I chose a specific approach for data security. Because of the local-first approach, I decided that we will use the device as the entry point for data safety.
On vault creation, besides the master password, we will generate device keys that will be used in the device slots mechanism.

The master password is needed to store device keys securely wrapped in our local memory. That makes access to our passwords possible only from our device, theoretically.

As I mentioned before, we will use the device slots mechanism. It is needed to implement our sync layer. Our vault payload, which will be saved and sent to the cloud, will contain a list of device slots with encrypted vault keys. The drawback is that every device will weaken our security.

Our sync layer will also require an additional key that allows us to access data from other devices when we want to add them.
It will be a secret key that will be generated on vault creation and passed to the user with information on how to store it safely and how to use it.
It is also needed if we lose access to our device or when something goes wrong and we still have access to our encrypted vault.

Another layer of security that will help us know if someone was trying to tamper with our data is signing our vault.

We generally think of the cloud as an unsafe place for storage, so all data there will be encrypted.
But depending on our provider, access is also guarded somehow, and it depends on the configuration of our service that we will do when creating it.
I will provide a CloudFormation template that will allow us to create a relatively safe S3 bucket that will guard our data online.

From this, we can distinguish different keys that will be used for encryption and signing.

1. Master KEK - will be used to encrypt locally stored device keys
2. Vault key - the main key that will be used to encrypt our vault data
3. Device slot key - used to wrap our vault key and make data accessible from a trusted device
4. Secret key - our backup key / add new device key - we use it differently from the master key to distinguish it because theoretically this one should be guarded better and used less often.
5. Device signing keys - used to sign our vault data

For every key, we will need to choose a valid cryptographic algorithm that is available in the WebCrypto API.

1. Master KEK - PBKDF2 with HMAC-SHA-256, 600 000 iterations and random 32-byte salt.
2. Vault key - AES-256-GCM with fresh random 12-byte IV for each encryption operation.
3. Device slot mechanism - ECDH P-256 with Concat KDF (or HKDF) to derive 256-bit wrapping key, then AES-256-GCM key wrap mechanism (A256GCMKW).
4. Secret key slot - random 256-bit symmetric key with AES-256-GCM key wrap mechanism (A256GCMKW).
5. Device signing keys - Ed25519.

In my current implementation, I named this `suite-v1` for future reference and designed it to be exchangeable only as a whole validated bundle, not as separate freely mixed algorithms. At this stage it is only partly implemented.

More details for this part are described in:

- [Security specification](../security/security-specification.md)
- [Roadmap and implementation state](../../ROADMAP.md)

## 4. Current implementation status

At the current stage of the project, I already implemented the main technical foundation of the system:

- core domain types and ports
- architecture and security documentation
- WebCrypto adapter for PBKDF2, AES-256-GCM, hashing and key wrapping
- device key adapter for Ed25519 and ECDH key generation, sign/verify and local key wrapping
- IndexedDB storage adapter with Dexie
- automated tests for crypto and storage layers

At the same time, the project is still incomplete. The most important missing parts are:

- full master password runtime flow
- final ECDH shared-secret KDF for device slots
- signed snapshot pipeline end-to-end
- sync adapter
- password CRUD connected to encrypted vault lifecycle
