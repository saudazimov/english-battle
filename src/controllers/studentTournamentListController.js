const {
  createStudentTournamentListService,
} = require("../services/studentTournamentListService");

function createStudentTournamentListController({ pool }) {
  const service = createStudentTournamentListService({ pool });

  async function listTournaments(req, res) {
    try {
      const result = await service.listTournaments(req.user.id);
      return res.json(result);
    } catch (err) {
      console.error("Student tournaments xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { listTournaments };
}

module.exports = { createStudentTournamentListController };
