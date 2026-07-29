const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createSocketAuthMiddleware,
  createSocketServer,
  registerSocketConnection,
} = require("../src/sockets/socketBootstrap");

test("socket server preserves constructor options and authentication middleware", () => {
  const server = {};
  const corsOptions = {};
  const pool = {};
  const instances = [];

  class FakeServer {
    constructor(receivedServer, options) {
      this.server = receivedServer;
      this.options = options;
      this.middleware = [];
      instances.push(this);
    }

    use(middleware) {
      this.middleware.push(middleware);
    }
  }

  const io = createSocketServer({
    server,
    corsOptions,
    pool,
    ServerClass: FakeServer,
    verifyToken: () => null,
  });

  assert.equal(io, instances[0]);
  assert.equal(io.server, server);
  assert.deepEqual(io.options, { cors: corsOptions });
  assert.equal(io.middleware.length, 1);
  assert.equal(typeof io.middleware[0], "function");
});

test("socket authentication preserves SQL, identity mapping and success", async () => {
  const queries = [];
  const socket = {
    handshake: {
      auth: { token: "auth-token" },
      query: { token: "query-token" },
    },
  };
  const nextCalls = [];
  const middleware = createSocketAuthMiddleware({
    pool: {
      async query(sql, params) {
        queries.push([sql, params]);
        return { rows: [{ id: 42, is_banned: false, auth_version: 3 }] };
      },
    },
    verifyToken(token) {
      assert.equal(token, "auth-token");
      return { id: 42, ver: 3 };
    },
    logger: { error() {} },
  });

  await middleware(socket, (error) => nextCalls.push(error));

  assert.deepEqual(queries, [[
    "SELECT id, is_banned, auth_version FROM users WHERE id = $1",
    [42],
  ]]);
  assert.equal(socket.authUserId, "42");
  assert.equal(socket.userId, "42");
  assert.deepEqual(nextCalls, [undefined]);
});

test("socket authentication preserves rejection and service error responses", async () => {
  const cases = [
    { decoded: null, rows: [], expected: "AUTH_REQUIRED", queryCount: 0 },
    { decoded: { id: 1 }, rows: [], expected: "ACCOUNT_NOT_FOUND", queryCount: 1 },
    {
      decoded: { id: 1 },
      rows: [{ id: 1, is_banned: true, auth_version: 0 }],
      expected: "ACCOUNT_BANNED",
      queryCount: 1,
    },
    {
      decoded: { id: 1, ver: 2 },
      rows: [{ id: 1, is_banned: false, auth_version: 3 }],
      expected: "SESSION_REVOKED",
      queryCount: 1,
    },
  ];

  for (const testCase of cases) {
    let queryCount = 0;
    let nextError;
    const middleware = createSocketAuthMiddleware({
      pool: {
        async query() {
          queryCount += 1;
          return { rows: testCase.rows };
        },
      },
      verifyToken: () => testCase.decoded,
      logger: { error() {} },
    });

    await middleware(
      { handshake: { auth: {}, query: {} } },
      (error) => {
        nextError = error;
      }
    );

    assert.equal(nextError.message, testCase.expected);
    assert.equal(queryCount, testCase.queryCount);
  }

  const logCalls = [];
  let serviceError;
  const databaseError = new Error("database unavailable");
  const middleware = createSocketAuthMiddleware({
    pool: {
      async query() {
        throw databaseError;
      },
    },
    verifyToken: () => ({ id: 1 }),
    logger: { error: (...args) => logCalls.push(args) },
  });

  await middleware(
    { handshake: { auth: {}, query: { token: "token" } } },
    (error) => {
      serviceError = error;
    }
  );

  assert.equal(serviceError.message, "AUTH_SERVICE_ERROR");
  assert.deepEqual(logCalls, [["Socket autentifikatsiya xatosi:", databaseError.message]]);
});

