(function () {
  "use strict";

  const LANGUAGE_KEY = "ilmliga_language";
  const languages = {
    uz: { code: "uz", countryCode: "UZ", name: "O‘zbekcha" },
    en: { code: "en", countryCode: "GB", name: "English" },
    ru: { code: "ru", countryCode: "RU", name: "Русский" },
  };

  const messages = {
    uz: {
      "meta.title": "IlmLiga — O‘rgan. Kurash. Yuksal.",
      "meta.description": "Ingliz tilini o‘rganing, bilim janglarida bellashing va reytingda yuksaling.",
      "common.homeAria": "IlmLiga bosh sahifasi",
      "common.languageSwitch": "Tilni almashtirish",
      "common.choosePhoneCountry": "Telefon kodi uchun davlatni tanlang",
      "common.close": "Yopish",
      "common.showPassword": "Parolni ko‘rsatish",
      "common.hidePassword": "Parolni yashirish",
      "common.otpCode": "Tasdiqlash kodi",
      "common.otpDigit": "Tasdiqlash kodining {number}-raqami",
      "language.title": "Tilni tanlang",
      "language.subtitle": "Ilova tilini tanlang",
      "language.continue": "Davom etish",
      "welcome.tagline": "O‘rgan. Kurash. Yuksal.",
      "welcome.kicker": "Ingliz tilini yangicha o‘rganing",
      "welcome.title": "Bilim uchun kurash",
      "welcome.subtitle": "Ingliz tilini o‘rgan, jangda g‘olib chiq va reytingda ko‘taril",
      "welcome.register": "Ro‘yxatdan o‘tish",
      "welcome.login": "Kirish",
      "login.back": "Orqaga",
      "login.title": "Hisobingizga kiring",
      "login.subtitle": "Telefon raqami va parolingizni kiriting",
      "login.phone": "Telefon raqami",
      "login.password": "Parol",
      "login.passwordPlaceholder": "Parolingiz",
      "login.submit": "Kirish",
      "login.forgot": "Parolni unutdingizmi?",
      "login.noAccount": "Hisobingiz yo‘qmi?",
      "login.signup": "Ro‘yxatdan o‘tish",
      "forgot.title": "Parolni tiklash",
      "forgot.subtitle": "Ro‘yxatdan o‘tgan telefon raqamingizga tasdiqlash kodi yuboramiz",
      "forgot.submit": "Kodni yuborish",
      "reset.title": "Yangi parol",
      "reset.subtitle": "6 xonali kodni kiriting va yangi parol o‘rnating",
      "reset.password": "Yangi parol",
      "reset.confirm": "Parolni tasdiqlang",
      "reset.submit": "Parolni yangilash",
      "register.phoneTitle": "Xush kelibsiz!",
      "register.phoneSubtitle": "Davom etish uchun telefon raqamingizni kiriting",
      "register.phoneLabel": "Telefon raqami",
      "register.sendCode": "Kodni yuborish",
      "register.phoneHint": "Kod SMS orqali yuboriladi va faqat siz ko‘rasiz",
      "register.otpTitle": "Tasdiqlash kodi",
      "register.otpSubtitle": "raqamiga yuborilgan 6 xonali kodni kiriting",
      "register.verify": "Tasdiqlash",
      "register.resend": "Kodni qayta yuborish",
      "register.profileTitle": "Profil ma’lumotlari",
      "register.profileSubtitle": "Hisobingizni yakunlash uchun ma’lumotlarni kiriting",
      "register.firstName": "Ism",
      "register.firstNamePlaceholder": "Ismingiz",
      "register.lastName": "Familiya",
      "register.lastNamePlaceholder": "Familiyangiz",
      "register.password": "Parol",
      "register.passwordPlaceholder": "Kamida 8 belgi, harf va raqam",
      "register.confirm": "Parolni tasdiqlang",
      "register.confirmPlaceholder": "Parolni qayta kiriting",
      "register.region": "Viloyat",
      "register.regionPlaceholder": "Viloyatni tanlang",
      "register.district": "Tuman yoki shahar",
      "register.districtPlaceholder": "Tumanni tanlang",
      "register.districtFirst": "Avval viloyatni tanlang",
      "register.school": "Maktab",
      "register.schoolPlaceholder": "Maktabni tanlang",
      "register.schoolFirst": "Avval tumanni tanlang",
      "register.username": "Username",
      "register.usernameNeutral": "5–32 belgi: a-z, 0-9 va _",
      "register.submit": "Ro‘yxatdan o‘tish",
      "register.stepPhone": "Telefon",
      "register.stepOtp": "Tasdiqlash",
      "register.stepRole": "Rol",
      "register.stepProfile": "Profil",
      "register.roleTitle": "IlmLiga dan qanday foydalanasiz?",
      "register.roleSubtitle": "Sizga mos imkoniyatlarni tayyorlashimiz uchun hisob turini tanlang",
      "register.roleStudent": "O‘quvchi",
      "register.roleStudentText": "Ingliz tilini o‘rganaman, topshiriq bajaraman va reytingda qatnashaman",
      "register.roleStudentFeature": "Battle • Practice • Sinflar",
      "register.roleTeacher": "O‘qituvchi",
      "register.roleTeacherText": "Sinflar yarataman, topshiriq beraman va o‘quvchilar natijasini kuzataman",
      "register.roleTeacherFeature": "Sinf • Davomat • Hisobot",
      "register.roleParent": "Ota-ona",
      "register.roleParentText": "Farzandimning o‘qishi, faolligi va natijalarini xavfsiz kuzataman",
      "register.roleParentFeature": "Farzand • Progress • AI hisobot",
      "register.roleSecurity": "Rol keyinchalik faqat administrator tasdig‘i bilan o‘zgartiriladi.",
      "register.selectedRole": "Tanlangan hisob turi",
      "register.changeRole": "O‘zgartirish",
      "register.parentProfileSubtitle": "Shaxsiy ma’lumotlaringizni kiriting — farzandingizni xavfsiz kod orqali keyin bog‘laysiz",
      "register.teacherProfileSubtitle": "O‘qituvchi profilingiz va ishlaydigan hududingizni kiriting",
      "register.metaTitle": "Ro‘yxatdan o‘tish — IlmLiga",
      "register.metaDescription": "IlmLiga hisobini yarating va ingliz tilini bilim janglari orqali o‘rganishni boshlang.",
      "register.progressAria": "Ro‘yxatdan o‘tish bosqichlari",
      "register.privacyConsent": "IlmLiga akkauntini yaratish orqali platforma qoidalari va maxfiylik shartlariga rozilik bildirasiz.",
      "register.schoolOption": "{number}-maktab",
      "register.secondsShort": "son",
      "register.haveAccount": "Allaqachon hisobingiz bormi?",
      "common.back": "Orqaga",
      "common.selectCountry": "Davlatni tanlang",
      "common.searchCountry": "Davlat nomi yoki kodi",
      "common.loading": "Yuklanmoqda...",
      "common.serverError": "Server bilan aloqa qilib bo‘lmadi",
      "common.passwordMismatch": "Parollar mos kelmayapti",
      "common.passwordMatch": "Parollar mos",
      "common.weakPassword": "Kamida 8 belgi, bitta harf va bitta raqam kerak",
      "common.goodPassword": "Yaxshi parol",
      "common.strongPassword": "Kuchli parol",
      "common.usernameChecking": "Tekshirilyapti...",
      "common.usernameAvailable": "Bu username bo‘sh — foydalanishingiz mumkin",
      "common.usernameTaken": "Bu username band — boshqasini tanlang",
      "common.usernameInvalid": "5–32 belgi kiriting; faqat a-z, 0-9 va _ mumkin",
      "common.phoneInvalid": "Telefon raqamini to‘liq kiriting",
      "common.codeResent": "Yangi kod yuborildi",
      "common.registrationDone": "Hisob muvaffaqiyatli yaratildi",
      "common.resetDone": "Parolingiz yangilandi. Endi kirishingiz mumkin.",
    },
    en: {
      "meta.title": "IlmLiga — Learn. Compete. Rise.",
      "meta.description": "Learn English, compete in knowledge battles and climb the rankings.",
      "common.homeAria": "IlmLiga home page",
      "common.languageSwitch": "Change language",
      "common.choosePhoneCountry": "Choose a country calling code",
      "common.close": "Close",
      "common.showPassword": "Show password",
      "common.hidePassword": "Hide password",
      "common.otpCode": "Verification code",
      "common.otpDigit": "Verification code digit {number}",
      "language.title": "Choose language", "language.subtitle": "Select your app language", "language.continue": "Continue",
      "welcome.tagline": "Learn. Compete. Rise.", "welcome.kicker": "A new way to learn English", "welcome.title": "Battle for Knowledge", "welcome.subtitle": "Learn English, win battles and climb the rankings", "welcome.register": "Sign up", "welcome.login": "Log in",
      "login.back": "Back", "login.title": "Log in to your account", "login.subtitle": "Enter your phone number and password", "login.phone": "Phone number", "login.password": "Password", "login.passwordPlaceholder": "Your password", "login.submit": "Log in", "login.forgot": "Forgot password?", "login.noAccount": "Don’t have an account?", "login.signup": "Sign up",
      "forgot.title": "Reset password", "forgot.subtitle": "We will send a verification code to your registered phone number", "forgot.submit": "Send code",
      "reset.title": "New password", "reset.subtitle": "Enter the 6-digit code and set a new password", "reset.password": "New password", "reset.confirm": "Confirm password", "reset.submit": "Update password",
      "register.phoneTitle": "Welcome!", "register.phoneSubtitle": "Enter your phone number to continue", "register.phoneLabel": "Phone number", "register.sendCode": "Send code", "register.phoneHint": "The code will be sent via SMS and only you will see it", "register.otpTitle": "Verification code", "register.otpSubtitle": "Enter the 6-digit code sent to", "register.verify": "Verify", "register.resend": "Resend code", "register.profileTitle": "Profile details", "register.profileSubtitle": "Enter your details to complete your account", "register.firstName": "First name", "register.firstNamePlaceholder": "Your first name", "register.lastName": "Last name", "register.lastNamePlaceholder": "Your last name", "register.password": "Password", "register.passwordPlaceholder": "At least 8 characters, letters and numbers", "register.confirm": "Confirm password", "register.confirmPlaceholder": "Re-enter your password", "register.region": "Region", "register.regionPlaceholder": "Select region", "register.district": "District or city", "register.districtPlaceholder": "Select district", "register.districtFirst": "Select region first", "register.school": "School", "register.schoolPlaceholder": "Select school", "register.schoolFirst": "Select district first", "register.username": "Username", "register.usernameNeutral": "5–32 characters: a-z, 0-9 and _", "register.submit": "Sign up", "register.stepPhone": "Phone", "register.stepOtp": "Verify", "register.stepProfile": "Profile",
      "register.haveAccount": "Already have an account?",
      "common.back": "Back", "common.selectCountry": "Choose country", "common.searchCountry": "Country name or code", "common.loading": "Loading...", "common.serverError": "Could not connect to the server", "common.passwordMismatch": "Passwords don’t match", "common.passwordMatch": "Passwords match", "common.weakPassword": "Use at least 8 characters with a letter and a number", "common.goodPassword": "Good password", "common.strongPassword": "Strong password", "common.usernameChecking": "Checking...", "common.usernameAvailable": "This username is available", "common.usernameTaken": "This username is taken — choose another", "common.usernameInvalid": "Enter 5–32 characters; only a-z, 0-9 and _ are allowed", "common.phoneInvalid": "Enter the complete phone number", "common.codeResent": "New code sent", "common.registrationDone": "Account created successfully", "common.resetDone": "Password updated. You can now log in.",
    },
    ru: {
      "meta.title": "IlmLiga — Учись. Соревнуйся. Побеждай.",
      "meta.description": "Изучайте английский, участвуйте в битвах знаний и поднимайтесь в рейтинге.",
      "common.homeAria": "Главная страница IlmLiga",
      "common.languageSwitch": "Сменить язык",
      "common.choosePhoneCountry": "Выберите телефонный код страны",
      "common.close": "Закрыть",
      "common.showPassword": "Показать пароль",
      "common.hidePassword": "Скрыть пароль",
      "common.otpCode": "Код подтверждения",
      "common.otpDigit": "Цифра {number} кода подтверждения",
      "language.title": "Выберите язык", "language.subtitle": "Выберите язык приложения", "language.continue": "Продолжить",
      "welcome.tagline": "Учись. Соревнуйся. Побеждай.", "welcome.kicker": "Новый способ изучать английский", "welcome.title": "Битва за знания", "welcome.subtitle": "Учи английский, побеждай в битвах и поднимайся в рейтинге", "welcome.register": "Регистрация", "welcome.login": "Вход",
      "login.back": "Назад", "login.title": "Войдите в аккаунт", "login.subtitle": "Введите номер телефона и пароль", "login.phone": "Номер телефона", "login.password": "Пароль", "login.passwordPlaceholder": "Ваш пароль", "login.submit": "Войти", "login.forgot": "Забыли пароль?", "login.noAccount": "Нет аккаунта?", "login.signup": "Регистрация",
      "forgot.title": "Сброс пароля", "forgot.subtitle": "Мы отправим код подтверждения на зарегистрированный номер", "forgot.submit": "Отправить код",
      "reset.title": "Новый пароль", "reset.subtitle": "Введите 6-значный код и задайте новый пароль", "reset.password": "Новый пароль", "reset.confirm": "Подтвердите пароль", "reset.submit": "Обновить пароль",
      "register.phoneTitle": "Добро пожаловать!", "register.phoneSubtitle": "Введите номер телефона, чтобы продолжить", "register.phoneLabel": "Номер телефона", "register.sendCode": "Отправить код", "register.phoneHint": "Код будет отправлен по SMS, и только вы его увидите", "register.otpTitle": "Код подтверждения", "register.otpSubtitle": "Введите 6-значный код, отправленный на", "register.verify": "Подтвердить", "register.resend": "Отправить код повторно", "register.profileTitle": "Данные профиля", "register.profileSubtitle": "Введите данные для завершения регистрации", "register.firstName": "Имя", "register.firstNamePlaceholder": "Ваше имя", "register.lastName": "Фамилия", "register.lastNamePlaceholder": "Ваша фамилия", "register.password": "Пароль", "register.passwordPlaceholder": "Минимум 8 символов, буквы и цифры", "register.confirm": "Подтвердите пароль", "register.confirmPlaceholder": "Введите пароль ещё раз", "register.region": "Область", "register.regionPlaceholder": "Выберите область", "register.district": "Район или город", "register.districtPlaceholder": "Выберите район", "register.districtFirst": "Сначала выберите область", "register.school": "Школа", "register.schoolPlaceholder": "Выберите школу", "register.schoolFirst": "Сначала выберите район", "register.username": "Имя пользователя", "register.usernameNeutral": "5–32 символа: a-z, 0-9 и _", "register.submit": "Регистрация", "register.stepPhone": "Телефон", "register.stepOtp": "Проверка", "register.stepProfile": "Профиль",
      "register.haveAccount": "Уже есть аккаунт?",
      "common.back": "Назад", "common.selectCountry": "Выберите страну", "common.searchCountry": "Название или код страны", "common.loading": "Загрузка...", "common.serverError": "Не удалось подключиться к серверу", "common.passwordMismatch": "Пароли не совпадают", "common.passwordMatch": "Пароли совпадают", "common.weakPassword": "Минимум 8 символов, одна буква и одна цифра", "common.goodPassword": "Хороший пароль", "common.strongPassword": "Надёжный пароль", "common.usernameChecking": "Проверяется...", "common.usernameAvailable": "Это имя свободно", "common.usernameTaken": "Это имя занято — выберите другое", "common.usernameInvalid": "Введите 5–32 символа; разрешены только a-z, 0-9 и _", "common.phoneInvalid": "Введите полный номер телефона", "common.codeResent": "Новый код отправлен", "common.registrationDone": "Аккаунт успешно создан", "common.resetDone": "Пароль обновлён. Теперь можно войти.",
    },
  };

  Object.assign(messages.en, {
    "register.metaTitle": "Sign up — IlmLiga",
    "register.metaDescription": "Create an IlmLiga account and start learning English through knowledge battles.",
    "register.progressAria": "Sign-up steps",
    "register.privacyConsent": "By creating an IlmLiga account, you agree to the platform rules and privacy terms.",
    "register.schoolOption": "School {number}",
    "register.secondsShort": "s",
    "register.stepRole": "Role",
    "register.roleTitle": "How will you use IlmLiga?",
    "register.roleSubtitle": "Choose an account type so we can prepare the right experience",
    "register.roleStudent": "Student",
    "register.roleStudentText": "I learn English, complete assignments and compete in rankings",
    "register.roleStudentFeature": "Battle • Practice • Classes",
    "register.roleTeacher": "Teacher",
    "register.roleTeacherText": "I create classes, assign work and track student results",
    "register.roleTeacherFeature": "Classes • Attendance • Reports",
    "register.roleParent": "Parent",
    "register.roleParentText": "I securely track my child’s learning, activity and results",
    "register.roleParentFeature": "Child • Progress • AI report",
    "register.roleSecurity": "Your role can only be changed later with administrator approval.",
    "register.selectedRole": "Selected account type",
    "register.changeRole": "Change",
    "register.parentProfileSubtitle": "Enter your details — you can securely link your child using a code afterward",
    "register.teacherProfileSubtitle": "Enter your teacher profile and work location",
  });

  Object.assign(messages.ru, {
    "register.metaTitle": "Регистрация — IlmLiga",
    "register.metaDescription": "Создайте аккаунт IlmLiga и начните изучать английский через битвы знаний.",
    "register.progressAria": "Этапы регистрации",
    "register.privacyConsent": "Создавая аккаунт IlmLiga, вы соглашаетесь с правилами платформы и условиями конфиденциальности.",
    "register.schoolOption": "Школа №{number}",
    "register.secondsShort": "с",
    "register.stepRole": "Роль",
    "register.roleTitle": "Как вы будете использовать IlmLiga?",
    "register.roleSubtitle": "Выберите тип аккаунта, чтобы мы подготовили подходящие возможности",
    "register.roleStudent": "Ученик",
    "register.roleStudentText": "Я учу английский, выполняю задания и участвую в рейтингах",
    "register.roleStudentFeature": "Battle • Practice • Классы",
    "register.roleTeacher": "Учитель",
    "register.roleTeacherText": "Я создаю классы, даю задания и отслеживаю результаты учеников",
    "register.roleTeacherFeature": "Классы • Посещаемость • Отчёты",
    "register.roleParent": "Родитель",
    "register.roleParentText": "Я безопасно слежу за обучением и результатами ребёнка",
    "register.roleParentFeature": "Ребёнок • Прогресс • AI-отчёт",
    "register.roleSecurity": "Позже роль можно изменить только с одобрения администратора.",
    "register.selectedRole": "Тип аккаунта",
    "register.changeRole": "Изменить",
    "register.parentProfileSubtitle": "Введите данные — позже вы свяжете ребёнка безопасным кодом",
    "register.teacherProfileSubtitle": "Заполните профиль учителя и место работы",
  });

  const phoneRules = {
    UZ: { length: 9, groups: [2, 3, 2, 2], placeholder: "90 123 45 67" },
    KZ: { length: 10, groups: [3, 3, 2, 2], placeholder: "700 123 45 67" },
    KG: { length: 9, groups: [3, 3, 3], placeholder: "700 123 456" },
    TJ: { length: 9, groups: [2, 3, 2, 2], placeholder: "90 123 45 67" },
    TM: { length: 8, groups: [2, 2, 2, 2], placeholder: "65 12 34 56" },
    RU: { length: 10, groups: [3, 3, 2, 2], placeholder: "912 345 67 89" },
    TR: { length: 10, groups: [3, 3, 2, 2], placeholder: "532 123 45 67" },
    US: { length: 10, groups: [3, 3, 4], placeholder: "201 555 0123" },
    GB: { length: 10, groups: [4, 3, 3], placeholder: "7700 900 123" },
    PK: { length: 10, groups: [3, 3, 4], placeholder: "300 123 4567" },
  };

  let language = localStorage.getItem(LANGUAGE_KEY) || "uz";
  if (!languages[language]) language = "uz";
  let countriesCache = null;
  let countryCallback = null;
  let toastTimer = null;

  function t(key, params) {
    const template = (messages[language] && messages[language][key]) || messages.uz[key] || key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    ));
  }

  function logoSvg() {
    return '<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="authLogoBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a94ff"/><stop offset="1" stop-color="#3560e0"/></linearGradient><linearGradient id="authLogoWhite" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#dbe4ff"/></linearGradient></defs><path d="M44 36 L60 23 L76 36" fill="none" stroke="url(#authLogoWhite)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="47" cy="49" r="6" fill="url(#authLogoWhite)"/><rect x="41" y="60" width="12" height="34" rx="5" fill="url(#authLogoBlue)"/><rect x="62" y="49" width="12" height="45" rx="5" fill="url(#authLogoBlue)"/><rect x="62" y="82" width="26" height="12" rx="5" fill="url(#authLogoBlue)"/></svg>';
  }

  function flagIcon(code, modifier) {
    const normalized = String(code || "").trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(normalized)) return "";
    const extraClass = modifier ? " auth-flag--" + modifier : "";
    return '<span class="fi fi-' + normalized + ' auth-flag' + extraClass + '" aria-hidden="true"></span>';
  }

  const iconPaths = {
    "arrow-left": '<path d="m15 18-6-6 6-6"/><path d="M9 12h10"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    eye: '<path d="M2.1 12a10.8 10.8 0 0 1 19.8 0 10.8 10.8 0 0 1-19.8 0Z"/><circle cx="12" cy="12" r="3"/>',
    "eye-off": '<path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 4.2A10.8 10.8 0 0 1 21.9 12a10.7 10.7 0 0 1-2.1 3.2"/><path d="M6.6 6.6A10.8 10.8 0 0 0 2.1 12a10.8 10.8 0 0 0 14.3 5.4"/>',
    sparkles: '<path d="m12 3-1.2 3.2a3 3 0 0 1-1.8 1.8L6 9l3 1.1a3 3 0 0 1 1.8 1.8L12 15l1.2-3.1a3 3 0 0 1 1.8-1.8L18 9l-3-1a3 3 0 0 1-1.8-1.8L12 3Z"/><path d="m5 16-.6 1.4A2.7 2.7 0 0 1 3 18l1.4.6A2.7 2.7 0 0 1 5 20l.6-1.4A2.7 2.7 0 0 1 7 18l-1.4-.6A2.7 2.7 0 0 1 5 16Z"/><path d="m19 14-.5 1.2a2 2 0 0 1-1.2 1.2L16 17l1.3.5a2 2 0 0 1 1.2 1.2L19 20l.5-1.3a2 2 0 0 1 1.2-1.2L22 17l-1.3-.6a2 2 0 0 1-1.2-1.2L19 14Z"/>',
    trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4"/><path d="M17 6h3v2a4 4 0 0 1-4 4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    "graduation-cap": '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
    presentation: '<path d="M2 3h20v14H2z"/><path d="m8 21 4-4 4 4"/><path d="M7 8h2v4H7zM11 6h2v6h-2zM15 9h2v3h-2z"/>',
    "heart-handshake": '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/><path d="m12 5-2.2 2.2a2 2 0 0 0 2.8 2.8L14 8.6a3.5 3.5 0 0 1 5 0l2.2 2.2"/>',
    "shield-check": '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z"/><path d="m9 12 2 2 4-4"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
  };

  function iconSvg(name, className) {
    const path = iconPaths[name];
    if (!path) return "";
    const classes = "auth-icon" + (className ? " " + className : "");
    return '<svg class="' + classes + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }

  function applyIcons(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-icon]").forEach((el) => {
      el.innerHTML = iconSvg(el.dataset.icon, el.dataset.iconClass || "");
    });
  }

  function highlightBrandName(el) {
    const brandName = "IlmLiga";
    const value = el.textContent;
    const brandIndex = value.indexOf(brandName);
    if (brandIndex === -1) return;

    const brand = document.createElement("span");
    brand.className = "brand-name";
    brand.append(document.createTextNode("Ilm"));

    const accent = document.createElement("span");
    accent.className = "brand-accent";
    accent.textContent = "Liga";
    brand.append(accent);

    el.replaceChildren(
      document.createTextNode(value.slice(0, brandIndex)),
      brand,
      document.createTextNode(value.slice(brandIndex + brandName.length))
    );
  }

  function applyTranslations(root) {
    const scope = root || document;
    document.documentElement.lang = language;
    scope.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    scope.querySelectorAll("[data-i18n-content]").forEach((el) => { el.setAttribute("content", t(el.dataset.i18nContent)); });
    scope.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      const params = el.dataset.i18nNumber ? { number: el.dataset.i18nNumber } : null;
      el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel, params));
    });
    scope.querySelectorAll("[data-brand-highlight]").forEach(highlightBrandName);
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    scope.querySelectorAll("[data-logo]").forEach((el) => { if (!el.innerHTML) el.innerHTML = logoSvg(); });
    applyIcons(scope);
    document.querySelectorAll("[data-language-current]").forEach((el) => {
      const item = languages[language];
      el.innerHTML = flagIcon(item.countryCode, "current") + '<span>' + item.code.toUpperCase() + '</span>';
    });
    renderLanguageMenus();
  }

  function setLanguage(code, notify) {
    if (!languages[code]) return;
    language = code;
    localStorage.setItem(LANGUAGE_KEY, code);
    applyTranslations();
    closeLanguageMenus();
    if (typeof notify === "function") notify(code);
    document.dispatchEvent(new CustomEvent("auth:language", { detail: { language: code } }));
  }

  function renderLanguageMenus() {
    document.querySelectorAll("[data-language-menu]").forEach((menu) => {
      menu.innerHTML = Object.values(languages).map((item) => (
        '<button type="button" class="language-option' + (item.code === language ? ' active' : '') + '" data-language="' + item.code + '">' +
        flagIcon(item.countryCode, "menu") + '<span class="language-name">' + item.name + '</span>' +
        (item.code === language ? '<span class="language-check">' + iconSvg("check") + '</span>' : '') + '</button>'
      )).join("");
    });
  }

  function closeLanguageMenus() {
    document.querySelectorAll("[data-language-menu]").forEach((menu) => menu.classList.remove("open"));
  }

  function initLanguageControls() {
    renderLanguageMenus();
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-language-toggle]");
      const option = event.target.closest("[data-language]");
      if (trigger) {
        event.stopPropagation();
        const menu = trigger.parentElement.querySelector("[data-language-menu]");
        const willOpen = !menu.classList.contains("open");
        closeLanguageMenus();
        if (willOpen) menu.classList.add("open");
        return;
      }
      if (option) {
        setLanguage(option.dataset.language);
        return;
      }
      if (!event.target.closest("[data-language-menu]")) closeLanguageMenus();
    });
  }

  async function request(path, options) {
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || t("common.serverError"));
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function loadCountries() {
    if (countriesCache) return countriesCache;
    const data = await request("/locations/countries");
    countriesCache = data.countries || [];
    return countriesCache;
  }

  function localCountryName(country) {
    const names = {
      uz: { UZ: "O‘zbekiston", KZ: "Qozog‘iston", KG: "Qirg‘iziston", TJ: "Tojikiston", TM: "Turkmaniston", RU: "Rossiya", TR: "Turkiya" },
      ru: { UZ: "Узбекистан", KZ: "Казахстан", KG: "Кыргызстан", TJ: "Таджикистан", TM: "Туркменистан", RU: "Россия", TR: "Турция" },
    };
    return (names[language] && names[language][country.code]) || country.name;
  }

  function renderCountryList(query, currentCode) {
    const list = document.getElementById("countryList");
    if (!list || !countriesCache) return;
    const needle = String(query || "").toLowerCase().trim();
    const matches = countriesCache.filter((country) => {
      const haystack = [country.name, localCountryName(country), country.code, country.dialCode].join(" ").toLowerCase();
      return !needle || haystack.includes(needle);
    }).slice(0, 250);
    list.innerHTML = matches.map((country) => (
      '<button type="button" class="country-item' + (country.code === currentCode ? ' active' : '') + '" data-country-code="' + country.code + '">' +
      flagIcon(country.code, "country") + '<span class="name">' + escapeHtml(localCountryName(country)) + '</span><span class="dial">' + escapeHtml(country.dialCode) + '</span></button>'
    )).join("");
  }

  async function chooseCountry(currentCode, callback) {
    const dialog = document.getElementById("countryDialog");
    const search = document.getElementById("countrySearch");
    if (!dialog || !search) return;
    countryCallback = callback;
    try {
      await loadCountries();
      renderCountryList("", currentCode);
      search.value = "";
      dialog.showModal();
      window.setTimeout(() => search.focus(), 30);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function initCountryDialog() {
    const dialog = document.getElementById("countryDialog");
    const search = document.getElementById("countrySearch");
    const list = document.getElementById("countryList");
    if (!dialog || !search || !list) return;
    search.addEventListener("input", () => renderCountryList(search.value, ""));
    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-country-code]");
      if (!button || !countriesCache) return;
      const country = countriesCache.find((item) => item.code === button.dataset.countryCode);
      if (country && typeof countryCallback === "function") countryCallback(country);
      dialog.close();
    });
    dialog.querySelector("[data-dialog-close]").addEventListener("click", () => dialog.close());
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function getPhoneRule(country) {
    return phoneRules[country.code] || { length: null, groups: [3, 3, 4], placeholder: "" };
  }

  function cleanPhone(value, country) {
    const rule = getPhoneRule(country);
    const max = rule.length || 14;
    let digits = String(value || "").replace(/\D/g, "");
    const dialDigits = String(country.dialCode || "").replace(/\D/g, "");
    if (digits.length > max && dialDigits && digits.startsWith(dialDigits)) {
      digits = digits.slice(dialDigits.length);
    }
    return digits.slice(0, max);
  }

  function formatPhone(value, country) {
    const digits = cleanPhone(value, country);
    const groups = getPhoneRule(country).groups;
    const chunks = [];
    let position = 0;
    groups.forEach((size) => {
      if (position < digits.length) chunks.push(digits.slice(position, position + size));
      position += size;
    });
    if (position < digits.length) chunks.push(digits.slice(position));
    return chunks.join(" ");
  }

  function isPhoneComplete(value, country) {
    const digits = cleanPhone(value, country);
    const exact = getPhoneRule(country).length;
    return exact ? digits.length === exact : digits.length >= 6 && digits.length <= 14;
  }

  function fullPhone(value, country) {
    return country.dialCode + cleanPhone(value, country);
  }

  function updateCountryButton(button, country) {
    if (button) {
      button.innerHTML = flagIcon(country.code) + '<span>' + escapeHtml(country.dialCode) + '</span>' + iconSvg("chevron-down", "control-chevron");
    }
  }

  function passwordCheck(value) {
    const password = String(value || "");
    const valid = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password) && password.length <= 128;
    let strength = "weak";
    if (valid) strength = password.length >= 10 && (/[^A-Za-z0-9]/.test(password) || /[A-Z]/.test(password)) ? "strong" : "medium";
    return { valid, strength, message: valid ? t(strength === "strong" ? "common.strongPassword" : "common.goodPassword") : t("common.weakPassword") };
  }

  function setBusy(button, busy, idleLabel) {
    if (!button) return;
    button.disabled = busy;
    button.dataset.busy = busy ? "true" : "false";
    button.innerHTML = busy ? '<span class="spinner" aria-hidden="true"></span>' : escapeHtml(idleLabel);
  }

  function showToast(message, type) {
    const toast = document.getElementById("authToast");
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = "toast show " + (type || "");
    toastTimer = window.setTimeout(() => { toast.className = "toast"; }, 4400);
  }

  function redirectForRole(user) {
    const role = user && user.role;
    if (role === "school_admin") window.location.href = "/school-admin.html";
    else if (role === "teacher") window.location.href = "/teacher.html";
    else if (role === "parent") window.location.href = "/parent.html";
    else window.location.href = "/lobby.html";
  }

  function saveSession(result) {
    if (result.user) localStorage.setItem("user", JSON.stringify(result.user));
    if (result.token) localStorage.setItem("token", result.token);
  }

  function createOtpController(container, onChange) {
    const inputs = Array.from(container.querySelectorAll(".otp-input"));
    function value() { return inputs.map((input) => input.value).join(""); }
    function notify() { if (typeof onChange === "function") onChange(value()); }
    inputs.forEach((input, index) => {
      input.addEventListener("input", () => {
        const digits = input.value.replace(/\D/g, "");
        input.value = digits.slice(-1);
        input.classList.toggle("filled", Boolean(input.value));
        if (input.value && index < inputs.length - 1) inputs[index + 1].focus();
        notify();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !input.value && index > 0) inputs[index - 1].focus();
      });
      input.addEventListener("paste", (event) => {
        const digits = (event.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, inputs.length);
        if (!digits) return;
        event.preventDefault();
        inputs.forEach((item, itemIndex) => {
          item.value = digits[itemIndex] || "";
          item.classList.toggle("filled", Boolean(item.value));
        });
        inputs[Math.min(digits.length, inputs.length) - 1].focus();
        notify();
      });
    });
    return {
      value,
      clear() { inputs.forEach((input) => { input.value = ""; input.classList.remove("filled"); }); notify(); inputs[0].focus(); },
      focus() { inputs[0].focus(); },
    };
  }

  function initPasswordToggles() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-password-toggle]");
      if (!button) return;
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
      button.innerHTML = iconSvg(input.type === "password" ? "eye" : "eye-off");
      button.dataset.i18nAriaLabel = input.type === "password" ? "common.showPassword" : "common.hidePassword";
      button.setAttribute("aria-label", t(button.dataset.i18nAriaLabel));
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyTranslations();
    initLanguageControls();
    initCountryDialog();
    initPasswordToggles();
  });

  window.AuthApp = {
    languages,
    get language() { return language; },
    t,
    iconSvg,
    setLanguage,
    applyTranslations,
    request,
    loadCountries,
    chooseCountry,
    getPhoneRule,
    cleanPhone,
    formatPhone,
    isPhoneComplete,
    fullPhone,
    updateCountryButton,
    passwordCheck,
    setBusy,
    showToast,
    redirectForRole,
    saveSession,
    createOtpController,
    escapeHtml,
  };
})();
