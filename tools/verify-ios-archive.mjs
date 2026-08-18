import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PUBLIC_ASSET_DIRECTORY, PUBLIC_ROOT_FILES } from "./public-bundle-manifest.mjs";

const toolPath = fileURLToPath(import.meta.url);
const invokedAsScript = Boolean(process.argv[1])
  && path.resolve(process.argv[1]) === toolPath;
const archiveArgument = invokedAsScript ? process.argv[2] : undefined;

if (invokedAsScript && !archiveArgument) {
  console.error("Usage: npm run ios:verify-archive -- /path/to/App.xcarchive");
  process.exit(1);
}

const archivePath = archiveArgument ? path.resolve(archiveArgument) : undefined;
const appBundle = archivePath
  ? path.join(archivePath, "Products", "Applications", "App.app")
  : undefined;
const toolRoot = path.dirname(toolPath);
const repositoryRoot = path.resolve(toolRoot, "..");
const canonicalPoseDirectory = path.join(repositoryRoot, "assets", "poses");
const expectedVersion = "1.1.1";
const expectedBuild = "10";
const expectedTeamIdentifier = "T6235QVFYG";
const fixtureEntitlementKey = "com.melchior.mrtapioca.archive-verifier-fixture";
const bundles = appBundle ? [
  {
    name: "App",
    path: appBundle,
    bundleId: "com.melchior.mrtapioca",
    packageType: "APPL",
    privacyManifest: true,
    screenTimeEntitlements: true,
    liveActivities: true,
  },
  {
    name: "DeviceActivityMonitor",
    path: path.join(appBundle, "PlugIns", "DeviceActivityMonitor.appex"),
    bundleId: "com.melchior.mrtapioca.DeviceActivityMonitor",
    packageType: "XPC!",
    extensionPoint: "com.apple.deviceactivity.monitor-extension",
    privacyManifest: true,
    screenTimeEntitlements: true,
  },
  {
    name: "ShieldAction",
    path: path.join(appBundle, "PlugIns", "ShieldAction.appex"),
    bundleId: "com.melchior.mrtapioca.ShieldAction",
    packageType: "XPC!",
    extensionPoint: "com.apple.ManagedSettings.shield-action-service",
    screenTimeEntitlements: true,
  },
  {
    name: "ShieldConfiguration",
    path: path.join(appBundle, "PlugIns", "ShieldConfiguration.appex"),
    bundleId: "com.melchior.mrtapioca.ShieldConfiguration",
    packageType: "XPC!",
    extensionPoint: "com.apple.ManagedSettingsUI.shield-configuration-service",
    screenTimeEntitlements: true,
  },
  {
    name: "FocusWidgetExtension",
    path: path.join(appBundle, "PlugIns", "FocusWidgetExtension.appex"),
    bundleId: "com.melchior.mrtapioca.FocusWidget",
    packageType: "XPC!",
    extensionPoint: "com.apple.widgetkit-extension",
    screenTimeEntitlements: false,
  },
] : [];

function readPlist(plistPath, label) {
  if (!existsSync(plistPath)) throw new Error(`${label} is missing`);
  const converted = spawnSync(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", plistPath],
    { encoding: "utf8" },
  );
  if (converted.status !== 0) {
    throw new Error(`${label} is malformed`);
  }
  return JSON.parse(converted.stdout);
}

