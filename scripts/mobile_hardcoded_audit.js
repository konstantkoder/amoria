const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve("src");
const brandPattern = /^(?:Amoria|Amoria Premium|Premium|Founder|Together|Google Play|Android|iOS)$/i;
const humanText = /[A-Za-zÀ-žΑ-ωА-я]{2}/u;
const findings = [];

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "i18n" ? [] : filesUnder(full);
    return /\.[jt]sx?$/.test(entry.name) ? [full] : [];
  });
}

function location(ast, file, node) {
  const point = ast.getLineAndCharacterOfPosition(node.getStart(ast));
  return { file: path.relative(process.cwd(), file).replaceAll("\\", "/"), line: point.line + 1 };
}

function add(ast, file, node, value, reason) {
  const text = String(value).trim();
  if (!humanText.test(text)) return;
  findings.push({
    ...location(ast, file, node),
    value: text,
    reason,
    classification: brandPattern.test(text) ? "INTENTIONAL_BRAND" : "REVIEW_REQUIRED",
  });
}

for (const file of filesUnder(root)) {
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isJsxText(node)) add(ast, file, node, node.text, "JSX_TEXT");
    if (ts.isJsxAttribute(node) && ["placeholder", "accessibilityLabel", "accessibilityHint"].includes(node.name.getText(ast)) && node.initializer && ts.isStringLiteral(node.initializer)) {
      add(ast, file, node, node.initializer.text, "USER_FACING_ATTRIBUTE");
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.parent && ts.isJsxExpression(node.parent)) {
      add(ast, file, node, node.text, "JSX_EXPRESSION_LITERAL");
    }
    if (ts.isCallExpression(node)) {
      const callName = node.expression.getText(ast);
      if (["Alert.alert", "ToastAndroid.show"].includes(callName)) {
        for (const argument of node.arguments.slice(0, 2)) if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) add(ast, file, argument, argument.text, callName);
      }
      if (callName === "tt" && !(node.arguments[0] && ts.isIdentifier(node.arguments[0]) && node.arguments[0].text === "t") && node.arguments[1] && (ts.isStringLiteral(node.arguments[1]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[1]))) add(ast, file, node.arguments[1], node.arguments[1].text, "LEGACY_TT_FALLBACK");
      if (["copyOrFallback", "translatedOptionLabel", "translatedWithFallback"].includes(callName) && node.arguments[2] && (ts.isStringLiteral(node.arguments[2]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[2]))) add(ast, file, node.arguments[2], node.arguments[2].text, "LEGACY_COPY_FALLBACK");
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}

const fixed = [
  { classification: "FIXED", issue: "Founder badge text and accessibility copy moved to dictionaries" },
  { classification: "FIXED", issue: "Premium FREE/PREMIUM tier labels moved to dictionaries" },
  { classification: "FIXED", issue: "Premium raw billing/network errors replaced by safe localized copy" },
  { classification: "FIXED", issue: "Legacy literal tt/copy fallbacks removed from release UI" },
  { classification: "FIXED", issue: "Nearby locale-specific literal fallbacks replaced by complete dictionary keys" },
  { classification: "FIXED", issue: "Invite share/copy/error feedback moved to localized safe states" },
  { classification: "FIXED", issue: "Raw server/store error details removed from customer-facing UI" },
];
const technicalNonUser = [
  { file: "src/screens/AccountDeletionScreen.tsx", line: 20, value: "DELETE", reason: "EXPLICIT_SAFETY_CONFIRMATION_TOKEN", classification: "TECHNICAL_NON_USER" },
];
const report = {
  generatedAt: new Date().toISOString(),
  classifications: ["FIXED", "INTENTIONAL_BRAND", "TECHNICAL_NON_USER", "FALSE_POSITIVE", "REVIEW_REQUIRED"],
  summary: {
    fixed: fixed.length,
    intentionalBrand: findings.filter((item) => item.classification === "INTENTIONAL_BRAND").length,
    technicalNonUser: technicalNonUser.length,
    falsePositive: 0,
    reviewRequired: findings.filter((item) => item.classification === "REVIEW_REQUIRED").length,
  },
  fixed,
  findings: [...findings, ...technicalNonUser],
};
const output = process.env.HARD_CODE_AUDIT_OUTPUT;
if (output) fs.writeFileSync(path.resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.summary.reviewRequired) process.exitCode = 1;
