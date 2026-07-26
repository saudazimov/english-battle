const test = require("node:test");
const assert = require("node:assert/strict");
const { createLocationController } = require("../src/controllers/locationController");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createController(calls = []) {
  return createLocationController({
    getCountries: () => [{ code: "UZ" }],
    getStates: (country) => {
      calls.push(["states", country]);
      return [{ code: "TK" }];
    },
    getCities: (country, state) => {
      calls.push(["cities", country, state]);
      return [{ name: "Toshkent" }];
    },
  });
}

test("countries preserves the existing response shape", () => {
  const response = createResponse();
  createController().countries({ query: {} }, response);
  assert.deepEqual(response.body, { countries: [{ code: "UZ" }] });
});

test("states normalizes the country code and returns states", () => {
  const calls = [];
  const response = createResponse();
  createController(calls).states({ query: { country: "uz" } }, response);
  assert.deepEqual(calls, [["states", "UZ"]]);
  assert.deepEqual(response.body, { states: [{ code: "TK" }] });
});

test("states rejects an invalid country code with the existing error", () => {
  const response = createResponse();
  createController().states({ query: { country: "U" } }, response);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Davlat kodi noto'g'ri" });
});

test("cities passes normalized location codes through", () => {
  const calls = [];
  const response = createResponse();
  createController(calls).cities({ query: { country: "uz", state: "TK" } }, response);
  assert.deepEqual(calls, [["cities", "UZ", "TK"]]);
  assert.deepEqual(response.body, { cities: [{ name: "Toshkent" }] });
});

test("cities rejects incomplete location data with the existing error", () => {
  const response = createResponse();
  createController().cities({ query: { country: "UZ" } }, response);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Davlat va viloyat kodi kerak" });
});
