function createOtpVerifyService({ pool, bcrypt, noteFail, noteOk, phoneIpKey }) {
  async function verifyOtp({ req, phone, code }) {
    const otpResult = await pool.query(
      "SELECT * FROM otp_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1",
      [phone]
    );
    if (otpResult.rows.length === 0) return { status: "not-requested" };

    const otpRecord = otpResult.rows[0];
    if (new Date() > new Date(otpRecord.expires_at)) return { status: "expired" };

    const codeValid = await bcrypt.compare(String(code), otpRecord.code);
    if (!codeValid) {
      noteFail("otp_verify", phoneIpKey(req), 5, 15 * 60 * 1000);
      return { status: "invalid" };
    }

    noteOk("otp_verify", phoneIpKey(req));
    return { status: "verified" };
  }

  return { verifyOtp };
}

module.exports = { createOtpVerifyService };
