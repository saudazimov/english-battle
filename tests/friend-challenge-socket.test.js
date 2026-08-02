const test = require("node:test");
const assert = require("node:assert/strict");
const registerFriendChallengeSocket = require("../src/sockets/friendChallengeSocket");

function createHarness({
  userId = 5,
  onlineUsers = {},
  queryResponses = [],
  queryError,
  challengerUserId = 7,
  nowValue = 1000,
} = {}) {
  const calls = [];
  const listeners = [];
  const pendingBattles = {};
  const pendingChallenges = new Map();
  const timers = [];
  const responses = queryResponses.slice();
  const challengerSocket = {
    id: "challenger-socket",
    userId: challengerUserId,
    join(roomId) {
      calls.push(["challenger-join", roomId]);
    },
    emit(...args) {
      calls.push(["challenger-emit", ...args]);
    },
  };
  const targetSocket = {
    id: "target-socket",
    userId: 8,
  };
  const socket = {
    id: "receiver-socket",
    userId,
    on(event, handler) {
      listeners.push({ event, handler });
    },
    join(roomId) {
      calls.push(["socket-join", roomId]);
    },
    emit(...args) {
      calls.push(["socket-emit", ...args]);
    },
  };
  registerFriendChallengeSocket({
    socket,
    onlineUsers,
    pendingBattles,
    pendingChallenges,
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        if (queryError) throw queryError;
        return responses.shift() || { rows: [] };
      },
    },
    io: {
      sockets: {
        sockets: new Map([
          ["challenger-socket", challengerSocket],
          ["target-socket", targetSocket],
        ]),
      },
      to(socketId) {
        calls.push(["to", socketId]);
        return {
          emit(...args) {
            calls.push(["target-emit", ...args]);
          },
        };
      },
    },
    stripUnsafe(value, limit) {
      calls.push(["strip", value, limit]);
      return value.trim();
    },
    async getOpponentCardInfo(cardUserId) {
      calls.push(["card", cardUserId]);
      return String(cardUserId) === "7"
        ? { rating: 1700, win_rate: 60 }
        : { rating: 1500, win_rate: 40 };
    },
    logger: {
      log(...args) {
        calls.push(["log", ...args]);
      },
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
    setTimer(callback, delay) {
      calls.push(["timer", delay]);
      timers.push(callback);
      return {
        unref() {
          calls.push(["unref"]);
        },
      };
    },
    now() {
      calls.push(["now"]);
      return nowValue;
    },
  });
  return {
    socket,
    challengerSocket,
    pendingBattles,
    pendingChallenges,
    timers,
    calls,
    listeners,
    handlers: Object.fromEntries(
      listeners.map(({ event, handler }) => [event, handler])
    ),
  };
}

function seedChallenge(harness, overrides = {}) {
  const request = {
    fromSocketId: "challenger-socket",
    fromUserId: 7,
    toSocketId: "receiver-socket",
    toUserId: "5",
    fromName: "Ali",
    level: "A2",
    lengthKey: "standard",
    expiresAt: 60000,
    ...overrides,
  };
  harness.pendingChallenges.set(
    "receiver-socket:challenger-socket",
    request
  );
  return request;
}

test("friend challenge socket preserves listener registration order", () => {
  const harness = createHarness();

  assert.deepEqual(harness.listeners.map(({ event }) => event), [
    "challengeFriend",
    "cancelChallenge",
    "challengeResponse",
  ]);
});

test("challenge request preserves token identity and offline response", async () => {
  const harness = createHarness();

  await harness.handlers.challengeFriend();
  await harness.handlers.challengeFriend({ toUserId: 5 });
  await harness.handlers.challengeFriend({
    fromUserId: 99,
    fromName: "Fake",
    toUserId: 8,
    level: "A2",
  });

  assert.deepEqual(harness.calls, [
    [
      "socket-emit",
      "challengeResult",
      { success: false, message: "Chaqiruv haqiqiy emas" },
    ],
    [
      "socket-emit",
      "challengeResult",
      { success: false, message: "Chaqiruv haqiqiy emas" },
    ],
    ["log", "Chaqiruv:", 5, "->", 8, "| Onlayn:", []],
    [
      "socket-emit",
      "challengeResult",
      { success: false, message: "Do'stingiz hozir onlayn emas" },
    ],
  ]);
});

