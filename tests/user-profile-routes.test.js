const test = require("node:test");
const assert = require("node:assert/strict");

const userProfileRoutes = require("../src/routes/userProfileRoutes");

test("user profile routes preserve phased mounts and dependencies", () => {
  const calls = [];
  const app = {
    use(router) {
      calls.push(["mount", router]);
    },
  };
  const pool = {};
  const upload = {};
  const uploadedContentMatches = () => true;
  const removeUploadedFile = () => {};
  const uploadsDirectory = "C:/app/public/uploads";
  const factories = {
    createPublicProfile(dependencies) {
      calls.push(["public", dependencies]);
      return "public-profile-router";
    },
    createProfileUpdate(dependencies) {
      calls.push(["update", dependencies]);
      return "profile-update-router";
    },
    createProfilePicture(dependencies) {
      calls.push(["picture", dependencies]);
      return "profile-picture-router";
    },
  };

  userProfileRoutes.registerPublicRoutes({ app, pool, factories });
  userProfileRoutes.registerPictureRoutes({
    app,
    upload,
    uploadedContentMatches,
    removeUploadedFile,
    uploadsDirectory,
    factories,
  });

  assert.deepEqual(calls, [
    ["public", { pool }],
    ["mount", "public-profile-router"],
    ["update", { pool }],
    ["mount", "profile-update-router"],
    ["picture", {
      upload,
      uploadedContentMatches,
      removeUploadedFile,
      uploadsDirectory,
    }],
    ["mount", "profile-picture-router"],
  ]);
});
