const APPROVED_TEMPLATE_VERSION = "approved_fallback_lesson_v1";

const TEMPLATES = Object.freeze({
  grammar: Object.freeze({
    key: "grammar_evidence_comparison",
    rule: "Rasmiy izohdagi grammatik qoidani ega, zamon va fe\u2019l shakliga ajratib tekshiring.",
    objective: "Qoidani yangi gaplarda mustaqil qo\u2018llash va noto\u2018g\u2018ri shaklni sabab bilan tuzatish.",
  }),
  vocabulary: Object.freeze({
    key: "vocabulary_context_contrast",
    rule: "So\u2018zni rasmiy izoh, kontekst va noto\u2018g\u2018ri variantlar bilan solishtirib o\u2018rganing.",
    objective: "So\u2018z ma\u2019nosini yangi kontekstda aniqlash va chalg\u2018ituvchi variantlarni farqlash.",
  }),
  reading: Object.freeze({
    key: "reading_evidence_location",
    rule: "Javobni matndagi aniq dalil bilan bog\u2018lang va har bir variantni shu dalilga solishtiring.",
    objective: "Matndan javobni asoslaydigan dalilni mustaqil topish va izohlash.",
  }),
  listening: Object.freeze({
    key: "listening_signal_words",
    rule: "Asosiy ma\u2019no, signal so\u2018zlar va savol talabini alohida qayd etib, variantlarni solishtiring.",
    objective: "Eshitilgan dalilga tayangan holda variantlarni farqlash.",
  }),
  general: Object.freeze({
    key: "evidence_based_correction",
    rule: "Rasmiy izohga tayangan holda tanlangan va to\u2018g\u2018ri javob o\u2018rtasidagi farqni bosqichma-bosqich tekshiring.",
    objective: "Xato sababini tushuntirish va shu ko\u2018nikmani yangi savolda to\u2018g\u2018ri qo\u2018llash.",
  }),
});

function templateKey(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.includes("grammar")) return "grammar";
  if (normalized.includes("vocab")) return "vocabulary";
  if (normalized.includes("read")) return "reading";
  if (normalized.includes("listen")) return "listening";
  return "general";
}

function approvedLessonTemplate({ legacySkill, errorExplanation, taxonomyDescription } = {}) {
  const category = templateKey(legacySkill);
  const template = TEMPLATES[category];
  const storedExplanation = String(errorExplanation || "").trim();
  const storedTaxonomyRule = String(taxonomyDescription || "").trim();
  return {
    version: APPROVED_TEMPLATE_VERSION,
    key: template.key,
    category,
    rule: storedExplanation || storedTaxonomyRule || template.rule,
    rule_source: storedExplanation
      ? "approved_question_explanation"
      : storedTaxonomyRule ? "taxonomy_description" : "approved_template",
    objective: template.objective,
  };
}

module.exports = {
  APPROVED_TEMPLATE_VERSION,
  approvedLessonTemplate,
};
