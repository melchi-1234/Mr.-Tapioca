const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const exporterUrl = pathToFileURL(path.join(root, "tools", "export-ios-release.mjs")).href;
const ipaVerifierPath = path.join(root, "tools", "verify-ios-ipa.mjs");
const ipaVerifierUrl = pathToFileURL(ipaVerifierPath).href;
const privacyManifestPath = path.join(root, "ios", "App", "App", "PrivacyInfo.xcprivacy");
const publicRootFiles = [
  "index.html", "styles.css", "app.js", "config.js", "squad-cloud.js",
  "metrics.js", "analytics.js", "notifications.js", "reward-config.js",
  "reward-v2.js", "sw.js", "manifest.json",
];
const bundleFixtures = [
  {
    directory: "",
    executable: "App",
    id: "com.melchior.mrtapioca",
    packageType: "APPL",
    screenTime: true,
  },
  {
    directory: "DeviceActivityMonitor.appex",
    executable: "DeviceActivityMonitor",
    id: "com.melchior.mrtapioca.DeviceActivityMonitor",
    packageType: "XPC!",
    extensionPoint: "com.apple.deviceactivity.monitor-extension",
    screenTime: true,
    appGroup: true,
  },
  {
    directory: "ShieldAction.appex",
    executable: "ShieldAction",
    id: "com.melchior.mrtapioca.ShieldAction",
    packageType: "XPC!",
    extensionPoint: "com.apple.ManagedSettings.shield-action-service",
    screenTime: true,
    appGroup: true,
  },
  {
    directory: "ShieldConfiguration.appex",
    executable: "ShieldConfiguration",
    id: "com.melchior.mrtapioca.ShieldConfiguration",
    packageType: "XPC!",
    extensionPoint: "com.apple.ManagedSettingsUI.shield-configuration-service",
    screenTime: true,
    appGroup: true,
  },
  {
    directory: "FocusWidgetExtension.appex",
    executable: "FocusWidgetExtension",
    id: "com.melchior.mrtapioca.FocusWidget",
    packageType: "XPC!",
    extensionPoint: "com.apple.widgetkit-extension",
    // 1.2.0: the Home Screen widget reads shared UserDefaults, so it has the App
    // Group but deliberately NOT Family Controls. The two are separate flags here
    // for the same reason they are separate in the verifiers.
    screenTime: false,
    appGroup: true,
  },
];

function readPlist(plistPath) {
  const parsed = childProcess.spawnSync(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", plistPath],
    { encoding: "utf8" },
  );
  assert.equal(parsed.status, 0, parsed.stderr);
  return JSON.parse(parsed.stdout);
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function writeInfo(bundlePath, fixture, {
  version = "1.2.0",
  build = "14",
  supportsLiveActivities = true,
} = {}) {
  const extension = fixture.extensionPoint
    ? `<key>NSExtension</key><dict><key>NSExtensionPointIdentifier</key><string>${xmlEscape(fixture.extensionPoint)}</string></dict>`
    : "";
  const liveActivities = fixture.directory === ""
    ? `<key>NSSupportsLiveActivities</key><${supportsLiveActivities ? "true" : "false"}/>`
    : "";
  fs.writeFileSync(path.join(bundlePath, "Info.plist"), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    `<key>CFBundleExecutable</key><string>${xmlEscape(fixture.executable)}</string>`,
    `<key>CFBundleIdentifier</key><string>${xmlEscape(fixture.id)}</string>`,
    `<key>CFBundlePackageType</key><string>${xmlEscape(fixture.packageType)}</string>`,
    `<key>CFBundleShortVersionString</key><string>${xmlEscape(version)}</string>`,
    `<key>CFBundleVersion</key><string>${xmlEscape(build)}</string>`,
    extension,
    liveActivities,
    '</dict></plist>',
  ].join(""));
}

function writeEntitlements(entitlementsPath, fixture, teamId = "T6235QVFYG", getTaskAllow = false) {
  const familyControls = fixture.screenTime
    ? '<key>com.apple.developer.family-controls</key><true/>'
    : "";
  const appGroup = (fixture.appGroup ?? fixture.screenTime)
    ? [
      '<key>com.apple.security.application-groups</key>',
      '<array><string>group.com.melchior.mrtapioca</string></array>',
    ].join("")
    : "";
  const screenTime = familyControls + appGroup;
  fs.writeFileSync(entitlementsPath, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    `<key>application-identifier</key><string>${xmlEscape(`${teamId}.${fixture.id}`)}</string>`,
    `<key>com.apple.developer.team-identifier</key><string>${xmlEscape(teamId)}</string>`,
    `<key>get-task-allow</key><${getTaskAllow ? "true" : "false"}/>`,
    screenTime,
    '</dict></plist>',
  ].join(""));
}

