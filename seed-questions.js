const pool = require("./db");

const questions = [
  {
    question_text: "She ___ a teacher.",
    option_a: "am", option_b: "is", option_c: "are", option_d: "be",
    correct_option: "B",
    skill: "grammar",
    explanation: "'She' uchun 'is' ishlatiladi.",
  },
  {
    question_text: "I have two ___.",
    option_a: "cat", option_b: "cats", option_c: "cates", option_d: "caties",
    correct_option: "B",
    skill: "grammar",
    explanation: "Ko'plik uchun 'cats' (oddiy -s qo'shiladi).",
  },
  {
    question_text: "What is the opposite of 'big'?",
    option_a: "large", option_b: "huge", option_c: "small", option_d: "tall",
    correct_option: "C",
    skill: "vocabulary",
    explanation: "'Big' (katta) ning teskarisi 'small' (kichik).",
  },
  {
    question_text: "They ___ playing football now.",
    option_a: "is", option_b: "am", option_c: "be", option_d: "are",
    correct_option: "D",
    skill: "grammar",
    explanation: "'They' uchun 'are' ishlatiladi.",
  },
  {
    question_text: "A place where you borrow books is a ___.",
    option_a: "library", option_b: "kitchen", option_c: "garden", option_d: "station",
    correct_option: "A",
    skill: "vocabulary",
    explanation: "Kitob oladigan joy — 'library' (kutubxona).",
  },
  {
    question_text: "He ___ to school every day.",
    option_a: "go", option_b: "goes", option_c: "going", option_d: "gone",
    correct_option: "B",
    skill: "grammar",
    explanation: "'He' uchun fe'lga -es qo'shiladi: 'goes'.",
  },
  {
    question_text: "Choose the correct color: The sky is ___.",
    option_a: "green", option_b: "blue", option_c: "brown", option_d: "purple",
    correct_option: "B",
    skill: "vocabulary",
    explanation: "Osmon — 'blue' (ko'k).",
  },
  {
    question_text: "___ is your name?",
    option_a: "Who", option_b: "Where", option_c: "What", option_d: "When",
    correct_option: "C",
    skill: "grammar",
    explanation: "Ism so'rash uchun 'What is your name?' ishlatiladi.",
  },
  {
    question_text: "We ___ happy today.",
    option_a: "is", option_b: "am", option_c: "are", option_d: "be",
    correct_option: "C",
    skill: "grammar",
    explanation: "'We' uchun 'are' ishlatiladi.",
  },
  {
    question_text: "An apple is a kind of ___.",
    option_a: "fruit", option_b: "animal", option_c: "color", option_d: "car",
    correct_option: "A",
    skill: "vocabulary",
    explanation: "Olma — 'fruit' (meva).",
  },
];

async function seedQuestions() {
  try {
    for (const q of questions) {
      await pool.query(
        `INSERT INTO questions
         (question_text, option_a, option_b, option_c, option_d, correct_option, cefr_level, skill, difficulty, explanation)
         VALUES ($1, $2, $3, $4, $5, $6, 'A1', $7, 'easy', $8)`,
        [q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.skill, q.explanation]
      );
    }
    console.log(`${questions.length} ta savol muvaffaqiyatli qo'shildi!`);
  } catch (err) {
    console.error("Savol qo'shishda xato:", err.message);
  } finally {
    await pool.end();
  }
}

seedQuestions();