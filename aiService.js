// aiService.js — AI hisobot generatori (provayder-neutral, fallback bilan)
// ============================================================================
// FALSAFA:
//   • API kalit bo'lsa → haqiqiy AI (OpenAI yoki Anthropic, .env tanlaydi)
//   • Kalit yo'q yoki AI buzilsa → real-data fallback (snapshotdan, FAKE EMAS)
//   • HECH QACHON crash bo'lmaydi — platforma ishlashda davom etadi
//   • AI faqat snapshotdagi raqamlardan foydalanadi (system prompt qat'iy)
//   • Javob DOIM valid JSON — noto'g'ri kelsa fallback
// ============================================================================

const https = require("https");

const AI_PROVIDER = process.env.AI_PROVIDER || "openai"; // openai | anthropic
const AI_ENABLED = process.env.AI_REPORTS_ENABLED !== "false";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";

// ===== AI tizim ko'rsatmasi (eng muhim — qat'iy qoidalar) =====
const SYSTEM_PROMPT = `You are an educational progress report assistant for an English-learning platform. You write reports in UZBEK (latin script).

ABSOLUTE RULES:
1. Use ONLY the numbers and facts in the provided JSON snapshot. NEVER invent data.
2. NEVER mention any data not in the snapshot (no opponents, no classmates, no chat).
3. If data_quality.enough_data is false, return the insufficient_data response.
4. NEVER diagnose the student (no medical/psychological claims).
5. NEVER use harmful labels: "dangasa", "qobiliyatsiz", "yomon bola", "umidsiz", "juda past". 
6. Be professional, warm, respectful, and NOT alarming. Address the PARENT.
7. Give concrete, actionable advice based on weak_skills in the snapshot.
8. Return ONLY valid JSON. No markdown, no extra text, no code fences.

The JSON response MUST follow this exact schema:
{
  "status": "generated",
  "title": "string (uzbek)",
  "summary": "string — 2-3 sentences about the week, parent-facing",
  "progress_notes": ["string", ...],
  "strengths": ["string", ...],
  "concerns": ["string", ...],
  "recommendations": ["string", ...],
  "questions_to_ask_child": ["string", ...],
  "next_week_focus": ["string", ...],
  "confidence": "high | medium | low"
}

Keep arrays to 2-4 items each. confidence should match data_quality.confidence.`;

// ===== Insufficient data javobi (data kam bo'lsa — AI chaqirilmaydi) =====
function insufficientDataReport(snapshot) {
  const dq = snapshot.data_quality || {};
  return {
    status: "insufficient_data",
    title: "Hali yetarli ma'lumot yo'q",
    message: "Aniq haftalik tahlil tayyorlash uchun farzandingiz kamida 30 ta savol ishlashi yoki 2 ta topshiriq bajarishi kerak.",
    summary: "",
    progress_notes: [],
    strengths: [],
    concerns: [],
    recommendations: [],
    questions_to_ask_child: [],
    next_steps: [
      "Bugun 1 ta jang (battle) o'ynang.",
      "Berilgan topshiriqlardan kamida bittasini bajaring.",
    ],
    next_week_focus: [],
    confidence: "low",
  };
}

