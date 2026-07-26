const test = require("node:test");
const assert = require("node:assert/strict");

const { createTournamentResultNotifier } = require("../src/services/tournamentResultNotifier");

test("tournament result notifier preserves default scores and payload", () => {
  const calls = [];
  const notifyTournamentResult = createTournamentResultNotifier({
    notifyMatchPlayers(...args) {
      calls.push(args);
      return Promise.resolve("ignored");
    },
  });
  const match = {
    id: "42",
    school_a: "1-maktab",
    school_b: "2-maktab",
  };

  const result = notifyTournamentResult(match, "1-maktab", "school-a");

  assert.equal(result, undefined);
  assert.deepEqual(calls, [[
    "42",
    "matchFinished",
    {
      matchId: 42,
      score_a: 0,
      score_b: 0,
      school_a: "1-maktab",
      school_b: "2-maktab",
      winner: "1-maktab",
      winner_key: "school-a",
    },
  ]]);
});

test("tournament result notifier preserves explicit scores and parseInt behavior", () => {
  const calls = [];
  const notifyTournamentResult = createTournamentResultNotifier({
    notifyMatchPlayers(...args) { calls.push(args); },
  });
  const match = {
    id: "17-extra",
    school_a: "A maktab",
    school_b: "B maktab",
  };

  notifyTournamentResult(match, "B maktab", "school-b", 3, 7);

  assert.deepEqual(calls, [[
    "17-extra",
    "matchFinished",
    {
      matchId: 17,
      score_a: 3,
      score_b: 7,
      school_a: "A maktab",
      school_b: "B maktab",
      winner: "B maktab",
      winner_key: "school-b",
    },
  ]]);
});
