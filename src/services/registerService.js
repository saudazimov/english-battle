const { createOtpVerifyService } = require("./otpVerifyService");

function errorResult(message) {
  return { statusCode: 400, body: { error: message } };
}

function normalizeCountry(country) {
  if (country) {
    const normalized = String(country).toUpperCase().trim();
    return /^[A-Z]{2}$/.test(normalized) ? normalized : "UZ";
  }
  return "UZ";
}

function validateRole(role) {
  const requestedRole = String(role || "student").trim().toLowerCase();
  return requestedRole === "student" ? "student" : null;
}

function normalizeRoleSchool(role, school) {
  if (role !== "student" && role !== "teacher") return { school };

  const schoolMatch = String(school || "")
    .trim()
    .toLowerCase()
    .match(/^(\d{1,3})-maktab$/);
  const schoolNumber = schoolMatch ? Number(schoolMatch[1]) : 0;
  if (
    !Number.isInteger(schoolNumber)
    || schoolNumber < 1
    || schoolNumber > 200
  ) {
    return {
      error: "Maktabni 1-maktabdan 200-maktabgacha bo'lgan ro'yxatdan tanlang",
    };
  }
  return { school: schoolNumber + "-maktab" };
}

function readRegistrationBody(body) {
  const {
    first_name: firstName,
    last_name: lastName,
    phone,
    password,
    birth_date: birthDate,
    birth_year: birthYear,
    region,
    district,
    village,
    school,
    code,
    role,
    username,
    country,
  } = body;
  return {
    firstName,
    lastName,
    phone,
    password,
    birthDate,
    birthYear,
    region,
    district,
    village,
    school,
    code,
    role,
    username,
    country,
  };
}

async function resolveSchoolInvite({ pool, schoolInvite, body, role, school, region, district }) {
  if (role !== "school_admin") {
    return { schoolInviteId: null, school, region, district };
  }

  const { school_code: schoolCode } = body;
  if (!schoolCode) return { error: "Maktab admini uchun taklif kodi majburiy" };

  const codeHash = schoolInvite.hashCode(schoolCode);
  const inviteResult = await pool.query(
    `SELECT id, school_name, region, district, used_by, expires_at
     FROM school_invites WHERE code_hash = $1`,
    [codeHash]
  );
  if (inviteResult.rows.length === 0) return { error: "Taklif kodi noto'g'ri" };

  const invite = inviteResult.rows[0];
  if (invite.used_by) return { error: "Bu kod allaqachon ishlatilgan" };
  if (invite.expires_at && new Date() > new Date(invite.expires_at)) {
    return { error: "Kod muddati tugagan" };
  }
  return {
    schoolInviteId: invite.id,
    school: invite.school_name,
    region: invite.region || region,
    district: invite.district || district,
  };
}

async function createRegisteredUser({
  pool,
  bcrypt,
  stripUnsafe,
  normalizeSchool,
  profile,
  schoolInviteId,
}) {
  const hashedPassword = await bcrypt.hash(profile.password, 10);
  const newUser = await pool.query(
    `INSERT INTO users
     (first_name, last_name, phone, password, birth_date, birth_year, region, district, village, school, role, username, country)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id, first_name, last_name, username, phone, cefr_level, xp, rating, coins,
               region, district, school, role, country, created_at`,
    [
      stripUnsafe(profile.firstName, 100),
      stripUnsafe(profile.lastName, 100),
      profile.phone,
      hashedPassword,
      profile.birthDate || null,
      profile.birthYear || null,
      profile.region || null,
      profile.district || null,
      stripUnsafe(profile.village, 150),
      normalizeSchool(profile.school),
      profile.userRole,
      profile.username,
      profile.country,
    ]
  );

  if (schoolInviteId) {
    await pool.query(
      `UPDATE school_invites SET used_by = $1, used_at = NOW() WHERE id = $2`,
      [newUser.rows[0].id, schoolInviteId]
    );
  }
  await pool.query("DELETE FROM otp_codes WHERE phone = $1", [profile.phone]);
  return newUser.rows[0];
}

function createRegisterService({
  pool,
  bcrypt,
  validatePassword,
  usernameRegex,
  schoolInvite,
  noteFail,
  noteOk,
  phoneIpKey,
  validateGlobalLocation,
  stripUnsafe,
  normalizeSchool,
}) {
  const otpService = createOtpVerifyService({
    pool,
    bcrypt,
    noteFail,
    noteOk,
    phoneIpKey,
  });

  async function register({ req, body }) {
    let {
      firstName, lastName, phone, password, birthDate, birthYear, region,
      district, village, school, code, role, username, country,
    } = readRegistrationBody(body);

    if (!firstName || !lastName || !phone || !password) {
      return errorResult("Ism, familiya, telefon va parol majburiy");
    }
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) return errorResult(passwordCheck.error);

    if (!username) return errorResult("Username majburiy");
    username = String(username).toLowerCase().trim();
    if (!usernameRegex.test(username)) {
      return errorResult(
        "Username 5-32 belgi bo'lishi va faqat a-z, 0-9, _ belgilaridan iborat bo'lishi kerak"
      );
    }
    const usernameTaken = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    if (usernameTaken.rows.length > 0) {
      return errorResult("Bu username band. Boshqasini tanlang.");
    }

    country = normalizeCountry(country);
    const userRole = validateRole(role);
    if (!userRole) return errorResult("Hisob turi noto'g'ri tanlangan");

    const invite = await resolveSchoolInvite({
      pool,
      schoolInvite,
      body,
      role: userRole,
      school,
      region,
      district,
    });
    if (invite.error) return errorResult(invite.error);
    school = invite.school;
    region = invite.region;
    district = invite.district;

    const normalizedSchool = normalizeRoleSchool(userRole, school);
    if (normalizedSchool.error) return errorResult(normalizedSchool.error);
    school = normalizedSchool.school;

    const existingUser = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [phone]
    );
    if (existingUser.rows.length > 0) {
      return errorResult("Bu telefon raqami allaqachon ro'yxatdan o'tgan");
    }
    if (!code) return errorResult("Tasdiqlash kodi kiritilmadi");

    const otpResult = await otpService.verifyOtp({ req, phone, code });
    if (otpResult.status === "not-requested") {
      return errorResult("Avval tasdiqlash kodini oling");
    }
    if (otpResult.status === "expired") {
      return errorResult("Kod muddati tugagan, yangi kod oling");
    }
    if (otpResult.status === "invalid") return errorResult("Kod noto'g'ri");

    if (userRole !== "parent") {
      const locationCheck = validateGlobalLocation(country, region, district);
      if (!locationCheck.valid) return errorResult(locationCheck.error);
    }

    const user = await createRegisteredUser({
      pool,
      bcrypt,
      stripUnsafe,
      normalizeSchool,
      schoolInviteId: invite.schoolInviteId,
      profile: {
        firstName,
        lastName,
        phone,
        password,
        birthDate,
        birthYear,
        region,
        district,
        village,
        school,
        userRole,
        username,
        country,
      },
    });
    return { statusCode: 201, user };
  }

  return { register };
}

module.exports = { createRegisterService };