test("challenge request preserves SQL, DB identity, payload, and success", async () => {
  const onlineUsers = Object.create(null);
  onlineUsers[8] = "target-socket";
  const harness = createHarness({
    onlineUsers,
    queryResponses: [{
      rows: [{
        profile_picture: "ali.png",
        first_name: "Ali",
        last_name: "Valiyev",
      }],
    }],
  });

  await harness.handlers.challengeFriend({
    fromUserId: 99,
    fromName: "Fake",
    toUserId: 8,
    level: "B1",
    lengthKey: "",
  });

  assert.deepEqual(harness.calls, [
    ["log", "Chaqiruv:", 5, "->", 8, "| Onlayn:", ["8"]],
    [
      "query",
      "SELECT profile_picture, first_name, last_name FROM users WHERE id = $1",
      [5],
    ],
    ["strip", "Ali Valiyev", 60],
    ["now"],
    ["timer", 61000],
    ["unref"],
    ["to", "target-socket"],
    [
      "target-emit",
      "challengeReceived",
      {
        fromUserId: 5,
        fromName: "Ali Valiyev",
        fromSocketId: "receiver-socket",
        fromPic: "ali.png",
        level: "B1",
        lengthKey: "standard",
      },
    ],
    [
      "socket-emit",
      "challengeResult",
      {
        success: true,
        message: "Chaqiruv yuborildi, javob kutilmoqda...",
      },
    ],
  ]);
  assert.deepEqual(
    harness.pendingChallenges.get("target-socket:receiver-socket"),
    {
      fromSocketId: "receiver-socket",
      fromUserId: 5,
      toSocketId: "target-socket",
      toUserId: "8",
      fromName: "Ali Valiyev",
      level: "B1",
      lengthKey: "standard",
      expiresAt: 61000,
    }
  );
  harness.timers[0]();
  assert.equal(harness.pendingChallenges.size, 0);
});

test("challenge request rejects inherited online-user targets", async () => {
  const onlineUsers = Object.create({ 8: "target-socket" });
  const harness = createHarness({ onlineUsers });

  await harness.handlers.challengeFriend({
    fromName: "Ali",
    toUserId: 8,
    level: "A1",
  });

  assert.deepEqual(harness.calls, [
    ["log", "Chaqiruv:", 5, "->", 8, "| Onlayn:", []],
    [
      "socket-emit",
      "challengeResult",
      { success: false, message: "Do'stingiz hozir onlayn emas" },
    ],
  ]);
  assert.equal(harness.pendingChallenges.size, 0);
});

test("challenge request logs DB error and preserves sanitized fallback", async () => {
  const harness = createHarness({
    onlineUsers: { 8: "target-socket" },
    queryError: new Error("database unavailable"),
  });

  await harness.handlers.challengeFriend({
    fromName: " Ali ",
    toUserId: 8,
    level: "A1",
    lengthKey: "quick",
  });

  assert.deepEqual(harness.calls.slice(2), [
    ["error", "Chaqiruv yuboruvchisini olish xatosi:", "database unavailable"],
    ["strip", " Ali ", 60],
    ["now"],
    ["timer", 61000],
    ["unref"],
    ["to", "target-socket"],
    [
      "target-emit",
      "challengeReceived",
      {
        fromUserId: 5,
        fromName: "Ali",
        fromSocketId: "receiver-socket",
        fromPic: null,
        level: "A1",
        lengthKey: "quick",
      },
    ],
    [
      "socket-emit",
      "challengeResult",
      {
        success: true,
        message: "Chaqiruv yuborildi, javob kutilmoqda...",
      },
    ],
  ]);
});

test("cancel challenge preserves token identity and target emit", () => {
  const harness = createHarness({ onlineUsers: { 8: "target-socket" } });
  harness.pendingChallenges.set("target-socket:receiver-socket", {
    fromUserId: 5,
    toUserId: "8",
  });

  harness.handlers.cancelChallenge({ fromUserId: 99, toUserId: 8 });

  assert.deepEqual(harness.calls, [
    ["to", "target-socket"],
    ["target-emit", "challengeCancelled", { fromUserId: 5 }],
  ]);
  assert.equal(harness.pendingChallenges.size, 0);
});

test("challenge response preserves invalid challenger validation", async () => {
  const harness = createHarness({ challengerUserId: 99 });
  seedChallenge(harness);

  await harness.handlers.challengeResponse({
    accepted: true,
    fromSocketId: "challenger-socket",
    fromUserId: 7,
    fromName: "Ali",
    myName: "Vali",
  });

  assert.deepEqual(harness.calls, [
    ["now"],
    ["strip", "Vali", 60],
    [
      "socket-emit",
      "challengeResult",
      { success: false, message: "Chaqiruv haqiqiy emas" },
    ],
  ]);
});

