#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PUBLIC_ASSET_DIRECTORY, PUBLIC_ROOT_FILES, PUBLIC_ENTRY } from "./public-bundle-manifest.mjs";

const expectedVersion = "1.1.1";
const expectedBuild = "12";
const expectedTeam = "T6235QVFYG";
const expectedAppGroup = "group.com.melchior.mrtapioca";
const toolPath = fileURLToPath(import.meta.url);
const toolRoot = path.dirname(toolPath);
const repositoryRoot = path.resolve(toolRoot, "..");
const canonicalPoseDirectory = path.join(repositoryRoot, "assets", "poses");

const bundleDefinitions = [
  {
    name: "App",
    directory: "",
    bundleId: "com.melchior.mrtapioca",
    packageType: "APPL",
    executable: "App",
    privacyManifest: true,
    screenTimeEntitlements: true,
  },
  {
    name: "DeviceActivityMonitor",
    directory: "DeviceActivityMonitor.appex",
    bundleId: "com.melchior.mrtapioca.DeviceActivityMonitor",
    packageType: "XPC!",
    executable: "DeviceActivityMonitor",
    extensionPoint: "com.apple.deviceactivity.monitor-extension",
    privacyManifest: true,
    screenTimeEntitlements: true,
  },
  {
    name: "ShieldAction",
    directory: "ShieldAction.appex",
    bundleId: "com.melchior.mrtapioca.ShieldAction",
    packageType: "XPC!",
    executable: "ShieldAction",
    extensionPoint: "com.apple.ManagedSettings.shield-action-service",
    screenTimeEntitlements: true,
  },
  {
    name: "ShieldConfiguration",
    directory: "ShieldConfiguration.appex",
    bundleId: "com.melchior.mrtapioca.ShieldConfiguration",
    packageType: "XPC!",
    executable: "ShieldConfiguration",
    extensionPoint: "com.apple.ManagedSettingsUI.shield-configuration-service",
    screenTimeEntitlements: true,
  },
  {
    name: "FocusWidgetExtension",
    directory: "FocusWidgetExtension.appex",
    bundleId: "com.melchior.mrtapioca.FocusWidget",
    packageType: "XPC!",
    executable: "FocusWidgetExtension",
    extensionPoint: "com.apple.widgetkit-extension",
    screenTimeEntitlements: false,
  },
];

function capture(command, args, label, input) {
  const result = spawnSync(command, args, { encoding: "utf8", input });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stdout || ""}${result.stderr || ""}`.trim();
    throw new Error(`${label} failed${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout;
}

function run(command, args, label) {
  capture(command, args, label);
}

function readPlist(plistPath, label) {
  if (!existsSync(plistPath)) throw new Error(`${label} is missing`);
  const output = capture(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", plistPath],
    label,
  );
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${label} is malformed`);
  }
}

function validateZipEntries(ipaPath) {
  const listing = capture("/usr/bin/unzip", ["-Z1", ipaPath], "IPA file listing");
  const entries = listing.split(/\r?\n/).filter(Boolean);
  if (entries.length === 0) throw new Error("IPA is empty");
  for (const entry of entries) {
    const normalized = path.posix.normalize(entry);
    if (
      entry.includes("\\")
      || entry.startsWith("/")
      || normalized === ".."
      || normalized.startsWith("../")
    ) {
      throw new Error(`IPA contains an unsafe path: ${entry}`);
    }
  }
}

function rejectSymlinks(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    const details = lstatSync(entryPath);
    if (details.isSymbolicLink()) {
      throw new Error(`IPA contains an unsupported symbolic link: ${path.relative(directory, entryPath)}`);
    }
    if (details.isDirectory()) rejectSymlinks(entryPath);
  }
}

function readEntitlements(bundle) {
  const xml = capture(
    "/usr/bin/codesign",
    ["-d", "--entitlements", ":-", bundle.path],
    `${bundle.name} signed entitlements`,
  );
  const json = capture(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", "-"],
    `${bundle.name} signed entitlements`,
    xml,
  );
  try {
    return JSON.parse(json);
  } catch {
    throw new Error(`${bundle.name} signed entitlements are malformed`);
  }
}

function extractProfileValue(profileXml, key, format, label, optional = false) {
  const result = spawnSync(
    "/usr/bin/plutil",
    ["-extract", key, format, "-o", "-", "-"],
    { encoding: "utf8", input: profileXml },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (optional) return undefined;
    throw new Error(`${label} is missing ${key}`);
  }
  const output = result.stdout.trim();
  if (format === "raw") return output;
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${label} has malformed ${key}`);
  }
}

