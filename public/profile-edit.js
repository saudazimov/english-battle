(function () {
  if (window.__profileEditorLoaded) return;
  window.__profileEditorLoaded = true;

  function editorT(key, params) {
    if (typeof window.profileT === "function") return window.profileT(key, params);
    return window.IlmLigaI18n ? window.IlmLigaI18n.t(key, params) : key;
  }

  const style = document.createElement("style");
  style.textContent = `
    .pe-overlay{display:none;position:fixed;inset:0;z-index:6100;padding:20px;background:rgba(3,6,15,.84);backdrop-filter:blur(7px);align-items:center;justify-content:center;color:#f8fafc}
    .pe-overlay.open{display:flex}
    .pe-dialog{width:min(100%,480px);position:relative;padding:28px;background:linear-gradient(180deg,#111a2e,#0b1324);border:1px solid #304264;border-radius:22px;box-shadow:0 30px 100px rgba(0,0,0,.68)}
    .pe-close{position:absolute;top:16px;right:16px;width:36px;height:36px;border:1px solid #3a4d73;border-radius:50%;background:#17233b;color:#e2e8f0;font:700 21px/1 inherit;cursor:pointer}
    .pe-close:hover{color:#fecaca;background:#3a1c2a;border-color:#7f3348}
    .pe-title{margin:0 44px 6px 0;color:#f8fafc;font-size:23px;line-height:1.25;font-weight:800}
    .pe-subtitle{margin:0 0 24px;color:#b8c5da;font-size:13.5px;line-height:1.55}
    .pe-form{display:grid;gap:17px}
    .pe-field{display:grid;gap:8px}
    .pe-field label{color:#e2e8f0;font-size:13px;font-weight:700}
    .pe-field input{width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #344766;border-radius:12px;background:#0b1425;color:#f8fafc;font:600 15px/1.35 inherit;caret-color:#60a5fa;outline:none;transition:border-color .18s,box-shadow .18s}
    .pe-field textarea{width:100%;min-height:112px;resize:vertical;box-sizing:border-box;padding:13px 14px;border:1px solid #344766;border-radius:12px;background:#0b1425;color:#f8fafc;font:500 14px/1.55 inherit;caret-color:#60a5fa;outline:none;transition:border-color .18s,box-shadow .18s}
    .pe-field input::placeholder,.pe-field textarea::placeholder{color:#8796b1;opacity:1}
    .pe-field input:hover,.pe-field textarea:hover{border-color:#4a6088}
    .pe-field input:focus,.pe-field textarea:focus{border-color:#60a5fa;box-shadow:0 0 0 3px rgba(96,165,250,.18)}
    .pe-help{color:#91a0ba;font-size:11.5px;line-height:1.45}
    .pe-field-meta{display:flex;justify-content:space-between;gap:12px;color:#91a0ba;font-size:11.5px;line-height:1.45}
    .pe-error{display:none;padding:10px 12px;border:1px solid #7f3348;border-radius:10px;background:#321827;color:#fecaca;font-size:12.5px;line-height:1.45}
    .pe-error.show{display:block}
    .pe-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:5px}
    .pe-btn{min-height:44px;padding:0 18px;border-radius:12px;font:700 14px/1 inherit;cursor:pointer}
    .pe-cancel{border:1px solid #344766;background:#111c31;color:#dbe5f5}
    .pe-save{border:0;background:linear-gradient(135deg,#4f7cff,#915cf6);color:#fff;box-shadow:0 8px 22px rgba(79,124,255,.22)}
    .pe-save:disabled{opacity:.68;cursor:not-allowed;box-shadow:none}
    .pe-close:focus-visible,.pe-btn:focus-visible{outline:3px solid rgba(96,165,250,.55);outline-offset:3px}
    @media(max-width:540px){.pe-overlay{padding:12px;align-items:flex-end}.pe-dialog{padding:24px 18px 20px;border-radius:20px}.pe-actions{display:grid;grid-template-columns:1fr 1fr}.pe-btn{width:100%}}
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.className = "pe-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <section class="pe-dialog" role="dialog" aria-modal="true" aria-labelledby="peTitle">
      <button type="button" class="pe-close" aria-label="Yopish" data-i18n-aria-label="profile.closeEditor">&times;</button>
      <h2 class="pe-title" id="peTitle" data-i18n="profile.editTitle">Profilni tahrirlash</h2>
      <p class="pe-subtitle" data-i18n="profile.editSubtitle">Ism va familiyangiz reyting, janglar va sinflarda ko‘rinadi.</p>
      <form class="pe-form" novalidate>
        <div class="pe-field">
          <label for="peFirstName" data-i18n="profile.firstName">Ism</label>
          <input id="peFirstName" name="first_name" type="text" minlength="2" maxlength="100" autocomplete="given-name" required>
        </div>
        <div class="pe-field">
          <label for="peLastName" data-i18n="profile.lastName">Familiya</label>
          <input id="peLastName" name="last_name" type="text" minlength="2" maxlength="100" autocomplete="family-name" required>
          <span class="pe-help" data-i18n="profile.nameHelp">2–100 belgi. Harflar, bo‘sh joy, apostrof va chiziq ishlatish mumkin.</span>
        </div>
        <div class="pe-field">
          <label for="peBio" data-i18n="profile.bio">Bio / Tavsif</label>
          <textarea id="peBio" name="bio" maxlength="500" placeholder="O‘zingiz haqingizda qisqacha yozing..." data-i18n-placeholder="profile.bioPlaceholder"></textarea>
          <div class="pe-field-meta"><span data-i18n="profile.bioPublic">Profilingizda hammaga ko‘rinadi</span><span class="pe-bio-count">0 / 500</span></div>
        </div>
        <div class="pe-error" role="alert"></div>
        <div class="pe-actions">
          <button type="button" class="pe-btn pe-cancel" data-i18n="common.cancel">Bekor qilish</button>
          <button type="submit" class="pe-btn pe-save" data-i18n="profile.save">Saqlash</button>
        </div>
      </form>
    </section>`;
  document.body.appendChild(overlay);
  if (window.IlmLigaI18n) window.IlmLigaI18n.apply(overlay);

  const dialog = overlay.querySelector(".pe-dialog");
  const form = overlay.querySelector(".pe-form");
  const firstNameInput = overlay.querySelector("#peFirstName");
  const lastNameInput = overlay.querySelector("#peLastName");
  const bioInput = overlay.querySelector("#peBio");
  const bioCount = overlay.querySelector(".pe-bio-count");
  const errorBox = overlay.querySelector(".pe-error");
  const saveButton = overlay.querySelector(".pe-save");
  let previousOverflow = "";
  let opener = null;

  function showError(message) {
    errorBox.textContent = message || editorT("profile.saveFailed");
    errorBox.classList.add("show");
  }

  function updateBioCount() {
    bioCount.textContent = bioInput.value.length + " / 500";
  }

  function closeEditor() {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = previousOverflow;
    if (opener) opener.focus();
  }

  window.openProfileEditor = function () {
    const profile = window.__profileEditData;
    if (!profile) return;
    opener = document.activeElement;
    firstNameInput.value = profile.first_name || "";
    lastNameInput.value = profile.last_name || "";
    bioInput.value = profile.bio || "";
    updateBioCount();
    errorBox.textContent = "";
    errorBox.classList.remove("show");
    saveButton.disabled = false;
    saveButton.textContent = editorT("profile.save");
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    firstNameInput.focus();
  };

  overlay.querySelector(".pe-close").addEventListener("click", closeEditor);
  overlay.querySelector(".pe-cancel").addEventListener("click", closeEditor);
  bioInput.addEventListener("input", updateBioCount);
  overlay.addEventListener("click", function (event) {
    if (event.target === overlay) closeEditor();
  });
  dialog.addEventListener("click", function (event) {
    event.stopPropagation();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && overlay.classList.contains("open")) closeEditor();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    errorBox.classList.remove("show");
    if (!form.reportValidity()) return;

    saveButton.disabled = true;
    saveButton.textContent = editorT("profile.saving");
    try {
      const response = await authFetch("/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstNameInput.value,
          last_name: lastNameInput.value,
          bio: bioInput.value,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        showError(data.error);
        return;
      }
      window.__profileEditData = data.user;
      if (typeof window.handleProfileEditSuccess === "function") {
        window.handleProfileEditSuccess(data.user);
      }
      closeEditor();
    } catch (error) {
      showError(editorT("profile.saveServerError"));
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = editorT("profile.save");
    }
  });

  window.addEventListener("ilmliga:languagechange", function () {
    if (window.IlmLigaI18n) window.IlmLigaI18n.apply(overlay);
    saveButton.textContent = editorT(saveButton.disabled ? "profile.saving" : "profile.save");
  });
})();
