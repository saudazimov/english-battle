const NEAR_DUPLICATE_THRESHOLD = 0.85;
const CHOICE_KEYS = ["A","B","C","D"];

function normalizedLearningText(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
    .replace(/\d+/g,"#")
    .replace(/[^\p{L}#]+/gu," ")
    .trim().replace(/\s+/g," ");
}

function tokenSet(value) {
  return new Set(normalizedLearningText(value).split(" ").filter(Boolean));
}

function learningTextContainsPhrase(value,phrase) {
  const normalizedValue = normalizedLearningText(value);
  const normalizedPhrase = normalizedLearningText(phrase);
  return Boolean(normalizedPhrase)
    && ` ${normalizedValue} `.includes(` ${normalizedPhrase} `);
}

function tokenDiceSimilarity(first,second) {
  const left = tokenSet(first);
  const right = tokenSet(second);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

function learningTextDuplicateIndexes(values) {
  if (!Array.isArray(values)) return [];
  const normalized = values.map(normalizedLearningText);
  const duplicates = new Set();
  for (let current = 0; current < normalized.length; current += 1) {
    if (!normalized[current]) { duplicates.add(current); continue; }
    for (let previous = 0; previous < current; previous += 1) {
      const exact = normalized[current] === normalized[previous];
      const enoughWords = tokenSet(normalized[current]).size >= 5
        && tokenSet(normalized[previous]).size >= 5;
      if (exact || (enoughWords
          && tokenDiceSimilarity(normalized[current],normalized[previous]) >= NEAR_DUPLICATE_THRESHOLD)) {
        duplicates.add(current);
        break;
      }
    }
  }
  return [...duplicates];
}

function balancedOptionQuotas(total) {
  const base = Math.floor(total / CHOICE_KEYS.length);
  const remainder = total % CHOICE_KEYS.length;
  const quotas = [];
  function visit(position,extras,quota) {
    if (position === CHOICE_KEYS.length) {
      if (extras === remainder) quotas.push({ ...quota });
      return;
    }
    const key = CHOICE_KEYS[position];
    quota[key] = base;
    visit(position + 1,extras,quota);
    if (extras < remainder) {
      quota[key] = base + 1;
      visit(position + 1,extras + 1,quota);
    }
    delete quota[key];
  }
  visit(0,0,{});
  return quotas;
}

function selectBalancedCorrectOptions(candidates,desiredCount = candidates?.length,fixed = []) {
  if (!Array.isArray(candidates) || !Array.isArray(fixed)) return [];
  const desired = Number(desiredCount);
  if (!Number.isInteger(desired) || desired < 0 || candidates.length < desired) return [];
  const total = fixed.length + desired;
  const all = [...fixed,...candidates];
  if (all.some((item) => !CHOICE_KEYS.includes(String(item?.correct_option || "").toUpperCase()))) return [];
  if (total < CHOICE_KEYS.length) return candidates.slice(0,desired);

  const fixedCounts = Object.fromEntries(CHOICE_KEYS.map((key) => [key,0]));
  const availableCounts = Object.fromEntries(CHOICE_KEYS.map((key) => [key,0]));
  fixed.forEach((item) => { fixedCounts[String(item.correct_option).toUpperCase()] += 1; });
  candidates.forEach((item) => { availableCounts[String(item.correct_option).toUpperCase()] += 1; });
  const quota = balancedOptionQuotas(total).find((item) => CHOICE_KEYS.every((key) => (
    item[key] >= fixedCounts[key]
      && item[key] - fixedCounts[key] <= availableCounts[key]
  )));
  if (!quota) return [];

  const remaining = Object.fromEntries(CHOICE_KEYS.map((key) => [key,quota[key] - fixedCounts[key]]));
  const selected = [];
  for (const candidate of candidates) {
    const key = String(candidate.correct_option).toUpperCase();
    if (remaining[key] <= 0) continue;
    selected.push(candidate);
    remaining[key] -= 1;
    if (selected.length === desired) break;
  }
  return selected.length === desired ? selected : [];
}

module.exports = {
  NEAR_DUPLICATE_THRESHOLD,
  normalizedLearningText,
  learningTextContainsPhrase,
  tokenDiceSimilarity,
  learningTextDuplicateIndexes,
  selectBalancedCorrectOptions,
};
