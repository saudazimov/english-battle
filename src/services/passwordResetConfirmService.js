const { createOtpVerifyService } = require("./otpVerifyService");

function createPasswordResetConfirmService({ pool, bcrypt, noteFail, noteOk, phoneIpKey }) {
  const otpService = createOtpVerifyService({ pool, bcrypt, noteFail, noteOk, phoneIpKey });

  async function confirmReset({ req, phone, code, newPassword }) {
    const otpOutcome = await otpService.verifyOtp({ req, phone, code });
    if (otpOutcome.status !== "verified") return otpOutcome;

    const userResult = await pool.query("SELECT id FROM users WHERE phone = $1", [phone]);
    if (userResult.rows.length === 0) return { status: "user-not-found" };

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password = $1, auth_version = auth_version + 1 WHERE phone = $2",
      [hashedPassword, phone]
    );
    await pool.query("DELETE FROM otp_codes WHERE phone = $1", [phone]);
    return { status: "reset" };
  }

  return { confirmReset };
}

module.exports = { createPasswordResetConfirmService };
