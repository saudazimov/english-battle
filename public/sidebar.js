// ===== UMUMIY SIDEBAR =====
// Har sahifada chaqiriladi: renderSidebar("battle") — qaysi menyu aktiv

function renderSidebar(activePage) {
  // School_admin himoyasi: o'quvchi sahifalariga kira olmaydi → o'z paneliga
  try {
    const _guard = JSON.parse(localStorage.getItem("user") || "{}");
    if (_guard.role === "school_admin") {
      // School_admin ko'rishi mumkin bo'lgan sahifalar
      const allowed = ["home", "tournaments", "profile"];
      if (!allowed.includes(activePage)) {
        window.location.href = "/school-admin.html";
        return "";
      }
    }
  } catch (e) {}
  // Brand markaziy config'dan (brand.js). Yuklanmagan bo'lsa — zaxira qiymat.
  const B = window.BRAND || { nameLine1: "KNOWLEDGE", nameLine2: "ARENA", sloganEn: "Learn. Battle. Rise." };

  // School_admin uchun ALOHIDA menyu (o'ynamaydi — faqat boshqaruv)
  let _saUser = {};
  try { _saUser = JSON.parse(localStorage.getItem("user") || "{}"); } catch (e) {}
  if (_saUser.role === "school_admin") {
    const saMenu = [
      { id: "home", icon: "layout-dashboard", label: "Bosh sahifa", href: "/school-admin.html", ready: true },
      { id: "tournaments", icon: "trophy", label: "Turnirlar", href: "/school-tournaments.html", ready: true },
      { id: "profile", icon: "user", label: "Profil", href: "/school-admin-profile.html", ready: true },
    ];
    let saNavHtml = "";
    saMenu.forEach(m => {
      const active = m.id === activePage ? " active" : "";
      saNavHtml += '<a class="nav-item' + active + '" href="' + m.href + '">' +
        '<i data-lucide="' + m.icon + '" class="ic"></i> ' + m.label + '</a>';
    });
    saNavHtml += '<a class="nav-item" onclick="sidebarLogout()" style="cursor:pointer;">' +
      '<i data-lucide="log-out" class="ic"></i> Chiqish</a>';

    const B2 = window.BRAND || { nameLine1: "KNOWLEDGE", nameLine2: "ARENA", sloganEn: "Learn. Battle. Rise." };
    const saSidebar =
      '<div class="logo-box"><div class="crest">' +
        '<span class="e">' + B2.nameLine1 + '</span><br><span class="b">' + B2.nameLine2 + '</span>' +
        '<div style="font-size:11px;font-weight:500;color:var(--text-faint);letter-spacing:0.5px;margin-top:4px;">Maktab paneli</div>' +
      '</div></div>' +
      '<nav class="nav">' + saNavHtml + '</nav>' +
      '<div class="sidebar-foot"><div class="mascot-box">' +
        '<div style="font-size:34px;">🏫</div>' +
        '<div style="margin-top:6px;">Maktabingiz nomidan turnirlarda g\'alaba qozoning!</div>' +
        '<a href="/school-tournaments.html" style="display:block;margin-top:10px;padding:9px;background:linear-gradient(95deg,var(--accent),var(--accent-2));color:#fff;border-radius:10px;font-size:12.5px;font-weight:700;text-decoration:none;">Turnirlarga o\'tish</a>' +
      '</div></div>';

    const sb = document.querySelector(".sidebar");
    if (sb) sb.innerHTML = saSidebar;
    if (window.lucide) lucide.createIcons();
    return;
  }

  // ready:false => sahifa hali tayyor emas (coming soon), broken link bo'lmaydi
  const menu = [
    { id: "battle", icon: "swords", label: "Battle", href: "/lobby.html", ready: true },
    { id: "practice", icon: "dumbbell", label: "Practice", href: "/practice.html", ready: false },
    { id: "myclasses", icon: "book-open", label: "Sinflarim", href: "/student-classes.html", ready: true },
    { id: "exam", icon: "graduation-cap", label: "Imtihon", href: "/exam.html", ready: true },
    { id: "ranking", icon: "trophy", label: "Ranking", href: "/leaderboard.html", ready: true },
    { id: "friends", icon: "users", label: "Do'stlar", href: "/friends.html", ready: true },
    { id: "history", icon: "scroll-text", label: "Tarix", href: "/history.html", ready: true },
    { id: "progress", icon: "trending-up", label: "Progress", href: "/progress.html", ready: false },
    { id: "profile", icon: "user", label: "Profile", href: "/profile.html", ready: true },
  ];

  // School admin uchun qo'shimcha: Turnirlar (faqat school_admin ko'radi)
  try {
    const _su = JSON.parse(localStorage.getItem("user") || "{}");
    if (_su.role === "school_admin") {
      // "Ranking" dan keyin joylashtiramiz
      const insertAt = menu.findIndex(m => m.id === "ranking");
      const tItem = { id: "tournaments", icon: "trophy", label: "Turnirlar", href: "/school-tournaments.html", ready: true };
      if (insertAt >= 0) menu.splice(insertAt + 1, 0, tItem);
      else menu.push(tItem);
    }
  } catch (e) {}

  let navHtml = "";
  menu.forEach(m => {
    const active = m.id === activePage ? " active" : "";
    if (m.ready) {
      navHtml += '<a class="nav-item' + active + '" href="' + m.href + '">' +
        '<i data-lucide="' + m.icon + '" class="ic"></i> ' + m.label + '</a>';
    } else {
      // Tayyor emas — coming soon (broken link emas)
      navHtml += '<a class="nav-item" onclick="sidebarComingSoon(\'' + m.label + '\')" style="cursor:pointer;">' +
        '<i data-lucide="' + m.icon + '" class="ic"></i> ' + m.label +
        '<span style="margin-left:auto;font-size:9px;font-weight:700;color:var(--gold);background:var(--panel);padding:2px 6px;border-radius:999px;">tez orada</span></a>';
    }
  });

  // Chiqish
  navHtml += '<a class="nav-item" onclick="sidebarLogout()" style="cursor:pointer;">' +
    '<i data-lucide="log-out" class="ic"></i> Chiqish</a>';

  const sidebarHtml =
    '<div class="logo-box"><div class="crest">' +
      '<span class="e">' + B.nameLine1 + '</span><br><span class="b">' + B.nameLine2 + '</span>' +
      '<div style="font-size:11px;font-weight:500;color:var(--text-faint);letter-spacing:0.5px;margin-top:4px;">' + (B.sloganEn || "") + '</div>' +
    '</div></div>' +
    '<nav class="nav">' + navHtml + '</nav>' +
    '<div class="sidebar-foot"><div class="mascot-box">' +
      '<div style="font-size:34px;">🏆</div>' +
      '<div style="margin-top:6px;">Battle va o\'rganish orqali eng yuqori o\'ringa chiqing!</div>' +
      '<a href="/leaderboard.html" style="display:block;margin-top:10px;padding:9px;background:linear-gradient(95deg,var(--accent),var(--accent-2));color:#fff;border-radius:10px;font-size:12.5px;font-weight:700;text-decoration:none;">Rankingga o\'tish</a>' +
    '</div></div>';

  const sidebar = document.querySelector(".sidebar");
  if (sidebar) {
    sidebar.innerHTML = sidebarHtml;
    if (window.lucide) lucide.createIcons();
  }
}

