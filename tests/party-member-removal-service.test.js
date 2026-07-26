const test = require("node:test");
const assert = require("node:assert/strict");

const { createPartyMemberRemovalService } = require("../src/services/partyMemberRemovalService");

function createHarness(parties, userParty) {
  const broadcasts = [];
  const removeFromParty = createPartyMemberRemovalService({
    parties,
    userParty,
    broadcastParty(partyId) {
      broadcasts.push(partyId);
    },
  });
  return { removeFromParty, broadcasts };
}

test("party member removal preserves missing-membership early return", () => {
  const parties = { party_1: { leader: "7", members: [{ userId: "7" }] } };
  const userParty = {};
  const { removeFromParty, broadcasts } = createHarness(parties, userParty);

  assert.equal(removeFromParty("7"), undefined);
  assert.equal(parties.party_1.members.length, 1);
  assert.deepEqual(broadcasts, []);
});

test("party member removal cleans stale user mapping", () => {
  const parties = {};
  const userParty = { 7: "missing-party" };
  const { removeFromParty, broadcasts } = createHarness(parties, userParty);

  removeFromParty("7");

  assert.deepEqual(userParty, {});
  assert.deepEqual(broadcasts, []);
});

test("party member removal deletes an empty party without broadcasting", () => {
  const parties = { party_1: { leader: "7", members: [{ userId: "7" }] } };
  const userParty = { 7: "party_1" };
  const { removeFromParty, broadcasts } = createHarness(parties, userParty);

  removeFromParty("7");

  assert.deepEqual(parties, {});
  assert.deepEqual(userParty, {});
  assert.deepEqual(broadcasts, []);
});

test("party member removal transfers leadership and broadcasts after mutation", () => {
  const remaining = { userId: "8", name: "Next leader" };
  const parties = {
    party_1: {
      leader: "7",
      members: [{ userId: "7", name: "Old leader" }, remaining],
    },
  };
  const userParty = { 7: "party_1", 8: "party_1" };
  const { removeFromParty, broadcasts } = createHarness(parties, userParty);

  removeFromParty("7");

  assert.deepEqual(parties.party_1.members, [remaining]);
  assert.equal(parties.party_1.leader, "8");
  assert.deepEqual(userParty, { 8: "party_1" });
  assert.deepEqual(broadcasts, ["party_1"]);
});

test("party member removal preserves strict member ID comparison", () => {
  const member = { userId: "7" };
  const parties = { party_1: { leader: "7", members: [member] } };
  const userParty = { 7: "party_1" };
  const { removeFromParty, broadcasts } = createHarness(parties, userParty);

  removeFromParty(7);

  assert.deepEqual(parties.party_1.members, [member]);
  assert.equal(parties.party_1.leader, "7");
  assert.deepEqual(userParty, {});
  assert.deepEqual(broadcasts, ["party_1"]);
});
