// ===== UMUMIY SIDEBAR =====
// Har sahifada chaqiriladi: renderSidebar("battle") — qaysi menyu aktiv

function renderSidebar(activePage) {
  // Brand markaziy config'dan (brand.js). Yuklanmagan bo'lsa — zaxira qiymat.
  const B = window.BRAND || { nameLine1: "KNOWLEDGE", nameLine2: "ARENA", sloganEn: "Learn. Battle. Rise." };

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
        '<div class="notif-bar-head"><span>Bildirishnomalar</span><i data-lucide="x" class="notif-close" onclick="closeNotif()"></i></div>' +
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
}

// ===== BILDIRISHNOMALAR (NOTIFICATIONS) — barcha sahifada =====
let _notifData = [];

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
  const total = _notifData.length;
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  if (total > 0) {
    // Xabar bor — qizil + son
    badge.textContent = total;
    badge.classList.add("has-unread");
    badge.style.display = "grid";
  } else {
    // Xabar yo'q — badge umuman ko'rinmaydi (yashil 0 ham yo'q)
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
  } catch (err) { _notifData = []; }
  updateNotifBadge();
  renderNotifList();
}

function toggleNotif(e) {
  if (e) e.stopPropagation();
  const wrap = document.getElementById("notifWrap");
  if (!wrap) return;
  if (wrap.classList.contains("open")) { closeNotif(); return; }
  wrap.classList.add("open");
  renderNotifList();
}
function closeNotif() {
  const wrap = document.getElementById("notifWrap");
  if (wrap) wrap.classList.remove("open");
}

function openNotif(id) {
  const n = _notifData.find(x => x.id === id);
  if (!n) return;
  const link = notifLink(n.type);
  if (link) window.location.href = link;
}

async function deleteNotif(e, id) {
  e.stopPropagation();
  try {
    const res = await authFetch("/notifications/" + id, { method: "DELETE" });
    if (res.ok) {
      _notifData = _notifData.filter(n => n.id !== id);
      updateNotifBadge();
      renderNotifList();
    }
  } catch (err) {}
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