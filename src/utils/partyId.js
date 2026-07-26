function makePartyId() {
  return "party_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
}

module.exports = { makePartyId };
