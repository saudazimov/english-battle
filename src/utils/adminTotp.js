const crypto = require("crypto");
const { decodeBase32 } = require("./base32");

function createAdminTotpValidator({
  environment = process.env,
  cryptoModule = crypto,
  decodeSecret = decodeBase32,
  now = () => Date.now(),
} = {}) {
  return function adminTotpValid(code) {
    const secret = environment.ADMIN_TOTP_SECRET;
    if (!secret) return environment.NODE_ENV !== "production";
    if (!/^\d{6}$/.test(String(code || ""))) return false;
    const key = decodeSecret(secret);
    if (!key.length) return false;
    const currentStep = Math.floor(now() / 30000);
    for (let drift = -1; drift <= 1; drift++) {
      const counter = Buffer.alloc(8);
      counter.writeBigUInt64BE(BigInt(currentStep + drift));
      const digest = cryptoModule.createHmac("sha1", key).update(counter).digest();
      const offset = digest[digest.length - 1] & 15;
      const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
      const expected = String(number).padStart(6, "0");
      if (cryptoModule.timingSafeEqual(Buffer.from(expected), Buffer.from(String(code)))) return true;
    }
    return false;
  };
}

const adminTotpValid = createAdminTotpValidator();

module.exports = { createAdminTotpValidator, adminTotpValid };
