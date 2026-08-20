const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const manifestPath = path.join(root, "ios", "App", "App", "PrivacyInfo.xcprivacy");
const projectPath = path.join(root, "ios", "App", "App.xcodeproj", "project.pbxproj");
const verifierPath = path.join(root, "tools", "verify-ios-archive.mjs");
const canonicalPoseBundle = path.join(root, "assets", "poses");
const fixtureEntitlementKey = "com.melchior.mrtapioca.archive-verifier-fixture";
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
    entitlements: path.join(root, "ios", "App", "App", "App.entitlements"),
  },
  {
    directory: "DeviceActivityMonitor.appex",
    executable: "DeviceActivityMonitor",
    id: "com.melchior.mrtapioca.DeviceActivityMonitor",
    packageType: "XPC!",
    extensionPoint: "com.apple.deviceactivity.monitor-extension",
    entitlements: path.join(root, "ios", "App", "DeviceActivityMonitor", "DeviceActivityMonitor.entitlements"),
  },
  {
    directory: "ShieldAction.appex",
    executable: "ShieldAction",
    id: "com.melchior.mrtapioca.ShieldAction",
    packageType: "XPC!",
    extensionPoint: "com.apple.ManagedSettings.shield-action-service",
    entitlements: path.join(root, "ios", "App", "ShieldAction", "ShieldAction.entitlements"),
  },
  {
    directory: "ShieldConfiguration.appex",
    executable: "ShieldConfiguration",
    id: "com.melchior.mrtapioca.ShieldConfiguration",
    packageType: "XPC!",
    extensionPoint: "com.apple.ManagedSettingsUI.shield-configuration-service",
    entitlements: path.join(root, "ios", "App", "ShieldConfiguration", "ShieldConfiguration.entitlements"),
  },
  {
    directory: "FocusWidgetExtension.appex",
    executable: "FocusWidgetExtension",
    id: "com.melchior.mrtapioca.FocusWidget",
    packageType: "XPC!",
    extensionPoint: "com.apple.widgetkit-extension",
  },
];

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function writeBundleInfo(bundlePath, fixture, build = "11", liveActivities = true) {
  const extension = fixture.extensionPoint
    ? `<key>NSExtension</key><dict><key>NSExtensionPointIdentifier</key><string>${xmlEscape(fixture.extensionPoint)}</string></dict>`
    : "";
  const liveActivitySupport = fixture.directory
    ? ""
    : `<key>NSSupportsLiveActivities</key>${liveActivities ? "<true/>" : "<false/>"}`;
  fs.writeFileSync(path.join(bundlePath, "Info.plist"), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    `<key>CFBundleExecutable</key><string>${xmlEscape(fixture.executable)}</string>`,
    `<key>CFBundleIdentifier</key><string>${xmlEscape(fixture.id)}</string>`,
    `<key>CFBundlePackageType</key><string>${xmlEscape(fixture.packageType)}</string>`,
    '<key>CFBundleShortVersionString</key><string>1.1.1</string>',
    `<key>CFBundleVersion</key><string>${xmlEscape(build)}</string>`,
    liveActivitySupport,
    extension,
    '</dict></plist>',
  ].join(""));
}

function writeArchiveInfo(archive, { creationDate = true } = {}) {
  fs.writeFileSync(path.join(archive, "Info.plist"), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    '<key>SchemeName</key><string>App</string>',
    creationDate ? '<key>CreationDate</key><date>2026-08-17T20:00:00Z</date>' : "",
    '<key>ApplicationProperties</key><dict>',
    '<key>ApplicationPath</key><string>Applications/App.app</string>',
    '<key>CFBundleIdentifier</key><string>com.melchior.mrtapioca</string>',
    '<key>CFBundleShortVersionString</key><string>1.1.1</string>',
    '<key>CFBundleVersion</key><string>11</string>',
    '</dict></dict></plist>',
  ].join(""));
}

function signBundle(bundlePath, entitlements) {
  const args = ["--force", "--sign", "-"];
  if (entitlements) args.push("--entitlements", entitlements);
  args.push(bundlePath);
  const signed = childProcess.spawnSync("/usr/bin/codesign", args, { encoding: "utf8" });
  assert.equal(signed.status, 0, signed.stdout + signed.stderr);
}

