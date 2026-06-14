const pool = require("./db");

const quests = [
  { title: "Jangchi", description: "1 ta jangda g'alaba qozon", quest_type: "win_battles", target: 1, xp_reward: 30 },
  { title: "Faol o'yinchi", description: "3 ta jang o'yna", quest_type: "play_battles", target: 3, xp_reward: 40 },
  { title: "Bilimdon", description: "15 ta savolga to'g'ri javob ber", quest_type: "correct_answers", target: 15, xp_reward: 50 },
  { title: "XP yig'uvchi", description: "100 XP to'pla", quest_type: "earn_xp", target: 100, xp_reward: 30 },
  { title: "G'olib", description: "2 ta jangda g'alaba qozon", quest_type: "win_battles", target: 2, xp_reward: 60 },
];

async function seedQuests() {
  try {
    for (const q of quests) {
      await pool.query(
        `INSERT INTO quests (title, description, quest_type, target, xp_reward)
         VALUES ($1, $2, $3, $4, $5)`,
        [q.title, q.description, q.quest_type, q.target, q.xp_reward]
      );
    }
    console.log(`${quests.length} ta topshiriq qo'shildi!`);
  } catch (err) {
    console.error("Topshiriq qo'shish xatosi:", err.message);
  } finally {
    await pool.end();
  }
}

seedQuests();