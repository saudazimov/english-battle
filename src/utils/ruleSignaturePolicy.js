const QUARANTINED_RULE_SIGNATURES = new Set([
  "stable.lowercase.rule.signature",
  "grammar.present_simple.third_person_s_affirmative",
]);
const RULE_SIGNATURE_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const RULE_SIGNATURE_DOMAINS = new Set([
  "grammar", "vocabulary", "reading", "listening", "writing", "speaking", "pronunciation",
]);

function isQuarantinedRuleSignature(value) {
  return QUARANTINED_RULE_SIGNATURES.has(String(value || "").trim());
}

function isAllowedRuleSignature(value) {
  const signature = String(value || "").trim();
  return signature.length <= 160
    && RULE_SIGNATURE_PATTERN.test(signature)
    && RULE_SIGNATURE_DOMAINS.has(signature.split(/[._-]/)[0])
    && !isQuarantinedRuleSignature(signature);
}

function quarantinedRuleSignatures() {
  return [...QUARANTINED_RULE_SIGNATURES];
}

module.exports = {
  isAllowedRuleSignature,
  isQuarantinedRuleSignature,
  quarantinedRuleSignatures,
};
