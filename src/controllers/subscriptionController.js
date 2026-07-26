function createSubscriptionController({ premium, logger = console }) {
  async function current(req, res) {
    try {
      const plan = await premium.getUserPlan(req.user.id);
      return res.json({
        is_premium: !!plan,
        plan: plan ? plan.plan : null,
        status: plan ? plan.status : "free",
        expires_at: plan ? plan.expires_at : null,
      });
    } catch (error) {
      logger.error("Subscription holat xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { current };
}

module.exports = { createSubscriptionController };
