const ESKIZ_BASE_URL = "https://notify.eskiz.uz/api";

function createSmsService({
  environment = process.env,
  fetchFn = (...args) => fetch(...args),
  logger = console,
} = {}) {
  let eskizToken = null;

  async function eskizLogin() {
    const response = await fetchFn(`${ESKIZ_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: environment.ESKIZ_EMAIL,
        password: environment.ESKIZ_PASSWORD,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !(data.data && data.data.token)) {
      throw new Error(`Eskiz login xatosi: ${data.message || response.status}`);
    }
    eskizToken = data.data.token;
    return eskizToken;
  }

  async function eskizSend(token, to, message) {
    return fetchFn(`${ESKIZ_BASE_URL}/message/sms/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        mobile_phone: to,
        message,
        from: environment.ESKIZ_FROM || "4546",
      }),
    });
  }

  return async function sendSms(phone, code) {
    const to = String(phone).replace(/\D/g, "");
    const message = `IlmLiga: tasdiqlash kodingiz ${code}. Kodni hech kimga bermang.`;

    const explicitlyDisabled = String(environment.SMS_ENABLED || "").toLowerCase() === "false";
    const productionWithoutCredentials = environment.NODE_ENV === "production"
      && (!environment.ESKIZ_EMAIL || !environment.ESKIZ_PASSWORD);
    if (explicitlyDisabled || productionWithoutCredentials) {
      const error = new Error("SMS xizmati vaqtincha o'chirilgan");
      error.code = "SMS_DISABLED";
      throw error;
    }

    if (!environment.ESKIZ_EMAIL || !environment.ESKIZ_PASSWORD) {
      logger.log("========================================");
      logger.log("📱 SMS (DEV rejim — Eskiz kredensiali yo'q)");
      logger.log(`   Telefon: +${to}`);
      logger.log(`   Kod: ${code}`);
      logger.log("========================================");
      return;
    }

    if (!eskizToken) await eskizLogin();
    let response = await eskizSend(eskizToken, to, message);

    if (response.status === 401) {
      await eskizLogin();
      response = await eskizSend(eskizToken, to, message);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status === "error") {
      logger.error("Eskiz SMS xatosi:", data.message || response.status);
      throw new Error("SMS yuborib bo'lmadi");
    }
    logger.log("SMS yuborildi:", to, "(Eskiz:", data.id || data.status || "ok", ")");
  };
}

module.exports = { createSmsService };
