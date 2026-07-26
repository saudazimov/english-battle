// ===== ISHONCHLI CLIENT IP HELPER =====
// Barcha rate-limit / audit joylar shu funksiyani ishlatadi (izchillik).
// trust proxy sozlangan bo'lsa req.ip = real client (Express X-Forwarded-For'ni
// TRUST_PROXY_HOPS asosida xavfsiz parslaydi). Sozlanmagan bo'lsa req.ip = socket.
// Fallback'lar faqat req.ip mavjud bo'lmagan chekka holatlar uchun.
function clientIp(req) {
  return (req && (req.ip || (req.socket && req.socket.remoteAddress))) || "unknown";
}

module.exports = { clientIp };
