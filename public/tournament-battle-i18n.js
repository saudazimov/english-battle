(function (root) {
  "use strict";

  var messages = {
    uz: {
      metaTitle: "IlmLiga — Turnir jangi",
      tournaments: "Turnirlar",
      loading: "Yuklanmoqda...",
      matchIdMissing: "Match ID topilmadi",
      notParticipant: "Siz bu matchning ishtirokchisi emassiz",
      matchLoadFailed: "Match topilmadi yoki yuklab bo‘lmadi",
      unexpectedError: "Xatolik yuz berdi",
      battleLoadFailed: "Jang yuklanmadi",
      timeRemaining: "qolgan vaqt",
      questionProgress: "Savol {current} / {total}",
      questionNumber: "Savol {current}",
      youFinished: "Siz tugatdingiz!",
      waitForPlayers: "Boshqa o‘yinchilar tugatishini kuting. Natija avtomatik chiqadi.",
      draw: "Durang!",
      victory: "G‘alaba! 🎉",
      defeat: "Mag‘lubiyat",
      winnerLabel: "G‘olib",
      drawResult: "Natija teng yakunlandi",
      backToTournaments: "Turnirlarga qaytish",
      checkinOpen: "Check-in ochiq — jangga tayyorlaning",
      battleStarted: "Jang boshlandi!",
      matchFinished: "Match yakunlandi",
      matchPending: "Match hali boshlanmagan",
      untilBattleStarts: "Jang boshlanishigacha",
      youAreReady: "Siz tayyorsiz",
      readyWaitHint: "Boshqa o‘yinchilar tayyor bo‘lishini kuting. Jang belgilangan vaqtda avtomatik boshlanadi.",
      readyButton: "Tayyorman!",
      readyConfirmHint: "“Tayyorman” tugmasini bosib, jangda qatnashishingizni tasdiqlang.",
      readyCount: "{ready} / {total} tayyor",
      you: "siz",
      reserve: "Zaxira",
      starter: "Asosiy",
      ready: "Tayyor",
      waiting: "Kutilmoqda",
      checkinError: "Check-in xatosi",
      serverError: "Server xatosi"
    },
    en: {
      metaTitle: "IlmLiga — Tournament Battle",
      tournaments: "Tournaments",
      loading: "Loading...",
      matchIdMissing: "Match ID was not found",
      notParticipant: "You are not a participant in this match",
      matchLoadFailed: "The match was not found or could not be loaded",
      unexpectedError: "An unexpected error occurred",
      battleLoadFailed: "The battle could not be loaded",
      timeRemaining: "time remaining",
      questionProgress: "Question {current} / {total}",
      questionNumber: "Question {current}",
      youFinished: "You have finished!",
      waitForPlayers: "Wait for the other players to finish. The result will appear automatically.",
      draw: "Draw!",
      victory: "Victory! 🎉",
      defeat: "Defeat",
      winnerLabel: "Winner",
      drawResult: "The match ended in a draw",
      backToTournaments: "Back to tournaments",
      checkinOpen: "Check-in is open — get ready for battle",
      battleStarted: "The battle has started!",
      matchFinished: "The match has finished",
      matchPending: "The match has not started yet",
      untilBattleStarts: "Battle starts in",
      youAreReady: "You are ready",
      readyWaitHint: "Wait for the other players to get ready. The battle will start automatically at the scheduled time.",
      readyButton: "I’m ready!",
      readyConfirmHint: "Select “I’m ready” to confirm your participation in the battle.",
      readyCount: "{ready} / {total} ready",
      you: "you",
      reserve: "Reserve",
      starter: "Starter",
      ready: "Ready",
      waiting: "Waiting",
      checkinError: "Check-in failed",
      serverError: "Server error"
    },
    ru: {
      metaTitle: "IlmLiga — Турнирный бой",
      tournaments: "Турниры",
      loading: "Загрузка...",
      matchIdMissing: "ID матча не найден",
      notParticipant: "Вы не являетесь участником этого матча",
      matchLoadFailed: "Матч не найден или не удалось его загрузить",
      unexpectedError: "Произошла ошибка",
      battleLoadFailed: "Не удалось загрузить бой",
      timeRemaining: "осталось времени",
      questionProgress: "Вопрос {current} / {total}",
      questionNumber: "Вопрос {current}",
      youFinished: "Вы завершили!",
      waitForPlayers: "Дождитесь завершения других игроков. Результат появится автоматически.",
      draw: "Ничья!",
      victory: "Победа! 🎉",
      defeat: "Поражение",
      winnerLabel: "Победитель",
      drawResult: "Матч завершился вничью",
      backToTournaments: "Вернуться к турнирам",
      checkinOpen: "Регистрация открыта — приготовьтесь к бою",
      battleStarted: "Бой начался!",
      matchFinished: "Матч завершён",
      matchPending: "Матч ещё не начался",
      untilBattleStarts: "До начала боя",
      youAreReady: "Вы готовы",
      readyWaitHint: "Дождитесь готовности других игроков. Бой начнётся автоматически в назначенное время.",
      readyButton: "Я готов!",
      readyConfirmHint: "Нажмите «Я готов», чтобы подтвердить участие в бою.",
      readyCount: "{ready} / {total} готовы",
      you: "вы",
      reserve: "Запасной",
      starter: "Основной",
      ready: "Готов",
      waiting: "Ожидание",
      checkinError: "Ошибка регистрации",
      serverError: "Ошибка сервера"
    }
  };

  function language() {
    return root.IlmLigaI18n ? root.IlmLigaI18n.getLanguage() : "uz";
  }

  function format(text, params) {
    return String(text).replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
      return params && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : "{" + key + "}";
    });
  }

  function t(key, params) {
    var selected = messages[language()] || messages.uz;
    return format(selected[key] == null ? (messages.uz[key] == null ? key : messages.uz[key]) : selected[key], params);
  }

  function apply(scope) {
    var documentRef = root.document;
    if (!documentRef) return;
    var target = scope || documentRef;
    if (documentRef.documentElement) documentRef.documentElement.lang = language();
    if (!target.querySelectorAll) return;
    target.querySelectorAll("[data-tb-i18n]").forEach(function (element) {
      element.textContent = t(element.getAttribute("data-tb-i18n"));
    });
  }

  var api = { apply: apply, messages: messages, t: t };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TournamentBattleI18n = api;
  apply();
})(typeof window !== "undefined" ? window : globalThis);
