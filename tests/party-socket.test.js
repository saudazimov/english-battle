const test = require("node:test");
const assert = require("node:assert/strict");
const registerPartySocket = require("../src/sockets/partySocket");

function createHarness({
  userId = 5,
  parties = {},
  userParty = {},
  onlineUsers = {},
  pendingPartyMatches = {},
} = {}) {
  const calls = [];
  const listeners = [];
  const timers = [];
  const socket = {
    id: "socket-5",
    userId,
    on(event, handler) {
      listeners.push({ event, handler });
    },
    emit(...args) {
      calls.push(["socket-emit", ...args]);
    },
  };
  registerPartySocket({
    socket,
    io: {
      to(socketId) {
        calls.push(["to", socketId]);
        return {
          emit(...args) {
            calls.push(["target-emit", ...args]);
          },
        };
      },
    },
    parties,
    userParty,
    onlineUsers,
    pendingPartyMatches,
    removeFromParty(uid) {
      calls.push(["remove", uid]);
    },
    broadcastParty(partyId) {
      calls.push(["broadcast", partyId]);
    },
    startPartyBattle(partyId) {
      calls.push(["start", partyId]);
    },
    stripUnsafe(value, limit) {
      calls.push(["strip", value, limit]);
      return typeof value === "string" ? value.trim() : "";
    },
    makePartyId() {
      calls.push(["makeId"]);
      return "party-fixed";
    },
    setTimer(callback, delay) {
      const timer = { callback, delay, id: "timer-" + (timers.length + 1) };
      timers.push(timer);
      calls.push(["timer", delay, timer.id]);
      return timer.id;
    },
    clearTimer(timer) {
      calls.push(["clear", timer]);
    },
    logger: {
      log(...args) {
        calls.push(["log", ...args]);
      },
    },
  });
  return {
    calls,
    listeners,
    timers,
    parties,
    userParty,
    pendingPartyMatches,
    handlers: Object.fromEntries(
      listeners.map(({ event, handler }) => [event, handler])
    ),
  };
}

function party(overrides = {}) {
  return {
    leader: 5,
    teamMode: "duo",
    maxSize: 2,
    status: "forming",
    invited: {},
    members: [{ userId: 5, socketId: "socket-5", isLeader: true }],
    ...overrides,
  };
}

test("party socket preserves listener registration order", () => {
  const harness = createHarness();

  assert.deepEqual(harness.listeners.map(({ event }) => event), [
    "createParty",
    "inviteToParty",
    "acceptPartyInvite",
    "declinePartyInvite",
    "leaveParty",
    "startPartyQueue",
    "joinPartyMatch",
  ]);
});

test("create party preserves token identity, previous removal, state, and order", () => {
  const harness = createHarness({ userParty: { 5: "old-party" } });

  harness.handlers.createParty({
    userId: 99,
    name: " Ali ",
    teamMode: "squad",
    profile_picture: "ali.png",
  });

  assert.deepEqual(harness.parties["party-fixed"], {
    leader: 5,
    teamMode: "squad",
    maxSize: 4,
    status: "forming",
    invited: {},
    members: [{
      userId: 5,
      name: "Ali",
      socketId: "socket-5",
      isLeader: true,
      profile_picture: "ali.png",
    }],
  });
  assert.equal(harness.userParty[5], "party-fixed");
  assert.deepEqual(harness.calls, [
    ["remove", 5],
    ["makeId"],
    ["strip", " Ali ", 60],
    ["socket-emit", "partyCreated", { partyId: "party-fixed" }],
    ["broadcast", "party-fixed"],
    ["log", "Party yaratildi [squad]: party-fixed lider:5"],
  ]);
});

test("create party preserves unauthenticated silent return", () => {
  const harness = createHarness({ userId: null });
  harness.handlers.createParty({ name: "Ali" });
  assert.deepEqual(harness.calls, []);
});

test("invite preserves sanitization, invitation state, and payloads", () => {
  const parties = { room: party() };
  const harness = createHarness({
    parties,
    onlineUsers: { 7: "socket-7" },
  });

  harness.handlers.inviteToParty({
    partyId: "room",
    fromName: " Ali ",
    toUserId: 7,
  });

  assert.equal(parties.room.invited[7], true);
  assert.deepEqual(harness.calls, [
    ["strip", " Ali ", 60],
    ["to", "socket-7"],
    [
      "target-emit",
      "partyInviteReceived",
      { partyId: "room", fromName: "Ali", teamMode: "duo" },
    ],
    ["socket-emit", "partyInviteSent", { toUserId: "7" }],
    ["log", "Party taklif: room -> 7"],
  ]);
});

test("invite preserves validation order and messages", () => {
  const missing = createHarness();
  missing.handlers.inviteToParty({ partyId: "missing", fromName: "Ali" });
  assert.deepEqual(missing.calls.slice(-1), [
    ["socket-emit", "partyError", { message: "Party topilmadi" }],
  ]);

  const notLeader = createHarness({ parties: { room: party({ leader: 7 }) } });
  notLeader.handlers.inviteToParty({ partyId: "room", fromName: "Ali" });
  assert.deepEqual(notLeader.calls.at(-1), [
    "socket-emit", "partyError", { message: "Faqat lider taklif yubora oladi" },
  ]);

  const full = createHarness({
    parties: { room: party({ members: [{}, {}] }) },
  });
  full.handlers.inviteToParty({ partyId: "room", fromName: "Ali" });
  assert.deepEqual(full.calls.at(-1), [
    "socket-emit", "partyError", { message: "Party to'la" },
  ]);
});