function makeExecutable(pathname, includePlugins = false) {
  const pluginStrings = includePlugins
    ? [
      '__attribute__((used)) static const char focus_shield[] = "FocusShieldPlugin";',
      '__attribute__((used)) static const char focus_activity[] = "FocusActivityPlugin";',
      '__attribute__((used)) static const char iap[] = "IAPPlugin";',
      '__attribute__((used)) static const char widget_stats[] = "WidgetStatsPlugin";',
    ].join("\n")
    : "";
  const built = childProcess.spawnSync(
    "/usr/bin/xcrun",
    ["clang", "-Os", "-x", "c", "-", "-o", pathname],
    { encoding: "utf8", input: `${pluginStrings}\nint main(void) { return 0; }\n` },
  );
  assert.equal(built.status, 0, built.stdout + built.stderr);
}

function signBundle(bundlePath, entitlementsPath) {
  const args = ["--force", "--sign", "-"];
  if (entitlementsPath) args.push("--entitlements", entitlementsPath);
  args.push(bundlePath);
  const signed = childProcess.spawnSync("/usr/bin/codesign", args, { encoding: "utf8" });
  assert.equal(signed.status, 0, signed.stdout + signed.stderr);
}

function makeTestProvisioningProfile(bundle, overrides = {}) {
  const screenTimeEntitlements = {
    ...(bundle.familyControls ? { "com.apple.developer.family-controls": true } : {}),
    ...(bundle.appGroup
      ? { "com.apple.security.application-groups": ["group.com.melchior.mrtapioca"] }
      : {}),
  };
  const profile = {
    TeamIdentifier: ["T6235QVFYG"],
    ApplicationIdentifierPrefix: ["T6235QVFYG"],
    ExpirationDate: "2099-08-17T00:00:00Z",
    Entitlements: {
      "application-identifier": bundle.name === "FocusWidgetExtension"
        ? "T6235QVFYG.*"
        : `T6235QVFYG.${bundle.bundleId}`,
      "beta-reports-active": true,
      "com.apple.developer.team-identifier": "T6235QVFYG",
      "get-task-allow": false,
      "keychain-access-groups": ["T6235QVFYG.*", "com.apple.token"],
      ...screenTimeEntitlements,
    },
  };
  return {
    ...profile,
    ...overrides,
    Entitlements: {
      ...profile.Entitlements,
      ...(overrides.Entitlements || {}),
    },
  };
}

function verifyWithTestProfiles(verifyIpaFile, ipaPath, decodeProvisioningProfile) {
  return verifyIpaFile(ipaPath, {
    decodeProvisioningProfile: decodeProvisioningProfile
      || ((_profilePath, bundle) => makeTestProvisioningProfile(bundle)),
    now: new Date("2026-08-17T00:00:00Z"),
    verifyDistributionSignature() {},
  });
}

