(function () {
  "use strict";

  var GAME_MODE = new URLSearchParams(window.location.search).get("mode") === "sentence" ? "sentence" : "word";
  var STORAGE_KEY = GAME_MODE === "sentence" ? "ilmliga_sentence_builder_duel_v1" : "ilmliga_word_builder_duel_v1";
  var state = null;
  var timerId = null;
  var playerLocks = [false, false];
  var touchTimes = { left: 0, right: 0 };

  function t(key, params) {
    return window.IlmLigaI18n ? window.IlmLigaI18n.t(key, params) : key;
  }

  function gameKey(name) {
    return (GAME_MODE === "sentence" ? "sentencebuilder." : "wordbuilder.") + name;
  }

  function applyModeCopy() {
    document.title = t(gameKey("metaTitle"));
    document.querySelector(".brand-mark").textContent = GAME_MODE === "sentence" ? "SB" : "WB";
    document.querySelector(".brand h1").textContent = t(gameKey("title"));
    document.querySelector(".brand p").textContent = t(gameKey("subtitle"));
    document.getElementById("temporaryNotice").textContent = t(gameKey("notice"));
    document.getElementById("startBtn").textContent = t(gameKey("start"));
    document.querySelector("#resultScreen h2").textContent = t(gameKey("resultTitle"));
    document.body.classList.toggle("sentence-mode", GAME_MODE === "sentence");
  }

  function saveState() {
    if (state) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
      if (!saved || saved.version !== 1 || !Array.isArray(saved.words) || !Array.isArray(saved.players)) return null;
      if ((saved.mode || "word") !== GAME_MODE) return null;
      if (saved.status !== "playing" && saved.status !== "results") return null;
      saved.players.forEach(function (player) {
        player.feedback = "";
        if (!Array.isArray(player.selected) || player.selected.length >= (player.letters || []).length) player.selected = [];
      });
      return saved;
    } catch (_) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function shuffled(values) {
    var result = values.slice();
    for (var index = result.length - 1; index > 0; index -= 1) {
      var swapIndex = Math.floor(Math.random() * (index + 1));
      var temporary = result[index]; result[index] = result[swapIndex]; result[swapIndex] = temporary;
    }
    if (result.length > 1 && result.join("") === values.join("")) result.push(result.shift());
    return result;
  }

  function shuffledIndexes(length) {
    return shuffled(Array.from({ length: length }, function (_, index) { return index; }));
  }

  function showOnly(screenId) {
    ["setupScreen", "arenaScreen", "resultScreen"].forEach(function (id) {
      document.getElementById(id).hidden = id !== screenId;
    });
    document.getElementById("temporaryNotice").hidden = screenId !== "setupScreen";
  }

  function selectedValue(containerId) {
    var active = document.querySelector("#" + containerId + " .choice.active");
    return active ? active.dataset.value : "";
  }

  async function readWordsResponse(response) {
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

  function currentWord(player) {
    return state.words[player.order[player.index]];
  }

  function sentenceTokens(word) {
    var answer = String(word.answer || "").trim();
    var sentence = String(word.question_text || "").trim().replace(/_{2,}/, answer);
    return sentence.split(/\s+/).filter(Boolean);
  }

  function answerTokens(word) {
    return GAME_MODE === "sentence"
      ? sentenceTokens(word)
      : String(word.answer).toUpperCase().split("");
  }

  function preparePlayer(player) {
    var word = currentWord(player);
    if (!word) return;
    player.currentId = word.id;
    player.answerTokens = answerTokens(word);
    player.letters = shuffled(player.answerTokens);
    player.selected = [];
    player.feedback = "";
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
      var response = await authFetch("/smartboard/word-builder/words?level=" + encodeURIComponent(level) + "&count=" + count);
      var payload = await readWordsResponse(response);
      var now = Date.now();
      state = {
        version: 1, mode: GAME_MODE, status: "playing", level: level, duration: duration,
        words: payload.words || [], deadline: now + duration * 1000,
        players: [leftName, rightName].map(function (name) {
          return { name: name.slice(0, 30), order: shuffledIndexes(payload.words.length), index: 0, score: 0, wrong: 0, letters: [], selected: [], feedback: "" };
        })
      };
      state.players.forEach(preparePlayer);
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

  function element(tag, className, textValue) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined) node.textContent = textValue;
    return node;
  }

  function renderBuiltWord(container, player, answerLength) {
    for (var index = 0; index < answerLength; index += 1) {
      var tokenIndex = player.selected[index];
      var value = tokenIndex === undefined ? "" : player.letters[tokenIndex];
      container.appendChild(element("span", value ? "built-letter" : "built-empty", value || "_"));
    }
  }

  function addLetter(playerIndex, tokenIndex) {
    var player = state.players[playerIndex];
    if (playerLocks[playerIndex] || player.selected.includes(tokenIndex)) return;
    player.selected.push(tokenIndex);
    saveState();
    renderLane(playerIndex);
    if (player.selected.length === player.answerTokens.length) evaluateWord(playerIndex);
  }

  function evaluateWord(playerIndex) {
    var player = state.players[playerIndex];
    var answer = player.answerTokens.join("\u0001");
    var built = player.selected.map(function (index) { return player.letters[index]; }).join("\u0001");
    playerLocks[playerIndex] = true;
    player.feedback = built === answer ? "ok" : "bad";
    if (built !== answer) player.wrong += 1;
    saveState();
    renderLane(playerIndex);
    window.setTimeout(function () {
      if (!state || state.status !== "playing") return;
      if (built === answer) player.score += 1;
      player.index += 1;
      if (player.index < player.order.length) preparePlayer(player);
      playerLocks[playerIndex] = false;
      saveState();
      renderLane(playerIndex);
      if (state.players.every(function (item) { return item.index >= item.order.length; })) finishGame();
    }, 420);
  }

  function editSelection(playerIndex, clearAll) {
    if (playerLocks[playerIndex]) return;
    var player = state.players[playerIndex];
    if (clearAll) player.selected = [];
    else player.selected.pop();
    player.feedback = "";
    saveState();
    renderLane(playerIndex);
  }

  function renderLane(playerIndex) {
    var lane = document.querySelector('.lane[data-player="' + playerIndex + '"]');
    var player = state.players[playerIndex];
    lane.querySelector(".player-name").textContent = player.name || t("smartboard.playerFallback");
    lane.querySelector(".score strong").textContent = player.score;
    lane.querySelector(".progress-fill").style.width = Math.min(100, player.index / player.order.length * 100) + "%";
    var body = lane.querySelector(".lane-body");
    body.replaceChildren();
    if (player.index >= player.order.length) {
      body.appendChild(element("div", "lane-complete", t(gameKey("finishedPlayer"))));
      return;
    }

    var word = currentWord(player);
    if (player.currentId !== word.id || !Array.isArray(player.letters) || !Array.isArray(player.answerTokens)) preparePlayer(player);
    body.appendChild(element("div", "round-count", t(gameKey("roundProgress"), { current: player.index + 1, total: player.order.length })));
    body.appendChild(element("div", "clue", GAME_MODE === "sentence" ? t("sentencebuilder.clue") : word.question_text));
    body.appendChild(element("div", "instruction", t(gameKey("instruction"))));
    var builtWord = element("div", "built-word" + (GAME_MODE === "sentence" ? " sentence-built" : ""));
    renderBuiltWord(builtWord, player, player.answerTokens.length);
    body.appendChild(builtWord);
    var letters = element("div", "letters");
    player.letters.forEach(function (letter, tokenIndex) {
      var button = element("button", "letter" + (GAME_MODE === "sentence" ? " sentence-token" : ""), letter);
      button.type = "button";
      button.disabled = player.selected.includes(tokenIndex);
      button.addEventListener("pointerdown", function (event) { event.preventDefault(); addLetter(playerIndex, tokenIndex); });
      letters.appendChild(button);
    });
    body.appendChild(letters);
    var actions = element("div", "word-actions");
    [[gameKey("undo"), false], [gameKey("clear"), true]].forEach(function (config) {
      var button = element("button", "word-action", t(config[0]));
      button.type = "button";
      button.disabled = player.selected.length === 0;
      button.addEventListener("pointerdown", function (event) { event.preventDefault(); editSelection(playerIndex, config[1]); });
      actions.appendChild(button);
    });
    body.appendChild(actions);
    body.appendChild(element("div", "feedback " + (player.feedback || ""), player.feedback ? t(gameKey(player.feedback === "ok" ? "correct" : "wrong")) : ""));
  }

  function renderArena() {
    renderLane(0);
    renderLane(1);
    updateTimer();
  }

  function updateTimer() {
    if (!state || state.status !== "playing") return;
    var seconds = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    var timer = document.getElementById("timer");
    timer.textContent = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
    timer.classList.toggle("danger", seconds <= 10);
    if (seconds <= 0) finishGame();
  }

  function startTimer() {
    if (timerId) window.clearInterval(timerId);
    timerId = window.setInterval(updateTimer, 250);
    updateTimer();
  }

  function finishGame() {
    if (!state || state.status === "results") return;
    state.status = "results";
    if (timerId) window.clearInterval(timerId);
    timerId = null;
    saveState();
    showOnly("resultScreen");
    renderResults();
  }

  function renderResults() {
    var first = state.players[0];
    var second = state.players[1];
    document.getElementById("winnerText").textContent = first.score === second.score
      ? t("smartboard.draw") : t("smartboard.winner", { name: first.score > second.score ? first.name : second.name });
    var grid = document.getElementById("resultGrid");
    grid.replaceChildren();
    state.players.forEach(function (player) {
      var accuracy = Math.round(player.score / Math.max(1, player.score + player.wrong) * 100);
      var card = element("article", "result-player");
      card.appendChild(element("h3", "", player.name));
      var metrics = element("div", "metrics");
      [[t("smartboard.correct"), player.score], [t("smartboard.accuracy"), accuracy + "%"]].forEach(function (metric) {
        var box = element("div", "metric", metric[0]);
        box.prepend(element("strong", "", metric[1]));
        metrics.appendChild(box);
      });
      card.appendChild(metrics);
      grid.appendChild(card);
    });
  }

  function initializeChoices() {
    document.querySelectorAll(".choices").forEach(function (container) {
      container.addEventListener("click", function (event) {
        var choice = event.target.closest(".choice");
        if (!choice) return;
        container.querySelectorAll(".choice").forEach(function (item) { item.classList.remove("active"); });
        choice.classList.add("active");
      });
    });
  }

  function initializeTouchTest() {
    document.querySelectorAll(".touch-pad").forEach(function (pad) {
      function press(event) {
        event.preventDefault();
        var side = pad.dataset.side;
        touchTimes[side] = Date.now();
        pad.classList.add("pressed");
        var other = side === "left" ? "right" : "left";
        if (Math.abs(touchTimes[side] - touchTimes[other]) < 700) {
          var status = document.getElementById("touchStatus");
          status.textContent = t("smartboard.touchReady");
          status.classList.add("ready");
        }
      }
      pad.addEventListener("pointerdown", press);
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (name) {
        pad.addEventListener(name, function () { pad.classList.remove("pressed"); });
      });
    });
  }

  function goBack() { window.location.href = "/practice.html"; }

  document.addEventListener("DOMContentLoaded", function () {
    applyModeCopy();
    initializeChoices();
    initializeTouchTest();
    document.getElementById("startBtn").addEventListener("click", startGame);
    document.getElementById("backBtn").addEventListener("click", goBack);
    document.getElementById("resultBackBtn").addEventListener("click", goBack);
    document.getElementById("newGameBtn").addEventListener("click", function () { clearState(); showOnly("setupScreen"); });
    document.getElementById("fullscreenBtn").addEventListener("click", function () {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () {});
      else document.exitFullscreen().catch(function () {});
    });
    state = restoreState();
    if (!state) return;
    showOnly(state.status === "results" ? "resultScreen" : "arenaScreen");
    if (state.status === "results") renderResults();
    else { renderArena(); startTimer(); }
  });

  window.addEventListener("ilmliga:languagechange", function () {
    applyModeCopy();
    if (!state) return;
    if (state.status === "results") renderResults();
    else renderArena();
  });
}());