// ===== FALLBACK hisobot (AI yo'q/buzilgan — lekin REAL snapshot raqamlaridan) =====
// Bu fake EMAS: snapshotdagi haqiqiy accuracy, weak_skills, assignmentlardan tuziladi.
function fallbackReport(snapshot) {
  const s = snapshot;
  const perf = s.performance || {};
  const act = s.activity || {};
  const asg = s.assignments || {};
  const weak = s.weak_skills || [];
  const strong = s.strong_skills || [];

  const progress = [];
  if (act.battles_count != null) progress.push(`Bu hafta ${act.battles_count} ta jangda qatnashdi va ${act.questions_answered} ta savol ishladi.`);
  if (perf.accuracy != null) progress.push(`Umumiy aniqlik: ${perf.accuracy}% (${perf.correct_count} to'g'ri, ${perf.wrong_count} xato).`);
  if (asg.submitted != null && asg.total) progress.push(`Topshiriqlar: ${asg.submitted}/${asg.total} bajarilgan${asg.late ? ", " + asg.late + " tasi kechikkan" : ""}.`);
  if (perf.rating_change != null && perf.rating_change !== 0) progress.push(`Reyting o'zgarishi: ${perf.rating_change > 0 ? "+" : ""}${perf.rating_change}.`);

  const strengths = strong.length
    ? strong.map((sk) => `${sk.skill} bo'yicha natija yaxshi (${sk.accuracy}%).`)
    : (perf.accuracy >= 70 ? ["Umumiy aniqlik yaxshi darajada."] : []);

  const concerns = weak.length
    ? weak.map((sk) => `${sk.skill} savollarida xatolar ko'proq (${sk.accuracy}%).`)
    : [];

  const recommendations = [];
  if (weak.length) {
    recommendations.push(`Keyingi haftada ${weak[0].skill} bo'yicha qisqa mashqlar qilish foydali bo'ladi.`);
  }
  if (asg.missing && asg.missing > 0) {
    recommendations.push(`${asg.missing} ta topshiriq bajarilmagan — ularni yakunlash tavsiya etiladi.`);
  }
  if (act.active_days != null && act.active_days < 3) {
    recommendations.push("Muntazam shug'ullanish (haftada kamida 3-4 kun) natijani yaxshilaydi.");
  }
  if (recommendations.length === 0) recommendations.push("Hozirgi sur'atni saqlab, muntazam shug'ullanishni davom ettiring.");

  const questions = [];
  if (weak.length) questions.push(`${weak[0].skill} mavzusida nima qiyin bo'layapti?`);
  questions.push("Bu hafta qaysi savollar qiyin tuyuldi?");

  let summary = `Farzandingiz bu hafta ${act.active_days || 0} kun faol bo'lib, ${act.questions_answered || 0} ta savol ishladi.`;
  if (perf.accuracy != null) summary += ` Umumiy aniqlik ${perf.accuracy}%.`;

  return {
    status: "generated",
    title: "Farzandingizning haftalik hisoboti",
    summary: summary,
    progress_notes: progress,
    strengths: strengths,
    concerns: concerns,
    recommendations: recommendations,
    questions_to_ask_child: questions,
    next_week_focus: weak.length ? weak.slice(0, 2).map((sk) => sk.skill) : [],
    confidence: (s.data_quality && s.data_quality.confidence) || "medium",
    _fallback: true, // ichki belgi (AI ishlatilmaganini bildiradi)
  };
}

// ===== JSON validatsiya — AI javobi to'g'ri schemaga mosmi? =====
function validateReportShape(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.title !== "string" || typeof obj.summary !== "string") return false;
  const arrays = ["progress_notes", "strengths", "concerns", "recommendations", "questions_to_ask_child", "next_week_focus"];
  for (const k of arrays) {
    if (!Array.isArray(obj[k])) return false;
  }
  if (!["high", "medium", "low"].includes(obj.confidence)) return false;
  return true;
}

// ===== HTTP so'rov yordamchisi (promise) =====
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("AI timeout (30s)")); });
    if (body) req.write(body);
    req.end();
  });
}

// ===== OpenAI chaqiruvi =====
async function callOpenAI(snapshot) {
  const payload = JSON.stringify({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "Generate the parent weekly report from this snapshot:\n" + JSON.stringify(snapshot) },
    ],
    temperature: 0.4,
    response_format: { type: "json_object" },
  });
  const res = await httpsRequest({
    hostname: "api.openai.com",
    path: "/v1/chat/completions",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + OPENAI_KEY,
      "Content-Length": Buffer.byteLength(payload),
    },
  }, payload);

  if (res.status !== 200) throw new Error("OpenAI status " + res.status + ": " + res.body.slice(0, 200));
  const data = JSON.parse(res.body);
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error("OpenAI bo'sh javob");
  return {
    text: content,
    usage: data.usage ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens } : null,
    model: OPENAI_MODEL,
  };
}