function decodeProvisioningProfileWithSecurity(profilePath, bundle) {
  if (!existsSync(profilePath)) {
    throw new Error(`${bundle.name} embedded.mobileprovision is missing`);
  }
  const label = `${bundle.name} provisioning profile`;
  const profileXml = capture(
    "/usr/bin/security",
    ["cms", "-D", "-i", profilePath],
    `${label} decoding`,
  );
  return {
    TeamIdentifier: extractProfileValue(profileXml, "TeamIdentifier", "json", label),
    ApplicationIdentifierPrefix: extractProfileValue(
      profileXml,
      "ApplicationIdentifierPrefix",
      "json",
      label,
    ),
    ExpirationDate: extractProfileValue(profileXml, "ExpirationDate", "raw", label),
    Entitlements: extractProfileValue(profileXml, "Entitlements", "json", label),
    ProvisionedDevices: extractProfileValue(
      profileXml,
      "ProvisionedDevices",
      "json",
      label,
      true,
    ),
    ProvisionsAllDevices: extractProfileValue(
      profileXml,
      "ProvisionsAllDevices",
      "json",
      label,
      true,
    ),
  };
}

function verifyDistributionEntitlements(bundle, entitlements) {
  if (entitlements["com.apple.developer.team-identifier"] !== expectedTeam) {
    throw new Error(`${bundle.name} is not signed by expected team ${expectedTeam}`);
  }
  const expectedApplicationIdentifier = `${expectedTeam}.${bundle.bundleId}`;
  if (entitlements["application-identifier"] !== expectedApplicationIdentifier) {
    throw new Error(`${bundle.name} application identifier is not ${expectedApplicationIdentifier}`);
  }
  if (entitlements["get-task-allow"] !== false) {
    throw new Error(`${bundle.name} get-task-allow entitlement is not false`);
  }

  const familyControls = entitlements["com.apple.developer.family-controls"] === true;
  const appGroups = entitlements["com.apple.security.application-groups"];
  const hasAppGroup = Array.isArray(appGroups) && appGroups.includes(expectedAppGroup);
  if (bundle.screenTimeEntitlements && (!familyControls || !hasAppGroup)) {
    throw new Error(`${bundle.name} is missing signed Family Controls or App Group entitlements`);
  }
  if (!bundle.screenTimeEntitlements && (familyControls || hasAppGroup)) {
    throw new Error(`${bundle.name} carries unnecessary Screen Time entitlements`);
  }
}

function profileGroupAuthorizes(profileGroup, signedGroup) {
  if (profileGroup === signedGroup) return true;
  if (!profileGroup.endsWith(".*")) return false;
  return signedGroup.startsWith(profileGroup.slice(0, -1));
}

