// ===== UMUMIY PREMIUM TO'LOV MODALI =====
// Har qanday sahifada premium upgrade modalini ochadi.
// Ishlatish: window.openPaymentModal("parent_premium")  (yoki student_premium, teacher_pro)
// Talab: api.js (authFetch) sahifaga ulangan bo'lishi kerak.

(function () {
  if (window.__paymentModalLoaded) return;
  window.__paymentModalLoaded = true;

  // Plan ma'lumotlari (narx server'da, bu faqat ko'rsatish uchun — so'mда)
  var PLANS = {
    student_premium: { name: "Student Premium", price: 50000, color: "var(--pm-accent)",
      perks: ["AI haftalik hisobot", "Cheksiz batafsil tahlil", "Kuchli/zaif mavzular", "Shaxsiy mashq rejasi"] },
    parent_premium: { name: "Parent Premium", price: 50000, color: "var(--pm-accent)",
      perks: ["Farzand AI hisoboti", "Zaif mavzular tahlili", "Keyingi hafta tavsiyalari", "To'liq progress kuzatuvi"] },
    teacher_pro: { name: "Teacher Pro", price: 150000, color: "var(--pm-green)",
      perks: ["AI sinf tahlili", "E'tibor kerak o'quvchilar", "Eng ko'p xato savollar", "O'qitish tavsiyalari"] },
    center_pro: { name: "Center Pro", price: 500000, color: "var(--pm-gold)",
      perks: ["Markaz tahlili", "O'qituvchilar boshqaruvi", "Markaz reytingи", "Barcha hisobotlar"] },
  };

  // Oy variantlari (chegirma bilan)
  var MONTH_OPTS = [
    { months: 1, label: "1 oy", discount: 0 },
    { months: 3, label: "3 oy", discount: 10 },
    { months: 6, label: "6 oy", discount: 15 },
    { months: 12, label: "1 yil", discount: 25 },
  ];

  var css =
    '.pm-overlay{--pm-card:#111a2e;--pm-card2:#0b1324;--pm-soft:#0e1626;--pm-hover:#182540;--pm-border:#2b3a59;--pm-border2:#3a4d73;--pm-text:#f8fafc;--pm-dim:#c4cee0;--pm-faint:#9eabc2;--pm-accent:#9b6cff;--pm-accent2:#4b8dff;--pm-green:#34d399;--pm-gold:#fbbf24;display:none;position:fixed;inset:0;z-index:6000;background:rgba(3,6,15,0.84);backdrop-filter:blur(6px);padding:24px;overflow-y:auto;color:var(--pm-text);color-scheme:dark;}' +
    '.pm-overlay.open{display:flex;align-items:center;justify-content:center;}' +
    '.pm-modal{width:100%;max-width:460px;margin:auto;background:linear-gradient(180deg,var(--pm-card),var(--pm-card2));border:1px solid var(--pm-border2);border-radius:22px;box-shadow:0 30px 100px rgba(0,0,0,0.68);animation:pmPop 0.25s ease;overflow:hidden;color:var(--pm-text);font-family:inherit;}' +
    '@keyframes pmPop{from{opacity:0;transform:scale(0.96) translateY(10px);}to{opacity:1;transform:scale(1) translateY(0);}}' +
    '.pm-head{position:relative;padding:26px 26px 22px;text-align:center;border-bottom:1px solid var(--pm-border);}' +
    '.pm-badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:.5px;padding:5px 12px;border-radius:999px;background:linear-gradient(135deg,var(--pm-accent),var(--pm-accent2));color:#fff;margin-bottom:12px;}' +
    '.pm-title{font-size:22px;font-weight:800;line-height:1.3;margin-bottom:6px;color:var(--pm-text);}' +
    '.pm-sub{font-size:13.5px;line-height:1.5;color:var(--pm-dim);}' +
    '.pm-close{position:absolute;top:18px;right:18px;width:34px;height:34px;border-radius:50%;border:1px solid var(--pm-border2);background:#17233b;color:#e2e8f0;font-size:20px;line-height:1;cursor:pointer;transition:all .2s;}' +
    '.pm-close:hover{background:rgba(239,68,68,0.2);color:#fca5a5;}' +
    '.pm-close:focus-visible,.pm-month:focus-visible,.pm-pay-btn:focus-visible{outline:3px solid rgba(96,165,250,.55);outline-offset:3px;}' +
    '.pm-body{padding:24px 26px;}' +
    '.pm-perks{list-style:none;display:flex;flex-direction:column;gap:10px;margin-bottom:22px;}' +
    '.pm-perks li{display:flex;align-items:center;gap:10px;font-size:13.5px;color:var(--pm-text);}' +
    '.pm-perks li i{width:18px;height:18px;color:var(--pm-green);flex:0 0 auto;}' +
    '.pm-perks li svg{width:18px;height:18px;color:var(--pm-green);flex:0 0 auto;}' +
    '.pm-months-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--pm-dim);margin-bottom:11px;}' +
    '.pm-months{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:22px;}' +
    '.pm-month{position:relative;padding:14px 12px;border:1.5px solid var(--pm-border);border-radius:14px;cursor:pointer;text-align:center;transition:all .15s;background:#101a2e;color:var(--pm-text);}' +
    '.pm-month:hover{border-color:var(--pm-accent2);}' +
    '.pm-month.active{border-color:#60a5fa;background:#172b50;box-shadow:inset 0 0 0 1px rgba(96,165,250,.25);}' +
    '.pm-month-label{font-size:14px;font-weight:700;color:var(--pm-text);}' +
    '.pm-month-price{font-size:12.5px;color:var(--pm-dim);margin-top:3px;}' +
    '.pm-disc{position:absolute;top:-9px;right:8px;font-size:10px;font-weight:800;padding:2px 7px;border-radius:6px;background:var(--pm-green);color:#04130a;}' +
    '.pm-total{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:16px 18px;background:#101a2e;border:1px solid var(--pm-border);border-radius:14px;margin-bottom:18px;}' +
    '.pm-total-label{font-size:13px;color:var(--pm-dim);}' +
    '.pm-total-val{font-size:24px;font-weight:800;color:var(--pm-text);text-align:right;}' +
    '.pm-total-val small{font-size:14px;font-weight:600;color:var(--pm-dim);}' +
    '.pm-pay-btn{width:100%;padding:15px;border:none;border-radius:14px;background:linear-gradient(135deg,#00b4d8,#0077b6);color:#fff;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;transition:transform .12s,box-shadow .2s;}' +
    '.pm-pay-btn:hover{box-shadow:0 8px 24px rgba(0,180,216,0.35);transform:translateY(-1px);}' +
    '.pm-pay-btn:disabled{opacity:.7;cursor:not-allowed;transform:none;}' +
    '.pm-pay-btn img{height:20px;}' +
    '.pm-note{font-size:11.5px;color:var(--pm-faint);text-align:center;margin-top:13px;line-height:1.5;}' +
    '.pm-state{padding:40px 26px;text-align:center;}' +
    '.pm-state-ic{width:70px;height:70px;margin:0 auto 18px;border-radius:18px;display:flex;align-items:center;justify-content:center;}' +
    '.pm-state-ic.ok{background:rgba(34,197,94,0.14);color:#86efac;}' +
    '.pm-state-ic.err{background:rgba(239,68,68,0.12);color:#fca5a5;}' +
    '.pm-state-ic svg{width:34px;height:34px;}' +
    '.pm-state h3{font-size:19px;font-weight:700;margin-bottom:8px;color:var(--pm-text);}' +
    '.pm-state p{font-size:13.5px;color:var(--pm-dim);line-height:1.6;margin-bottom:20px;}' +
    '.pm-spin{width:44px;height:44px;border:4px solid var(--pm-border);border-top-color:var(--pm-accent2);border-radius:50%;margin:0 auto 18px;animation:pmSpin .8s linear infinite;}' +
    '@keyframes pmSpin{to{transform:rotate(360deg);}}';

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var overlay = document.createElement("div");
  overlay.className = "pm-overlay";
  overlay.id = "pmOverlay";
  document.body.appendChild(overlay);

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closePaymentModal();
  });

  var currentPlan = null;
  var currentMonths = 1;

  function fmtSom(n) {
    return n.toLocaleString("uz-UZ").replace(/,/g, " ");
  }

  function calcTotal() {
    var plan = PLANS[currentPlan];
    var opt = MONTH_OPTS.find(function (o) { return o.months === currentMonths; });
    var base = plan.price * currentMonths;
    var disc = Math.round(base * (opt.discount / 100));
    return { base: base, total: base - disc, discount: opt.discount };
  }

  window.openPaymentModal = function (planKey) {
    currentPlan = planKey && PLANS[planKey] ? planKey : "parent_premium";
    currentMonths = 1;
    renderChoose();
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  };

  window.closePaymentModal = function () {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  };

  function renderChoose() {
    var plan = PLANS[currentPlan];
    var perksHtml = plan.perks.map(function (p) {
      return '<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' + p + "</li>";
    }).join("");

    var monthsHtml = MONTH_OPTS.map(function (o) {
      var perMonth = Math.round(plan.price * (1 - o.discount / 100));
      return '<div class="pm-month' + (o.months === currentMonths ? " active" : "") + '" onclick="window.__pmSelectMonth(' + o.months + ')">' +
        (o.discount ? '<span class="pm-disc">-' + o.discount + "%</span>" : "") +
        '<div class="pm-month-label">' + o.label + "</div>" +
        '<div class="pm-month-price">' + fmtSom(perMonth) + " so'm/oy</div>" +
      "</div>";
    }).join("");

    var calc = calcTotal();

    overlay.innerHTML =
      '<div class="pm-modal">' +
        '<div class="pm-head">' +
          '<button class="pm-close" onclick="window.closePaymentModal()">&times;</button>' +
          '<div class="pm-badge"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg> PREMIUM</div>' +
          '<div class="pm-title">' + plan.name + "</div>" +
          '<div class="pm-sub">Eng yaxshi imkoniyatlarni oching</div>' +
        "</div>" +
        '<div class="pm-body">' +
          '<ul class="pm-perks">' + perksHtml + "</ul>" +
          '<div class="pm-months-label">Muddatni tanlang</div>' +
          '<div class="pm-months">' + monthsHtml + "</div>" +
          '<div class="pm-total">' +
            '<span class="pm-total-label">Jami to\'lov</span>' +
            '<span class="pm-total-val" id="pmTotalVal">' + fmtSom(calc.total) + ' <small>so\'m</small></span>' +
          "</div>" +
          '<button class="pm-pay-btn" id="pmPayBtn" onclick="window.__pmPay()">' +
            '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' +
            "Payme orqali to'lash" +
          "</button>" +
          '<div class="pm-note">To\'lov Payme xavfsiz tizimi orqali amalga oshiriladi. To\'lovdan so\'ng premium darhol faollashadi.</div>' +
        "</div>" +
      "</div>";
  }

  window.__pmSelectMonth = function (m) {
    currentMonths = m;
    renderChoose();
  };

  window.__pmPay = async function () {
    var btn = document.getElementById("pmPayBtn");
    if (btn) { btn.disabled = true; btn.innerHTML = "Yaratilmoqda..."; }
    try {
      var res = await authFetch("/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: currentPlan, months: currentMonths }),
      });
      var data = await res.json();
      if (!res.ok) { renderError(data.error || "To'lov yaratilmadi"); return; }
      // Payme checkout'ga yo'naltirimiz (yangi tab)
      if (data.checkout_url) {
        window.open(data.checkout_url, "_blank");
        startPolling(data.payment_id);
      } else {
        renderError("To'lov havolasi yaratilmadi");
      }
    } catch (e) {
      renderError("Server bilan aloqa yo'q");
    }
  };

  function renderPending(paymentId) {
    var modal = overlay.querySelector(".pm-modal");
    if (!modal) return;
    modal.innerHTML =
      '<div class="pm-state">' +
        '<div class="pm-spin"></div>' +
        "<h3>To'lov kutilmoqda</h3>" +
        "<p>Payme oynasida to'lovni yakunlang. To'lov tasdiqlangach, bu yerda avtomatik ko'rsatiladi.</p>" +
        '<button class="pm-pay-btn" style="background:rgba(255,255,255,0.06);max-width:200px;margin:0 auto" onclick="window.closePaymentModal()">Yopish</button>' +
      "</div>";
  }

  function renderSuccess() {
    var modal = overlay.querySelector(".pm-modal");
    if (!modal) return;
    modal.innerHTML =
      '<div class="pm-state">' +
        '<div class="pm-state-ic ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>' +
        "<h3>Tabriklaymiz! 🎉</h3>" +
        "<p>To'lov muvaffaqiyatli amalga oshdi. Premium faollashtirildi.</p>" +
        '<button class="pm-pay-btn" style="max-width:220px;margin:0 auto" onclick="location.reload()">Davom etish</button>' +
      "</div>";
  }

  function renderError(msg) {
    var modal = overlay.querySelector(".pm-modal");
    if (!modal) return;
    modal.innerHTML =
      '<div class="pm-state">' +
        '<div class="pm-state-ic err"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>' +
        "<h3>Xatolik</h3>" +
        "<p>" + (msg || "Keyinroq urinib ko'ring.") + "</p>" +
        '<button class="pm-pay-btn" style="background:rgba(255,255,255,0.06);max-width:200px;margin:0 auto" onclick="window.closePaymentModal()">Yopish</button>' +
      "</div>";
  }

  // To'lov holatини kuzatish (Payme webhook orqali paid bo'lishini kutamiz)
  var pollTimer = null;
  function startPolling(paymentId) {
    renderPending(paymentId);
    var attempts = 0;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async function () {
      attempts++;
      if (attempts > 60) { clearInterval(pollTimer); return; } // 5 daqiqa (5s × 60)
      try {
        var res = await authFetch("/payments/" + paymentId + "/status");
        var data = await res.json();
        if (data.status === "paid") {
          clearInterval(pollTimer);
          renderSuccess();
        } else if (data.status === "cancelled" || data.status === "failed") {
          clearInterval(pollTimer);
          renderError("To'lov bekor qilindi yoki amalga oshmadi.");
        }
      } catch (e) { /* davom etamiz */ }
    }, 5000);
  }
})();
