function createPaymentStatusController({ pool }) {
  async function status(req, res) {
    try {
      const result = await pool.query(
        "SELECT id, status, plan, amount FROM payments WHERE id=$1 AND user_id=$2",
        [parseInt(req.params.id), req.user.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Topilmadi" });
      }
      return res.json(result.rows[0]);
    } catch (error) {
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { status };
}

module.exports = { createPaymentStatusController };
