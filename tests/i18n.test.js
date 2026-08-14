const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { createI18n, messages } = require("../public/i18n");

function createStorage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function loadAuthApp(initialLanguage) {
  const storage = createStorage(initialLanguage ? { ilmliga_language: initialLanguage } : {});
  const document = {
    documentElement: { lang: "" },
    querySelectorAll() { return []; },
    addEventListener() {},
    dispatchEvent() {},
    getElementById() { return null; },
  };
  const window = {
    clearTimeout() {},
    setTimeout() {},
  };
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "auth-common.js"), "utf8");

  vm.runInNewContext(source, {
    window,
    document,
    localStorage: storage,
    CustomEvent: class CustomEvent {},
  });

  return window.AuthApp;
}

test("entry auth translations cover metadata and accessibility in all supported languages", () => {
  const app = loadAuthApp();
  const requiredKeys = [
    "meta.title",
    "meta.description",
    "common.homeAria",
    "common.languageSwitch",
    "common.choosePhoneCountry",
    "common.close",
    "common.showPassword",
    "common.hidePassword",
    "common.otpCode",
    "common.otpDigit",
  ];

  for (const language of ["uz", "en", "ru"]) {
    app.setLanguage(language);
    for (const key of requiredKeys) {
      assert.notEqual(app.t(key), key, `${language}.${key}`);
      assert.notEqual(app.t(key).trim(), "", `${language}.${key}`);
    }
    assert.match(app.t("common.otpDigit", { number: 4 }), /4/);
  }
});

