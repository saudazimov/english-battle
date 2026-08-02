const test = require("node:test");
const assert = require("node:assert/strict");
const registerTeamMatchmakingSocket = require("../src/sockets/teamMatchmakingSocket");

function createHarness({
  teamMatchPool,
  addError,
  queryError,
  profile,
  userId = 5,
} = {}) {
  const calls = [];
  const listeners = [];
  const socket = {
    id: "socket-5",
    userId,
    on(event, handler) {
      listeners.push({ event, handler });
    },
  };
  const pools = teamMatchPool || { duo: [], squad: [] };
  registerTeamMatchmakingSocket({
    socket,
    io: {
      to(socketId) {
        calls.push(["to", socketId]);
        return {
          emit(...args) {
            calls.push(["emit", ...args]);
          },
        };
      },
    },
    pool: {
      async query() {
        if (queryError) throw queryError;
        return {
          rows: profile === null ? [] : [profile || {
            id: Number(userId),
            first_name: null,
            last_name: null,
            cefr_level: null,
            rating: null,
            profile_picture: null,
          }],
        };
      },
    },
    teamMatchPool: pools,
    addTeamEntry(mode, entry) {
      calls.push(["addTeamEntry", mode, entry]);
      if (addError) throw addError;
    },
    emitTeamQueueStatus(mode) {
      calls.push(["queueStatus", mode]);
    },
    stripUnsafe(value, limit) {
      calls.push(["strip", value, limit]);
      return typeof value === "string" ? value.trim() : "";
    },
    now() {
      calls.push(["now"]);
      return 123456;
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return {
    calls,
    listeners,
    teamMatchPool: pools,
    handlers: Object.fromEntries(
      listeners.map(({ event, handler }) => [event, handler])
    ),
  };
}

test("team matchmaking preserves listener registration order", () => {
  const harness = createHarness();

  assert.deepEqual(harness.listeners.map(({ event }) => event), [
    "findTeamMatch",
    "cancelTeamMatch",
  ]);
});

test("team search uses authoritative profile while preserving client mode", async () => {
  const harness = createHarness({
    profile: {
      id: 5,
      first_name: "Database",
      last_name: "User",
      cefr_level: "C1",
      rating: 1777,
      profile_picture: "database.png",
    },
  });
  const playerData = {
    userId: 99,
    teamMode: "squad",
    name: "Spoofed Name",
    level: "B1",
    lengthKey: "quick",
    rating: 1450,
    profile_picture: "spoofed.png",
  };

  await harness.handlers.findTeamMatch(playerData);

  assert.equal(playerData.userId, 99);
  assert.deepEqual(harness.calls, [
    ["strip", "Database User", 60],
    ["now"],
    [
      "addTeamEntry",
      "squad",
      {
        id: "solo_socket-5_123456",
        type: "solo",
        size: 1,
        players: [{
          socketId: "socket-5",
          userId: 5,
          name: "Database User",
          level: "C1",
          lengthKey: "quick",
          rating: 1777,
          profile_picture: "database.png",
        }],
      },
    ],
  ]);
});

test("team search preserves null-input defaults and duo fallback", async () => {
  const harness = createHarness();

  await harness.handlers.findTeamMatch(null);

  assert.deepEqual(harness.calls.at(-1), [
    "addTeamEntry",
    "duo",
    {
      id: "solo_socket-5_123456",
      type: "solo",
      size: 1,
      players: [{
        socketId: "socket-5",
        userId: 5,
        name: "O'yinchi",
        level: "A1",
        lengthKey: "standard",
        rating: 1000,
        profile_picture: null,
      }],
    },
  ]);
});

test("team search rejects malformed payloads and authenticated user IDs", async () => {
  for (const payload of [[], "player", 17]) {
    const harness = createHarness();

    await harness.handlers.findTeamMatch(payload);

    assert.equal(harness.calls.some((call) => call[0] === "addTeamEntry"), false);
    assert.deepEqual(harness.calls.slice(-2), [
      ["to", "socket-5"],
      ["emit", "battleError", { message: "Jamoa qidirishda xato" }],
    ]);
  }

  for (const userId of [null, {}, "7.5", "9007199254740992"]) {
    const harness = createHarness({ userId });

    await harness.handlers.findTeamMatch({ name: "Ali" });

    assert.equal(harness.calls.some((call) => call[0] === "addTeamEntry"), false);
    assert.deepEqual(harness.calls.slice(-2), [
      ["to", "socket-5"],
      ["emit", "battleError", { message: "Jamoa qidirishda xato" }],
    ]);
  }
});

test("team search bounds untrusted player fields", async () => {
  const harness = createHarness();

  await harness.handlers.findTeamMatch({
    name: {},
    level: "x".repeat(17),
    lengthKey: "x".repeat(33),
    rating: Number.POSITIVE_INFINITY,
    profile_picture: "x".repeat(2049),
  });

  const entry = harness.calls.find((call) => call[0] === "addTeamEntry")[2];
  assert.deepEqual(entry.players[0], {
    socketId: "socket-5",
    userId: 5,
    name: "O'yinchi",
    level: "A1",
    lengthKey: "standard",
    rating: 1000,
    profile_picture: null,
  });
});

test("refresh replaces an existing solo queue entry for the same user", async () => {
  const staleEntry = {
    id: "solo-old-socket",
    type: "solo",
    players: [{ socketId: "old-socket", userId: "5" }],
  };
  const otherEntry = {
    id: "solo-other-socket",
    type: "solo",
    players: [{ socketId: "other-socket", userId: 9 }],
  };
  const harness = createHarness({
    teamMatchPool: { duo: [staleEntry, otherEntry], squad: [] },
  });

  await harness.handlers.findTeamMatch({ teamMode: "duo", name: "Ali" });

  assert.deepEqual(harness.teamMatchPool.duo, [otherEntry]);
  assert.deepEqual(
    harness.calls.find((call) => call[0] === "queueStatus"),
    ["queueStatus", "duo"]
  );
  assert.equal(harness.calls.filter((call) => call[0] === "addTeamEntry").length, 1);
});

test("team search removes malformed queue entries before adding", async () => {
  const keep = {
    type: "solo",
    players: [{ socketId: "other-socket", userId: 9 }],
  };
  const harness = createHarness({
    teamMatchPool: {
      duo: [null, { players: null }, { players: [null] }, keep],
      squad: [],
    },
  });

  await harness.handlers.findTeamMatch({ name: "Ali" });

  assert.deepEqual(harness.teamMatchPool.duo, [keep]);
  assert.deepEqual(
    harness.calls.find((call) => call[0] === "queueStatus"),
    ["queueStatus", "duo"]
  );
  assert.equal(harness.calls.filter((call) => call[0] === "addTeamEntry").length, 1);
});

test("team search reports malformed pool state without adding", async () => {
  const harness = createHarness({
    teamMatchPool: { duo: null, squad: [] },
  });

  await harness.handlers.findTeamMatch({ name: "Ali" });

  assert.equal(harness.calls.some((call) => call[0] === "addTeamEntry"), false);
  assert.deepEqual(harness.calls.slice(-2), [
    ["to", "socket-5"],
    ["emit", "battleError", { message: "Jamoa qidirishda xato" }],
  ]);
});

test("team search validates both pools before mutating either one", async () => {
  const staleEntry = {
    id: "solo-old-socket",
    type: "solo",
    players: [{ socketId: "old-socket", userId: 5 }],
  };
  const harness = createHarness({
    teamMatchPool: { duo: [staleEntry], squad: null },
  });

  await harness.handlers.findTeamMatch({ name: "Ali" });

  assert.deepEqual(harness.teamMatchPool.duo, [staleEntry]);
  assert.equal(harness.calls.some((call) => call[0] === "queueStatus"), false);
  assert.equal(harness.calls.some((call) => call[0] === "addTeamEntry"), false);
});

test("team search fails closed before queue mutation when profile lookup fails", async () => {
  const staleEntry = {
    id: "solo-old-socket",
    type: "solo",
    players: [{ socketId: "old-socket", userId: 5 }],
  };
  const harness = createHarness({
    teamMatchPool: { duo: [staleEntry], squad: [] },
    queryError: new Error("database unavailable"),
  });

  await harness.handlers.findTeamMatch({ teamMode: "duo" });

  assert.deepEqual(harness.teamMatchPool.duo, [staleEntry]);
  assert.equal(harness.calls.some((call) => call[0] === "queueStatus"), false);
  assert.equal(harness.calls.some((call) => call[0] === "addTeamEntry"), false);
  assert.deepEqual(harness.calls.slice(-3), [
    ["error", "Jamoa matchmaking xatosi:", "database unavailable"],
    ["to", "socket-5"],
    ["emit", "battleError", { message: "Jamoa qidirishda xato" }],
  ]);
});

test("team search preserves caught error logging and socket response", async () => {
  const harness = createHarness({ addError: new Error("pool unavailable") });

  await harness.handlers.findTeamMatch({ name: "Ali" });

  assert.deepEqual(harness.calls.slice(-3), [
    ["error", "Jamoa matchmaking xatosi:", "pool unavailable"],
    ["to", "socket-5"],
    ["emit", "battleError", { message: "Jamoa qidirishda xato" }],
  ]);
});

test("cancel preserves duo-to-squad order and only reports changed pools", () => {
  const keepDuo = { players: [{ socketId: "other-duo" }] };
  const removeDuo = { players: [{ socketId: "socket-5" }] };
  const keepSquad = { players: [{ socketId: "other-squad" }] };
  const harness = createHarness({
    teamMatchPool: {
      duo: [keepDuo, removeDuo],
      squad: [keepSquad],
    },
  });

  harness.handlers.cancelTeamMatch();

  assert.deepEqual(harness.teamMatchPool.duo, [keepDuo]);
  assert.deepEqual(harness.teamMatchPool.squad, [keepSquad]);
  assert.deepEqual(harness.calls, [["queueStatus", "duo"]]);
});

test("cancel preserves filtering and notifications for both modes", () => {
  const harness = createHarness({
    teamMatchPool: {
      duo: [{ players: [{ socketId: "socket-5" }] }],
      squad: [{
        players: [
          { socketId: "other" },
          { socketId: "socket-5" },
        ],
      }],
    },
  });

  harness.handlers.cancelTeamMatch();

  assert.deepEqual(harness.teamMatchPool, { duo: [], squad: [] });
  assert.deepEqual(harness.calls, [
    ["queueStatus", "duo"],
    ["queueStatus", "squad"],
  ]);
});

test("cancel repairs malformed pools and entries without throwing", () => {
  const keep = { players: [{ socketId: "other" }] };
  const harness = createHarness({
    teamMatchPool: {
      duo: null,
      squad: [null, { players: null }, { players: [null] }, keep],
    },
  });

  assert.doesNotThrow(() => harness.handlers.cancelTeamMatch());

  assert.deepEqual(harness.teamMatchPool, {
    duo: [],
    squad: [keep],
  });
  assert.deepEqual(harness.calls, [
    ["queueStatus", "duo"],
    ["queueStatus", "squad"],
  ]);
});
