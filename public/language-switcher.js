(function () {
  "use strict";

  var languages = {
    uz: { code: "UZ", name: "O‘zbekcha" },
    en: { code: "EN", name: "English" },
    ru: { code: "RU", name: "Русский" }
  };

  function flagSvg(language) {
    if (language === "uz") {
      return '<svg class="ilm-language-flag" viewBox="0 0 32 22" aria-hidden="true"><rect width="32" height="22" rx="3" fill="#fff"/><path d="M0 0h32v7H0z" fill="#1eb6d9"/><path d="M0 8h32v6H0z" fill="#fff"/><path d="M0 15h32v7H0z" fill="#24a84a"/><path d="M0 7h32v1H0zM0 14h32v1H0z" fill="#ef3340"/><path d="M7.2 2.1a2.2 2.2 0 1 0 0 3.8 2.8 2.8 0 1 1 0-3.8z" fill="#fff"/><g fill="#fff"><circle cx="11.5" cy="2.6" r=".45"/><circle cx="13.5" cy="3.4" r=".45"/><circle cx="15.5" cy="2.6" r=".45"/><circle cx="11.5" cy="4.8" r=".45"/><circle cx="13.5" cy="5.6" r=".45"/><circle cx="15.5" cy="4.8" r=".45"/></g></svg>';
    }
    if (language === "en") {
      return '<svg class="ilm-language-flag" viewBox="0 0 32 22" aria-hidden="true"><rect width="32" height="22" rx="3" fill="#173f8a"/><path d="M0 0l32 22M32 0L0 22" stroke="#fff" stroke-width="4"/><path d="M0 0l32 22M32 0L0 22" stroke="#d4213d" stroke-width="1.7"/><path d="M16 0v22M0 11h32" stroke="#fff" stroke-width="6"/><path d="M16 0v22M0 11h32" stroke="#d4213d" stroke-width="3.2"/></svg>';
    }
    return '<svg class="ilm-language-flag" viewBox="0 0 32 22" aria-hidden="true"><rect width="32" height="22" rx="3" fill="#fff"/><path d="M0 7.33h32v7.34H0z" fill="#1c57a7"/><path d="M0 14.67h32V22H0z" fill="#d52b1e"/></svg>';
  }

  function ensureStyles() {
    if (document.getElementById("ilmLanguageSwitcherStyles")) return;
    var style = document.createElement("style");
    style.id = "ilmLanguageSwitcherStyles";
    style.textContent =
      ".ilm-language-switcher{position:relative;display:inline-flex;font-family:inherit;z-index:80}" +
      ".ilm-language-native{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important;opacity:0!important;pointer-events:none!important}" +
      ".ilm-language-trigger{height:42px;min-width:92px;display:flex;align-items:center;gap:9px;padding:0 10px;border:1px solid var(--border,var(--tsb-border,#22304d));border-radius:12px;background:var(--panel,var(--bg-card,var(--tsb-bg,#10182d)));color:var(--text,var(--tsb-text,#f5f7ff));font:800 12px/1 inherit;letter-spacing:.25px;cursor:pointer;box-shadow:0 1px 0 rgba(255,255,255,.03) inset;transition:border-color .16s,background .16s,box-shadow .16s}" +
      ".ilm-language-trigger:hover{border-color:#4f7cff;background:color-mix(in srgb,var(--panel,var(--bg-card,var(--tsb-bg,#10182d))) 90%,#4f7cff 10%)}" +
      ".ilm-language-trigger:focus-visible{outline:0;border-color:#5b82ff;box-shadow:0 0 0 3px rgba(79,124,255,.22)}" +
      ".ilm-language-trigger[aria-expanded=true]{border-color:#5b82ff;box-shadow:0 0 0 3px rgba(79,124,255,.14)}" +
      ".ilm-language-flag{width:25px;height:18px;display:block;flex:0 0 auto;border-radius:3px;box-shadow:0 0 0 1px rgba(148,163,184,.28),0 2px 5px rgba(0,0,0,.18);overflow:hidden}" +
      ".ilm-language-chevron{width:15px;height:15px;margin-left:auto;color:var(--text-muted,var(--tsb-sub,#91a0c0));transition:transform .18s}" +
      ".ilm-language-trigger[aria-expanded=true] .ilm-language-chevron{transform:rotate(180deg)}" +
      ".ilm-language-menu{position:absolute;right:0;top:calc(100% + 9px);width:236px;max-width:calc(100vw - 24px);padding:7px;border:1px solid var(--border,var(--tsb-border,#22304d));border-radius:15px;background:color-mix(in srgb,var(--panel,var(--bg-card,var(--tsb-bg,#10182d))) 96%,transparent);box-shadow:0 18px 50px rgba(2,6,23,.34),0 1px 0 rgba(255,255,255,.05) inset;backdrop-filter:blur(18px);opacity:0;visibility:hidden;transform:translateY(-5px) scale(.98);transform-origin:top right;transition:opacity .15s,visibility .15s,transform .15s;z-index:1000}" +
      ".ilm-language-switcher[data-placement=top] .ilm-language-menu{top:auto;bottom:calc(100% + 9px);transform-origin:bottom right;transform:translateY(5px) scale(.98)}" +
      ".ilm-language-switcher.is-open .ilm-language-menu{opacity:1;visibility:visible;transform:translateY(0) scale(1)}" +
      ".ilm-language-option{width:100%;min-height:48px;display:flex;align-items:center;gap:11px;padding:7px 9px;border:0;border-radius:10px;background:transparent;color:var(--text,var(--tsb-text,#f5f7ff));font-family:inherit;text-align:left;cursor:pointer;transition:background .14s,color .14s}" +
      ".ilm-language-option:hover,.ilm-language-option:focus-visible{outline:0;background:rgba(79,124,255,.12)}" +
      ".ilm-language-option[aria-selected=true]{background:linear-gradient(135deg,rgba(79,124,255,.17),rgba(139,92,246,.14));color:#6f91ff}" +
      ".ilm-language-option-copy{display:flex;flex-direction:column;gap:3px;min-width:0}" +
      ".ilm-language-option-name{font-size:13px;font-weight:800;color:var(--text,var(--tsb-text,#f5f7ff))}" +
      ".ilm-language-option-code{font-size:10px;font-weight:800;letter-spacing:1px;color:var(--text-muted,var(--tsb-sub,#91a0c0))}" +
      ".ilm-language-check{width:17px;height:17px;margin-left:auto;color:#4f7cff;opacity:0}" +
      ".ilm-language-option[aria-selected=true] .ilm-language-check{opacity:1}" +
      "@media(max-width:480px){.ilm-language-trigger{min-width:82px;padding:0 8px;gap:7px}.topbar .ilm-language-menu{position:fixed;right:12px;top:106px;width:min(236px,calc(100vw - 24px))}}";
    document.head.appendChild(style);
  }

  function mount(config) {
    config = config || {};
    var select = document.getElementById(config.selectId);
    if (!select || !select.parentElement) return;
    var host = select.parentElement;
    ensureStyles();
    host.classList.add("ilm-language-switcher");
    host.dataset.placement = config.placement === "top" ? "top" : "bottom";
    select.classList.add("ilm-language-native");
    Array.prototype.slice.call(host.querySelectorAll(".ilm-language-trigger,.ilm-language-menu")).forEach(function (node) { node.remove(); });

    var current = languages[select.value] ? select.value : "uz";
    var trigger = document.createElement("button");
    var menu = document.createElement("div");
    trigger.type = "button";
    trigger.className = "ilm-language-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", config.ariaLabel || "Language");
    menu.className = "ilm-language-menu";
    menu.id = config.selectId + "Menu";
    menu.setAttribute("role", "listbox");
    trigger.setAttribute("aria-controls", menu.id);

    function triggerMarkup(language) {
      return flagSvg(language) + '<span>' + languages[language].code + '</span><svg class="ilm-language-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    }
    function closeMenu(returnFocus) {
      host.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      if (returnFocus) trigger.focus();
    }
    function openMenu() {
      host.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      var selected = menu.querySelector('[aria-selected="true"]');
      if (selected) selected.focus();
    }

    Object.keys(languages).forEach(function (language) {
      var data = languages[language];
      var option = document.createElement("button");
      option.type = "button";
      option.className = "ilm-language-option";
      option.dataset.language = language;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", language === current ? "true" : "false");
      option.innerHTML = flagSvg(language) + '<span class="ilm-language-option-copy"><span class="ilm-language-option-name">' + data.name + '</span><span class="ilm-language-option-code">' + data.code + '</span></span><svg class="ilm-language-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
      option.addEventListener("click", function () {
        if (select.value !== language) {
          select.value = language;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          closeMenu(true);
        }
      });
      menu.appendChild(option);
    });

    trigger.innerHTML = triggerMarkup(current);
    trigger.addEventListener("click", function () {
      if (host.classList.contains("is-open")) closeMenu(false); else openMenu();
    });
    trigger.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown") { event.preventDefault(); openMenu(); }
    });
    menu.addEventListener("keydown", function (event) {
      var options = Array.prototype.slice.call(menu.querySelectorAll(".ilm-language-option"));
      var index = options.indexOf(document.activeElement);
      if (event.key === "Escape") { event.preventDefault(); closeMenu(true); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        var direction = event.key === "ArrowDown" ? 1 : -1;
        options[(index + direction + options.length) % options.length].focus();
      }
    });
    host.appendChild(trigger);
    host.appendChild(menu);

    function outsideClick(event) {
      if (!host.isConnected) { document.removeEventListener("click", outsideClick); return; }
      if (!host.contains(event.target)) closeMenu(false);
    }
    document.addEventListener("click", outsideClick);
  }

  window.IlmLigaLanguageSwitcher = { mount: mount };
})();