// Tayyor bo'lmagan sahifa bosilganda — coming soon toast/modal
function sidebarComingSoon(name) {
  if (typeof showToast === "function") { showToast((name ? name + ": " : "") + "tez orada qo'shiladi"); return; }
  // showToast yo'q bo'lsa — kichik vaqtinchalik xabar
  let t = document.getElementById("scToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "scToast";
    t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#10172a;border:1px solid rgba(120,150,255,0.4);border-radius:12px;padding:13px 20px;font-size:14px;color:#e6ecff;box-shadow:0 12px 40px rgba(0,0,0,0.5);z-index:3000;transition:opacity 0.2s;";
    document.body.appendChild(t);
  }
  t.textContent = (name ? name + ": " : "") + "tez orada qo'shiladi";
  t.style.opacity = "1";
  clearTimeout(window._scTimer);
  window._scTimer = setTimeout(function(){ t.style.opacity = "0"; }, 2200);
}

// Chiqish tugmasi bosilganda — to'g'ridan-to'g'ri chiqarmaymiz, modal ko'rsatamiz
function sidebarLogout() {
  showLogoutModal();
}

// Tasdiq modalini ko'rsatish (agar hali sahifada bo'lmasa, yaratamiz)
function showLogoutModal() {
  let overlay = document.getElementById("logoutModal");

  // Modal hali yaratilmagan bo'lsa — bir marta yaratamiz
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "logoutModal";
    overlay.className = "modal-overlay";
    overlay.innerHTML =
      '<div class="modal-box">' +
        '<div class="modal-icon"><i data-lucide="log-out"></i></div>' +
        '<div class="modal-title">Hisobdan chiqmoqchimisiz?</div>' +
        '<div class="modal-text">Qaytadan kirish uchun login va parolingiz kerak bo\'ladi.</div>' +
        '<div class="modal-actions">' +
          '<button class="modal-btn modal-btn-cancel" onclick="closeLogoutModal()">Bekor qilish</button>' +
          '<button class="modal-btn modal-btn-confirm" onclick="doLogout()">Chiqish</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    // Tashqi qora joyga bosilsa ham yopilsin
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeLogoutModal();
    });

    if (window.lucide) lucide.createIcons();
  }

  overlay.classList.add("show");
}

