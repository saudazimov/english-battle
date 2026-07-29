const test = require("node:test");
const assert = require("node:assert/strict");
const registerFriendChallengeSocket = require("../src/sockets/friendChallengeSocket");

function createHarness({
  userId = 5,
  onlineUsers = {},
  queryResponses = [],
  queryError,
  challengerUserId = 7,
} = {}) {
  const calls = [];
  const listeners = [];
  const pendingBattles = {};
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
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        if (queryError) throw queryError;
        return responses.shift() || { rows: [] };
      },
    },
    io: {
      sockets: {
        sockets: new Map([["challenger-socket", challengerSocket]]),
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
    },
  });
  return {
    socket,
    challengerSocket,
    pendingBattles,
    calls,
    listeners,
    handlers: Object.fromEntries(
      listeners.map(({ event, handler }) => [event, handler])
    ),
  };
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

  await harness.handlers.challengeFriend({
    fromUserId: 99,
    fromName: "Fake",
    toUserId: 8,
    level: "A2",
  });

  assert.deepEqual(harness.calls, [
    ["log", "Chaqiruv:", 5, "->", 8, "| Onlayn:", []],
    [
      "socket-emit",
      "challengeResult",
      { success: false, message: "Do'stingiz hozir onlayn emas" },
    ],
  ]);
});

test("challenge request preserves SQL, DB identity, payload, and success", async () => {
  const harness = createHarness({
    onlineUsers: { 8: "target-socket" },
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
});

test("challenge request preserves swallowed DB error and sanitized fallback", async () => {
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
    ["to", "target-socket"],
    ["strip", " Ali ", 60],
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

  harness.handlers.cancelChallenge({ fromUserId: 99, toUserId: 8 });

  assert.deepEqual(harness.calls, [
    ["to", "target-socket"],
    ["target-emit", "challengeCancelled", { fromUserId: 5 }],
  ]);
});

test("challenge response preserves invalid challenger validation", async () => {
  const harness = createHarness({ challengerUserId: 99 });

  await harness.handlers.challengeResponse({
    accepted: true,
    fromSocketId: "challenger-socket",
    fromUserId: 7,
    fromName: "Ali",
    myName: "Vali",
  });

  assert.deepEqual(harness.calls, [
    ["strip", "Ali", 60],
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

  await harness.handlers.challengeResponse({
    accepted: false,
    fromSocketId: "challenger-socket",
    fromUserId: 7,
    fromName: "Ali",
    myUserId: 99,
    myName: " Vali ",
  });

  assert.deepEqual(harness.calls, [
    ["strip", "Ali", 60],
    ["strip", " Vali ", 60],
    ["challenger-emit", "challengeDeclined", { byName: "Vali" }],
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
    ["strip", " Ali ", 60],
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
