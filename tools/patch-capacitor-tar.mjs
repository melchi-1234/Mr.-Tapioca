#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI_VERSION = "6.2.1";
const TAR_VERSION = "7.5.22";
const ORIGINAL_HASH = "64d77b29a7d6116d3e86441a009824b3bb9b7e3cca8153f502b76ff23132f440";
const PATCHED_HASH = "02a3d16c9d21e57176ca0c3885532e8b11936d14905b6e5d5d117c406fa35e85";
const ORIGINAL_CALL = "await tar_1.default.extract({ file: src, cwd: dir });";
const PATCHED_CALL = "await tar_1.extract({ file: src, cwd: dir });";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function patchCapacitorTar(rootDir) {
  const root = path.resolve(rootDir);
  const cliRoot = path.join(root, "node_modules", "@capacitor", "cli");
  const tarRoot = path.join(root, "node_modules", "tar");
  const cliVersion = readJson(path.join(cliRoot, "package.json")).version;
  const tarVersion = readJson(path.join(tarRoot, "package.json")).version;
  if (cliVersion !== CLI_VERSION) {
    throw new Error(`expected @capacitor/cli ${CLI_VERSION}, found ${cliVersion || "unknown"}`);
  }
  if (tarVersion !== TAR_VERSION) {
    throw new Error(`expected tar ${TAR_VERSION}, found ${tarVersion || "unknown"}`);
  }

  const target = path.join(cliRoot, "dist", "util", "template.js");
  const source = readFileSync(target, "utf8");
  const before = sha256(source);
  if (before === PATCHED_HASH) return "already-patched";
  if (before !== ORIGINAL_HASH) {
    throw new Error("unexpected Capacitor extractor bytes; refusing compatibility patch");
  }
  const patched = source.replace(ORIGINAL_CALL, PATCHED_CALL);
  if (patched === source || sha256(patched) !== PATCHED_HASH) {
    throw new Error("Capacitor extractor compatibility patch did not match the audited result");
  }

  const temporary = `${target}.mrtap-next-${process.pid}`;
  try {
    writeFileSync(temporary, patched, { encoding: "utf8", flag: "wx", mode: statSync(target).mode });
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
  return "patched";
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    if (process.argv.length > 3) throw new Error("Usage: node tools/patch-capacitor-tar.mjs [repository-root]");
    const result = patchCapacitorTar(root);
    console.log(`Capacitor tar compatibility: ${result}`);
  } catch (error) {
    console.error(`Capacitor tar compatibility failed: ${error.message}`);
    process.exitCode = 1;
  }
}
