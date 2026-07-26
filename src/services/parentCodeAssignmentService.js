// Unique kod yaratib o'quvchiga yozadi — RAW faqat qaytariladi, DB'da HASH saqlanadi
function createParentCodeAssignmentService({ pool, parentCode }) {
  return async function assignNewParentCode(studentId) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const rawCode = parentCode.generateRawCode();
      const codeHash = parentCode.hashCode(rawCode);
      try {
        const result = await pool.query(
          `UPDATE users
           SET parent_connect_code_hash = $1,
               parent_connect_code = NULL,
               parent_connect_code_created_at = NOW(),
               parent_connect_code_expires_at = NOW() + INTERVAL '${parentCode.PARENT_CODE_TTL_HOURS} hours'
           WHERE id = $2
           RETURNING parent_connect_code_created_at, parent_connect_code_expires_at`,
          [codeHash, studentId]
        );
        // RAW kodni faqat shu yerda qaytaramiz (DB'da yo'q!)
        return {
          rawCode: rawCode,
          created_at: result.rows[0].parent_connect_code_created_at,
          expires_at: result.rows[0].parent_connect_code_expires_at,
        };
      } catch (error) {
        if (error.code === "23505") continue;
        throw error;
      }
    }
    throw new Error("Kod yaratib bo'lmadi (collision)");
  };
}

module.exports = { createParentCodeAssignmentService };
