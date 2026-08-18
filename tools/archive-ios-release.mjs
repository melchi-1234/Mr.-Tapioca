#!/usr/bin/env node
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { archiveRelease } from "./archive-ios-release-lib.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archiveArgument = process.argv[2];

if (!archiveArgument || process.argv.length !== 3) {
  console.error("Usage: npm run ios:archive-release -- /absolute/path/App.xcarchive");
  process.exit(2);
}

const archivePath = path.resolve(archiveArgument);
if (path.extname(archivePath) !== ".xcarchive") {
  console.error("Release archive path must end in .xcarchive");
  process.exit(2);
}
if (existsSync(archivePath)) {
  console.error(`Refusing to overwrite an existing archive: ${archivePath}`);
  process.exit(2);
}

function run(command, args, label) {
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

function capture(command, args, label) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit ${result.status ?? "unknown"}`);
  return result.stdout.trim();
}

try {
  await archiveRelease({
    repositoryRoot,
    archivePath,
    run,
    capture,
    makeDerivedData: () => mkdtempSync(path.join(tmpdir(), "mrtap-release-derived-")),
    removeDerivedData: (derivedDataPath) => {
      if (!derivedDataPath.startsWith(path.join(tmpdir(), "mrtap-release-derived-"))) {
        throw new Error(`Refusing to remove unexpected DerivedData path: ${derivedDataPath}`);
      }
      rmSync(derivedDataPath, { recursive: true, force: true });
    },
    log: (message) => console.log(`\n${message}`),
  });
} catch (error) {
  console.error(`\nRelease archive stopped: ${error.message}`);
  process.exitCode = 1;
}
