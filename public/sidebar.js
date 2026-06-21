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

// ===== TOPBAR AVATAR (hamma sahifada) =====
document.addEventListener("DOMContentLoaded", function () {
  try {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    const html = avatarHTML(u.first_name, u.profile_picture);
    const av1 = document.getElementById("topAva");
    const av2 = document.getElementById("userAva");
    if (av1) av1.innerHTML = html;
    if (av2) av2.innerHTML = html;
  } catch (e) {}
});