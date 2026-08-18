#!/usr/bin/env node
import { cpSync, mkdirSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_ASSET_DIRECTORY, PUBLIC_ROOT_FILES } from "./public-bundle-manifest.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(repositoryRoot, "www");
if (destination !== path.resolve(repositoryRoot, "www")) {
  throw new Error("refusing to replace an unexpected web-bundle path");
}

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
for (const name of PUBLIC_ROOT_FILES) {
  cpSync(path.join(repositoryRoot, name), path.join(destination, name));
}
cpSync(
  path.join(repositoryRoot, PUBLIC_ASSET_DIRECTORY),
  path.join(destination, PUBLIC_ASSET_DIRECTORY),
  { recursive: true },
);

function removeFinderMetadata(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) removeFinderMetadata(entryPath);
    else if (entry.name === ".DS_Store") unlinkSync(entryPath);
  }
}
removeFinderMetadata(destination);
console.log(`Copied ${PUBLIC_ROOT_FILES.length} shell files and ${PUBLIC_ASSET_DIRECTORY}/ into www/`);
