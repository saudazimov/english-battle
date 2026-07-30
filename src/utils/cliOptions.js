"use strict";

function parseCliOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) throw new Error(`Noma'lum argument: ${argument}`);
    const equalIndex = argument.indexOf("=");
    if (equalIndex > 2) {
      options[argument.slice(2, equalIndex)] = argument.slice(equalIndex + 1);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} qiymati majburiy`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

function requiredCliOption(options, key) {
  if (options[key]) return options[key];
  throw new Error(`--${key} argumenti majburiy`);
}

function assertOnlyCliOptions(options, allowedKeys) {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(options).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`Noma'lum argument: --${unknown}`);
}

module.exports = { assertOnlyCliOptions, parseCliOptions, requiredCliOption };
