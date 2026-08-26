const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { CEFR_LEVELS, INITIAL_RATING } = require("../utils/ratingProgression");

const LOGIN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const PASSWORD_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
const STARTING_RATINGS = new Map(
  CEFR_LEVELS.map((level) => [level.name, level.name === "A1" ? INITIAL_RATING : level.min])
);

function randomText(length, alphabet) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function createLogin() {
  return `IL-${randomText(4, LOGIN_ALPHABET)}-${randomText(4, LOGIN_ALPHABET)}`;
}

function createPassword() {
  return `A${randomText(9, PASSWORD_ALPHABET)}7a`;
}

function cleanText(value, maxLength) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text.length <= maxLength ? text : "";
}

function validateRow(row, index) {
  const rawLevel = cleanText(
    row.cefr_level || row.cefrLevel || row.daraja || row.level || "A1",
    5
  ).toUpperCase();
  const normalized = {
    firstName: cleanText(row.first_name || row.firstName || row.ism, 100),
    lastName: cleanText(row.last_name || row.lastName || row.familiya, 100),
    school: cleanText(row.school || row.maktab, 200),
    className: cleanText(row.class_name || row.className || row.sinf, 50),
    cefrLevel: rawLevel,
  };
  const missing = ["firstName", "lastName", "school", "className"]
    .find((key) => !normalized[key]);
  if (missing) {
    return { error: `Qator ${index + 1}: ism, familiya, maktab va sinf majburiy` };
  }
  if (!STARTING_RATINGS.has(normalized.cefrLevel)) {
    return { error: `Qator ${index + 1}: daraja A1, A2, B1, B2, C1 yoki C2 bo'lishi kerak` };
  }
  normalized.rating = STARTING_RATINGS.get(normalized.cefrLevel);
  return { value: normalized };
}

function createAdminStudentProvisioningService({ pool, bcryptImpl = bcrypt }) {
  async function insertStudent(client, profile) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const login = createLogin();
      const password = createPassword();
      const passwordHash = await bcryptImpl.hash(password, 10);
      const result = await client.query(
        `INSERT INTO users
          (first_name, last_name, phone, password, role, username, school, class_name,
           country, cefr_level, rating)
         VALUES ($1,$2,NULL,$3,'student',$4,$5,$6,'UZ',$7,$8)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          profile.firstName,
          profile.lastName,
          passwordHash,
          login,
          profile.school,
          profile.className,
          profile.cefrLevel,
          profile.rating,
        ]
      );
      if (result.rows[0]) {
        return { id: result.rows[0].id, login, password, ...profile };
      }
    }
    throw new Error("Noyob login yaratib bo'lmadi");
  }

  async function provision(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return { status: "empty" };
    if (rows.length > 1000) return { status: "too-many" };
    const validated = rows.map(validateRow);
    const errors = validated.filter((item) => item.error).map((item) => item.error);
    if (errors.length) return { status: "invalid", errors };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const credentials = [];
      for (const item of validated) credentials.push(await insertStudent(client, item.value));
      await client.query("COMMIT");
      return { status: "created", credentials };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function resetPassword(studentId) {
    const password = createPassword();
    const passwordHash = await bcryptImpl.hash(password, 10);
    const result = await pool.query(
      `UPDATE users SET password=$1
       WHERE id=$2 AND role='student'
       RETURNING id, first_name, last_name, username, school, class_name, cefr_level, rating`,
      [passwordHash, studentId]
    );
    if (!result.rows[0]) return { status: "not-found" };
    return { status: "reset", student: result.rows[0], password };
  }

  return { provision, resetPassword };
}

module.exports = {
  createAdminStudentProvisioningService,
  createLogin,
  createPassword,
};
