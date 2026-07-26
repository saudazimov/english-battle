const PLAN_PRICES = {
  student_premium: 5000000,
  parent_premium: 5000000,
  teacher_pro: 15000000,
  center_pro: 50000000,
};

function createPaymentCreateController({ pool, env = process.env, logger = console }) {
  async function create(req, res) {
    try {
      const { plan, months } = req.body;
      const validPlans = Object.keys(PLAN_PRICES);
      if (!validPlans.includes(plan)) {
        return res.status(400).json({ error: "Noto'g'ri plan" });
      }
      const monthCount = parseInt(months) || 1;
      if (monthCount < 1 || monthCount > 12) {
        return res.status(400).json({ error: "1-12 oy oralig'ida" });
      }
      const amount = PLAN_PRICES[plan] * monthCount;
      const result = await pool.query(
        `INSERT INTO payments (user_id, plan, months, amount, provider, status)
       VALUES ($1,$2,$3,$4,'payme','pending') RETURNING id`,
        [req.user.id, plan, monthCount, amount]
      );
      const paymentId = result.rows[0].id;
      const merchantId = env.PAYME_MERCHANT_ID;
      if (!merchantId) {
        return res.status(503).json({ error: "To'lov tizimi hozircha sozlanmagan" });
      }
      const checkoutParams = `m=${merchantId};ac.payment_id=${paymentId};a=${amount}`;
      const checkoutUrl = "https://checkout.paycom.uz/" + Buffer.from(checkoutParams).toString("base64");
      return res.json({ payment_id: paymentId, amount, checkout_url: checkoutUrl });
    } catch (error) {
      logger.error("Payment create xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { create };
}

module.exports = { createPaymentCreateController };