test("entry page localizes visible and accessibility UI without changing auth routes", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const common = fs.readFileSync(path.join(__dirname, "..", "public", "auth-common.js"), "utf8");
  const entry = fs.readFileSync(path.join(__dirname, "..", "public", "auth-entry.js"), "utf8");

  assert.match(page, /data-i18n="meta\.title"/);
  assert.match(page, /data-i18n-content="meta\.description"/);
  assert.match(page, /data-i18n-aria-label="common\.languageSwitch"/);
  assert.match(page, /data-i18n-aria-label="common\.otpDigit"/);
  assert.match(common, /\[data-i18n-aria-label\]/);
  assert.match(common, /common\.hidePassword/);

  assert.match(entry, /AuthApp\.request\("\/login"/);
  assert.match(entry, /AuthApp\.request\("\/password-reset\/send"/);
  assert.match(entry, /AuthApp\.request\("\/password-reset\/confirm"/);
  assert.doesNotThrow(() => new Function(common));
  assert.doesNotThrow(() => new Function(entry));
});

test("registration translations cover dynamic UI in all supported languages", () => {
  const app = loadAuthApp();
  const requiredKeys = [
    "register.metaTitle",
    "register.metaDescription",
    "register.progressAria",
    "register.privacyConsent",
    "register.schoolOption",
    "register.secondsShort",
  ];

  for (const language of ["uz", "en", "ru"]) {
    app.setLanguage(language);
    for (const key of requiredKeys) {
      assert.notEqual(app.t(key), key, `${language}.${key}`);
      assert.notEqual(app.t(key).trim(), "", `${language}.${key}`);
    }
    assert.match(app.t("register.schoolOption", { number: 25 }), /25/);
  }
});

test("registration page localizes all steps without changing API routes", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "register.html"), "utf8");
  const register = fs.readFileSync(path.join(__dirname, "..", "public", "auth-register.js"), "utf8");

  assert.match(page, /data-i18n="register\.metaTitle"/);
  assert.match(page, /data-i18n-content="register\.metaDescription"/);
  assert.match(page, /data-i18n-aria-label="register\.progressAria"/);
  assert.match(page, /data-i18n="register\.privacyConsent"/);
  assert.match(register, /AuthApp\.t\("register\.schoolOption", \{ number: index \+ 1 \}\)/);
  assert.match(register, /AuthApp\.t\("register\.secondsShort"\)/);
  assert.match(register, /document\.addEventListener\("auth:language"/);

  assert.match(register, /AuthApp\.request\("\/otp\/send"/);
  assert.match(register, /AuthApp\.request\("\/otp\/verify"/);
  assert.match(register, /AuthApp\.request\("\/check-username"/);
  assert.match(register, /AuthApp\.request\("\/register"/);
  assert.match(register, /AuthApp\.request\("\/locations\/states\?country="/);
  assert.match(register, /AuthApp\.request\("\/locations\/cities\?country="/);
  assert.doesNotThrow(() => new Function(register));
});

test("registration layout keeps all localized steps inside narrow mobile viewports", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "auth.css"), "utf8");

  assert.match(css, /\.auth-screen\s*\{[^}]*min-width:\s*0;/s);
  assert.match(css, /\.auth-card\s*\{[^}]*min-width:\s*0;/s);
  assert.match(css, /\.progress\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s);
  assert.match(css, /@media \(max-width:\s*560px\)[\s\S]*\.progress-line\s*\{[^}]*flex:\s*1 1 20px;/);
});

test("shared i18n defaults to Uzbek and persists supported language changes", () => {
  const storage = createStorage();
  const i18n = createI18n({ storage, document: null });

  assert.equal(i18n.getLanguage(), "uz");
  assert.equal(i18n.t("nav.classes"), "Sinflarim");

  assert.equal(i18n.setLanguage("en", false), "en");
  assert.equal(storage.getItem("ilmliga_language"), "en");
  assert.equal(storage.getItem("eb_lang"), "en");
  assert.equal(i18n.t("nav.classes"), "My classes");

  assert.equal(i18n.setLanguage("unsupported", false), "uz");
  assert.equal(i18n.getLanguage(), "uz");
});

test("shared i18n supports Russian and safe parameter interpolation", () => {
  const storage = createStorage({ ilmliga_language: "ru" });
  const i18n = createI18n({ storage, document: null });

  assert.equal(i18n.t("nav.logout"), "Выйти");
  assert.equal(
    i18n.t("notifications.friendRequest", { name: "Aziza" }),
    "Aziza отправил вам запрос в друзья"
  );
  assert.equal(i18n.t("missing.translation.key"), "missing.translation.key");
});

test("student shared shell translation keys exist in all supported languages", () => {
  const requiredKeys = [
    "brand.slogan",
    "nav.home",
    "nav.battle",
    "nav.practice",
    "nav.classes",
    "nav.exam",
    "nav.ranking",
    "nav.tournaments",
    "nav.friends",
    "nav.history",
    "nav.progress",
    "nav.profile",
    "nav.logout",
    "school.panel",
    "topbar.language",
    "topbar.notifications",
    "topbar.profile",
    "topbar.settings",
    "logout.title",
    "logout.text",
  ];

  for (const language of ["uz", "en", "ru"]) {
    for (const key of requiredKeys) {
      assert.equal(typeof messages[language][key], "string", `${language}.${key}`);
      assert.notEqual(messages[language][key].trim(), "", `${language}.${key}`);
    }
  }
});

test("shared sidebar loads and uses the centralized i18n module", () => {
  const sidebar = fs.readFileSync(path.join(__dirname, "..", "public", "sidebar.js"), "utf8");
  const appCss = fs.readFileSync(path.join(__dirname, "..", "public", "app.css"), "utf8");

  assert.match(sidebar, /script\.src = "\/i18n\.js"/);
  assert.match(sidebar, /sbT\("nav\.classes"/);
  assert.match(sidebar, /sbT\("topbar\.notifications"/);
  assert.match(sidebar, /id="tbLanguage"/);
  assert.match(sidebar, /changeShellLanguage/);
  assert.match(sidebar, /ilmliga:languagechange/);
  assert.match(sidebar, /script\.src = "\/language-switcher\.js\?v=13"/);
  assert.match(sidebar, /IlmLigaLanguageSwitcher\.mount/);
  assert.match(sidebar, /sidebar-foot[\s\S]*logo-mark-new\.svg/);
  assert.match(sidebar, /sidebar-foot[\s\S]*width:42px;height:42px/);
  assert.doesNotMatch(sidebar, /sbT\("student\.openRanking"/);
  assert.match(appCss, /@media \(min-width:\s*901px\) and \(max-height:\s*780px\)/);
  assert.match(appCss, /\.sidebar-foot \.mascot-box img\s*\{[^}]*width:\s*36px\s*!important;[^}]*height:\s*36px\s*!important;/s);
});

test("shared language switcher provides local flags and an accessible custom menu", () => {
  const switcher = fs.readFileSync(path.join(__dirname, "..", "public", "language-switcher.js"), "utf8");

  assert.match(switcher, /function flagSvg\(language\)/);
  assert.match(switcher, /O‘zbekcha/);
  assert.match(switcher, /English/);
  assert.match(switcher, /Русский/);
  assert.match(switcher, /aria-haspopup/);
  assert.match(switcher, /role", "listbox"/);
  assert.match(switcher, /event\.key === "Escape"/);
  assert.match(switcher, /option\.type = "button"/);
  assert.match(switcher, /select\.dispatchEvent\(new Event\("change"/);
});

test("authenticated pages use one universal Battle-style topbar", () => {
  const sidebar = fs.readFileSync(path.join(__dirname, "..", "public", "sidebar.js"), "utf8");
  const styles = fs.readFileSync(path.join(__dirname, "..", "public", "topbar.css"), "utf8");
  const classesPage = fs.readFileSync(path.join(__dirname, "..", "public", "student-classes.html"), "utf8");

  assert.match(sidebar, /link\.href = "\/topbar\.css\?v=1"/);
  assert.match(sidebar, /host\.classList\.add\("il-topbar"\)/);
  assert.match(sidebar, /appHost\.classList\.add\("il-shell"\)/);
  assert.match(sidebar, /il-topbar--center-column/);
  assert.match(styles, /\.app\.il-shell/);
  assert.match(styles, /\.topbar\.il-topbar/);
  assert.match(styles, /> \.tb-language \.ilm-language-menu/);
  assert.match(styles, /> \.currency/);
  assert.match(styles, /> \.notif-wrap/);
  assert.match(styles, /> \.user-chip/);
  assert.match(styles, /@media \(max-width: 780px\)/);
  assert.doesNotMatch(classesPage, /renderTopbar\(\{\s*back:/);
});

test("teacher shared shell translation keys exist in all supported languages", () => {
  const requiredKeys = [
    "teacher.panel",
    "teacher.nav.home",
    "teacher.nav.classes",
    "teacher.nav.assignments",
    "teacher.nav.exams",
    "teacher.nav.students",
    "teacher.nav.results",
    "teacher.nav.aiReports",
    "teacher.nav.messages",
    "teacher.nav.resources",
    "teacher.nav.settings",
    "teacher.premiumDescription",
    "teacher.helpCenter",
    "teacher.logout",
    "teacher.subscriptionUntil",
  ];

  for (const language of ["uz", "en", "ru"]) {
    for (const key of requiredKeys) {
      assert.equal(typeof messages[language][key], "string", `${language}.${key}`);
      assert.notEqual(messages[language][key].trim(), "", `${language}.${key}`);
    }
  }
});

test("teacher sidebar uses centralized i18n and exposes the language selector", () => {
  const sidebar = fs.readFileSync(path.join(__dirname, "..", "public", "teacher-sidebar.js"), "utf8");

  assert.match(sidebar, /script\.src = "\/i18n\.js"/);
  assert.match(sidebar, /teacherT\("teacher\.nav\."/);
  assert.match(sidebar, /id="tsbLanguage"/);
  assert.match(sidebar, /changeTeacherLanguage/);
  assert.match(sidebar, /ilmliga:languagechange/);
  assert.match(sidebar, /script\.src = "\/language-switcher\.js\?v=13"/);
  assert.match(sidebar, /IlmLigaLanguageSwitcher\.mount/);
});

test("teacher dashboard translations have matching Uzbek, English and Russian coverage", () => {
  const dashboardKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("teacher.dashboard."))
    .sort();

  assert.ok(dashboardKeys.length >= 50);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("teacher.dashboard.")).sort(),
    dashboardKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("teacher.dashboard.")).sort(),
    dashboardKeys
  );
});

test("teacher dashboard applies shared i18n to static and dynamic content", () => {
  const dashboard = fs.readFileSync(path.join(__dirname, "..", "public", "teacher.html"), "utf8");

  assert.match(dashboard, /<script src="\/i18n\.js"><\/script>/);
  assert.match(dashboard, /data-i18n="teacher\.dashboard\.overview"/);
  assert.match(dashboard, /data-i18n-title="teacher\.dashboard\.changeTheme"/);
  assert.match(dashboard, /dashboardT\("teacher\.dashboard\.greetingNamed"/);
  assert.match(dashboard, /dashboardT\("teacher\.dashboard\.feedCompleted"/);
  assert.match(dashboard, /Intl\.DateTimeFormat\(dashboardLocale\(\)/);
  assert.match(dashboard, /ilmliga:languagechange/);

  const inlineScripts = [...dashboard.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("teacher classes translations have matching Uzbek, English and Russian coverage", () => {
  const classKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("teacher.classes."))
    .sort();

  assert.ok(classKeys.length >= 50);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("teacher.classes.")).sort(),
    classKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("teacher.classes.")).sort(),
    classKeys
  );
});

test("teacher classes page applies shared i18n to static and dynamic content", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "teacher-classes.html"), "utf8");

  assert.match(page, /<script src="\/i18n\.js"><\/script>/);
  assert.match(page, /data-i18n="teacher\.classes\.heading"/);
  assert.match(page, /data-i18n-placeholder="teacher\.classes\.searchPlaceholder"/);
  assert.match(page, /classesT\("teacher\.classes\.archiveConfirm"/);
  assert.match(page, /toLocaleDateString\(classesLocale\(\)/);
  assert.match(page, /ilmliga:languagechange/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("teacher class detail translations have matching Uzbek, English and Russian coverage", () => {
  const detailKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("teacher.classDetail."))
    .sort();

  assert.ok(detailKeys.length >= 150);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("teacher.classDetail.")).sort(),
    detailKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("teacher.classDetail.")).sort(),
    detailKeys
  );
});

test("teacher class detail localizes static and dynamic UI without changing API routes", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "teacher-class-detail.html"), "utf8");

  assert.match(page, /<script src="\/i18n\.js"><\/script>/);
  assert.match(page, /data-i18n="teacher\.classDetail\.backClasses"/);
  assert.match(page, /data-i18n="teacher\.classDetail\.announcements"/);
  assert.match(page, /classDetailT\("teacher\.classDetail\.assignmentCreated"/);
  assert.match(page, /toLocaleDateString\(classDetailLocale\(\)/);
  assert.match(page, /ilmliga:languagechange/);

  assert.match(page, /\/teacher\/classes\/" \+ encodeURIComponent\(classId\) \+ "\/students"/);
  assert.match(page, /\/teacher\/classes\/" \+ encodeURIComponent\(classId\) \+ "\/assignments"/);
  assert.match(page, /\/teacher\/classes\/"\+encodeURIComponent\(classId\)\+"\/announcements"/);
  assert.match(page, /\/teacher\/classes\/"\+encodeURIComponent\(classId\)\+"\/attendance"/);
  assert.match(page, /\/ai\/reports\/teacher\/classes\//);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("teacher assignments translations have matching Uzbek, English and Russian coverage", () => {
  const assignmentKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("teacher.assignments."))
    .sort();

  assert.ok(assignmentKeys.length >= 55);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("teacher.assignments.")).sort(),
    assignmentKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("teacher.assignments.")).sort(),
    assignmentKeys
  );
});

test("teacher assignments localizes static and dynamic UI without changing API routes", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "teacher-assignments.html"), "utf8");

  assert.match(page, /<script src="\/i18n\.js"><\/script>/);
  assert.match(page, /data-i18n="teacher\.assignments\.heading"/);
  assert.match(page, /data-i18n-placeholder="teacher\.assignments\.searchPlaceholder"/);
  assert.match(page, /assignmentsT\("teacher\.assignments\.created"/);
  assert.match(page, /toLocaleDateString\(assignmentsLocale\(\)/);
  assert.match(page, /ilmliga:languagechange/);

  assert.match(page, /authFetch\("\/teacher\/assignments"\)/);
  assert.match(page, /authFetch\("\/teacher\/classes"\)/);
  assert.match(page, /authFetch\("\/teacher\/classes\/" \+ classId \+ "\/assignments"/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("teacher results translations have matching Uzbek, English and Russian coverage", () => {
  const resultKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("teacher.results."))
    .sort();

  assert.ok(resultKeys.length >= 100);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("teacher.results.")).sort(),
    resultKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("teacher.results.")).sort(),
    resultKeys
  );
});

test("teacher results and diagnostics localize UI without changing API routes", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "teacher-results.html"), "utf8");
  const analytics = fs.readFileSync(path.join(__dirname, "..", "public", "teacher-learning-analytics.js"), "utf8");

  assert.match(page, /<script src="\/i18n\.js"><\/script>/);
  assert.match(page, /data-i18n="teacher\.results\.heading"/);
  assert.match(page, /data-i18n-placeholder="teacher\.results\.studentSearch"/);
  assert.match(page, /resultsT\("teacher\.results\.exported"/);
  assert.match(page, /ilmliga:languagechange/);
  assert.match(analytics, /teacher\.results\.pedagogicalSummary/);
  assert.match(analytics, /typeof global\.resultsT === "function"/);

  assert.match(page, /authFetch\("\/teacher\/assignments"\)/);
  assert.match(page, /authFetch\("\/teacher\/results\/" \+ id\)/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
  assert.doesNotThrow(() => new Function(analytics));
});

test("student lobby translations have matching Uzbek, English and Russian coverage", () => {
  const lobbyKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("lobby."))
    .sort();

  assert.ok(lobbyKeys.length >= 140);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("lobby.")).sort(),
    lobbyKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("lobby.")).sort(),
    lobbyKeys
  );
});

test("student lobby localizes static and dynamic UI without changing routes or socket events", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "lobby.html"), "utf8");
  const rankDialog = fs.readFileSync(path.join(__dirname, "..", "public", "rank-info-dialog.js"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="lobby\.heading"/);
  assert.match(page, /data-i18n-content="lobby\.metaDescription"/);
  assert.match(page, /lobbyT\("lobby\.rematchConfirm"/);
  assert.match(page, /lobbyT\("lobby\.partyInviteText"/);
  assert.match(page, /ilmliga:languagechange/);
  assert.match(rankDialog, /rankInfoT\("rankInfo\.nextStage"/);
  assert.match(rankDialog, /rankInfoT\("rankInfo\.ratingNote"/);

  assert.match(page, /authFetch\("\/profile\/" \+ user\.id\)/);
  assert.match(page, /authFetch\("\/history\/" \+ user\.id\)/);
  assert.match(page, /authFetch\("\/quests"/);
  assert.match(page, /authFetch\("\/school-battle\/my"\)/);
  assert.match(page, /authFetch\("\/friends\/" \+ user\.id\)/);
  for (const eventName of [
    "requestRematch",
    "rematchResponse",
    "createParty",
    "leaveParty",
    "inviteToParty",
    "startPartyQueue",
    "acceptPartyInvite",
    "declinePartyInvite",
  ]) {
    assert.match(page, new RegExp('"' + eventName + '"'));
  }

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
  assert.doesNotThrow(() => new Function(rankDialog));
});

test("student lobby preserves dynamic identity and fits its profile card on mobile", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "lobby.html"), "utf8");

  assert.match(page, /@media \(max-width: 640px\)[\s\S]*?\.profile-card\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.match(page, /\.pc-info,[\s\S]*?min-width:\s*0/);
  assert.match(page, /\.pc-stats\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(page, /\.modes\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(page, /\.find-btn\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0/);
  assert.match(
    page,
    /ilmliga:languagechange[\s\S]*?document\.getElementById\("pcName"\)\.textContent\s*=[\s\S]*?user\.first_name/
  );
});

test("practice translations have matching Uzbek, English and Russian coverage", () => {
  const practiceKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("practice."))
    .sort();

  assert.ok(practiceKeys.length >= 45);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("practice.")).sort(),
    practiceKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("practice.")).sort(),
    practiceKeys
  );
});

