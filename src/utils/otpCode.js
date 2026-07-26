const crypto = require("crypto");

function createOtpCodeGenerator({ randomInt }) {
  return function generateOtpCode() {
    return String(randomInt(100000, 1000000));
  };
}

const generateOtpCode = createOtpCodeGenerator({ randomInt: crypto.randomInt });

module.exports = { createOtpCodeGenerator, generateOtpCode };
