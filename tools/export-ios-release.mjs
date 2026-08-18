#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const toolPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(toolPath), "..");
const archiveVerifierPath = path.join(repositoryRoot, "tools", "verify-ios-archive.mjs");
const ipaVerifierPath = path.join(repositoryRoot, "tools", "verify-ios-ipa.mjs");

const exportOptionsPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>destination</key>
  <string>export</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>T6235QVFYG</string>
</dict>
</plist>
`;

function defaultRunCommand(command, args, label) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status ?? "unknown"}`);
  }
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function findIpas(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...findIpas(entryPath));
    else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".ipa") found.push(entryPath);
  }
  return found;
}

function requireAbsolutePath(argument, extension, label) {
  if (typeof argument !== "string" || !argument || !path.isAbsolute(argument)) {
    throw new Error(`${label} must be one explicit absolute path`);
  }
  if (path.normalize(argument) !== argument || path.extname(argument) !== extension) {
    throw new Error(`${label} must be a normalized ${extension} path`);
  }
}

export function exportIosRelease({
  archiveArgument,
  outputArgument,
  runCommand = defaultRunCommand,
  logger = console,
}) {
  requireAbsolutePath(archiveArgument, ".xcarchive", "Release archive");
  requireAbsolutePath(outputArgument, ".ipa", "Release IPA output");
  if (!existsSync(archiveArgument) || !lstatSync(archiveArgument).isDirectory()) {
    throw new Error(`Release archive does not exist as a directory: ${archiveArgument}`);
  }
  if (lstatSync(archiveArgument).isSymbolicLink()) {
    throw new Error("Release archive path must not be a symbolic link");
  }
  if (existsSync(outputArgument)) {
    throw new Error(`Refusing to overwrite an existing IPA: ${outputArgument}`);
  }
  const outputParent = path.dirname(outputArgument);
  if (!existsSync(outputParent) || !lstatSync(outputParent).isDirectory()) {
    throw new Error(`Release IPA parent directory does not exist: ${outputParent}`);
  }

  const temporaryRoot = mkdtempSync(path.join(outputParent, ".mrtap-ios-export-"));
  const exportDirectory = path.join(temporaryRoot, "result");
  const optionsPath = path.join(temporaryRoot, "ExportOptions.plist");
  mkdirSync(exportDirectory);
  writeFileSync(optionsPath, exportOptionsPlist, { encoding: "utf8", mode: 0o600 });

  try {
    runCommand(
      process.execPath,
      [archiveVerifierPath, archiveArgument],
      "Archive verification",
    );
    runCommand(
      "/usr/bin/xcodebuild",
      [
        "-exportArchive",
        "-archivePath", archiveArgument,
        "-exportPath", exportDirectory,
        "-exportOptionsPlist", optionsPath,
        "-allowProvisioningUpdates",
      ],
      "Signed IPA export",
    );

    const exportedIpas = findIpas(exportDirectory);
    if (exportedIpas.length !== 1) {
      throw new Error(`Xcode export produced ${exportedIpas.length} IPA files; expected exactly one`);
    }
    const exportedIpa = exportedIpas[0];
    runCommand(process.execPath, [ipaVerifierPath, exportedIpa], "IPA verification");

    linkSync(exportedIpa, outputArgument);
    const digest = sha256(outputArgument);
    if (digest !== sha256(exportedIpa)) {
      rmSync(outputArgument, { force: true });
      throw new Error("Published IPA does not match the verified export");
    }
    logger.log(`Verified IPA is ready for controlled upload: ${outputArgument}`);
    logger.log(`SHA-256: ${digest}`);
    return { outputPath: outputArgument, sha256: digest };
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === toolPath;
if (invokedDirectly) {
  if (process.argv.length !== 4) {
    console.error("Usage: npm run ios:export-release -- /absolute/path/App.xcarchive /absolute/path/App.ipa");
    process.exit(2);
  }
  try {
    exportIosRelease({
      archiveArgument: process.argv[2],
      outputArgument: process.argv[3],
    });
  } catch (error) {
    console.error(`\nRelease export stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