function makeIpaFixture(t, {
  teamId = "T6235QVFYG",
  getTaskAllow = false,
  extraExtension = false,
  version = "1.2.0",
  build = "14",
  tamperPublic = false,
  extraPublic = false,
  duplicatePlugin = false,
  serverConfig = false,
  supportsLiveActivities = true,
  wrongSkinPose = false,
} = {}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mrtap-ipa-verifier-"));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const payload = path.join(fixtureRoot, "Payload");
  const appBundle = path.join(payload, "App.app");
  const plugins = path.join(appBundle, "PlugIns");
  fs.mkdirSync(plugins, { recursive: true });
  const entitlementsByExecutable = new Map();

  for (const fixture of bundleFixtures) {
    const bundlePath = fixture.directory ? path.join(plugins, fixture.directory) : appBundle;
    fs.mkdirSync(bundlePath, { recursive: true });
    writeInfo(bundlePath, fixture, { version, build, supportsLiveActivities });
    makeExecutable(path.join(bundlePath, fixture.executable), fixture.directory === "");
    const entitlements = path.join(fixtureRoot, `${fixture.executable}.entitlements`);
    writeEntitlements(entitlements, fixture, teamId, getTaskAllow);
    entitlementsByExecutable.set(fixture.executable, entitlements);
    fs.writeFileSync(
      path.join(bundlePath, "embedded.mobileprovision"),
      "test placeholder; accepted only through the injected profile decoder",
    );
  }

  if (extraExtension) {
    fs.mkdirSync(path.join(plugins, "Unexpected.appex"));
  }

  fs.copyFileSync(privacyManifestPath, path.join(appBundle, "PrivacyInfo.xcprivacy"));
  fs.copyFileSync(
    privacyManifestPath,
    path.join(plugins, "DeviceActivityMonitor.appex", "PrivacyInfo.xcprivacy"),
  );
  const capacitorConfig = {
    appId: "com.melchior.mrtapioca",
    packageClassList: [
      "LocalNotificationsPlugin", "FocusShieldPlugin", "FocusActivityPlugin", "IAPPlugin",
        "WidgetStatsPlugin",
    ],
  };
  if (duplicatePlugin) capacitorConfig.packageClassList.push("IAPPlugin");
  if (serverConfig) capacitorConfig.server = { url: "https://stale.invalid" };
  fs.writeFileSync(path.join(appBundle, "capacitor.config.json"), JSON.stringify(capacitorConfig));

  const publicBundle = path.join(appBundle, "public");
  fs.mkdirSync(publicBundle);
  for (const name of publicRootFiles) {
    // The native bundle's index.html is built from app.html (index.html in the
    // repo is the web landing page), mirroring copy-web.mjs.
    const source = name === "index.html" ? "app.html" : name;
    fs.copyFileSync(path.join(root, source), path.join(publicBundle, name));
  }
  fs.writeFileSync(path.join(publicBundle, "cordova.js"), "");
  fs.writeFileSync(path.join(publicBundle, "cordova_plugins.js"), "");
  fs.cpSync(path.join(root, "assets"), path.join(publicBundle, "assets"), { recursive: true });
  if (wrongSkinPose) {
    const poses = path.join(publicBundle, "assets", "poses");
    fs.copyFileSync(path.join(poses, "base-idle.png"), path.join(poses, "royal-idle.png"));
  }
  if (tamperPublic) fs.appendFileSync(path.join(publicBundle, "app.js"), "\n// stale export fixture\n");
  if (extraPublic) fs.writeFileSync(path.join(publicBundle, "stale-build-output.js"), "stale");

  const framework = path.join(appBundle, "Frameworks", "CapacitorLocalNotifications.framework");
  fs.mkdirSync(framework, { recursive: true });
  makeExecutable(path.join(framework, "CapacitorLocalNotifications"));
  fs.writeFileSync(path.join(framework, "Info.plist"), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    '<key>CFBundleExecutable</key><string>CapacitorLocalNotifications</string>',
    '<key>CFBundleIdentifier</key><string>com.capacitorjs.plugins.localnotifications</string>',
    '<key>CFBundlePackageType</key><string>FMWK</string>',
    '</dict></plist>',
  ].join(""));
  signBundle(framework);

  for (const fixture of bundleFixtures.slice(1)) {
    signBundle(path.join(plugins, fixture.directory), entitlementsByExecutable.get(fixture.executable));
  }
  signBundle(appBundle, entitlementsByExecutable.get(bundleFixtures[0].executable));

  const ipaPath = path.join(fixtureRoot, "App.ipa");
  const packed = childProcess.spawnSync(
    "/usr/bin/ditto",
    ["-c", "-k", "--keepParent", payload, ipaPath],
    { encoding: "utf8" },
  );
  assert.equal(packed.status, 0, packed.stdout + packed.stderr);
  return ipaPath;
}

