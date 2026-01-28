# Password Organization Design

> **Status**: Design document
> **Date**: 2026-01-18
> **Related**: [architecture-comparison.md](../architecture/architecture-comparison.md)

---

## 1. Research Summary

### The "Over-Organization" Problem

Users often struggle with two competing hierarchies. When a user has a password for "Work Gmail", they hesitate:

- _Does it go in the "Work" Folder?_
- _Does it go in the "Email" Tag?_
- _Does it go in a "Work/Email" Subfolder?_

**Goal**: Remove this cognitive load by enforcing specific roles for Folders and Tags.

---

## 2. SPM Organization Model

### Core Philosophy: Place vs. Context

We separate concerns using strict **Visual Semantics**. We do not allow users to create "Folder structures inside Tags."

| Feature     | Role         | Question Answered          | Visual Identity        | Structure           |
| :---------- | :----------- | :------------------------- | :--------------------- | :------------------ |
| **Folders** | **Location** | "Where is this stored?"    | **Icons** (The Object) | Hierarchical (Tree) |
| **Tags**    | **Context**  | "What are its attributes?" | **Colors** (The Label) | Grouped Flat List   |

### Organization Diagram

```text
                    ┌─────────────────────────────────────────┐
                    │              User's Vault               │
                    └─────────────────────────────────────────┘
                                        │
           ┌────────────────────────────┼──────────────────────────────┐
           ▼                            ▼                              ▼
    [Icon] Folders               [Color] Tags                  Global Library
    (Mutually Exclusive)         (Multi-Select)                (Static-Seeded)
           │                            │                              │
    ┌──────┴──────┐              ┌──────┴──────┐               ┌───────┴───────┐
    │ 💼 Work     │              │ STATUS Grp  │               │ If user types │
    │ ├─ 📧 Email │              │  🔴 Expiring│               │ "API"...      │
    │ └─ 🔨 Dev   │              │  🟠 MFA     │               │               │
    │             │              │             │               │ Suggest from  │
    │ 🏠 Personal │              │ TOPIC Grp   │               │ Bundled JSON  │
    │ └─ 🛒 Shop  │              │  🔵 Finance │               │ Library       │
    └─────────────┘              │  🟣 Social  │               └───────────────┘
                                 └─────────────┘
```

**Constraints**

- **Folders**: Unlimited nesting depth (UI shows gentle warning beyond 2 levels)
- **Tags**: Flat list structure (groups are for UI display only)
- **Limits**: Soft limit of 50 active tags to prevent "tag fatigue"

---

## 3. Global Library (Static Reference)

The Global Library is a curated collection of predefined tags and folders bundled with the extension as a static JSON file at `src/assets/data/global-library.json`. On first launch, this file is used to seed the user's local IndexedDB.

**Important Note**: The Global Library is **static and bundled**, not dynamically updated from a server. While there is no central admin interface, updates to the library are delivered via extension updates that patch the local IndexedDB. Users can create custom tags/folders that are stored locally but are not fed back to any central repository.

### Global Folder Library (Example Excerpts)

_Note: The full Global Library will contain 100+ predefined folders. This is a partial example._

| ID   | Name           | Icon             | Parent Suggestion | Description             |
| ---- | -------------- | ---------------- | ----------------- | ----------------------- |
| f001 | Work           | `briefcase`      | `null` (Root)     | Professional accounts   |
| f002 | Personal       | `home`           | `null` (Root)     | Personal life accounts  |
| f003 | Finance        | `banknote`       | `null` (Root)     | Banking and financial   |
| f004 | Projects       | `folder-git-2`   | `any`             | Project-based grouping  |
| f005 | Infrastructure | `server`         | `any`             | Cloud/server resources  |
| f006 | Clients        | `users`          | `Work`            | Client-specific data    |
| f007 | Keys           | `key`            | `any`             | API keys and secrets    |
| f008 | Household      | `house`          | `null` (Root)     | Family/household items  |
| f009 | School         | `graduation-cap` | `Household`       | Education-related       |
| f010 | Medical        | `heart-pulse`    | `Household`       | Health and medical      |
| f011 | Entertainment  | `popcorn`        | `Personal`        | Media and entertainment |
| f012 | Email          | `mail`           | `any`             | Email accounts          |
| f013 | Dev            | `code-2`         | `Work`            | Development tools       |

