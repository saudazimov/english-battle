// ===== UMUMIY TEACHER SIDEBAR =====
// Bitta joydan boshqariladi — har teacher sahifasi shu faylni ulaydi, sidebar bir xil bo'ladi.
//
// Ishlatish (har sahifada, </body> dan oldin):
//   <div id="teacherSidebar"></div>
//   <script src="/payment-modal.js"></script>   (Premium tugma uchun)
//   <script src="/teacher-sidebar.js"></script>
//   <script> renderTeacherSidebar("classes"); </script>   // active bo'lim kaliti
//
// Active kalitlar: home | classes | assignments | exams | students | results | ai | messages | resources | settings

(function () {
  if (window.__teacherSidebarLoaded) return;
  window.__teacherSidebarLoaded = true;

  // Sidebar o'z tema o'zgaruvchilarini aniqlaydi (har sahifada to'g'ri ishlaydi)
  var css =
    ':root{--tsb-bg:#ffffff;--tsb-border:#e8edf5;--tsb-text:#1a2233;--tsb-sub:#5d6b85;--tsb-dim:#8b97ad;--tsb-hover:#eef2f9;--tsb-accent:#7c5cfc;--tsb-primary:#2f6bff;--tsb-accent-soft:#efe9ff;--tsb-primary-soft:#e8efff;--tsb-green:#16b06a;--tsb-green-soft:#e0f5ec;--tsb-red:#ef4655;}' +
    '[data-theme="dark"]{--tsb-bg:#0d1424;--tsb-border:#1d2940;--tsb-text:#f1f5fc;--tsb-sub:#9aa8c4;--tsb-dim:#6b7a99;--tsb-hover:#16203a;--tsb-accent:#8b5cf6;--tsb-primary:#3b82f6;--tsb-accent-soft:rgba(139,92,246,.16);--tsb-primary-soft:rgba(59,130,246,.14);--tsb-green:#22c55e;--tsb-green-soft:rgba(34,197,94,.14);--tsb-red:#ef4444;}' +
    '.tsb{width:256px;flex:0 0 256px;background:var(--tsb-bg);border-right:1px solid var(--tsb-border);display:flex;flex-direction:column;position:sticky;top:0;height:100vh;padding:22px 16px;font-family:"Plus Jakarta Sans",system-ui,sans-serif;box-sizing:border-box;}' +
    '.tsb *{box-sizing:border-box;}' +
    '.tsb-logo{display:flex;align-items:center;gap:12px;padding:4px 8px 22px;}' +
    '.tsb-logo-mark{position:relative;width:42px;height:42px;border-radius:12px;flex:0 0 auto;background:linear-gradient(135deg,var(--tsb-accent),var(--tsb-primary));display:grid;place-items:center;box-shadow:0 6px 18px rgba(124,92,252,.32);}' +
    '.tsb-logo-mark.has-img{background:transparent;box-shadow:none;}' +
    '.tsb-logo-mark.has-img svg{display:none;}' +
    '.tsb-logo-mark svg{width:23px;height:23px;color:#fff;}' +
    '.tsb-logo-name{font-size:17px;font-weight:800;letter-spacing:-.3px;color:var(--tsb-text);}' +
    '.tsb-logo-sub{font-size:11.5px;color:var(--tsb-dim);font-weight:600;margin-top:1px;}' +
    '.tsb-nav{display:flex;flex-direction:column;gap:3px;flex:1;overflow-y:auto;}' +
    '.tsb-item{display:flex;align-items:center;gap:12px;padding:11px 13px;border-radius:11px;color:var(--tsb-sub);font-size:14px;font-weight:600;cursor:pointer;transition:all .15s;text-decoration:none;}' +
    '.tsb-item svg{width:19px;height:19px;flex:0 0 auto;}' +
    '.tsb-item:hover{background:var(--tsb-hover);color:var(--tsb-text);}' +
    '.tsb-item.active{background:linear-gradient(135deg,var(--tsb-accent),var(--tsb-primary));color:#fff;box-shadow:0 6px 18px rgba(124,92,252,.3);}' +
    '.tsb-tag{margin-left:auto;font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;background:var(--tsb-accent);color:#fff;letter-spacing:.3px;}' +
    '.tsb-item.active .tsb-tag{background:rgba(255,255,255,.25);}' +
    '.tsb-badge{margin-left:auto;font-size:11px;font-weight:700;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--tsb-red);color:#fff;display:grid;place-items:center;}' +
    '.tsb-item.active .tsb-badge{background:rgba(255,255,255,.25);}' +
    '.tsb-promo{margin-top:16px;padding:18px;border-radius:16px;background:linear-gradient(160deg,var(--tsb-accent-soft),var(--tsb-primary-soft));border:1px solid var(--tsb-border);text-align:center;}' +
    '.tsb-promo.pro{background:linear-gradient(160deg,var(--tsb-green-soft),var(--tsb-primary-soft));}' +
    '.tsb-promo-ic{width:38px;height:38px;margin:0 auto 10px;border-radius:11px;background:linear-gradient(135deg,var(--tsb-accent),var(--tsb-primary));display:grid;place-items:center;}' +
    '.tsb-promo-ic svg{width:20px;height:20px;color:#fff;}' +
    '.tsb-promo h4{font-size:14px;font-weight:800;margin-bottom:5px;color:var(--tsb-text);}' +
    '.tsb-promo p{font-size:11.5px;color:var(--tsb-sub);line-height:1.5;margin-bottom:13px;}' +
    '.tsb-promo-limits{list-style:none;margin:0 0 12px;padding:0;text-align:left;}' +
    '.tsb-promo-limits li{font-size:11px;color:var(--tsb-sub);display:flex;align-items:center;gap:6px;margin-bottom:4px;}' +
    '.tsb-promo-limits li svg{width:12px;height:12px;flex:0 0 auto;color:var(--tsb-dim);}' +
    '.tsb-promo-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;padding:4px 11px;border-radius:999px;background:var(--tsb-green);color:#fff;margin-bottom:8px;}' +
    '.tsb-promo-exp{font-size:11px;color:var(--tsb-sub);margin-bottom:10px;}' +
    '.tsb-promo-btn{width:100%;padding:9px;border:none;border-radius:9px;cursor:pointer;background:linear-gradient(135deg,var(--tsb-accent),var(--tsb-primary));color:#fff;font-size:12.5px;font-weight:700;font-family:inherit;}' +
    '.tsb-foot{margin-top:14px;padding-top:14px;border-top:1px solid var(--tsb-border);display:flex;align-items:center;gap:9px;color:var(--tsb-dim);font-size:13px;font-weight:600;cursor:pointer;padding-left:8px;}' +
    '.tsb-foot svg{width:18px;height:18px;}' +
    '@media (max-width:920px){.tsb{display:none;}}';

  // Bo'limlar: kalit, label, ikonka(svg path), href yoki comingSoon, qo'shimcha (tag/badge)
  var ITEMS = [
    { key: "home", label: "Bosh sahifa", href: "/teacher.html",
      svg: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
    { key: "classes", label: "Mening sinflarim", href: "/teacher-classes.html",
      svg: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
    { key: "assignments", label: "Topshiriqlar", href: "/teacher-assignments.html",
      svg: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
    { key: "exams", label: "Imtihonlar", href: "/teacher-exams.html",
      svg: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/>' },
    { key: "students", label: "O'quvchilar", href: "/teacher-students.html",
      svg: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' },
    { key: "results", label: "Natijalar", href: "/teacher-results.html",
      svg: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
    { key: "ai", label: "AI Hisobotlar", href: "/teacher-ai.html", tag: "Yangi",
      svg: '<path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7z"/><line x1="9" y1="21" x2="15" y2="21"/>' },
    { key: "messages", label: "Xabarlar", href: "/teacher-messages.html", tag: "Tez orada",
      svg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
    { key: "resources", label: "Resurslar", href: "/teacher-resources.html",
      svg: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
    { key: "settings", label: "Sozlamalar", href: "/teacher-settings.html",
      svg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
  ];

  function svgWrap(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }

  window.renderTeacherSidebar = function (activeKey) {
    var mount = document.getElementById("teacherSidebar");
    if (!mount) return;

    // CSS bir marta
    if (!document.getElementById("tsbStyle")) {
      var style = document.createElement("style");
      style.id = "tsbStyle";
      style.textContent = css;
      document.head.appendChild(style);
    }

    var navHtml = ITEMS.map(function (it) {
      var isActive = it.key === activeKey ? " active" : "";
      var extra = "";
      if (it.tag) extra = '<span class="tsb-tag">' + it.tag + '</span>';
      if (it.badge) extra = '<span class="tsb-badge">' + it.badge + '</span>';
      var inner = svgWrap(it.svg) + it.label + extra;
      if (it.href) {
        return '<a class="tsb-item' + isActive + '" href="' + it.href + '">' + inner + '</a>';
      }
      // comingSoon
      return '<div class="tsb-item' + isActive + '" onclick="window.__tsbSoon(\'' + it.soon + '\')">' + inner + '</div>';
    }).join("");

    mount.innerHTML =
      '<aside class="tsb">' +
        '<div class="tsb-logo">' +
          '<div class="tsb-logo-mark has-img">' + svgWrap('<path d="M12 2L3 7v6c0 5 3.5 8 9 9 5.5-1 9-4 9-9V7z"/>') + '<img src="/images/brand/logo-icon.png" alt="IlmLiga" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;" onerror="this.parentNode.classList.remove(\'has-img\');this.remove();"></div>' +
          '<div><div class="tsb-logo-name">IlmLiga</div><div class="tsb-logo-sub">Teacher Panel</div></div>' +
        '</div>' +
        '<nav class="tsb-nav">' + navHtml + '</nav>' +
        '<div class="tsb-promo" id="tsbPromo">' +
          '<div class="tsb-promo-ic"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg></div>' +
          '<h4>Premium Teacher</h4>' +
          '<p>Ko\'proq imkoniyatlar bilan o\'qitishni yengillashtiring.</p>' +
          '<button class="tsb-promo-btn" onclick="window.openPaymentModal && window.openPaymentModal(\'teacher_pro\')">Premium ga o\'tish</button>' +
        '</div>' +
        '<div class="tsb-foot" onclick="window.__tsbSoon(\'Yordam markazi\')">' +
          svgWrap('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>') +
          'Yordam markazi' +
        '</div>' +
      '</aside>';

    // Premium card real holatga ulaymiz (agar authFetch bor bo'lsa)
    loadSidebarSubscription();
  };

  // comingSoon — agar sahifada o'zining comingSoon'i bo'lsa uni ishlatadi, bo'lmasa alert
  window.__tsbSoon = function (name) {
    if (typeof window.comingSoon === "function") { window.comingSoon(name); return; }
    alert((name ? name + ": " : "") + "tez orada tayyor bo'ladi");
  };

  // Premium card — free/Pro holat (/me/subscription)
  async function loadSidebarSubscription() {
    var card = document.getElementById("tsbPromo");
    if (!card || typeof authFetch !== "function") return;
    try {
      var res = await authFetch("/me/subscription");
      var d = await res.json();
      if (res.ok && d.is_premium && d.plan === "teacher_pro") {
        card.className = "tsb-promo pro";
        var expText = "";
        if (d.expires_at) {
          var exp = new Date(d.expires_at);
          expText = exp.toLocaleDateString("uz-UZ") + " gacha (" + d.days_left + " kun)";
        }
        card.innerHTML =
          '<div class="tsb-promo-badge"><svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg> Teacher Pro</div>' +
          '<h4>Faol obuna</h4>' +
          '<div class="tsb-promo-exp">' + esc(expText) + '</div>' +
          '<p style="margin-bottom:0">Barcha imkoniyatlar ochiq. Rahmat!</p>';
      } else {
        card.className = "tsb-promo";
        card.innerHTML =
          '<div class="tsb-promo-ic"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg></div>' +
          '<h4>Premium Teacher</h4>' +
          '<ul class="tsb-promo-limits">' +
            '<li>' + dotSvg() + 'Bepul: 1 sinf</li>' +
            '<li>' + dotSvg() + 'Bepul: 15 o\'quvchi</li>' +
            '<li>' + dotSvg() + 'Bepul: 3 topshiriq/oy</li>' +
          '</ul>' +
          '<button class="tsb-promo-btn" onclick="window.openPaymentModal && window.openPaymentModal(\'teacher_pro\')">Teacher Pro olish</button>';
      }
    } catch (e) { /* card default qoladi */ }
  }

  function dotSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>';
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();