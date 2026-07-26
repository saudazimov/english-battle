(function () {
  "use strict";

  let loginCountry = { code: "UZ", name: "Uzbekistan", flag: "🇺🇿", dialCode: "+998" };
  let forgotCountry = loginCountry;
  let resetPhone = "";
  let resetOtpController = null;
  let selectedLanguage = AuthApp.language;

  function showScreen(name, updateHistory) {
    document.querySelectorAll(".auth-screen").forEach((screen) => {
      screen.classList.toggle("active", screen.id === "screen-" + name);
    });
    document.body.dataset.screen = name;
    if (updateHistory !== false) {
      const url = name === "welcome" ? "/" : "/?screen=" + encodeURIComponent(name);
      history.pushState({ screen: name }, "", url);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function initialScreen() {
    const token = localStorage.getItem("token");
    const rawUser = localStorage.getItem("user");
    if (token && rawUser) {
      try { AuthApp.redirectForRole(JSON.parse(rawUser)); return null; } catch (_) { /* clean login below */ }
    }
    const query = new URLSearchParams(location.search).get("screen");
    const allowed = ["welcome", "login", "forgot", "reset"];
    if (!localStorage.getItem("ilmliga_language")) return "language";
    return allowed.includes(query) ? query : "welcome";
  }

  function bindPhone(input, getCountry, onValidity) {
    input.addEventListener("input", () => {
      const country = getCountry();
      input.value = AuthApp.formatPhone(input.value, country);
      if (typeof onValidity === "function") onValidity();
    });
  }

  function updatePhoneUi(button, input, country) {
    AuthApp.updateCountryButton(button, country);
    const rule = AuthApp.getPhoneRule(country);
    input.placeholder = rule.placeholder || "Phone number";
    input.value = "";
  }

  function updateResetValidity() {
    const password = document.getElementById("resetPassword").value;
    const confirm = document.getElementById("resetConfirm").value;
    const check = AuthApp.passwordCheck(password);
    const strength = document.getElementById("resetStrength");
    const match = document.getElementById("resetMatch");
    strength.textContent = password ? check.message : "";
    strength.className = "field-hint " + (check.valid ? "success" : "warning");
    match.textContent = confirm ? AuthApp.t(password === confirm ? "common.passwordMatch" : "common.passwordMismatch") : "";
    match.className = "field-hint " + (password === confirm && confirm ? "success" : "error");
    document.getElementById("resetSubmit").disabled = !(resetOtpController && resetOtpController.value().length === 6 && check.valid && password === confirm);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const screen = initialScreen();
    if (!screen) return;
    showScreen(screen, false);

    document.querySelectorAll("[data-open-screen]").forEach((button) => {
      button.addEventListener("click", () => showScreen(button.dataset.openScreen));
    });

    document.querySelectorAll("[data-language-card]").forEach((card) => {
      card.classList.toggle("active", card.dataset.languageCard === selectedLanguage);
      card.addEventListener("click", () => {
        selectedLanguage = card.dataset.languageCard;
        document.querySelectorAll("[data-language-card]").forEach((item) => item.classList.toggle("active", item === card));
        AuthApp.setLanguage(selectedLanguage);
      });
    });
    document.getElementById("languageContinue").addEventListener("click", () => {
      AuthApp.setLanguage(selectedLanguage);
      showScreen("welcome");
    });

    window.addEventListener("popstate", (event) => {
      const next = event.state && event.state.screen;
      showScreen(next || "welcome", false);
    });

    const loginPhone = document.getElementById("loginPhone");
    const loginCountryButton = document.getElementById("loginCountryButton");
    const forgotPhone = document.getElementById("forgotPhone");
    const forgotCountryButton = document.getElementById("forgotCountryButton");
    bindPhone(loginPhone, () => loginCountry);
    bindPhone(forgotPhone, () => forgotCountry);

    try {
      const countries = await AuthApp.loadCountries();
      loginCountry = countries.find((country) => country.code === "UZ") || countries[0] || loginCountry;
      forgotCountry = loginCountry;
      updatePhoneUi(loginCountryButton, loginPhone, loginCountry);
      updatePhoneUi(forgotCountryButton, forgotPhone, forgotCountry);
    } catch (error) {
      AuthApp.showToast(error.message, "error");
    }

    loginCountryButton.addEventListener("click", () => {
      AuthApp.chooseCountry(loginCountry.code, (country) => {
        loginCountry = country;
        updatePhoneUi(loginCountryButton, loginPhone, country);
      });
    });
    forgotCountryButton.addEventListener("click", () => {
      AuthApp.chooseCountry(forgotCountry.code, (country) => {
        forgotCountry = country;
        updatePhoneUi(forgotCountryButton, forgotPhone, country);
      });
    });

    document.getElementById("loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = document.getElementById("loginPassword").value;
      if (!AuthApp.isPhoneComplete(loginPhone.value, loginCountry)) return AuthApp.showToast(AuthApp.t("common.phoneInvalid"), "error");
      if (!password) return AuthApp.showToast(AuthApp.t("login.password"), "error");
      const button = document.getElementById("loginSubmit");
      AuthApp.setBusy(button, true, AuthApp.t("login.submit"));
      try {
        const result = await AuthApp.request("/login", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: AuthApp.fullPhone(loginPhone.value, loginCountry), password }),
        });
        AuthApp.saveSession(result);
        AuthApp.redirectForRole(result.user);
      } catch (error) {
        AuthApp.showToast(error.message, "error");
      } finally {
        AuthApp.setBusy(button, false, AuthApp.t("login.submit"));
      }
    });

    document.getElementById("forgotForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!AuthApp.isPhoneComplete(forgotPhone.value, forgotCountry)) return AuthApp.showToast(AuthApp.t("common.phoneInvalid"), "error");
      const button = document.getElementById("forgotSubmit");
      AuthApp.setBusy(button, true, AuthApp.t("forgot.submit"));
      try {
        resetPhone = AuthApp.fullPhone(forgotPhone.value, forgotCountry);
        await AuthApp.request("/password-reset/send", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: resetPhone }),
        });
        document.getElementById("resetPhoneText").textContent = resetPhone;
        showScreen("reset");
        resetOtpController.focus();
      } catch (error) {
        AuthApp.showToast(error.message, "error");
      } finally {
        AuthApp.setBusy(button, false, AuthApp.t("forgot.submit"));
      }
    });

    resetOtpController = AuthApp.createOtpController(document.getElementById("resetOtp"), updateResetValidity);
    document.getElementById("resetPassword").addEventListener("input", updateResetValidity);
    document.getElementById("resetConfirm").addEventListener("input", updateResetValidity);

    document.getElementById("resetForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      updateResetValidity();
      const button = document.getElementById("resetSubmit");
      if (button.disabled || !resetPhone) return;
      AuthApp.setBusy(button, true, AuthApp.t("reset.submit"));
      try {
        await AuthApp.request("/password-reset/confirm", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: resetPhone, code: resetOtpController.value(), new_password: document.getElementById("resetPassword").value }),
        });
        AuthApp.showToast(AuthApp.t("common.resetDone"), "success");
        resetOtpController.clear();
        document.getElementById("resetPassword").value = "";
        document.getElementById("resetConfirm").value = "";
        showScreen("login");
      } catch (error) {
        AuthApp.showToast(error.message, "error");
      } finally {
        AuthApp.setBusy(button, false, AuthApp.t("reset.submit"));
        updateResetValidity();
      }
    });

    document.addEventListener("auth:language", updateResetValidity);
  });
})();
