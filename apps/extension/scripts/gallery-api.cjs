// Reads real TypeScript component APIs. No source imports are executed.
const ts = require("typescript");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const primitiveIds = Object.fromEntries(
  "button:B01 field:B02 label:B02 input:B03 input-group:B04 textarea:B05 native-select:B06 checkbox:B07 radio-group:B08 slider:B09 alert:B10 badge:B11 spinner:B12 skeleton:B13 accordion:B14 tooltip:B15 dropdown-menu:B16 alert-dialog:B17 separator:B18 dialog:B19 tabs:B20 empty:B21 item:B22 card:B23 combobox:B24 button-group:B25 attachment:B26 sidebar:B27 sheet:B28 table:B29 pagination:B30 switch:B31 popover:B32 toast:B33 progress:B34 toggle-group:B35 toggle:B35 resizable:B36 kbd:B37 avatar:B38"
    .split(" ")
    .map((v) => v.split(":")),
);
const featureIds = Object.fromEntries(
  "PopupWorkspace:S01 PopupEntries:S01 EntryWorkspace:S02 SiteIcon:P11 EntryEditor:F02 EntryDetails:P12 S3SetupGuide:S04 SetupLink:S04 SetupCopy:S04 SetupStep:S04 AccessKeyInstructions:S04 ConnectionInstructions:S04 SyncPage:S03 VaultLockSettings:S02 SetupRecoveryView:S02 SetupVaultAccess:S02 SetupWelcome:S02 SetupPassword:S02 SetupDevice:S02 SetupConnection:S02 ThemeProvider:P08 ThemeToggle:P08 OptionsView:S02 PopupView:S01 StepNavigation:P01 SetupLayout:P02 SettingsSection:P03 SafetyHelp:P04 TextField:B03 PasswordField:P05 PasswordStrengthFeedback:P06 LockDurationField:P07 FormActions:F01 FormFrame:F01 FormPassword:P05 SearchField:P10 EntryRow:P11 EntryList:P11 EntrySelection:P11 EntryTable:P11 SelectionCheckbox:P11 TagSelection:P27 EntryForm:F02 ActionFeedback:P26 CopyAction:P14 SecretField:P13 EmptyState:P15 DetailField:P12 VaultPicker:P09 UnlockForm:F01 PasswordChangeForm:F04 PasswordCreationForm:F03 SyncStatus:P21 ComparisonRow:P22 ResolutionSelector:P22 ReviewSummary:P22 SyncReview:P22 CredentialForm:F05 RecoveryPhraseGrid:P16 RecoveryExportChoices:P17 RecoveryGuide:P17 RecoveryWordInput:P18 RecoveryVerification:P19 LocalRecoveryForm:F06 DeviceSummary:P23 TransferInput:P24 TransferOutput:P24 DeviceSettingsForm:F07 DestructiveConfirmation:P25 AppNavigation:P28 VaultToolbar:P28 GeneratorControls:P20 UsernameControls:P20 GeneratedValue:P20"
    .split(" ")
    .map((v) => v.split(":")),
);
const config = ts.readConfigFile(
  path.join(root, "tsconfig.app.json"),
  ts.sys.readFile,
);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options),
  checker = program.getTypeChecker();