// ===== Anthropic chaqiruvi =====
async function callAnthropic(snapshot) {
  const payload = JSON.stringify({
    model: ANTHROPIC_MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: "Generate the parent weekly report from this snapshot. Return JSON only:\n" + JSON.stringify(snapshot) },
    ],
  });
  const res = await httpsRequest({
    hostname: "api.anthropic.com",
    path: "/v1/messages",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Length": Buffer.byteLength(payload),
    },
  }, payload);

  if (res.status !== 200) throw new Error("Anthropic status " + res.status + ": " + res.body.slice(0, 200));
  const data = JSON.parse(res.body);
  const content = data.content && data.content[0] && data.content[0].text;
  if (!content) throw new Error("Anthropic bo'sh javob");
  return {
    text: content,
    usage: data.usage ? { input: data.usage.input_tokens, output: data.usage.output_tokens } : null,
    model: ANTHROPIC_MODEL,
  };
}

// AI matnidan JSON ajratish (ba'zan ```json ... ``` bilan o'raydi)
function extractJson(text) {
  let t = String(text).trim();
  // code fence olib tashlash
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // birinchi { dan oxirgi } gacha
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

// ===== ASOSIY: hisobot generatsiya qilish =====
// Qaytaradi: { report, confidence, status, usage, model, used_ai }
async function generateParentWeeklyReport(snapshot) {
  // 1. Data quality gate — kam bo'lsa AI chaqirilmaydi (fake yo'q)
  if (!snapshot.data_quality || !snapshot.data_quality.enough_data) {
    const rep = insufficientDataReport(snapshot);
    return { report: rep, confidence: "low", status: "insufficient_data", usage: null, model: null, used_ai: false };
  }

  // 2. AI o'chirilgan yoki kalit yo'q → fallback (real data'dan)
  const hasKey = (AI_PROVIDER === "openai" && OPENAI_KEY) || (AI_PROVIDER === "anthropic" && ANTHROPIC_KEY);
  if (!AI_ENABLED || !hasKey) {
    const rep = fallbackReport(snapshot);
    return { report: rep, confidence: rep.confidence, status: "generated", usage: null, model: "fallback", used_ai: false };
  }

  // 3. Haqiqiy AI chaqiruvi (xato bo'lsa — fallback, crash YO'Q)
  try {
    const aiRes = AI_PROVIDER === "anthropic" ? await callAnthropic(snapshot) : await callOpenAI(snapshot);
    const parsed = extractJson(aiRes.text);

    // Schema validatsiya — noto'g'ri bo'lsa fallback
    if (!validateReportShape(parsed)) {
      console.error("[AI] JSON schema noto'g'ri — fallback ishlatildi");
      const rep = fallbackReport(snapshot);
      return { report: rep, confidence: rep.confidence, status: "fallback", usage: aiRes.usage, model: aiRes.model, used_ai: false };
    }

    parsed.status = "generated";
    return { report: parsed, confidence: parsed.confidence, status: "generated", usage: aiRes.usage, model: aiRes.model, used_ai: true };
  } catch (err) {
    console.error("[AI] Generatsiya xatosi — fallback ishlatildi:", err.message);
    const rep = fallbackReport(snapshot);
    return { report: rep, confidence: rep.confidence, status: "fallback", usage: null, model: "fallback", used_ai: false };
  }
}

// ============================================================================
// STUDENT WEEKLY REPORT — o'quvchining o'ziga (motivatsion, "sen" tilida)
// ============================================================================
const STUDENT_SYSTEM_PROMPT = `You are an evidence-based English learning diagnostician. Write in clear UZBEK (latin script), addressing the STUDENT respectfully and directly.

ABSOLUTE RULES:
1. Use ONLY the learner-specific numbers and facts in the provided JSON snapshot. NEVER invent learner performance. You may use established English-language knowledge only to explain an evidenced topic and create original teaching examples.
2. NEVER mention opponents, classmates, or chat.
3. If data_quality.enough_data is false, return the insufficient_data response.
4. Focus only on learning: accuracy, recurring errors, topic mastery, misconceptions, and study actions. Do not discuss rating, leagues, XP, wins, battles, or rewards.
5. Base priority_topics strictly on learning_diagnostics.priority_topics and its evidence. Never diagnose a topic without evidence.
6. Recommendations must use retrieval practice, spaced repetition, worked examples, immediate error correction, and interleaving where appropriate.
7. Every priority topic must include measurable success criteria. Never label the learner.
8. Build topic_lessons only for evidenced priority topics. Each lesson must teach, demonstrate, make the learner retrieve, and schedule review; it must not be generic encouragement.
9. Keep worked examples concise. Clearly distinguish the learner's real mistake evidence from newly created instructional examples.
10. Return ONLY valid JSON. No markdown, no code fences.

Schema:
{
  "status": "generated",
  "title": "string (uzbek)",
  "summary": "string — 3-5 evidence-based sentences",
  "diagnosis": "string — current knowledge pattern without unsupported claims",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "priority_topics": [{"topic":"string from diagnostics","evidence":"string with attempts/errors/accuracy","likely_gap":"string grounded in evidence","study_action":"string","success_criterion":"measurable string"}],
  "topic_lessons": [{"topic":"string from diagnostics","objective":"measurable learning objective","misconception":"string grounded in mistake evidence","rule":"concise accurate explanation","worked_examples":[{"prompt":"string","answer":"string","reasoning":"string"}],"practice_sequence":[{"step":"string","task":"string"}],"mastery_criterion":"measurable string","review_schedule":["Bugun","1 kundan keyin","3 kundan keyin","7 kundan keyin"]}],
  "learning_plan": [{"stage":"string","focus":"string","method":"retrieval practice | spaced repetition | worked examples | error correction | interleaving","task":"string","success_criterion":"measurable string"}],
  "study_principles": ["string — short explanation of why a method helps"],
  "next_steps": ["string"],
  "motivation": "string — one calm, encouraging sentence",
  "confidence": "high | medium | low"
}
Keep priority_topics 1-6 items, topic_lessons 1-3 items, and learning_plan 3-5 stages. If evidence is insufficient, use empty priority_topics and topic_lessons arrays and state that in diagnosis.`;

function studentInsufficientDataReport(snapshot) {
  const dq = snapshot.data_quality || {};
  return {
    status: "insufficient_data",
    title: "Ishonchli tahlil uchun ma'lumot yetarli emas",
    summary: `Hozir ${dq.total_answers || 0} ta javob tahlil qilindi. Ishonchli xulosa uchun kamida 30 ta javob, 2 ta topshiriq yoki 1 ta daraja imtihoni kerak.`,
    diagnosis: "Kam ma'lumot asosida mavzu bo'yicha xulosa chiqarish noto'g'ri bo'lishi mumkin, shu sabab tizim taxmin yaratmaydi.",
    strengths: [], weaknesses: [], priority_topics: [], topic_lessons: [],
    learning_plan: [
      { stage: "Ma'lumot to'plash", focus: "Turli mavzular", method: "retrieval practice", task: "Kamida 30 ta savolni mustaqil ishlang.", success_criterion: "30 ta tekshirilgan javob" },
      { stage: "Xatoni qayta ishlash", focus: "Noto'g'ri javoblar", method: "error correction", task: "Har bir xato uchun to'g'ri qoida va bitta yangi misol yozing.", success_criterion: "Har bir xato izohlangan" },
    ],
    study_principles: ["Taxminsiz diagnostika uchun yetarli dalil to'plash zarur."],
    next_steps: ["Savollarni shoshmasdan ishlang va xato izohlarini o'qing."],
    motivation: "Yetarli ma'lumot yig'ilgach, tahlil ancha aniq va foydali bo'ladi.", confidence: "low",
  };
}

function studentFallbackReport(snapshot) {
  const s = snapshot, perf = s.performance || {}, diagnostics = s.learning_diagnostics || {};
  const priority = diagnostics.priority_topics || [];
  const strong = diagnostics.strongest_topics || [];
  const mainTopic = priority[0] ? priority[0].topic : "Aralash mavzular";
  const topicLessons = priority.slice(0, 3).map((item) => {
    const evidence = Array.isArray(item.evidence) ? item.evidence.slice(0, 3) : [];
    const first = evidence[0] || {};
    const selected = first.selected_answer || "tanlangan javob";
    const correct = first.correct_answer || "to'g'ri javob";
    return {
      topic: item.topic,
      objective: `${item.topic} bo'yicha yangi 10 ta savoldan kamida 8 tasiga to'g'ri javob berish.`,
      misconception: first.question
        ? `“${first.question}” savolida “${selected}” tanlangan, to'g'ri javob esa “${correct}”.`
        : `${item.topic} bo'yicha ${item.errors} ta xato qayd etilgan; aniq xato turini ajratish uchun misollarni solishtirish kerak.`,
      rule: first.explanation || `${item.topic} qoidasini xato va to'g'ri variantni yonma-yon solishtirib qayta o'rganing.`,
      worked_examples: evidence.map((example) => ({
        prompt: example.question,
        answer: example.correct_answer || "To'g'ri variantni izohdan tekshiring",
        reasoning: example.explanation || `Nega “${example.selected_answer || "tanlangan variant"}” emasligini qoida bilan tushuntiring.`,
      })),
      practice_sequence: [
        { step: "1. Ajratish", task: "Xato variant va to'g'ri variant orasidagi grammatik farqni bir jumlada yozing." },
        { step: "2. Eslab chaqirish", task: `Javobga qaramasdan ${item.topic} bo'yicha 5 ta misol tuzing va tekshiring.` },
        { step: "3. Qo'llash", task: `${item.topic} bo'yicha 10 ta yangi savolni mustaqil ishlang.` },
      ],
      mastery_criterion: "Ikki alohida urinishda ketma-ket kamida 8/10 to'g'ri javob.",
      review_schedule: ["Bugun", "1 kundan keyin", "3 kundan keyin", "7 kundan keyin"],
    };
  });
  return {
    status: "generated", title: "Bilim diagnostikasi",
    summary: `${diagnostics.analyzed_answers || 0} ta javob tahlil qilindi. Umumiy aniqlik ${perf.accuracy || 0}%. Xulosalar faqat saqlangan javoblar va xato dalillariga asoslangan.`,
    diagnosis: priority.length ? `Asosiy o'quv ustuvorligi — ${mainTopic}. Avval shu mavzudagi takroriy xatoni tuzatish, keyin aralash mashqqa o'tish tavsiya etiladi.` : "Takroriy xato mavzusi aniqlanmadi; barqarorlikni tekshirish uchun ko'proq turli savollar ishlash kerak.",
    strengths: strong.map((item) => `${item.topic}: ${item.accuracy}% aniqlik (${item.attempts} ta javob).`),
    weaknesses: priority.map((item) => `${item.topic}: ${item.errors} ta xato, ${item.accuracy}% aniqlik.`),
    priority_topics: priority.map((item) => ({
      topic: item.topic,
      evidence: `${item.attempts} ta javobdan ${item.errors} tasi xato; aniqlik ${item.accuracy}%.`,
      likely_gap: item.evidence && item.evidence.length ? `Xato qilingan savol: ${item.evidence[0].question}` : "Aniqlash uchun ko'proq ma'lumot kerak.",
      study_action: `${item.topic} qoidasini yechilgan misollar orqali ko'rib chiqing, so'ng javobga qaramasdan 10 ta savol ishlang.`,
      success_criterion: "Ketma-ket 8/10 to'g'ri javob",
    })),
    topic_lessons: topicLessons,
    learning_plan: [
      { stage: "1. Tushunish", focus: mainTopic, method: "worked examples", task: "Qoida va 3 ta yechilgan misolni tahlil qiling.", success_criterion: "Qoidani o'z so'zingiz bilan tushuntirish" },
      { stage: "2. Eslab chaqirish", focus: mainTopic, method: "retrieval practice", task: "Javobga qaramasdan 10 ta savol ishlang.", success_criterion: "Kamida 8/10 to'g'ri" },
      { stage: "3. Mustahkamlash", focus: mainTopic, method: "spaced repetition", task: "1, 3 va 7 kundan keyin qisqa qayta test ishlang.", success_criterion: "Har qayta testda kamida 80%" },
      { stage: "4. Ko'chirish", focus: "Aralash mavzular", method: "interleaving", task: "Ustuvor mavzuni boshqa mavzular bilan aralashtirib 15 ta savol ishlang.", success_criterion: "Kamida 12/15 to'g'ri" },
    ],
    study_principles: [
      "Retrieval practice xotiradan faol chaqirish orqali bilimni mustahkamlaydi.",
      "Spaced repetition vaqt oralig'i bilan qaytarib, uzoq muddatli eslab qolishni qo'llab-quvvatlaydi.",
      "Error correction xatoning sababini yozib, to'g'ri qoida bilan yangi misol yaratishni talab qiladi.",
    ],
    next_steps: [`Bugun ${mainTopic} bo'yicha xato daftarini boshlang.`, "Natijani 7 kundan keyin qayta tahlil qiling."],
    motivation: "Har bir aniqlangan xato — keyingi o'sish uchun aniq yo'nalish.",
    confidence: (s.data_quality && s.data_quality.confidence) || "medium", _fallback: true,
  };
}

function validateStudentReportShape(o) {
  if (!o || typeof o !== "object") return false;
  if (typeof o.title !== "string" || typeof o.summary !== "string" || typeof o.diagnosis !== "string" || typeof o.motivation !== "string") return false;
  for (const k of ["strengths", "weaknesses", "priority_topics", "topic_lessons", "learning_plan", "study_principles", "next_steps"]) if (!Array.isArray(o[k])) return false;
  if (!["high", "medium", "low"].includes(o.confidence)) return false;
  return true;
}

async function callAIRaw(systemPrompt, userContent, maxTokens) {
  const provider = AI_PROVIDER;
  if (provider === "anthropic") {
    const payload = JSON.stringify({
      model: ANTHROPIC_MODEL, max_tokens: maxTokens || 1500, system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });
    const res = await httpsRequest({
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Length": Buffer.byteLength(payload) },
    }, payload);
    if (res.status !== 200) throw new Error("Anthropic status " + res.status);
    const data = JSON.parse(res.body);
    const content = data.content && data.content[0] && data.content[0].text;
    if (!content) throw new Error("Anthropic bo'sh javob");
    return { text: content, usage: data.usage ? { input: data.usage.input_tokens, output: data.usage.output_tokens } : null, model: ANTHROPIC_MODEL };
  }
  const payload = JSON.stringify({
    model: OPENAI_MODEL,
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }],
    temperature: 0.4, response_format: { type: "json_object" },
  });
  const res = await httpsRequest({
    hostname: "api.openai.com", path: "/v1/chat/completions", method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + OPENAI_KEY, "Content-Length": Buffer.byteLength(payload) },
  }, payload);
  if (res.status !== 200) throw new Error("OpenAI status " + res.status);
  const data = JSON.parse(res.body);
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error("OpenAI bo'sh javob");
  return { text: content, usage: data.usage ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens } : null, model: OPENAI_MODEL };
}

