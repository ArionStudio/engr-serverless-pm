// Catalog IDs match docs/ui-ux/component-specification.md.
export const catalog = [
  { id: "S01", name: "PopupView" },
  { id: "S02", name: "OptionsView" },
  { id: "S03", name: "SyncPage" },
  { id: "S04", name: "S3SetupGuide" },
  { id: "S05", name: "OrganizationManagementView" },
  {
    id: "B01",
    name: "Button",
  },
  {
    id: "B02",
    name: "Field",
  },
  {
    id: "B03",
    name: "Input",
  },
  {
    id: "B04",
    name: "Input Group",
  },
  {
    id: "B05",
    name: "Textarea",
  },
  {
    id: "B06",
    name: "Native Select",
  },
  {
    id: "B07",
    name: "Checkbox",
  },
  {
    id: "B08",
    name: "Radio Group",
  },
  {
    id: "B09",
    name: "Slider",
  },
  {
    id: "B10",
    name: "Alert",
  },
  {
    id: "B11",
    name: "Badge",
  },
  {
    id: "B12",
    name: "Spinner",
  },
  {
    id: "B13",
    name: "Skeleton",
  },
  {
    id: "B14",
    name: "Accordion",
  },
  {
    id: "B15",
    name: "Tooltip",
  },
  {
    id: "B16",
    name: "Dropdown Menu",
  },
  {
    id: "B17",
    name: "Alert Dialog",
  },
  {
    id: "B18",
    name: "Separator",
  },
  {
    id: "B19",
    name: "Dialog",
  },
  {
    id: "B20",
    name: "Tabs",
  },
  { id: "B21", name: "Empty" },
  { id: "B22", name: "Item" },
  { id: "B23", name: "Card" },
  { id: "B24", name: "Combobox" },
  { id: "B25", name: "Button Group" },
  { id: "B26", name: "Attachment" },
  { id: "B27", name: "Sidebar" },
  { id: "B28", name: "Sheet" },
  { id: "B29", name: "Table" },
  { id: "B30", name: "Pagination" },
  { id: "B31", name: "Switch" },
  { id: "B32", name: "Popover" },
  { id: "B33", name: "Toast" },
  { id: "B34", name: "Progress" },
  { id: "B35", name: "Toggle Group" },
  { id: "B36", name: "Resizable" },
  { id: "B37", name: "Kbd" },
  { id: "B38", name: "Avatar" },
  {
    id: "P01",
    name: "StepNavigation",
  },
  {
    id: "P02",
    name: "SetupLayout",
  },
  {
    id: "P03",
    name: "SettingsSection",
  },
  {
    id: "P04",
    name: "SafetyHelp",
  },
  {
    id: "P05",
    name: "PasswordField",
  },
  {
    id: "P06",
    name: "PasswordStrengthFeedback",
  },
  {
    id: "P07",
    name: "LockDurationField",
  },
  {
    id: "P08",
    name: "ThemeControl",
  },
  {
    id: "P09",
    name: "VaultPicker",
  },
  {
    id: "P10",
    name: "SearchField",
  },
  {
    id: "P11",
    name: "EntryRow, EntryList, EntrySelection and EntryTable",
  },
  {
    id: "P12",
    name: "DetailField",
  },
  {
    id: "P13",
    name: "SecretField",
  },
  {
    id: "P14",
    name: "CopyAction",
  },
  {
    id: "P15",
    name: "EmptyState, including EmptyVault",
  },
  {
    id: "P16",
    name: "RecoveryPhraseGrid",
  },
  {
    id: "P17",
    name: "RecoveryExportChoices and RecoveryGuide",
  },
  {
    id: "P18",
    name: "RecoveryWordInput",
  },
  {
    id: "P19",
    name: "RecoveryVerification",
  },
  {
    id: "P20",
    name: "GeneratorControls and GeneratedValue",
  },
  {
    id: "P21",
    name: "SyncStatus",
  },
  {
    id: "P22",
    name: "ComparisonRow, ResolutionSelector, ReviewSummary and SyncReview",
  },
  {
    id: "P23",
    name: "DeviceSummary",
  },
  {
    id: "P24",
    name: "TransferInput and TransferOutput",
  },
  {
    id: "P25",
    name: "DestructiveConfirmation",
  },
  {
    id: "P26",
    name: "ActionFeedback",
  },
  {
    id: "P27",
    name: "TagSelection",
  },
  {
    id: "P28",
    name: "AppNavigation and VaultToolbar",
  },
  { id: "P29", name: "GuidancePanel" },
  { id: "P30", name: "Tag visuals" },
  { id: "P31", name: "Folder controls" },
  {
    id: "F01",
    name: "UnlockForm",
  },
  {
    id: "F02",
    name: "EntryForm",
  },
  {
    id: "F03",
    name: "PasswordCreationForm",
  },
  {
    id: "F04",
    name: "PasswordChangeForm",
  },
  {
    id: "F05",
    name: "CredentialForm",
  },
  {
    id: "F06",
    name: "LocalRecoveryForm",
  },
  {
    id: "F07",
    name: "DeviceSettingsForm",
  },
] as const;

export function collectionFor(id: string) {
  if (id.startsWith("S")) return "screens";
  if (id.startsWith("F")) return "forms";
  const n = Number(id.slice(1));
  if (id.startsWith("B"))
    return n <= 20 ? "base" : n <= 28 ? "additions" : "expanded";
  return [1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 14, 15, 26, 28, 29].includes(n)
    ? "shared"
    : "features";
}