function verifyProvisioningProfile(bundle, profile, now, signedEntitlements) {
  if (!Array.isArray(profile?.TeamIdentifier)
      || profile.TeamIdentifier.length !== 1
      || profile.TeamIdentifier[0] !== expectedTeam) {
    throw new Error(`${bundle.name} provisioning profile is not for team ${expectedTeam}`);
  }
  if (!Array.isArray(profile.ApplicationIdentifierPrefix)
      || profile.ApplicationIdentifierPrefix.length !== 1
      || profile.ApplicationIdentifierPrefix[0] !== expectedTeam) {
    throw new Error(`${bundle.name} provisioning profile has the wrong application identifier prefix`);
  }
  const expiration = new Date(profile.ExpirationDate);
  if (Number.isNaN(expiration.getTime()) || expiration <= now) {
    throw new Error(`${bundle.name} provisioning profile is expired or has an invalid expiration date`);
  }
  if (profile.ProvisionedDevices !== undefined || profile.ProvisionsAllDevices === true) {
    throw new Error(`${bundle.name} does not use an App Store distribution provisioning profile`);
  }

  const entitlements = profile.Entitlements;
  if (!entitlements || typeof entitlements !== "object" || Array.isArray(entitlements)) {
    throw new Error(`${bundle.name} provisioning profile entitlements are malformed`);
  }
  const expectedApplicationIdentifier = `${expectedTeam}.${bundle.bundleId}`;
  const profileApplicationIdentifier = entitlements["application-identifier"];
  if (entitlements["com.apple.developer.team-identifier"] !== expectedTeam
      || (profileApplicationIdentifier !== expectedApplicationIdentifier
        && profileApplicationIdentifier !== `${expectedTeam}.*`)) {
    throw new Error(`${bundle.name} provisioning profile application identity is incorrect`);
  }
  if (entitlements["get-task-allow"] !== false) {
    throw new Error(`${bundle.name} provisioning profile get-task-allow is not false`);
  }
  if (entitlements["beta-reports-active"] !== true) {
    throw new Error(`${bundle.name} provisioning profile is not enabled for App Store beta reporting`);
  }
  const familyControls = entitlements["com.apple.developer.family-controls"] === true;
  const appGroups = entitlements["com.apple.security.application-groups"];
  const hasAppGroup = Array.isArray(appGroups) && appGroups.includes(expectedAppGroup);
  if (bundle.screenTimeEntitlements && (!familyControls || !hasAppGroup)) {
    throw new Error(`${bundle.name} provisioning profile is missing Family Controls or App Group access`);
  }
  if (!bundle.screenTimeEntitlements && (familyControls || hasAppGroup)) {
    throw new Error(`${bundle.name} provisioning profile carries unnecessary Screen Time access`);
  }

  const profileKeychainGroups = entitlements["keychain-access-groups"];
  if (!Array.isArray(profileKeychainGroups)
      || !profileKeychainGroups.some((group) => group.startsWith(`${expectedTeam}.`))
      || profileKeychainGroups.some(
        (group) => group !== "com.apple.token" && !group.startsWith(`${expectedTeam}.`),
      )) {
    throw new Error(`${bundle.name} provisioning profile has an unauthorized keychain access group`);
  }
  const signedKeychainGroups = signedEntitlements["keychain-access-groups"];
  if (signedKeychainGroups !== undefined && !Array.isArray(signedKeychainGroups)) {
    throw new Error(`${bundle.name} signed keychain access groups are malformed`);
  }
  for (const signedGroup of signedKeychainGroups || []) {
    if (!profileKeychainGroups.some((profileGroup) => profileGroupAuthorizes(profileGroup, signedGroup))) {
      throw new Error(`${bundle.name} signed keychain access group is not authorized by its profile`);
    }
  }
}