test("controlled export verifies the exact archive, exports without uploading, verifies the one IPA, and publishes it", async (t) => {
  const { exportIosRelease } = await import(exporterUrl);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mrtap-export-workflow-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const archivePath = path.join(fixture, "Mr-Tapioca-1.2.0-14.xcarchive");
  const outputPath = path.join(fixture, "Mr-Tapioca-1.2.0-14.ipa");
  fs.mkdirSync(archivePath);

  const commands = [];
  let exportOptions;
  const result = exportIosRelease({
    archiveArgument: archivePath,
    outputArgument: outputPath,
    logger: { log() {}, error() {} },
    runCommand(command, args, label) {
      commands.push({ command, args: [...args], label });
      if (label === "Signed IPA export") {
        const exportPath = args[args.indexOf("-exportPath") + 1];
        const optionsPath = args[args.indexOf("-exportOptionsPlist") + 1];
        exportOptions = readPlist(optionsPath);
        fs.writeFileSync(path.join(exportPath, "App.ipa"), "verified-export-fixture");
      }
    },
  });

  assert.deepEqual(commands.map(({ label }) => label), [
    "Archive verification",
    "Signed IPA export",
    "IPA verification",
  ]);
  assert.equal(commands[0].command, process.execPath);
  assert.equal(commands[0].args.at(-1), archivePath);
  assert.equal(commands[1].command, "/usr/bin/xcodebuild");
  assert.deepEqual(commands[1].args.slice(0, 3), ["-exportArchive", "-archivePath", archivePath]);
  assert.ok(commands[1].args.includes("-exportPath"));
  assert.ok(commands[1].args.includes("-exportOptionsPlist"));
  assert.ok(!commands[1].args.includes("-uploadArchive"), "the controlled export must not upload");
  assert.deepEqual(exportOptions, {
    destination: "export",
    manageAppVersionAndBuildNumber: false,
    method: "app-store-connect",
    teamID: "T6235QVFYG",
  });
  assert.equal(commands[2].command, process.execPath);
  assert.match(commands[2].args[0], /verify-ios-ipa\.mjs$/);
  assert.match(commands[2].args[1], /App\.ipa$/);
  assert.equal(fs.readFileSync(outputPath, "utf8"), "verified-export-fixture");
  assert.equal(result.outputPath, outputPath);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
});

test("IPA verifier accepts a signed 1.2.0 build 14 package with the canonical app payload", async (t) => {
  const { verifyIpaFile } = await import(ipaVerifierUrl);
  const ipaPath = makeIpaFixture(t);
  assert.doesNotThrow(() => verifyWithTestProfiles(verifyIpaFile, ipaPath));
});

test("a failed archive, export, or IPA verification gate never publishes an IPA", async (t) => {
  const { exportIosRelease } = await import(exporterUrl);
  const cases = [
    { failAt: "Archive verification", expectedLabels: ["Archive verification"] },
    { failAt: "Signed IPA export", expectedLabels: ["Archive verification", "Signed IPA export"] },
    {
      failAt: "IPA verification",
      expectedLabels: ["Archive verification", "Signed IPA export", "IPA verification"],
    },
  ];

  for (const fixtureCase of cases) {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mrtap-export-gate-"));
    t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
    const archivePath = path.join(fixture, "App.xcarchive");
    const outputPath = path.join(fixture, "App.ipa");
    fs.mkdirSync(archivePath);
    const labels = [];

    assert.throws(() => exportIosRelease({
      archiveArgument: archivePath,
      outputArgument: outputPath,
      logger: { log() {}, error() {} },
      runCommand(_command, args, label) {
        labels.push(label);
        if (label === "Signed IPA export" && fixtureCase.failAt !== label) {
          const exportPath = args[args.indexOf("-exportPath") + 1];
          fs.writeFileSync(path.join(exportPath, "App.ipa"), "fixture");
        }
        if (label === fixtureCase.failAt) throw new Error(`${label} fixture failure`);
      },
    }), new RegExp(`${fixtureCase.failAt} fixture failure`));
    assert.deepEqual(labels, fixtureCase.expectedLabels);
    assert.equal(fs.existsSync(outputPath), false, `${fixtureCase.failAt} published an unverified IPA`);
  }
});

test("ambiguous Xcode output is refused before IPA verification", async (t) => {
  const { exportIosRelease } = await import(exporterUrl);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mrtap-export-ambiguous-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const archivePath = path.join(fixture, "App.xcarchive");
  const outputPath = path.join(fixture, "App.ipa");
  fs.mkdirSync(archivePath);
  const labels = [];

  assert.throws(() => exportIosRelease({
    archiveArgument: archivePath,
    outputArgument: outputPath,
    logger: { log() {}, error() {} },
    runCommand(_command, args, label) {
      labels.push(label);
      if (label === "Signed IPA export") {
        const exportPath = args[args.indexOf("-exportPath") + 1];
        fs.writeFileSync(path.join(exportPath, "App.ipa"), "first");
        fs.writeFileSync(path.join(exportPath, "Other.ipa"), "second");
      }
    },
  }), /produced 2 IPA files; expected exactly one/);
  assert.deepEqual(labels, ["Archive verification", "Signed IPA export"]);
  assert.equal(fs.existsSync(outputPath), false);
});