// Modalni yopish (bekor qilish)
function closeLogoutModal() {
  const overlay = document.getElementById("logoutModal");
  if (overlay) overlay.classList.remove("show");
}

// Haqiqiy chiqish
function doLogout() {
  localStorage.removeItem("user");
  window.location.href = "/index.html";
}

// ===== GLOBAL SOCKET (online status uchun) =====
// Har sahifada socket.io ni yuklab, ulanadi va "men onlayn" deb xabar beradi
(function connectGlobalSocket() {
  const userData = localStorage.getItem("user");
  if (!userData) return;
  const user = JSON.parse(userData);

  function doConnect() {
    // Agar bu sahifada allaqachon socket bor bo'lsa (friends.html, battle.html), uni ishlatamiz
    if (window.socket) {
      window.socket.emit("registerUser", user.id);
      return;
    }
    if (typeof io === "undefined") return;
    window.globalSocket = io();
    window.globalSocket.on("connect", () => {
      window.globalSocket.emit("registerUser", user.id);
    });
  }

  // socket.io kutubxonasi bormi?
  if (typeof io !== "undefined") {
    doConnect();
  } else {
    // Yo'q bo'lsa - dinamik yuklash
    const s = document.createElement("script");
    s.src = "/socket.io/socket.io.js";
    s.onload = doConnect;
    document.head.appendChild(s);
  }
})();

// ===== UMUMIY AVATAR (rasm yoki harf) =====
// firstName — ism, picPath — rasm yo'li (yoki null)
// Rasm bor bo'lsa <img>, yo'q bo'lsa ismning birinchi harfi
function avatarHTML(firstName, picPath) {
  const letter = (firstName || "?").charAt(0).toUpperCase();
  if (picPath) {
    // Xavfsiz usul: position:absolute ISHLATILMAYDI (u butun sahifani egallashi mumkin).
    // object-fit:cover + to'liq o'lcham => konteynerni to'ldiradi, chekkada bo'shliq qolmaydi.
    return '<img src="' + picPath + '" alt="' + letter + '" ' +
      'style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" ' +
      'onerror="this.style.display=\'none\';this.parentNode.textContent=\'' + letter + '\';">';
  }
  return letter;
}