function verifyBundleIdentity(appBundle, decodeProvisioningProfile, now) {
  const pluginsDirectory = path.join(appBundle, "PlugIns");
  if (!existsSync(pluginsDirectory)) throw new Error("App is missing its PlugIns directory");
  const actualExtensions = readdirSync(pluginsDirectory)
    .filter((name) => name.endsWith(".appex"))
    .sort();
  const expectedExtensions = bundleDefinitions.slice(1).map(({ directory }) => directory).sort();
  if (JSON.stringify(actualExtensions) !== JSON.stringify(expectedExtensions)) {
    throw new Error(`embedded extensions are ${actualExtensions.join(", ") || "none"}; expected exactly ${expectedExtensions.join(", ")}`);
  }

  const bundles = bundleDefinitions.map((definition) => ({
    ...definition,
    path: definition.directory ? path.join(pluginsDirectory, definition.directory) : appBundle,
  }));
  for (const bundle of bundles) {
    const info = readPlist(path.join(bundle.path, "Info.plist"), `${bundle.name} Info.plist`);
    if (info.CFBundleIdentifier !== bundle.bundleId) {
      throw new Error(`${bundle.name} bundle id is ${info.CFBundleIdentifier || "missing"}, expected ${bundle.bundleId}`);
    }
    if (
      String(info.CFBundleShortVersionString) !== expectedVersion
      || String(info.CFBundleVersion) !== expectedBuild
    ) {
      throw new Error(`${bundle.name} is not version ${expectedVersion} build ${expectedBuild}`);
    }
    if (info.CFBundlePackageType !== bundle.packageType) {
      throw new Error(`${bundle.name} package type is ${info.CFBundlePackageType || "missing"}, expected ${bundle.packageType}`);
    }
    if (info.CFBundleExecutable !== bundle.executable) {
      throw new Error(`${bundle.name} executable is ${info.CFBundleExecutable || "missing"}, expected ${bundle.executable}`);
    }
    if (bundle.extensionPoint && info.NSExtension?.NSExtensionPointIdentifier !== bundle.extensionPoint) {
      throw new Error(`${bundle.name} has the wrong extension point`);
    }
    if (bundle.name === "App" && info.NSSupportsLiveActivities !== true) {
      throw new Error("App Info.plist does not enable NSSupportsLiveActivities");
    }
    const signedEntitlements = readEntitlements(bundle);
    verifyDistributionEntitlements(bundle, signedEntitlements);
    const profilePath = path.join(bundle.path, "embedded.mobileprovision");
    if (!existsSync(profilePath)) {
      throw new Error(`${bundle.name} embedded.mobileprovision is missing`);
    }
    verifyProvisioningProfile(
      bundle,
      decodeProvisioningProfile(profilePath, bundle),
      now,
      signedEntitlements,
    );
  }
  return bundles;
}

function verifyManifest(bundle) {
  const privacy = readPlist(
    path.join(bundle.path, "PrivacyInfo.xcprivacy"),
    `${bundle.name} PrivacyInfo.xcprivacy`,
  );
  const apiTypes = Array.isArray(privacy.NSPrivacyAccessedAPITypes)
    ? privacy.NSPrivacyAccessedAPITypes
    : [];
  const userDefaults = apiTypes.find(
    (entry) => entry.NSPrivacyAccessedAPIType === "NSPrivacyAccessedAPICategoryUserDefaults",
  );
  if (!Array.isArray(userDefaults?.NSPrivacyAccessedAPITypeReasons)
      || !userDefaults.NSPrivacyAccessedAPITypeReasons.includes("1C8F.1")) {
    throw new Error(`${bundle.name} does not declare App Group UserDefaults reason 1C8F.1`);
  }
}

function verifyPluginRegistry(appBundle) {
  const configPath = path.join(appBundle, "capacitor.config.json");
  if (!existsSync(configPath)) throw new Error("App is missing capacitor.config.json");
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    throw new Error("IPA capacitor.config.json is malformed");
  }
  if (config.appId !== "com.melchior.mrtapioca") {
    throw new Error("IPA Capacitor app id is incorrect");
  }
  if (Object.prototype.hasOwnProperty.call(config, "server")) {
    throw new Error("IPA Capacitor config contains a forbidden server configuration block");
  }
  const required = [
    "LocalNotificationsPlugin", "FocusShieldPlugin", "FocusActivityPlugin", "IAPPlugin",
  ].sort();
  const classes = Array.isArray(config.packageClassList) ? config.packageClassList : [];
  if (new Set(classes).size !== classes.length) {
    throw new Error("IPA Capacitor plugin registry contains duplicate registrations");
  }
  const actual = [...classes].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new Error(`IPA Capacitor plugin registry is ${actual.join(", ") || "empty"}; expected exactly ${required.join(", ")}`);
  }

  const appExecutable = path.join(appBundle, "App");
  if (!existsSync(appExecutable)) throw new Error("App executable is missing");
  const executable = readFileSync(appExecutable);
  for (const className of ["FocusShieldPlugin", "FocusActivityPlugin", "IAPPlugin"]) {
    if (!executable.includes(Buffer.from(className))) {
      throw new Error(`App executable does not contain required local plugin ${className}`);
    }
  }
  const notificationBinary = path.join(
    appBundle,
    "Frameworks",
    "CapacitorLocalNotifications.framework",
    "CapacitorLocalNotifications",
  );
  if (!existsSync(notificationBinary)) {
    throw new Error("App is missing CapacitorLocalNotifications.framework");
  }
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function relativeFiles(directory, prefix = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...relativeFiles(absolute, relative));
    // copy-web strips .DS_Store on the way into the bundle, so it is never a real
    // canonical file; a stray one in the repo must not fail the parity check.
    else if (entry.isFile() && entry.name !== ".DS_Store") files.push(relative);
  }
  return files;
}

