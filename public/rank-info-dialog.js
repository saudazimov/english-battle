(function () {
  if (window.__rankInfoDialogLoaded) return;
  window.__rankInfoDialogLoaded = true;

  var css = `
    .rb-info-btn{width:30px;height:30px;display:grid;place-items:center;margin:-7px;border:0;border-radius:9px;background:transparent;color:var(--text-dim);cursor:pointer;transition:color .2s,background .2s}
    .rb-info-btn:hover,.rb-info-btn:focus-visible{color:var(--accent);background:rgba(91,140,255,.12);outline:none}
    .rb-info{width:17px;height:17px}
    .rank-info-overlay{position:fixed;inset:0;z-index:9200;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(3,6,15,.78);backdrop-filter:blur(6px)}
    .rank-info-overlay.show{display:flex}
    .rank-info-modal{width:min(100%,500px);border:1px solid var(--border-bright);border-radius:20px;background:linear-gradient(180deg,var(--panel),var(--bg-2));box-shadow:0 30px 90px rgba(0,0,0,.62);overflow:hidden;animation:rankInfoPop .2s ease}
    @keyframes rankInfoPop{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
    .rank-info-head{display:flex;align-items:center;gap:12px;padding:20px 22px;border-bottom:1px solid var(--border)}
    .rank-info-head-ic{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;color:var(--gold);background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.25)}
    .rank-info-head-ic i{width:21px;height:21px}.rank-info-title{font-size:19px;font-weight:800}.rank-info-sub{margin-top:2px;color:var(--text-dim);font-size:12px}
    .rank-info-close{width:36px;height:36px;margin-left:auto;display:grid;place-items:center;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.04);color:var(--text-dim);cursor:pointer}
    .rank-info-close:hover,.rank-info-close:focus-visible{color:var(--text);border-color:var(--border-bright);outline:none}.rank-info-close i{width:18px;height:18px}
    .rank-info-body{padding:22px}.rank-info-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
    .rank-info-stat{padding:13px 14px;border:1px solid var(--border);border-radius:12px;background:var(--panel-2)}
    .rank-info-stat span{display:block;color:var(--text-faint);font-size:11px;text-transform:uppercase;letter-spacing:.6px}.rank-info-stat b{display:block;margin-top:5px;font-size:18px}
    .rank-info-progress{padding:15px;margin-bottom:18px;border:1px solid var(--border);border-radius:13px}.rank-info-progress[hidden]{display:none}
    .rank-info-progress-top{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;font-size:12px;color:var(--text-dim)}.rank-info-progress-top b{color:var(--accent)}
    .rank-info-bar{height:8px;overflow:hidden;border-radius:999px;background:rgba(0,0,0,.42)}.rank-info-bar span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent),var(--accent-2))}
    .rank-info-rules{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.rank-info-rule{padding:11px 8px;border:1px solid var(--border);border-radius:11px;text-align:center;font-size:12px;color:var(--text-dim)}.rank-info-rule b{display:block;margin-bottom:3px;font-size:16px}
    .rank-info-note{display:flex;gap:8px;margin-top:15px;color:var(--text-dim);font-size:12px;line-height:1.5}.rank-info-note i{width:16px;height:16px;flex-shrink:0;margin-top:1px;color:var(--cyan)}
    .rank-info-scopes{display:flex;flex-direction:column;gap:8px}.rank-info-scope{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:10px;padding:10px 11px;border:1px solid var(--border);border-radius:11px;background:rgba(255,255,255,.02)}
    .rank-info-scope-ic{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:rgba(91,140,255,.12);color:var(--accent)}.rank-info-scope-ic i{width:17px;height:17px}.rank-info-scope-name{font-size:13px;font-weight:700}.rank-info-scope-desc{margin-top:2px;font-size:11px;color:var(--text-faint)}.rank-info-scope-value{font-size:15px;font-weight:800}
    .rank-info-foot{display:flex;justify-content:flex-end;padding:16px 22px;border-top:1px solid var(--border)}.rank-info-foot[hidden]{display:none}.rank-info-link{display:inline-flex;align-items:center;gap:7px;padding:10px 16px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;font-size:13px;font-weight:700;text-decoration:none}.rank-info-link i{width:16px;height:16px}
    @media(max-width:520px){.rank-info-summary{grid-template-columns:1fr}.rank-info-rules{grid-template-columns:1fr}}
  `;

  var style = document.createElement("style");
  style.id = "rankInfoDialogStyle";
  style.textContent = css;
  document.head.appendChild(style);

  function ensureDialog(headerIcon) {
    var existing = document.getElementById("rankInfoModal");
    if (existing) return existing;
    var overlay = document.createElement("div");
    overlay.id = "rankInfoModal";
    overlay.className = "rank-info-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "rankInfoTitle");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML =
      '<div class="rank-info-modal"><div class="rank-info-head">' +
        '<div class="rank-info-head-ic"><i data-lucide="' + (headerIcon || "trophy") + '"></i></div>' +
        '<div><div class="rank-info-title" id="rankInfoTitle"></div><div class="rank-info-sub" id="rankInfoSub"></div></div>' +
        '<button type="button" class="rank-info-close" id="rankInfoClose" aria-label="Yopish"><i data-lucide="x"></i></button>' +
      '</div><div class="rank-info-body">' +
        '<div class="rank-info-summary"><div class="rank-info-stat"><span id="rankInfoPrimaryLabel"></span><b id="rankInfoPrimary"></b></div><div class="rank-info-stat"><span id="rankInfoSecondaryLabel"></span><b id="rankInfoSecondary"></b></div></div>' +
        '<div class="rank-info-progress" id="rankInfoProgressWrap"><div class="rank-info-progress-top"><span>Keyingi bosqich</span><b id="rankInfoNext"></b></div><div class="rank-info-bar"><span id="rankInfoProgress"></span></div></div>' +
        '<div id="rankInfoDetails"></div>' +
      '</div><div class="rank-info-foot"><a class="rank-info-link" id="rankInfoLink"><i data-lucide="bar-chart-3"></i><span></span></a></div></div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function renderRatingRules(container) {
    container.innerHTML =
      '<div class="rank-info-rules"><div class="rank-info-rule"><b style="color:var(--green)">+20 RP</b>G‘alaba</div><div class="rank-info-rule"><b style="color:var(--text-dim)">0 RP</b>Durrang</div><div class="rank-info-rule"><b style="color:var(--red)">−20 RP</b>Mag‘lubiyat</div></div>' +
      '<div class="rank-info-note"><i data-lucide="info"></i><span>Reytingli janglar RP’ga ta’sir qiladi. Casual va Practice rejimlari reytingni o‘zgartirmaydi.</span></div>';
  }

  function renderScopes(container, scopes) {
    container.innerHTML = '<div class="rank-info-scopes"></div>';
    var list = container.firstElementChild;
    (scopes || []).forEach(function (scope) {
      var row = document.createElement("div");
      row.className = "rank-info-scope";
      row.innerHTML = '<span class="rank-info-scope-ic"><i data-lucide="' + scope.icon + '"></i></span><span><span class="rank-info-scope-name"></span> <span class="rank-info-scope-desc"></span></span><span class="rank-info-scope-value"></span>';
      row.querySelector(".rank-info-scope-name").textContent = scope.name;
      row.querySelector(".rank-info-scope-desc").textContent = scope.description;
      row.querySelector(".rank-info-scope-value").textContent = scope.value;
      list.appendChild(row);
    });
  }

  window.createRankInfoDialog = function (options) {
    var trigger = document.getElementById(options.triggerId);
    if (!trigger) return null;
    var overlay = ensureDialog(options.headerIcon);
    var closeButton = document.getElementById("rankInfoClose");
    var previousFocus = null;
    trigger.setAttribute("aria-controls", "rankInfoModal");
    trigger.setAttribute("aria-expanded", "false");

    function close() {
      overlay.classList.remove("show");
      overlay.setAttribute("aria-hidden", "true");
      trigger.setAttribute("aria-expanded", "false");
      if (previousFocus) previousFocus.focus();
    }

    function open() {
      var data = options.getData();
      document.querySelector("#rankInfoModal .rank-info-head-ic").innerHTML = '<i data-lucide="' + (options.headerIcon || "trophy") + '"></i>';
      document.getElementById("rankInfoTitle").textContent = options.title;
      document.getElementById("rankInfoSub").textContent = options.subtitle;
      document.getElementById("rankInfoPrimaryLabel").textContent = options.primaryLabel;
      document.getElementById("rankInfoSecondaryLabel").textContent = options.secondaryLabel;
      document.getElementById("rankInfoPrimary").textContent = data.primary;
      document.getElementById("rankInfoSecondary").textContent = data.secondary;
      var progressWrap = document.getElementById("rankInfoProgressWrap");
      progressWrap.hidden = !data.progress;
      if (data.progress) {
        document.getElementById("rankInfoNext").textContent = data.progress.label;
        document.getElementById("rankInfoProgress").style.width = data.progress.percent;
      }
      var details = document.getElementById("rankInfoDetails");
      if (options.detailType === "scopes") renderScopes(details, data.scopes);
      else renderRatingRules(details);
      var link = document.getElementById("rankInfoLink");
      var footer = link.parentElement;
      footer.hidden = options.hideFooter === true;
      if (!footer.hidden) {
        link.href = options.footerHref;
        link.querySelector("span").textContent = options.footerLabel;
      }
      previousFocus = document.activeElement;
      overlay.classList.add("show");
      overlay.setAttribute("aria-hidden", "false");
      trigger.setAttribute("aria-expanded", "true");
      closeButton.focus();
      if (window.lucide) window.lucide.createIcons();
    }

    trigger.addEventListener("click", open);
    closeButton.addEventListener("click", close);
    overlay.addEventListener("click", function (event) { if (event.target === overlay) close(); });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && overlay.classList.contains("show")) close(); });
    return { open: open, close: close };
  };
})();
