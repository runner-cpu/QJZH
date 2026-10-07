/* Local fallback metadata. The Pages build replaces this file with immutable deployment data. */
(function (root) {
  "use strict";
  root.BUILD_INFO = Object.freeze({
    // Keep release, deployment, model, and rules identities separate. The
    // Pages builder replaces this file with immutable values for the deployed
    // artifact; these local values make reports and diagnostics explicit too.
    releaseVersion: "20261007",
    deploymentVersion: "dev",
    modelVersion: "1.0.0",
    rulesVersion: "knowledgeBase.js@1.0.0",
    rulesFingerprint: "sha256:f08ef4a6d02ae435fa8bef03403e85d947d07553cde752f7904734460eaff111",
    // Backward-compatible alias used by older integrations.
    version: "dev",
    commit: "local",
    builtAt: null,
    environment: "local"
  });
})(typeof window !== "undefined" ? window : globalThis);
