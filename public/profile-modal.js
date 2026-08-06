// ===== UMUMIY PROFIL MODALI =====
// Har qanday sahifada foydalanuvchi profilini modal'da ochadi.
// Ishlatish: window.openProfileModal(userId)
// Talab: sidebar.js (avatarHTML) va api.js (authFetch) sahifaga ulangan bo'lishi kerak.

(function () {
  // Ikki marta yuklanmasin
  if (window.__profileModalLoaded) return;
  window.__profileModalLoaded = true;

  // ===== CSS =====
  var css =
    '.fp-overlay{display:none;position:fixed;inset:0;z-index:5000;background:rgba(3,6,15,0.75);backdrop-filter:blur(5px);padding:30px;overflow-y:auto;}' +
    '.fp-overlay::-webkit-scrollbar{width:10px;}' +
    '.fp-overlay::-webkit-scrollbar-track{background:rgba(255,255,255,0.03);border-radius:999px;}' +
    '.fp-overlay::-webkit-scrollbar-thumb{background:linear-gradient(180deg,var(--accent),var(--accent-2));border-radius:999px;border:2px solid rgba(3,6,15,0.5);}' +
    '.fp-overlay::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,var(--accent-2),var(--accent));}' +
    '.fp-overlay{scrollbar-width:thin;scrollbar-color:var(--accent) rgba(255,255,255,0.03);}' +
    '.fp-overlay.open{display:flex;align-items:flex-start;justify-content:center;}' +
    '.fp-modal{width:100%;max-width:1280px;margin:auto;background:linear-gradient(180deg,var(--panel),var(--bg-2));border:1px solid var(--border-bright);border-radius:22px;box-shadow:0 30px 100px rgba(0,0,0,0.6);animation:fpPop 0.25s ease;}' +
    '@keyframes fpPop{from{opacity:0;transform:scale(0.96) translateY(10px);}to{opacity:1;transform:scale(1) translateY(0);}}' +
    '.fp-header{display:flex;align-items:center;justify-content:space-between;padding:20px 26px;border-bottom:1px solid var(--border);}' +
    '.fp-header-title{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700;}' +
    '.fp-header-title i{width:20px;height:20px;color:var(--accent);}' +
    '.fp-close{width:38px;height:38px;border-radius:50%;border:1px solid var(--border);background:rgba(255,255,255,0.05);color:var(--text-dim);font-size:17px;cursor:pointer;transition:all 0.2s;}' +
    '.fp-close:hover{background:rgba(239,68,68,0.2);color:#fca5a5;border-color:rgba(239,68,68,0.4);}' +
    '.fp-body{display:grid;grid-template-columns:1fr 320px;gap:20px;padding:24px 26px;}' +
    '.fp-main{display:flex;flex-direction:column;gap:18px;}' +
    '.fp-side{display:flex;flex-direction:column;gap:18px;}' +
    '.fp-row2{display:grid;grid-template-columns:1fr 1.3fr;gap:18px;}' +
    '.fp-skel{padding:30px;border:1px dashed var(--border);border-radius:14px;color:var(--text-faint);font-size:13px;text-align:center;}' +
    '@media (max-width:1000px){.fp-body{grid-template-columns:1fr;}.fp-row2{grid-template-columns:1fr;}}' +
    '.fp-card{display:flex;align-items:flex-start;gap:22px;padding:24px;background:linear-gradient(180deg,rgba(91,140,255,0.06),transparent);border:1px solid var(--border);border-radius:16px;}' +
    '.fpc-avatar{width:88px;height:88px;border-radius:50%;flex-shrink:0;overflow:hidden;position:relative;background:linear-gradient(135deg,var(--accent),var(--accent-2));display:grid;place-items:center;font-size:34px;font-weight:800;border:3px solid rgba(120,150,255,0.3);box-shadow:0 0 30px rgba(91,140,255,0.4);}' +
    '.fpc-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;}' +
    '.fpc-info{flex:1;}' +
    '.fpc-name{font-size:24px;font-weight:800;}' +
    '.fpc-meta{display:flex;align-items:center;gap:10px;margin-top:6px;color:var(--text-dim);font-size:13px;flex-wrap:wrap;}' +
    '.fpc-cefr b{background:rgba(91,140,255,0.2);color:var(--accent);padding:2px 7px;border-radius:5px;}' +
    '.fpc-divider{width:1px;height:14px;background:var(--border);}' +
    '.fpc-stats{display:flex;gap:28px;margin-top:18px;flex-wrap:wrap;}' +
    '.fpc-stat{display:flex;align-items:center;gap:9px;}' +
    '.fpc-stat i{width:20px;height:20px;}' +
    '.fpc-sl{font-size:11px;color:var(--text-dim);text-transform:uppercase;}' +
    '.fpc-sv{font-size:18px;font-weight:800;}' +
    '.fpc-actions{display:flex;flex-direction:column;gap:10px;flex-shrink:0;}' +
    '.fpc-btn{display:flex;align-items:center;gap:8px;justify-content:center;padding:10px 18px;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit;transition:all 0.2s;white-space:nowrap;}' +
    '.fpc-btn i{width:16px;height:16px;}' +
    '.fpc-challenge{background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;}' +
    '.fpc-challenge:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(91,140,255,0.4);}' +
    '.fpc-report{background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);color:#f87171;}' +
    '.fpc-report:hover{background:rgba(248,113,113,0.18);border-color:#f87171;}' +
    '.fpc-full{background:rgba(91,140,255,0.12);border:1px solid var(--border-bright);color:var(--accent);}' +
    '.fpc-full:hover{background:rgba(91,140,255,0.2);}' +
    '.fp-block{padding:20px 22px;background:rgba(0,0,0,0.15);border:1px solid var(--border);border-radius:16px;}' +
    '.fp-block-title{display:flex;align-items:center;gap:9px;font-size:16px;font-weight:700;margin-bottom:16px;}' +
    '.fp-block-title i{width:18px;height:18px;color:var(--accent);}' +
    '.fp-about-rows{display:flex;flex-direction:column;gap:14px;}' +
    '.fp-ar{display:flex;align-items:center;gap:10px;font-size:14px;}' +
    '.fp-ar i{width:16px;height:16px;color:var(--text-dim);flex-shrink:0;}' +
    '.fp-ak{color:var(--text-dim);width:95px;flex-shrink:0;}' +
    '.fp-av{font-weight:600;}' +
    '.fp-ach-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;}' +
    '.fp-ach-item{text-align:center;opacity:0.45;}' +
    '.fp-ach-ic{width:56px;height:56px;border-radius:14px;margin:0 auto 8px;display:grid;place-items:center;background:linear-gradient(135deg,var(--panel-2),var(--bg-2));border:1px solid var(--border);}' +
    '.fp-ach-ic i{width:26px;height:26px;color:var(--text-faint);}' +
    '.fp-ach-n{font-size:11px;color:var(--text-dim);font-weight:600;}' +
    '@media (max-width:600px){.fp-ach-grid{grid-template-columns:repeat(3,1fr);}}' +
    '.fp-bs-rows{display:flex;flex-direction:column;gap:13px;}' +
    '.fp-bs-row{display:flex;justify-content:space-between;align-items:center;font-size:14px;}' +
    '.fp-bs-k{color:var(--text-dim);}' +
    '.fp-bs-v{font-weight:800;font-size:17px;}' +
    '.fp-bs-divider{height:1px;background:var(--border);margin:4px 0;}' +
    '.fp-hist-head{display:grid;grid-template-columns:1.6fr 1fr 0.8fr;gap:8px;font-size:11px;color:var(--text-dim);text-transform:uppercase;padding:0 8px 8px;border-bottom:1px solid var(--border);margin-bottom:6px;}' +
    '.fp-hist-row{display:grid;grid-template-columns:1.6fr 1fr 0.8fr;gap:8px;align-items:center;padding:9px 8px;border-radius:9px;font-size:13px;}' +
    '.fp-hist-row:hover{background:var(--panel);}' +
    '.fp-hist-opp{display:flex;align-items:center;gap:9px;}' +
    '.fp-hist-ava{width:30px;height:30px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,var(--accent),var(--accent-2));display:grid;place-items:center;font-weight:700;font-size:12px;}' +
    '.fp-rank-medal{font-size:44px;text-align:center;}' +
    '.fp-rank-name{font-size:20px;font-weight:800;text-align:center;margin:4px 0 14px;}' +
    '.fp-rank-bar{height:8px;background:rgba(0,0,0,0.4);border-radius:4px;overflow:hidden;}' +
    '.fp-rank-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:4px;}' +
    '.fp-rank-rp{font-size:13px;color:var(--text-dim);text-align:center;margin-top:8px;}' +
    '.fp-rank-next{font-size:12px;color:var(--accent);text-align:center;margin-top:2px;}' +
    '.fp-cefr-top{display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;}' +
    '.fp-cefr-top b{color:var(--accent);}' +
    '.fp-cefr-top span{color:var(--text-dim);}' +
    '.fp-cefr-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:4px;}' +
    '.fp-cefr-msg{font-size:12px;color:var(--text-dim);text-align:center;margin-top:8px;}' +
    '.fp-mutual-list{display:flex;flex-direction:column;gap:8px;margin-top:4px;}' +
    '.fp-mutual-item{width:100%;display:flex;align-items:center;gap:10px;padding:7px 9px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background 0.15s;}' +
    '.fp-mutual-item:hover,.fp-mutual-item:focus-visible{background:var(--panel);outline:none;}' +
    '.fp-mutual-ava{width:34px;height:34px;border-radius:50%;flex-shrink:0;position:relative;overflow:hidden;background:linear-gradient(135deg,var(--accent),var(--accent-2));}' +
    '.fp-mutual-name{min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px;font-weight:600;}' +
    '.fp-mutual-rp{font-size:12px;color:var(--text-dim);white-space:nowrap;}' +
    '.fp-mutual-count{margin-left:auto;color:var(--text-dim);font-size:13px;}' +
    '.fp-mutual-more{text-align:center;font-size:13px;color:var(--accent);padding:8px 0 0;}' +
    '.fp-mutual-empty{color:var(--text-faint);font-size:13px;text-align:center;padding:16px;}' +
    '.fp-rank-medal i,.fp-rank-medal svg{width:48px !important;height:48px !important;vertical-align:middle !important;}';

  var styleEl = document.createElement("style");
  styleEl.id = "fpModalStyle";
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ===== HTML =====
  var modalHTML =
    '<div class="fp-modal">' +
      '<div class="fp-header">' +
        '<div class="fp-header-title"><i data-lucide="user"></i> Profil</div>' +
        '<button class="fp-close" onclick="closeProfileModal()">\u2715</button>' +
      '</div>' +
      '<div class="fp-body">' +
        '<div class="fp-main">' +
          '<div id="fpCard" class="fp-skel">Profil kartasi</div>' +
          '<div class="fp-row2">' +
            '<div id="fpAbout" class="fp-skel">About</div>' +
            '<div id="fpAch" class="fp-skel">Achievements</div>' +
          '</div>' +
          '<div class="fp-row2">' +
            '<div id="fpStats" class="fp-skel">Battle Stats</div>' +
            '<div id="fpHistory" class="fp-skel">Battle History</div>' +
          '</div>' +
        '</div>' +
        '<div class="fp-side">' +
          '<div id="fpRank" class="fp-skel">Current Rank</div>' +
          '<div id="fpCefr" class="fp-skel">CEFR Progression</div>' +
          '<div id="fpMutual" class="fp-skel">Mutual Friends</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  var overlay = document.createElement("div");
  overlay.id = "fpModal";
  overlay.className = "fp-overlay";
  overlay.innerHTML = modalHTML;
  document.body.appendChild(overlay);

  // Tashqariga bosilsa yopiladi
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeProfileModal();
  });

  // ===== Yordamchilar =====
  function fpLeague(rating) {
    var ic = function (name, color) { return '<i data-lucide="' + name + '" style="width:16px;height:16px;color:' + color + ';vertical-align:-3px;"></i>'; };
    if (rating >= 2000) return { name: "Grandmaster", medal: "\ud83d\udc51", icon: ic("crown", "#fbbf24") };
    if (rating >= 1800) return { name: "Master", medal: "\ud83d\udd31", icon: ic("crown", "#a855f7") };
    if (rating >= 1600) return { name: "Diamond", medal: "\ud83d\udca0", icon: ic("gem", "#38e1ff") };
    if (rating >= 1400) return { name: "Platinum", medal: "\ud83d\udc8e", icon: ic("gem", "#5b8cff") };
    if (rating >= 1200) return { name: "Gold", medal: "\ud83e\udd47", icon: ic("medal", "#fbbf24") };
    if (rating >= 1000) return { name: "Silver", medal: "\ud83e\udd48", icon: ic("shield", "#cbd5e1") };
    return { name: "Bronze", medal: "\ud83e\udd49", icon: ic("shield", "#cd7f32") };
  }

  var fpCefrLabels = { A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper-Intermediate", C1: "Advanced", C2: "Proficient" };

  // ===== Ochish / yopish =====
  var fpCurrentUserId = null; // hozir ochiq profil egasi

  window.openProfileModal = function (userId) {
    fpCurrentUserId = userId;
    document.getElementById("fpModal").classList.add("open");
    document.body.style.overflow = "hidden";
    loadProfileModal(userId);
  };

  window.closeProfileModal = function () {
    document.getElementById("fpModal").classList.remove("open");
    document.body.style.overflow = "";
    fpCurrentUserId = null;
  };

  async function loadProfileModal(userId) {
    try {
      var res = await authFetch("/profile/" + userId);
      var data = await res.json();
      renderFpCard(data);
      renderFpAbout(data);
      renderFpAch();
      renderFpStats(data);
      renderFpHistory(userId);
      renderFpSide(data);
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      document.getElementById("fpCard").innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-faint);">Yuklab bo\'lmadi</div>';
    }
  }

  // Sprint 1: XSS himoya — lokal escape (sidebar.js yuklanmagan sahifalar uchun ham)
  function fpEsc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderFpCard(data) {
    var u = data.user || {};
    var s = data.stats || {};
    var lg = fpLeague(u.rating || 1000);
    var name = (u.first_name || "") + " " + (u.last_name || "");
    var fs = data.friendStatus || "none";

    // Do'stlik holatiga qarab asosiy tugma
    var mainBtn = "";
    if (fs === "friends") {
      // Do'st — Challenge qilish mumkin
      mainBtn = '<button class="fpc-btn fpc-challenge" onclick="fpChallenge(' + (u.id || 0) + ', \'' + name.replace(/'/g, "\\'") + '\')"><i data-lucide="swords"></i> Challenge</button>';
    } else if (fs === "pending_sent") {
      // So'rov yuborilgan — kutilmoqda
      mainBtn = '<button class="fpc-btn fpc-full" disabled style="opacity:0.6;cursor:default;"><i data-lucide="clock"></i> So\'rov yuborilgan</button>';
    } else if (fs === "pending_received") {
      // Bu odam sizga so'rov yuborgan — do'stlar bo'limida qabul qilish mumkin
      mainBtn = '<button class="fpc-btn fpc-challenge" onclick="window.location.href=\'/friends.html\'"><i data-lucide="user-check"></i> So\'rovni ko\'rish</button>';
    } else if (fs === "self") {
      // O'zining profili — tugma yo'q
      mainBtn = "";
    } else {
      // Do'st emas — do'stlashish
      mainBtn = '<button class="fpc-btn fpc-challenge" onclick="fpAddFriend(' + (u.id || 0) + ', \'' + name.replace(/'/g, "\\'") + '\', this)"><i data-lucide="user-plus"></i> Do\'stlashish</button>';
    }

    document.getElementById("fpCard").className = "fp-card";
    document.getElementById("fpCard").innerHTML =
      '<div class="fpc-avatar">' + avatarHTML(u.first_name, u.profile_picture) + '</div>' +
      '<div class="fpc-info">' +
        '<div class="fpc-name">' + fpEsc(name) + '</div>' +
        '<div class="fpc-meta">' +
          '<span class="fpc-cefr">CEFR <b>' + (u.cefr_level || "A1") + '</b></span> ' +
          '<span>' + (fpCefrLabels[u.cefr_level] || "Beginner") + '</span>' +
          '<span class="fpc-divider"></span>' +
          '<span>League <b style="color:var(--cyan);">' + lg.icon + ' ' + lg.name + '</b></span>' +
        '</div>' +
        '<div class="fpc-stats">' +
          '<div class="fpc-stat"><i data-lucide="trophy" style="color:var(--gold);"></i><div><div class="fpc-sl">Rating</div><div class="fpc-sv">' + (u.rating || 1000) + '</div></div></div>' +
          '<div class="fpc-stat"><i data-lucide="target" style="color:var(--green);"></i><div><div class="fpc-sl">Win Rate</div><div class="fpc-sv" style="color:var(--green);">' + (s.win_rate || 0) + '%</div></div></div>' +
          '<div class="fpc-stat"><i data-lucide="flame" style="color:var(--gold);"></i><div><div class="fpc-sl">Win Streak</div><div class="fpc-sv" style="color:var(--gold);">' + (u.current_streak || 0) + '</div></div></div>' +
          '<div class="fpc-stat"><i data-lucide="swords" style="color:var(--accent-2);"></i><div><div class="fpc-sl">Total Battles</div><div class="fpc-sv">' + (s.total_battles || 0) + '</div></div></div>' +
        '</div>' +
      '</div>' +
      '<div class="fpc-actions">' +
        mainBtn +
        '<button class="fpc-btn fpc-full" onclick="window.location.href=\'/profile.html?id=' + (u.id || 0) + '\'"><i data-lucide="external-link"></i> To\'liq profil</button>' +
        (fs !== "self" ? '<button class="fpc-btn fpc-report" onclick="fpReportUser(' + (u.id || 0) + ', \'' + name.replace(/'/g, "\\'") + '\')"><i data-lucide="flag"></i> Shikoyat</button>' : '') +
      '</div>';
    if (window.lucide) lucide.createIcons();
  }

  // ===== FOYDALANUVCHIGA SHIKOYAT =====
  window.fpReportUser = function (userId, name) {
    // Modal yo'q bo'lsa — yaratamiz (bir marta)
    if (!document.getElementById("userReportModal")) {
      var m = document.createElement("div");
      m.id = "userReportModal";
      m.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);z-index:10001;align-items:center;justify-content:center;padding:20px;";
      m.innerHTML =
        '<div style="background:#0e1428;border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:24px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
            '<div style="display:flex;align-items:center;gap:8px;font-size:17px;font-weight:700;color:#fff;"><i data-lucide="flag" style="width:18px;height:18px;color:#f87171;"></i> <span id="urTitle">Shikoyat</span></div>' +
            '<div onclick="fpCloseReport()" style="cursor:pointer;color:#94a3b8;width:30px;height:30px;display:grid;place-items:center;border-radius:8px;"><i data-lucide="x" style="width:18px;height:18px;"></i></div>' +
          '</div>' +
          '<p style="font-size:13px;color:#94a3b8;margin:0 0 16px;">Bu foydalanuvchida qanday muammo bor?</p>' +
          '<input type="hidden" id="urUserId">' +
          '<div id="urReasons" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">' +
            urReasonHtml("inappropriate", "Nomaqbul xatti-harakat", "Qo'pol yoki nomaqbul muomala") +
            urReasonHtml("offensive", "Haqorat", "Haqoratli yoki zararli til") +
            urReasonHtml("cheating", "Firibgarlik", "O'yinda aldash, halol bo'lmagan harakat") +
            urReasonHtml("spam", "Spam", "Keraksiz xabar yoki reklama") +
            urReasonHtml("other", "Boshqa", "Boshqa muammo") +
          '</div>' +
          '<textarea id="urComment" placeholder="Qo\'shimcha izoh (ixtiyoriy)..." maxlength="500" style="width:100%;background:#070b16;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 12px;color:#e8edf7;font-size:13px;font-family:inherit;resize:vertical;min-height:60px;box-sizing:border-box;margin-bottom:14px;"></textarea>' +
          '<div style="display:flex;gap:10px;">' +
            '<button onclick="fpCloseReport()" style="flex:1;padding:11px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:none;background:rgba(255,255,255,0.06);color:#cbd5e1;">Bekor qilish</button>' +
            '<button id="urSubmitBtn" onclick="fpSubmitReport()" style="flex:1;padding:11px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:none;background:linear-gradient(135deg,#f87171,#dc2626);color:#fff;">Yuborish</button>' +
          '</div>' +
          '<div id="urMsg" style="margin-top:12px;font-size:13px;text-align:center;min-height:18px;"></div>' +
        '</div>';
      document.body.appendChild(m);
    }
    document.getElementById("urUserId").value = userId;
    document.getElementById("urTitle").textContent = name + " — shikoyat";
    document.querySelectorAll('input[name="urReason"]').forEach(function (r) { r.checked = false; });
    document.getElementById("urComment").value = "";
    var msg = document.getElementById("urMsg"); msg.textContent = ""; msg.style.color = "";
    var btn = document.getElementById("urSubmitBtn"); btn.disabled = false; btn.textContent = "Yuborish";
    document.getElementById("userReportModal").style.display = "flex";
    if (window.lucide) lucide.createIcons();
  };

  function urReasonHtml(value, title, sub) {
    return '<label style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid rgba(255,255,255,0.1);border-radius:12px;cursor:pointer;">' +
      '<input type="radio" name="urReason" value="' + value + '" style="accent-color:#5b8cff;width:16px;height:16px;flex-shrink:0;">' +
      '<span style="display:flex;flex-direction:column;gap:2px;"><b style="font-size:13.5px;color:#e8edf7;font-weight:600;">' + title + '</b><small style="font-size:11.5px;color:#64748b;">' + sub + '</small></span></label>';
  }

  window.fpCloseReport = function () {
    var m = document.getElementById("userReportModal");
    if (m) m.style.display = "none";
  };

  window.fpSubmitReport = async function () {
    var userId = document.getElementById("urUserId").value;
    var reasonEl = document.querySelector('input[name="urReason"]:checked');
    var comment = document.getElementById("urComment").value.trim();
    var msg = document.getElementById("urMsg");

    if (!reasonEl) { msg.textContent = "Iltimos, sababni tanlang"; msg.style.color = "#f87171"; return; }
    var token = localStorage.getItem("token");
    if (!token) { msg.textContent = "Avtorizatsiya xatosi"; msg.style.color = "#f87171"; return; }

    var btn = document.getElementById("urSubmitBtn");
    btn.disabled = true; btn.textContent = "Yuborilmoqda...";
    try {
      var res = await fetch("/flags/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({ entity_type: "user", entity_id: parseInt(userId), reason: reasonEl.value, comment: comment }),
      });
      var d = await res.json();
      if (!res.ok) { msg.textContent = d.error || "Xato"; msg.style.color = "#f87171"; btn.disabled = false; btn.textContent = "Yuborish"; return; }
      msg.textContent = "✅ " + d.message; msg.style.color = "#34d399";
      setTimeout(window.fpCloseReport, 1500);
    } catch (err) {
      msg.textContent = "Server xatosi"; msg.style.color = "#f87171";
      btn.disabled = false; btn.textContent = "Yuborish";
    }
  };

  // Do'stlashish (friend request yuborish)
  window.fpAddFriend = function (userId, name, btnEl) {
    var me = JSON.parse(localStorage.getItem("user") || "{}");
    if (!me.id) return;
    if (btnEl) { btnEl.disabled = true; btnEl.style.opacity = "0.6"; btnEl.innerHTML = '<i data-lucide="clock"></i> Yuborilmoqda...'; if (window.lucide) lucide.createIcons(); }
    authFetch("/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiverId: userId }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (btnEl) {
        btnEl.innerHTML = '<i data-lucide="check"></i> So\'rov yuborildi';
        if (window.lucide) lucide.createIcons();
      }
    }).catch(function () {
      if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = "1"; btnEl.innerHTML = '<i data-lucide="user-plus"></i> Do\'stlashish'; if (window.lucide) lucide.createIcons(); }
    });
  };

  // Challenge tugmasi: agar sahifada challengeFriend bo'lsa uni, bo'lmasa global socket orqali chaqiruv
  window.fpChallenge = function (userId, name) {
    closeProfileModal();
    if (typeof window.challengeFriend === "function") {
      window.challengeFriend(userId, name);
      return;
    }
    // Global: format modal yo'q bo'lsa standart formatda chaqiruv yuboramiz
    var sock = window.socket || window.globalSocket;
    var me = JSON.parse(localStorage.getItem("user") || "{}");
    if (sock && me.id) {
      sock.emit("challengeFriend", {
        fromUserId: me.id,
        fromName: (me.first_name || "") + " " + (me.last_name || ""),
        toUserId: userId,
        level: me.cefr_level || "A1",
        lengthKey: "standard",
      });
      if (typeof window.showToast === "function") window.showToast(name + " ga chaqiruv yuborildi");
    }
  };

  // Ochiq modaldagi asosiy tugmani almashtirish (real-time)
  function fpSwapMainButton(toState, userId, name) {
    if (String(fpCurrentUserId) !== String(userId)) return; // boshqa profil ochiq
    var actions = document.querySelector("#fpCard .fpc-actions");
    if (!actions) return;
    var firstBtn = actions.querySelector(".fpc-btn");
    if (!firstBtn) return;
    var safeName = (name || "").replace(/'/g, "\\'");
    if (toState === "friends") {
      firstBtn.outerHTML = '<button class="fpc-btn fpc-challenge" onclick="fpChallenge(' + userId + ', \'' + safeName + '\')"><i data-lucide="swords"></i> Challenge</button>';
    } else if (toState === "none") {
      firstBtn.outerHTML = '<button class="fpc-btn fpc-challenge" onclick="fpAddFriend(' + userId + ', \'' + safeName + '\', this)"><i data-lucide="user-plus"></i> Do\'stlashish</button>';
    }
    if (window.lucide) lucide.createIcons();
  }

  // Socket handlerlar (real-time tugma yangilanishi)
  function fpAttachSocket() {
    var sock = window.socket || window.globalSocket;
    if (!sock) { setTimeout(fpAttachSocket, 500); return; }

    // Do'st so'rovim qabul qilindi → Challenge tugmasi
    sock.on("requestResponded", function (data) {
      if (data && data.action === "accept") {
        fpSwapMainButton("friends", data.byUserId, data.byName);
      }
    });

    // Do'stlikdan o'chirildim → Do'stlashish tugmasi
    sock.on("friendRemoved", function (data) {
      if (data) fpSwapMainButton("none", data.byUserId, "");
    });
  }
  fpAttachSocket();

  function renderFpAbout(data) {
    var u = data.user || {};
    var favoriteMode = data.stats && data.stats.favorite_mode_label
      ? data.stats.favorite_mode_label
      : "Hali o'yin yo'q";
    var joined = "\u2014";
    if (u.created_at) {
      var d = new Date(u.created_at);
      var oylar = ["Yan", "Fev", "Mar", "Apr", "May", "Iyun", "Iyul", "Avg", "Sen", "Okt", "Noy", "Dek"];
      joined = oylar[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
    }
    document.getElementById("fpAbout").className = "fp-block";
    document.getElementById("fpAbout").innerHTML =
      '<div class="fp-block-title"><i data-lucide="user-circle"></i> About</div>' +
      '<div class="fp-about-rows">' +
        '<div class="fp-ar"><i data-lucide="building-2"></i><span class="fp-ak">School</span><span class="fp-av">' + (u.school || "\u2014") + '</span></div>' +
        '<div class="fp-ar"><i data-lucide="map-pin"></i><span class="fp-ak">Region</span><span class="fp-av">' + (u.region || "\u2014") + (u.district ? ", " + u.district : "") + '</span></div>' +
        '<div class="fp-ar"><i data-lucide="calendar"></i><span class="fp-ak">Joined</span><span class="fp-av">' + joined + '</span></div>' +
        '<div class="fp-ar"><i data-lucide="star"></i><span class="fp-ak">Favorite Mode</span><span class="fp-av soon-badge">' + fpEsc(favoriteMode) + '</span></div>' +
      '</div>';
    if (window.lucide) lucide.createIcons();
  }

  function renderFpAch() {
    document.getElementById("fpAch").className = "fp-block";
    document.getElementById("fpAch").innerHTML =
      '<div class="fp-block-title"><i data-lucide="award"></i> Achievements <span class="soon-badge" style="margin-left:auto;">Tez kunda</span></div>' +
      '<div class="fp-ach-grid">' +
        '<div class="fp-ach-item"><div class="fp-ach-ic"><i data-lucide="swords"></i></div><div class="fp-ach-n">Warrior</div></div>' +
        '<div class="fp-ach-item"><div class="fp-ach-ic"><i data-lucide="flame"></i></div><div class="fp-ach-n">Streak Master</div></div>' +
        '<div class="fp-ach-item"><div class="fp-ach-ic"><i data-lucide="trophy"></i></div><div class="fp-ach-n">Top Performer</div></div>' +
        '<div class="fp-ach-item"><div class="fp-ach-ic"><i data-lucide="book-open"></i></div><div class="fp-ach-n">Word Master</div></div>' +
        '<div class="fp-ach-item"><div class="fp-ach-ic"><i data-lucide="users"></i></div><div class="fp-ach-n">Social Player</div></div>' +
      '</div>';
    if (window.lucide) lucide.createIcons();
  }

  function renderFpStats(data) {
    var u = data.user || {};
    var s = data.stats || {};
    var lg = fpLeague(u.rating || 1000);
    document.getElementById("fpStats").className = "fp-block";
    document.getElementById("fpStats").innerHTML =
      '<div class="fp-block-title"><i data-lucide="bar-chart-3"></i> Battle Stats</div>' +
      '<div class="fp-bs-rows">' +
        '<div class="fp-bs-row"><span class="fp-bs-k">Wins</span><span class="fp-bs-v" style="color:var(--green);">' + (s.wins || 0) + '</span></div>' +
        '<div class="fp-bs-row"><span class="fp-bs-k">Losses</span><span class="fp-bs-v" style="color:var(--red);">' + (s.loses || 0) + '</span></div>' +
        '<div class="fp-bs-divider"></div>' +
        '<div class="fp-bs-row"><span class="fp-bs-k">Highest Rank</span><span class="fp-bs-v" style="color:var(--cyan);font-size:15px;">' + lg.icon + ' ' + lg.name + '</span></div>' +
        '<div class="fp-bs-row"><span class="fp-bs-k">Longest Win Streak</span><span class="fp-bs-v">' + (u.longest_streak || 0) + '</span></div>' +
        '<div class="fp-bs-row"><span class="fp-bs-k">Win Rate</span><span class="fp-bs-v">' + (s.win_rate || 0) + '%</span></div>' +
      '</div>';
    if (window.lucide) lucide.createIcons();
  }

  async function renderFpHistory(userId) {
    document.getElementById("fpHistory").className = "fp-block";
    document.getElementById("fpHistory").innerHTML =
      '<div class="fp-block-title"><i data-lucide="swords"></i> Recent Battle History</div>' +
      '<div id="fpHistList"><div style="text-align:center;color:var(--text-faint);padding:20px;font-size:13px;">Yuklanmoqda...</div></div>';
    try {
      var res = await authFetch("/history/" + userId);
      var data = await res.json();
      var battles = data.battles || data.history || [];
      var list = document.getElementById("fpHistList");
      if (battles.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:var(--text-faint);padding:20px;font-size:13px;">Hali jang qilmagan.</div>';
        return;
      }
      list.innerHTML = '<div class="fp-hist-head"><span>Opponent</span><span>Result</span><span>Score</span></div>';
      battles.slice(0, 5).forEach(function (b) {
        var isWin = b.outcome === "win";
        var isDraw = b.outcome === "draw";
        var oppName = b.opponent_name || "Raqib";
        var resCls = isWin ? "var(--green)" : (isDraw ? "var(--text-dim)" : "var(--red)");
        var resTxt = isWin ? "Win" : (isDraw ? "Draw" : "Loss");
        list.innerHTML +=
          '<div class="fp-hist-row">' +
            '<div class="fp-hist-opp"><div class="fp-hist-ava">' + oppName.charAt(0).toUpperCase() + '</div><span>' + oppName + '</span></div>' +
            '<span style="color:' + resCls + ';font-weight:700;">' + resTxt + '</span>' +
            '<span>' + b.my_score + ' - ' + b.opponent_score + '</span>' +
          '</div>';
      });
    } catch (err) {
      document.getElementById("fpHistList").innerHTML = '<div style="text-align:center;color:var(--text-faint);padding:20px;font-size:13px;">Yuklab bo\'lmadi</div>';
    }
  }

  function renderFpSide(data) {
    var u = data.user || {};
    var rating = u.rating || 1000;
    var lg = fpLeague(rating);

    var leagues = [
      { name: "Bronze", min: 0, max: 999 }, { name: "Silver", min: 1000, max: 1199 },
      { name: "Gold", min: 1200, max: 1399 }, { name: "Platinum", min: 1400, max: 1599 },
      { name: "Diamond", min: 1600, max: 1799 }, { name: "Master", min: 1800, max: 1999 },
      { name: "Grandmaster", min: 2000, max: 99999 },
    ];
    var idx = 0;
    leagues.forEach(function (l, i) { if (rating >= l.min && rating <= l.max) idx = i; });
    var curL = leagues[idx], nextL = leagues[idx + 1];
    var prog = 100, rpText = "Eng yuqori daraja!", nextText = "Maksimal";
    if (nextL) {
      prog = Math.round(((rating - curL.min) / (curL.max - curL.min + 1)) * 100);
      rpText = (rating - curL.min) + " / " + (curL.max - curL.min + 1) + " RP";
      nextText = "Next: " + nextL.name;
    }
    document.getElementById("fpRank").className = "fp-block";
    document.getElementById("fpRank").innerHTML =
      '<div class="fp-block-title"><i data-lucide="shield"></i> Current Rank</div>' +
      '<div class="fp-rank-medal">' + lg.icon + '</div>' +
      '<div class="fp-rank-name">' + lg.name + '</div>' +
      '<div class="fp-rank-bar"><div class="fp-rank-fill" style="width:' + prog + '%;"></div></div>' +
      '<div class="fp-rank-rp">' + rpText + '</div>' +
      '<div class="fp-rank-next">' + nextText + '</div>';

    var cefrOrder = ["A1", "A2", "B1", "B2", "C1", "C2"];
    var cur = u.cefr_level || "A1";
    var cIdx = cefrOrder.indexOf(cur);
    var cProg = Math.round(((cIdx + 1) / cefrOrder.length) * 100);
    var nextCefr = cIdx < 5 ? cefrOrder[cIdx + 1] : "C2";
    document.getElementById("fpCefr").className = "fp-block";
    document.getElementById("fpCefr").innerHTML =
      '<div class="fp-block-title"><i data-lucide="book-open"></i> CEFR Progression</div>' +
      '<div class="fp-cefr-top"><b>' + cur + '</b><span>' + nextCefr + '</span></div>' +
      '<div class="fp-rank-bar"><div class="fp-cefr-fill" style="width:' + cProg + '%;"></div></div>' +
      '<div class="fp-cefr-msg">' + cProg + '% \u2014 Zo\'r ketyapsiz!</div>';

    var mutualFriends = Array.isArray(data.mutual_friends) ? data.mutual_friends : [];
    var mutualCount = Number(data.mutual_count) || 0;
    var mutualHtml = '<div class="fp-block-title"><i data-lucide="users"></i> Mutual Friends';
    if (mutualCount > 0) {
      mutualHtml += '<span class="fp-mutual-count">' + mutualCount + '</span>';
    }
    mutualHtml += '</div>';

    if (mutualFriends.length === 0) {
      mutualHtml += '<div class="fp-mutual-empty">Umumiy do\'stlar yo\'q</div>';
    } else {
      mutualHtml += '<div class="fp-mutual-list">';
      mutualFriends.forEach(function (friend) {
        var friendId = Number.parseInt(friend.id, 10);
        if (!Number.isSafeInteger(friendId) || friendId <= 0) return;
        var friendName = ((friend.first_name || "") + " " + (friend.last_name || "")).trim() || "Foydalanuvchi";
        var friendRating = Number(friend.rating);
        if (!Number.isFinite(friendRating)) friendRating = 1000;
        mutualHtml +=
          '<button type="button" class="fp-mutual-item" onclick="openProfileModal(' + friendId + ')">' +
            '<span class="fp-mutual-ava">' + avatarHTML(friend.first_name, friend.profile_picture) + '</span>' +
            '<span class="fp-mutual-name">' + fpEsc(friendName) + '</span>' +
            '<span class="fp-mutual-rp">' + friendRating + ' RP</span>' +
          '</button>';
      });
      mutualHtml += '</div>';
      if (mutualCount > mutualFriends.length) {
        mutualHtml += '<div class="fp-mutual-more">+' + (mutualCount - mutualFriends.length) + ' ko\'proq</div>';
      }
    }

    document.getElementById("fpMutual").className = "fp-block";
    document.getElementById("fpMutual").innerHTML = mutualHtml;

    if (window.lucide) lucide.createIcons();
  }
})();