function verifyManifest(bundle) {
  const manifestPath = path.join(bundle.path, "PrivacyInfo.xcprivacy");
  const privacy = readPlist(manifestPath, `${bundle.name} PrivacyInfo.xcprivacy`);

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

function verifyBundleIdentity() {
  const archiveInfoPath = path.join(archivePath, "Info.plist");
  if (!existsSync(archiveInfoPath)) throw new Error("archive Info.plist is missing");
  const schemeResult = spawnSync(
    "/usr/bin/plutil",
    ["-extract", "SchemeName", "raw", archiveInfoPath],
    { encoding: "utf8" },
  );
  const creationDateResult = spawnSync(
    "/usr/bin/plutil",
    ["-extract", "CreationDate", "raw", archiveInfoPath],
    { encoding: "utf8" },
  );
  const propertiesResult = spawnSync(
    "/usr/bin/plutil",
    ["-extract", "ApplicationProperties", "json", "-o", "-", archiveInfoPath],
    { encoding: "utf8" },
  );
  if (schemeResult.status !== 0 || propertiesResult.status !== 0) {
    throw new Error("archive Info.plist is missing SchemeName or ApplicationProperties");
  }
  const creationDate = creationDateResult.stdout.trim();
  if (creationDateResult.status !== 0 || Number.isNaN(Date.parse(creationDate))) {
    throw new Error("archive Info.plist is missing a valid CreationDate");
  }
  const schemeName = schemeResult.stdout.trim();
  if (schemeName !== "App") {
    throw new Error(`archive SchemeName is ${schemeName || "missing"}, expected App`);
  }
  const archivedApp = JSON.parse(propertiesResult.stdout);
  if (archivedApp.ApplicationPath !== "Applications/App.app") {
    throw new Error(`archive ApplicationPath is ${archivedApp.ApplicationPath || "missing"}, expected Applications/App.app`);
  }
  if (archivedApp.CFBundleIdentifier !== bundles[0].bundleId
      || String(archivedApp.CFBundleShortVersionString) !== expectedVersion
      || String(archivedApp.CFBundleVersion) !== expectedBuild) {
    throw new Error(`archive metadata does not identify Mr. Tapioca ${expectedVersion} build ${expectedBuild}`);
  }

  const plugInsDirectory = path.join(appBundle, "PlugIns");
  if (!existsSync(plugInsDirectory)) throw new Error("App is missing its PlugIns directory");
  const actualExtensions = readdirSync(plugInsDirectory)
    .filter((name) => name.endsWith(".appex"))
    .sort();
  const expectedExtensions = bundles.slice(1).map((bundle) => path.basename(bundle.path)).sort();
  if (JSON.stringify(actualExtensions) !== JSON.stringify(expectedExtensions)) {
    throw new Error(`embedded extensions are ${actualExtensions.join(", ") || "none"}; expected exactly ${expectedExtensions.join(", ")}`);
  }

  for (const bundle of bundles) {
    const info = readPlist(path.join(bundle.path, "Info.plist"), `${bundle.name} Info.plist`);
    if (info.CFBundleIdentifier !== bundle.bundleId) {
      throw new Error(`${bundle.name} bundle id is ${info.CFBundleIdentifier || "missing"}, expected ${bundle.bundleId}`);
    }
    if (String(info.CFBundleShortVersionString) !== expectedVersion
        || String(info.CFBundleVersion) !== expectedBuild) {
      throw new Error(`${bundle.name} is not version ${expectedVersion} build ${expectedBuild}`);
    }
    if (info.CFBundlePackageType !== bundle.packageType) {
      throw new Error(`${bundle.name} package type is ${info.CFBundlePackageType || "missing"}, expected ${bundle.packageType}`);
    }
    if (bundle.extensionPoint
        && info.NSExtension?.NSExtensionPointIdentifier !== bundle.extensionPoint) {
      throw new Error(`${bundle.name} has the wrong extension point`);
    }
    if (bundle.liveActivities && info.NSSupportsLiveActivities !== true) {
      throw new Error(`${bundle.name} must set NSSupportsLiveActivities=true`);
    }
  }
}

function readEntitlements(bundle) {
  const extracted = spawnSync(
    "/usr/bin/codesign",
    ["-d", "--entitlements", ":-", bundle.path],
    { encoding: "utf8" },
  );
  if (extracted.status !== 0 || !extracted.stdout.trim()) {
    throw new Error(`${bundle.name} has no readable code-signing entitlements`);
  }
  const converted = spawnSync(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", "-"],
    { encoding: "utf8", input: extracted.stdout },
  );
  if (converted.status !== 0) {
    throw new Error(`${bundle.name} code-signing entitlements are malformed`);
  }
  return JSON.parse(converted.stdout);
}

function hasAdHocSignature(bundle) {
  const described = spawnSync(
    "/usr/bin/codesign",
    ["-d", "--verbose=4", bundle.path],
    { encoding: "utf8" },
  );
  return described.status === 0
    && /(?:^|\n)Signature=adhoc(?:\n|$)/.test(`${described.stdout || ""}${described.stderr || ""}`);
}

function identifierAllows(allowedIdentifier, signedIdentifier) {
  if (allowedIdentifier === signedIdentifier) return true;
  return typeof allowedIdentifier === "string"
    && allowedIdentifier.endsWith("*")
    && signedIdentifier.startsWith(allowedIdentifier.slice(0, -1));
}

export function validateSigningIdentity(bundle, signedEntitlements, profile) {
  const expectedApplicationIdentifier = `${expectedTeamIdentifier}.${bundle.bundleId}`;
  const signedTeam = signedEntitlements["com.apple.developer.team-identifier"];
  if (signedTeam !== expectedTeamIdentifier) {
    throw new Error(`${bundle.name} signed Apple team is ${signedTeam || "missing"}, expected ${expectedTeamIdentifier}`);
  }
  const signedApplicationIdentifier = signedEntitlements["application-identifier"];
  if (signedApplicationIdentifier !== expectedApplicationIdentifier) {
    throw new Error(`${bundle.name} signed application-identifier is ${signedApplicationIdentifier || "missing"}, expected ${expectedApplicationIdentifier}`);
  }

  if (!Array.isArray(profile.teamIdentifiers)
      || profile.teamIdentifiers.length !== 1
      || profile.teamIdentifiers[0] !== expectedTeamIdentifier) {
    throw new Error(`${bundle.name} provisioning profile has the wrong Apple team`);
  }
  const profileEntitlements = profile.entitlements;
  if (!profileEntitlements || typeof profileEntitlements !== "object") {
    throw new Error(`${bundle.name} provisioning profile has no readable entitlements`);
  }
  if (profileEntitlements["com.apple.developer.team-identifier"] !== expectedTeamIdentifier) {
    throw new Error(`${bundle.name} provisioning-profile entitlements have the wrong Apple team`);
  }
  const profileApplicationIdentifier = profileEntitlements["application-identifier"];
  if (typeof profileApplicationIdentifier !== "string"
      || !profileApplicationIdentifier.startsWith(`${expectedTeamIdentifier}.`)
      || !identifierAllows(profileApplicationIdentifier, signedApplicationIdentifier)) {
    throw new Error(`${bundle.name} provisioning profile does not authorize signed application-identifier ${signedApplicationIdentifier}`);
  }

  const profileKeychainGroups = profileEntitlements["keychain-access-groups"];
  if (!Array.isArray(profileKeychainGroups)
      || !profileKeychainGroups.some((group) => identifierAllows(group, expectedApplicationIdentifier))) {
    throw new Error(`${bundle.name} provisioning profile has no keychain access group for Apple team ${expectedTeamIdentifier}`);
  }
  const unexpectedProfileKeychainGroup = profileKeychainGroups.find((group) => (
    group !== "com.apple.token"
    && (typeof group !== "string" || !group.startsWith(`${expectedTeamIdentifier}.`))
  ));
  if (unexpectedProfileKeychainGroup !== undefined) {
    throw new Error(`${bundle.name} provisioning profile has keychain group for the wrong Apple team`);
  }

  const signedKeychainGroups = signedEntitlements["keychain-access-groups"];
  if (signedKeychainGroups !== undefined && !Array.isArray(signedKeychainGroups)) {
    throw new Error(`${bundle.name} signed keychain-access-groups entitlement is malformed`);
  }
  const unauthorizedKeychainGroup = signedKeychainGroups?.find((signedGroup) => (
    !profileKeychainGroups.some((profileGroup) => identifierAllows(profileGroup, signedGroup))
  ));
  if (unauthorizedKeychainGroup !== undefined) {
    throw new Error(`${bundle.name} signed keychain group ${unauthorizedKeychainGroup} is not authorized by its provisioning profile`);
  }

  const signedGetTaskAllow = signedEntitlements["get-task-allow"];
  const profileGetTaskAllow = profileEntitlements["get-task-allow"];
  if (typeof signedGetTaskAllow !== "boolean" || typeof profileGetTaskAllow !== "boolean") {
    throw new Error(`${bundle.name} signing identity is missing a boolean get-task-allow entitlement`);
  }
  if (signedGetTaskAllow !== profileGetTaskAllow) {
    throw new Error(`${bundle.name} signed get-task-allow does not match its provisioning profile`);
  }
  return signedGetTaskAllow ? "development archive" : "non-development signing";
}

function extractProvisioningProfileValue(decodedProfile, key, bundle) {
  const extracted = spawnSync(
    "/usr/bin/plutil",
    ["-extract", key, "json", "-o", "-", "-"],
    { encoding: "utf8", input: decodedProfile },
  );
  if (extracted.status !== 0 || !extracted.stdout.trim()) {
    throw new Error(`${bundle.name} embedded provisioning profile is missing ${key}`);
  }
  try {
    return JSON.parse(extracted.stdout);
  } catch {
    throw new Error(`${bundle.name} embedded provisioning profile has malformed ${key}`);
  }
}

function readProvisioningProfile(bundle) {
  const profilePath = path.join(bundle.path, "embedded.mobileprovision");
  const decoded = spawnSync(
    "/usr/bin/security",
    ["cms", "-D", "-i", profilePath],
    { encoding: "utf8" },
  );
  if (decoded.status !== 0 || !decoded.stdout.trim()) {
    throw new Error(`${bundle.name} embedded provisioning profile is not a readable CMS profile`);
  }
  return {
    teamIdentifiers: extractProvisioningProfileValue(
      decoded.stdout,
      "TeamIdentifier",
      bundle,
    ),
    entitlements: extractProvisioningProfileValue(
      decoded.stdout,
      "Entitlements",
      bundle,
    ),
  };
}

function verifyEntitlements() {
  const signingModes = new Set();
  for (const bundle of bundles) {
    const entitlements = readEntitlements(bundle);
    const familyControls = entitlements["com.apple.developer.family-controls"] === true;
    const appGroups = entitlements["com.apple.security.application-groups"];
    const hasAppGroup = Array.isArray(appGroups)
      && appGroups.includes("group.com.melchior.mrtapioca");
    if (bundle.screenTimeEntitlements && (!familyControls || !hasAppGroup)) {
      throw new Error(`${bundle.name} is missing signed Family Controls or App Group entitlements`);
    }
    if (!bundle.screenTimeEntitlements && (familyControls || hasAppGroup)) {
      throw new Error(`${bundle.name} carries unnecessary Screen Time entitlements`);
    }
    const profilePath = path.join(bundle.path, "embedded.mobileprovision");
    const fixtureSigned = entitlements[fixtureEntitlementKey] === true;
    if (existsSync(profilePath) && fixtureSigned) {
      throw new Error(`${bundle.name} carries a test-fixture entitlement alongside a provisioning profile`);
    }
    if (existsSync(profilePath)) {
      if (hasAdHocSignature(bundle)) {
        throw new Error(`${bundle.name} has an embedded provisioning profile but is signed ad hoc`);
      }
      signingModes.add(validateSigningIdentity(
        bundle,
        entitlements,
        readProvisioningProfile(bundle),
      ));
    } else {
      if (!fixtureSigned || !hasAdHocSignature(bundle)) {
        throw new Error(`${bundle.name} has no embedded provisioning profile and is not explicitly fixture-signed ad hoc`);
      }
      signingModes.add("explicit ad-hoc test fixture");
    }
  }
  if (signingModes.size !== 1) {
    throw new Error(`archive mixes signing modes: ${[...signingModes].join(", ")}`);
  }
  return [...signingModes][0];
}

function verifyPluginRegistry() {
  const configPath = path.join(appBundle, "capacitor.config.json");
  if (!existsSync(configPath)) throw new Error("App is missing capacitor.config.json");
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    throw new Error("archived capacitor.config.json is malformed");
  }
  if (config.appId !== "com.melchior.mrtapioca") {
    throw new Error("archived Capacitor app id is incorrect");
  }
  if (Object.prototype.hasOwnProperty.call(config, "server")) {
    throw new Error("archived Capacitor config contains a server block (live reload must not ship)");
  }
  const classes = Array.isArray(config.packageClassList) ? config.packageClassList : [];
  const required = [
    "LocalNotificationsPlugin", "FocusShieldPlugin", "FocusActivityPlugin", "IAPPlugin",
  ].sort();
  if (new Set(classes).size !== classes.length) {
    throw new Error("archived Capacitor plugin registry contains duplicate entries");
  }
  const actual = [...classes].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new Error(`archived Capacitor plugin registry is ${actual.join(", ") || "empty"}; expected exactly ${required.join(", ")}`);
  }

  const executablePath = path.join(appBundle, "App");
  if (!existsSync(executablePath)) throw new Error("App executable is missing");
  const executable = readFileSync(executablePath);
  for (const className of ["FocusShieldPlugin", "FocusActivityPlugin", "IAPPlugin"]) {
    if (!executable.includes(Buffer.from(className))) {
      throw new Error(`App executable does not contain required local plugin ${className}`);
    }
  }
  const notificationsBinary = path.join(
    appBundle,
    "Frameworks",
    "CapacitorLocalNotifications.framework",
    "CapacitorLocalNotifications",
  );
  if (!existsSync(notificationsBinary)) {
    throw new Error("App is missing CapacitorLocalNotifications.framework");
  }
}