function verifyCanonicalPublicParity(appBundle) {
  const packagedPublic = path.join(appBundle, "public");
  if (!existsSync(packagedPublic)) throw new Error("App is missing its public bundle");
  const canonicalAssets = path.join(repositoryRoot, "assets");
  const canonicalFiles = [
    ...PUBLIC_ROOT_FILES,
    PUBLIC_ENTRY.dest,   // index.html, built from app.html (the app); see copy-web.mjs
    ...relativeFiles(canonicalAssets).map((name) => path.join(PUBLIC_ASSET_DIRECTORY, name)),
  ];
  const expectedFiles = [...canonicalFiles, "cordova.js", "cordova_plugins.js"].sort();
  const packagedFiles = relativeFiles(packagedPublic).sort();
  const expectedSet = new Set(expectedFiles);
  const packagedSet = new Set(packagedFiles);
  const missing = expectedFiles.filter((name) => !packagedSet.has(name));
  const unexpected = packagedFiles.filter((name) => !expectedSet.has(name));
  if (missing.length > 0) {
    throw new Error(`IPA public bundle is missing expected files: ${missing.join(", ")}`);
  }
  if (unexpected.length > 0) {
    throw new Error(`IPA contains unexpected public files: ${unexpected.join(", ")}`);
  }

  for (const relative of canonicalFiles) {
    // The packaged index.html is built from app.html (the app); index.html in the
    // repo is the web landing page, so compare it against app.html.
    const canonicalRelative = relative === PUBLIC_ENTRY.dest ? PUBLIC_ENTRY.source : relative;
    const canonicalPath = path.join(repositoryRoot, canonicalRelative);
    const packagedPath = path.join(packagedPublic, relative);
    if (sha256(packagedPath) !== sha256(canonicalPath)) {
      throw new Error(`IPA public file ${relative} does not match canonical source`);
    }
  }
}

function verifyPoseArt(appBundle) {
  const poseDirectory = path.join(appBundle, "public", "assets", "poses");
  if (!existsSync(poseDirectory)) {
    throw new Error("App is missing packaged pose art at public/assets/poses");
  }
  for (const state of ["idle", "mixing", "sleeping", "shocked"]) {
    if (!existsSync(path.join(poseDirectory, `angel-${state}.png`))) {
      throw new Error(`App is missing required pose art angel-${state}.png`);
    }
  }
  const checks = [
    {
      tool: "check-pose-integrity.py",
      args: [poseDirectory],
      problem: "packaged pose art failed integrity checks",
    },
    {
      tool: "check-key-color-art.py",
      args: ["--max-component", "100", poseDirectory],
      problem: "packaged pose art contains a key-color leak",
    },
  ];
  for (const check of checks) {
    try {
      capture("python3", [path.join(toolRoot, check.tool), ...check.args], check.problem);
    } catch (error) {
      throw new Error(error.message);
    }
  }
  const canonicalNames = readdirSync(canonicalPoseDirectory)
    .filter((name) => name.toLowerCase().endsWith(".png"))
    .sort();
  for (const name of canonicalNames) {
    const packagedPath = path.join(poseDirectory, name);
    if (!existsSync(packagedPath) || sha256(packagedPath) !== sha256(path.join(canonicalPoseDirectory, name))) {
      throw new Error(`packaged pose ${name} does not match canonical source art`);
    }
  }
}

