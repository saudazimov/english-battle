(function () {
  "use strict";

  let currentCountry = { code: "UZ", name: "Uzbekistan", flag: "🇺🇿", dialCode: "+998" };
  let verifiedPhone = "";
  let verifiedCode = "";
  let otpController = null;
  let resendInterval = null;
  let resendSeconds = 60;
  let usernameStatus = "idle";
  let usernameTimer = null;
  let districtRequired = true;
  let currentStep = "phone";
  let selectedRole = "";

  function showStep(step) {
    currentStep = step;
    document.querySelectorAll("[id^='register-']").forEach((screen) => {
      screen.classList.toggle("active", screen.id === "register-" + step);
    });
    const order = ["phone", "otp", "role", "profile"];
    const activeIndex = order.indexOf(step);
    order.forEach((name, index) => {
      const node = document.querySelector("[data-progress-step='" + name + "']");
      node.classList.toggle("active", index === activeIndex);
      node.classList.toggle("done", index < activeIndex);
      const dot = node.querySelector(".progress-dot");
      dot.innerHTML = index < activeIndex ? AuthApp.iconSvg("check", "progress-check") : String(index + 1);
    });
    document.querySelector("[data-progress-line='otp']").classList.toggle("done", activeIndex >= 1);
    document.querySelector("[data-progress-line='role']").classList.toggle("done", activeIndex >= 2);
    document.querySelector("[data-progress-line='profile']").classList.toggle("done", activeIndex >= 3);
    document.getElementById("registerShell").classList.toggle("auth-shell-wide", step === "role" || step === "profile");
    history.replaceState({ step }, "", step === "phone" ? "/register.html" : "/register.html#" + step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const roleMeta = {
    student: { name: "register.roleStudent", icon: "graduation-cap" },
    teacher: { name: "register.roleTeacher", icon: "presentation" },
    parent: { name: "register.roleParent", icon: "heart-handshake" },
  };

  function selectRole(role) {
    if (!roleMeta[role]) return;
    selectedRole = role;
    document.querySelectorAll("[data-role-choice]").forEach((choice) => {
      const active = choice.dataset.roleChoice === role;
      choice.classList.toggle("selected", active);
      choice.setAttribute("aria-checked", active ? "true" : "false");
    });
    document.getElementById("roleContinue").disabled = false;
  }

  function applyRoleToProfile() {
    const meta = roleMeta[selectedRole] || roleMeta.student;
    const parentMode = selectedRole === "parent";
    document.getElementById("selectedRoleIcon").innerHTML = AuthApp.iconSvg(meta.icon);
    document.getElementById("selectedRoleName").textContent = AuthApp.t(meta.name);
    document.getElementById("profileLocationFields").hidden = parentMode;
    document.getElementById("regionSelect").required = !parentMode;
    document.getElementById("schoolSelect").required = !parentMode;
    const subtitleKey = selectedRole === "parent" ? "register.parentProfileSubtitle" :
      (selectedRole === "teacher" ? "register.teacherProfileSubtitle" : "register.profileSubtitle");
    document.getElementById("profileSubtitle").textContent = AuthApp.t(subtitleKey);
    updateProfileValidity();
  }

  function updatePhone() {
    const input = document.getElementById("registerPhone");
    input.value = AuthApp.formatPhone(input.value, currentCountry);
    document.getElementById("phoneSubmit").disabled = !AuthApp.isPhoneComplete(input.value, currentCountry);
  }

  function initSelectIndicators() {
    const controls = Array.from(document.querySelectorAll(".select-control"));
    const closeAll = (except) => controls.forEach((control) => {
      if (control !== except) control.classList.remove("open");
    });

    controls.forEach((control) => {
      const select = control.querySelector(".select-input");
      if (!select) return;

      select.addEventListener("pointerdown", () => {
        if (select.disabled) return;
        const willOpen = !control.classList.contains("open");
        closeAll();
        control.classList.toggle("open", willOpen);
      });
      select.addEventListener("change", () => control.classList.remove("open"));
      select.addEventListener("blur", () => control.classList.remove("open"));
      select.addEventListener("keydown", (event) => {
        if (event.key === "Escape" || event.key === "Tab") {
          control.classList.remove("open");
        } else if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
          closeAll(control);
          control.classList.add("open");
        }
      });
    });

    document.addEventListener("pointerdown", (event) => {
      if (!event.target.closest(".select-control")) closeAll();
    });
  }

  function resetSchoolOptions() {
    const select = document.getElementById("schoolSelect");
    if (!select) return;
    select.disabled = true;
    select.innerHTML = '<option value="" data-i18n="register.schoolFirst">' +
      AuthApp.escapeHtml(AuthApp.t("register.schoolFirst")) + "</option>";
    select.closest(".select-control").classList.remove("open");
  }

  function loadSchoolOptions() {
    const select = document.getElementById("schoolSelect");
    const selectedSchool = select ? select.value : "";
    const region = document.getElementById("regionSelect").value;
    const district = document.getElementById("districtSelect").value;
    if (!select || !region || (districtRequired && !district)) {
      resetSchoolOptions();
      return updateProfileValidity();
    }
    const options = Array.from({ length: 200 }, (_, index) => {
      const school = String(index + 1) + "-maktab";
      return '<option value="' + school + '">' +
        AuthApp.escapeHtml(AuthApp.t("register.schoolOption", { number: index + 1 })) + '</option>';
    }).join("");
    select.innerHTML = '<option value="" data-i18n="register.schoolPlaceholder">' +
      AuthApp.escapeHtml(AuthApp.t("register.schoolPlaceholder")) + "</option>" + options;
    select.disabled = false;
    if (selectedSchool) select.value = selectedSchool;
    updateProfileValidity();
  }

  function updateCountryUi(clearPhone) {
    const button = document.getElementById("registerCountryButton");
    const input = document.getElementById("registerPhone");
    AuthApp.updateCountryButton(button, currentCountry);
    input.placeholder = AuthApp.getPhoneRule(currentCountry).placeholder || "Phone number";
    if (clearPhone) input.value = "";
    updatePhone();
  }

  function updateOtpValidity() {
    document.getElementById("otpSubmit").disabled = !otpController || otpController.value().length !== 6;
  }

  function startResendTimer() {
    window.clearInterval(resendInterval);
    resendSeconds = 60;
    const button = document.getElementById("resendButton");
    button.disabled = true;
    renderResendTimer();
    resendInterval = window.setInterval(() => {
      resendSeconds -= 1;
      renderResendTimer();
      if (resendSeconds <= 0) {
        window.clearInterval(resendInterval);
        button.disabled = false;
      }
    }, 1000);
  }

  function renderResendTimer() {
    const timer = document.getElementById("resendTimer");
    if (!timer) return;
    timer.textContent = resendSeconds > 0 ? "(" + resendSeconds + " " + AuthApp.t("register.secondsShort") + ")" : "";
  }

  async function loadStates() {
    const region = document.getElementById("regionSelect");
    const district = document.getElementById("districtSelect");
    resetSchoolOptions();
    region.disabled = true;
    region.innerHTML = '<option value="">' + AuthApp.escapeHtml(AuthApp.t("common.loading")) + '</option>';
    district.disabled = true;
    district.innerHTML = '<option value="">' + AuthApp.escapeHtml(AuthApp.t("register.districtFirst")) + '</option>';
    try {
      const data = await AuthApp.request("/locations/states?country=" + encodeURIComponent(currentCountry.code));
      region.innerHTML = '<option value="">' + AuthApp.escapeHtml(AuthApp.t("register.regionPlaceholder")) + '</option>' +
        (data.states || []).map((state) => '<option value="' + AuthApp.escapeHtml(state.code) + '" data-name="' + AuthApp.escapeHtml(state.name) + '">' + AuthApp.escapeHtml(state.name) + '</option>').join("");
      region.disabled = false;
    } catch (error) {
      region.innerHTML = '<option value="">' + AuthApp.escapeHtml(AuthApp.t("register.regionPlaceholder")) + '</option>';
      AuthApp.showToast(error.message, "error");
    }
    updateProfileValidity();
  }

  async function loadCities() {
    const region = document.getElementById("regionSelect");
    const district = document.getElementById("districtSelect");
    const stateCode = region.value;
    resetSchoolOptions();
    district.innerHTML = '<option value="">' + AuthApp.escapeHtml(stateCode ? AuthApp.t("common.loading") : AuthApp.t("register.districtFirst")) + '</option>';
    district.disabled = true;
    districtRequired = true;
    if (!stateCode) return updateProfileValidity();
    try {
      const data = await AuthApp.request("/locations/cities?country=" + encodeURIComponent(currentCountry.code) + "&state=" + encodeURIComponent(stateCode));
      const cities = data.cities || [];
      districtRequired = cities.length > 0;
      district.innerHTML = '<option value="">' + AuthApp.escapeHtml(AuthApp.t("register.districtPlaceholder")) + '</option>' +
        cities.map((city) => '<option value="' + AuthApp.escapeHtml(city) + '">' + AuthApp.escapeHtml(city) + '</option>').join("");
      district.disabled = !districtRequired;
    } catch (error) {
      AuthApp.showToast(error.message, "error");
    }
    if (districtRequired) updateProfileValidity();
    else loadSchoolOptions();
  }

  function usernameHint(message, kind) {
    const hint = document.getElementById("usernameHint");
    hint.textContent = message;
    hint.className = "field-hint " + (kind || "");
  }

  function checkUsernameSoon() {
    window.clearTimeout(usernameTimer);
    const input = document.getElementById("usernameInput");
    input.value = input.value.replace(/[^A-Za-z0-9_]/g, "").toLowerCase().slice(0, 32);
    const username = input.value.trim();
    document.getElementById("usernameCount").textContent = username.length + "/32";
    if (!username) {
      usernameStatus = "idle";
      usernameHint(AuthApp.t("register.usernameNeutral"), "");
      return updateProfileValidity();
    }
    if (!/^[a-z0-9_]{5,32}$/.test(username)) {
      usernameStatus = "invalid";
      usernameHint(AuthApp.t("common.usernameInvalid"), "warning");
      return updateProfileValidity();
    }
    usernameStatus = "checking";
    usernameHint(AuthApp.t("common.usernameChecking"), "");
    updateProfileValidity();
    usernameTimer = window.setTimeout(async () => {
      try {
        const result = await AuthApp.request("/check-username", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }),
        });
        if (document.getElementById("usernameInput").value.trim() !== username) return;
        usernameStatus = result.available ? "available" : "taken";
        usernameHint(AuthApp.t(result.available ? "common.usernameAvailable" : "common.usernameTaken"), result.available ? "success" : "error");
      } catch (error) {
        usernameStatus = "idle";
        usernameHint(error.message, "error");
      }
      updateProfileValidity();
    }, 500);
  }

  function updateProfileValidity() {
    const firstName = document.getElementById("firstName").value.trim();
    const lastName = document.getElementById("lastName").value.trim();
    const password = document.getElementById("profilePassword").value;
    const confirm = document.getElementById("confirmPassword").value;
    const region = document.getElementById("regionSelect").value;
    const district = document.getElementById("districtSelect").value;
    const school = document.getElementById("schoolSelect").value;
    const check = AuthApp.passwordCheck(password);

    const strength = document.getElementById("profileStrength");
    strength.textContent = password ? check.message : "";
    strength.className = "field-hint " + (check.valid ? "success" : "warning");
    document.getElementById("profileStrengthBars").dataset.strength = password ? check.strength : "empty";

    const match = document.getElementById("passwordMatch");
    match.textContent = confirm ? AuthApp.t(password === confirm ? "common.passwordMatch" : "common.passwordMismatch") : "";
    match.className = "field-hint " + (password === confirm && confirm ? "success" : "error");

    const locationValid = selectedRole === "parent" || (region && (!districtRequired || district) && school);
    document.getElementById("profileSubmit").disabled = !(
      firstName.length >= 2 && lastName.length >= 2 && check.valid && password === confirm &&
      usernameStatus === "available" && Boolean(selectedRole) && locationValid
    );
  }

  function selectedRegionName() {
    const select = document.getElementById("regionSelect");
    const option = select.options[select.selectedIndex];
    return option && option.dataset.name ? option.dataset.name : "";
  }

  document.addEventListener("DOMContentLoaded", async () => {
    showStep("phone");
    resetSchoolOptions();
    initSelectIndicators();
    const phoneInput = document.getElementById("registerPhone");
    phoneInput.addEventListener("input", updatePhone);

    try {
      const countries = await AuthApp.loadCountries();
      currentCountry = countries.find((country) => country.code === "UZ") || countries[0] || currentCountry;
      updateCountryUi(true);
    } catch (error) {
      AuthApp.showToast(error.message, "error");
    }

    document.getElementById("registerCountryButton").addEventListener("click", () => {
      AuthApp.chooseCountry(currentCountry.code, (country) => {
        currentCountry = country;
        updateCountryUi(true);
      });
    });

    document.getElementById("phoneBack").addEventListener("click", () => { window.location.href = "/"; });
    document.getElementById("otpBack").addEventListener("click", () => showStep("phone"));
    document.getElementById("roleBack").addEventListener("click", () => showStep("otp"));
    document.getElementById("profileBack").addEventListener("click", () => showStep("role"));
    document.getElementById("changeRoleButton").addEventListener("click", () => showStep("role"));
    document.querySelectorAll("[data-role-choice]").forEach((choice) => {
      choice.addEventListener("click", () => selectRole(choice.dataset.roleChoice));
    });
    document.getElementById("roleContinue").addEventListener("click", async () => {
      if (!selectedRole) return;
      applyRoleToProfile();
      showStep("profile");
      if (selectedRole !== "parent" && !document.getElementById("regionSelect").value) await loadStates();
    });

    otpController = AuthApp.createOtpController(document.getElementById("registerOtp"), updateOtpValidity);

    document.getElementById("phoneForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!AuthApp.isPhoneComplete(phoneInput.value, currentCountry)) return AuthApp.showToast(AuthApp.t("common.phoneInvalid"), "error");
      const button = document.getElementById("phoneSubmit");
      AuthApp.setBusy(button, true, AuthApp.t("register.sendCode"));
      try {
        verifiedPhone = AuthApp.fullPhone(phoneInput.value, currentCountry);
        await AuthApp.request("/otp/send", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: verifiedPhone }),
        });
        document.getElementById("otpPhoneText").textContent = verifiedPhone;
        otpController.clear();
        showStep("otp");
        startResendTimer();
      } catch (error) {
        AuthApp.showToast(error.message, "error");
      } finally {
        AuthApp.setBusy(button, false, AuthApp.t("register.sendCode"));
        updatePhone();
      }
    });

    document.getElementById("otpForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (otpController.value().length !== 6 || !verifiedPhone) return;
      const button = document.getElementById("otpSubmit");
      AuthApp.setBusy(button, true, AuthApp.t("register.verify"));
      try {
        verifiedCode = otpController.value();
        await AuthApp.request("/otp/verify", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: verifiedPhone, code: verifiedCode }),
        });
        showStep("role");
      } catch (error) {
        AuthApp.showToast(error.message, "error");
        otpController.clear();
      } finally {
        AuthApp.setBusy(button, false, AuthApp.t("register.verify"));
        updateOtpValidity();
      }
    });

    document.getElementById("resendButton").addEventListener("click", async () => {
      if (resendSeconds > 0 || !verifiedPhone) return;
      const button = document.getElementById("resendButton");
      button.disabled = true;
      try {
        await AuthApp.request("/otp/send", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: verifiedPhone }),
        });
        AuthApp.showToast(AuthApp.t("common.codeResent"), "success");
        otpController.clear();
        startResendTimer();
      } catch (error) {
        AuthApp.showToast(error.message, "error");
        button.disabled = false;
      }
    });

    document.getElementById("regionSelect").addEventListener("change", loadCities);
    document.getElementById("districtSelect").addEventListener("change", loadSchoolOptions);
    document.getElementById("schoolSelect").addEventListener("change", updateProfileValidity);
    document.getElementById("usernameInput").addEventListener("input", checkUsernameSoon);
    ["firstName", "lastName", "profilePassword", "confirmPassword"].forEach((id) => document.getElementById(id).addEventListener("input", updateProfileValidity));

    document.getElementById("profileForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      updateProfileValidity();
      const button = document.getElementById("profileSubmit");
      if (button.disabled || !verifiedPhone || !verifiedCode) return;
      AuthApp.setBusy(button, true, AuthApp.t("register.submit"));
      try {
        const payload = {
          phone: verifiedPhone,
          code: verifiedCode,
          username: document.getElementById("usernameInput").value.trim().toLowerCase(),
          first_name: document.getElementById("firstName").value.trim(),
          last_name: document.getElementById("lastName").value.trim(),
          password: document.getElementById("profilePassword").value,
          region: selectedRole === "parent" ? null : selectedRegionName(),
          district: selectedRole === "parent" ? null : (document.getElementById("districtSelect").value || null),
          school: selectedRole === "parent" ? null : document.getElementById("schoolSelect").value,
          role: selectedRole,
          country: currentCountry.code,
        };
        const result = await AuthApp.request("/register", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        AuthApp.saveSession(result);
        AuthApp.showToast(AuthApp.t("common.registrationDone"), "success");
        window.setTimeout(() => AuthApp.redirectForRole(result.user), 350);
      } catch (error) {
        if (error.message && error.message.toLowerCase().includes("username")) {
          usernameStatus = "taken";
          usernameHint(error.message, "error");
        }
        AuthApp.showToast(error.message, "error");
      } finally {
        AuthApp.setBusy(button, false, AuthApp.t("register.submit"));
        updateProfileValidity();
      }
    });

    document.addEventListener("auth:language", () => {
      if (selectedRole) applyRoleToProfile();
      renderResendTimer();
      if (!document.getElementById("schoolSelect").disabled) loadSchoolOptions();
      updateProfileValidity();
      if (currentStep === "profile" && selectedRole !== "parent" && !document.getElementById("regionSelect").value) loadStates();
    });
  });
})();
