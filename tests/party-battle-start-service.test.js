const test = require("node:test");
const assert = require("node:assert/strict");

const { createPartyBattleStartService } = require("../src/services/partyBattleStartService");

function createHarness({ pendingPartyMatches, parties = {}, userParty = {} }) {
  const calls = [];
  const startPartyBattle = createPartyBattleStartService({
    pendingPartyMatches,
    parties,
    userParty,
    addTeamEntry(mode, entry) {
      calls.push(["add", mode, entry]);
    },
    logger: {
      log(...args) { calls.push(["log", ...args]); },
    },
  });
  return { calls, parties, pendingPartyMatches, startPartyBattle, userParty };
}

test("party battle start preserves missing-pending early return", () => {
  const harness = createHarness({ pendingPartyMatches: {} });

  assert.equal(harness.startPartyBattle("missing"), undefined);
  assert.deepEqual(harness.calls, []);
});

test("party battle start deletes empty pending match but keeps party state", () => {
  const party = { members: [{ userId: "7" }] };
  const harness = createHarness({
    pendingPartyMatches: {
      party_1: { teamMode: "duo", teamSize: 2, arrived: {} },
    },
    parties: { party_1: party },
    userParty: { 7: "party_1" },
  });

  harness.startPartyBattle("party_1");

  assert.deepEqual(harness.pendingPartyMatches, {});
  assert.equal(harness.parties.party_1, party);
  assert.deepEqual(harness.userParty, { 7: "party_1" });
  assert.deepEqual(harness.calls, []);
});

test("party battle start truncates arrivals, cleans party state, and adds entry", () => {
  const player1 = { userId: "1" };
  const player2 = { userId: "2" };
  const player3 = { userId: "3" };
  const harness = createHarness({
    pendingPartyMatches: {
      party_2: {
        teamMode: "duo",
        teamSize: 2,
        arrived: { 1: player1, 2: player2, 3: player3 },
      },
    },
    parties: {
      party_2: { members: [{ userId: "1" }, { userId: "2" }, { userId: "offline" }] },
    },
    userParty: { 1: "party_2", 2: "party_2", offline: "party_2", other: "party_3" },
  });

  assert.equal(harness.startPartyBattle("party_2"), undefined);

  assert.deepEqual(harness.pendingPartyMatches, {});
  assert.deepEqual(harness.parties, {});
  assert.deepEqual(harness.userParty, { other: "party_3" });
  assert.deepEqual(harness.calls, [
    ["log", "Party poolga qo'shildi [duo]: party=party_2 (2 a'zo)"],
    ["add", "duo", {
      id: "party_party_2",
      type: "party",
      size: 2,
      players: [player1, player2],
      partyId: "party_2",
    }],
  ]);
});

test("party battle start preserves user mappings when party state is absent", () => {
  const player = { userId: "7" };
  const harness = createHarness({
    pendingPartyMatches: {
      missing_party: { teamMode: "squad", teamSize: 4, arrived: { 7: player } },
    },
    userParty: { 7: "missing_party" },
  });

  harness.startPartyBattle("missing_party");

  assert.deepEqual(harness.userParty, { 7: "missing_party" });
  assert.deepEqual(harness.calls.at(-1), ["add", "squad", {
    id: "party_missing_party",
    type: "party",
    size: 1,
    players: [player],
    partyId: "missing_party",
  }]);
});
