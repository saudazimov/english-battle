const test = require("node:test");
const assert = require("node:assert/strict");
const registerClassWatchSocket = require("../src/sockets/classWatchSocket");

function createSocket() {
  const listeners = [];
  const calls = [];
  return {
    listeners,
    calls,
    on(event, handler) {
      listeners.push({ event, handler });
    },
    join(room) {
      calls.push(["join", room]);
    },
    leave(room) {
      calls.push(["leave", room]);
    },
  };
}

test("class watch socket preserves event registration order", () => {
  const socket = createSocket();

  registerClassWatchSocket(socket);

  assert.deepEqual(socket.listeners.map(({ event }) => event), [
    "watchClass",
    "unwatchClass",
  ]);
});

test("class watch socket preserves room names and join/leave behavior", () => {
  const socket = createSocket();
  registerClassWatchSocket(socket);
  const watch = socket.listeners[0].handler;
  const unwatch = socket.listeners[1].handler;

  watch(17);
  unwatch("17");
  watch(0);
  unwatch("");

  assert.deepEqual(socket.calls, [
    ["join", "class_17"],
    ["leave", "class_17"],
    ["join", "class_0"],
    ["leave", "class_"],
  ]);
});

test("class watch socket preserves null and undefined guards", () => {
  const socket = createSocket();
  registerClassWatchSocket(socket);

  socket.listeners[0].handler(null);
  socket.listeners[0].handler(undefined);
  socket.listeners[1].handler(null);
  socket.listeners[1].handler(undefined);

  assert.deepEqual(socket.calls, []);
});