async function generateStudentWeeklyReport(snapshot) {
  if (!snapshot.data_quality || !snapshot.data_quality.enough_data) {
    const rep = studentInsufficientDataReport(snapshot);
    return { report: rep, confidence: "low", status: "insufficient_data", usage: null, model: null, used_ai: false };
  }
  const hasKey = (AI_PROVIDER === "openai" && OPENAI_KEY) || (AI_PROVIDER === "anthropic" && ANTHROPIC_KEY);
  if (!AI_ENABLED || !hasKey) {
    const rep = studentFallbackReport(snapshot);
    return { report: rep, confidence: rep.confidence, status: "generated", usage: null, model: "fallback", used_ai: false };
  }
  try {
    const aiRes = await callAIRaw(STUDENT_SYSTEM_PROMPT, "Generate the learning diagnosis and evidence-based topic lessons for the exact period in this snapshot. Return JSON only:\n" + JSON.stringify(snapshot), 3000);
    const parsed = extractJson(aiRes.text);
    if (!validateStudentReportShape(parsed)) {
      const rep = studentFallbackReport(snapshot);
      return { report: rep, confidence: rep.confidence, status: "fallback", usage: aiRes.usage, model: aiRes.model, used_ai: false };
    }
    parsed.status = "generated";
    return { report: parsed, confidence: parsed.confidence, status: "generated", usage: aiRes.usage, model: aiRes.model, used_ai: true };
  } catch (err) {
    console.error("[AI] Student report xatosi — fallback:", err.message);
    const rep = studentFallbackReport(snapshot);
    return { report: rep, confidence: rep.confidence, status: "fallback", usage: null, model: "fallback", used_ai: false };
  }
}

