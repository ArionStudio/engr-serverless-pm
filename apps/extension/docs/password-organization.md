# Password Organization Design

> **Status**: Design document
> **Date**: 2026-01-17
> **Related**: [architecture-comparison.md](./architecture-comparison.md)

---

## 1. Research Summary

### How Major Password Managers Handle Organization

| Manager       | Folders          | Tags                           | Nesting                  | Notes                                    |
| ------------- | ---------------- | ------------------------------ | ------------------------ | ---------------------------------------- |
| **Bitwarden** | Yes              | No (Collections for orgs only) | Unlimited via "/" naming | Users complain about lack of real tags   |
| **1Password** | Yes (Vaults)     | Yes                            | Single level vaults      | Tags within vaults, powerful but complex |
| **LastPass**  | Yes              | No                             | Unlimited                | Similar to Bitwarden approach            |
| **KeePass**   | Yes (Groups)     | Yes                            | Unlimited groups         | Most flexible, can be overwhelming       |
| **Dashlane**  | Yes (Categories) | No                             | Predefined categories    | Limited customization                    |

### Community Feedback Analysis

**What users consistently request:**

- Tags for cross-cutting organization (e.g., "work", "personal", "shared")
- Folders for hierarchical grouping (e.g., "Finance/Banking", "Finance/Crypto")
- Search across both organizational methods

**Common complaints to avoid:**

1. **Bitwarden "/" naming convention** - Users dislike creating folder hierarchy through naming (e.g., "Work/Email/Gmail")
2. **Unlimited nesting** - Leads to over-organization, hard to navigate on mobile
3. **Mutually exclusive organization** - Can't have same password in multiple "places"

---

## 2. SPM Organization Model

### Design Decisions

| Decision         | Choice                       | Rationale                                      |
| ---------------- | ---------------------------- | ---------------------------------------------- |
| Folders          | Yes, max 2 levels            | Prevents over-nesting, covers 95% of use cases |
| Tags             | Yes, unlimited               | Cross-cutting concerns, multiple tags per item |
| Default folder   | "Uncategorized"              | Every password has a home                      |
| Folder hierarchy | Explicit parent reference    | No "/" naming hacks                            |
| Tag colors       | Optional, predefined palette | Visual distinction without UI complexity       |

### Organization Diagram

```
                    ┌─────────────────────────────────────────┐
                    │              User's Vault               │
                    └─────────────────────────────────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
       ┌──────┴──────┐          ┌───────┴───────┐          ┌──────┴──────┐
       │   Work      │          │   Personal    │          │ Uncategorized│
       │  (Folder)   │          │   (Folder)    │          │  (Default)   │
       └──────┬──────┘          └───────┬───────┘          └─────────────┘
              │                         │
    ┌─────────┼─────────┐               │
    │         │         │               │
┌───┴───┐ ┌───┴───┐ ┌───┴───┐   ┌───────┴───────┐
│ Email │ │  Dev  │ │ Admin │   │    Banking    │
│(Sub)  │ │(Sub)  │ │(Sub)  │   │   (Subfolder) │
└───────┘ └───────┘ └───────┘   └───────────────┘

Tags (cross-cutting):
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│  MFA    │ │ Shared  │ │ Expiring│ │  API    │
│(orange) │ │ (blue)  │ │  (red)  │ │(purple) │
└─────────┘ └─────────┘ └─────────┘ └─────────┘

A password can:
- Be in exactly ONE folder (or subfolder)
- Have MULTIPLE tags
- Be searched by folder path, tags, or content
```

### Predefined Lists

Users aren't auto-assigned tags/folders, but we provide **suggested defaults** to reduce friction.

**Predefined Tags** (user can create custom):
| Tag | Color | Use Case |
|-----|-------|----------|
| Work | blue | Work-related accounts |
| Personal | green | Personal accounts |
| Finance | yellow | Banking, crypto, payments |
| Social | purple | Social media |
| Shopping | orange | E-commerce |
| MFA | red | Accounts with 2FA enabled |
| Shared | gray | Credentials shared with others |

**Predefined Folders**:
| Folder | Subfolders (suggested) |
|--------|------------------------|
| Work | Email, Dev, Admin |
| Personal | Social, Shopping |
| Finance | Banking, Crypto, Investments |

---

## 3. Password Creation Flow

### Entry Points

Password creation can happen through multiple paths:

```
┌─────────────────────────────────────────────────────────────────┐
│                   PASSWORD CREATION ENTRY POINTS                │
└─────────────────────────────────────────────────────────────────┘

1. Manual (from UI)
   └─► Empty form → User fills all fields → Add tags/folder → Save

2. Browser Capture (on form submit)
   └─► Auto-detect: URL, email/username, password
   └─► Extract: page keywords, site title (for suggestions)
   └─► Pre-fill form → User reviews/edits → Add tags/folder → Save

3. Import (CSV/other manager)
   └─► Batch processing → Mapping step → Review → Save all
```