function verifyDistributionSignatureWithCodesign(bundle) {
  const described = spawnSync(
    "/usr/bin/codesign",
    ["-dv", "--verbose=4", bundle.path],
    { encoding: "utf8" },
  );
  if (described.error) throw described.error;
  const detail = `${described.stdout || ""}${described.stderr || ""}`;
  if (described.status !== 0) {
    throw new Error(`${bundle.name} signing identity could not be inspected: ${detail.trim()}`);
  }
  if (/^Signature=adhoc$/m.test(detail)) {
    throw new Error(`${bundle.name} has an ad-hoc signature, not an Apple distribution signature`);
  }
  if (!/^Authority=Apple Distribution:/m.test(detail)
      || !new RegExp(`^TeamIdentifier=${expectedTeam}$`, "m").test(detail)) {
    throw new Error(`${bundle.name} is not signed with the expected Apple Distribution identity`);
  }
}

function verifyCodeSignatures(bundles, verifyDistributionSignature) {
  for (const bundle of bundles) {
    run(
      "/usr/bin/codesign",
      ["--verify", "--strict", "--verbose=2", bundle.path],
      `${bundle.name} code signature verification`,
    );
    verifyDistributionSignature(bundle);
  }
  run(
    "/usr/bin/codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", bundles[0].path],
    "App deep code-signature verification",
  );
}

export function verifyIpaFile(ipaPath, {
  decodeProvisioningProfile = decodeProvisioningProfileWithSecurity,
  now = new Date(),
  verifyDistributionSignature = verifyDistributionSignatureWithCodesign,
} = {}) {
  if (!path.isAbsolute(ipaPath) || path.normalize(ipaPath) !== ipaPath || path.extname(ipaPath) !== ".ipa") {
    throw new Error("IPA must be one explicit normalized absolute .ipa path");
  }
  if (!existsSync(ipaPath) || !lstatSync(ipaPath).isFile() || lstatSync(ipaPath).isSymbolicLink()) {
    throw new Error(`IPA does not exist as a regular file: ${ipaPath}`);
  }
  validateZipEntries(ipaPath);
  const extractionDirectory = mkdtempSync(path.join(tmpdir(), "mrtap-ipa-verify-"));
  try {
    run("/usr/bin/ditto", ["-x", "-k", ipaPath, extractionDirectory], "IPA extraction");
    rejectSymlinks(extractionDirectory);
    const payload = path.join(extractionDirectory, "Payload");
    if (!existsSync(payload)) throw new Error("IPA is missing Payload");
    const apps = readdirSync(payload).filter((name) => name.endsWith(".app"));
    if (apps.length !== 1) {
      throw new Error(`IPA Payload contains ${apps.length} app bundles; expected exactly one`);
    }
    const appBundle = path.join(payload, apps[0]);
    const bundles = verifyBundleIdentity(appBundle, decodeProvisioningProfile, now);
    for (const bundle of bundles.filter(({ privacyManifest }) => privacyManifest)) {
      verifyManifest(bundle);
    }
    verifyPluginRegistry(appBundle);
    verifyPoseArt(appBundle);
    verifyCanonicalPublicParity(appBundle);
    verifyCodeSignatures(bundles, verifyDistributionSignature);
  } finally {
    rmSync(extractionDirectory, { recursive: true, force: true });
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === toolPath;
if (invokedDirectly) {
  if (!process.argv[2] || process.argv.length !== 3) {
    console.error("Usage: npm run ios:verify-ipa -- /absolute/path/App.ipa");
    process.exit(2);
  }
  try {
    verifyIpaFile(process.argv[2]);
    console.log("Verified distribution profiles and entitlements, exact extensions, privacy manifests, plugins, pose art, and canonical public bundle in IPA");
  } catch (error) {
    console.error(`IPA verification failed: ${error.message}`);
    process.exit(1);
  }
}