const families = new Set();
function collectFamilies(node) {
  if (
    ts.isPropertyAssignment(node) &&
    node.name.getText() === "id" &&
    ts.isStringLiteral(node.initializer)
  ) {
    if (families.has(node.initializer.text))
      throw new Error(`Duplicate gallery family ${node.initializer.text}`);
    families.add(node.initializer.text);
  }
  ts.forEachChild(node, collectFamilies);
}
collectFamilies(
  program.getSourceFile(path.join(root, "src/gallery/catalog.ts")),
);
function containsJsx(node) {
  return (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node) ||
    ts.forEachChild(node, containsJsx)
  );
}
const components = [];
for (const source of program.getSourceFiles()) {
  if (
    !source.fileName.startsWith(path.join(root, "src/ui/")) ||
    !source.fileName.endsWith(".tsx") ||
    source.fileName.endsWith(".test.tsx")
  )
    continue;
  const sym = checker.getSymbolAtLocation(source);
  if (!sym) continue;
  const exports = checker.getExportsOfModule(sym);
  const exportedNames = new Set(exports.map((symbol) => symbol.name));
  const candidates = [...exports];
  // Private JSX parts belong to their family's inventory without becoming API.
  for (const statement of source.statements) {
    const declarations = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations
      : ts.isFunctionDeclaration(statement)
        ? [statement]
        : [];
    for (const declaration of declarations) {
      if (
        !declaration.name ||
        !ts.isIdentifier(declaration.name) ||
        exportedNames.has(declaration.name.text) ||
        !containsJsx(declaration)
      )
        continue;
      const symbol = checker.getSymbolAtLocation(declaration.name);
      if (symbol) candidates.push(symbol);
    }
  }
  for (const exp of candidates) {
    if (!/^[A-Z]/.test(exp.name)) continue;
    const signature = checker
      .getTypeOfSymbolAtLocation(exp, source)
      .getCallSignatures()[0];
    if (!signature) continue;
    const relative = path.relative(path.join(root, "src/ui"), source.fileName);
    const family = relative.startsWith("components/primitives/")
      ? primitiveIds[path.basename(relative, ".tsx")]
      : featureIds[exp.name];
    if (!family || !families.has(family))
      throw new Error(`Register gallery ownership for ${relative}#${exp.name}`);
    const parameter = signature.getParameters()[0];
    const props =
      parameter && checker.getTypeOfSymbolAtLocation(parameter, source);
    const axes = {};
    for (const key of [
      "variant",
      "size",
      "orientation",
      "side",
      "align",
      "collapsible",
      "mode",
      "layout",
    ]) {
      // Obsolete native table alignment is not a supported design-system variant.
      if (key === "align" && relative === "components/primitives/table.tsx")
        continue;
      const prop = props?.getProperty(key);
      if (!prop) continue;
      const type = checker.getTypeOfSymbolAtLocation(prop, source);
      const values = (type.isUnion() ? type.types : [type])
        .filter((t) => t.flags & ts.TypeFlags.StringLiteral)
        .map((t) => t.value)
        .sort();
      if (values.length > 1) axes[key] = values;
    }
    components.push({
      name: exp.name,
      source: relative,
      family,
      exported: exportedNames.has(exp.name),
      axes,
    });
  }
}
components.sort((a, b) => a.name.localeCompare(b.name));
const demoSource = fs.readFileSync(
  path.join(root, "src/gallery/variant-demo.view.tsx"),
  "utf8",
);
const wired = new Set();
function collectPreviewBindings(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "p" &&
    node.arguments[1] &&
    ts.isStringLiteral(node.arguments[1])
  )
    wired.add(node.arguments[1].text);
  ts.forEachChild(node, collectPreviewBindings);
}
collectPreviewBindings(
  ts.createSourceFile(
    "variant-demo.view.tsx",
    demoSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  ),
);
for (const component of components) {
  if (Object.keys(component.axes).length && !wired.has(component.name))
    throw new Error(`Wire variant preview for ${component.name}`);
}
// Follow imports from the gallery; production-only uses cannot satisfy coverage.
const reachable = new Set();
function followImports(source) {
  if (!source || reachable.has(source)) return;
  reachable.add(source);
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) &&
      !ts.isExportDeclaration(statement)
    )
      continue;
    if (!statement.moduleSpecifier) continue;
    const symbol = checker.getSymbolAtLocation(statement.moduleSpecifier);
    for (const declaration of symbol?.declarations ?? []) {
      if (
        ts.isSourceFile(declaration) &&
        declaration.fileName.startsWith(path.join(root, "src/"))
      )
        followImports(declaration);
    }
  }
}
followImports(program.getSourceFile(path.join(root, "src/gallery/main.tsx")));
// ThemeProvider owns persistent runtime state, so the gallery reviews its pure
// ThemeToggle consumer with injected fixture state. It has no visual output.
const nonvisual = new Set(["ThemeProvider"]);
const rendered = new Set();
for (const source of reachable) {
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      let symbol = checker.getSymbolAtLocation(node.tagName);
      if (symbol?.flags & ts.SymbolFlags.Alias)
        symbol = checker.getAliasedSymbol(symbol);
      if (symbol) rendered.add(symbol.name);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const unrendered = components.filter(
  (c) => !nonvisual.has(c.name) && !rendered.has(c.name),
);
if (unrendered.length)
  throw new Error(
    "Unrendered components: " + unrendered.map((c) => c.name).join(", "),
  );
const output = path.join(root, "src/gallery/component-api.generated.ts");
const text =
  "// Generated by scripts/gallery-api.cjs --write; review ownership and fixtures with API changes.\n// prettier-ignore\nexport const componentApi = " +
  JSON.stringify(components, null, 2) +
  " as const;\n";
if (process.argv.includes("--write")) fs.writeFileSync(output, text);
else if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== text)
  throw new Error(
    "Gallery component API inventory is stale. Run pnpm --filter @lfspm/extension gallery:inventory, then update examples and review the diff.",
  );
console.info(
  `${components.length} components and parts mapped; ${components.reduce((n, c) => n + Object.keys(c.axes).length, 0)} variant axes checked.`,
);
