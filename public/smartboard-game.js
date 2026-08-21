(function () {
  "use strict";

  var requestedMode = new URLSearchParams(window.location.search).get("mode");
  var GAME_MODE = requestedMode === "error" || requestedMode === "match" ? requestedMode : "grammar";
  var STORAGE_KEYS = {
    grammar: "ilmliga_smartboard_game_v1",
    error: "ilmliga_error_hunter_duel_v1",
    match: "ilmliga_match_master_duel_v1"
  };
  var STORAGE_KEY = STORAGE_KEYS[GAME_MODE];
  var state = null;
  var playerLocks = [false, false];
  var timerId = null;
  var touchTimes = { left: 0, right: 0 };

  function t(key, params) {
    return window.IlmLigaI18n ? window.IlmLigaI18n.t(key, params) : key;
  }

  function gameKey(name) {
    var prefix = GAME_MODE === "error" ? "errorhunter." : GAME_MODE === "match" ? "matchmaster." : "smartboard.";
    return prefix + name;
  }

  function applyModeCopy() {
    document.title = t(gameKey("metaTitle"));
    document.querySelector(".brand-mark").textContent = GAME_MODE === "error" ? "EH" : GAME_MODE === "match" ? "MM" : "IL";
    document.querySelector(".brand h1").textContent = t(gameKey("title"));
    document.querySelector(".brand p").textContent = t(gameKey("subtitle"));
    document.querySelector(".notice").textContent = t(gameKey("temporaryNotice"));
    document.getElementById("startBtn").textContent = t(gameKey("start"));
    document.querySelector("#resultScreen h2").textContent = t(gameKey("resultTitle"));
    document.body.classList.toggle("error-hunter-mode", GAME_MODE === "error");
    document.body.classList.toggle("match-master-mode", GAME_MODE === "match");
  }

  function saveState() {
    if (!state) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function clearState() {
    state = null;
    playerLocks = [false, false];
    sessionStorage.removeItem(STORAGE_KEY);
    if (timerId) window.clearInterval(timerId);
    timerId = null;
  }

  function restoreState() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      if (!saved || saved.version !== 1 || !Array.isArray(saved.questions) || !Array.isArray(saved.players)) return null;
      if ((saved.mode || "grammar") !== GAME_MODE) return null;
      if (saved.status !== "playing" && saved.status !== "results") return null;
      return saved;
    } catch (_) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function selectChoice(containerId, button) {
    document.querySelectorAll("#" + containerId + " .choice").forEach(function (item) { item.classList.remove("active"); });
    button.classList.add("active");
  }

  function selectedValue(containerId) {
    var active = document.querySelector("#" + containerId + " .choice.active");
    return active ? active.dataset.value : "";
  }

  function shuffledIndexes(length) {
    var indexes = Array.from({ length: length }, function (_, index) { return index; });
    for (var index = indexes.length - 1; index > 0; index -= 1) {
      var swapIndex = Math.floor(Math.random() * (index + 1));
      var temporary = indexes[index]; indexes[index] = indexes[swapIndex]; indexes[swapIndex] = temporary;
    }
    return indexes;
  }

  function showOnly(screenId) {
    ["setupScreen", "arenaScreen", "resultScreen"].forEach(function (id) {
      document.getElementById(id).hidden = id !== screenId;
    });
  }

  function optionText(question, letter) {
    return question["option_" + letter.toLowerCase()] || "";
  }

  function normalizedToken(value) {
    return String(value || "").toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
  }

  function tokenIndexes(tokens, targetTokens) {
    var normalized = tokens.map(normalizedToken);
    var target = targetTokens.map(normalizedToken);
    for (var start = 0; start <= normalized.length - target.length; start += 1) {
      if (target.every(function (value, offset) { return normalized[start + offset] === value; })) {
        return target.map(function (_, offset) { return start + offset; });
      }
    }
    return [Math.max(0, tokens.length - 1)];
  }

  function prepareHunter(player, question) {
    if (player.hunter && player.hunter.currentId === question.id) return;
    var correctOption = String(question.correct_option || "").toUpperCase();
    var wrongOptions = ["A", "B", "C", "D"].filter(function (letter) {
      return letter !== correctOption && optionText(question, letter).trim();
    });
    var wrongOption = wrongOptions[(player.index + player.order[player.index]) % wrongOptions.length];
    var wrongAnswer = optionText(question, wrongOption).trim();
    var correctAnswer = optionText(question, correctOption).trim();
    var source = String(question.question_text || "").trim();
    if (/_{2,}/.test(source)) {
      source = source.replace(/_{2,}/, wrongAnswer);
    } else if (correctAnswer && source.toLowerCase().includes(correctAnswer.toLowerCase())) {
      var position = source.toLowerCase().indexOf(correctAnswer.toLowerCase());
      source = source.slice(0, position) + wrongAnswer + source.slice(position + correctAnswer.length);
    } else {
      source = (source + " " + wrongAnswer).trim();
    }
    var tokens = source.split(/\s+/).filter(Boolean);
    player.hunter = {
      currentId: question.id,
      tokens: tokens,
      errorIndexes: tokenIndexes(tokens, wrongAnswer.split(/\s+/).filter(Boolean)),
      step: "find",
      selectedErrorIndex: null,
      errorFoundCorrect: false
    };
  }

  function correctAnswer(question) {
    return optionText(question, String(question.correct_option || "").toUpperCase()).trim();
  }

  function normalizedAnswer(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function prepareMatch(player) {
    if (player.match && player.match.matchedQuestions.length < player.match.batch.length) return;
    player.match = null;
    var batch = player.order.slice(player.index, player.index + 4);
    player.match = {
      batch: batch,
      answerOrder: shuffledIndexes(batch.length).map(function (index) { return batch[index]; }),
      selectedQuestion: null,
      matchedQuestions: [],
      matchedAnswers: [],
      feedback: ""
    };
  }

  async function readQuestionsResponse(response) {
    var contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      await response.text();
      if (response.status === 404) throw new Error(t("smartboard.restartServer"));
      throw new Error(t(gameKey("fetchFailed")));
    }

    var payload = await response.json();
    if (!response.ok) throw new Error(payload.error || t(gameKey("fetchFailed")));
    return payload;
  }

  async function startGame() {
    var leftName = document.getElementById("leftName").value.trim();
    var rightName = document.getElementById("rightName").value.trim();
    var errorBox = document.getElementById("setupError");
    if (!leftName || !rightName) {
      errorBox.textContent = t("smartboard.nameRequired");
      return;
    }

    var level = selectedValue("levelChoices");
    var count = Number(selectedValue("countChoices"));
    var duration = Number(selectedValue("durationChoices"));
    var startButton = document.getElementById("startBtn");
    startButton.disabled = true;
    startButton.textContent = t(gameKey("loading"));
    errorBox.textContent = "";

    try {
      var response = await authFetch("/smartboard/questions?level=" + encodeURIComponent(level) + "&count=" + count);
      var payload = await readQuestionsResponse(response);

      var questions = payload.questions || [];
      var now = Date.now();
      playerLocks = [false, false];
      state = {
        version: 1,
        mode: GAME_MODE,
        status: "playing",
        level: level,
        duration: duration,
        questions: questions,
        deadline: now + duration * 1000,
        players: [leftName, rightName].map(function (name) {
          return { name: name.slice(0, 30), order: shuffledIndexes(questions.length), index: 0, correct: 0, answered: 0, totalResponseMs: 0, questionStartedAt: now, hunter: null, match: null };
        })
      };
      saveState();
      showOnly("arenaScreen");
      renderArena();
      startTimer();
    } catch (error) {
      errorBox.textContent = error.message || t(gameKey("fetchFailed"));
    } finally {
      startButton.disabled = false;
      startButton.textContent = t(gameKey("start"));
    }
  }

  function renderMatchLane(body, playerIndex) {
    var player = state.players[playerIndex];
    prepareMatch(player);
    var progress = document.createElement("div");
    progress.className = "question-count";
    progress.textContent = t("matchmaster.pairProgress", { current: player.index, total: player.order.length });
    var instruction = document.createElement("div");
    instruction.className = "match-instruction";
    instruction.textContent = t("matchmaster.instruction");
    var board = document.createElement("div");
    board.className = "match-board";
    var questions = document.createElement("div");
    questions.className = "match-column";
    var answers = document.createElement("div");
    answers.className = "match-column";

    player.match.batch.forEach(function (questionIndex) {
      if (player.match.matchedQuestions.includes(questionIndex)) return;
      var card = document.createElement("button");
      card.type = "button";
      card.className = "match-card match-question";
      if (player.match.selectedQuestion === questionIndex) card.classList.add("selected");
      card.textContent = state.questions[questionIndex].question_text;
      card.addEventListener("pointerdown", function (event) { handleMatchQuestion(event, playerIndex, questionIndex); });
      questions.appendChild(card);
    });
    player.match.answerOrder.forEach(function (questionIndex) {
      if (player.match.matchedAnswers.includes(questionIndex)) return;
      var card = document.createElement("button");
      card.type = "button";
      card.className = "match-card match-answer";
      card.textContent = correctAnswer(state.questions[questionIndex]);
      card.addEventListener("pointerdown", function (event) { handleMatchAnswer(event, playerIndex, questionIndex); });
      answers.appendChild(card);
    });
    board.append(questions, answers);
    var feedback = document.createElement("div");
    feedback.className = "match-feedback " + (player.match.feedback || "");
    feedback.textContent = player.match.feedback ? t("matchmaster." + player.match.feedback) : "";
    body.append(progress, instruction, board, feedback);
  }

  function handleMatchQuestion(event, playerIndex, questionIndex) {
    event.preventDefault();
    if (!state || state.status !== "playing" || playerLocks[playerIndex]) return;
    var player = state.players[playerIndex];
    prepareMatch(player);
    player.match.selectedQuestion = questionIndex;
    player.match.feedback = "";
    saveState();
    renderLane(playerIndex);
  }

  function handleMatchAnswer(event, playerIndex, answerQuestionIndex) {
    event.preventDefault();
    if (!state || state.status !== "playing" || playerLocks[playerIndex]) return;
    var player = state.players[playerIndex];
    prepareMatch(player);
    if (player.match.selectedQuestion === null) {
      player.match.feedback = "selectSentence";
      renderLane(playerIndex);
      return;
    }
    playerLocks[playerIndex] = true;
    var selectedIndex = player.match.selectedQuestion;
    var isCorrect = normalizedAnswer(correctAnswer(state.questions[selectedIndex])) === normalizedAnswer(correctAnswer(state.questions[answerQuestionIndex]));
    player.answered += 1;
    player.totalResponseMs += Math.max(0, Date.now() - player.questionStartedAt);
    if (isCorrect) {
      player.correct += 1;
      player.index += 1;
      player.match.matchedQuestions.push(selectedIndex);
      player.match.matchedAnswers.push(answerQuestionIndex);
      player.match.feedback = "matched";
    } else {
      player.match.feedback = "notMatched";
    }
    saveState();
    renderLane(playerIndex);
    window.setTimeout(function () {
      if (!state || state.status !== "playing") return;
      var batchComplete = player.match && player.match.matchedQuestions.length >= player.match.batch.length;
      if (batchComplete) player.match = null;
      else if (player.match) {
        player.match.selectedQuestion = null;
        player.match.feedback = "";
      }
      player.questionStartedAt = Date.now();
      playerLocks[playerIndex] = false;
      saveState();
      renderLane(playerIndex);
      if (state.players.every(function (item) { return item.index >= item.order.length; })) finishGame();
    }, 320);
  }

  function renderLane(playerIndex) {
    var lane = document.querySelector('.lane[data-player="' + playerIndex + '"]');
    var player = state.players[playerIndex];
    var total = player.order.length;
    lane.querySelector(".player-name").textContent = player.name || t("smartboard.playerFallback");
    lane.querySelector(".score strong").textContent = player.correct;
    lane.querySelector(".progress-fill").style.width = (total ? Math.min(100, player.index / total * 100) : 0) + "%";
    var body = lane.querySelector(".lane-body");
    body.replaceChildren();

    if (player.index >= total) {
      var complete = document.createElement("div");
      complete.className = "lane-complete";
      complete.textContent = t("smartboard.finishedPlayer");
      body.appendChild(complete);
      return;
    }

    if (GAME_MODE === "match") {
      renderMatchLane(body, playerIndex);
      return;
    }

    var question = state.questions[player.order[player.index]];
    var count = document.createElement("div");
    count.className = "question-count";
    count.textContent = t("smartboard.questionProgress", { current: player.index + 1, total: total });
    if (GAME_MODE === "error") prepareHunter(player, question);
    var questionText = document.createElement("div");
    questionText.className = GAME_MODE === "error" ? "question hunter-question" : "question";
    if (GAME_MODE === "error") {
      var instruction = document.createElement("div");
      instruction.className = "hunter-instruction";
      instruction.textContent = t(player.hunter.step === "find" ? "errorhunter.findError" : "errorhunter.chooseCorrection");
      questionText.appendChild(instruction);
      var sentence = document.createElement("div");
      sentence.className = "hunter-sentence";
      player.hunter.tokens.forEach(function (token, tokenIndex) {
        var tokenButton = document.createElement("button");
        tokenButton.type = "button";
        tokenButton.className = "hunter-token";
        tokenButton.textContent = token;
        tokenButton.disabled = player.hunter.step !== "find";
        if (player.hunter.selectedErrorIndex === tokenIndex) {
          tokenButton.classList.add(player.hunter.errorFoundCorrect ? "found" : "missed");
        }
        if (player.hunter.step === "correct" && player.hunter.errorIndexes.includes(tokenIndex)) tokenButton.classList.add("actual-error");
        tokenButton.addEventListener("pointerdown", function (event) { handleErrorWord(event, playerIndex, tokenIndex); });
        sentence.appendChild(tokenButton);
      });
      questionText.appendChild(sentence);
    } else {
      questionText.textContent = question.question_text;
    }
    var answers = document.createElement("div");
    answers.className = "answers";
    if (GAME_MODE === "error" && player.hunter.step === "find") answers.hidden = true;
    ["A", "B", "C", "D"].forEach(function (letter) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "answer";
      button.dataset.option = letter;
      var badge = document.createElement("span");
      badge.className = "answer-letter";
      badge.textContent = letter;
      var text = document.createElement("span");
      text.textContent = optionText(question, letter);
      button.append(badge, text);
      button.addEventListener("pointerdown", function (event) { handleAnswer(event, playerIndex, letter, button); });
      answers.appendChild(button);
    });
    body.append(count, questionText, answers);
  }

  function renderArena() {
    if (!state || state.status !== "playing") return;
    renderLane(0);
    renderLane(1);
    updateTimer();
  }

  function handleErrorWord(event, playerIndex, tokenIndex) {
    event.preventDefault();
    if (!state || state.status !== "playing" || playerLocks[playerIndex]) return;
    var player = state.players[playerIndex];
    var question = state.questions[player.order[player.index]];
    prepareHunter(player, question);
    if (player.hunter.step !== "find") return;
    player.hunter.selectedErrorIndex = tokenIndex;
    player.hunter.errorFoundCorrect = player.hunter.errorIndexes.includes(tokenIndex);
    player.hunter.step = "correct";
    saveState();
    renderLane(playerIndex);
  }

  function handleAnswer(event, playerIndex, selectedOption, selectedButton) {
    event.preventDefault();
    if (!state || state.status !== "playing" || playerLocks[playerIndex]) return;
    var player = state.players[playerIndex];
    if (player.index >= player.order.length) return;
    if (GAME_MODE === "error" && (!player.hunter || player.hunter.step !== "correct")) return;
    playerLocks[playerIndex] = true;
    var question = state.questions[player.order[player.index]];
    var correctionIsCorrect = selectedOption === String(question.correct_option).toUpperCase();
    var isCorrect = GAME_MODE === "error"
      ? Boolean(player.hunter && player.hunter.errorFoundCorrect && correctionIsCorrect)
      : correctionIsCorrect;
    player.answered += 1;
    if (isCorrect) player.correct += 1;
    player.totalResponseMs += Math.max(0, Date.now() - player.questionStartedAt);
    player.index += 1;
    saveState();
    selectedButton.classList.add(correctionIsCorrect ? "correct" : "wrong");

    window.setTimeout(function () {
      playerLocks[playerIndex] = false;
      if (!state || state.status !== "playing") return;
      player.hunter = null;
      player.questionStartedAt = Date.now();
      saveState();
      renderLane(playerIndex);
      if (state.players.every(function (item) { return item.index >= item.order.length; })) finishGame();
    }, 360);
  }

  function updateTimer() {
    if (!state || state.status !== "playing") return;
    var remaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    var minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
    var seconds = String(remaining % 60).padStart(2, "0");
    var timer = document.getElementById("timer");
    timer.textContent = minutes + ":" + seconds;
    timer.classList.toggle("danger", remaining <= 10);
    if (remaining <= 0) finishGame();
  }

  function startTimer() {
    if (timerId) window.clearInterval(timerId);
    updateTimer();
    timerId = window.setInterval(updateTimer, 250);
  }

  function finishGame() {
    if (!state || state.status !== "playing") return;
    state.status = "results";
    state.finishedAt = Date.now();
    saveState();
    if (timerId) window.clearInterval(timerId);
    timerId = null;
    showOnly("resultScreen");
    renderResults();
  }

  function playerAverageTime(player) {
    return player.answered ? player.totalResponseMs / player.answered : Number.POSITIVE_INFINITY;
  }

  function winnerPlayer() {
    var left = state.players[0];
    var right = state.players[1];
    if (left.correct !== right.correct) return left.correct > right.correct ? left : right;
    var leftAverage = playerAverageTime(left);
    var rightAverage = playerAverageTime(right);
    if (leftAverage === rightAverage) return null;
    return leftAverage < rightAverage ? left : right;
  }

  function renderResults() {
    if (!state) return;
    var winner = winnerPlayer();
    document.getElementById("winnerText").textContent = winner ? t("smartboard.winner", { name: winner.name }) : t("smartboard.draw");
    var grid = document.getElementById("resultGrid");
    grid.replaceChildren();
    state.players.forEach(function (player) {
      var total = player.order.length;
      var card = document.createElement("article");
      card.className = "result-player";
      var title = document.createElement("h3"); title.textContent = player.name;
      var metrics = document.createElement("div"); metrics.className = "metrics";
      var correctMetric = document.createElement("div"); correctMetric.className = "metric";
      var correctValue = document.createElement("strong"); correctValue.textContent = player.correct + "/" + total;
      correctMetric.append(correctValue, document.createTextNode(t("smartboard.correct")));
      var accuracyMetric = document.createElement("div"); accuracyMetric.className = "metric";
      var accuracyValue = document.createElement("strong"); accuracyValue.textContent = (player.answered ? Math.round(player.correct / player.answered * 100) : 0) + "%";
      accuracyMetric.append(accuracyValue, document.createTextNode(t("smartboard.accuracy")));
      metrics.append(correctMetric, accuracyMetric); card.append(title, metrics); grid.appendChild(card);
    });
  }

  function handleTouchPad(event) {
    event.preventDefault();
    var pad = event.currentTarget;
    var side = pad.dataset.side;
    touchTimes[side] = Date.now();
    pad.classList.add("pressed");
    window.setTimeout(function () { pad.classList.remove("pressed"); }, 400);
    if (Math.abs(touchTimes.left - touchTimes.right) <= 650) {
      var status = document.getElementById("touchStatus");
      status.textContent = t("smartboard.touchReady");
      status.classList.add("ready");
    }
  }

  function goToPractice() {
    if (state && state.status === "results") clearState();
    window.location.href = "/practice.html";
  }

  function initialize() {
    if (!localStorage.getItem("token")) {
      window.location.href = "/index.html";
      return;
    }
    applyModeCopy();
    document.querySelectorAll(".choice-row").forEach(function (row) {
      row.addEventListener("click", function (event) {
        var button = event.target.closest(".choice");
        if (button) selectChoice(row.id, button);
      });
    });
    document.querySelectorAll(".touch-pad").forEach(function (pad) { pad.addEventListener("pointerdown", handleTouchPad); });
    document.getElementById("startBtn").addEventListener("click", startGame);
    document.getElementById("fullscreenBtn").addEventListener("click", function () {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
      else if (document.exitFullscreen) document.exitFullscreen().catch(function () {});
    });
    document.getElementById("backBtn").addEventListener("click", goToPractice);
    document.getElementById("resultBackBtn").addEventListener("click", goToPractice);
    document.getElementById("newGameBtn").addEventListener("click", function () { clearState(); showOnly("setupScreen"); });

    state = restoreState();
    if (state && state.status === "playing") {
      showOnly("arenaScreen"); renderArena(); startTimer();
    } else if (state && state.status === "results") {
      showOnly("resultScreen"); renderResults();
    }
  }

  window.addEventListener("ilmliga:languagechange", function () {
    applyModeCopy();
    if (state && state.status === "playing") renderArena();
    if (state && state.status === "results") renderResults();
  });
  initialize();
})();
