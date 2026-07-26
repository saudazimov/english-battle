const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  createResourceAbsolutePath,
  resourceAbsolutePath: defaultResourceAbsolutePath,
} = require("../src/utils/resourceAbsolutePath");

const resourceAbsolutePath = createResourceAbsolutePath({
  rootDir: "C:\\project",
  pathModule: path.win32,
});

test("resource absolute path preserves public upload resolution", () => {
  assert.equal(
    resourceAbsolutePath("/uploads/resources/book.pdf"),
    "C:\\project\\public\\uploads\\resources\\book.pdf"
  );
});

test("resource absolute path preserves legacy upload resolution", () => {
  assert.equal(
    resourceAbsolutePath("uploads/resources/book.pdf"),
    "C:\\project\\uploads\\resources\\book.pdf"
  );
});

test("resource absolute path preserves basename confinement", () => {
  assert.equal(
    resourceAbsolutePath("../../outside/secret.txt"),
    "C:\\project\\uploads\\resources\\secret.txt"
  );
});

test("resource absolute path preserves empty-value resolution", () => {
  assert.equal(resourceAbsolutePath(null), "C:\\project\\uploads\\resources");
});

test("resource absolute path default export preserves the project root", () => {
  assert.equal(
    defaultResourceAbsolutePath("/uploads/resources/book.pdf"),
    path.join(path.resolve(__dirname, ".."), "public", "/uploads/resources/book.pdf")
  );
});
