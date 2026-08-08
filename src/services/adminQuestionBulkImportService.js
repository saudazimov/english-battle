const { createQuestionAnalysisService } = require("./questionAnalysisService");

function createAdminQuestionBulkImportService({
  pool,
  questionAnalysisService,
}) {
  const analysisService = questionAnalysisService || createQuestionAnalysisService({ pool });
  async function importRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return { status: "empty" };
    if (rows.length > 1000) return { status: "too-many" };

    const validLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    const validAnswers = ["A", "B", "C", "D"];
    const validStatuses = ["published", "draft", "needs_review"];
    const existing = await pool.query(
      "SELECT LOWER(TRIM(question_text)) AS qt FROM questions"
    );
    const existingSet = {};
    existing.rows.forEach((row) => {
      existingSet[row.qt] = true;
    });

    let inserted = 0;
    let skipped = 0;
    const seenInBatch = {};
    const errors = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index] || {};
      const questionText = (row.question_text || "").trim();
      const optionA = (row.option_a || "").trim();
      const optionB = (row.option_b || "").trim();
      const optionC = (row.option_c || "").trim();
      const optionD = (row.option_d || "").trim();
      const correct = (row.correct_option || "").trim().toUpperCase();
      let level = (row.cefr_level || "A1").trim().toUpperCase();
      const skill = (row.skill || "grammar").trim().toLowerCase();
      const explanation = (row.explanation || "").trim();
      let status = (row.status || "published").trim().toLowerCase();

      if (!questionText || questionText.length < 3
          || !optionA || !optionB || !optionC || !optionD) {
        skipped++;
        continue;
      }
      if (validAnswers.indexOf(correct) === -1) {
        skipped++;
        continue;
      }
      if (validLevels.indexOf(level) === -1) level = "A1";
      if (validStatuses.indexOf(status) === -1) status = "published";

      const normalized = questionText.toLowerCase();
      if (existingSet[normalized] || seenInBatch[normalized]) {
        skipped++;
        continue;
      }
      seenInBatch[normalized] = true;

      try {
        const insertedQuestion = await pool.query(
          `INSERT INTO questions
           (question_text, option_a, option_b, option_c, option_d, correct_option, cefr_level, skill, difficulty, explanation, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'easy',$9,$10) RETURNING id`,
          [questionText, optionA, optionB, optionC, optionD, correct, level, skill, explanation, status]
        );
        await analysisService.enqueueSafe(insertedQuestion.rows[0].id, "bulk_import");
        inserted++;
      } catch (error) {
        skipped++;
        errors.push("Qator " + (index + 1) + ": " + error.message);
      }
    }

    return {
      status: "imported",
      inserted,
      skipped,
      total: rows.length,
      errors: errors.slice(0, 10),
    };
  }

  return { importRows };
}

module.exports = { createAdminQuestionBulkImportService };
