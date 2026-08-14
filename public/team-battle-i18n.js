(function teamBattleI18nModule(root) {
  "use strict";

  var rows = [
    ["metaTitle", "Jamoa Jang — English Battle", "Team Battle — English Battle", "Командная битва — English Battle"],
    ["searchingTeam", "Raqib jamoa qidirilmoqda...", "Searching for an opposing team...", "Поиск команды соперников..."],
    ["gatheringPlayers", "O'yinchilar yig'ilmoqda, iltimos kuting.", "Gathering players. Please wait.", "Собираем игроков. Пожалуйста, подождите."],
    ["mode", "REJIM", "MODE", "РЕЖИМ"],
    ["level", "DARAJA", "LEVEL", "УРОВЕНЬ"],
    ["questions", "SAVOLLAR", "QUESTIONS", "ВОПРОСЫ"],
    ["time", "VAQT", "TIME", "ВРЕМЯ"],
    ["players", "O'YINCHILAR", "PLAYERS", "ИГРОКИ"],
    ["secondsPerQuestion", "15s/savol", "15s/question", "15 сек./вопрос"],
    ["yourTeam", "Sizning jamoa", "Your team", "Ваша команда"],
    ["enemyTeam", "Raqib jamoa", "Opposing team", "Команда соперников"],
    ["waiting", "Kutilmoqda...", "Waiting...", "Ожидание..."],
    ["searching", "Qidirilmoqda...", "Searching...", "Поиск..."],
    ["averageWait", "O'rtacha kutish: 10–20 soniya", "Average wait: 10–20 seconds", "Среднее ожидание: 10–20 секунд"],
    ["battleStarting", "Jang boshlanmoqda...", "The battle is starting...", "Битва начинается..."],
    ["fairMatchmaking", "Adolatli matchmaking", "Fair matchmaking", "Честный подбор"],
    ["teamBased", "Jamoaviy", "Team-based", "Командная игра"],
    ["sameLevel", "Bir xil daraja", "Same level", "Одинаковый уровень"],
    ["potentialRewards", "Potensial mukofotlar", "Potential rewards", "Возможные награды"],
    ["ratingPoints", "Reyting ochkolari", "Rating points", "Очки рейтинга"],
    ["xpPoints", "XP ochkolari", "XP points", "Очки XP"],
    ["cancelSearch", "Qidiruvni bekor qilish", "Cancel search", "Отменить поиск"],
    ["cancelNoPenalty", "Qidiruv bekor qilinsa hech qanday jarima bo'lmaydi.", "There is no penalty for cancelling the search.", "За отмену поиска штрафа нет."],
    ["readyStarting", "Tayyor! Jang boshlanmoqda...", "Ready! The battle is starting...", "Готово! Битва начинается..."],
    ["battleRoom", "BATTLE ROOM", "BATTLE ROOM", "КОМНАТА БИТВЫ"],
    ["duoRoom", "2v2 Duo Battle · English", "2v2 Duo Battle · English", "Битва дуэтов 2v2 · Английский"],
    ["squadRoom", "4v4 Squad Battle · English", "4v4 Squad Battle · English", "Битва отрядов 4v4 · Английский"],
    ["live", "LIVE", "LIVE", "В ЭФИРЕ"],
    ["leaveBattle", "Leave Battle", "Leave Battle", "Покинуть битву"],
    ["duoBattle", "DUO BATTLE", "DUO BATTLE", "БИТВА ДУЭТОВ"],
    ["squadBattle", "SQUAD BATTLE", "SQUAD BATTLE", "БИТВА ОТРЯДОВ"],
    ["report", "Report", "Report", "Пожаловаться"],
    ["victory", "G'alaba!", "Victory!", "Победа!"],
    ["defeat", "Mag'lubiyat", "Defeat", "Поражение"],
    ["draw", "Durang", "Draw", "Ничья"],
    ["yourTeamUpper", "SIZNING JAMOA", "YOUR TEAM", "ВАША КОМАНДА"],
    ["enemyTeamUpper", "RAQIB JAMOA", "OPPOSING TEAM", "КОМАНДА СОПЕРНИКОВ"],
    ["playAgain", "Yana o'ynash", "Play again", "Играть снова"],
    ["toLobby", "Lobbyga", "Go to lobby", "В лобби"],
    ["errorOccurred", "Xato yuz berdi", "An error occurred", "Произошла ошибка"],
    ["backLobby", "Lobbyga qaytish", "Return to lobby", "Вернуться в лобби"],
    ["questionReport", "Savol ustidan shikoyat", "Report question", "Пожаловаться на вопрос"],
    ["incorrectAnswer", "Noto'g'ri javob", "Incorrect answer", "Неправильный ответ"],
    ["inappropriate", "Nomaqbul kontent", "Inappropriate content", "Неприемлемый контент"],
    ["spamRepeat", "Spam / takror", "Spam / duplicate", "Спам / повтор"],
    ["other", "Boshqa", "Other", "Другое"],
    ["cancel", "Bekor", "Cancel", "Отмена"],
    ["send", "Yuborish", "Send", "Отправить"],
    ["leaveTitle", "Jangni tark etish", "Leave battle", "Покинуть битву"],
    ["leavePrefix", "Jangni hozir tark etsangiz, bu", "If you leave the battle now, it may count as a", "Если вы покинете битву сейчас, это может считаться"],
    ["loss", "mag'lubiyat", "loss", "поражением"],
    ["leaveSuffix", "sifatida hisoblanishi va reytingingizga ta'sir qilishi mumkin. Rostdan ham chiqasizmi?", "and affect your rating. Are you sure you want to leave?", "и повлиять на ваш рейтинг. Вы уверены, что хотите выйти?"],
    ["continue", "Davom etish", "Continue", "Продолжить"],
    ["confirmLeave", "Ha, tark etaman", "Yes, leave", "Да, выйти"],
    ["player", "O'yinchi", "Player", "Игрок"],
    ["partyGathering", "Party yig'ilmoqda...", "Gathering the party...", "Собираем группу..."],
    ["waitingTeammates", "Jamoadoshlaringiz kutilmoqda", "Waiting for your teammates", "Ожидаем ваших товарищей"],
    ["teamReady", "Sizning jamoangiz tayyor — raqib kutilmoqda", "Your team is ready — waiting for opponents", "Ваша команда готова — ожидаем соперников"],
    ["teamFound", "Jamoa topildi!", "Team found!", "Команда найдена!"],
    ["prepare", "Jang boshlanmoqda, tayyorlaning", "The battle is starting. Get ready!", "Битва начинается. Приготовьтесь!"],
    ["finished", "Tugatdingiz!", "Finished!", "Готово!"],
    ["finishedWaiting", "Barcha savollarga javob berdingiz. Raqiblar tugatishini kuting...", "You answered all questions. Wait for the opponents to finish...", "Вы ответили на все вопросы. Дождитесь завершения соперников..."],
    ["offline", "(oflayn)", "(offline)", "(не в сети)"],
    ["highest", "Eng yuqori!", "Highest rank!", "Высший ранг!"],
    ["highestLeague", "Siz eng yuqori ligadasiz!", "You are in the highest league!", "Вы в высшей лиге!"],
    ["chooseReason", "Sababni tanlang", "Select a reason", "Выберите причину"],
    ["sent", "Yuborildi", "Sent", "Отправлено"],
    ["error", "Xato", "Error", "Ошибка"],
    ["serverError", "Server xatosi", "Server error", "Ошибка сервера"],
    ["partyDisbanded", "Party tarqaldi — tasodifiy jamoa qidirilmoqda", "The party disbanded — searching for a random team", "Группа распущена — ищем случайную команду"],
    ["questionNumber", "Savol {current} / {total}", "Question {current} / {total}", "Вопрос {current} / {total}"],
    ["playerProgress", "{ordinal} Player Progress", "{ordinal} Player Progress", "Прогресс игрока: {ordinal}"],
    ["contribution", "Sizning shaxsiy hissangiz: {score} / {total} to'g'ri javob", "Your contribution: {score} / {total} correct answers", "Ваш вклад: {score} / {total} правильных ответов"],
    ["nextLeague", "Keyingi: {name}", "Next: {name}", "Следующая: {name}"],
    ["leagueRemaining", "{name} ligasiga {count} RP qoldi", "{count} RP left to reach {name}", "До лиги {name} осталось {count} RP"],
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

  function isProtectedContent(node) {
    var parent = node && node.parentElement;
    if (!parent || typeof parent.closest !== "function") return false;
    return Boolean(parent.closest("#btQText,#btAnswers,.mm-member-name,.bt-pl-name,.rs-roster .nm"));
  }

  function translateTextNode(node, targetLanguage) {
    if (isProtectedContent(node)) return;
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
    root.TeamBattleI18n = api;
    start();
  }
}(typeof window !== "undefined" ? window : globalThis));
