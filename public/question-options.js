(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IlmLigaQuestionOptions = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const DEFAULT_KEYS = ["A", "B", "C", "D"];

  function hashSeed(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let state = seed || 0x6d2b79f5;
    return function random() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function availableKeys(question) {
    if (Array.isArray(question && question.options)) {
      return question.options
        .map(function (option) { return String(option && option.key || "").toUpperCase(); })
        .filter(function (key, index, keys) {
          return DEFAULT_KEYS.includes(key) && keys.indexOf(key) === index;
        });
    }
    return DEFAULT_KEYS.filter(function (key) {
      const value = question && question["option_" + key.toLowerCase()];
      return value !== null && value !== undefined && value !== "";
    });
  }

  function questionIdentity(question) {
    return question && (
      question.id
      || question.assignment_question_id
      || question.q_order
      || question.question_text
    ) || "question";
  }

  function orderKeys(question, attemptKey) {
    const keys = availableKeys(question);
    if (keys.length < 2) return keys;

    const seed = hashSeed(String(attemptKey || "attempt") + ":" + questionIdentity(question));
    const random = seededRandom(seed);
    const ordered = keys.slice();
    for (let index = ordered.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(random() * (index + 1));
      const current = ordered[index];
      ordered[index] = ordered[swapIndex];
      ordered[swapIndex] = current;
    }

    if (ordered.every(function (key, index) { return key === keys[index]; })) {
      ordered.push(ordered.shift());
    }
    return ordered;
  }

  return { orderKeys: orderKeys };
});
