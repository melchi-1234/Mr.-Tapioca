#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const toolPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(toolPath), "..");
const ipaVerifierPath = path.join(repositoryRoot, "tools", "verify-ios-ipa.mjs");

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

function defaultLoadConfig() {
  const configPath = path.join(homedir(), ".appstoreconnect", "config.json");
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(`App Store Connect credentials are unreadable at ${configPath}: ${error.message}`);
  }
  if (typeof config.key_path === "string" && config.key_path.startsWith("~/")) {
    config.key_path = path.join(homedir(), config.key_path.slice(2));
  }
  return config;
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function validateIpaPath(ipaPath) {
  if (typeof ipaPath !== "string" || !ipaPath || !path.isAbsolute(ipaPath)) {
    throw new Error("Release IPA must be one explicit absolute path");
  }
  if (path.normalize(ipaPath) !== ipaPath || path.extname(ipaPath) !== ".ipa") {
    throw new Error("Release IPA must be one normalized .ipa path");
  }
  if (!existsSync(ipaPath)) {
    throw new Error(`Release IPA does not exist as a regular file: ${ipaPath}`);
  }
  if (lstatSync(ipaPath).isSymbolicLink()) {
    throw new Error("Release IPA path must not be a symbolic link");
  }
  if (!lstatSync(ipaPath).isFile()) {
    throw new Error(`Release IPA does not exist as a regular file: ${ipaPath}`);
  }
}

function validateCredentials(config) {
  if (!config || typeof config.key_id !== "string" || !config.key_id
      || typeof config.issuer_id !== "string" || !config.issuer_id
      || typeof config.key_path !== "string" || !config.key_path) {
    throw new Error("App Store Connect credentials require key_id, issuer_id, and key_path");
  }
  if (!path.isAbsolute(config.key_path)
      || !existsSync(config.key_path)
      || !lstatSync(config.key_path).isFile()
      || lstatSync(config.key_path).isSymbolicLink()) {
    throw new Error("App Store Connect private key path is not a regular absolute file");
  }
}

export function uploadIosRelease({
  ipaArgument,
  runCommand = defaultRunCommand,
  loadConfig = defaultLoadConfig,
  logger = console,
}) {
  validateIpaPath(ipaArgument);
  const config = loadConfig();
  validateCredentials(config);

  runCommand(process.execPath, [ipaVerifierPath, ipaArgument], "IPA verification");
  const digest = sha256(ipaArgument);
  runCommand(
    "/usr/bin/xcrun",
    [
      "altool",
      "--upload-app",
      "-f", ipaArgument,
      "-t", "ios",
      "--api-key", config.key_id,
      "--api-issuer", config.issuer_id,
      "--output-format", "json",
      "--show-progress",
    ],
    "App Store Connect upload",
  );
  if (sha256(ipaArgument) !== digest) {
    throw new Error("Release IPA changed while it was being uploaded");
  }

  logger.log(`Verified IPA upload accepted by App Store Connect: ${ipaArgument}`);
  logger.log(`SHA-256: ${digest}`);
  return { ipaPath: ipaArgument, sha256: digest };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === toolPath;
if (invokedDirectly) {
  if (process.argv.length !== 3) {
    console.error("Usage: npm run ios:upload-release -- /absolute/path/Mr-Tapioca-1.1.1-12.ipa");
    process.exit(2);
  }
  try {
    uploadIosRelease({ ipaArgument: process.argv[2] });
  } catch (error) {
    console.error(`\nRelease upload stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