test("accept invite preserves token identity and previous party removal", () => {
  const parties = { room: party({ invited: { 7: true } }) };
  const userParty = { 7: "old-party" };
  const harness = createHarness({ userId: 7, parties, userParty });

  harness.handlers.acceptPartyInvite({
    partyId: "room",
    userId: 99,
    name: " Vali ",
    profile_picture: "vali.png",
  });

  assert.deepEqual(parties.room.members.at(-1), {
    userId: "7",
    name: "Vali",
    socketId: "socket-5",
    isLeader: false,
    profile_picture: "vali.png",
  });
  assert.equal(parties.room.invited[7], undefined);
  assert.equal(userParty[7], "room");
  assert.deepEqual(harness.calls, [
    ["remove", "7"],
    ["strip", " Vali ", 60],
    ["broadcast", "room"],
    ["log", "Party qo'shildi: 7 -> room"],
  ]);
});

test("decline and leave preserve target and token-derived user", () => {
  const harness = createHarness({
    userId: 7,
    parties: { room: party() },
    onlineUsers: { 5: "leader-socket" },
  });

  harness.handlers.declinePartyInvite({ partyId: "room", name: "Vali" });
  harness.handlers.leaveParty({ userId: 99 });

  assert.deepEqual(harness.calls, [
    ["to", "leader-socket"],
    ["target-emit", "partyInviteDeclined", { byName: "Vali" }],
    ["remove", "7"],
    ["socket-emit", "partyLeft", {}],
  ]);
});

test("start queue preserves pending state and member notification order", () => {
  const parties = {
    room: party({
      members: [
        { userId: 5, socketId: "socket-5" },
        { userId: "7", socketId: "socket-7" },
      ],
    }),
  };
  const harness = createHarness({ parties });

  harness.handlers.startPartyQueue({ partyId: "room", userId: 99 });

  assert.equal(parties.room.status, "in_battle");
  assert.deepEqual(harness.pendingPartyMatches.room, {
    teamMode: "duo",
    teamSize: 2,
    expected: ["5", "7"],
    arrived: {},
    timer: null,
  });
  assert.deepEqual(harness.calls, [
    ["to", "socket-5"],
    ["target-emit", "partyMatchStarting", { teamMode: "duo", partyId: "room" }],
    ["to", "socket-7"],
    ["target-emit", "partyMatchStarting", { teamMode: "duo", partyId: "room" }],
    ["log", "Party queue boshlandi: room (2 a'zo)"],
  ]);
});

test("join party match preserves expiry and membership failures", () => {
  const missing = createHarness();
  missing.handlers.joinPartyMatch({ partyId: "missing" });
  assert.deepEqual(missing.calls, [
    ["to", "socket-5"],
    ["target-emit", "partyMatchExpired", {}],
  ]);

  const denied = createHarness({
    pendingPartyMatches: {
      room: { expected: ["7"], arrived: {}, timer: null },
    },
  });
  denied.handlers.joinPartyMatch({ partyId: "room", userId: 5 });
  assert.deepEqual(denied.calls, [
    ["socket-emit", "partyError", { message: "Siz bu party a'zosi emassiz" }],
  ]);
});

test("first party arrival preserves state and twelve-second timer", () => {
  const pendingPartyMatches = {
    room: { expected: ["5", "7"], arrived: {}, timer: null },
  };
  const harness = createHarness({ pendingPartyMatches });

  harness.handlers.joinPartyMatch({
    partyId: "room",
    userId: 99,
    name: " Ali ",
    level: "B1",
    lengthKey: "quick",
    profile_picture: "ali.png",
  });

  assert.deepEqual(pendingPartyMatches.room.arrived[5], {
    socketId: "socket-5",
    userId: 5,
    name: "Ali",
    level: "B1",
    rating: 1000,
    lengthKey: "quick",
    profile_picture: "ali.png",
  });
  assert.equal(pendingPartyMatches.room.timer, "timer-1");
  assert.deepEqual(harness.calls, [
    ["strip", " Ali ", 60],
    ["log", "Party a'zosi yetib keldi: 5 -> room (1/2)"],
    ["timer", 12000, "timer-1"],
  ]);
  harness.timers[0].callback();
  assert.deepEqual(harness.calls.at(-1), ["start", "room"]);
});

test("final party arrival preserves timer clear and immediate start", () => {
  const pendingPartyMatches = {
    room: {
      expected: ["5", "7"],
      arrived: { 7: { userId: 7 } },
      timer: "timer-old",
    },
  };
  const harness = createHarness({ pendingPartyMatches });

  harness.handlers.joinPartyMatch({ partyId: "room", name: "Ali" });

  assert.deepEqual(harness.calls.slice(-2), [
    ["clear", "timer-old"],
    ["start", "room"],
  ]);
});