test("practice page localizes its workflow without changing API routes", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "practice.html"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="practice\.heading"/);
  assert.match(page, /data-i18n-content="practice\.metaDescription"/);
  assert.match(page, /data-i18n-aria-label="practice\.exitAria"/);
  assert.match(page, /practiceT\("practice\.loadingQuestions"/);
  assert.match(page, /practiceT\("practice\.resultSummary"/);
  assert.match(page, /practiceSkillLabel/);
  assert.match(page, /ilmliga:languagechange/);

  assert.match(page, /authFetch\("\/practice\/start\?level="/);
  assert.match(page, /authFetch\("\/practice\/answer"/);
  assert.match(page, /authFetch\("\/practice\/finish"/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("student classes translations have matching Uzbek, English and Russian coverage", () => {
  const classKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("studentClasses."))
    .sort();

  assert.ok(classKeys.length >= 65);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("studentClasses.")).sort(),
    classKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("studentClasses.")).sort(),
    classKeys
  );
});

test("student classes localizes static and dynamic UI without changing API routes", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "student-classes.html"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="studentClasses\.heading"/);
  assert.match(page, /data-i18n-placeholder="studentClasses\.codePlaceholder"/);
  assert.match(page, /data-i18n-aria-label="studentClasses\.codeAria"/);
  assert.match(page, /classesT\("studentClasses\.noFilterResults"/);
  assert.match(page, /classesT\("studentClasses\.joinedSuccess"/);
  assert.match(page, /Intl\.DateTimeFormat\(classesLocale\(\)/);
  assert.match(page, /ilmliga:languagechange/);

  assert.match(page, /authFetch\("\/student\/classes"\)/);
  assert.match(page, /authFetch\("\/student\/classes\/" \+ encodeURIComponent\(id\) \+ "\/leave"/);
  assert.match(page, /authFetch\("\/student\/join-class"/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("student class cards fit narrow localized mobile viewports", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "student-classes.html"), "utf8");

  assert.match(page, /\.class-grid\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)[\s\S]*?min-width:\s*0/);
  assert.match(page, /@media \(max-width: 720px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(page, /\.class-card\s*\{[\s\S]*?min-width:\s*0[\s\S]*?max-width:\s*100%/);
  assert.match(page, /\.cc-stats\s*\{[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(page, /@media \(max-width: 560px\)[\s\S]*?\.cc-stat-lbl,[\s\S]*?overflow-wrap:\s*anywhere/);
});

test("student class assignments translations have matching Uzbek, English and Russian coverage", () => {
  const assignmentKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("studentAssignments."))
    .sort();

  assert.ok(assignmentKeys.length >= 100);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("studentAssignments.")).sort(),
    assignmentKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("studentAssignments.")).sort(),
    assignmentKeys
  );
});

test("student class assignments localizes class, exam and quiz flows without changing API routes", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "student-class-assignments.html"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="studentAssignments\.backClasses"/);
  assert.match(page, /data-i18n-title="studentAssignments\.copyCode"/);
  assert.match(page, /assignmentsT\("studentAssignments\.noAnnouncements"/);
  assert.match(page, /assignmentsT\("studentAssignments\.resultSummary"/);
  assert.match(page, /toLocaleDateString\(assignmentsLocale\(\)/);
  assert.match(page, /ilmliga:languagechange/);
  assert.match(page, /<div class="topbar"><\/div>/);
  assert.match(page, /renderTopbar\(\)/);

  for (const routePattern of [
    /authFetch\("\/student\/classes"\)/,
    /authFetch\("\/student\/teachers\/" \+ curClassData\.teacher_id \+ "\/messages"/,
    /authFetch\("\/student\/classes\/" \+ encodeURIComponent\(classId\) \+ "\/announcements"/,
    /authFetch\("\/student\/classes\/" \+ encodeURIComponent\(classId\) \+ "\/ranking"/,
    /authFetch\("\/student\/classes\/"\+encodeURIComponent\(classId\)\+"\/attendance"/,
    /authFetch\("\/student\/classes\/"\+encodeURIComponent\(classId\)\+"\/live-lesson"/,
    /authFetch\("\/student\/assignments"\)/,
    /authFetch\("\/student\/exams"\)/,
    /authFetch\("\/student\/assignments\/" \+ encodeURIComponent\(id\) \+ "\/start"/,
    /authFetch\("\/student\/assignments\/" \+ encodeURIComponent\(quiz\.id\) \+ "\/submit"/,
  ]) {
    assert.match(page, routePattern);
  }

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("exam hub translations have matching Uzbek, English and Russian coverage", () => {
  const examKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("examHub."))
    .sort();

  assert.ok(examKeys.length >= 45);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("examHub.")).sort(),
    examKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("examHub.")).sort(),
    examKeys
  );
});

test("exam hub localizes readiness UI without changing exam routes", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "exam.html"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="examHub\.heading"/);
  assert.match(page, /data-i18n-content="examHub\.metaDescription"/);
  assert.match(page, /examT\("examHub\.readyTitle"/);
  assert.match(page, /examT\("examHub\.battlesProgress"/);
  assert.match(page, /ilmliga:languagechange/);

  assert.match(page, /authFetch\("\/exam\/status\/" \+ user\.id\)/);
  assert.match(page, /\/exam-room\.html/);
  assert.match(page, /\/lobby\.html/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("exam metadata fits narrow localized mobile viewports", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "exam.html"), "utf8");

  assert.match(page, /@media \(max-width: 640px\)[\s\S]*?\.me-top\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.match(page, /\.me-info,[\s\S]*?\.me-sub\s*\{[\s\S]*?min-width:\s*0[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(page, /\.me-meta\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(page, /\.me-meta-box,[\s\S]*?\.me-meta-l\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(page, /\.exam-row\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(page, /\.er-action\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0/);
  assert.match(page, /\.er-locked-txt\s*\{[\s\S]*?white-space:\s*normal[\s\S]*?overflow-wrap:\s*anywhere/);
});

test("exam room translations have matching Uzbek, English and Russian coverage", () => {
  const roomKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("examRoom."))
    .sort();

  assert.ok(roomKeys.length >= 39);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("examRoom.")).sort(),
    roomKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("examRoom.")).sort(),
    roomKeys
  );
});

test("exam room localizes the exam flow without changing API behavior", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "exam-room.html"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf("function roomT"));
  assert.match(page, /data-i18n="examRoom\.rules"/);
  assert.match(page, /data-i18n="examRoom\.topicResults"/);
  assert.match(page, /roomT\("examRoom\.questionProgress"/);
  assert.match(page, /roomT\("examRoom\.promoted"/);
  assert.match(page, /ilmliga:languagechange[\s\S]*renderQuestionLabels\(\)/);

  assert.match(page, /authFetch\("\/exam\/status\/" \+ user\.id\)/);
  assert.match(page, /authFetch\("\/exam\/start\/" \+ user\.id\)/);
  assert.match(page, /authFetch\("\/exam\/submit", \{/);
  assert.match(page, /body: JSON\.stringify\(\{ session_id: examSessionId, answers: answersArr \}\)/);
  assert.match(page, /window\.location\.href = "\/exam\.html"/);

  const languageHandler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\n    \}\);/);
  assert.ok(languageHandler);
  assert.doesNotMatch(languageHandler[1], /showQuestion\(\)/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("leaderboard translations have matching Uzbek, English and Russian coverage", () => {
  const leaderboardKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("leaderboard."))
    .sort();

  assert.ok(leaderboardKeys.length >= 70);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("leaderboard.")).sort(),
    leaderboardKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("leaderboard.")).sort(),
    leaderboardKeys
  );
});

test("leaderboard localizes filters, rows and info dialog without changing API routes", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "leaderboard.html"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="leaderboard\.heading"/);
  assert.match(page, /data-i18n-aria-label="leaderboard\.infoAria"/);
  assert.match(page, /week: "leaderboard\.periodWeekNote"/);
  assert.match(page, /new Intl\.DisplayNames\(\[leaderboardLocale\(\)\]/);
  assert.match(page, /get title\(\) \{ return lbT\("leaderboard\.infoTitle"\); \}/);

  assert.match(page, /authFetch\("\/leaderboard\?scope=" \+ currentScope \+ "&period=" \+ currentPeriod\)/);
  assert.match(page, /authFetch\("\/leaderboard\/my-ranks"\)/);
  for (const scope of ["global", "national", "region", "district", "school", "friends"]) {
    assert.match(page, new RegExp(`switchScope\\('${scope}'\\)`));
  }
  for (const period of ["all", "week", "month", "season"]) {
    assert.match(page, new RegExp(`switchPeriod\\('${period}'\\)`));
  }

  const languageHandler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\n    \}\);/);
  assert.ok(languageHandler);
  assert.match(languageHandler[1], /renderTable\(\)/);
  assert.doesNotMatch(languageHandler[1], /loadLeaderboard\(\)/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("leaderboard renders compact localized cards on narrow mobile viewports", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "leaderboard.html"), "utf8");

  assert.match(page, /\.lb-mobile-label\s*\{\s*display:\s*none/);
  assert.match(page, /@media \(max-width: 640px\)[\s\S]*?\.lb-cols\s*\{\s*display:\s*none/);
  assert.match(page, /\.lb-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(page, /\.lb-rank,[\s\S]*?\.lb-player\s*\{\s*grid-column:\s*1 \/ -1/);
  assert.match(page, /\.lb-loc\s*\{[\s\S]*?white-space:\s*normal[\s\S]*?overflow:\s*visible/);
  assert.match(page, /const mobileLabels\s*=\s*\[[\s\S]*?leaderboard\.rating[\s\S]*?row\.children/);
});

test("school rankings translations have matching Uzbek, English and Russian coverage", () => {
  const rankingKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("rankings."))
    .sort();

  assert.ok(rankingKeys.length >= 50);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("rankings.")).sort(),
    rankingKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("rankings.")).sort(),
    rankingKeys
  );
});

test("school rankings localizes filters and rows without changing ranking API behavior", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "rankings.html"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="rankings\.heading"/);
  assert.match(page, /data-i18n-content="rankings\.metaDescription"/);
  assert.match(page, /rankingsT\("rankings\.loading"\)/);
  assert.match(page, /new Intl\.PluralRules\(/);

  assert.match(page, /authFetch\("\/rankings\/combined\?scope=" \+ currentTab \+ "&period=" \+ currentPeriod \+ "&within=" \+ currentWithin\)/);
  assert.match(page, /authFetch\("\/rankings\/combined\?scope=" \+ sc \+ "&period=" \+ currentPeriod \+ "&within=" \+ w\)/);
  for (const tab of ["schools", "districts", "regions"]) {
    assert.match(page, new RegExp(`data-tab="${tab}"`));
  }
  for (const period of ["all", "week", "month", "season"]) {
    assert.match(page, new RegExp(`data-period="${period}"`));
  }

  const languageHandler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\n    \}\);/);
  assert.ok(languageHandler);
  assert.match(languageHandler[1], /renderWithinBar\(\)/);
  assert.match(languageHandler[1], /render\(\)/);
  assert.doesNotMatch(languageHandler[1], /loadAndRender\(\)|preloadAll\(\)/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("school rankings renders localized mobile cards without page overflow", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "rankings.html"), "utf8");

  assert.match(page, /@media \(max-width: 640px\)[\s\S]*?\.lb-cols\s*\{\s*display:\s*none/);
  assert.match(page, /\.lb-row,[\s\S]*?\.lb-row\.with-dist[\s\S]*?grid-template-columns:\s*44px minmax\(0, 1fr\)/);
  assert.match(page, /content:\s*attr\(data-label\)/);
  assert.match(page, /class="lb-players" data-label="' \+ rankingAttr\(rankingsT\("rankings\.players"\)\)/);
  assert.match(page, /class="lb-avg" data-label="' \+ rankingAttr\(rankingsT\("rankings\.effort"\)\)/);
  assert.match(page, /class="lb-rating" data-label="' \+ rankingAttr\(rankingsT\("rankings\.rating"\)\)/);
});

test("student tournament translations have matching Uzbek, English and Russian coverage", () => {
  const tournamentKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("studentTournaments."))
    .sort();

  assert.ok(tournamentKeys.length >= 46);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("studentTournaments.")).sort(),
    tournamentKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("studentTournaments.")).sort(),
    tournamentKeys
  );
});

test("student tournaments localizes cards and bracket without changing routes or socket events", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "student-tournaments.html"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="studentTournaments\.heading"/);
  assert.match(page, /data-i18n-content="studentTournaments\.metaDescription"/);
  assert.match(page, /tournamentT\("studentTournaments\.loading"\)/);
  assert.match(page, /toLocaleString\(tournamentLocale\(\)/);

  assert.match(page, /authFetch\("\/student\/tournaments"\)/);
  assert.match(page, /authFetch\("\/student\/tournaments\/" \+ tid \+ "\/bracket"\)/);
  assert.match(page, /window\.location\.href = "\/tournament-battle\.html\?match=" \+ matchId/);
  for (const event of ["registerUser", "matchCheckinOpen", "matchLiveStart", "matchFinished"]) {
    assert.match(page, new RegExp(`"${event}"`));
  }

  const languageHandler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\n    \}\);/);
  assert.ok(languageHandler);
  assert.match(languageHandler[1], /renderActiveBanner\(loadedTournaments\)/);
  assert.match(languageHandler[1], /renderTournamentCollection\(\)/);
  assert.match(languageHandler[1], /renderBracket\(loadedBracket\)/);
  assert.doesNotMatch(languageHandler[1], /loadTournaments\(\)|openBracket\(/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("friends translations have matching Uzbek, English and Russian coverage", () => {
  const friendKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("friends."))
    .sort();

  assert.ok(friendKeys.length >= 140);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("friends.")).sort(),
    friendKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("friends.")).sort(),
    friendKeys
  );
});

test("friends page localizes lists, profiles and challenges without changing routes or socket events", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "friends.html"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="friends\.heading"/);
  assert.match(page, /data-i18n-placeholder="friends\.searchPlaceholder"/);
  assert.match(page, /friendsT\("friends\.challengeReceived"/);
  assert.match(page, /suggestionReason\(u\.reason\)/);
  assert.match(page, /toLocaleDateString\(friendsLocale\(\)/);
  assert.match(page, /ilmliga:languagechange/);

  for (const routePattern of [
    /authFetch\("\/profile\/" \+ userId\)/,
    /authFetch\("\/history\/" \+ userId\)/,
    /authFetch\("\/friends\/" \+ user\.id\)/,
    /authFetch\("\/friends\/requests\/" \+ user\.id\)/,
    /authFetch\("\/friends\/respond", \{/,
    /authFetch\("\/friends\/search\?q=" \+ encodeURIComponent\(q\) \+ "&userId=" \+ user\.id\)/,
    /authFetch\("\/friends\/suggested\/" \+ user\.id\)/,
    /authFetch\("\/friends\/request", \{/,
    /authFetch\("\/friends\/wins\/" \+ user\.id\)/,
    /authFetch\("\/friends\/activity\/" \+ user\.id\)/,
    /authFetch\("\/friends\/remove", \{/,
  ]) {
    assert.match(page, routePattern);
  }

  for (const event of [
    "registerUser", "friendRemoved", "friendStatusChanged", "challengeFriend",
    "cancelChallenge", "challengeResult", "challengeReceived", "challengeCancelled",
    "challengeResponse", "challengeDeclined", "matchFound", "newFriendRequest",
    "requestResponded",
  ]) {
    assert.match(page, new RegExp('"' + event + '"'));
  }

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("friends page keeps tabs, lists and actions inside mobile viewports", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "friends.html"), "utf8");

  assert.match(page, /@media \(max-width: 640px\)[\s\S]*?\.fr-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(page, /\.fl-cols\s*\{\s*display:\s*none/);
  assert.match(page, /\.fl-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(page, /\.fl-actions\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 44px 44px/);
  assert.match(page, /\.req-row,[\s\S]*?\.srch-row\s*\{[\s\S]*?grid-template-columns:\s*44px minmax\(0, 1fr\)/);
  assert.match(page, /\.search-form\s*\{\s*flex-direction:\s*column/);
});

test("history translations have matching Uzbek, English and Russian coverage", () => {
  const historyKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("history."))
    .sort();

  assert.ok(historyKeys.length >= 60);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("history.")).sort(),
    historyKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("history.")).sort(),
    historyKeys
  );
});

test("history page localizes filters, charts and achievements without changing API behavior", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "history.html"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="history\.heading"/);
  assert.match(page, /data-i18n-aria-label="history\.performanceChartAria"/);
  assert.match(page, /toLocaleDateString\(historyLocale\(\)\)/);
  assert.match(page, /new Intl\.DateTimeFormat\(historyLocale\(\)/);
  assert.match(page, /historyT\("history\.achievementFirstWin"\)/);
  assert.match(page, /if \(levelDonutChart\) levelDonutChart\.destroy\(\)/);

  assert.match(page, /authFetch\("\/history\/" \+ user\.id\)/);
  assert.match(page, /\/lobby\.html/);
  for (const mode of ["all", "ranked", "casual", "school"]) {
    assert.match(page, new RegExp(`data-mode="${mode}"`));
  }
  for (const period of ["all", "today", "week", "month"]) {
    assert.match(page, new RegExp(`data-period="${period}"`));
  }

  const languageHandler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\n    \}\);/);
  assert.ok(languageHandler);
  assert.match(languageHandler[1], /renderList\(\)/);
  assert.match(languageHandler[1], /renderPerformanceChart\(\)/);
  assert.match(languageHandler[1], /renderAchievements\(\)/);
  assert.doesNotMatch(languageHandler[1], /loadHistory\(\)/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("progress translations have matching Uzbek, English and Russian coverage", () => {
  const progressKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("progress."))
    .sort();

  assert.ok(progressKeys.length >= 130);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("progress.")).sort(),
    progressKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("progress.")).sort(),
    progressKeys
  );
});

test("progress page localizes diagnostics and lessons without changing API behavior", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "progress.html"), "utf8");
  const script = fs.readFileSync(path.join(__dirname, "..", "public", "progress.js"), "utf8");
  const learningScript = fs.readFileSync(path.join(__dirname, "..", "public", "progress-learning.js"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="progress\.heading"/);
  assert.match(page, /data-i18n-aria-label="progress\.learningFlowAria"/);
  assert.match(script, /function progressT\(key, params\)/);
  assert.match(script, /toLocaleDateString\(progressLocale\(\)/);
  assert.match(learningScript, /toLocaleString\(learningLocale\(\)/);
  assert.match(script, /ilmliga:languagechange/);
  assert.match(script, /if \(learningUi\.rerender\) learningUi\.rerender\(\)/);

  for (const routePattern of [
    /\/ai\/reports\/student\/weekly\?period=/,
    /\/learning\/remediation\/lessons\/sync/,
    /\/learning\/remediation\/lessons/,
  ]) assert.match(script, routePattern);

  for (const routePattern of [
    /\/learning\/progress\/overview/,
    /\/learning\/remediation\/assessments\/due/,
    /\/learning\/remediation\/assessments\//,
  ]) assert.match(learningScript, routePattern);

  assert.doesNotThrow(() => new Function(script));
  assert.doesNotThrow(() => new Function(learningScript));
});

test("profile translations have matching Uzbek, English and Russian coverage", () => {
  const profileKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("profile."))
    .sort();

  assert.ok(profileKeys.length >= 170);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("profile.")).sort(),
    profileKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("profile.")).sort(),
    profileKeys
  );
});

test("profile page localizes dynamic UI without changing profile APIs", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "profile.html"), "utf8");
  const editor = fs.readFileSync(path.join(__dirname, "..", "public", "profile-edit.js"), "utf8");
  const rankDialog = fs.readFileSync(path.join(__dirname, "..", "public", "rank-info-dialog.js"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="profile\.heading"/);
  assert.match(page, /data-i18n-aria-label="profile\.currentRankInfoAria"/);
  assert.match(page, /function profileT\(key, params\)/);
  assert.match(page, /toLocaleDateString\(profileLocale\(\)/);
  assert.match(page, /ilmliga:languagechange/);
  assert.match(page, /rerenderAIForLanguage\(\)/);
  assert.match(editor, /function editorT\(key, params\)/);
  assert.match(editor, /data-i18n-placeholder="profile\.bioPlaceholder"/);
  assert.match(editor, /ilmliga:languagechange/);
  assert.match(rankDialog, /function optionValue\(value\)/);

  assert.match(page, /authFetch\("\/profile\/" \+ viewUserId\)/);
  assert.match(page, /authFetch\("\/history\/" \+ viewUserId\)/);
  assert.match(page, /authFetch\("\/student\/parent-code"\)/);
  assert.match(page, /authFetch\("\/exam\/history\/" \+ viewUserId\)/);
  assert.match(page, /authFetch\("\/ai\/reports\/student\/weekly"/);
  assert.match(editor, /authFetch\("\/profile", \{/);

  const languageHandler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\n    \}\);/);
  assert.ok(languageHandler);
  assert.match(languageHandler[1], /renderHistory\(historyBattles\)/);
  assert.match(languageHandler[1], /renderParentList\(parentRecords\)/);
  assert.match(languageHandler[1], /rerenderAIForLanguage\(\)/);
  assert.doesNotMatch(languageHandler[1], /loadAIReport\(|loadHistory\(|loadParentList\(|loadExamHistory\(/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
  assert.doesNotThrow(() => new Function(editor));
  assert.doesNotThrow(() => new Function(rankDialog));
});

test("profile card keeps localized identity and edit action inside mobile viewports", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "profile.html"), "utf8");

  assert.match(page, /@media \(max-width: 640px\)[\s\S]*?\.profile-card\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.match(page, /\.pc-info,[\s\S]*?min-width:\s*0/);
  assert.match(page, /\.pc-top\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.match(page, /\.pc-edit\s*\{[\s\S]*?width:\s*100%[\s\S]*?white-space:\s*normal/);
  assert.match(page, /\.pc-stats\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(page, /\.cefr-track\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(page, /\.lp-cols,[\s\S]*?\.subj-row\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(
    page,
    /ilmliga:languagechange[\s\S]*?document\.getElementById\("pcName"\)\.textContent\s*=\s*profileName/
  );
});

test("pricing and payment modal translations match in all supported languages", () => {
  for (const prefix of ["pricing.", "paymentModal."]) {
    const keys = Object.keys(messages.uz).filter((key) => key.startsWith(prefix)).sort();
    assert.ok(keys.length >= (prefix === "pricing." ? 35 : 25));
    assert.deepEqual(
      Object.keys(messages.en).filter((key) => key.startsWith(prefix)).sort(),
      keys
    );
    assert.deepEqual(
      Object.keys(messages.ru).filter((key) => key.startsWith(prefix)).sort(),
      keys
    );
  }
});

test("pricing page and payment modal localize checkout UI without changing payment behavior", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "pricing.html"), "utf8");
  const paymentModal = fs.readFileSync(path.join(__dirname, "..", "public", "payment-modal.js"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/payment-modal.js"></script>'));
  assert.match(page, /data-i18n="pricing\.heading"/);
  assert.match(page, /data-i18n-content="pricing\.metaDescription"/);
  assert.match(page, /data-i18n-aria-label="pricing\.themeAria"/);
  assert.match(paymentModal, /function paymentT\(key, params\)/);
  assert.match(paymentModal, /toLocaleString\(paymentLocale\(\)\)/);
  assert.match(paymentModal, /ilmliga:languagechange/);
  assert.match(paymentModal, /currentView === "pending"/);

  for (const plan of ["teacher_pro", "student_premium", "parent_premium", "center_pro"]) {
    assert.match(page, new RegExp(`choose\\('${plan}'\\)`));
    assert.match(paymentModal, new RegExp(`${plan}: \\{`));
  }
  assert.match(paymentModal, /authFetch\("\/payments\/create", \{/);
  assert.match(paymentModal, /authFetch\("\/payments\/" \+ paymentId \+ "\/status"\)/);
  assert.match(paymentModal, /body: JSON\.stringify\(\{ plan: currentPlan, months: currentMonths \}\)/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
  assert.doesNotThrow(() => new Function(paymentModal));
});

test("parent translations have matching Uzbek, English and Russian coverage", () => {
  const parentKeys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("parent."))
    .sort();

  assert.ok(parentKeys.length >= 80);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("parent.")).sort(),
    parentKeys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("parent.")).sort(),
    parentKeys
  );
});

test("parent page localizes child views without changing parent APIs", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "parent.html"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/payment-modal.js"></script>'));
  assert.match(page, /data-i18n="parent\.panelTitle"/);
  assert.match(page, /data-i18n-placeholder="parent\.codePlaceholder"/);
  assert.match(page, /function parentT\(key, params\)/);
  assert.match(page, /toLocaleDateString\(parentLocale\(\)/);
  assert.match(page, /function rerenderAIForLanguage\(\)/);

  assert.match(page, /authFetch\("\/parent\/children"\)/);
  assert.match(page, /authFetch\("\/parent\/children\/"\+encodeURIComponent\(id\)\)/);
  assert.match(page, /authFetch\("\/parent\/link", \{ method:"POST"/);
  assert.match(page, /body: JSON\.stringify\(\{ code, relationship: rel \}\)/);
  assert.match(page, /method:"DELETE"/);
  assert.match(page, /\/ai\/reports\/parent\/children\/"\+encodeURIComponent\(childId\)\+"\/weekly"/);

  const languageHandler = page.match(/window\.addEventListener\("ilmliga:languagechange", function\(\)\{([\s\S]*?)\n    \}\);/);
  assert.ok(languageHandler);
  assert.match(languageHandler[1], /childrenRecords\.map\(childCard\)/);
  assert.match(languageHandler[1], /renderChild\(currentChildData, true\)/);
  assert.doesNotMatch(languageHandler[1], /loadChildren\(|openChild\(|loadAIReport\(/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("teacher students translations have matching Uzbek, English and Russian coverage", () => {
  const keys = Object.keys(messages.uz)
    .filter((key) => key.startsWith("teacherStudents."))
    .sort();

  assert.ok(keys.length >= 70);
  assert.deepEqual(
    Object.keys(messages.en).filter((key) => key.startsWith("teacherStudents.")).sort(),
    keys
  );
  assert.deepEqual(
    Object.keys(messages.ru).filter((key) => key.startsWith("teacherStudents.")).sort(),
    keys
  );
});

test("teacher students page localizes roster UI without changing its API", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "teacher-students.html"), "utf8");

  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/teacher-sidebar.js"></script>'));
  assert.match(page, /data-i18n="teacherStudents\.heading"/);
  assert.match(page, /data-i18n-placeholder="teacherStudents\.searchPlaceholder"/);
  assert.match(page, /function teacherStudentsT\(key, params\)/);
  assert.match(page, /authFetch\("\/teacher\/students"\)/);
  assert.match(page, /renderTeacherSidebar\("students"\)/);
  assert.match(page, /body\.appendChild\(a\); a\.click\(\); document\.body\.removeChild\(a\)/);

  const languageHandler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\n    \}\);/);
  assert.ok(languageHandler);
  assert.match(languageHandler[1], /renderTable\(\)/);
  assert.match(languageHandler[1], /renderDonut\(classDistribution\)/);
  assert.match(languageHandler[1], /renderGroups\(scoreGroups\)/);
  assert.doesNotMatch(languageHandler[1], /loadStudents\(/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`);
  });
});

test("teacher exams translations have matching Uzbek, English and Russian coverage", () => {
  const keys = Object.keys(messages.uz).filter((key) => key.startsWith("teacherExams.")).sort();
  assert.ok(keys.length >= 100);
  assert.deepEqual(Object.keys(messages.en).filter((key) => key.startsWith("teacherExams.")).sort(), keys);
  assert.deepEqual(Object.keys(messages.ru).filter((key) => key.startsWith("teacherExams.")).sort(), keys);
});

test("teacher exams page localizes exam flows without changing APIs", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "teacher-exams.html"), "utf8");
  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/teacher-sidebar.js"></script>'));
  assert.match(page, /data-i18n="teacherExams\.heading"/);
  assert.match(page, /data-i18n-placeholder="teacherExams\.searchPlaceholder"/);
  assert.match(page, /function teacherExamsT\(key, params\)/);
  assert.match(page, /toLocaleDateString\(teacherExamsLocale\(\)/);
  assert.match(page, /new Intl\.DateTimeFormat\(teacherExamsLocale\(\)/);
  assert.match(page, /authFetch\("\/teacher\/exams"\)/);
  assert.match(page, /authFetch\("\/teacher\/exams", \{/);
  assert.match(page, /authFetch\("\/teacher\/exams\/" \+ id\)/);
  assert.match(page, /authFetch\("\/teacher\/exams\/" \+ id, \{ method: "DELETE" \}\)/);
  assert.match(page, /authFetch\("\/teacher\/classes"\)/);

  const handler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\n    \}\);/);
  assert.ok(handler);
  assert.match(handler[1], /renderTable\(\)/);
  assert.match(handler[1], /renderExamDetail\(currentExamDetail\)/);
  assert.doesNotMatch(handler[1], /loadExams\(|viewExam\(|loadModalClasses\(/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`));
});

test("teacher messages translations have matching Uzbek, English and Russian coverage", () => {
  const keys = Object.keys(messages.uz).filter((key) => key.startsWith("teacherMessages.")).sort();
  assert.ok(keys.length >= 29);
  assert.deepEqual(Object.keys(messages.en).filter((key) => key.startsWith("teacherMessages.")).sort(), keys);
  assert.deepEqual(Object.keys(messages.ru).filter((key) => key.startsWith("teacherMessages.")).sort(), keys);
});

test("teacher messages page localizes cached conversations without changing messaging behavior", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "teacher-messages.html"), "utf8");
  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/teacher-sidebar.js"></script>'));
  assert.match(page, /data-i18n="teacherMessages\.heading"/);
  assert.match(page, /data-i18n-placeholder="teacherMessages\.searchPlaceholder"/);
  assert.match(page, /function teacherMessagesT\(key, params\)/);
  assert.match(page, /toLocaleTimeString\(teacherMessagesLocale\(\)/);
  assert.match(page, /authFetch\("\/teacher\/conversations"\)/);
  assert.match(page, /authFetch\("\/teacher\/conversations\/"\+selectedStudent\.id\+"\/messages"\)/);
  assert.match(page, /body:JSON\.stringify\(\{message:text\}\)/);
  assert.match(page, /s\.on\("teacherMessage"/);

  const handler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\n    \}\);/);
  assert.ok(handler);
  assert.match(handler[1], /renderConversations\(\)/);
  assert.match(handler[1], /renderSelectedConversation\(\)/);
  assert.match(handler[1], /renderMessages\(\)/);
  assert.doesNotMatch(handler[1], /loadConversations\(|loadMessages\(|bindMessageSocket\(/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`));
});

test("teacher resources translations have matching Uzbek, English and Russian coverage", () => {
  const keys = Object.keys(messages.uz).filter((key) => key.startsWith("teacherResources.")).sort();
  assert.ok(keys.length >= 75);
  assert.deepEqual(Object.keys(messages.en).filter((key) => key.startsWith("teacherResources.")).sort(), keys);
  assert.deepEqual(Object.keys(messages.ru).filter((key) => key.startsWith("teacherResources.")).sort(), keys);
});

test("teacher resources page localizes cached resources without changing upload and download behavior", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "teacher-resources.html"), "utf8");
  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/teacher-sidebar.js"></script>'));
  assert.match(page, /data-i18n="teacherResources\.heading"/);
  assert.match(page, /data-i18n-placeholder="teacherResources\.searchPlaceholder"/);
  assert.match(page, /function resourcesT\(key, params\)/);
  assert.match(page, /function resourceApiError\(data, fallbackKey\)/);
  assert.match(page, /toLocaleDateString\(resourcesLocale\(\)/);
  assert.match(page, /authFetch\("\/teacher\/resources"\)/);
  assert.match(page, /fetch\("\/teacher\/resources\/" \+ id \+ "\/download"/);
  assert.match(page, /authFetch\("\/teacher\/resources\/" \+ id, \{ method: "DELETE" \}\)/);
  assert.match(page, /fetch\("\/teacher\/resources", \{/);
  assert.match(page, /body: fd/);
  assert.match(page, /authFetch\("\/teacher\/classes"\)/);

  const handler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\n    \}\);/);
  assert.ok(handler);
  assert.match(handler[1], /renderStats\(currentStats\)/);
  assert.match(handler[1], /renderTypeDonut\(currentByType\)/);
  assert.match(handler[1], /renderTable\(filteredRes\)/);
  assert.match(handler[1], /renderUploadClassOptions\(\)/);
  assert.doesNotMatch(handler[1], /loadResources\(|loadUploadClasses\(/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`));
});

test("teacher AI translations have matching Uzbek, English and Russian coverage", () => {
  const keys = Object.keys(messages.uz).filter((key) => key.startsWith("teacherAi.")).sort();
  assert.ok(keys.length >= 95);
  assert.deepEqual(Object.keys(messages.en).filter((key) => key.startsWith("teacherAi.")).sort(), keys);
  assert.deepEqual(Object.keys(messages.ru).filter((key) => key.startsWith("teacherAi.")).sort(), keys);
});

test("teacher AI page localizes cached reports without changing report APIs", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "teacher-ai.html"), "utf8");
  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/teacher-sidebar.js"></script>'));
  assert.match(page, /data-i18n="teacherAi\.heading"/);
  assert.match(page, /data-i18n-placeholder="teacherAi\.searchPlaceholder"/);
  assert.match(page, /function teacherAiT\(key, params\)/);
  assert.match(page, /toLocaleDateString\(teacherAiLocale\(\)/);
  assert.match(page, /authFetch\("\/teacher\/ai-reports"\)/);
  assert.match(page, /authFetch\("\/teacher\/ai-reports\/" \+ id\)/);
  assert.match(page, /authFetch\("\/teacher\/classes"\)/);
  assert.match(page, /authFetch\("\/ai\/reports\/teacher\/classes\/" \+ classId \+ "\/weekly", \{ method: "POST" \}\)/);

  const handler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\n    \}\);/);
  assert.ok(handler);
  assert.match(handler[1], /renderStats\(currentStats\)/);
  assert.match(handler[1], /renderList\(\)/);
  assert.match(handler[1], /renderGenClassOptions\(\)/);
  assert.match(handler[1], /renderViewHeader\(\)/);
  assert.match(handler[1], /renderCurrentViewBody\(\)/);
  assert.doesNotMatch(handler[1], /loadReports\(|loadGenClasses\(|fetchReportContent\(/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`));
});

test("teacher settings translations have matching Uzbek, English and Russian coverage", () => {
  const keys = Object.keys(messages.uz).filter((key) => key.startsWith("teacherSettings.")).sort();
  assert.ok(keys.length >= 85);
  assert.deepEqual(Object.keys(messages.en).filter((key) => key.startsWith("teacherSettings.")).sort(), keys);
  assert.deepEqual(Object.keys(messages.ru).filter((key) => key.startsWith("teacherSettings.")).sort(), keys);
});

test("teacher settings page localizes forms without changing profile and password APIs", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "teacher-settings.html"), "utf8");
  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/teacher-sidebar.js"></script>'));
  assert.match(page, /data-i18n="teacherSettings\.heading"/);
  assert.match(page, /data-i18n-placeholder="teacherSettings\.bioPlaceholder"/);
  assert.match(page, /function settingsT\(key, params\)/);
  assert.match(page, /toLocaleDateString\(settingsLocale\(\)/);
  assert.match(page, /authFetch\("\/teacher\/settings\/profile"\)/);
  assert.match(page, /authFetch\("\/teacher\/settings\/profile", \{/);
  assert.match(page, /method: "PUT"/);
  assert.match(page, /authFetch\("\/teacher\/settings\/password", \{/);
  assert.match(page, /method: "POST"/);
  assert.match(page, /authFetch\("\/profile\/" \+ user\.id \+ "\/picture", \{ method: "POST", body: form \}\)/);
  assert.match(page, /authFetch\("\/me\/subscription"\)/);

  const handler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\n    \}\);/);
  assert.ok(handler);
  assert.match(handler[1], /renderJoinDate\(\)/);
  assert.match(handler[1], /switchTab\(currentSettingsTab\)/);
  assert.match(handler[1], /renderPremiumState\(\)/);
  assert.doesNotMatch(handler[1], /loadServerProfile\(|loadPremium\(|authFetch\(/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`));
});

test("school admin translations have matching Uzbek, English and Russian coverage", () => {
  const keys = Object.keys(messages.uz).filter((key) => key.startsWith("schoolAdmin.")).sort();
  assert.ok(keys.length >= 19);
  assert.deepEqual(Object.keys(messages.en).filter((key) => key.startsWith("schoolAdmin.")).sort(), keys);
  assert.deepEqual(Object.keys(messages.ru).filter((key) => key.startsWith("schoolAdmin.")).sort(), keys);
});

test("school admin dashboard localizes cached overview without changing its API", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "school-admin.html"), "utf8");
  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="schoolAdmin\.students"/);
  assert.match(page, /data-i18n="schoolAdmin\.topStudents"/);
  assert.match(page, /function schoolAdminT\(key, params\)/);
  assert.match(page, /authFetch\("\/school\/overview"\)/);
  assert.match(page, /overviewData = d/);
  assert.match(page, /overviewState = "ready"/);
  assert.match(page, /window\.location\.href=\\?'\/school-tournaments\.html\\?'/);

  const handler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\}\);/);
  assert.ok(handler);
  assert.match(handler[1], /renderOverview\(overviewData\)/);
  assert.doesNotMatch(handler[1], /loadOverview\(|authFetch\(/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`));
});

test("school admin profile translations have matching Uzbek, English and Russian coverage", () => {
  const keys = Object.keys(messages.uz).filter((key) => key.startsWith("schoolAdminProfile.")).sort();
  assert.ok(keys.length >= 28);
  assert.deepEqual(Object.keys(messages.en).filter((key) => key.startsWith("schoolAdminProfile.")).sort(), keys);
  assert.deepEqual(Object.keys(messages.ru).filter((key) => key.startsWith("schoolAdminProfile.")).sort(), keys);
});

test("school admin profile localizes cached data without changing profile APIs", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "school-admin-profile.html"), "utf8");
  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="schoolAdminProfile\.heading"/);
  assert.match(page, /data-i18n="schoolAdminProfile\.personalInfo"/);
  assert.match(page, /data-i18n-title="schoolAdminProfile\.changePicture"/);
  assert.match(page, /function schoolAdminProfileT\(key, params\)/);
  assert.match(page, /new Intl\.DateTimeFormat\(schoolAdminProfileLocale\(\)/);
  assert.match(page, /authFetch\("\/school\/profile"\)/);
  assert.match(page, /authFetch\("\/profile\/" \+ user\.id \+ "\/picture", \{ method: "POST", body: fd \}\)/);
  assert.match(page, /schoolProfileData = await r\.json\(\)/);
  assert.match(page, /schoolProfileState = "ready"/);
  assert.match(page, /href="\/school-admin\.html"/);
  assert.match(page, /href="\/school-tournaments\.html"/);

  const handler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\}\);/);
  assert.ok(handler);
  assert.match(handler[1], /renderProfile\(schoolProfileData\)/);
  assert.doesNotMatch(handler[1], /loadProfile\(|authFetch\(/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`));
});