// ===== UMUMIY TOPBAR (hamma sahifada) =====
// Chaqirilishi: renderTopbar()  yoki  renderTopbar({ back: "/lobby.html" })
// opts.back — agar berilsa, chap tomonda "Orqaga" tugmasi chiqadi (havola bilan)
function renderTopbar(opts) {
  opts = opts || {};
  const host = document.querySelector(".topbar");
  if (!host) return; // bu sahifada topbar yo'q

  const u = JSON.parse(localStorage.getItem("user") || "{}");
  const level = Math.floor((u.xp || 0) / 100) + 1;
  const fullName = ((u.first_name || "") + " " + (u.last_name || "")).trim() || "O'yinchi";

  const backHtml = opts.back
    ? '<a class="tb-back" href="' + opts.back + '"><i data-lucide="arrow-left"></i> ' + (opts.backText || "Orqaga") + '</a>'
    : '';

  host.innerHTML =
    backHtml +
    '<div class="currency"><i data-lucide="coins" style="color:var(--gold);width:18px;height:18px;"></i> <span id="tbCoins">' + (u.coins || 0) + '</span> <span class="plus">+</span></div>' +
    '<div class="currency"><i data-lucide="gem" style="color:var(--cyan);width:18px;height:18px;"></i> <span id="tbGems">' + (u.gems || 0) + '</span> <span class="plus">+</span></div>' +
    '<div class="notif-wrap" id="notifWrap">' +
      '<div class="icon-btn" onclick="toggleNotif(event)" style="cursor:pointer;"><i data-lucide="bell"></i> <span class="badge" id="notifBadge" style="display:none">0</span></div>' +
      '<div class="notif-bar" id="notifBar">' +
        '<div class="notif-bar-head">' +
          '<span>Bildirishnomalar</span>' +
          '<div class="notif-head-actions">' +
            '<button class="notif-act-btn" id="notifClearBtn" onclick="clearAllNotifs(event)" title="Hammasini tozalash"><i data-lucide="trash-2"></i></button>' +
            '<i data-lucide="x" class="notif-close" onclick="closeNotif()"></i>' +
          '</div>' +
        '</div>' +
        '<div class="notif-list" id="notifList"></div>' +
      '</div>' +
    '</div>' +
    '<div class="user-chip" id="userChip" onclick="toggleUserMenu(event)">' +
      '<div class="ava" id="topAva">' + (fullName[0] || "?").toUpperCase() + '</div>' +
      '<div><div class="uname">' + fullName + '</div><div class="ulevel">Level <span>' + level + '</span></div></div>' +
      '<i data-lucide="chevron-down" class="chip-arrow"></i>' +
      '<div class="tb-dropdown">' +
        '<div class="tb-dd-item" onclick="event.stopPropagation();window.location.href=\'/profile.html\'"><i data-lucide="user"></i> Profil</div>' +
        '<div class="tb-dd-item" onclick="event.stopPropagation();tbSettingsSoon()"><i data-lucide="settings"></i> Sozlamalar</div>' +
        '<div class="tb-dd-sep"></div>' +
        '<div class="tb-dd-item danger" onclick="event.stopPropagation();sidebarLogout()"><i data-lucide="log-out"></i> Chiqish</div>' +
      '</div>' +
    '</div>';

  // Avatar (rasm yoki harf)
  const av = document.getElementById("topAva");
  if (av) av.innerHTML = avatarHTML(u.first_name, u.profile_picture);

  if (window.lucide) lucide.createIcons();

  // Bildirishnomalarni yuklash
  loadNotifs();

  // Foydalanuvchi ma'lumotini bazadan yangilash (markaziy sync)
  refreshUser();
}

// ===== MARKAZIY FOYDALANUVCHI SYNC (refreshUser) =====
// Har sahifada renderTopbar() ichida chaqiriladi.
// Bazadan eng yangi ma'lumotni olib, localStorage'ni yangilaydi.
// Bloklamaydi — sahifa darhol ochiladi, keyin yangilanadi.
async function refreshUser() {
  const u = JSON.parse(localStorage.getItem("user") || "{}");
  if (!u.id) return;

  try {
    const res = await authFetch("/profile/" + u.id);
    if (!res.ok) return; // xato bo'lsa — eski localStorage qoladi, sahifa buzilmaydi

    const data = await res.json();
    if (!data || !data.user) return;
    const fresh = data.user;

    // O'zgaruvchan maydonlarni bazadagi eng yangi qiymat bilan yangilaymiz
    // (faqat mavjud bo'lsa — undefined bilan ustiga yozib yubormaymiz)
    const fields = [
      "first_name", "last_name", "cefr_level", "rating", "xp", "coins",
      "current_streak", "longest_streak", "win_streak", "best_win_streak",
      "region", "district", "village", "school", "profile_picture",
    ];
    let changed = false;
    fields.forEach(function (k) {
      if (fresh[k] !== undefined && fresh[k] !== u[k]) {
        u[k] = fresh[k];
        changed = true;
      }
    });

    if (changed) {
      localStorage.setItem("user", JSON.stringify(u));
    }

    // Win rate ham foydali — alohida saqlaymiz (stats'dan)
    if (data.stats && typeof data.stats.win_rate === "number") {
      u.win_rate = data.stats.win_rate;
      localStorage.setItem("user", JSON.stringify(u));
    }

    // Sahifalarga xabar beramiz — xohlasa o'zini yangilab oladi
    try {
      window.dispatchEvent(new CustomEvent("userRefreshed", { detail: u }));
    } catch (e) {}

    // Topbar'dagi coins/gems/avatar'ni ham yangilab qo'yamiz (agar mavjud bo'lsa)
    var coinsEl = document.getElementById("tbCoins");
    if (coinsEl && u.coins != null) coinsEl.textContent = u.coins;
    var avaEl = document.getElementById("topAva");
    if (avaEl) avaEl.innerHTML = avatarHTML(u.first_name, u.profile_picture);

  } catch (err) {
    // Tarmoq xatosi — eski localStorage qoladi, hech narsa buzilmaydi
  }
}

