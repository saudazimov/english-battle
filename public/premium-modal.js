// ===== TEACHER PRO LIMIT MODALI =====
// Limit yetganda (402 teacher_pro_required) chiroyli modal ko'rsatadi.
// Ishlatish: window.showProLimitModal(errorData)  — errorData backenddan kelgan 402 javob
// Talab: payment-modal.js (window.openPaymentModal) — "Pro olish" tugmasi uchun.

(function () {
  if (window.__proLimitModalLoaded) return;
  window.__proLimitModalLoaded = true;

  var css =
    // Modal o'z tema o'zgaruvchilarini aniqlaydi — sahifaga bog'liq emas, har joyda to'g'ri ishlaydi
    ':root{--plm-card:#ffffff;--plm-soft:#f6f8fc;--plm-hover:#eef2f9;--plm-border:#e8edf5;--plm-text:#1a2233;--plm-sub:#5d6b85;--plm-accent:#7c5cfc;--plm-primary:#2f6bff;--plm-accent-soft:#efe9ff;--plm-primary-soft:#e8efff;--plm-green:#16b06a;}' +
    '[data-theme="dark"]{--plm-card:#111a2e;--plm-soft:#0e1626;--plm-hover:#16203a;--plm-border:#1d2940;--plm-text:#f1f5fc;--plm-sub:#9aa8c4;--plm-accent:#8b5cf6;--plm-primary:#3b82f6;--plm-accent-soft:rgba(139,92,246,.16);--plm-primary-soft:rgba(59,130,246,.14);--plm-green:#22c55e;}' +
    '.plm-overlay{display:none;position:fixed;inset:0;z-index:6500;background:rgba(10,15,30,0.7);backdrop-filter:blur(5px);padding:24px;}' +
    '.plm-overlay.open{display:flex;align-items:center;justify-content:center;}' +
    '.plm-modal{width:100%;max-width:420px;background:var(--plm-card);border:1px solid var(--plm-border);border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,0.25);overflow:hidden;animation:plmPop .22s ease;}' +
    '@keyframes plmPop{from{opacity:0;transform:scale(.95) translateY(8px);}to{opacity:1;transform:scale(1) translateY(0);}}' +
    '.plm-top{padding:30px 26px 22px;text-align:center;background:linear-gradient(160deg,var(--plm-accent-soft),var(--plm-primary-soft));}' +
    '.plm-ic{width:62px;height:62px;margin:0 auto 16px;border-radius:16px;background:linear-gradient(135deg,var(--plm-accent),var(--plm-primary));display:grid;place-items:center;box-shadow:0 10px 28px rgba(124,92,252,.35);}' +
    '.plm-ic svg{width:30px;height:30px;color:#fff;}' +
    '.plm-title{font-size:20px;font-weight:800;color:var(--plm-text);margin-bottom:8px;}' +
    '.plm-msg{font-size:14px;color:var(--plm-sub);line-height:1.55;padding:0 6px;}' +
    '.plm-body{padding:22px 26px 26px;}' +
    '.plm-perks{list-style:none;margin:0 0 22px;padding:0;display:flex;flex-direction:column;gap:11px;}' +
    '.plm-perks li{display:flex;align-items:center;gap:10px;font-size:13.5px;color:var(--plm-text);}' +
    '.plm-perks li svg{width:18px;height:18px;color:var(--plm-green);flex:0 0 auto;}' +
    '.plm-btns{display:flex;flex-direction:column;gap:10px;}' +
    '.plm-btn-pro{padding:14px;border:none;border-radius:13px;cursor:pointer;background:linear-gradient(135deg,var(--plm-accent),var(--plm-primary));color:#fff;font-size:15px;font-weight:700;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:9px;transition:transform .12s,box-shadow .2s;}' +
    '.plm-btn-pro:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(124,92,252,.35);}' +
    '.plm-btn-pro svg{width:18px;height:18px;}' +
    '.plm-btn-later{padding:12px;border:1px solid var(--plm-border);border-radius:13px;cursor:pointer;background:transparent;color:var(--plm-sub);font-size:14px;font-weight:600;font-family:inherit;}' +
    '.plm-btn-later:hover{background:var(--plm-soft);}';

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var overlay = document.createElement("div");
  overlay.className = "plm-overlay";
  overlay.id = "plmOverlay";
  document.body.appendChild(overlay);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeProLimit(); });

  // Feature bo'yicha imkoniyat ro'yxati
  var PERKS = {
    more_classes: ["Cheksiz sinflar", "Cheksiz o'quvchilar", "Cheksiz topshiriqlar", "AI sinf tahlili"],
    more_students: ["Cheksiz o'quvchilar", "Cheksiz sinflar", "Kengaytirilgan tahlil", "AI hisobotlar"],
    more_assignments: ["Cheksiz topshiriqlar", "Cheksiz sinflar", "Topshiriq tahlili", "PDF eksport"],
    "default": ["Cheksiz sinflar", "Cheksiz o'quvchilar", "Cheksiz topshiriqlar", "AI hisobotlar"],
  };

  function checkSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  }

  window.showProLimitModal = function (errorData) {
    errorData = errorData || {};
    var feature = errorData.feature || "default";
    var msg = errorData.message || "Bu funksiya Teacher Pro uchun. Cheksiz imkoniyatlar uchun Pro ga o'ting.";
    var perks = PERKS[feature] || PERKS["default"];

    var perksHtml = perks.map(function (p) {
      return '<li>' + checkSvg() + p + '</li>';
    }).join("");

    overlay.innerHTML =
      '<div class="plm-modal">' +
        '<div class="plm-top">' +
          '<div class="plm-ic"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg></div>' +
          '<div class="plm-title">Teacher Pro kerak</div>' +
          '<div class="plm-msg">' + esc(msg) + '</div>' +
        '</div>' +
        '<div class="plm-body">' +
          '<ul class="plm-perks">' + perksHtml + '</ul>' +
          '<div class="plm-btns">' +
            '<button class="plm-btn-pro" onclick="window.__plmUpgrade()"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg>Teacher Pro olish</button>' +
            '<button class="plm-btn-later" onclick="window.closeProLimit()">Keyinroq</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  };

  window.closeProLimit = function () {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  };

  window.__plmUpgrade = function () {
    closeProLimit();
    if (window.openPaymentModal) {
      window.openPaymentModal("teacher_pro");
    } else {
      window.location.href = "/pricing.html?plan=teacher_pro";
    }
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Universal helper: 402 javobni tekshirib, agar teacher_pro_required bo'lsa modal ko'rsatadi.
  // Qaytaradi: true (modal ko'rsatildi) yoki false (boshqa xato — o'zingiz hal qiling)
  window.handleProLimit = function (res, data) {
    if (res && res.status === 402 && data && data.error === "teacher_pro_required") {
      window.showProLimitModal(data);
      return true;
    }
    return false;
  };
})();