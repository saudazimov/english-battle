const test = require("node:test");
const assert = require("node:assert/strict");
const registerRematchSocket = require("../src/sockets/rematchSocket");

function createHarness({
  userId = 5,
  onlineUsers = {},
  queryResponses = [],
  queryError,
  requesterSocket,
  nowValue = 1000,
} = {}) {
  const calls = [];
  const listeners = [];
  const pendingRematches = new Map();
  const pendingBattles = {};
  const timers = [];
  const responses = queryResponses.slice();
  const socket = {
    id: "socket-1",
    userId,
    on(event, handler) {
      listeners.push({ event, handler });
    },
    emit(...args) {
      calls.push(["socket-emit", ...args]);
    },
  };
  const requester = requesterSocket || {
    id: "requester-socket",
    userId: "7",
    emit(...args) {
      calls.push(["requester-emit", ...args]);
    },
  };
  registerRematchSocket({
    socket,
    onlineUsers,
    pendingRematches,
    pendingBattles,
    battleLengths: { standard: { questions: 10 }, quick: { questions: 5 } },
    pool: {
      async query(sql, params) {
        calls.push(["query", sql.replace(/\s+/g, " ").trim(), params]);
        if (queryError) throw queryError;
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return response || { rows: [] };
      },
    },
    io: {
      sockets: { sockets: new Map([[requester.id, requester]]) },
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
      return { rating: String(cardUserId) === "7" ? 1700 : 1500 };
    },
    logger: {
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
  const handlers = Object.fromEntries(
    listeners.map(({ event, handler }) => [event, handler])
  );
  return {
    socket,
    requester,
    listeners,
    handlers,
    pendingRematches,
    pendingBattles,
    timers,
    calls,
  };
}

test("rematch socket preserves request/response registration order", () => {
  const harness = createHarness();

  assert.deepEqual(harness.listeners.map(({ event }) => event), [
    "requestRematch",
    "rematchResponse",
  ]);
});

test("rematch request preserves invalid, self, and offline short circuits", async () => {
  const harness = createHarness({ userId: 5 });

  await harness.handlers.requestRematch();
  await harness.handlers.requestRematch(null);
  await harness.handlers.requestRematch([]);
  await harness.handlers.requestRematch({ opponentId: null });
  await harness.handlers.requestRematch({ opponentId: "5" });
  await harness.handlers.requestRematch({ opponentId: "7" });

  assert.deepEqual(harness.calls, [
    ["socket-emit", "rematchUnavailable", { message: "Rematch so'rovi noto'g'ri" }],
    ["socket-emit", "rematchUnavailable", { message: "Rematch so'rovi noto'g'ri" }],
    ["socket-emit", "rematchUnavailable", { message: "Rematch so'rovi noto'g'ri" }],
    ["socket-emit", "rematchUnavailable", { message: "Rematch so'rovi noto'g'ri" }],
    ["socket-emit", "rematchUnavailable", { message: "Rematch so'rovi noto'g'ri" }],
    ["socket-emit", "rematchUnavailable", { message: "Raqib hozir mavjud emas" }],
  ]);
});

test("rematch request rejects inherited online users and malformed identifiers", async () => {
  const onlineUsers = Object.create({ 7: "target-socket" });
  const harness = createHarness({ onlineUsers });

  await harness.handlers.requestRematch({ opponentId: 7 });
  await harness.handlers.requestRematch({ opponentId: {} });
  await harness.handlers.requestRematch({ opponentId: "7".repeat(257) });

  assert.deepEqual(harness.calls, [
    ["socket-emit", "rematchUnavailable", { message: "Raqib hozir mavjud emas" }],
    ["socket-emit", "rematchUnavailable", { message: "Rematch so'rovi noto'g'ri" }],
    ["socket-emit", "rematchUnavailable", { message: "Rematch so'rovi noto'g'ri" }],
  ]);
});

test("rematch request preserves SQL, normalization, timer, map, and emit", async () => {
  const onlineUsers = Object.create(null);
  onlineUsers[7] = "target-socket";
  const harness = createHarness({
    userId: 5,
    onlineUsers,
    queryResponses: [{ rows: [{ first_name: "Ali", last_name: "Valiyev" }] }],
  });

  await harness.handlers.requestRematch({
    opponentId: 7,
    level: "invalid",
    lengthKey: "toString",
  });

  const request = harness.pendingRematches.get("target-socket:socket-1");
  assert.deepEqual(request, {
    fromSocketId: "socket-1",
    fromUserId: "5",
    toUserId: "7",
    fromName: "Ali Valiyev",
    level: "A1",
    lengthKey: "standard",
    expiresAt: 61000,
  });
  assert.match(harness.calls[0][1], /^SELECT u\.first_name, u\.last_name/);
  assert.deepEqual(harness.calls[0][2], [5, 7]);
  assert.deepEqual(harness.calls.slice(1), [
    ["strip", "Ali Valiyev", 60],
    ["now"],
    ["timer", 61000],
    ["unref"],
    ["to", "target-socket"],
    ["target-emit", "rematchRequested", request],
  ]);

  harness.timers[0]();
  assert.equal(harness.pendingRematches.has("target-socket:socket-1"), false);
});

test("rematch request preserves missing-history and database-error responses", async () => {
  const missing = createHarness({
    onlineUsers: { 7: "target-socket" },
    queryResponses: [{ rows: [] }],
  });
  await missing.handlers.requestRematch({ opponentId: 7 });
  assert.deepEqual(missing.calls.at(-1), [
    "socket-emit",
    "rematchUnavailable",
    { message: "Faqat yaqinda jang qilgan raqibga rematch yuboriladi" },
  ]);

  const failed = createHarness({
    onlineUsers: { 7: "target-socket" },
    queryError: new Error("database unavailable"),
  });
  await failed.handlers.requestRematch({ opponentId: 7 });
  assert.deepEqual(failed.calls.slice(-2), [
    ["error", "Rematch tekshirish xatosi:", "database unavailable"],
    [
      "socket-emit",
      "rematchUnavailable",
      { message: "Rematchni tekshirib bo'lmadi" },
    ],
  ]);
});

test("rematch response preserves delete-before-invalid validation", async () => {
  const harness = createHarness({ userId: 5, nowValue: 5000 });
  harness.pendingRematches.set("socket-1:requester-socket", {
    expiresAt: 4000,
    toUserId: "5",
  });

  await harness.handlers.rematchResponse({
    accepted: true,
    fromSocketId: "requester-socket",
  });

  assert.equal(harness.pendingRematches.size, 0);
  assert.deepEqual(harness.calls, [
    ["now"],
    [
      "socket-emit",
      "rematchUnavailable",
      { message: "Rematch so'rovi eskirgan yoki haqiqiy emas" },
    ],
  ]);
});

test("rematch response rejects malformed payloads and socket identifiers", async () => {
  const harness = createHarness({ userId: 5 });

  await harness.handlers.rematchResponse();
  await harness.handlers.rematchResponse(null);
  await harness.handlers.rematchResponse([]);
  await harness.handlers.rematchResponse({ accepted: true, fromSocketId: "" });
  await harness.handlers.rematchResponse({
    accepted: true,
    fromSocketId: "x".repeat(257),
  });

  assert.equal(harness.pendingRematches.size, 0);
  assert.deepEqual(harness.calls, Array.from({ length: 5 }, () => [
    "socket-emit",
    "rematchUnavailable",
    { message: "Rematch so'rovi eskirgan yoki haqiqiy emas" },
  ]));
});

test("rematch response preserves requester identity validation", async () => {
  const requester = { id: "requester-socket", userId: "99", emit: assert.fail };
  const harness = createHarness({ requesterSocket: requester });
  harness.pendingRematches.set("socket-1:requester-socket", {
    expiresAt: 60000,
    toUserId: "5",
    fromUserId: "7",
  });

  await harness.handlers.rematchResponse({
    accepted: true,
    fromSocketId: "requester-socket",
  });

  assert.deepEqual(harness.calls.at(-1), [
    "socket-emit",
    "rematchUnavailable",
    { message: "Rematch so'rovi haqiqiy emas" },
  ]);
});

test("rematch response preserves decline name lookup and payload", async () => {
  const harness = createHarness({
    queryResponses: [{ rows: [{ first_name: "Vali", last_name: null }] }],
  });
  harness.pendingRematches.set("socket-1:requester-socket", {
    expiresAt: 60000,
    toUserId: "5",
    fromUserId: "7",
    fromName: "Ali",
    level: "A2",
    lengthKey: "quick",
  });

  await harness.handlers.rematchResponse({
    accepted: false,
    fromSocketId: "requester-socket",
  });

  assert.match(harness.calls[1][1], /^SELECT first_name, last_name/);
  assert.deepEqual(harness.calls.slice(-2), [
    ["strip", "Vali", 60],
    ["requester-emit", "rematchDeclined", { byName: "Vali" }],
  ]);
  assert.deepEqual(harness.pendingBattles, {});
});

test("rematch response logs name lookup errors and preserves decline fallback", async () => {
  const harness = createHarness({
    queryResponses: [new Error("name lookup unavailable")],
  });
  harness.pendingRematches.set("socket-1:requester-socket", {
    expiresAt: 60000,
    toUserId: "5",
    fromUserId: "7",
    fromName: "Ali",
    level: "A2",
    lengthKey: "quick",
  });

  await harness.handlers.rematchResponse({
    accepted: false,
    fromSocketId: "requester-socket",
  });

  assert.deepEqual(harness.calls.slice(-2), [
    ["error", "Rematch user nomini olish xatosi:", "name lookup unavailable"],
    ["requester-emit", "rematchDeclined", { byName: "O'yinchi" }],
  ]);
});

test("rematch response logs picture errors and preserves accepted fallback", async () => {
  const harness = createHarness({
    queryResponses: [
      { rows: [{ first_name: "Vali", last_name: "Karimov" }] },
      new Error("picture lookup unavailable"),
    ],
  });
  harness.pendingRematches.set("socket-1:requester-socket", {
    expiresAt: 60000,
    toUserId: "5",
    fromUserId: "7",
    fromName: "Ali",
    level: "A2",
    lengthKey: "quick",
  });

  await harness.handlers.rematchResponse({
    accepted: true,
    fromSocketId: "requester-socket",
  });

  assert.equal(harness.calls.some((call) => (
    call[0] === "error"
    && call[1] === "Rematch profil rasmlarini olish xatosi:"
    && call[2] === "picture lookup unavailable"
  )), true);
  const matchEvents = harness.calls.filter((call) => (
    call[0] === "requester-emit" || call[0] === "socket-emit"
  ));
  assert.equal(matchEvents[0][2].opponent.profile_picture, null);
  assert.equal(matchEvents[1][2].opponent.profile_picture, null);
});

test("rematch response preserves accepted battle state and both match payloads", async () => {
  const harness = createHarness({
    queryResponses: [
      { rows: [{ first_name: "Vali", last_name: "Karimov" }] },
      { rows: [
        { id: 7, profile_picture: "from.png" },
        { id: 5, profile_picture: "mine.png" },
      ] },
    ],
  });
  harness.pendingRematches.set("socket-1:requester-socket", {
    expiresAt: 60000,
    toUserId: "5",
    fromUserId: "7",
    fromName: "Ali",
    level: "A2",
    lengthKey: "quick",
  });

  await harness.handlers.rematchResponse({
    accepted: true,
    fromSocketId: "requester-socket",
  });

  const roomId = "friend_battle_rematch_requester-socket_socket-1_1000";
  assert.deepEqual(harness.pendingBattles[roomId], {
    lengthKey: "quick",
    player1: {
      userId: "7",
      name: "Ali",
      level: "A2",
      lengthKey: "quick",
      ready: false,
      socketId: null,
    },
    player2: {
      userId: 5,
      name: "Vali Karimov",
      level: "A2",
      lengthKey: "quick",
      ready: false,
      socketId: null,
    },
  });
  assert.deepEqual(harness.calls.filter(([type]) => type === "card"), [
    ["card", "7"],
    ["card", 5],
  ]);
  assert.deepEqual(harness.calls.slice(-2), [
    [
      "requester-emit",
      "matchFound",
      {
        roomId,
        opponent: {
          name: "Vali Karimov",
          profile_picture: "mine.png",
          rating: 1500,
          level: "A2",
        },
        lengthKey: "quick",
        redirect: true,
        message: "Rematch qabul qilindi!",
      },
    ],
    [
      "socket-emit",
      "matchFound",
      {
        roomId,
        opponent: {
          name: "Ali",
          profile_picture: "from.png",
          rating: 1700,
          level: "A2",
        },
        lengthKey: "quick",
        redirect: true,
        message: "Siz rematchni qabul qildingiz!",
      },
    ],
  ]);
});