// ============================================================================
// TEACHER CLASS REPORT — o'qituvchiga (sinf tahlili, professional)
// ============================================================================
const TEACHER_SYSTEM_PROMPT = `You are a teaching assistant analyzing class performance. You write reports in UZBEK (latin script), addressing the TEACHER professionally.

ABSOLUTE RULES:
1. Use ONLY the numbers in the provided JSON snapshot. NEVER invent data.
2. If data_quality.enough_data is false, return the insufficient_data response.
3. Be professional and constructive. NEVER use harmful labels about students.
4. Base "students_need_attention" ONLY on the snapshot's students_need_attention list.
5. Give concrete teaching recommendations based on weak_skills and most_missed_questions.
6. Return ONLY valid JSON. No markdown, no code fences.

Schema:
{
  "status": "generated",
  "title": "string (uzbek)",
  "class_summary": "string — 2-3 sentences about the class this week",
  "key_findings": ["string"],
  "students_need_attention": [{"name": "string", "reason": "string"}],
  "teaching_recommendations": ["string"],
  "confidence": "high | medium | low"
}
Keep arrays 2-5 items. For students_need_attention, use names from the snapshot (or "Bir o'quvchi" if name is null).`;

function teacherFallbackReport(snapshot) {
  const s = snapshot, comp = s.completion || {}, perf = s.performance || {};
  const weak = s.weak_skills || [], missed = s.most_missed_questions || [], attention = s.students_need_attention || [];
  const cls = s.class || {};

  let summary = `${cls.name || "Sinf"}da bu hafta ${comp.assignments_given || 0} ta topshiriq berildi.`;
  if (comp.average_completion != null) summary += ` O'rtacha bajarish: ${comp.average_completion}%.`;
  if (perf.class_average != null) summary += ` Sinf o'rtacha natijasi: ${perf.class_average}%.`;

  const findings = [];
  if (cls.total_students != null) findings.push(`Sinfda ${cls.total_students} ta o'quvchi.`);
  if (comp.late_submissions) findings.push(`${comp.late_submissions} ta topshiriq kechikib topshirilgan.`);
  if (comp.missing_submissions) findings.push(`${comp.missing_submissions} ta topshiriq bajarilmagan.`);
  if (weak.length) findings.push(`Eng zaif ko'nikma: ${weak[0].skill} (${weak[0].class_accuracy}%).`);
  if (perf.highest_student) findings.push(`Eng yuqori natija: ${perf.highest_student.name} (${perf.highest_student.percent}%).`);

  const recs = [];
  if (weak.length) recs.push(`Keyingi darsda ${weak[0].skill} bo'yicha takrorlash o'tkazish tavsiya etiladi.`);
  if (missed.length) recs.push(`Eng ko'p xato qilingan savollar ${missed[0].skill} mavzusiga tegishli — qo'shimcha mashq bering.`);
  if (comp.missing_submissions > 0) recs.push("Topshiriq bajarmagan o'quvchilar bilan alohida ishlash kerak.");
  if (recs.length === 0) recs.push("Sinf yaxshi ishlayapti — hozirgi sur'atni saqlang.");

  const needAttn = attention.map((a) => ({ name: a.name || "Bir o'quvchi", reason: a.reason }));

  return {
    status: "generated",
    title: (cls.name || "Sinf") + " — haftalik tahlil",
    class_summary: summary,
    key_findings: findings,
    students_need_attention: needAttn,
    teaching_recommendations: recs,
    confidence: (s.data_quality && s.data_quality.confidence) || "medium",
    _fallback: true,
  };
}

