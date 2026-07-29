const test = require("node:test");
const assert = require("node:assert/strict");
const registerTeacherMessagingRoutes = require(
  "../src/routes/teacherMessagingRoutes"
);

test("teacher messaging registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const dependencies = {
    teacherStudentLinked: () => {},
    directMessageLimiter: () => {},
    sanitizeText: () => {},
    filterProfanity: () => {},
    onlineUsers: new Map(),
    io: {},
    createNotification: () => {},
  };
  const factory = (name) => (receivedDependencies) => {
    calls.push([name, receivedDependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    conversations: factory("conversations"),
    messagesList: factory("messages-list"),
    teacherMessageSend: factory("teacher-message-send"),
    studentMessageSend: factory("student-message-send"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerTeacherMessagingRoutes({ app, ...dependencies, routeFactories });

  assert.deepEqual(mounted, [
    "conversations-router",
    "messages-list-router",
    "teacher-message-send-router",
    "student-message-send-router",
  ]);
  assert.deepEqual(calls, [
    ["conversations", { onlineUsers: dependencies.onlineUsers }],
    ["messages-list", { teacherStudentLinked: dependencies.teacherStudentLinked }],
    ["teacher-message-send", dependencies],
    ["student-message-send", dependencies],
  ]);
});
