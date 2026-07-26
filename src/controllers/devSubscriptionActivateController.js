function createDevSubscriptionActivateController({
  premium,
  logAudit,
  logger = console,
}) {
  return {
    async activate(req, res) {
      try {
        const { user_id, plan, days } = req.body;
        if (!user_id || !plan || !days) {
          return res.status(400).json({ error: "user_id, plan, days kerak" });
        }

        const sub = await premium.grantSubscription(
          parseInt(user_id),
          plan,
          parseInt(days)
        );
        await logAudit(req, "subscription_granted", {
          entityType: "user",
          entityId: user_id,
          details: plan + " — " + days + " kun",
        });
        res.json({ success: true, subscription: sub });
      } catch (error) {
        logger.error("Obuna aktivlashtirish xatosi:", error.message);
        res.status(400).json({ error: error.message });
      }
    },
  };
}

module.exports = { createDevSubscriptionActivateController };
