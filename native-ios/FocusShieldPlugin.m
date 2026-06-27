#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers the Swift plugin with Capacitor under the name "FocusShield",
// so the web app can call window.Capacitor.Plugins.FocusShield.*
// Goes in the MAIN app target alongside FocusShieldPlugin.swift.
CAP_PLUGIN(FocusShieldPlugin, "FocusShield",
    CAP_PLUGIN_METHOD(requestAuthorization, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(pickApps, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(startBlocking, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stopBlocking, CAPPluginReturnPromise);
)
