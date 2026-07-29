const test = require("node:test");
const assert = require("node:assert/strict");
const registerBattleChatSocket = require("../src/sockets/battleChatSocket");

function createHarness({ sender, queryResult, queryError } = {}) {
  const listeners = [];
  const calls = [];
  const socket = {
    id: "socket-1",
    on(event, handler) {
      listeners.push({ event, handler });
    },
    emit(...args) {
      calls.push(["socket-emit", ...args]);
    },
  };
  const battles = sender === undefined
    ? {}
    : { room1: { players: { "socket-1": sender } } };
  registerBattleChatSocket({
    socket,
    battles,
    io: {
      to(roomId) {
        calls.push(["to", roomId]);
        return {
          emit(...args) {
            calls.push(["room-emit", ...args]);
          },
        };
      },
    },
    pool: {
      query(sql, params) {
        calls.push(["query", sql, params]);
        if (queryError) return Promise.reject(queryError);
        return queryResult || Promise.resolve({ rows: [] });
      },
    },
    stripUnsafe(message, limit) {
      calls.push(["strip", message, limit]);
      return message.trim();
    },
    filterProfanity(message) {
      calls.push(["filter", message]);
      return message.replace("bad", "***");
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { socket, listeners, calls, battles };
}

test("battle chat socket preserves state initialization and event registration", () => {
  const harness = createHarness();

  assert.equal(harness.socket.chatLast, 0);
  assert.deepEqual(harness.socket.chatTimes, []);
  assert.equal(harness.listeners.length, 1);
  assert.equal(harness.listeners[0].event, "battleChatSend");
});

test("battle chat socket preserves membership and message validation short circuits", () => {
  const outsideBattle = createHarness();
  outsideBattle.listeners[0].handler({ roomId: "room1", message: "hello" });
  assert.deepEqual(outsideBattle.calls, []);

  const member = createHarness({ sender: { userId: 7, name: "Ali" } });
  member.listeners[0].handler({ roomId: "room1", message: "" });
  member.listeners[0].handler({ roomId: "room1", message: 42 });
  assert.deepEqual(member.calls, []);
});

test("battle chat socket preserves sanitization, room emit, and SQL write", () => {
  const harness = createHarness({ sender: { userId: 7, name: "Ali" } });

  const returned = harness.listeners[0].handler({
    roomId: "room1",
    message: " bad text ",
  });

  assert.equal(returned, undefined);
  assert.deepEqual(harness.calls.slice(0, 5), [
    ["strip", " bad text ", 120],
    ["filter", "bad text"],
    ["to", "room1"],
    [
      "room-emit",
      "battleChatMessage",
      {
        senderId: 7,
        senderName: "Ali",
        message: "*** text",
        createdAt: harness.calls[3][2].createdAt,
      },
    ],
    [
      "query",
      "INSERT INTO chat_messages (room_id, sender_id, sender_name, message) VALUES ($1, $2, $3, $4)",
      ["room1", 7, "Ali", "*** text"],
    ],
  ]);
  assert.match(harness.calls[3][2].createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(harness.socket.chatTimes.length, 1);
  assert.equal(harness.socket.chatTimes[0], harness.socket.chatLast);
});

test("battle chat socket preserves sender defaults and skips bot persistence", () => {
  const harness = createHarness({ sender: { userId: null, name: "" } });

  harness.listeners[0].handler({ roomId: "room1", message: "hello" });

  assert.deepEqual(harness.calls[3].slice(0, 2), [
    "room-emit",
    "battleChatMessage",
  ]);
  assert.equal(harness.calls[3][2].senderId, null);
  assert.equal(harness.calls[3][2].senderName, "O'yinchi");
  assert.equal(harness.calls.some(([type]) => type === "query"), false);
});

test("battle chat socket preserves two-second cooldown", () => {
  const harness = createHarness({ sender: { userId: 7, name: "Ali" } });
  harness.socket.chatLast = Date.now();

  harness.listeners[0].handler({ roomId: "room1", message: "hello" });

  assert.deepEqual(harness.calls, [
    ["strip", "hello", 120],
    ["filter", "hello"],
    [
      "socket-emit",
      "battleChatError",
      { message: "Juda tez yozyapsiz. Biroz kuting." },
    ],
  ]);
});

test("battle chat socket preserves ten-second message limit", () => {
  const harness = createHarness({ sender: { userId: 7, name: "Ali" } });
  const recent = Date.now() - 3000;
  harness.socket.chatTimes = [recent, recent, recent, recent, recent];

  harness.listeners[0].handler({ roomId: "room1", message: "hello" });

  assert.deepEqual(harness.calls.at(-1), [
    "socket-emit",
    "battleChatError",
    { message: "Juda ko'p xabar yubordingiz. Biroz kuting." },
  ]);
  assert.equal(harness.calls.some(([type]) => type === "to"), false);
});

test("battle chat socket preserves asynchronous database error logging", async () => {
  const harness = createHarness({
    sender: { userId: 7, name: "Ali" },
    queryError: new Error("database unavailable"),
  });

  harness.listeners[0].handler({ roomId: "room1", message: "hello" });
  await Promise.resolve();

  assert.deepEqual(harness.calls.at(-1), [
    "error",
    "Chat saqlash xatosi:",
    "database unavailable",
  ]);
});
