function createAdminFlagCountController({ pool }) {
  async function count(req, res) {
    try {
      const result = await pool.query(
        "SELECT COUNT(*) AS c FROM flags WHERE status = 'pending'"
      );
      return res.json({ pending: parseInt(result.rows[0].c) });
    } catch (error) {
      return res.json({ pending: 0 });
    }
  }

  return { count };
}

module.exports = { createAdminFlagCountController };
