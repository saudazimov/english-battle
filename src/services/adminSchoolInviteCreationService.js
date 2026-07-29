function createAdminSchoolInviteCreationService({ pool, schoolInvite }) {
  return {
    async activeInviteExists(schoolName, region, district) {
      const result = await pool.query(
        `SELECT id FROM school_invites
       WHERE school_name = $1 AND region = $2 AND district = $3 AND used_by IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())`,
        [schoolName, region, district]
      );
      return result.rows.length > 0;
    },

    async schoolAdminExists(schoolName, region, district) {
      const result = await pool.query(
        `SELECT id FROM users
       WHERE role = 'school_admin' AND region = $1 AND district = $2 AND school = $3`,
        [region, district, schoolName]
      );
      return result.rows.length > 0;
    },

    generateCode() {
      const rawCode = schoolInvite.generateRawCode();
      const codeHash = schoolInvite.hashCode(rawCode);
      return { rawCode, codeHash };
    },

    async insertInvite(codeHash, schoolName, region, district, createdBy, expiresAt) {
      await pool.query(
        `INSERT INTO school_invites (code_hash, school_name, region, district, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
        [codeHash, schoolName, region, district, createdBy, expiresAt]
      );
    },
  };
}

module.exports = { createAdminSchoolInviteCreationService };
