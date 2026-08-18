#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  ["dependencies", "@capacitor/core", "6.2.1"],
  ["dependencies", "@capacitor/ios", "6.2.1"],
  ["devDependencies", "@capacitor/cli", "6.2.1"],
  ["dependencies", "@capacitor/local-notifications", "6.1.3"],
];

function json(relativePath) {
  return JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

const manifest = json("package.json");
const failures = [];
for (const [section, packageName, expected] of packages) {
  const declared = manifest[section]?.[packageName];
  if (declared !== expected) {
    failures.push(`${packageName} is declared as ${declared || "missing"}, expected exact ${expected}`);
  }
  try {
    const installed = json(path.join("node_modules", packageName, "package.json")).version;
    if (installed !== expected) {
      failures.push(`${packageName} installed version is ${installed}, expected ${expected}`);
    }
  } catch {
    failures.push(`${packageName} is not installed locally; run npm install before iOS sync`);
  }
}

let podLock = "";
try {
  podLock = readFileSync(path.join(repositoryRoot, "ios", "App", "Podfile.lock"), "utf8");
} catch {
  failures.push("ios/App/Podfile.lock is missing");
}
for (const [pod, expected] of [
  ["Capacitor", "6.2.1"],
  ["CapacitorCordova", "6.2.1"],
  ["CapacitorLocalNotifications", "6.1.3"],
]) {
  const pattern = new RegExp(`^  - ${pod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(${expected.replaceAll(".", "\\.")}\\)`, "m");
  if (podLock && !pattern.test(podLock)) {
    failures.push(`${pod} is not locked to ${expected} in Podfile.lock`);
  }
}

if (failures.length) {
  console.error("Capacitor version check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Capacitor JavaScript packages and iOS pods match the pinned release versions");