test("challenge response preserves decline behavior", async () => {
  const harness = createHarness();
  seedChallenge(harness);

  await harness.handlers.challengeResponse({
    accepted: false,
    fromSocketId: "challenger-socket",
    fromUserId: 7,
    fromName: "Ali",
    myUserId: 99,
    myName: " Vali ",
  });

  assert.deepEqual(harness.calls, [
    ["now"],
    ["strip", " Vali ", 60],
    ["challenger-emit", "challengeDeclined", { byName: "Vali" }],
  ]);
  assert.equal(harness.pendingChallenges.size, 0);
});

test("challenge response rejects malformed, forged, and expired requests", async () => {
  const harness = createHarness({ nowValue: 5000 });

  await harness.handlers.challengeResponse();
  await harness.handlers.challengeResponse({
    accepted: true,
    fromSocketId: "challenger-socket",
    myName: "Vali",
  });
  seedChallenge(harness, { expiresAt: 4000 });
  await harness.handlers.challengeResponse({
    accepted: true,
    fromSocketId: "challenger-socket",
    myName: "Vali",
  });

  assert.equal(harness.pendingChallenges.size, 0);
  assert.deepEqual(harness.calls, [
    [
      "socket-emit",
      "challengeResult",
      { success: false, message: "Chaqiruv haqiqiy emas" },
    ],
    [
      "socket-emit",
      "challengeResult",
      { success: false, message: "Chaqiruv haqiqiy emas" },
    ],
    ["now"],
    [
      "socket-emit",
      "challengeResult",
      { success: false, message: "Chaqiruv haqiqiy emas" },
    ],
  ]);
});

test("accepted challenge preserves query, cards, emits, and pending battle", async () => {
  const harness = createHarness({
    queryResponses: [{
      rows: [
        { id: 7, profile_picture: "ali.png" },
        { id: 5, profile_picture: "vali.png" },
      ],
    }],
  });
  seedChallenge(harness, { level: "B1", lengthKey: "standard" });

  await harness.handlers.challengeResponse({
    accepted: true,
    fromSocketId: "challenger-socket",
    fromUserId: 7,
    fromName: " Ali ",
    myUserId: 99,
    myName: " Vali ",
    level: "B1",
    lengthKey: "",
  });

  const roomId = "friend_battle_challenger-socket_receiver-socket";
  assert.deepEqual(harness.calls, [
    ["now"],
    ["strip", " Vali ", 60],
    ["challenger-join", roomId],
    ["socket-join", roomId],
    [
      "query",
      "SELECT id, profile_picture FROM users WHERE id = ANY($1)",
      [[7, 5]],
    ],
    ["card", 7],
    ["card", 5],
    [
      "challenger-emit",
      "matchFound",
      {
        roomId,
        opponent: {
          name: "Vali",
          profile_picture: "vali.png",
          rating: 1500,
          win_rate: 40,
          level: "B1",
        },
        lengthKey: "standard",
        message: "Do'stingiz qabul qildi!",
      },
    ],
    [
      "socket-emit",
      "matchFound",
      {
        roomId,
        opponent: {
          name: "Ali",
          profile_picture: "ali.png",
          rating: 1700,
          win_rate: 60,
          level: "B1",
        },
        lengthKey: "standard",
        message: "Jang boshlanmoqda!",
      },
    ],
  ]);
  assert.deepEqual(harness.pendingBattles[roomId], {
    lengthKey: "standard",
    player1: {
      userId: 7,
      name: "Ali",
      level: "B1",
      lengthKey: "standard",
      ready: false,
      socketId: null,
    },
    player2: {
      userId: 5,
      name: "Vali",
      level: "B1",
      lengthKey: "standard",
      ready: false,
      socketId: null,
    },
  });
});

test("accepted challenge logs picture errors and preserves null fallback", async () => {
  const harness = createHarness({
    queryError: new Error("pictures unavailable"),
  });
  seedChallenge(harness, { level: "B1", lengthKey: "standard" });

  await harness.handlers.challengeResponse({
    accepted: true,
    fromSocketId: "challenger-socket",
    myName: "Vali",
  });

  assert.equal(harness.calls.some((call) => (
    call[0] === "error"
    && call[1] === "Chaqiruv profil rasmlarini olish xatosi:"
    && call[2] === "pictures unavailable"
  )), true);
  const matchEvents = harness.calls.filter((call) => (
    call[0] === "challenger-emit" || call[0] === "socket-emit"
  ));
  assert.equal(matchEvents[0][2].opponent.profile_picture, null);
  assert.equal(matchEvents[1][2].opponent.profile_picture, null);
});
