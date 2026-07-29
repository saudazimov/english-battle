function createParentCodeStatusHandler({ pool, assignNewParentCode, logger }) {
  return async function getParentCodeStatus(req, res) {
    try {
      const studentId = req.user.id;
      const current = await pool.query(
        "SELECT parent_connect_code_hash, parent_connect_code_created_at, parent_connect_code_expires_at FROM users WHERE id = $1",
        [studentId]
      );
      const row = current.rows[0];
      const hasValidCode =
        row &&
        row.parent_connect_code_hash &&
        row.parent_connect_code_expires_at &&
        new Date(row.parent_connect_code_expires_at) > new Date();

      if (hasValidCode) {
        return res.json({
          has_active_code: true,
          code: null,
          created_at: row.parent_connect_code_created_at,
          expires_at: row.parent_connect_code_expires_at,
          message:
            "Amaldagi kod bor. Kodni qayta ko'rish mumkin emas — kerak bo'lsa yangi kod yarating.",
        });
      }

      const fresh = await assignNewParentCode(studentId);
      res.json({
        has_active_code: true,
        code: fresh.rawCode,
        created_at: fresh.created_at,
        expires_at: fresh.expires_at,
        message: "Kodni saqlab oling — qayta ko'rsatilmaydi.",
      });
    } catch (error) {
      logger.error("Parent kod olish xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createParentCodeRegenerateHandler({ assignNewParentCode, logger }) {
  return async function regenerateParentCode(req, res) {
    try {
      const fresh = await assignNewParentCode(req.user.id);
      res.json({
        success: true,
        code: fresh.rawCode,
        expires_at: fresh.expires_at,
        message: "Yangi kod yaratildi. Saqlab oling — qayta ko'rsatilmaydi.",
      });
    } catch (error) {
      logger.error("Parent kod yangilash xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createStudentParentListHandler({ pool, maskParentPhone, logger }) {
  return async function listStudentParents(req, res) {
    try {
      const studentId = req.user.id;
      const rows = await pool.query(
        `SELECT pl.parent_id, pl.relationship, pl.linked_at, u.first_name, u.last_name, u.phone
         FROM parent_links pl
         JOIN users u ON u.id = pl.parent_id
         WHERE pl.student_id = $1 AND pl.status = 'active'
         ORDER BY pl.linked_at DESC`,
        [studentId]
      );
      res.json({
        parents: rows.rows.map((row) => ({
          parent_id: row.parent_id,
          name:
            ((row.first_name || "") + " " + (row.last_name || "")).trim() ||
            "Ota-ona",
          relationship: row.relationship || "guardian",
          phone_masked: maskParentPhone(row.phone),
          linked_at: row.linked_at,
        })),
      });
    } catch (error) {
      logger.error("Ota-onalar ro'yxati xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createStudentParentUnlinkHandler({ pool, logger }) {
  return async function unlinkStudentParent(req, res) {
    try {
      const studentId = req.user.id;
      const parentId = parseInt(req.params.parentId, 10);
      if (isNaN(parentId)) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }
      const result = await pool.query(
        `UPDATE parent_links
         SET status='revoked', revoked_at=NOW(), revoked_by=$1, updated_at=NOW()
         WHERE student_id=$1 AND parent_id=$2 AND status='active'
         RETURNING id`,
        [studentId, parentId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Bog'lanish topilmadi" });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error("Ota-onani uzish xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createStudentParentConnectionController(dependencies) {
  const shared = { ...dependencies, logger: dependencies.logger || console };
  return {
    getCodeStatus: createParentCodeStatusHandler(shared),
    regenerateCode: createParentCodeRegenerateHandler(shared),
    listParents: createStudentParentListHandler(shared),
    unlinkParent: createStudentParentUnlinkHandler(shared),
  };
}

module.exports = { createStudentParentConnectionController };