test("IPA verifier rejects the wrong signing team before accepting a distribution package", async (t) => {
  const { verifyIpaFile } = await import(ipaVerifierUrl);
  const ipaPath = makeIpaFixture(t, { teamId: "WRONGTEAM1" });
  assert.throws(
    () => verifyWithTestProfiles(verifyIpaFile, ipaPath),
    /expected team T6235QVFYG/,
  );
});

test("IPA verifier rejects a package whose signed get-task-allow entitlement is true", async (t) => {
  const { verifyIpaFile } = await import(ipaVerifierUrl);
  const ipaPath = makeIpaFixture(t, { getTaskAllow: true });
  assert.throws(
    () => verifyWithTestProfiles(verifyIpaFile, ipaPath),
    /get-task-allow entitlement is not false/,
  );
});

test("IPA verifier rejects any extension beyond the four release extensions", async (t) => {
  const { verifyIpaFile } = await import(ipaVerifierUrl);
  const ipaPath = makeIpaFixture(t, { extraExtension: true });
  assert.throws(
    () => verifyWithTestProfiles(verifyIpaFile, ipaPath),
    /Unexpected\.appex|expected exactly/,
  );
});

test("IPA verifier rejects any app or extension outside version 1.2.0 build 14", async (t) => {
  const { verifyIpaFile } = await import(ipaVerifierUrl);
  const ipaPath = makeIpaFixture(t, { build: "8" });
  assert.throws(
    () => verifyWithTestProfiles(verifyIpaFile, ipaPath),
    /version 1\.2\.0 build 14/,
  );
});

test("IPA verifier rejects a stale public bundle even when it is signed", async (t) => {
  const { verifyIpaFile } = await import(ipaVerifierUrl);
  const ipaPath = makeIpaFixture(t, { tamperPublic: true });
  assert.throws(
    () => verifyWithTestProfiles(verifyIpaFile, ipaPath),
    /app\.js does not match canonical source/,
  );
});

test("IPA verifier rejects a valid PNG containing the wrong named skin", async (t) => {
  const { verifyIpaFile } = await import(ipaVerifierUrl);
  const ipaPath = makeIpaFixture(t, { wrongSkinPose: true });
  assert.throws(
    () => verifyWithTestProfiles(verifyIpaFile, ipaPath),
    /royal-idle.*(?:identity|accessory|off-model)/i,
  );
});

test("IPA verifier rejects extra stale files in the packaged public bundle", async (t) => {
  const { verifyIpaFile } = await import(ipaVerifierUrl);
  const ipaPath = makeIpaFixture(t, { extraPublic: true });
  assert.throws(
    () => verifyWithTestProfiles(verifyIpaFile, ipaPath),
    /stale-build-output\.js|unexpected public/i,
  );
});

test("IPA verifier rejects a duplicate Capacitor plugin registration", async (t) => {
  const { verifyIpaFile } = await import(ipaVerifierUrl);
  const ipaPath = makeIpaFixture(t, { duplicatePlugin: true });
  assert.throws(
    () => verifyWithTestProfiles(verifyIpaFile, ipaPath),
    /duplicate|plugin registry/i,
  );
});

test("IPA verifier rejects a packaged Capacitor server configuration", async (t) => {
  const { verifyIpaFile } = await import(ipaVerifierUrl);
  const ipaPath = makeIpaFixture(t, { serverConfig: true });
  assert.throws(
    () => verifyWithTestProfiles(verifyIpaFile, ipaPath),
    /server configuration|server block/i,
  );
});

test("IPA verifier requires Live Activities support in the main app Info.plist", async (t) => {
  const { verifyIpaFile } = await import(ipaVerifierUrl);
  const ipaPath = makeIpaFixture(t, { supportsLiveActivities: false });
  assert.throws(
    () => verifyWithTestProfiles(verifyIpaFile, ipaPath),
    /NSSupportsLiveActivities|Live Activities/i,
  );
});

