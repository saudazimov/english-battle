const {
  createParentChildUnlinkService,
} = require("../services/parentChildUnlinkService");

function createParentChildUnlinkController({ pool }) {
  const service = createParentChildUnlinkService({ pool });

  async function unlinkChild(req, res) {
    try {
      const parentId = req.user.id;
      const studentId = parseInt(req.params.studentId, 10);
      if (isNaN(studentId)) return res.status(400).json({ error: "Noto'g'ri ID" });

      const unlinked = await service.unlinkChild(parentId, studentId);
      if (!unlinked) return res.status(404).json({ error: "Bog'lanish topilmadi" });

      return res.json({ success: true });
    } catch (err) {
      console.error("Farzandni uzish xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { unlinkChild };
}

module.exports = { createParentChildUnlinkController };
