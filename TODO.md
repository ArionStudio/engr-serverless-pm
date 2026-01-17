# TODO

## Status Legend

- [ ] Not started
- [x] Completed
- [~] Partial/Placeholder only

---

## Documentation

- [ ] Make instruction how to add extension build to Chrome
- [ ] Add README.md with project overview and quick start guide
- [ ] Document the adapter architecture and how to implement new providers
- [x] AWS S3+Cognito setup documentation (docs/aws/s3-cognito/README.md)

---

## UI / Components

- [ ] Switch from Radix UI to Base UI (MUI's headless library)
  - shadcn/ui now supports Base UI (Dec 2025)
  - Benefits: modern API, consolidated dependencies, built-in features (multi-select, combobox, autocomplete)
  - Use `shadcn create` or migrate existing components
  - See: https://ui.shadcn.com/create and https://basecn.dev/
- [~] Primitive components (only Button implemented, currently using Radix)
- [ ] Add more UI components (input, dialog, dropdown, form, etc.)
- [ ] Implement proper theming/dark mode support

---

## Core Functionality (from Research.tex section "Bezpieczeństwo danych")

### Crypto Adapter (`src/adapters/crypto/`) - Currently empty placeholder

- [ ] Implement Web Crypto API integration (as specified in Research.tex)
- [ ] Master password derivation (PBKDF2/Argon2)
- [ ] AES-256 encryption for password data
- [ ] Secure key storage

### Auth Adapter (`src/adapters/auth/`) - Currently empty placeholder

- [ ] AWS Cognito integration
- [ ] Session management
- [ ] Temporary credentials handling

### Storage Adapter (`src/adapters/storage/`) - Currently empty placeholders

- [ ] Implement storage factory pattern
- [ ] Implement access strategy
- [ ] AWS S3 provider (primary - as chosen in Research.tex)
- [ ] Google Cloud Storage provider (optional)
- [ ] Azure Blob Storage provider (optional)
- [ ] Open source options (MinIO, Storj) - mentioned in Research.tex

### Core Module (`src/core/`) - Currently empty placeholder

- [ ] Password entry data model
- [ ] CRUD operations logic
- [ ] Sync logic between local and cloud

---

## Extension Features (from Research.tex "Funkcjonalności")

### Password Management

- [~] View passwords (UI exists with mock data only)
- [~] Search passwords (UI exists, not connected to real data)
- [ ] Add passwords
- [ ] Edit passwords
- [ ] Delete passwords
- [ ] Password generator

### Import/Export

- [ ] Import passwords from CSV
- [ ] Export passwords to CSV (with provider selection and password protection)

### Sync & Storage

- [ ] Automatic password synchronization (requires internet + enabled in settings)
- [ ] IndexedDB local caching (as specified in Research.tex)
- [ ] Cloud provider configuration UI in options page

### Security Features

- [ ] Master password setup/unlock flow
- [ ] Multi-factor authentication (TOTP/HOTP) - mentioned in Research.tex
- [ ] QR code transfer for repository portability - mentioned in Research.tex

### Browser Integration

- [ ] Autofill functionality (content scripts)
- [ ] Auto-detect login forms

---

## Infrastructure

- [x] AWS CloudFormation template (providers/aws/s3-cognito.template.yaml)
  - S3 bucket with encryption
  - Cognito Identity Pool
  - IAM Role with S3 permissions
- [ ] Test AWS CloudFormation template deployment
- [ ] Add CI/CD pipeline (GitHub Actions)
- [ ] Add automated testing for adapters

---

## Testing

- [x] Basic test setup (Vitest configured)
- [~] Background service worker test (basic test exists)
- [ ] Unit tests for crypto adapter
- [ ] Unit tests for storage adapters
- [ ] Unit tests for auth adapter
- [ ] Integration tests for extension workflows
- [ ] E2E tests for critical user flows

---

## Future Platforms (from Research.tex - lower priority)

- [x] Web Extension (Chrome) - primary target, in progress
- [ ] Desktop application
- [ ] Android application
- [ ] iOS application

---

## Notes from Research.tex

### Security Model (3 access points)

1. **Web Extension Interface** - Main user access, protected by master password
2. **IndexedDB** - Local encrypted storage
3. **Cloud Storage** - Remote encrypted storage with access keys

### Design Principles

- Simplicity (Prostota)
- Security (Bezpieczeństwo)
- Portability (Przenośność)

### Similar Projects Referenced

- Mopass: https://phodal.github.io/mopass/
- AWS KMS + DynamoDB approach (rejected due to extra Lambda layer)

---

## Future Features

### Safety Report Generator

- User-initiated vault security analysis
- Reports: weak passwords, reused passwords, old passwords, breached (HaveIBeenPwned API)
- Generates actionable recommendations
- Priority: After core features complete
