import path from "node:path";
import { ascAuthArgs } from "./asc-auth.mjs";

export async function archiveRelease({
  repositoryRoot,
  archivePath,
  run,
  capture,
  makeDerivedData,
  removeDerivedData,
  log = console.log,
}) {
  let derivedDataPath;
  try {
    const dirty = capture(
      "/usr/bin/git",
      ["status", "--porcelain", "--untracked-files=all"],
      "Git release-state check",
    );
    if (dirty) {
      throw new Error(`release worktree is not clean after setup:\n${dirty}`);
    }

    const commit = capture("/usr/bin/git", ["rev-parse", "HEAD"], "Git commit lookup");
    run("/usr/bin/env", ["npm", "test"], "Full automated test suite");
    run(
      process.execPath,
      [path.join(repositoryRoot, "tools", "check-release.mjs")],
      "Release preflight",
    );

    derivedDataPath = makeDerivedData();
    run(
      "/usr/bin/xcodebuild",
      [
        "-workspace", path.join(repositoryRoot, "ios", "App", "App.xcworkspace"),
        "-scheme", "App",
        "-configuration", "Release",
        "-destination", "generic/platform=iOS",
        "-archivePath", archivePath,
        "-derivedDataPath", derivedDataPath,
        "-allowProvisioningUpdates",
        // Without the API key, -allowProvisioningUpdates has nothing to
        // authenticate with and xcodebuild fails on "No Accounts: Add a new
        // account in Accounts settings". The export step has always passed these;
        // the archive never did, and it did not matter until a target needed a
        // capability the cached wildcard team profile does not carry (the widget's
        // App Group, new in 1.2.0).
        ...ascAuthArgs(),
        "archive",
      ],
      "Signed iOS archive",
    );
    run(
      process.execPath,
      [path.join(repositoryRoot, "tools", "verify-ios-archive.mjs"), archivePath],
      "Archive verification",
    );

    log(`Release archive is verified at commit ${commit} and ready for export: ${archivePath}`);
    return { commit, archivePath };
  } finally {
    if (derivedDataPath) removeDerivedData(derivedDataPath);
  }
}
