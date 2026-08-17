#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectPath = resolve(repo, "ios/App/App.xcodeproj/project.pbxproj");
const infoPath = resolve(repo, "ios/App/App/Info.plist");
const [marketingVersion, buildVersion] = process.argv.slice(2);

if (!/^\d+\.\d+\.\d+$/.test(marketingVersion || "") || !/^[1-9]\d*$/.test(buildVersion || "")) {
  console.error("Usage: node tools/set-ios-version.mjs <version like 1.1.1> <build like 8>");
  process.exit(2);
}

let project = readFileSync(projectPath, "utf8");
project = project
  .replace(/^\s*objectVersion = \d+;/m, "\tobjectVersion = 60;")
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildVersion};`)
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${marketingVersion};`);
writeFileSync(projectPath, project);

let info = readFileSync(infoPath, "utf8");
info = info.replace(
  /(<key>UISupportedInterfaceOrientations<\/key>\s*<array>)[\s\S]*?(<\/array>)/,
  "$1\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t$2",
);
writeFileSync(infoPath, info);

console.log(`iOS project set to ${marketingVersion} (build ${buildVersion}), portrait-only`);
