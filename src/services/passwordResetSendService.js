function createPasswordResetSendService({
  pool,
  bcrypt,
  generateOtpCode,
  sendSms,
  logger = console,
}) {
  async function sendResetOtp(phone) {
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE phone = $1",
      [phone]
    );
    if (existingUser.rows.length === 0) return { status: "user-not-found" };

    const code = generateOtpCode();
    const hashedCode = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query("DELETE FROM otp_codes WHERE phone = $1", [phone]);
    await pool.query(
      "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)",
      [phone, hashedCode, expiresAt]
    );

    try {
      await sendSms(phone, code);
    } catch (smsError) {
      logger.error("SMS yuborish xatosi:", smsError.message);
      return { status: "sms-failed" };
    }

    return { status: "sent" };
  }

  return { sendResetOtp };
}

module.exports = { createPasswordResetSendService };
