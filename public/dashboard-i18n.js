(function (root) {
  "use strict";

  var messages = {
    uz: {
      metaTitle: "Boshqaruv paneli — Knowledge Arena",
      logout: "Chiqish",
      roleFallback: "Rol",
      comingSoonTitle: "Bu panel tez orada tayyor bo‘ladi",
      comingSoonDescription: "Biz bu bo‘lim ustida ishlayapmiz. Tez orada to‘liq imkoniyatlar paydo bo‘ladi.",
      footer: "© 2025 Knowledge Arena. Barcha huquqlar himoyalangan.",
      welcomeDefault: "Xush kelibsiz!",
      welcomeNamed: "Xush kelibsiz, {name}!",
      teacherName: "O‘qituvchi",
      teacherDescription: "O‘qituvchi sifatida siz sinflar yaratishingiz, o‘quvchilarni qo‘shishingiz va ularning natijalarini kuzatishingiz mumkin bo‘ladi.",
      parentName: "Ota-ona",
      parentDescription: "Ota-ona sifatida siz farzandingizning o‘qish jarayonini, natijalarini va yutuqlarini kuzatib borishingiz mumkin bo‘ladi.",
      schoolAdminName: "Maktab admini",
      schoolAdminDescription: "Maktab admini sifatida siz maktabingiz statistikasini, o‘qituvchilarni va umumiy ko‘rsatkichlarni boshqarishingiz mumkin bo‘ladi."
    },
    en: {
      metaTitle: "Dashboard — Knowledge Arena",
      logout: "Log out",
      roleFallback: "Role",
      comingSoonTitle: "This dashboard will be ready soon",
      comingSoonDescription: "We are working on this section. Its full functionality will be available soon.",
      footer: "© 2025 Knowledge Arena. All rights reserved.",
      welcomeDefault: "Welcome!",
      welcomeNamed: "Welcome, {name}!",
      teacherName: "Teacher",
      teacherDescription: "As a teacher, you will be able to create classes, add students, and monitor their results.",
      parentName: "Parent",
      parentDescription: "As a parent, you will be able to monitor your child’s learning process, results, and achievements.",
      schoolAdminName: "School administrator",
      schoolAdminDescription: "As a school administrator, you will be able to manage your school’s statistics, teachers, and overall performance."
    },
    ru: {
      metaTitle: "Панель управления — Knowledge Arena",
      logout: "Выйти",
      roleFallback: "Роль",
      comingSoonTitle: "Эта панель скоро будет готова",
      comingSoonDescription: "Мы работаем над этим разделом. Вскоре станут доступны все его возможности.",
      footer: "© 2025 Knowledge Arena. Все права защищены.",
      welcomeDefault: "Добро пожаловать!",
      welcomeNamed: "Добро пожаловать, {name}!",
      teacherName: "Учитель",
      teacherDescription: "Как учитель, вы сможете создавать классы, добавлять учеников и отслеживать их результаты.",
      parentName: "Родитель",
      parentDescription: "Как родитель, вы сможете следить за процессом обучения, результатами и достижениями своего ребёнка.",
      schoolAdminName: "Администратор школы",
      schoolAdminDescription: "Как администратор школы, вы сможете управлять статистикой школы, учителями и общими показателями."
    }
  };

  function language() {
    return root.IlmLigaI18n ? root.IlmLigaI18n.getLanguage() : "uz";
  }

  function format(text, params) {
    return String(text).replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
      return params && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : "{" + key + "}";
    });
  }

  function t(key, params) {
    var selected = messages[language()] || messages.uz;
    var value = selected[key] == null ? messages.uz[key] : selected[key];
    return format(value == null ? key : value, params);
  }

  function apply(scope) {
    var documentRef = root.document;
    if (!documentRef) return;
    var target = scope || documentRef;
    if (documentRef.documentElement) documentRef.documentElement.lang = language();
    if (!target.querySelectorAll) return;
    target.querySelectorAll("[data-dashboard-i18n]").forEach(function (element) {
      element.textContent = t(element.getAttribute("data-dashboard-i18n"));
    });
  }

  var api = { apply: apply, messages: messages, t: t };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DashboardI18n = api;
  apply();
})(typeof window !== "undefined" ? window : globalThis);
