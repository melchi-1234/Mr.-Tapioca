import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const archiveArgument = process.argv[2];

if (!archiveArgument) {
  console.error("Usage: npm run ios:verify-archive -- /path/to/App.xcarchive");
  process.exit(1);
}

const archivePath = path.resolve(archiveArgument);
const appBundle = path.join(archivePath, "Products", "Applications", "App.app");
const bundles = [
  { name: "App", path: appBundle },
  {
    name: "DeviceActivityMonitor",
    path: path.join(appBundle, "PlugIns", "DeviceActivityMonitor.appex"),
  },
];

function verifyManifest(bundle) {
  const manifestPath = path.join(bundle.path, "PrivacyInfo.xcprivacy");
  if (!existsSync(manifestPath)) {
    throw new Error(`${bundle.name} is missing PrivacyInfo.xcprivacy at its bundle root`);
  }

  const converted = spawnSync(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", manifestPath],
    { encoding: "utf8" },
  );
  if (converted.status !== 0) {
    throw new Error(`${bundle.name} has a malformed PrivacyInfo.xcprivacy`);
  }

  const privacy = JSON.parse(converted.stdout);
  const apiTypes = Array.isArray(privacy.NSPrivacyAccessedAPITypes)
    ? privacy.NSPrivacyAccessedAPITypes
    : [];
  const userDefaults = apiTypes.find(
    (entry) => entry.NSPrivacyAccessedAPIType === "NSPrivacyAccessedAPICategoryUserDefaults",
  );
  const reasons = userDefaults?.NSPrivacyAccessedAPITypeReasons;
  if (!Array.isArray(reasons) || !reasons.includes("1C8F.1")) {
    throw new Error(`${bundle.name} does not declare App Group UserDefaults reason 1C8F.1`);
  }
}

try {
  for (const bundle of bundles) verifyManifest(bundle);
  console.log("Verified required-reason privacy manifests in App and DeviceActivityMonitor");
} catch (error) {
  console.error(`Archive privacy verification failed: ${error.message}`);
  process.exit(1);
}