**Parent Suggestion Values:**

- `null` = Recommended as root-level folder
- `"any"` = Can be used at any level (root or subfolder)
- `"SpecificFolderName"` = Recommended as subfolder of that specific folder

### Global Tag Group Library (Example)

Tag groups now define visual themes that individual tags inherit. Each group has a base icon and color that tags will use by default.

| ID          | Name        | Description                  | Icon           | BaseColor |
| ----------- | ----------- | ---------------------------- | -------------- | --------- |
| status      | Status      | System status indicators     | bell           | orange    |
| topic       | Topic       | Subject matter categories    | tag            | blue      |
| environment | Environment | Deployment environments      | layers         | purple    |
| access      | Access      | Access control levels        | shield-keyhole | green     |
| other       | Other       | Uncategorized or custom tags | hash           | gray      |

### Global Tag Library (Example Excerpts)

_Note: The full Global Library will contain 100+ predefined tags. This is a partial example._

| ID   | Name         | Color  | Shade | Group ID    | Description                    |
| ---- | ------------ | ------ | ----- | ----------- | ------------------------------ |
| t001 | Expiring     | red    | 500   | status      | Passwords nearing expiration   |
| t002 | MFA          | orange | 500   | status      | Two-factor enabled accounts    |
| t003 | Shared       | gray   | 500   | status      | Credentials shared with others |
| t004 | Dev          | blue   | 500   | topic       | Development-related            |
| t005 | Database     | blue   | 700   | topic       | Database credentials           |
| t006 | Finance      | yellow | 500   | topic       | Financial services             |
| t007 | Social       | pink   | 500   | topic       | Social media platforms         |
| t008 | Staging      | purple | 400   | environment | Staging/test environments      |
| t009 | Prod         | red    | 600   | environment | Production systems             |
| t010 | Kids         | green  | 400   | access      | Child-accessible accounts      |
| t011 | Parents      | green  | 700   | access      | Parent-only accounts           |
| t012 | Subscription | yellow | 600   | topic       | Recurring payments             |
| t013 | Documents    | gray   | 500   | topic       | Document storage               |

**Shade System:**

Tags use Tailwind-compatible shade values (300-700) within their color:

- **300** - Lightest (subtle, background-friendly)
- **400** - Light
- **500** - Default (standard intensity)
- **600** - Dark
- **700** - Darkest (high contrast)

This allows multiple tags in the same group to have visual distinction while maintaining the group's color theme. For example, in the `topic` group above, "Dev" uses `blue-500` while "Database" uses `blue-700` for a darker, more distinct appearance.

---

## 4. Onboarding: Archetypes (Templates)

Archetypes are **starting templates** that pre-fill a new vault with a sensible structure. They are **subsets** of the Global Library, not the source of truth. Users pick one during initial setup, but all suggestions later come from the Global Library.

**Important**: Templates are **flexible definitions**, not rigid references. When a user selects a template, they can modify folder names, parent relationships, and tag properties before creation. This allows for customization while maintaining the template's structure.

**Template Complexity Levels:**

- **Basic**: 3-5 folders, 3-5 tags — Minimal structure, easy to start
- **Intermediate**: 5-10 folders, 5-10 tags — Balanced structure for power users
- **Advanced**: 10+ folders, 10+ tags — Comprehensive organization system

### Available Archetypes

#### 1. The "Standard" (Balanced) — **Complexity: Basic**

Best for general users managing personal life and a standard day job.

**Default Folders:** `Work`, `Personal`, `Finance`

