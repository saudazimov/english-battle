const test = require("node:test");
const assert = require("node:assert/strict");

const { filterProfanity } = require("../src/utils/profanityFilter");

test("profanity filter preserves falsy and clean values", () => {
  assert.equal(filterProfanity(undefined), undefined);
  assert.equal(filterProfanity(null), null);
  assert.equal(filterProfanity(""), "");
  assert.equal(filterProfanity("Salom, dunyo!"), "Salom, dunyo!");
});

test("profanity filter preserves case-insensitive substring masking", () => {
  assert.equal(filterProfanity("SHITake shit"), "****ake ****");
});

test("profanity filter preserves Cyrillic and Uzbek masking", () => {
  assert.equal(filterProfanity("сука va ko'toq"), "**** va ******");
});

test("profanity filter preserves phrase masking", () => {
  assert.equal(filterProfanity("amaki seni deb yozdi"), "********** deb yozdi");
});
