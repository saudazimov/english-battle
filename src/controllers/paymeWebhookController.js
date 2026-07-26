function createPaymeWebhookController({ payme, logger = console }) {
  async function handle(req, res) {
    try {
      const result = await payme.handlePaymeRequest(
        req.body,
        req.headers.authorization
      );
      return res.json(result);
    } catch (error) {
      logger.error("Payme webhook xatosi:", error.message);
      return res.json({
        jsonrpc: "2.0",
        id: (req.body && req.body.id) || 0,
        error: { code: -32300, message: "Server xatosi" },
      });
    }
  }

  return { handle };
}

module.exports = { createPaymeWebhookController };
