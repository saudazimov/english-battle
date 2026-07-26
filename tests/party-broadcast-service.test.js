const test = require("node:test");
const assert = require("node:assert/strict");

const { createPartyBroadcastService } = require("../src/services/partyBroadcastService");

function createHarness(parties) {
  const emissions = [];
  const broadcastParty = createPartyBroadcastService({
    parties,
    io: {
      to(socketId) {
        return {
          emit(event, payload) {
            emissions.push({ socketId, event, payload });
          },
        };
      },
    },
  });
  return { broadcastParty, emissions };
}

test("party broadcast preserves missing-party early return", () => {
  const { broadcastParty, emissions } = createHarness({});

  assert.equal(broadcastParty("missing"), undefined);
  assert.deepEqual(emissions, []);
});

test("party broadcast preserves payload mapping and recipient order", () => {
  const parties = {
    party_1: {
      leader: 7,
      teamMode: "duo",
      maxSize: 2,
      status: "forming",
      members: [
        { userId: 7, name: "Leader", socketId: "socket-1", profile_picture: "/leader.png" },
        { userId: 8, name: "Member", socketId: "socket-2", profile_picture: "" },
        { userId: 9, name: "Offline", socketId: null },
      ],
    },
  };
  const { broadcastParty, emissions } = createHarness(parties);

  assert.equal(broadcastParty("party_1"), undefined);
  assert.deepEqual(emissions.map(({ socketId, event }) => ({ socketId, event })), [
    { socketId: "socket-1", event: "partyUpdated" },
    { socketId: "socket-2", event: "partyUpdated" },
  ]);
  assert.deepEqual(emissions[0].payload, {
    partyId: "party_1",
    teamMode: "duo",
    maxSize: 2,
    status: "forming",
    leaderId: 7,
    members: [
      { userId: 7, name: "Leader", isLeader: true, profile_picture: "/leader.png" },
      { userId: 8, name: "Member", isLeader: false, profile_picture: null },
      { userId: 9, name: "Offline", isLeader: false, profile_picture: null },
    ],
  });
  assert.equal(emissions[0].payload, emissions[1].payload);
});

test("party broadcast preserves strict leader comparison", () => {
  const parties = {
    party_2: {
      leader: 7,
      teamMode: "squad",
      maxSize: 4,
      status: "forming",
      members: [{ userId: "7", name: "String ID", socketId: "socket-7" }],
    },
  };
  const { broadcastParty, emissions } = createHarness(parties);

  broadcastParty("party_2");

  assert.equal(emissions[0].payload.members[0].isLeader, false);
});