function verifyCodeSignatures() {
  for (const bundle of bundles) {
    const verified = spawnSync(
      "/usr/bin/codesign",
      ["--verify", "--strict", "--verbose=2", bundle.path],
      { encoding: "utf8" },
    );
    if (verified.status !== 0) {
      const detail = `${verified.stdout || ""}${verified.stderr || ""}`.trim();
      throw new Error(`${bundle.name} code signature is invalid${detail ? `: ${detail}` : ""}`);
    }
  }
  const deep = spawnSync(
    "/usr/bin/codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", appBundle],
    { encoding: "utf8" },
  );
  if (deep.status !== 0) {
    const detail = `${deep.stdout || ""}${deep.stderr || ""}`.trim();
    throw new Error(`App deep code-signature verification failed${detail ? `: ${detail}` : ""}`);
  }
}

function verifyPoseArt() {
  const poseDirectory = path.join(appBundle, "public", "assets", "poses");
  if (!existsSync(poseDirectory)) {
    throw new Error("App is missing packaged pose art at public/assets/poses");
  }

  for (const state of ["idle", "mixing", "sleeping", "shocked"]) {
    const angelPose = path.join(poseDirectory, `angel-${state}.png`);
    if (!existsSync(angelPose)) {
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
    const checked = spawnSync("python3", [path.join(toolRoot, check.tool), ...check.args], {
      encoding: "utf8",
    });
    if (checked.status !== 0) {
      const detail = `${checked.stdout || ""}${checked.stderr || ""}`.trim();
      throw new Error(`${check.problem}${detail ? `: ${detail}` : ""}`);
    }
  }

  if (!existsSync(canonicalPoseDirectory)) {
    throw new Error("canonical source pose directory is missing at assets/poses");
  }
  const canonicalNames = readdirSync(canonicalPoseDirectory)
    .filter((name) => name.toLowerCase().endsWith(".png"))
    .sort();
  for (const name of canonicalNames) {
    const packagedPath = path.join(poseDirectory, name);
    const canonicalPath = path.join(canonicalPoseDirectory, name);
    if (!existsSync(packagedPath)) {
      throw new Error(`packaged pose art is missing canonical file ${name}`);
    }
    const packagedHash = createHash("sha256").update(readFileSync(packagedPath)).digest("hex");
    const canonicalHash = createHash("sha256").update(readFileSync(canonicalPath)).digest("hex");
    if (packagedHash !== canonicalHash) {
      throw new Error(`packaged pose ${name} does not match canonical source art`);
    }
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
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function verifyCanonicalPublicParity() {
  const archivedPublic = path.join(appBundle, "public");
  const canonicalAssets = path.join(repositoryRoot, "assets");
  const expected = [
    ...PUBLIC_ROOT_FILES,
    ...relativeFiles(canonicalAssets).map((name) => path.join(PUBLIC_ASSET_DIRECTORY, name)),
  ];
  const expectedSet = new Set(expected);
  const allowedGenerated = new Set(["cordova.js", "cordova_plugins.js"]);
  const unexpected = relativeFiles(archivedPublic)
    .filter((relative) => !expectedSet.has(relative) && !allowedGenerated.has(relative));
  if (unexpected.length) {
    throw new Error(`archive public bundle contains unexpected public file(s): ${unexpected.join(", ")}`);
  }

  for (const relative of expected) {
    const canonicalPath = path.join(repositoryRoot, relative);
    const archivedPath = path.join(archivedPublic, relative);
    if (!existsSync(archivedPath)) {
      throw new Error(`archive public bundle is missing canonical file ${relative}`);
    }
    if (sha256(archivedPath) !== sha256(canonicalPath)) {
      throw new Error(`archived public file ${relative} does not match canonical source`);
    }
  }
}

if (invokedAsScript) {
  try {
    verifyBundleIdentity();
    for (const bundle of bundles.filter((entry) => entry.privacyManifest)) verifyManifest(bundle);
    const signingMode = verifyEntitlements();
    verifyPluginRegistry();
    verifyPoseArt();
    verifyCanonicalPublicParity();
    verifyCodeSignatures();
    console.log(`Verified privacy manifests, pose integrity, canonical public-bundle parity, and ${signingMode} identity in the iOS archive`);
    if (signingMode === "development archive") {
      console.log("This is a development-signed archive; App Store distribution identity and get-task-allow=false must be verified again after export.");
    } else if (signingMode === "non-development signing") {
      console.log("The embedded profile and signed entitlements are consistent, but this archive check does not prove App Store export eligibility; verify the exported package separately.");
    }
  } catch (error) {
    console.error(`Archive verification failed: ${error.message}`);
    process.exit(1);
  }
}