### Creation Form Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Add Password                                              [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Title        [GitHub - john.doe@company.com_____________]      │
│               (auto-generated from URL + username)              │
│                                                                 │
│  URL          [https://github.com_________________________]     │
│                                                                 │
│  Username     [john.doe@company.com______________________]      │
│                                                                 │
│  Password     [••••••••••••••••••] [Generate] [Show]            │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Folder       [See Section 4 - Folder Input UX]                 │
│                                                                 │
│  Tags         [See Section 4 - Tag Input UX]                    │
│                                                                 │
│  Notes        [Optional notes...________________________]       │
│               [________________________________________]        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                              [Cancel]  [Save Password]          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Tag & Folder Input UX

> **Design Research Needed**: Research tag/folder input patterns from professional design systems.
> Look into: Theo Browne's design reviews, Linear's tag system, Notion's property selectors,
> GitHub's label picker. Document findings before final implementation.

### Tag Input Component

**Behavior:**

1. Input field with placeholder "Add tags..."
2. As user types, filtered list of existing tags appears below
3. User can select from list OR create new tag (if no match)
4. Selected tags appear as chips ABOVE the input
5. Chips have X button to remove

```
┌─────────────────────────────────────────────────────────────────┐
│  Tags                                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐                  │    │
│  │ │ Work  ✕  │ │  MFA  ✕  │ │  Dev  ✕  │   <- Selected   │    │
│  │ └──────────┘ └──────────┘ └──────────┘                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ fin...                                        <- Input  │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ● Finance (yellow)                         <- Matches   │    │
│  │ ─────────────────────────────────────────────────────── │    │
│  │ + Create "fin" tag                         <- New       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Key UX Decisions:**

- Show predefined tags first when input is empty (encourage use)
- Fuzzy search matching (not just prefix)
- Keyboard navigation (arrow keys, enter to select)
- Tab to accept top suggestion

### Folder Input Component

**Behavior:**

1. Similar to tag input but for folder selection
2. Shows folder hierarchy visually
3. When entering text in a folder, creates **subfolder** (not multiple folders)
4. Max 2 levels enforced in UI (disable nesting beyond)

```
┌─────────────────────────────────────────────────────────────────┐
│  Folder                                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Work / Dev                              <- Current path │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Search or create folder...                              │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 📁 Work                                                 │    │
│  │    ├─ 📁 Email                                          │    │
│  │    ├─ 📁 Dev                            ← (selected)    │    │
│  │    └─ 📁 Admin                                          │    │
│  │ 📁 Personal                                             │    │
│  │    ├─ 📁 Social                                         │    │
│  │    └─ 📁 Shopping                                       │    │
│  │ 📁 Finance                                              │    │
│  │ ─────────────────────────────────────────────────────── │    │
│  │ + Create new folder                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Creating Subfolder Flow:**

```
1. User selects "Work" folder
2. User types "Backend" in search
3. Options appear:
   - "Create 'Backend' in Work" (creates Work/Backend)
   - "Create 'Backend' at root level"
4. User picks, folder created inline
```

**Key UX Decisions:**

- Single selection (not multi like tags)
- Visual tree hierarchy
- Quick create without leaving form
- "Uncategorized" always available as fallback

---

## 5. Management Pages

### Tag Management Page

Dedicated page for viewing and managing all tags.

```
┌─────────────────────────────────────────────────────────────────┐
│  Manage Tags                                         [+ New]    │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Search tags...                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Tag           │ Color   │ Used By │ Actions              │   │
│  ├───────────────┼─────────┼─────────┼──────────────────────┤   │
│  │ ● Work        │ blue    │ 15      │ [Edit] [Delete]      │   │
│  │ ● MFA         │ red     │ 12      │ [Edit] [Delete]      │   │
│  │ ● Finance     │ yellow  │ 8       │ [Edit] [Delete]      │   │
│  │ ● Personal    │ green   │ 7       │ [Edit] [Delete]      │   │
│  │ ○ Shared      │ gray    │ 0       │ [Edit] [Delete]      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ● = In use (assigned to passwords)                             │
│  ○ = Unused (safe to delete)                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Delete Confirmation (when in use):**

```
┌─────────────────────────────────────────────────────────────────┐
│  Delete "Work" tag?                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ⚠️  This tag is assigned to 15 passwords.                      │
│                                                                 │
│  Deleting will remove the tag from all passwords.               │
│  The passwords themselves will NOT be deleted.                  │
│                                                                 │
│                              [Cancel]  [Delete Tag]             │
└─────────────────────────────────────────────────────────────────┘
```

### Folder Management Page

> **Design Research Needed**: Take inspiration from professional file management UIs
> (VS Code explorer, Finder, Linear projects, Notion workspace). Focus on drag-and-drop
> reordering, inline rename, and clear visual hierarchy.

```
┌─────────────────────────────────────────────────────────────────┐
│  Manage Folders                                      [+ New]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 📁 Work (15)                              [⋮]            │   │
│  │    ├─ 📁 Email (5)                        [⋮]            │   │
│  │    ├─ 📁 Dev (7)                          [⋮]            │   │
│  │    └─ 📁 Admin (3)                        [⋮]            │   │
│  │                                                          │   │
│  │ 📁 Personal (12)                          [⋮]            │   │
│  │    ├─ 📁 Social (4)                       [⋮]            │   │
│  │    └─ 📁 Shopping (8)                     [⋮]            │   │
│  │                                                          │   │
│  │ 📁 Finance (8)                            [⋮]            │   │
│  │    ├─ 📁 Banking (5)                      [⋮]            │   │
│  │    └─ 📁 Crypto (3)                       [⋮]            │   │
│  │                                                          │   │
│  │ 📁 Uncategorized (7)                      [locked]       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [⋮] menu: Rename, Add subfolder, Move, Delete                  │
│  Drag & drop to reorder (within same level)                     │
│  "Uncategorized" cannot be renamed or deleted                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Folder Actions:**
| Action | Behavior |
|--------|----------|
| Rename | Inline edit, ESC to cancel, Enter to save |
| Add subfolder | Only if parent is root level (max 2 levels) |
| Move | Move to different parent or root level |
| Delete | Only if empty (must move passwords first) |

**Delete Blocked (contains passwords):**

```
┌─────────────────────────────────────────────────────────────────┐
│  Cannot Delete "Work"                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  This folder contains 15 passwords.                             │
│                                                                 │
│  Move or delete the passwords first, then try again.            │
│                                                                 │
│  [View Passwords in "Work"]              [OK]                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Type Definitions

### Folder Type

```typescript
// core/passwords/folder.type.ts

export interface Folder {
  id: string;
  name: string;
  parentId: string | null; // null = root level folder
  createdAt: number;
  updatedAt: number;
}

// Constraints enforced at application level:
// - Max depth: 2 (folder -> subfolder)
// - Names unique within same parent
// - Cannot delete folder with passwords (must move first)
```

### Tag Type

```typescript
// core/passwords/tag.type.ts

export type TagColor =
  | "gray"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple";

export interface Tag {
  id: string;
  name: string;
  color: TagColor;
  createdAt: number;
}

// Constraints:
// - Tag names unique (case-insensitive)
// - Deleting tag removes it from all passwords (no orphan references)
```

### Password Metadata Type

```typescript
// core/passwords/password.type.ts

export interface PasswordMetadata {
  id: string;
  title: string;
  url: string | null;
  username: string;
  folderId: string; // References Folder.id, defaults to "uncategorized"
  tagIds: string[]; // References Tag.id[], can be empty
  notes: string | null; // Encrypted with Layer 2 (vault key)
  createdAt: number;
  updatedAt: number;
  // Password value NOT here - stored separately, encrypted with Layer 1
}

export interface PasswordEntry extends PasswordMetadata {
  password: string; // Only populated when explicitly decrypted (Layer 1)
}
```

---

## 7. UI Considerations

### Sidebar Navigation

```
┌────────────────────────┐
│ All Passwords (42)     │  <- Shows all, default view
├────────────────────────┤
│ Folders                │
│  ├─ Work (15)          │
│  │   ├─ Email (5)      │
│  │   ├─ Dev (7)        │
│  │   └─ Admin (3)      │
│  ├─ Personal (20)      │
│  │   └─ Banking (8)    │
│  └─ Uncategorized (7)  │
├────────────────────────┤
│ Tags                   │
│  ├─ MFA (12)           │
│  ├─ Shared (5)         │
│  ├─ Expiring (3)       │
│  └─ API (8)            │
└────────────────────────┘
```

### Search Behavior

- Searches across: title, URL, username, notes, folder name, tag names
- Filter chips: `folder:Work` `tag:MFA` `has:notes`
- Results show breadcrumb: `Work / Email > Gmail Account`

---

## 8. Migration Path

For users importing from other password managers:

| Source    | Folder Mapping                           | Tag Mapping          |
| --------- | ---------------------------------------- | -------------------- |
| Bitwarden | "/" paths → real folders (max 2 levels)  | N/A                  |
| 1Password | Vaults → folders, tags preserved         | Direct mapping       |
| LastPass  | Folders preserved                        | N/A                  |
| KeePass   | Groups → folders (flatten if > 2 levels) | Tags preserved       |
| CSV       | Optional "folder" and "tags" columns     | Comma-separated tags |

---

## 9. Implementation Priority

1. **Phase 1**: Flat list (current) - works without organization
2. **Phase 2**: Folders (single level) - most requested feature
3. **Phase 3**: Tags - cross-cutting organization
4. **Phase 4**: Subfolders (2 levels) - power user feature
5. **Phase 5**: Import with organization mapping