// ===== BILDIRISHNOMALAR (NOTIFICATIONS) — barcha sahifada =====
let _notifData = [];
let _notifUnread = 0;

function _notifUser() { return JSON.parse(localStorage.getItem("user") || "{}"); }

function notifTimeAgo(iso) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "hozircha";
  if (diff < 3600) return Math.floor(diff / 60) + " daqiqa oldin";
  if (diff < 86400) return Math.floor(diff / 3600) + " soat oldin";
  if (diff < 604800) return Math.floor(diff / 86400) + " kun oldin";
  const d = new Date(iso);
  return d.getDate() + "." + (d.getMonth() + 1) + "." + d.getFullYear();
}

function notifIcon(type) {
  if (!type) return "bell";
  if (type.indexOf("friend") > -1) return "user-plus";
  if (type.indexOf("battle") > -1) return "swords";
  if (type.indexOf("class") > -1) return "book-open";
  if (type.indexOf("exam") > -1) return "graduation-cap";
  if (type.indexOf("rank") > -1 || type.indexOf("league") > -1) return "trophy";
  return "bell";
}

function notifLink(type) {
  if (!type) return null;
  if (type.indexOf("friend") > -1) return "/friends.html";
  if (type.indexOf("battle") > -1) return "/history.html";
  if (type.indexOf("class") > -1) return "/student-classes.html";
  if (type.indexOf("exam") > -1) return "/exam.html";
  if (type.indexOf("rank") > -1 || type.indexOf("league") > -1) return "/leaderboard.html";
  return null;
}

function updateNotifBadge() {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  if (_notifUnread > 0) {
    // O'qilmagan xabar bor — qizil + son
    badge.textContent = _notifUnread > 99 ? "99+" : _notifUnread;
    badge.classList.add("has-unread");
    badge.style.display = "grid";
  } else {
    // Hammasi o'qilgan — badge ko'rinmaydi
    badge.style.display = "none";
  }
}

function renderNotifList() {
  const list = document.getElementById("notifList");
  if (!list) return;
  if (!_notifData || _notifData.length === 0) {
    list.innerHTML =
      '<div class="notif-empty"><i data-lucide="bell-off"></i><div class="notif-empty-text">Hozircha yangi xabarlar yo\'q</div></div>';
    if (window.lucide) lucide.createIcons();
    return;
  }
  list.innerHTML = _notifData.map(n =>
    '<div class="notif-item ' + (n.is_read ? "" : "unread") + '" onclick="openNotif(' + n.id + ')">' +
      '<div class="notif-ic"><i data-lucide="' + notifIcon(n.type) + '"></i></div>' +
      '<div class="notif-body">' +
        '<div class="notif-msg">' + (n.message || "") + '</div>' +
        '<div class="notif-time">' + notifTimeAgo(n.created_at) + '</div>' +
      '</div>' +
      '<div class="notif-x" onclick="deleteNotif(event, ' + n.id + ')" title="O\'chirish"><i data-lucide="x"></i></div>' +
    '</div>'
  ).join("");
  if (window.lucide) lucide.createIcons();
}

async function loadNotifs() {
  const u = _notifUser();
  if (!u.id) return;
  try {
    const res = await authFetch("/notifications/" + u.id);
    const data = await res.json();
    _notifData = data.notifications || [];
    _notifUnread = data.unread || 0;
  } catch (err) { _notifData = []; _notifUnread = 0; }
  updateNotifBadge();
  renderNotifList();
}

