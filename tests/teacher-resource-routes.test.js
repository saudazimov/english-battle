const test = require("node:test");
const assert = require("node:assert/strict");
const registerTeacherResourceRoutes = require(
  "../src/routes/teacherResourceRoutes"
);

test("teacher resource registrar preserves route order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const dependencies = {
    uploadResource: { marker: "upload" },
    uploadedContentMatches: () => {},
    removeUploadedFile: () => {},
    sanitizeText: () => {},
    detectFileType: () => {},
    logAudit: () => {},
    resourceAbsolutePath: () => {},
  };
  const factory = (name) => (args) => {
    calls.push([name, args]);
    return name + "-router";
  };
  const routeFactories = {
    upload: factory("upload"),
    list: factory("list"),
    download: factory("download"),
    remove: factory("remove"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerTeacherResourceRoutes({
    app,
    ...dependencies,
    routeFactories,
  });

  assert.deepEqual(mounted, [
    "upload-router",
    "list-router",
    "download-router",
    "remove-router",
  ]);
  assert.deepEqual(calls, [
    [
      "upload",
      {
        uploadResource: dependencies.uploadResource,
        uploadedContentMatches: dependencies.uploadedContentMatches,
        removeUploadedFile: dependencies.removeUploadedFile,
        sanitizeText: dependencies.sanitizeText,
        detectFileType: dependencies.detectFileType,
        logAudit: dependencies.logAudit,
      },
    ],
    ["list", undefined],
    ["download", { resourceAbsolutePath: dependencies.resourceAbsolutePath }],
    [
      "remove",
      {
        resourceAbsolutePath: dependencies.resourceAbsolutePath,
        logAudit: dependencies.logAudit,
      },
    ],
  ]);
});