test("school tournament translations have matching Uzbek, English and Russian coverage", () => {
  const keys = Object.keys(messages.uz).filter((key) => key.startsWith("schoolTournaments.")).sort();
  assert.ok(keys.length >= 69);
  assert.deepEqual(Object.keys(messages.en).filter((key) => key.startsWith("schoolTournaments.")).sort(), keys);
  assert.deepEqual(Object.keys(messages.ru).filter((key) => key.startsWith("schoolTournaments.")).sort(), keys);
});

test("school tournaments localizes cached lists, bracket and team without changing APIs", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "school-tournaments.html"), "utf8");
  assert.ok(page.indexOf('<script src="/i18n.js"></script>') < page.indexOf('<script src="/sidebar.js"></script>'));
  assert.match(page, /data-i18n="schoolTournaments\.heading"/);
  assert.match(page, /data-i18n="schoolTournaments\.bracketTitle"/);
  assert.match(page, /data-i18n-placeholder="schoolTournaments\.searchPlaceholder"/);
  assert.match(page, /function schoolTournamentT\(key, params\)/);
  assert.match(page, /toLocaleString\(schoolTournamentLocale\(\)/);
  assert.doesNotMatch(page, /toLocaleString\("uz"/);
  assert.match(page, /authFetch\("\/school\/tournaments"\)/);
  assert.match(page, /authFetch\("\/school\/tournaments\/" \+ tid \+ "\/bracket"\)/);
  assert.match(page, /authFetch\("\/school\/tournaments\/" \+ tid \+ "\/students"\)/);
  assert.match(page, /authFetch\("\/school\/tournaments\/" \+ tid \+ "\/team"\)/);
  assert.match(page, /authFetch\("\/school\/tournaments\/" \+ tmTournament\.id \+ "\/team", \{/);
  assert.match(page, /body: JSON\.stringify\(\{ starters: tmStarters, reserves: tmReserves \}\)/);
  assert.match(page, /tournamentsData = await r\.json\(\)/);
  assert.match(page, /currentBracketData = await r\.json\(\)/);

  const handler = page.match(/window\.addEventListener\("ilmliga:languagechange", function \(\) \{([\s\S]*?)\}\);/);
  assert.ok(handler);
  assert.match(handler[1], /renderTournamentList\(\)/);
  assert.match(handler[1], /renderBracket\(currentBracketData\)/);
  assert.match(handler[1], /renderTeamModalCopy\(\)/);
  assert.doesNotMatch(handler[1], /loadTournaments\(|openBracket\(|openTeamModal\(|authFetch\(/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`));
});

test("admin translations have matching Uzbek, English and Russian coverage", () => {
  const adminI18n = require("../public/admin-i18n.js");
  const keys = Object.keys(adminI18n.messages.uz).sort();
  assert.ok(keys.length >= 300);
  assert.deepEqual(Object.keys(adminI18n.messages.en).sort(), keys);
  assert.deepEqual(Object.keys(adminI18n.messages.ru).sort(), keys);
  assert.equal(adminI18n.translate("12 ta (shu sahifada)", "en"), "12 (on this page)");
  assert.equal(adminI18n.translate("1–20 / jami 48 ta savol", "ru"), "1–20 / всего 48 вопросов");
  assert.equal(adminI18n.translate("Loading...", "ru"), "Загрузка...");
});

test("admin page localizes static and dynamic UI without changing admin APIs", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "admin.html"), "utf8");
  const adminModule = fs.readFileSync(path.join(__dirname, "..", "public", "admin-i18n.js"), "utf8");
  const sharedIndex = page.indexOf('<script src="/i18n.js"></script>');
  const adminIndex = page.indexOf('<script src="/admin-i18n.js"></script>');
  const analysisIndex = page.indexOf('<script src="/admin-question-analysis.js"></script>');

  assert.ok(sharedIndex >= 0 && sharedIndex < adminIndex);
  assert.ok(adminIndex < analysisIndex);
  assert.equal((page.match(/class="admin-language-switch"/g) || []).length, 2);
  assert.match(page, /window\.AdminI18n\.setLanguage\(this\.value\)/);
  assert.match(page, /fetch\("\/admin\/login", \{ method: "POST"/);
  assert.match(page, /"Authorization": "Bearer " \+ ADMIN_TOKEN/);
  assert.match(adminModule, /new root\.MutationObserver/);
  assert.match(adminModule, /IlmLigaI18n\.setLanguage\(code\)/);
  assert.match(adminModule, /attributeFilter: \["placeholder", "title", "aria-label"\]/);

  const analysis = fs.readFileSync(path.join(__dirname, "..", "public", "admin-question-analysis.js"), "utf8");
  assert.match(analysis, /\/admin\/questions\/" \+ id \+ "\/analysis/);
  assert.match(analysis, /\/admin\/questions\/" \+ currentQuestionId \+ "\/analysis\/review/);
  assert.match(analysis, /\/admin\/questions\/analysis\/review-queue\?filter=/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`));
});

test("battle translations have matching Uzbek, English and Russian coverage", () => {
  const battleI18n = require("../public/battle-i18n.js");
  const keys = Object.keys(battleI18n.messages.uz).sort();
  assert.ok(keys.length >= 130);
  assert.deepEqual(Object.keys(battleI18n.messages.en).sort(), keys);
  assert.deepEqual(Object.keys(battleI18n.messages.ru).sort(), keys);
  assert.equal(battleI18n.translate("Battle 3 soniyada boshlanadi", "en"), "Battle starts in 3 seconds");
  assert.equal(battleI18n.translate("Savol 8 / 20", "ru"), "Вопрос 8 / 20");
  assert.equal(battleI18n.translate("Ali rematch'ni rad etdi.", "en"), "Ali declined the rematch.");
});

test("battle page localizes its lifecycle without changing sockets, persistence or report APIs", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "battle.html"), "utf8");
  const moduleSource = fs.readFileSync(path.join(__dirname, "..", "public", "battle-i18n.js"), "utf8");
  const leaguesIndex = page.indexOf('<script src="/leagues.js"></script>');
  const sharedIndex = page.indexOf('<script src="/i18n.js"></script>');
  const battleIndex = page.indexOf('<script src="/battle-i18n.js"></script>');

  assert.ok(leaguesIndex >= 0 && leaguesIndex < sharedIndex);
  assert.ok(sharedIndex < battleIndex);
  assert.match(page, /const socket = io\(\{ auth: \{ token: localStorage\.getItem\("token"\) \} \}\)/);
  assert.match(page, /socket\.emit\("findMatch"/);
  assert.match(page, /socket\.on\("matchFound"/);
  assert.match(page, /socket\.on\("battle:resumeState"/);
  assert.match(page, /socket\.emit\("battle:reconnectCheck"/);
  assert.match(page, /sessionStorage\.setItem\(BATTLE_SEARCH_STATE_KEY/);
  assert.match(page, /sessionStorage\.setItem\(BATTLE_FOUND_STATE_KEY/);
  assert.match(page, /fetch\("\/flags\/report", \{/);
  assert.match(moduleSource, /new root\.MutationObserver/);
  assert.match(moduleSource, /#qText,#options,#brChatList/);
  assert.match(moduleSource, /attributeFilter: \["placeholder", "title", "aria-label"\]/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`));
});

test("team battle translations have matching Uzbek, English and Russian coverage", () => {
  const teamBattleI18n = require("../public/team-battle-i18n.js");
  const keys = Object.keys(teamBattleI18n.messages.uz).sort();
  assert.ok(keys.length >= 75);
  assert.deepEqual(Object.keys(teamBattleI18n.messages.en).sort(), keys);
  assert.deepEqual(Object.keys(teamBattleI18n.messages.ru).sort(), keys);
  assert.equal(teamBattleI18n.translate("Savol 2 / 20", "en"), "Question 2 / 20");
  assert.equal(
    teamBattleI18n.translate("Sizning shaxsiy hissangiz: 8 / 10 to'g'ri javob", "ru"),
    "Ваш вклад: 8 / 10 правильных ответов",
  );
  assert.equal(teamBattleI18n.translate("1st Player Progress", "ru"), "Прогресс игрока: 1st");
});

test("team battle page localizes its lifecycle without changing sockets, persistence or APIs", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "team-battle.html"), "utf8");
  const moduleSource = fs.readFileSync(path.join(__dirname, "..", "public", "team-battle-i18n.js"), "utf8");
  const socketIndex = page.indexOf('<script src="/socket.io/socket.io.js"></script>');
  const sharedIndex = page.indexOf('<script src="/i18n.js"></script>');
  const teamIndex = page.indexOf('<script src="/team-battle-i18n.js"></script>');

  assert.ok(socketIndex >= 0 && socketIndex < sharedIndex);
  assert.ok(sharedIndex < teamIndex);
  assert.match(page, /socket\.emit\("findTeamMatch"/);
  assert.match(page, /socket\.emit\("joinPartyMatch"/);
  assert.match(page, /socket\.on\("team:resumeState"/);
  assert.match(page, /socket\.on\("teamBattleEnd"/);
  assert.match(page, /socket\.emit\("submitTeamAnswer"/);
  assert.match(page, /sessionStorage\.setItem\("teamBattleActiveRoom"/);
  assert.match(page, /sessionStorage\.setItem\("teamBattleResultRoom"/);
  assert.match(page, /fetch\("\/team-battle\/result\/"/);
  assert.match(page, /fetch\("\/flags\/report", \{/);
  assert.match(moduleSource, /new root\.MutationObserver/);
  assert.match(moduleSource, /#btQText,#btAnswers/);
  assert.match(moduleSource, /attributeFilter: \["placeholder", "title", "aria-label"\]/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`));
});

test("tournament battle translations have matching Uzbek, English and Russian coverage", () => {
  const tournamentBattleI18n = require("../public/tournament-battle-i18n.js");
  const keys = Object.keys(tournamentBattleI18n.messages.uz).sort();
  assert.ok(keys.length >= 35);
  assert.deepEqual(Object.keys(tournamentBattleI18n.messages.en).sort(), keys);
  assert.deepEqual(Object.keys(tournamentBattleI18n.messages.ru).sort(), keys);

  const originalI18n = globalThis.IlmLigaI18n;
  globalThis.IlmLigaI18n = { getLanguage: () => "en" };
  assert.equal(tournamentBattleI18n.t("questionProgress", { current: 4, total: 20 }), "Question 4 / 20");
  globalThis.IlmLigaI18n = { getLanguage: () => "ru" };
  assert.equal(tournamentBattleI18n.t("readyCount", { ready: 3, total: 5 }), "3 / 5 готовы");
  globalThis.IlmLigaI18n = originalI18n;
});

test("tournament battle page localizes its lifecycle without changing sockets, auth or APIs", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "tournament-battle.html"), "utf8");
  const socketIndex = page.indexOf('<script src="/socket.io/socket.io.js"></script>');
  const sharedIndex = page.indexOf('<script src="/i18n.js"></script>');
  const tournamentIndex = page.indexOf('<script src="/tournament-battle-i18n.js"></script>');

  assert.ok(socketIndex >= 0 && socketIndex < sharedIndex);
  assert.ok(sharedIndex < tournamentIndex);
  assert.match(page, /const socket = io\(\{ auth: \{ token: localStorage\.getItem\("token"\) \} \}\)/);
  assert.match(page, /socket\.on\("checkinUpdate"/);
  assert.match(page, /socket\.on\("matchLiveStart"/);
  assert.match(page, /socket\.on\("scoreUpdate"/);
  assert.match(page, /socket\.on\("matchFinished"/);
  assert.match(page, /authFetch\("\/tournament\/match\/" \+ matchId \+ "\/checkin-state"\)/);
  assert.match(page, /authFetch\("\/tournament\/match\/" \+ matchId \+ "\/battle-state"\)/);
  assert.match(page, /authFetch\("\/tournament\/match\/" \+ matchId \+ "\/answer"/);
  assert.match(page, /authFetch\("\/tournament\/match\/" \+ matchId \+ "\/finish"/);
  assert.match(page, /authFetch\("\/tournament\/match\/" \+ matchId \+ "\/checkin"/);
  assert.match(page, /id="tbContent"/);
  assert.doesNotMatch(page, /data-tb-i18n[^>]*class="tb-qtext"/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`));
});

test("fallback dashboard translations have matching Uzbek, English and Russian coverage", () => {
  const dashboardI18n = require("../public/dashboard-i18n.js");
  const keys = Object.keys(dashboardI18n.messages.uz).sort();
  assert.ok(keys.length >= 14);
  assert.deepEqual(Object.keys(dashboardI18n.messages.en).sort(), keys);
  assert.deepEqual(Object.keys(dashboardI18n.messages.ru).sort(), keys);

  const originalI18n = globalThis.IlmLigaI18n;
  globalThis.IlmLigaI18n = { getLanguage: () => "en" };
  assert.equal(dashboardI18n.t("welcomeNamed", { name: "Jasur" }), "Welcome, Jasur!");
  globalThis.IlmLigaI18n = { getLanguage: () => "ru" };
  assert.equal(dashboardI18n.t("schoolAdminName"), "Администратор школы");
  globalThis.IlmLigaI18n = originalI18n;
});

test("fallback dashboard localizes its copy without changing auth or role redirects", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "dashboard.html"), "utf8");
  const apiIndex = page.indexOf('<script src="/api.js"></script>');
  const sharedIndex = page.indexOf('<script src="/i18n.js"></script>');
  const dashboardIndex = page.indexOf('<script src="/dashboard-i18n.js"></script>');

  assert.ok(apiIndex >= 0 && apiIndex < sharedIndex);
  assert.ok(sharedIndex < dashboardIndex);
  assert.match(page, /const userData = localStorage\.getItem\("user"\)/);
  assert.match(page, /teacher: "\/teacher\.html"/);
  assert.match(page, /parent: "\/parent\.html"/);
  assert.match(page, /school_admin: "\/school-admin\.html"/);
  assert.match(page, /student: "\/lobby\.html"/);
  assert.match(page, /window\.location\.replace\(ROLE_PANEL\[role\]\)/);
  assert.match(page, /localStorage\.removeItem\("user"\)/);
  assert.match(page, /localStorage\.removeItem\("token"\)/);
  assert.match(page, /ilmliga:languagechange/);

  const inlineScripts = [...page.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`));
});
