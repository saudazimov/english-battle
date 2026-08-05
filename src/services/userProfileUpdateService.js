const NAME_PATTERN = /^[\p{L}\p{M}'‘’ʻʼ -]+$/u;

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function validateName(value, label) {
  const normalized = normalizeName(value);
  if (normalized.length < 2 || normalized.length > 100) {
    return { error: `${label} 2–100 belgidan iborat bo‘lsin` };
  }
  if (!NAME_PATTERN.test(normalized)) {
    return { error: `${label} faqat harflar, bo‘sh joy, apostrof va chiziqdan iborat bo‘lsin` };
  }
  return { value: normalized };
}

function normalizeBio(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (normalized.length > 500) {
    return { error: "Bio 500 belgidan oshmasin" };
  }
  return { value: normalized || null };
}

function createUserProfileUpdateService({ pool }) {
  return {
    async updateNames(userId, input) {
      const firstName = validateName(input.first_name, "Ism");
      if (firstName.error) return { status: "invalid", error: firstName.error };

      const lastName = validateName(input.last_name, "Familiya");
      if (lastName.error) return { status: "invalid", error: lastName.error };

      const bio = normalizeBio(input.bio);
      if (bio.error) return { status: "invalid", error: bio.error };

      const result = await pool.query(
        `UPDATE users
         SET first_name = $1, last_name = $2, bio = $3
         WHERE id = $4
         RETURNING id, first_name, last_name, username, bio, profile_picture`,
        [firstName.value, lastName.value, bio.value, userId]
      );

      if (result.rows.length === 0) return { status: "not_found" };
      return { status: "updated", user: result.rows[0] };
    },
  };
}

module.exports = { createUserProfileUpdateService };
