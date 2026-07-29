const { createParentLinkService } = require("../services/parentLinkService");

const RELATIONSHIPS = ["mother", "father", "guardian", "other"];

function createParentLinkController(dependencies) {
  const {
    pool,
    parentCode,
    parentLinkBlocked,
    parentLinkNoteFail,
    parentLinkNoteOk,
  } = dependencies;
  const service = createParentLinkService({ pool, parentCode });

  async function link(req, res) {
    const parentId = req.user.id;
    if (parentLinkBlocked(req)) {
      return res.status(429).json({
        error: "Juda ko'p urinish. 10 daqiqadan keyin qayta urinib ko'ring.",
      });
    }

    let { code, relationship } = req.body;
    code = (code || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
    relationship = RELATIONSHIPS.includes(relationship) ? relationship : "guardian";
    if (code.length < 6 || code.length > 12) {
      parentLinkNoteFail(req);
      return res.status(400).json({ error: "Kod noto'g'ri" });
    }

    try {
      const outcome = await service.linkParent(parentId, code, relationship);
      if (outcome.status === "invalid-code") {
        parentLinkNoteFail(req);
        return res.status(404).json({ error: "Kod noto'g'ri yoki muddati o'tgan" });
      }
      if (outcome.status === "self-link") {
        return res.status(400).json({ error: "O'zingizga ulanib bo'lmaydi" });
      }
      if (outcome.status === "parent-limit") {
        return res.status(400).json({
          error: "Bu o'quvchiga ulangan ota-onalar soni to'lgan",
        });
      }
      if (outcome.status === "child-limit") {
        return res.status(400).json({ error: "Ulangan farzandlar soni to'lgan" });
      }

      const child = outcome.child;
      parentLinkNoteOk(req);
      return res.json({
        success: true,
        child: {
          id: child.id,
          name: ((child.first_name || "") + " " + (child.last_name || "")).trim()
            || "Farzand",
          cefr_level: child.cefr_level || "A1",
          rating: child.rating || 0,
        },
      });
    } catch (err) {
      console.error("Parent link xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { link };
}

module.exports = { createParentLinkController };
