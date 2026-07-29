function createSchoolInviteVerificationService({ pool, schoolInvite }) {
  return {
    async findInvite(code) {
      const codeHash = schoolInvite.hashCode(code);
      const result = await pool.query(
        `SELECT id, school_name, region, district, used_by, expires_at
       FROM school_invites WHERE code_hash = $1`,
        [codeHash]
      );

      return result.rows[0] || null;
    },
  };
}

module.exports = { createSchoolInviteVerificationService };