// ===== REAL-TIME BILDIRISHNOMA (har sahifada, friends/battle ham) =====
// newFriendRequest socket eventini tinglaymiz — globalChallengeSystem'dan MUSTAQIL,
// shuning uchun friends.html va battle.html'da ham ishlaydi.
function attachNotifSocket() {
  const sock = window.socket || window.globalSocket;
  if (!sock) { setTimeout(attachNotifSocket, 500); return; } // socket tayyor bo'lguncha kutamiz

  // Ikki marta ulanib qolmaslik uchun himoya
  if (sock._notifBound) return;
  sock._notifBound = true;

  // Yangi do'st so'rovi keldi (B oladi)
  sock.on("newFriendRequest", function (data) {
    loadNotifs(); // badge + ro'yxat darhol yangilanadi (F5 kerak emas)
    showNotifToast((data && data.fromName ? data.fromName : "Kimdir") + " sizga do'st so'rovi yubordi");
  });

  // So'rovga javob keldi — qabul/rad (A oladi)
  sock.on("requestResponded", function (data) {
    loadNotifs(); // badge + panel darhol yangilanadi
    if (data && data.action === "accept") {
      showNotifToast((data.byName || "Kimdir") + " do'st so'rovingizni qabul qildi");
    }
    // Rad etilganda — toast ko'rsatmaymiz (bildirishnoma ham yaratilmaydi), jim qoladi
  });
}
attachNotifSocket();

// ===== REAL-TIME TOAST (o'ng yuqorida suzib chiqadi) =====
function showNotifToast(text) {
  let toast = document.getElementById("notifToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "notifToast";
    toast.className = "notif-toast";
    document.body.appendChild(toast);
  }
  toast.innerHTML =
    '<div class="notif-toast-ic"><i data-lucide="user-plus"></i></div>' +
    '<div class="notif-toast-text">' + text + '</div>';
  if (window.lucide) lucide.createIcons();

  toast.classList.add("show");
  clearTimeout(window._notifToastTimer);
  window._notifToastTimer = setTimeout(function () {
    toast.classList.remove("show");
  }, 4000);
}

function toggleNotif(e) {
  if (e) e.stopPropagation();
  const wrap = document.getElementById("notifWrap");
  if (!wrap) return;
  if (wrap.classList.contains("open")) { closeNotif(); return; }
  wrap.classList.add("open");
  renderNotifList();
  markAllNotifsRead();
}

// Panel ochilganda — hammasini o'qilgan deb belgilaymiz
async function markAllNotifsRead() {
  if (_notifUnread === 0) return; // o'qilmagan yo'q bo'lsa — bekorга so'rov yubormaymiz
  const u = _notifUser();
  if (!u.id) return;
  // Darhol UI'da yo'qotamiz (optimistik), keyin serverга yuboramiz
  _notifUnread = 0;
  updateNotifBadge();
  _notifData.forEach(n => { n.is_read = true; });
  try {
    await authFetch("/notifications/read/" + u.id, { method: "POST" });
  } catch (err) {}
}

function closeNotif() {
  const wrap = document.getElementById("notifWrap");
  if (wrap) wrap.classList.remove("open");
  _resetClearBtn(); // yopilганда tasdiq holatини bekor qilamiz
}

function openNotif(id) {
  const n = _notifData.find(x => x.id === id);
  if (!n) return;
  const link = notifLink(n.type);
  if (link) window.location.href = link;
}

// Barcha xabarlarni tozalash (inline tasdiq bilan)
let _notifClearArmed = false;
async function clearAllNotifs(e) {
  if (e) e.stopPropagation();
  if (!_notifData || _notifData.length === 0) return; // bo'sh bo'lsa — hech narsa

  const btn = document.getElementById("notifClearBtn");

  // 1-bosish: tasdiq so'raymiz (tugma qizil "Tozalashni tasdiqlang" bo'ladi)
  if (!_notifClearArmed) {
    _notifClearArmed = true;
    if (btn) {
      btn.classList.add("armed");
      btn.innerHTML = '<i data-lucide="check"></i>';
      btn.title = "Tasdiqlash uchun yana bosing";
      if (window.lucide) lucide.createIcons();
    }
    // 3 soniyada bekor bo'ladi (foydalanuvchi fikridan qaytsa)
    setTimeout(() => { _resetClearBtn(); }, 3000);
    return;
  }

  // 2-bosish: rostdan tozalaymiz
  _resetClearBtn();
  const u = _notifUser();
  if (!u.id) return;

  // Optimistik — darhol UI'da bo'shatamiz
  _notifData = [];
  _notifUnread = 0;
  updateNotifBadge();
  renderNotifList();

  try {
    await authFetch("/notifications/clear/" + u.id, { method: "POST" });
  } catch (err) {}
}

