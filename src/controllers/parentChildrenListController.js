const {
  createParentChildrenListService,
} = require("../services/parentChildrenListService");

function createParentChildrenListController({ pool, parentLeagueName, activityLabel }) {
  const service = createParentChildrenListService({ pool, parentLeagueName, activityLabel });

  async function listChildren(req, res) {
    try {
      const children = await service.listChildren(req.user.id);
      return res.json({ children });
    } catch (err) {
      console.error("Bolalar ro'yxati xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { listChildren };
}

module.exports = { createParentChildrenListController };
