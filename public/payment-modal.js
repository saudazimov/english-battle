// ===== UMUMIY PREMIUM TO'LOV MODALI =====
// Har qanday sahifada premium upgrade modalini ochadi.
// Ishlatish: window.openPaymentModal("parent_premium")  (yoki student_premium, teacher_pro)
// Talab: api.js (authFetch) sahifaga ulangan bo'lishi kerak.

(function () {
  if (window.__paymentModalLoaded) return;
  window.__paymentModalLoaded = true;

  function paymentT(key, params) {
    return window.IlmLigaI18n ? window.IlmLigaI18n.t(key, params) : key;
  }

  function paymentLocale() {
    var language = window.IlmLigaI18n ? window.IlmLigaI18n.getLanguage() : "uz";
    return { uz: "uz-UZ", en: "en-US", ru: "ru-RU" }[language] || "uz-UZ";
  }

  function comingSoonCopy() {
    var language = window.IlmLigaI18n ? window.IlmLigaI18n.getLanguage() : "uz";
    return {
      uz: { title: "Premium obuna tez orada", text: "Premium imkoniyatlar va xavfsiz to‘lov tizimi tayyorlanmoqda.", close: "Yopish" },
      en: { title: "Premium is coming soon", text: "Premium features and secure payments are being prepared.", close: "Close" },
      ru: { title: "Premium скоро появится", text: "Мы готовим Premium-функции и безопасную оплату.", close: "Закрыть" },
    }[language] || null;
  }

  // Plan ma'lumotlari (narx server'da, bu faqat ko'rsatish uchun — so'mда)
  var PLANS = {
    student_premium: { name: "Student Premium", price: 50000, color: "var(--pm-accent)",
      perks: ["pricing.studentFeatWeekly", "pricing.studentFeatDetailed", "pricing.studentFeatStrengths", "pricing.studentFeatPlan"] },
    parent_premium: { name: "Parent Premium", price: 50000, color: "var(--pm-accent)",
      perks: ["pricing.parentFeatReport", "pricing.parentFeatWeaknesses", "pricing.parentFeatAdvice", "pricing.parentFeatProgress"] },
    teacher_pro: { name: "Teacher Pro", price: 150000, color: "var(--pm-green)",
      perks: ["pricing.teacherFeatAi", "paymentModal.teacherAttention", "paymentModal.teacherErrors", "paymentModal.teacherAdvice"] },
    center_pro: { name: "Center Pro", price: 500000, color: "var(--pm-gold)",
      perks: ["pricing.centerFeatAnalytics", "pricing.centerFeatTeachers", "pricing.centerFeatRanking", "pricing.centerFeatReports"] },
  };

  // Oy variantlari (chegirma bilan)
  var MONTH_OPTS = [
    { months: 1, labelKey: "paymentModal.oneMonth", discount: 0 },
    { months: 3, labelKey: "paymentModal.threeMonths", discount: 10 },
    { months: 6, labelKey: "paymentModal.sixMonths", discount: 15 },
    { months: 12, labelKey: "paymentModal.oneYear", discount: 25 },
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
  var currentView = "choose";
  var currentPaymentId = null;
  var currentError = "";

  function fmtSom(n) {
    return n.toLocaleString(paymentLocale());
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
    currentView = "coming-soon";
    renderComingSoon();
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  };

  window.closePaymentModal = function () {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  };

  function renderComingSoon() {
    var copy = comingSoonCopy();
    overlay.innerHTML =
      '<div class="pm-modal"><div class="pm-head">' +
        '<button class="pm-close" onclick="window.closePaymentModal()" aria-label="' + copy.close + '">&times;</button>' +
        '<div class="pm-badge">PREMIUM</div>' +
        '<div class="pm-title">' + copy.title + '</div>' +
        '<div class="pm-sub">' + copy.text + '</div>' +
      '</div><div class="pm-body">' +
        '<button class="pm-pay-btn" type="button" onclick="window.closePaymentModal()">' + copy.close + '</button>' +
      '</div></div>';
  }

  function renderChoose() {
    currentView = "choose";
    var plan = PLANS[currentPlan];
    var perksHtml = plan.perks.map(function (p) {
      return '<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' + paymentT(p).replace(/^[✓✔]\s*/, "") + "</li>";
    }).join("");

    var monthsHtml = MONTH_OPTS.map(function (o) {
      var perMonth = Math.round(plan.price * (1 - o.discount / 100));
      return '<div class="pm-month' + (o.months === currentMonths ? " active" : "") + '" onclick="window.__pmSelectMonth(' + o.months + ')">' +
        (o.discount ? '<span class="pm-disc">-' + o.discount + "%</span>" : "") +
        '<div class="pm-month-label">' + paymentT(o.labelKey) + "</div>" +
        '<div class="pm-month-price">' + paymentT("paymentModal.perMonthPrice", { price: fmtSom(perMonth) }) + "</div>" +
      "</div>";
    }).join("");

    var calc = calcTotal();

    overlay.innerHTML =
      '<div class="pm-modal">' +
        '<div class="pm-head">' +
          '<button class="pm-close" onclick="window.closePaymentModal()" aria-label="' + paymentT("paymentModal.close") + '">&times;</button>' +
          '<div class="pm-badge"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg> PREMIUM</div>' +
          '<div class="pm-title">' + plan.name + "</div>" +
          '<div class="pm-sub">' + paymentT("paymentModal.unlockBest") + '</div>' +
        "</div>" +
        '<div class="pm-body">' +
          '<ul class="pm-perks">' + perksHtml + "</ul>" +
          '<div class="pm-months-label">' + paymentT("paymentModal.chooseDuration") + '</div>' +
          '<div class="pm-months">' + monthsHtml + "</div>" +
          '<div class="pm-total">' +
            '<span class="pm-total-label">' + paymentT("paymentModal.totalPayment") + '</span>' +
            '<span class="pm-total-val" id="pmTotalVal">' + fmtSom(calc.total) + ' <small>' + paymentT("pricing.currency") + '</small></span>' +
          "</div>" +
          '<button class="pm-pay-btn" id="pmPayBtn" onclick="window.__pmPay()">' +
            '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' +
            paymentT("paymentModal.payViaPayme") +
          "</button>" +
          '<div class="pm-note">' + paymentT("paymentModal.securityNote") + '</div>' +
        "</div>" +
      "</div>";
  }

  window.__pmSelectMonth = function (m) {
    currentMonths = m;
    renderChoose();
  };

  window.__pmPay = async function () {
    var btn = document.getElementById("pmPayBtn");
    if (btn) { btn.disabled = true; btn.innerHTML = paymentT("paymentModal.creating"); }
    try {
      var res = await authFetch("/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: currentPlan, months: currentMonths }),
      });
      var data = await res.json();
      if (!res.ok) { renderError(data.error || paymentT("paymentModal.createFailed")); return; }
      // Payme checkout'ga yo'naltirimiz (yangi tab)
      if (data.checkout_url) {
        window.open(data.checkout_url, "_blank");
        startPolling(data.payment_id);
      } else {
        renderError(paymentT("paymentModal.checkoutMissing"));
      }
    } catch (e) {
      renderError(paymentT("paymentModal.serverUnavailable"));
    }
  };

  function renderPending(paymentId) {
    currentView = "pending";
    currentPaymentId = paymentId;
    var modal = overlay.querySelector(".pm-modal");
    if (!modal) return;
    modal.innerHTML =
      '<div class="pm-state">' +
        '<div class="pm-spin"></div>' +
        '<h3>' + paymentT("paymentModal.pendingTitle") + '</h3>' +
        '<p>' + paymentT("paymentModal.pendingText") + '</p>' +
        '<button class="pm-pay-btn" style="background:rgba(255,255,255,0.06);max-width:200px;margin:0 auto" onclick="window.closePaymentModal()">' + paymentT("paymentModal.close") + '</button>' +
      "</div>";
  }

  function renderSuccess() {
    currentView = "success";
    var modal = overlay.querySelector(".pm-modal");
    if (!modal) return;
    modal.innerHTML =
      '<div class="pm-state">' +
        '<div class="pm-state-ic ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>' +
        '<h3>' + paymentT("paymentModal.successTitle") + '</h3>' +
        '<p>' + paymentT("paymentModal.successText") + '</p>' +
        '<button class="pm-pay-btn" style="max-width:220px;margin:0 auto" onclick="location.reload()">' + paymentT("paymentModal.continue") + '</button>' +
      "</div>";
  }

  function renderError(msg) {
    currentView = "error";
    currentError = msg || paymentT("paymentModal.tryLater");
    var modal = overlay.querySelector(".pm-modal");
    if (!modal) return;
    modal.innerHTML =
      '<div class="pm-state">' +
        '<div class="pm-state-ic err"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>' +
        '<h3>' + paymentT("paymentModal.errorTitle") + '</h3>' +
        '<p>' + currentError + '</p>' +
        '<button class="pm-pay-btn" style="background:rgba(255,255,255,0.06);max-width:200px;margin:0 auto" onclick="window.closePaymentModal()">' + paymentT("paymentModal.close") + '</button>' +
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
          renderError(paymentT("paymentModal.cancelled"));
        }
      } catch (e) { /* davom etamiz */ }
    }, 5000);
  }

  window.addEventListener("ilmliga:languagechange", function () {
    if (!overlay.classList.contains("open")) return;
    if (currentView === "pending") renderPending(currentPaymentId);
    else if (currentView === "success") renderSuccess();
    else if (currentView === "error") renderError(currentError);
    else renderChoose();
  });
})();