function _resetClearBtn() {
  _notifClearArmed = false;
  const btn = document.getElementById("notifClearBtn");
  if (btn) {
    btn.classList.remove("armed");
    btn.innerHTML = '<i data-lucide="trash-2"></i>';
    btn.title = "Hammasini tozalash";
    if (window.lucide) lucide.createIcons();
  }
}

// Profil dropdown ochish/yopish (topbar user-chip)
function toggleUserMenu(e) {
  if (e) e.stopPropagation();
  const chip = document.getElementById("userChip");
  if (!chip) return;
  chip.classList.toggle("open");
  // Notif bar ochiq bo'lsa yopamiz
  closeNotif();
}
function tbSettingsSoon() {
  if (typeof sidebarComingSoon === "function") sidebarComingSoon("Sozlamalar");
}

// Tashqariga bosilsa bar yopiladi
document.addEventListener("click", function (e) {
  const wrap = document.getElementById("notifWrap");
  if (wrap && wrap.classList.contains("open") && !wrap.contains(e.target)) {
    closeNotif();
  }
  // Profil dropdown ham tashqariga bosilsa yopiladi
  const chip = document.getElementById("userChip");
  if (chip && chip.classList.contains("open") && !chip.contains(e.target)) {
    chip.classList.remove("open");
  }
});

