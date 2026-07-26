const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTeamBattleCompletionCheckService,
} = require("../src/services/teamBattleCompletionCheckService");

function createHarness(battles) {
  const finishedRooms = [];
  const checkTeamFinish = createTeamBattleCompletionCheckService({
    battles,
    finishTeamBattle(roomId) {
      finishedRooms.push(roomId);
      return Promise.resolve("ignored-result");
    },
  });
  return { checkTeamFinish, finishedRooms };
}

test("team completion check preserves missing and already-finished guards", () => {
  const battles = {
    done: { finished: true, players: { socket_1: { finished: true } } },
  };
  const { checkTeamFinish, finishedRooms } = createHarness(battles);

  assert.equal(checkTeamFinish("missing"), undefined);
  assert.equal(checkTeamFinish("done"), undefined);
  assert.deepEqual(finishedRooms, []);
});

test("team completion check finishes when every player is finished", () => {
  const battles = {
    room_1: {
      finished: false,
      players: {
        human: { finished: true, isBot: false },
        bot: { finished: true, isBot: true },
      },
    },
  };
  const { checkTeamFinish, finishedRooms } = createHarness(battles);

  assert.equal(checkTeamFinish("room_1"), undefined);
  assert.deepEqual(finishedRooms, ["room_1"]);
});

test("team completion check waits while any player is unfinished", () => {
  const battles = {
    room_2: {
      players: {
        socket_1: { finished: true },
        socket_2: { finished: false },
      },
    },
  };
  const { checkTeamFinish, finishedRooms } = createHarness(battles);

  checkTeamFinish("room_2");

  assert.deepEqual(finishedRooms, []);
});

test("team completion check preserves empty-player every behavior", () => {
  const battles = { empty: { players: {} } };
  const { checkTeamFinish, finishedRooms } = createHarness(battles);

  checkTeamFinish("empty");

  assert.deepEqual(finishedRooms, ["empty"]);
});