test("socket connection preserves registrar order and dependencies", () => {
  const marker = (name) => ({ name });
  const calls = [];
  const loggerCalls = [];
  let connectionHandler;
  const io = {
    on(event, handler) {
      assert.equal(event, "connection");
      connectionHandler = handler;
    },
  };
  const socket = { id: "socket-1" };
  const dependencies = {
    io,
    pool: marker("pool"),
    battles: marker("battles"),
    userToRoom: marker("userToRoom"),
    onlineUsers: marker("onlineUsers"),
    removeFromQueue: marker("removeFromQueue"),
    notifyFriendsStatus: marker("notifyFriendsStatus"),
    removeFromParty: marker("removeFromParty"),
    emitTeamProgress: marker("emitTeamProgress"),
    checkTeamFinish: marker("checkTeamFinish"),
    finishBattle: marker("finishBattle"),
    stripUnsafe: marker("stripUnsafe"),
    filterProfanity: marker("filterProfanity"),
    battleLengths: marker("battleLengths"),
    pendingRematches: marker("pendingRematches"),
    pendingBattles: marker("pendingBattles"),
    getOpponentCardInfo: marker("getOpponentCardInfo"),
    parties: marker("parties"),
    userParty: marker("userParty"),
    pendingPartyMatches: marker("pendingPartyMatches"),
    broadcastParty: marker("broadcastParty"),
    startPartyBattle: marker("startPartyBattle"),
    makePartyId: marker("makePartyId"),
    startBattle: marker("startBattle"),
    waitingQueue: marker("waitingQueue"),
    tryQueueMatch: marker("tryQueueMatch"),
    getRandomBotName: marker("getRandomBotName"),
    startBotBattle: marker("startBotBattle"),
    saveBattleSession: marker("saveBattleSession"),
    timePerQuestionMs: 15000,
    answerGraceMs: 2000,
    recentlyFinished: marker("recentlyFinished"),
    finishBattleSession: marker("finishBattleSession"),
    rebindPlayerSocket: marker("rebindPlayerSocket"),
    teamMatchPool: marker("teamMatchPool"),
    addTeamEntry: marker("addTeamEntry"),
    emitTeamQueueStatus: marker("emitTeamQueueStatus"),
    logger: {
      log: (...args) => loggerCalls.push(args),
      error() {},
    },
  };
  const registrars = {
    registerClassWatchSocket(receivedSocket) {
      calls.push(["class-watch", receivedSocket]);
    },
    createConnectionLifecycleSocket(received) {
      calls.push(["connection-lifecycle", received]);
      return {
        registerPresenceSocket() {
          calls.push(["presence"]);
        },
        registerDisconnectSocketHandler() {
          calls.push(["disconnect"]);
        },
      };
    },
    registerBattleSocialSocket(received) {
      calls.push(["battle-social", received]);
    },
    registerPartySocket(received) {
      calls.push(["party", received]);
    },
    createFriendBattleSocket(received) {
      calls.push(["friend-battle", received]);
      return {
        registerChallengeSocket() {
          calls.push(["friend-challenge"]);
        },
        registerBattleJoinSocket() {
          calls.push(["friend-join"]);
        },
      };
    },
    createSoloBattleSocket(received) {
      calls.push(["solo-battle", received]);
      return {
        registerMatchmakingSocket() {
          calls.push(["solo-matchmaking"]);
        },
        registerLifecycleSocket() {
          calls.push(["solo-lifecycle"]);
        },
      };
    },
    registerTeamBattleSocket(received) {
      calls.push(["team-battle", received]);
    },
  };

  registerSocketConnection({ ...dependencies, registrars });
  assert.equal(typeof connectionHandler, "function");
  connectionHandler(socket);

  assert.deepEqual(calls.map(([name]) => name), [
    "class-watch",
    "connection-lifecycle",
    "presence",
    "battle-social",
    "party",
    "friend-battle",
    "friend-challenge",
    "friend-join",
    "solo-battle",
    "solo-matchmaking",
    "team-battle",
    "solo-lifecycle",
    "disconnect",
  ]);
  assert.equal(calls[0][1], socket);
  assert.deepEqual(loggerCalls, [
    ["Socket connected:", socket.id],
    ["Yangi o'yinchi ulandi:", socket.id],
  ]);

  const receivedByName = Object.fromEntries(
    calls.filter((call) => call.length === 2).map(([name, received]) => [name, received])
  );
  assert.deepEqual(receivedByName["connection-lifecycle"], {
    socket,
    pool: dependencies.pool,
    battles: dependencies.battles,
    userToRoom: dependencies.userToRoom,
    onlineUsers: dependencies.onlineUsers,
    removeFromQueue: dependencies.removeFromQueue,
    notifyFriendsStatus: dependencies.notifyFriendsStatus,
    removeFromParty: dependencies.removeFromParty,
    emitTeamProgress: dependencies.emitTeamProgress,
    checkTeamFinish: dependencies.checkTeamFinish,
    finishBattle: dependencies.finishBattle,
    logger: dependencies.logger,
  });
  assert.deepEqual(receivedByName["battle-social"], {
    socket,
    io,
    pool: dependencies.pool,
    battles: dependencies.battles,
    onlineUsers: dependencies.onlineUsers,
    stripUnsafe: dependencies.stripUnsafe,
    filterProfanity: dependencies.filterProfanity,
    battleLengths: dependencies.battleLengths,
    pendingRematches: dependencies.pendingRematches,
    pendingBattles: dependencies.pendingBattles,
    getOpponentCardInfo: dependencies.getOpponentCardInfo,
    logger: dependencies.logger,
  });
  assert.deepEqual(receivedByName.party, {
    socket,
    io,
    parties: dependencies.parties,
    userParty: dependencies.userParty,
    onlineUsers: dependencies.onlineUsers,
    pendingPartyMatches: dependencies.pendingPartyMatches,
    removeFromParty: dependencies.removeFromParty,
    broadcastParty: dependencies.broadcastParty,
    startPartyBattle: dependencies.startPartyBattle,
    stripUnsafe: dependencies.stripUnsafe,
    makePartyId: dependencies.makePartyId,
    logger: dependencies.logger,
  });
  assert.deepEqual(receivedByName["friend-battle"], {
    socket,
    io,
    pool: dependencies.pool,
    onlineUsers: dependencies.onlineUsers,
    stripUnsafe: dependencies.stripUnsafe,
    getOpponentCardInfo: dependencies.getOpponentCardInfo,
    pendingBattles: dependencies.pendingBattles,
    startBattle: dependencies.startBattle,
    logger: dependencies.logger,
  });
  assert.deepEqual(receivedByName["solo-battle"], {
    socket,
    pool: dependencies.pool,
    battles: dependencies.battles,
    waitingQueue: dependencies.waitingQueue,
    removeFromQueue: dependencies.removeFromQueue,
    tryQueueMatch: dependencies.tryQueueMatch,
    stripUnsafe: dependencies.stripUnsafe,
    getRandomBotName: dependencies.getRandomBotName,
    startBotBattle: dependencies.startBotBattle,
    saveBattleSession: dependencies.saveBattleSession,
    finishBattle: dependencies.finishBattle,
    timePerQuestionMs: dependencies.timePerQuestionMs,
    answerGraceMs: dependencies.answerGraceMs,
    userToRoom: dependencies.userToRoom,
    recentlyFinished: dependencies.recentlyFinished,
    finishBattleSession: dependencies.finishBattleSession,
    rebindPlayerSocket: dependencies.rebindPlayerSocket,
    emitTeamProgress: dependencies.emitTeamProgress,
    checkTeamFinish: dependencies.checkTeamFinish,
    logger: dependencies.logger,
  });
  assert.deepEqual(receivedByName["team-battle"], {
    socket,
    io,
    pool: dependencies.pool,
    battles: dependencies.battles,
    teamMatchPool: dependencies.teamMatchPool,
    addTeamEntry: dependencies.addTeamEntry,
    emitTeamQueueStatus: dependencies.emitTeamQueueStatus,
    stripUnsafe: dependencies.stripUnsafe,
    emitTeamProgress: dependencies.emitTeamProgress,
    checkTeamFinish: dependencies.checkTeamFinish,
    timePerQuestionMs: dependencies.timePerQuestionMs,
    answerGraceMs: dependencies.answerGraceMs,
    logger: dependencies.logger,
  });
});
