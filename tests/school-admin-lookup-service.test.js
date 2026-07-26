const test = require("node:test");
const assert = require("node:assert/strict");

const { createSchoolAdminLookupService } = require("../src/services/schoolAdminLookupService");

const EXPECTED_SQL = "SELECT id, first_name, last_name, role, school, region, district FROM users WHERE id = $1";

function createService(rows, identity = "toshkent|chilonzor|1-maktab") {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows };
    },
  };
  const identityCalls = [];
  const service = createSchoolAdminLookupService({
    pool,
    schoolIdentityKey(region, district, school) {
      identityCalls.push([region, district, school]);
      return identity;
    },
  });
  return { service, calls, identityCalls };
}

test("school-admin lookup preserves missing-user response and SQL", async () => {
  const { service, calls, identityCalls } = createService([]);

  assert.deepEqual(await service(44), {
    ok: false,
    error: "Foydalanuvchi topilmadi",
  });
  assert.deepEqual(calls, [{ sql: EXPECTED_SQL, params: [44] }]);
  assert.deepEqual(identityCalls, []);
});

test("school-admin lookup preserves role rejection", async () => {
  const user = { id: 7, role: "teacher" };
  const { service, identityCalls } = createService([user]);

  assert.deepEqual(await service(7), {
    ok: false,
    error: "Faqat maktab admini uchun",
  });
  assert.deepEqual(identityCalls, []);
  assert.equal(user.school_key, undefined);
});

test("school-admin lookup preserves incomplete-school response", async () => {
  const user = {
    id: 8,
    role: "school_admin",
    region: "Toshkent",
    district: "Chilonzor",
    school: null,
  };
  const { service, identityCalls } = createService([user], null);

  assert.deepEqual(await service(8), {
    ok: false,
    error: "Viloyat, tuman yoki maktabingiz to'liq belgilanmagan",
  });
  assert.deepEqual(identityCalls, [["Toshkent", "Chilonzor", null]]);
  assert.equal(user.school_key, null);
});

test("school-admin lookup preserves successful row mutation and response", async () => {
  const user = {
    id: 9,
    role: "school_admin",
    region: "Toshkent",
    district: "Chilonzor",
    school: "1-maktab",
  };
  const { service, calls, identityCalls } = createService([user]);

  const result = await service(9);

  assert.deepEqual(calls, [{ sql: EXPECTED_SQL, params: [9] }]);
  assert.deepEqual(identityCalls, [["Toshkent", "Chilonzor", "1-maktab"]]);
  assert.equal(result.user, user);
  assert.deepEqual(result, {
    ok: true,
    user: { ...user, school_key: "toshkent|chilonzor|1-maktab" },
  });
});
