const PROFANITY_LIST = [
  // Ingliz
  "fuck", "shit", "bitch", "asshole", "dick", "pussy", "cunt", "bastard", "whore", "slut", "fag", "nigger", "nigga", "retard",
  // Rus (lotin va kirill)
  "blyat", "blyad", "suka", "pizdec", "pizda", "khuy", "huy", "ebal", "yebat", "mudak", "gandon",
  "блять", "блядь", "сука", "пизда", "хуй", "ебать", "мудак", "гандон", "ебал",
  // O'zbek (keng tarqalgan haqoratlar)
  "jalab", "qotoq", "qoToq", "ko'toq", "kotoq", "am ", "amini", "amaki seni", "enagni", "onangni", "dalbayob", "dolboyob", "tasqara",
];

// Matnda so'kinish bormi tekshiradi va yulduzcha bilan almashtiradi.
function filterProfanity(text) {
  if (!text) return text;
  var filtered = text;
  for (var i = 0; i < PROFANITY_LIST.length; i++) {
    var word = PROFANITY_LIST[i];
    if (!word) continue;
    // So'z chegarasi bilan qidirish (katta-kichik harfsiz). Maxsus belgilarni ekran qilamiz.
    var escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp(escaped, "gi");
    filtered = filtered.replace(re, function (m) { return "*".repeat(m.length); });
  }
  return filtered;
}

module.exports = { filterProfanity };
