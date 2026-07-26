function createSchoolAdminLookupService({ pool, schoolIdentityKey }) {
  return async function getSchoolAdmin(userId) {
    const result = await pool.query(
      "SELECT id, first_name, last_name, role, school, region, district FROM users WHERE id = $1",
      [userId]
    );
    if (result.rows.length === 0) {
      return { ok: false, error: "Foydalanuvchi topilmadi" };
    }
    const user = result.rows[0];
    if (user.role !== "school_admin") {
      return { ok: false, error: "Faqat maktab admini uchun" };
    }
    user.school_key = schoolIdentityKey(user.region, user.district, user.school);
    if (!user.school_key) {
      return { ok: false, error: "Viloyat, tuman yoki maktabingiz to'liq belgilanmagan" };
    }
    return { ok: true, user };
  };
}

module.exports = { createSchoolAdminLookupService };