test("direct IPA verification refuses forged signed entitlement strings without authentic profiles", (t) => {
  const ipaPath = makeIpaFixture(t);
  const verified = childProcess.spawnSync(process.execPath, [ipaVerifierPath, ipaPath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /embedded\.mobileprovision|provisioning profile/i);
});

test("default IPA verification rejects ad-hoc signatures even with otherwise valid profile data", async (t) => {
  const { verifyIpaFile } = await import(ipaVerifierUrl);
  const ipaPath = makeIpaFixture(t);
  assert.throws(() => verifyIpaFile(ipaPath, {
    decodeProvisioningProfile: (_profilePath, bundle) => makeTestProvisioningProfile(bundle),
    now: new Date("2026-08-17T00:00:00Z"),
  }), /ad-hoc signature|Apple Distribution identity/i);
});

test("IPA verifier validates profile team, app identity, expiration, and distribution entitlements", async (t) => {
  const { verifyIpaFile } = await import(ipaVerifierUrl);
  const ipaPath = makeIpaFixture(t);
  const cases = [
    {
      mutate(profile) { return { ...profile, TeamIdentifier: ["WRONGTEAM1"] }; },
      message: /profile is not for team T6235QVFYG/,
    },
    {
      mutate(profile) {
        return {
          ...profile,
          Entitlements: {
            ...profile.Entitlements,
            "application-identifier": "T6235QVFYG.com.melchior.wrong",
          },
        };
      },
      message: /profile application identity is incorrect/,
    },
    {
      mutate(profile) { return { ...profile, ExpirationDate: "2025-01-01T00:00:00Z" }; },
      message: /profile is expired|invalid expiration/i,
    },
    {
      mutate(profile) {
        return {
          ...profile,
          Entitlements: { ...profile.Entitlements, "get-task-allow": true },
        };
      },
      message: /profile get-task-allow is not false/,
    },
    {
      mutate(profile) { return { ...profile, ProvisionedDevices: ["device-id"] }; },
      message: /App Store distribution provisioning profile/,
    },
    {
      mutate(profile) {
        return {
          ...profile,
          Entitlements: {
            ...profile.Entitlements,
            "keychain-access-groups": ["WRONGTEAM1.*"],
          },
        };
      },
      message: /keychain access group/i,
    },
    {
      // Stripping Family Controls must be caught on the four bundles that need it.
      // The widget legitimately has none, so this mutation is a no-op there and the
      // failure has to come from one of the others.
      mutate(profile) {
        return {
          ...profile,
          Entitlements: {
            ...profile.Entitlements,
            "com.apple.developer.family-controls": false,
          },
        };
      },
      message: /profile.*Family Controls/i,
    },
    {
      // And the new half: a bundle that is supposed to reach the App Group must be
      // rejected when its profile does not authorize it. Without this the widget
      // could ship signed for a group it cannot actually open, and the only symptom
      // would be a widget stuck on placeholders.
      mutate(profile) {
        const next = { ...profile.Entitlements };
        delete next["com.apple.security.application-groups"];
        return { ...profile, Entitlements: next };
      },
      message: /profile is missing App Group access/i,
    },
  ];

  for (const fixtureCase of cases) {
    assert.throws(() => verifyWithTestProfiles(
      verifyIpaFile,
      ipaPath,
      (_profilePath, bundle) => fixtureCase.mutate(makeTestProvisioningProfile(bundle)),
    ), fixtureCase.message);
  }
});

test("controlled export preserves an existing destination without running commands", async (t) => {
  const { exportIosRelease } = await import(exporterUrl);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mrtap-export-existing-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const archivePath = path.join(fixture, "App.xcarchive");
  const outputPath = path.join(fixture, "App.ipa");
  fs.mkdirSync(archivePath);
  fs.writeFileSync(outputPath, "keep-me");
  let commandCount = 0;

  assert.throws(() => exportIosRelease({
    archiveArgument: archivePath,
    outputArgument: outputPath,
    logger: { log() {}, error() {} },
    runCommand() { commandCount += 1; },
  }), /Refusing to overwrite/);
  assert.equal(commandCount, 0);
  assert.equal(fs.readFileSync(outputPath, "utf8"), "keep-me");
});

test("controlled export refuses relative or extra CLI paths before any release operation", async () => {
  const { exportIosRelease } = await import(exporterUrl);
  assert.throws(() => exportIosRelease({
    archiveArgument: "App.xcarchive",
    outputArgument: "/tmp/App.ipa",
  }), /explicit absolute path/);

  const invoked = childProcess.spawnSync(process.execPath, [
    path.join(root, "tools", "export-ios-release.mjs"),
    "/tmp/App.xcarchive",
    "/tmp/App.ipa",
    "/tmp/ambiguous.ipa",
  ], { cwd: root, encoding: "utf8" });
  assert.equal(invoked.status, 2);
  assert.match(invoked.stderr, /Usage:/);
});
