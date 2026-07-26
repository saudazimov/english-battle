const path = require("path");

function createResourceAbsolutePath({ rootDir, pathModule = path }) {
  return function resourceAbsolutePath(storedPath) {
    const value = String(storedPath || "");
    if (value.startsWith("/uploads/resources/")) {
      return pathModule.join(rootDir, "public", value);
    }
    return pathModule.join(rootDir, "uploads/resources", pathModule.basename(value));
  };
}

const resourceAbsolutePath = createResourceAbsolutePath({
  rootDir: path.resolve(__dirname, "../.."),
});

module.exports = { createResourceAbsolutePath, resourceAbsolutePath };
