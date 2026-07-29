const test = require("node:test");
const assert = require("node:assert/strict");
const registerFriendRoutes = require("../src/routes/friendRoutes");

test("friend registrar preserves route order and dependency wiring", () => {
  const calls = [];
  const mounted = [];
  const createNotification = () => {};
  const io = { marker: "io" };
  const onlineUsers = { marker: "online" };
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return name + "-router";
  };
  const routeFactories = {
    search: factory("search"),
    suggested: factory("suggested"),
    request: factory("request"),
    respond: factory("respond"),
    remove: factory("remove"),
    requests: factory("requests"),
    list: factory("list"),
    wins: factory("wins"),
    activity: factory("activity"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerFriendRoutes({
    app,
    createNotification,
    io,
    onlineUsers,
    routeFactories,
  });

  assert.deepEqual(mounted, [
    "search-router",
    "suggested-router",
    "request-router",
    "respond-router",
    "remove-router",
    "requests-router",
    "list-router",
    "wins-router",
    "activity-router",
  ]);
  assert.deepEqual(calls, [
    ["search", undefined],
    ["suggested", undefined],
    ["request", { createNotification, io, onlineUsers }],
    ["respond", { createNotification, io, onlineUsers }],
    ["remove", { io, onlineUsers }],
    ["requests", undefined],
    ["list", { onlineUsers }],
    ["wins", undefined],
    ["activity", undefined],
  ]);
});