function writeFixtureEntitlements(pathname, screenTime) {
  const screenTimeEntries = screenTime
    ? [
      '<key>com.apple.developer.family-controls</key><true/>',
      '<key>com.apple.security.application-groups</key>',
      '<array><string>group.com.melchior.mrtapioca</string></array>',
    ]
    : [];
  fs.writeFileSync(pathname, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    `<key>${fixtureEntitlementKey}</key><true/>`,
    ...screenTimeEntries,
    '</dict></plist>',
  ].join(""));
}

function writeProfiledAdHocEntitlements(pathname, fixture) {
  fs.writeFileSync(pathname, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    '<key>application-identifier</key>',
    `<string>T6235QVFYG.${xmlEscape(fixture.id)}</string>`,
    '<key>com.apple.developer.team-identifier</key><string>T6235QVFYG</string>',
    '<key>get-task-allow</key><true/>',
    '</dict></plist>',
  ].join(""));
}

function makeFixtureExecutable(pathname, includePlugins = false) {
  const pluginStrings = includePlugins
    ? [
      '__attribute__((used)) static const char focus_shield[] = "FocusShieldPlugin";',
      '__attribute__((used)) static const char focus_activity[] = "FocusActivityPlugin";',
      '__attribute__((used)) static const char iap[] = "IAPPlugin";',
    ].join("\n")
    : "";
  const built = childProcess.spawnSync("/usr/bin/xcrun", ["clang", "-Os", "-x", "c", "-", "-o", pathname], {
    encoding: "utf8",
    input: `${pluginStrings}\nint main(void) { return 0; }\n`,
  });
  assert.equal(built.status, 0, built.stdout + built.stderr);
}
function makePose(pathname, { greenSize = 0, imageSize = 500 } = {}) {
  const result = childProcess.spawnSync("python3", [
    "-c",
    [
      "from PIL import Image",
      "import sys",
      "green = int(sys.argv[2])",
      "size = int(sys.argv[3])",
      "im = Image.new('RGBA', (size, size), (0, 0, 0, 0))",
      "if size >= 500:",
      " for y in range(70, 430):",
      "  for x in range(100, 400): im.putpixel((x, y), (92, 61, 46, 255))",
      "else:",
      " for y in range(size):",
      "  for x in range(size): im.putpixel((x, y), (92, 61, 46, 255))",
      "for y in range(102, 102 + green):",
      " for x in range(102, 102 + green): im.putpixel((x, y), (0, 255, 0, 255))",
      "im.save(sys.argv[1])",
    ].join("\n"),
    pathname,
    String(greenSize),
    String(imageSize),
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function resourcePhase(project, id) {
  const start = project.indexOf(`\t\t${id} /* Resources */ = {`);
  assert.notEqual(start, -1, `missing ${id} resources phase`);
  const end = project.indexOf("\n\t\t};", start);
  assert.notEqual(end, -1, `unterminated ${id} resources phase`);
  return project.slice(start, end);
}

function runIdentityValidation(source) {
  return childProcess.spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { validateSigningIdentity } from ${JSON.stringify(pathToFileURL(verifierPath).href)};\n${source}`,
    ],
    { encoding: "utf8" },
  );
}

test("iOS bundles declare App Group UserDefaults required-reason access", () => {
  const manifest = fs.readFileSync(manifestPath, "utf8");
  assert.match(manifest, /NSPrivacyAccessedAPICategoryUserDefaults/);
  assert.match(manifest, /<string>1C8F\.1<\/string>/);

  const project = fs.readFileSync(projectPath, "utf8");
  assert.match(resourcePhase(project, "504EC3021FED79650016851F"), /D4612D330001000000000002/);
  assert.match(resourcePhase(project, "BC11125C2FF34D5000A82015"), /D4612D330001000000000003/);
});

test("signing identity validation recognizes a consistent development archive", () => {
  const validated = runIdentityValidation(`
    const mode = validateSigningIdentity(
      { name: "FocusWidgetExtension", bundleId: "com.melchior.mrtapioca.FocusWidget" },
      {
        "application-identifier": "T6235QVFYG.com.melchior.mrtapioca.FocusWidget",
        "com.apple.developer.team-identifier": "T6235QVFYG",
        "get-task-allow": true,
      },
      {
        teamIdentifiers: ["T6235QVFYG"],
        entitlements: {
          "application-identifier": "T6235QVFYG.*",
          "com.apple.developer.team-identifier": "T6235QVFYG",
          "keychain-access-groups": ["T6235QVFYG.*", "com.apple.token"],
          "get-task-allow": true,
        },
      },
    );
    if (mode !== "development archive") throw new Error("wrong mode: " + mode);
  `);
  assert.equal(validated.status, 0, validated.stderr || validated.stdout);
});

test("signing identity validation rejects the wrong Apple team", () => {
  const validated = runIdentityValidation(`
    let rejected = false;
    try {
      validateSigningIdentity(
        { name: "App", bundleId: "com.melchior.mrtapioca" },
        {
          "application-identifier": "BADTEAM123.com.melchior.mrtapioca",
          "com.apple.developer.team-identifier": "BADTEAM123",
          "get-task-allow": true,
        },
        {
          teamIdentifiers: ["BADTEAM123"],
          entitlements: {
            "application-identifier": "BADTEAM123.*",
            "com.apple.developer.team-identifier": "BADTEAM123",
            "keychain-access-groups": ["BADTEAM123.*"],
            "get-task-allow": true,
          },
        },
      );
    } catch (error) {
      rejected = /team/i.test(error.message);
    }
    if (!rejected) throw new Error("wrong Apple team was accepted");
  `);
  assert.equal(validated.status, 0, validated.stderr || validated.stdout);
});

test("signing identity validation rejects profile and keychain identifier mismatches", () => {
  const validated = runIdentityValidation(`
    let appIdentifierRejected = false;
    try {
      validateSigningIdentity(
        { name: "App", bundleId: "com.melchior.mrtapioca" },
        {
          "application-identifier": "T6235QVFYG.com.melchior.mrtapioca",
          "com.apple.developer.team-identifier": "T6235QVFYG",
          "get-task-allow": true,
        },
        {
          teamIdentifiers: ["T6235QVFYG"],
          entitlements: {
            "application-identifier": "T6235QVFYG.com.example.other",
            "com.apple.developer.team-identifier": "T6235QVFYG",
            "keychain-access-groups": ["T6235QVFYG.*"],
            "get-task-allow": true,
          },
        },
      );
    } catch (error) {
      appIdentifierRejected = /application.identifier/i.test(error.message);
    }
    if (!appIdentifierRejected) throw new Error("profile application identifier mismatch was accepted");

    let unscopedWildcardRejected = false;
    try {
      validateSigningIdentity(
        { name: "App", bundleId: "com.melchior.mrtapioca" },
        {
          "application-identifier": "T6235QVFYG.com.melchior.mrtapioca",
          "com.apple.developer.team-identifier": "T6235QVFYG",
          "get-task-allow": true,
        },
        {
          teamIdentifiers: ["T6235QVFYG"],
          entitlements: {
            "application-identifier": "*",
            "com.apple.developer.team-identifier": "T6235QVFYG",
            "keychain-access-groups": ["T6235QVFYG.*"],
            "get-task-allow": true,
          },
        },
      );
    } catch (error) {
      unscopedWildcardRejected = /application.identifier/i.test(error.message);
    }
    if (!unscopedWildcardRejected) throw new Error("unscoped profile application wildcard was accepted");

    let keychainRejected = false;
    try {
      validateSigningIdentity(
        { name: "App", bundleId: "com.melchior.mrtapioca" },
        {
          "application-identifier": "T6235QVFYG.com.melchior.mrtapioca",
          "com.apple.developer.team-identifier": "T6235QVFYG",
          "keychain-access-groups": ["T6235QVFYG.private"],
          "get-task-allow": false,
        },
        {
          teamIdentifiers: ["T6235QVFYG"],
          entitlements: {
            "application-identifier": "T6235QVFYG.com.melchior.mrtapioca",
            "com.apple.developer.team-identifier": "T6235QVFYG",
            "keychain-access-groups": ["T6235QVFYG.allowed"],
            "get-task-allow": false,
          },
        },
      );
    } catch (error) {
      keychainRejected = /keychain/i.test(error.message);
    }
    if (!keychainRejected) throw new Error("unauthorized signed keychain group was accepted");
  `);
  assert.equal(validated.status, 0, validated.stderr || validated.stdout);
});

test("signing identity validation distinguishes non-development signing without claiming export", () => {
  const validated = runIdentityValidation(`
    const mode = validateSigningIdentity(
      { name: "App", bundleId: "com.melchior.mrtapioca" },
      {
        "application-identifier": "T6235QVFYG.com.melchior.mrtapioca",
        "com.apple.developer.team-identifier": "T6235QVFYG",
        "get-task-allow": false,
      },
      {
        teamIdentifiers: ["T6235QVFYG"],
        entitlements: {
          "application-identifier": "T6235QVFYG.com.melchior.mrtapioca",
          "com.apple.developer.team-identifier": "T6235QVFYG",
          "keychain-access-groups": ["T6235QVFYG.*", "com.apple.token"],
          "get-task-allow": false,
        },
      },
    );
    if (mode !== "non-development signing") throw new Error("wrong mode: " + mode);
  `);
  assert.equal(validated.status, 0, validated.stderr || validated.stdout);
});

test("archive verifier requires valid manifests in the app and monitor extension", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts["ios:verify-archive"], "node tools/verify-ios-archive.mjs");

  const archive = fs.mkdtempSync(path.join(os.tmpdir(), "mr-tapioca-archive-test-"));
  const appBundle = path.join(archive, "Products", "Applications", "App.app");
  const monitorBundle = path.join(appBundle, "PlugIns", "DeviceActivityMonitor.appex");
  const poseBundle = path.join(appBundle, "public", "assets", "poses");
  const plugInsBundle = path.join(appBundle, "PlugIns");
  fs.mkdirSync(plugInsBundle, { recursive: true });
  writeArchiveInfo(archive);
  for (const fixture of bundleFixtures) {
    const bundlePath = fixture.directory ? path.join(plugInsBundle, fixture.directory) : appBundle;
    fs.mkdirSync(bundlePath, { recursive: true });
    makeFixtureExecutable(path.join(bundlePath, fixture.executable), !fixture.directory);
    writeBundleInfo(bundlePath, fixture);
  }
  fs.copyFileSync(manifestPath, path.join(appBundle, "PrivacyInfo.xcprivacy"));

  try {
    const missingMonitor = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(missingMonitor.status, 0);
    assert.match(missingMonitor.stderr, /DeviceActivityMonitor/);

    fs.copyFileSync(manifestPath, path.join(monitorBundle, "PrivacyInfo.xcprivacy"));
    fs.writeFileSync(path.join(appBundle, "capacitor.config.json"), JSON.stringify({
      appId: "com.melchior.mrtapioca",
      packageClassList: [
        "LocalNotificationsPlugin", "FocusShieldPlugin", "FocusActivityPlugin", "IAPPlugin",
      ],
    }));
    const emptyEntitlements = path.join(archive, "empty.entitlements");
    fs.writeFileSync(emptyEntitlements, [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0"><dict></dict></plist>',
    ].join(""));
    const fixtureEntitlements = new Map();
    for (const fixture of bundleFixtures) {
      const fixturePath = path.join(archive, `${fixture.executable}.fixture.entitlements`);
      writeFixtureEntitlements(fixturePath, !!fixture.entitlements);
      fixtureEntitlements.set(fixture.id, fixturePath);
    }
    const appFixtureEntitlements = fixtureEntitlements.get(bundleFixtures[0].id);
    const notificationsFramework = path.join(
      appBundle, "Frameworks", "CapacitorLocalNotifications.framework",
    );
    fs.mkdirSync(notificationsFramework, { recursive: true });
    makeFixtureExecutable(path.join(notificationsFramework, "CapacitorLocalNotifications"));
    fs.writeFileSync(path.join(notificationsFramework, "Info.plist"), [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0"><dict>',
      '<key>CFBundleExecutable</key><string>CapacitorLocalNotifications</string>',
      '<key>CFBundleIdentifier</key><string>com.capacitorjs.plugins.localnotifications</string>',
      '<key>CFBundlePackageType</key><string>FMWK</string>',
      '</dict></plist>',
    ].join(""));
    signBundle(notificationsFramework, emptyEntitlements);
    for (const fixture of bundleFixtures.slice(1)) {
      const bundlePath = fixture.directory ? path.join(plugInsBundle, fixture.directory) : appBundle;
      signBundle(bundlePath, fixtureEntitlements.get(fixture.id));
    }
    signBundle(appBundle, appFixtureEntitlements);
    const missingArt = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(missingArt.status, 0);
    assert.match(missingArt.stderr, /pose|art/i);

    const publicBundle = path.join(appBundle, "public");
    fs.mkdirSync(publicBundle, { recursive: true });
    for (const name of publicRootFiles) {
      fs.copyFileSync(path.join(root, name), path.join(publicBundle, name));
    }
    fs.cpSync(path.join(root, "assets"), path.join(publicBundle, "assets"), { recursive: true });
    signBundle(appBundle, appFixtureEntitlements);
    const complete = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.equal(complete.status, 0, complete.stderr);

    writeArchiveInfo(archive, { creationDate: false });
    const missingCreationDate = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(missingCreationDate.status, 0);
    assert.match(missingCreationDate.stderr, /CreationDate|creation date/i);
    writeArchiveInfo(archive);

    const generatedCordovaFiles = ["cordova.js", "cordova_plugins.js"];
    for (const name of generatedCordovaFiles) {
      fs.writeFileSync(path.join(publicBundle, name), `// generated ${name}\n`);
    }
    signBundle(appBundle, appFixtureEntitlements);
    const generatedCordovaOnly = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.equal(generatedCordovaOnly.status, 0, generatedCordovaOnly.stderr);
    for (const name of generatedCordovaFiles) fs.rmSync(path.join(publicBundle, name));
    signBundle(appBundle, appFixtureEntitlements);

    const widgetFixture = bundleFixtures.at(-1);
    const widgetBundle = path.join(plugInsBundle, widgetFixture.directory);
    signBundle(widgetBundle, emptyEntitlements);
    signBundle(appBundle, appFixtureEntitlements);
    const unmarkedAdHoc = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(unmarkedAdHoc.status, 0);
    assert.match(unmarkedAdHoc.stderr, /fixture|profile|provisioning|signing identity/i);
    signBundle(widgetBundle, fixtureEntitlements.get(widgetFixture.id));
    signBundle(appBundle, appFixtureEntitlements);

    const profiledAdHocEntitlements = path.join(archive, "profiled-ad-hoc.entitlements");
    writeProfiledAdHocEntitlements(profiledAdHocEntitlements, widgetFixture);
    fs.writeFileSync(path.join(widgetBundle, "embedded.mobileprovision"), "not a CMS profile\n");
    signBundle(widgetBundle, profiledAdHocEntitlements);
    signBundle(appBundle, appFixtureEntitlements);
    const profiledAdHoc = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(profiledAdHoc.status, 0);
    assert.match(profiledAdHoc.stderr, /ad.hoc.*provisioning|provisioning.*ad.hoc/i);
    fs.rmSync(path.join(widgetBundle, "embedded.mobileprovision"));
    signBundle(widgetBundle, fixtureEntitlements.get(widgetFixture.id));
    signBundle(appBundle, appFixtureEntitlements);

    const unexpectedPublicFile = path.join(publicBundle, "unexpected-release-file.txt");
    fs.writeFileSync(unexpectedPublicFile, "must not ship\n");
    signBundle(appBundle, appFixtureEntitlements);
    const unexpectedPublic = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(unexpectedPublic.status, 0);
    assert.match(unexpectedPublic.stderr, /unexpected-release-file|unexpected public/i);
    fs.rmSync(unexpectedPublicFile);
    signBundle(appBundle, appFixtureEntitlements);

    fs.writeFileSync(path.join(appBundle, "capacitor.config.json"), JSON.stringify({
      appId: "com.melchior.mrtapioca",
      server: { url: "https://example.invalid" },
      packageClassList: [
        "LocalNotificationsPlugin", "FocusShieldPlugin", "FocusActivityPlugin", "IAPPlugin",
      ],
    }));
    signBundle(appBundle, appFixtureEntitlements);
    const liveReloadConfig = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(liveReloadConfig.status, 0);
    assert.match(liveReloadConfig.stderr, /server|live.reload|Capacitor config/i);
    fs.writeFileSync(path.join(appBundle, "capacitor.config.json"), JSON.stringify({
      appId: "com.melchior.mrtapioca",
      packageClassList: [
        "LocalNotificationsPlugin", "FocusShieldPlugin", "FocusActivityPlugin", "IAPPlugin",
      ],
    }));
    signBundle(appBundle, appFixtureEntitlements);

    fs.writeFileSync(path.join(appBundle, "capacitor.config.json"), JSON.stringify({
      appId: "com.melchior.mrtapioca",
      packageClassList: [
        "LocalNotificationsPlugin", "FocusShieldPlugin", "FocusActivityPlugin", "IAPPlugin",
        "IAPPlugin",
      ],
    }));
    signBundle(appBundle, appFixtureEntitlements);
    const duplicatePlugin = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(duplicatePlugin.status, 0);
    assert.match(duplicatePlugin.stderr, /duplicate|plugin registry/i);
    fs.writeFileSync(path.join(appBundle, "capacitor.config.json"), JSON.stringify({
      appId: "com.melchior.mrtapioca",
      packageClassList: [
        "LocalNotificationsPlugin", "FocusShieldPlugin", "FocusActivityPlugin", "IAPPlugin",
      ],
    }));
    signBundle(appBundle, appFixtureEntitlements);

    writeBundleInfo(appBundle, bundleFixtures[0], "11", false);
    signBundle(appBundle, appFixtureEntitlements);
    const liveActivitiesDisabled = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(liveActivitiesDisabled.status, 0);
    assert.match(liveActivitiesDisabled.stderr, /NSSupportsLiveActivities|Live Activities/i);
    writeBundleInfo(appBundle, bundleFixtures[0]);
    signBundle(appBundle, appFixtureEntitlements);

    writeBundleInfo(appBundle, bundleFixtures[0], "8");
    const wrongBuild = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(wrongBuild.status, 0);
    assert.match(wrongBuild.stderr, /build 11|version/i);
    writeBundleInfo(appBundle, bundleFixtures[0]);

    fs.writeFileSync(path.join(appBundle, "capacitor.config.json"), JSON.stringify({
      appId: "com.melchior.mrtapioca",
      packageClassList: ["LocalNotificationsPlugin", "FocusShieldPlugin", "FocusActivityPlugin"],
    }));
    const missingPlugin = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(missingPlugin.status, 0);
    assert.match(missingPlugin.stderr, /IAPPlugin|plugin registry/i);
    fs.writeFileSync(path.join(appBundle, "capacitor.config.json"), JSON.stringify({
      appId: "com.melchior.mrtapioca",
      packageClassList: [
        "LocalNotificationsPlugin", "FocusShieldPlugin", "FocusActivityPlugin", "IAPPlugin",
      ],
    }));

    fs.appendFileSync(path.join(publicBundle, "styles.css"), "\n/* stale archive fixture */\n");
    const staleShell = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(staleShell.status, 0);
    assert.match(staleShell.stderr, /styles\.css|canonical|match|stale/i);
    fs.copyFileSync(path.join(root, "styles.css"), path.join(publicBundle, "styles.css"));

    fs.copyFileSync(
      path.join(poseBundle, "angel-idle.png"),
      path.join(poseBundle, "angel-mixing.png"),
    );
    const staleArt = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(staleArt.status, 0);
    assert.match(staleArt.stderr, /canonical|match|stale|pixel-identical|integrity/i);
    fs.copyFileSync(
      path.join(canonicalPoseBundle, "angel-mixing.png"),
      path.join(poseBundle, "angel-mixing.png"),
    );

    fs.copyFileSync(
      path.join(poseBundle, "base-idle.png"),
      path.join(poseBundle, "royal-idle.png"),
    );
    const wrongSkinArt = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(wrongSkinArt.status, 0);
    assert.match(wrongSkinArt.stderr, /royal-idle.*(?:identity|accessory|off-model)/i);
    fs.copyFileSync(
      path.join(canonicalPoseBundle, "royal-idle.png"),
      path.join(poseBundle, "royal-idle.png"),
    );

    makePose(path.join(poseBundle, "angel-mixing.png"), { imageSize: 24 });
    const malformedArt = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(malformedArt.status, 0);
    assert.match(malformedArt.stderr, /pose|art|500|RGBA/i);

    makePose(path.join(poseBundle, "angel-mixing.png"), { greenSize: 11 });
    const keyedArt = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(keyedArt.status, 0);
    assert.match(keyedArt.stderr, /pose|art|green/i);

    const animated = childProcess.spawnSync("python3", [
      "-c",
      [
        "from PIL import Image",
        "import sys",
        "first = Image.open(sys.argv[1]).convert('RGBA')",
        "second = Image.new('RGBA', first.size, (0, 255, 0, 255))",
        "first.save(sys.argv[2], save_all=True, append_images=[second], duration=100, loop=0, format='PNG')",
      ].join("\n"),
      path.join(canonicalPoseBundle, "angel-mixing.png"),
      path.join(poseBundle, "angel-mixing.png"),
    ], { encoding: "utf8" });
    assert.equal(animated.status, 0, animated.stderr);
    const animatedArt = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(animatedArt.status, 0);
    assert.match(animatedArt.stderr, /frame|static|animated/i);

    fs.copyFileSync(
      path.join(canonicalPoseBundle, "angel-mixing.png"),
      path.join(poseBundle, "angel-mixing.png"),
    );
    const shieldAction = path.join(plugInsBundle, "ShieldAction.appex");
    signBundle(shieldAction);
    const missingEntitlements = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(missingEntitlements.status, 0);
    assert.match(missingEntitlements.stderr, /Family Controls|App Group|entitlements/i);
  } finally {
    fs.rmSync(archive, { recursive: true, force: true });
  }
});
