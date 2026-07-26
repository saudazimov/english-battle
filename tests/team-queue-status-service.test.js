const test = require("node:test");
const assert = require("node:assert/strict");

const { createTeamQueueStatusService } = require("../src/services/teamQueueStatusService");

function createHarness(teamMatchPool) {
  const emissions = [];
  const emitTeamQueueStatus = createTeamQueueStatusService({
    teamMatchPool,
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
  return { emitTeamQueueStatus, emissions };
}

test("team queue status preserves duo count, payload, and player order", () => {
  const teamMatchPool = {
    duo: [
      {
        size: 2,
        players: [
          { socketId: "socket-1", isBot: false },
          { socketId: "bot-socket", isBot: true },
        ],
      },
      {
        size: 1,
        players: [{ socketId: "socket-2" }],
      },
    ],
  };
  const { emitTeamQueueStatus, emissions } = createHarness(teamMatchPool);

  assert.equal(emitTeamQueueStatus("duo"), undefined);
  assert.deepEqual(emissions, [
    {
      socketId: "socket-1",
      event: "teamQueueUpdate",
      payload: { current: 3, needed: 4, teamMode: "duo" },
    },
    {
      socketId: "socket-2",
      event: "teamQueueUpdate",
      payload: { current: 3, needed: 4, teamMode: "duo" },
    },
  ]);
});

test("team queue status preserves squad target", () => {
  const teamMatchPool = {
    squad: [{ size: 4, players: [{ socketId: "squad-socket", isBot: false }] }],
  };
  const { emitTeamQueueStatus, emissions } = createHarness(teamMatchPool);

  emitTeamQueueStatus("squad");

  assert.deepEqual(emissions[0].payload, { current: 4, needed: 8, teamMode: "squad" });
});

test("team queue status preserves bot and missing-socket filtering", () => {
  const teamMatchPool = {
    duo: [{
      size: 3,
      players: [
        { socketId: "bot-socket", isBot: true },
        { socketId: "", isBot: false },
        { isBot: false },
      ],
    }],
  };
  const { emitTeamQueueStatus, emissions } = createHarness(teamMatchPool);

  emitTeamQueueStatus("duo");

  assert.deepEqual(emissions, []);
});

test("team queue status preserves invalid-mode failure", () => {
  const { emitTeamQueueStatus } = createHarness({ duo: [], squad: [] });

  assert.throws(() => emitTeamQueueStatus("invalid"), TypeError);
});
