(function exposeRatingUi(root) {
  "use strict";

  function normalize(value, fallback) {
    const hasValue = value !== null && value !== undefined && value !== "";
    const rating = Number(value);
    if (hasValue && Number.isFinite(rating)) {
      return Math.max(0, Math.round(rating));
    }

    const hasFallback = fallback !== null && fallback !== undefined && fallback !== "";
    const fallbackRating = Number(fallback);
    if (hasFallback && Number.isFinite(fallbackRating)) {
      return Math.max(0, Math.round(fallbackRating));
    }

    return 500;
  }

  root.IlmLigaRating = Object.freeze({ normalize });
})(window);