function validateTeacherReportShape(o) {
  if (!o || typeof o !== "object") return false;
  if (typeof o.title !== "string" || typeof o.class_summary !== "string") return false;
  if (!Array.isArray(o.key_findings) || !Array.isArray(o.teaching_recommendations) || !Array.isArray(o.students_need_attention)) return false;
  if (!["high", "medium", "low"].includes(o.confidence)) return false;
  return true;
}

async function generateTeacherClassReport(snapshot) {
  if (!snapshot.data_quality || !snapshot.data_quality.enough_data) {
    const rep = {
      status: "insufficient_data",
      title: "Hali yetarli ma'lumot yo'q",
      message: "Sinf tahlili uchun kamida 5 ta topshiriq natijasi yoki 30 ta javob kerak. O'quvchilar topshiriqlarni bajarganda hisobot tayyorlanadi.",
      class_summary: "", key_findings: [], students_need_attention: [], teaching_recommendations: [],
      next_steps: ["O'quvchilarga topshiriq bering.", "Topshiriqlar bajarilgach hisobotni yangilang."],
      confidence: "low",
    };
    return { report: rep, confidence: "low", status: "insufficient_data", usage: null, model: null, used_ai: false };
  }
  const hasKey = (AI_PROVIDER === "openai" && OPENAI_KEY) || (AI_PROVIDER === "anthropic" && ANTHROPIC_KEY);
  if (!AI_ENABLED || !hasKey) {
    const rep = teacherFallbackReport(snapshot);
    return { report: rep, confidence: rep.confidence, status: "generated", usage: null, model: "fallback", used_ai: false };
  }
  try {
    const aiRes = await callAIRaw(TEACHER_SYSTEM_PROMPT, "Generate the teacher class report from this snapshot. Return JSON only:\n" + JSON.stringify(snapshot), 1800);
    const parsed = extractJson(aiRes.text);
    if (!validateTeacherReportShape(parsed)) {
      const rep = teacherFallbackReport(snapshot);
      return { report: rep, confidence: rep.confidence, status: "fallback", usage: aiRes.usage, model: aiRes.model, used_ai: false };
    }
    parsed.status = "generated";
    return { report: parsed, confidence: parsed.confidence, status: "generated", usage: aiRes.usage, model: aiRes.model, used_ai: true };
  } catch (err) {
    console.error("[AI] Teacher report xatosi — fallback:", err.message);
    const rep = teacherFallbackReport(snapshot);
    return { report: rep, confidence: rep.confidence, status: "fallback", usage: null, model: "fallback", used_ai: false };
  }
}

module.exports = {
  generateParentWeeklyReport,
  generateStudentWeeklyReport,
  generateTeacherClassReport,
  // test uchun ochiq:
  fallbackReport,
  insufficientDataReport,
  validateReportShape,
  studentFallbackReport,
  teacherFallbackReport,
  validateTeacherReportShape,
};
