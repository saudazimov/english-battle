// ===== UMUMIY SIDEBAR =====
// Har sahifada chaqiriladi: renderSidebar("battle") — qaysi menyu aktiv

function renderSidebar(activePage) {
  const menu = [
    { id: "battle", icon: "swords", label: "Battle", href: "/lobby.html" },
    { id: "ranking", icon: "trophy", label: "Ranking", href: "/leaderboard.html" },
    { id: "schools", icon: "building-2", label: "Maktablar", href: "/rankings.html" },
    { id: "friends", icon: "users", label: "Friends", href: "/friends.html" },
    { id: "exam", icon: "graduation-cap", label: "Imtihon", href: "/exam.html" },
    { id: "history", icon: "scroll-text", label: "Tarix", href: "/history.html" },
    { id: "profile", icon: "user", label: "Profile", href: "/profile.html" },
  ];

  let navHtml = "";
  menu.forEach(m => {
    const active = m.id === activePage ? " active" : "";
    navHtml += '<a class="nav-item' + active + '" href="' + m.href + '">' +
      '<i data-lucide="' + m.icon + '" class="ic"></i> ' + m.label + '</a>';
  });

  // Chiqish
  navHtml += '<a class="nav-item" onclick="sidebarLogout()" style="cursor:pointer;">' +
    '<i data-lucide="log-out" class="ic"></i> Chiqish</a>';

  const sidebarHtml =
    '<div class="logo-box"><div class="crest"><span class="e">ENGLISH</span><br><span class="b">BATTLE</span></div></div>' +
    '<nav class="nav">' + navHtml + '</nav>' +
    '<div class="sidebar-foot"><div class="mascot-box">' +
      '<div style="font-size:34px;">🎮</div>' +
      '<div style="margin-top:6px;">Let\'s battle and improve together!</div>' +
    '</div></div>';

  const sidebar = document.querySelector(".sidebar");
  if (sidebar) {
    sidebar.innerHTML = sidebarHtml;
    if (window.lucide) lucide.createIcons();
  }
}

function sidebarLogout() {
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
    return '<img src="' + picPath + '" alt="' + letter + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">';
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