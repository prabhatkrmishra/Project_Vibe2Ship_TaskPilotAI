import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

let failed = false;

function findFiles(dir, pattern, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      findFiles(full, pattern, results);
    } else if (pattern.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

function checkFile(filePath, regex, label) {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      violations.push(`  ${filePath}:${i + 1}: ${lines[i].trim()}`);
    }
  }
  return violations;
}

// Check 1: Controllers must not import Mongoose models (connectDB is allowed)
const controllerFiles = findFiles("server/controllers", /\.ts$/);
const MODEL_NAMES = /User|Goal|Task|ChatMessage|AIDecision|DailyPlanModel|FocusSession|AIUsage|PricingConfig/;
const modelViolations = [];
for (const f of controllerFiles) {
  const lines = readFileSync(f, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/from.*db\/mongodb/.test(line) && MODEL_NAMES.test(line)) {
      modelViolations.push(`  ${f}:${i + 1}: ${line.trim()}`);
    }
  }
}
if (modelViolations.length > 0) {
  console.error("\nFAIL - Controllers must not import Mongoose models:\n");
  console.error(modelViolations.join("\n"));
  failed = true;
}

// Check 2: Services must not import Express Request/Response types
const serviceFiles = findFiles("server/services", /\.ts$/);
const expressViolations = [];
for (const f of serviceFiles) {
  expressViolations.push(...checkFile(f, /\bRequest\b|\bResponse\b/, "express type"));
}
if (expressViolations.length > 0) {
  console.error("\nFAIL - Services must not import Express Request/Response types:\n");
  console.error(expressViolations.join("\n"));
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log("Layer split enforcement passed");
process.exit(0);
