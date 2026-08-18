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
const currentVersionSettings = project.match(/CURRENT_PROJECT_VERSION = [^;]+;/g) || [];
const marketingVersionSettings = project.match(/MARKETING_VERSION = [^;]+;/g) || [];
if (currentVersionSettings.length !== 10 || marketingVersionSettings.length !== 10) {
  console.error(
    `Refusing partial version update: found ${currentVersionSettings.length} build and ` +
    `${marketingVersionSettings.length} marketing-version settings; expected 10 of each`,
  );
  process.exit(1);
}
project = project
  .replace(/^\s*objectVersion = \d+;/m, "\tobjectVersion = 60;")
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildVersion};`)
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${marketingVersion};`);
writeFileSync(projectPath, project);

let info = readFileSync(infoPath, "utf8");
if (!/<key>UISupportedInterfaceOrientations<\/key>\s*<array>[\s\S]*?<\/array>/.test(info)) {
  console.error("Refusing version setup: App Info.plist has no phone orientation block");
  process.exit(1);
}
info = info.replace(
  /(<key>UISupportedInterfaceOrientations<\/key>\s*<array>)[\s\S]*?(<\/array>)/,
  "$1\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t$2",
);
writeFileSync(infoPath, info);

console.log(`iOS project set to ${marketingVersion} (build ${buildVersion}), portrait-only`);