**Default Tags:** `Expiring`, `MFA`, `Shared`

#### 2. The "Developer" (Tech-Focused) — **Complexity: Intermediate**

Best for freelancers, engineers, and power users.

**Default Folders:** `Projects`, `Infrastructure`, `Clients`, `Keys`

**Default Tags:** `Dev`, `Database`, `Staging`, `Prod`

#### 3. The "Family" (Household) — **Complexity: Basic**

Best for shared vaults or managing household utilities.

**Default Folders:** `Household`, `School`, `Medical`, `Entertainment`

**Default Tags:** `Kids`, `Parents`, `Subscription`, `Documents`

**Note:** The templates above provide default values that can be customized during onboarding. They can be significantly expanded with more specialized folders and tags (e.g., "Healthcare", "Legal", "Travel", "Freelance") to create intermediate and advanced templates for specific use cases.

---

## 5. Tag & Folder Input UX

### The "Global Library" Suggestion Feature

The input components suggest from the **Global Library**, not from archetypes. This ensures consistency even if users didn't select a particular archetype.

**Scenario**: A user on the "Standard" plan is adding an API Key.

- User types "API" into the tag field.
- Local Check: Does "API" exist in their vault? → No.
- Library Check: Does "API" exist in the **Global Library** (local IndexedDB)? → Yes (defined as `Dev` tag in the `topic` group).
- UI Suggestion: "Create Dev tag?" (Auto-prefills: Color=blue [inherited from topic group's BaseColor], Icon=tag [from topic group], Group=Topic)

**Benefit**: Users maintain a consistent, high-quality taxonomy (correct colors/icons) without manually configuring every new tag. The visual theme (color + icon) comes from the group, making it immediately recognizable.

### Tag Input Component

- **Grouped Display**: Dropdown is divided by headers (Status, Topic, Environment) from Global Library definitions.
- **Visuals**: Tags appear as pills showing the group icon and tag name with the specific color: `[bell icon] Expiring` (in red).

### Folder Input Component

- **Visual Tree**: Shows icons from Global Library.
- **Inline Creation**: Allows creating a subfolder directly within the selector: `Work / [ New Folder ]`
- **UI Guidance**: When nesting exceeds 2 levels, show subtle warning: "Deep nesting may be harder to navigate on mobile"

---

## 6. Management Pages

### Tag Management

Organized by Groups to keep the list scannable.

```plaintext
┌─────────────────────────────────────────────────────────────────┐
│  Manage Tags                                         [+ New]    │
├─────────────────────────────────────────────────────────────────┤
│  [bell icon] STATUS (orange theme)                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 🔴 Expiring      [12 items]               [Edit] [Delete] │  │
│  │ 🟠 MFA           [45 items]               [Edit] [Delete] │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [tag icon] TOPIC (blue theme)                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 🔵 Dev           [8 items]                [Edit] [Delete] │  │
│  │ 🟣 Finance       [3 items]                [Edit] [Delete] │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Folder Management

Uses a file-explorer style view with Icons.

```plaintext
┌─────────────────────────────────────────────────────────────────┐
│  Manage Folders                                      [+ New]    │
├─────────────────────────────────────────────────────────────────┤
│  📁 💼 Work                                          [⋮]        │
│      └─ 📧 Email                                     [⋮]        │
│      └─ 🔨 Dev                                       [⋮]        │
│                                                                 │
│  📁 🏠 Personal                                      [⋮]        │
│      └─ 🛒 Shopping                                  [⋮]        │
│                                                                 │
│  📁 📂 Uncategorized (Default)                       [Locked]   │
└─────────────────────────────────────────────────────────────────┘
```

**Folder Actions:**
| Action | Behavior |
|--------|----------|
| Rename | Inline edit, ESC to cancel, Enter to save |
| Add subfolder | Allowed at any level (UI warns if depth > 2) |
| Move | Move to different parent or root level |
| Delete | Only if empty (must move passwords first) |

---

## 7. Type Definitions

### Folder Type

Added icon support. We will use a standard set (e.g., Lucide React) mapped by string names.

```typescript
// core/organization/folder.type.ts

export interface Folder {
  id: string;
  name: string;
  icon: string; // e.g. "briefcase", "home", "server"
  description?: string;
  parentId: string | null; // null = root level
  createdAt: number;
}
```

### Tag Group Type

Defines tag groups with visual themes that individual tags inherit.

```typescript
// core/organization/tag-group.type.ts

export interface TagGroup {
  id: string; // e.g., "status", "topic"
  name: string; // e.g., "Status", "Topic"
  icon: string; // Base icon for the group (e.g., "bell", "tag")
  baseColor: TagColor; // Theme color for all tags in this group
  description?: string;
}
```

### Tag Type

Inherits visual properties from its group but can override color if needed.

```typescript
// core/organization/tag.type.ts

export type TagColor =
  | "gray"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink";

/** Tailwind-compatible shade values */
export type TagShade = 300 | 400 | 500 | 600 | 700;

export interface Tag {
  id: string;
  name: string;
  groupId: string; // References TagGroup.id
  color: TagColor; // Inherited from group's baseColor or overridden
  shade: TagShade; // User-selected shade (default: 500)
  createdAt: number;
}
```

### Global Library Type

Defines the master collection used for suggestions.

```typescript
// core/organization/global-library.type.ts

export interface GlobalFolderDefinition {
  id: string;
  name: string;
  icon: string;
  description?: string;
  parent: string | null; // null = root suggested, "any" = flexible, or specific parent name
}

export interface GlobalTagGroupDefinition {
  id: string;
  name: string;
  icon: string; // Added for group theme
  baseColor: TagColor; // Added for color inheritance
  description?: string;
}

export interface GlobalTagDefinition {
  id: string;
  name: string;
  color: TagColor;
  shade: TagShade; // Shade within the color (default: 500)
  groupId: string; // References GlobalTagGroupDefinition.id
  description?: string;
}

export interface GlobalLibrary {
  folders: GlobalFolderDefinition[];
  tagGroups: GlobalTagGroupDefinition[];
  tags: GlobalTagDefinition[];
}
```

### Template (Archetype) Type

References Global Library items by ID; does not define new ones.

```typescript
// core/organization/templates.type.ts

export interface OrganizationTemplate {
  id: string; // "archetype_dev_v1"
  label: string; // "Developer Pack"
  complexity: "basic" | "intermediate" | "advanced";
  folderIds: string[]; // References GlobalLibrary.folders[].id
  tagIds: string[]; // References GlobalLibrary.tags[].id
}
```

---

## 8. Migration Strategy

For users importing from existing tools, we map their chaos into our structure.

| Source    | Strategy                                                                                                                               |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| Bitwarden | "Folders" become Folders. Preserve original depth (no forced flattening).                                                              |
| Tags      | If source supports tags, map directly. If tag color is unknown, default to gray and group Other.                                       |
| CSV       | Analyze "Group/Folder" column. If it matches a Known Archetype keyword (e.g., "AWS"), auto-assign correct Icon/Tag Color from Library. |

---

## 9. Implementation Priority

1. **Phase 1**: Core Types (Folder with Icon, Tag with Color/Group).
2. **Phase 2**: JSON-to-IndexedDB Seeding Logic (The "Static Database").
3. **Phase 3**: Onboarding Flow (User selects Archetype from seeded data).
4. **Phase 4**: Smart Input Components (Auto-suggest from local IndexedDB).
5. **Phase 5**: Cloud Sync Logic (S3/GCS/Azure bucket integration).
6. **Phase 6**: **Template Import/Export Foundation** — Prepare system infrastructure for future community templates:
   - Add JSON schema validation for external templates
   - Create import/export utilities for user vault structures
   - Design database schema to store custom template metadata
   - **Note**: Full community template sharing UI will be implemented in a future release
