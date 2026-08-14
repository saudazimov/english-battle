(function battleI18nModule(root) {
  "use strict";

  var rows = [
    ["metaTitle", "English Battle — Jang", "English Battle — Battle", "English Battle — Битва"],
    ["noBattle", "Faol battle topilmadi", "No active battle found", "Активная битва не найдена"],
    ["noBattleText", "Battle xonasi faqat raqib topilganda ochiladi. Battle boshlash uchun Battle markaziga qayting va rejimni tanlang.", "The battle room opens only after an opponent is found. Return to the Battle Center and choose a mode to start.", "Комната битвы открывается только после нахождения соперника. Вернитесь в центр битв и выберите режим."],
    ["backBattleCenter", "Battle markaziga qaytish", "Return to Battle Center", "Вернуться в центр битв"],
    ["searching", "Raqib qidirilmoqda...", "Searching for an opponent...", "Поиск соперника..."],
    ["searchingText", "Mos raqib topilmoqda, iltimos kuting.", "Finding a suitable opponent. Please wait.", "Подбираем подходящего соперника. Пожалуйста, подождите."],
    ["mode", "REJIM", "MODE", "РЕЖИМ"],
    ["level", "LEVEL", "LEVEL", "УРОВЕНЬ"],
    ["questions", "SAVOLLAR", "QUESTIONS", "ВОПРОСЫ"],
    ["time", "VAQT", "TIME", "ВРЕМЯ"],
    ["rating", "RATING", "RATING", "РЕЙТИНГ"],
    ["you", "Siz", "You", "Вы"],
    ["opponent", "Raqib", "Opponent", "Соперник"],
    ["opponentSearching", "Raqib qidirilmoqda", "Searching for opponent", "Ищем соперника"],
    ["averageWait", "O'rtacha kutish vaqti: 10–20 soniya", "Average wait: 10–20 seconds", "Среднее ожидание: 10–20 секунд"],
    ["fairMatchmaking", "Fair matchmaking", "Fair matchmaking", "Честный подбор"],
    ["similarRating", "Similar rating", "Similar rating", "Близкий рейтинг"],
    ["sameLevel", "Same level", "Same level", "Одинаковый уровень"],
    ["friendBattle", "Do'st jangi", "Friend battle", "Битва с другом"],
    ["grammar", "Grammar", "Grammar", "Грамматика"],
    ["potentialRewards", "Potensial mukofotlar", "Potential rewards", "Возможные награды"],
    ["ratingPoints", "Reyting ochkolari", "Rating points", "Очки рейтинга"],
    ["xpPoints", "XP ochkolari", "XP points", "Очки XP"],
    ["cancelSearch", "Qidiruvni bekor qilish", "Cancel search", "Отменить поиск"],
    ["cancelNoPenalty", "Qidiruv bekor qilinsa hech qanday jarima bo'lmaydi.", "There is no penalty for cancelling the search.", "За отмену поиска штрафа нет."],
    ["readyStarting", "Tayyor! Battle boshlanmoqda...", "Ready! The battle is starting...", "Готово! Битва начинается..."],
    ["autoStart", "Battle avtomatik ravishda boshlanadi.", "The battle will start automatically.", "Битва начнётся автоматически."],
    ["battleRoom", "BATTLE ROOM", "BATTLE ROOM", "КОМНАТА БИТВЫ"],
    ["live", "LIVE", "LIVE", "В ЭФИРЕ"],
    ["leaveBattle", "Leave Battle", "Leave Battle", "Покинуть битву"],
    ["questionProgress", "Savol Progress", "Question progress", "Прогресс вопросов"],
    ["battleMode", "Battle Mode", "Battle mode", "Режим битвы"],
    ["timePerQuestion", "Time per question", "Time per question", "Время на вопрос"],
    ["accuracy", "ACCURACY", "ACCURACY", "ТОЧНОСТЬ"],
    ["streak", "STREAK", "STREAK", "СЕРИЯ"],
    ["xpReward", "XP REWARD", "XP REWARD", "НАГРАДА XP"],
    ["winReward", "WIN REWARD", "WIN REWARD", "НАГРАДА ЗА ПОБЕДУ"],
    ["atBattleEnd", "Battle oxirida", "At the end of the battle", "В конце битвы"],
    ["battleChat", "Battle Chat", "Battle Chat", "Чат битвы"],
    ["writeMessage", "Xabar yozing...", "Write a message...", "Напишите сообщение..."],
    ["leaveQuestion", "Battle'dan chiqmoqchimisiz?", "Do you want to leave the battle?", "Хотите покинуть битву?"],
    ["leaveWarning", "Agar hozir chiqsangiz, bu battle yutqazilgan deb hisoblanishi mumkin.", "If you leave now, this battle may count as a loss.", "Если выйти сейчас, битва может быть засчитана как поражение."],
    ["stay", "Battle'da qolish", "Stay in battle", "Остаться в битве"],
    ["leave", "Chiqish", "Leave", "Выйти"],
    ["victory", "G'alaba!", "Victory!", "Победа!"],
    ["defeat", "Mag'lubiyat", "Defeat", "Поражение"],
    ["draw", "Durang!", "Draw!", "Ничья!"],
    ["correctShort", "to'g'ri", "correct", "верно"],
    ["seeMistakes", "Xatolarni ko'rish", "Review mistakes", "Посмотреть ошибки"],
    ["rematch", "Rematch", "Rematch", "Реванш"],
    ["playAgain", "Yana o'ynash", "Play again", "Играть снова"],
    ["toLobby", "Lobbyga", "Go to lobby", "В лобби"],
    ["reportOpponent", "Raqib ustidan shikoyat", "Report opponent", "Пожаловаться на соперника"],
    ["answerAnalysis", "Javoblar tahlili", "Answer analysis", "Разбор ответов"],
    ["analysisSubtitle", "Har bir savol bo'yicha natijangiz va tushuntirish.", "Your result and explanation for each question.", "Ваш результат и объяснение по каждому вопросу."],
    ["back", "Orqaga", "Back", "Назад"],
    ["previous", "Oldingi", "Previous", "Назад"],
    ["next", "Keyingi", "Next", "Далее"],
    ["previousTen", "Oldingi 10 ta savol", "Previous 10 questions", "Предыдущие 10 вопросов"],
    ["nextTen", "Keyingi 10 ta savol", "Next 10 questions", "Следующие 10 вопросов"],
    ["correctAnswer", "To'g'ri javob", "Correct answer", "Правильный ответ"],
    ["wrongAnswer", "Noto'g'ri javob", "Incorrect answer", "Неправильный ответ"],
    ["unanswered", "Javob berilmagan", "Unanswered", "Без ответа"],
    ["currentQuestion", "Joriy savol", "Current question", "Текущий вопрос"],
    ["rematchInvite", "Rematch chaqiruvi", "Rematch invitation", "Приглашение на реванш"],
    ["rematchQuestion", "Qayta jang qilasizmi?", "Would you like a rematch?", "Хотите сыграть реванш?"],
    ["accept", "Qabul", "Accept", "Принять"],
    ["decline", "Rad etish", "Decline", "Отклонить"],
    ["questionReport", "Savol haqida shikoyat", "Report question", "Пожаловаться на вопрос"],
    ["questionProblem", "Bu savolda nima muammo bor?", "What is wrong with this question?", "Что не так с этим вопросом?"],
    ["incorrectMarked", "To'g'ri javob xato belgilangan", "The correct answer is marked incorrectly", "Правильный ответ отмечен неверно"],
    ["inappropriate", "Nomaqbul kontent", "Inappropriate content", "Неприемлемый контент"],
    ["notRelevant", "Savol mavzuga mos emas", "The question does not match the topic", "Вопрос не соответствует теме"],
    ["offensive", "Haqoratli", "Offensive", "Оскорбительный контент"],
    ["harmfulLanguage", "Haqoratli yoki zararli til", "Offensive or harmful language", "Оскорбительная или вредоносная лексика"],
    ["other", "Boshqa", "Other", "Другое"],
    ["otherProblem", "Boshqa muammo", "Another problem", "Другая проблема"],
    ["optionalComment", "Qo'shimcha izoh (ixtiyoriy)...", "Additional comment (optional)...", "Дополнительный комментарий (необязательно)..."],
    ["cancel", "Bekor qilish", "Cancel", "Отмена"],
    ["send", "Yuborish", "Send", "Отправить"],
    ["sending", "Yuborilmoqda...", "Sending...", "Отправка..."],
    ["chooseReason", "Iltimos, sababni tanlang", "Please select a reason", "Пожалуйста, выберите причину"],
    ["authError", "Avtorizatsiya xatosi", "Authorization error", "Ошибка авторизации"],
    ["error", "Xato", "Error", "Ошибка"],
    ["serverError", "Server xatosi", "Server error", "Ошибка сервера"],
    ["genericError", "Xatolik", "Error", "Ошибка"],
    ["startError", "Jangni boshlashda xatolik yuz berdi.", "An error occurred while starting the battle.", "Произошла ошибка при запуске битвы."],
    ["battleStarting", "Jang boshlanmoqda!", "The battle is starting!", "Битва начинается!"],
    ["challengeAccepted", "Chaqiruvingiz qabul qilindi. Tayyorlaning!", "Your challenge was accepted. Get ready!", "Ваш вызов принят. Приготовьтесь!"],
    ["youAccepted", "Siz chaqiruvni qabul qildingiz. Tayyorlaning!", "You accepted the challenge. Get ready!", "Вы приняли вызов. Приготовьтесь!"],
    ["found", "Raqib topildi!", "Opponent found!", "Соперник найден!"],
    ["foundText", "Mos raqib topildi. Battle boshlanishiga tayyorlaning.", "A suitable opponent was found. Get ready for the battle.", "Подходящий соперник найден. Приготовьтесь к битве."],
    ["practiceOpponent", "Mashqlovchi raqib", "Practice opponent", "Тренировочный соперник"],
    ["starting", "Battle boshlanmoqda...", "The battle is starting...", "Битва начинается..."],
    ["finishedWaiting", "Tugatdingiz! Raqib kutilmoqda...", "Finished! Waiting for your opponent...", "Готово! Ожидаем соперника..."],
    ["offline", "(oflayn)", "(offline)", "(не в сети)"],
    ["leaguePromoted", "Liga ko'tarildi!", "League promoted!", "Повышение лиги!"],
    ["leagueDemoted", "Liga tushdi", "League demoted", "Понижение лиги"],
    ["casual", "Casual", "Casual", "Обычный"],
    ["highest", "Eng yuqori!", "Highest rank!", "Высший ранг!"],
    ["highestLeague", "Siz eng yuqori ligadasiz!", "You are in the highest league!", "Вы в высшей лиге!"],
    ["rematchSent", "Rematch so'rovi yuborildi, javob kutilmoqda...", "Rematch request sent. Waiting for a response...", "Запрос на реванш отправлен. Ожидаем ответ..."],
    ["opponentUnavailable", "Raqib mavjud emas.", "Opponent is unavailable.", "Соперник недоступен."],
    ["analysisMissing", "Tahlil ma'lumotlari topilmadi", "Analysis data not found", "Данные анализа не найдены"],
    ["analysisUnavailable", "Bu jang uchun javoblar tahlili mavjud emas.", "Answer analysis is unavailable for this battle.", "Разбор ответов для этой битвы недоступен."],
    ["yourCorrect", "Sizning javobingiz · To'g'ri", "Your answer · Correct", "Ваш ответ · Верно"],
    ["yourAnswer", "Sizning javobingiz", "Your answer", "Ваш ответ"],
    ["answeredCorrectly", "To'g'ri javob berdingiz", "You answered correctly", "Вы ответили верно"],
    ["answeredWrong", "Noto'g'ri javob berdingiz", "You answered incorrectly", "Вы ответили неверно"],
    ["readExplanation", "Qaytadan tushuntirishni o'qing.", "Read the explanation again.", "Прочитайте объяснение ещё раз."],
    ["notAnswered", "Bu savolga javob bermagansiz.", "You did not answer this question.", "Вы не ответили на этот вопрос."],
    ["explanation", "Tushuntirish", "Explanation", "Объяснение"],
    ["explanationMissing", "Bu savol uchun tushuntirish hali qo'shilmagan.", "An explanation has not been added for this question yet.", "Объяснение для этого вопроса пока не добавлено."],
    ["report", "Shikoyat", "Report", "Пожаловаться"],
    ["opponentProblem", "Bu raqibda qanday muammo bor?", "What is the problem with this opponent?", "В чём проблема с этим соперником?"],
    ["cheating", "Firibgarlik", "Cheating", "Мошенничество"],
    ["cheatingText", "O'yinda aldash, halol bo'lmagan harakat", "Cheating or unfair behavior in the game", "Обман или нечестное поведение в игре"],
    ["badBehavior", "Nomaqbul xatti-harakat", "Inappropriate behavior", "Неприемлемое поведение"],
    ["badBehaviorText", "Qo'pol yoki nomaqbul muomala", "Rude or inappropriate conduct", "Грубое или неприемлемое поведение"],
    ["insult", "Haqorat", "Abuse", "Оскорбление"],
    ["insultText", "Haqoratli yoki zararli til (chat)", "Offensive or harmful language (chat)", "Оскорбительная или вредоносная лексика (чат)"],
    ["spam", "Spam", "Spam", "Спам"],
    ["spamText", "Keraksiz xabar", "Unwanted messages", "Нежелательные сообщения"],
    ["opponentUnknown", "Raqib aniqlanmadi", "Opponent could not be identified", "Не удалось определить соперника"],
    ["countdown", "Battle {count} soniyada boshlanadi", "Battle starts in {count} seconds", "Битва начнётся через {count} сек."],
    ["ratingValue", "RATING: {rating}", "RATING: {rating}", "РЕЙТИНГ: {rating}"],
    ["best", "Best: {count}", "Best: {count}", "Лучшее: {count}"],
    ["questionNumber", "SAVOL {current} / {total}", "QUESTION {current} / {total}", "ВОПРОС {current} / {total}"],
    ["opponentAnswered", "Raqib {count} ta savolga javob berdi", "Opponent answered {count} questions", "Соперник ответил на {count} вопросов"],
    ["nextLeague", "Keyingi: {name}", "Next: {name}", "Следующая: {name}"],
    ["leagueRemaining", "{name} ligasiga {count} RP qoldi", "{count} RP left to reach {name}", "До лиги {name} осталось {count} RP"],
    ["rematchFrom", "{name} sizni rematch'ga chaqirmoqda", "{name} invited you to a rematch", "{name} приглашает вас на реванш"],
    ["rematchDeclined", "{name} rematch'ni rad etdi.", "{name} declined the rematch.", "{name} отказался от реванша."],
    ["opponentReportTitle", "{name} — shikoyat", "Report {name}", "Жалоба на {name}"],
    ["reviewBadge", "Savol {current} / {total}", "Question {current} / {total}", "Вопрос {current} / {total}"],
    ["ratingSuffix", "{prefix} reyting", "{prefix} rating", "{prefix} рейтинга"]
  ];

  var messages = { uz: {}, en: {}, ru: {} };
  rows.forEach(function (row) {
    messages.uz[row[0]] = row[1];
    messages.en[row[0]] = row[2];
    messages.ru[row[0]] = row[3];
  });

  function language() {
    return root.IlmLigaI18n ? root.IlmLigaI18n.getLanguage() : "uz";
  }

  function format(template, params) {
    if (!params) return template;
    return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
      return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : "{" + key + "}";
    });
  }

  function t(key, params, targetLanguage) {
    var selected = targetLanguage || language();
    var template = messages[selected] && messages[selected][key];
    if (template == null) template = messages.uz[key];
    return format(template == null ? key : template, params);
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function compileTemplate(template) {
    var names = [];
    var source = "^";
    var cursor = 0;
    String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, name, offset) {
      source += escapeRegex(template.slice(cursor, offset)) + "(.+?)";
      names.push(name);
      cursor = offset + match.length;
      return match;
    });
    source += escapeRegex(template.slice(cursor)) + "$";
    return { regex: new RegExp(source), names: names };
  }

  var exactLookup = {};
  var templates = [];
  Object.keys(messages.uz).forEach(function (key) {
    if (/\{[a-zA-Z0-9_]+\}/.test(messages.uz[key])) {
      ["uz", "en", "ru"].forEach(function (sourceLanguage) {
        var compiled = compileTemplate(messages[sourceLanguage][key]);
        templates.push({ key: key, regex: compiled.regex, names: compiled.names });
      });
      return;
    }
    ["uz", "en", "ru"].forEach(function (sourceLanguage) {
      exactLookup[messages[sourceLanguage][key]] = key;
    });
  });

  function translate(value, targetLanguage) {
    var text = String(value == null ? "" : value);
    var key = exactLookup[text];
    if (key) return t(key, null, targetLanguage);
    for (var i = 0; i < templates.length; i += 1) {
      var match = templates[i].regex.exec(text);
      if (!match) continue;
      var params = {};
      templates[i].names.forEach(function (name, index) { params[name] = match[index + 1]; });
      return t(templates[i].key, params, targetLanguage);
    }
    return text;
  }

  function isLearningOrUserContent(node) {
    var parent = node && node.parentElement;
    if (!parent || typeof parent.closest !== "function") return false;
    return Boolean(parent.closest("#qText,#options,#brChatList,.rev-question,.rev-opt-text,.rev-explain-text,#myName,#oppName,#myLbl,#oppLbl,#mmMeNameSearch,#mmOppNameSearch"));
  }

  function translateTextNode(node, targetLanguage) {
    if (isLearningOrUserContent(node)) return;
    var value = node.nodeValue || "";
    var core = value.trim();
    if (!core) return;
    var translated = translate(core, targetLanguage);
    if (translated === core) return;
    node.nodeValue = value.match(/^\s*/)[0] + translated + value.match(/\s*$/)[0];
  }

  function apply(scope) {
    if (!root.document) return;
    var target = scope || root.document;
    var selected = language();
    if (target.nodeType === 3) {
      translateTextNode(target, selected);
      return;
    }
    if (target.nodeType !== 1 && target.nodeType !== 9) return;
    var walker = root.document.createTreeWalker(target, 4);
    var textNode;
    while ((textNode = walker.nextNode())) translateTextNode(textNode, selected);
    var elements = target.querySelectorAll ? target.querySelectorAll("[placeholder],[title],[aria-label]") : [];
    Array.prototype.forEach.call(elements, function (element) {
      ["placeholder", "title", "aria-label"].forEach(function (attribute) {
        if (!element.hasAttribute(attribute)) return;
        var value = element.getAttribute(attribute);
        var translated = translate(value, selected);
        if (translated !== value) element.setAttribute(attribute, translated);
      });
    });
  }

  function start() {
    if (!root.document) return;
    apply(root.document);
    root.addEventListener("ilmliga:languagechange", function () { apply(root.document); });
    if (typeof root.MutationObserver === "function") {
      var observer = new root.MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.type === "characterData") apply(mutation.target);
          Array.prototype.forEach.call(mutation.addedNodes || [], function (node) { apply(node); });
          if (mutation.type === "attributes") apply(mutation.target);
        });
      });
      observer.observe(root.document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["placeholder", "title", "aria-label"]
      });
    }
  }

  var api = { apply: apply, messages: messages, t: t, translate: translate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && root.document) {
    root.BattleI18n = api;
    start();
  }
}(typeof window !== "undefined" ? window : globalThis));