// ===== GLOBAL DO'ST CHAQIRUVI (har sahifada ishlaydi) =====
// A odam challenge bosganda, B qaysi sahifada bo'lsa ham so'rov modali ko'rinadi.
(function globalChallengeSystem() {
  const userData = localStorage.getItem("user");
  if (!userData) return;
  const me = JSON.parse(userData);

  // Battle sahifasida (o'yin paytida) chaqiruv kerak emas — u o'z socketini ishlatadi
  const path = window.location.pathname;
  if (path.indexOf("battle.html") !== -1 || path.indexOf("friends.html") !== -1) return;

  let incoming = null;

  // Modal CSS (bir marta)
  if (!document.getElementById("gChallengeStyle")) {
    const st = document.createElement("style");
    st.id = "gChallengeStyle";
    st.textContent =
      '.gch-overlay{position:fixed;inset:0;z-index:9000;background:rgba(3,6,15,0.78);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:20px;}' +
      '.gch-overlay.show{display:flex;}' +
      '.gch-box{background:linear-gradient(180deg,#0e1428,#0b1020);border:1px solid rgba(91,140,255,0.4);border-radius:20px;padding:32px 28px;max-width:420px;width:100%;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,0.6),0 0 40px rgba(91,140,255,0.15);animation:gchPop 0.25s ease;}' +
      '@keyframes gchPop{from{opacity:0;transform:scale(0.92) translateY(10px);}to{opacity:1;transform:scale(1) translateY(0);}}' +
      '.gch-ava{width:74px;height:74px;border-radius:50%;overflow:hidden;position:relative;margin:0 auto 16px;background:linear-gradient(135deg,#5b8cff,#a855f7);display:grid;place-items:center;font-size:30px;font-weight:800;color:#fff;border:2px solid rgba(91,140,255,0.5);}' +
      '.gch-ava img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;}' +
      '.gch-title{font-size:21px;font-weight:800;color:#e6ecff;margin-bottom:8px;}' +
      '.gch-sub{font-size:14.5px;color:#9aa7d9;line-height:1.5;margin-bottom:24px;}' +
      '.gch-fmt{display:inline-block;font-size:13px;font-weight:700;color:#5b8cff;background:rgba(91,140,255,0.12);border:1px solid rgba(91,140,255,0.3);border-radius:8px;padding:5px 12px;margin-bottom:22px;}' +
      '.gch-actions{display:flex;gap:12px;}' +
      '.gch-btn{flex:1;height:48px;border-radius:12px;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;border:none;transition:transform 0.1s,box-shadow 0.15s,background 0.15s;}' +
      '.gch-btn:active{transform:scale(0.97);}' +
      '.gch-accept{background:linear-gradient(135deg,#2563eb,#9333ea);color:#fff;box-shadow:0 4px 16px rgba(91,140,255,0.3);}' +
      '.gch-accept:hover{box-shadow:0 4px 22px rgba(91,140,255,0.5);}' +
      '.gch-decline{background:rgba(255,255,255,0.08);color:#e6ecff;border:1px solid rgba(255,90,110,0.4);}' +
      '.gch-decline:hover{background:rgba(255,90,110,0.15);}';
    document.head.appendChild(st);
  }

  // Modal HTML (bir marta)
  if (!document.getElementById("gChallengeModal")) {
    const ov = document.createElement("div");
    ov.className = "gch-overlay";
    ov.id = "gChallengeModal";
    ov.innerHTML =
      '<div class="gch-box">' +
        '<div class="gch-ava" id="gchAva">?</div>' +
        '<div class="gch-title" id="gchTitle">Jang chaqiruvi</div>' +
        '<div class="gch-sub" id="gchSub"></div>' +
        '<div class="gch-fmt" id="gchFmt"></div>' +
        '<div class="gch-actions">' +
          '<button class="gch-btn gch-decline" id="gchDecline">Rad etish</button>' +
          '<button class="gch-btn gch-accept" id="gchAccept">Qabul qilish</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    document.getElementById("gchAccept").onclick = function () { gchRespond(true); };
    document.getElementById("gchDecline").onclick = function () { gchRespond(false); };
  }

  const fmtNames = { quick: "Tezkor · 10 savol", standard: "Standart · 20 savol", extended: "Uzaytirilgan · 30 savol", marathon: "Marafon · 40 savol" };

  function showChallengeModal(data) {
    incoming = data;
    document.getElementById("gchAva").innerHTML = avatarHTML(data.fromName, data.fromPic || null);
    document.getElementById("gchTitle").textContent = "Jang chaqiruvi!";
    document.getElementById("gchSub").innerHTML = "<b>" + escapeText(data.fromName) + "</b> sizni jangga chaqirmoqda";
    document.getElementById("gchFmt").textContent = fmtNames[data.lengthKey] || fmtNames.standard;
    document.getElementById("gChallengeModal").classList.add("show");
  }

  function hideChallengeModal() {
    document.getElementById("gChallengeModal").classList.remove("show");
  }

  function gchRespond(accepted) {
    hideChallengeModal();
    if (!incoming) return;
    const sock = window.socket || window.globalSocket;
    if (!sock) return;
    sock.emit("challengeResponse", {
      accepted: accepted,
      fromSocketId: incoming.fromSocketId,
      fromUserId: incoming.fromUserId,
      fromName: incoming.fromName,
      myUserId: me.id,
      myName: (me.first_name || "") + " " + (me.last_name || ""),
      level: incoming.level,
      lengthKey: incoming.lengthKey || "standard",
    });
    incoming = null;
  }

  function escapeText(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Socket handlerlarni ulaymiz (socket tayyor bo'lganda)
  function attachHandlers() {
    const sock = window.socket || window.globalSocket;
    if (!sock) { setTimeout(attachHandlers, 500); return; }

    sock.on("challengeReceived", function (data) {
      showChallengeModal(data);
    });

    // Chaqiruvchi bekor qildi
    sock.on("challengeCancelled", function (data) {
      if (incoming && String(incoming.fromUserId) === String(data.fromUserId)) {
        incoming = null;
        hideChallengeModal();
      }
    });

    // Qabul qilindi — battle.html'ga o'tamiz (found ekran + countdown)
    sock.on("matchFound", function (data) {
      try {
        sessionStorage.setItem("battleData", JSON.stringify(data));
        if (data.lengthKey) sessionStorage.setItem("battleIntent", JSON.stringify({ mode: "friend", lengthKey: data.lengthKey, ts: Date.now() }));
      } catch (e) {}
      window.location.href = "/battle.html?room=" + encodeURIComponent(data.roomId);
    });
  }
  attachHandlers();
})();