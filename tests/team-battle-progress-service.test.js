const test = require("node:test");
const assert = require("node:assert/strict");

const { createTeamBattleProgressService } = require("../src/services/teamBattleProgressService");

function createHarness(battles) {
  const emissions = [];
  const emitTeamProgress = createTeamBattleProgressService({
    battles,
    io: {
      to(socketId) {
        return {
          emit(event, payload) {
            emissions.push({ socketId, event, payload });
          },
        };
      },
    },
  });
  return { emitTeamProgress, emissions };
}

function player(overrides) {
  return {
    name: "Player",
    answeredCount: 2,
    score: 1,
    finished: false,
    isBot: false,
    level: "A1",
    rating: 1000,
    team: "A",
    ...overrides,
  };
}

test("team battle progress preserves missing-room early return", () => {
  const { emitTeamProgress, emissions } = createHarness({});

  assert.equal(emitTeamProgress("missing"), undefined);
  assert.deepEqual(emissions, []);
});

test("team battle progress preserves team perspective, totals, and bot filtering", () => {
  const battles = {
    room_1: {
      teams: {
        A: ["socket-a", "stale-socket", "bot-a"],
        B: ["socket-b"],
      },
      players: {
        "socket-a": player({ name: "A", score: 2, team: "A" }),
        "bot-a": player({ name: "Bot", score: 1, isBot: true, team: "A" }),
        "socket-b": player({ name: "B", score: 4, team: "B", finished: true }),
      },
    },
  };
  const { emitTeamProgress, emissions } = createHarness(battles);

  assert.equal(emitTeamProgress("room_1"), undefined);
  assert.deepEqual(emissions.map(({ socketId, event }) => ({ socketId, event })), [
    { socketId: "socket-a", event: "teamProgress" },
    { socketId: "socket-b", event: "teamProgress" },
  ]);

  const aPayload = emissions[0].payload;
  const bPayload = emissions[1].payload;
  assert.equal(aPayload.myTeamScore, 3);
  assert.equal(aPayload.enemyTeamScore, 4);
  assert.equal(bPayload.myTeamScore, 4);
  assert.equal(bPayload.enemyTeamScore, 3);
  assert.deepEqual(aPayload.myTeamPlayers.map((entry) => entry.name), ["A", "Bot"]);
  assert.deepEqual(aPayload.enemyTeamPlayers.map((entry) => entry.name), ["B"]);
  assert.equal(aPayload.myTeamPlayers, bPayload.enemyTeamPlayers);
  assert.equal(aPayload.enemyTeamPlayers, bPayload.myTeamPlayers);
});

test("team battle progress preserves player payload fields", () => {
  const sourcePlayer = player({
    name: "Full Player",
    answeredCount: 7,
    score: 6,
    finished: true,
    level: "B2",
    rating: 1450,
  });
  const battles = {
    room_2: {
      teams: { A: ["socket-a"], B: [] },
      players: { "socket-a": sourcePlayer },
    },
  };
  const { emitTeamProgress, emissions } = createHarness(battles);

  emitTeamProgress("room_2");

  assert.deepEqual(emissions[0].payload.myTeamPlayers[0], {
    name: "Full Player",
    answeredCount: 7,
    score: 6,
    finished: true,
    isBot: false,
    level: "B2",
    rating: 1450,
  });
});
