const test = require("node:test");
const assert = require("node:assert/strict");
const { orderKeys } = require("../public/question-options");

const question = {
  id: 42,
  option_a: "Alpha",
  option_b: "Bravo",
  option_c: "Charlie",
  option_d: "Delta",
};

test("option order is a stable non-identity permutation within one attempt", () => {
  const first = orderKeys(question, "attempt-1");
  const second = orderKeys(question, "attempt-1");

  assert.deepEqual(first, second);
  assert.deepEqual(first.slice().sort(), ["A", "B", "C", "D"]);
  assert.notDeepEqual(first, ["A", "B", "C", "D"]);
});

test("option order varies across attempts", () => {
  const permutations = new Set();
  for (let index = 1; index <= 12; index++) {
    permutations.add(orderKeys(question, "attempt-" + index).join(""));
  }
  assert.ok(permutations.size > 1);
});

test("array options and missing options keep only valid answer keys", () => {
  const arrayQuestion = {
    assignment_question_id: 9,
    options: [
      { key: "A", text: "One" },
      { key: "C", text: "Three" },
      { key: "C", text: "Duplicate" },
      { key: "Z", text: "Invalid" },
    ],
  };

  assert.deepEqual(orderKeys(arrayQuestion, "submission-2").slice().sort(), ["A", "C"]);
});
