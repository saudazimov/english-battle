(function adminI18nModule(root) {
  "use strict";

  var rows = [
    ["metaTitle", "English Battle — Admin Panel", "English Battle — Admin Panel", "English Battle — Панель администратора"],
    ["adminCenter", "Admin Panel — boshqaruv markazi", "Admin Panel — control center", "Панель администратора — центр управления"],
    ["secretPassword", "Maxfiy parol", "Secret password", "Секретный пароль"],
    ["twoFactorCode", "2FA kodi", "2FA code", "Код 2FA"],
    ["login", "Kirish", "Sign in", "Войти"],
    ["language", "Til", "Language", "Язык"],
    ["checking", "Tekshirilmoqda...", "Checking...", "Проверка..."],
    ["main", "Asosiy", "Main", "Основное"],
    ["overview", "Umumiy ko'rinish", "Overview", "Обзор"],
    ["questionBank", "Savollar banki", "Question bank", "Банк вопросов"],
    ["bulkImport", "Ommaviy import", "Bulk Import", "Массовый импорт"],
    ["management", "Boshqaruv", "Management", "Управление"],
    ["users", "Foydalanuvchilar", "Users", "Пользователи"],
    ["schools", "Maktablar", "Schools", "Школы"],
    ["tournaments", "Turnirlar", "Tournaments", "Турниры"],
    ["reports", "Hisobotlar", "Reports", "Отчёты"],
    ["moderation", "Moderatsiya", "Moderation", "Модерация"],
    ["system", "Tizim", "System", "Система"],
    ["auditLogs", "Audit jurnali", "Audit Logs", "Журнал аудита"],
    ["settings", "Sozlamalar", "Settings", "Настройки"],
    ["new", "YANGI", "NEW", "НОВОЕ"],
    ["superAdmin", "Super Admin", "Super Admin", "Суперадминистратор"],
    ["logout", "Chiqish", "Sign out", "Выйти"],
    ["quickSearch", "Tezkor qidiruv...", "Quick search...", "Быстрый поиск..."],
    ["production", "Production", "Production", "Продакшен"],
    ["tokenAuth", "Token autentifikatsiya", "Token authentication", "Токен-аутентификация"],
    ["rateLimit", "Rate limit faol", "Rate limiting active", "Ограничение запросов включено"],
    ["xssProtection", "XSS himoyasi", "XSS protection", "Защита от XSS"],
    ["childSafety", "Bolalar xavfsizligi", "Child safety", "Безопасность детей"],
    ["auditLog", "Audit log", "Audit log", "Журнал аудита"],
    ["totalQuestions", "Jami savollar", "Total questions", "Всего вопросов"],
    ["awaitingReview", "Tekshiruv kutmoqda", "Awaiting review", "Ожидают проверки"],
    ["addQuestion", "Yangi savol qo'shish", "Add a new question", "Добавить новый вопрос"],
    ["add", "Qo'shish", "Add", "Добавить"],
    ["addQuestionHint", "Savol qo'shish uchun yuqoridagi tugmani bosing", "Use the button above to add a question", "Чтобы добавить вопрос, нажмите кнопку выше"],
    ["aiReviewQueue", "AI review navbati", "AI review queue", "Очередь проверки ИИ"],
    ["questionOrId", "Savol yoki ID...", "Question or ID...", "Вопрос или ID..."],
    ["allLevels", "Barcha daraja", "All levels", "Все уровни"],
    ["allSkills", "Barcha ko'nikma", "All skills", "Все навыки"],
    ["grammar", "Grammatika", "Grammar", "Грамматика"],
    ["vocabulary", "Lug'at", "Vocabulary", "Лексика"],
    ["reading", "O'qish", "Reading", "Чтение"],
    ["everyday", "Kundalik til", "Everyday", "Повседневная речь"],
    ["allStatuses", "Barcha status", "All statuses", "Все статусы"],
    ["published", "Chop etilgan", "Published", "Опубликовано"],
    ["draft", "Qoralama", "Draft", "Черновик"],
    ["review", "Tekshiruv", "Review", "Проверка"],
    ["reset", "Tozalash", "Reset", "Сбросить"],
    ["loading", "Yuklanmoqda...", "Loading...", "Загрузка..."],
    ["perPage", "{count} / sahifa", "{count} / page", "{count} / страницу"],
    ["levelDistribution", "Daraja taqsimoti", "Level distribution", "Распределение по уровням"],
    ["questionHealth", "Savollar salomatligi", "Question health", "Состояние вопросов"],
    ["recentActivity", "So'nggi faollik", "Recent activity", "Последняя активность"],
    ["moderationSubtitle", "Foydalanuvchilar shikoyatlarini ko'rib chiqish", "Review user reports", "Рассмотрение жалоб пользователей"],
    ["pending", "Kutilayotgan", "Pending", "Ожидает"],
    ["resolved", "Hal qilingan", "Resolved", "Решено"],
    ["dismissed", "Rad etilgan", "Dismissed", "Отклонено"],
    ["all", "Hammasi", "All", "Все"],
    ["refresh", "Yangilash", "Refresh", "Обновить"],
    ["reportsSubtitle", "Platforma tahlili va statistika", "Platform analytics and statistics", "Аналитика и статистика платформы"],
    ["days", "{count} kun", "{count} days", "{count} дней"],
    ["settingsSubtitle", "Tizim sozlamalari va xavfsizlik", "System settings and security", "Системные настройки и безопасность"],
    ["systemInfo", "Tizim ma'lumotlari", "System information", "Информация о системе"],
    ["changeAdminPassword", "Admin parolini o'zgartirish", "Change admin password", "Изменить пароль администратора"],
    ["currentPassword", "Joriy parol", "Current password", "Текущий пароль"],
    ["newPasswordRule", "Yangi parol (kamida 6 belgi)", "New password (at least 6 characters)", "Новый пароль (не менее 6 символов)"],
    ["repeatPassword", "Yangi parolni takrorlang", "Repeat new password", "Повторите новый пароль"],
    ["changePassword", "Parolni o'zgartirish", "Change password", "Изменить пароль"],
    ["schoolInviteTitle", "Maktab admini taklif kodi", "School administrator invite code", "Код приглашения администратора школы"],
    ["schoolName", "Maktab nomi", "School name", "Название школы"],
    ["schoolNameRequired", "Maktab nomi *", "School name *", "Название школы *"],
    ["schoolExample", "Masalan: 42-son maktab, Toshkent", "Example: School No. 42, Tashkent", "Например: школа №42, Ташкент"],
    ["region", "Viloyat", "Region", "Область"],
    ["district", "Tuman", "District", "Район"],
    ["validity", "Amal qilish muddati", "Validity period", "Срок действия"],
    ["generateCode", "Kod yaratish", "Generate code", "Создать код"],
    ["createdCode", "Yaratilgan kod", "Generated code", "Созданный код"],
    ["copy", "Nusxa", "Copy", "Копировать"],
    ["copied", "Nusxa olindi ✓", "Copied ✓", "Скопировано ✓"],
    ["schoolSearch", "Maktab nomi...", "School name...", "Название школы..."],
    ["usersSubtitle", "O'quvchi va o'qituvchilarni boshqarish", "Manage students and teachers", "Управление учениками и учителями"],
    ["nameOrPhone", "Ism yoki telefon...", "Name or phone...", "Имя или телефон..."],
    ["allRoles", "Barcha rol", "All roles", "Все роли"],
    ["student", "O'quvchi", "Student", "Ученик"],
    ["teacher", "O'qituvchi", "Teacher", "Учитель"],
    ["parent", "Ota-ona", "Parent", "Родитель"],
    ["schoolAdmin", "Maktab admini", "School administrator", "Администратор школы"],
    ["overviewSubtitle", "Platforma umumiy holati — bir qarashda", "Platform status at a glance", "Общее состояние платформы"],
    ["questionGrowth", "Savollar o'sishi (7 kun)", "Question growth (7 days)", "Рост вопросов (7 дней)"],
    ["activeRegions", "Eng faol viloyatlar", "Most active regions", "Самые активные области"],
    ["createDistrictTournament", "Yangi turnir yaratish (Tuman bosqichi)", "Create tournament (district stage)", "Создать турнир (районный этап)"],
    ["tournamentName", "Turnir nomi", "Tournament name", "Название турнира"],
    ["tournamentExample", "Masalan: Chust Maktablar Kubogi", "Example: Chust Schools Cup", "Например: Кубок школ Чуста"],
    ["starterTeamSize", "Jamoa hajmi (asosiy)", "Starting team size", "Размер основного состава"],
    ["select", "Tanlang...", "Select...", "Выберите..."],
    ["selectPlain", "Tanlang", "Select", "Выберите"],
    ["selectRegionFirst", "Avval viloyat tanlang", "Select a region first", "Сначала выберите область"],
    ["regionFirst", "Avval viloyat", "Region first", "Сначала область"],
    ["selectDistrict", "Tumanni tanlang", "Select a district", "Выберите район"],
    ["reservePlayers", "Zaxira o'yinchilar", "Reserve players", "Запасные игроки"],
    ["questionsEachMatch", "Har matchda savol", "Questions per match", "Вопросов в матче"],
    ["matchTime", "Match vaqti (min)", "Match time (min)", "Время матча (мин)"],
    ["createTournament", "Turnir yaratish", "Create tournament", "Создать турнир"],
    ["existingTournaments", "Mavjud turnirlar", "Existing tournaments", "Существующие турниры"],
    ["auditSubtitle", "Barcha admin amallari tarixi — kim nima qildi, qachon", "History of all administrator actions", "История всех действий администратора"],
    ["allActions", "Barcha amallar", "All actions", "Все действия"],
    ["loginAction", "Tizimga kirish", "Sign in", "Вход в систему"],
    ["failedLogin", "Noto'g'ri kirish", "Failed sign-in", "Неудачный вход"],
    ["addQuestionAction", "Savol qo'shish", "Question created", "Добавление вопроса"],
    ["editQuestionAction", "Savol tahrirlash", "Question updated", "Изменение вопроса"],
    ["deleteQuestionAction", "Savol o'chirish", "Question deleted", "Удаление вопроса"],
    ["newQuestion", "Yangi savol", "New question", "Новый вопрос"],
    ["editQuestion", "Savolni tahrirlash", "Edit question", "Редактировать вопрос"],
    ["questionText", "Savol matni", "Question text", "Текст вопроса"],
    ["optionA", "Variant A", "Option A", "Вариант A"],
    ["optionB", "Variant B", "Option B", "Вариант B"],
    ["optionC", "Variant C", "Option C", "Вариант C"],
    ["optionD", "Variant D", "Option D", "Вариант D"],
    ["correctAnswer", "To'g'ri javob", "Correct answer", "Правильный ответ"],
    ["status", "Status", "Status", "Статус"],
    ["explanation", "Tushuntirish yoki ichki izoh (ixtiyoriy)", "Explanation or internal note (optional)", "Объяснение или внутренняя заметка (необязательно)"],
    ["autoAnalysisHint", "CEFR daraja, ko'nikma, mavzu va noto'g'ri variant sabablari saqlangandan keyin avtomatik tahlil qilinadi.", "CEFR level, skill, topic and distractor reasons are analyzed automatically after saving.", "Уровень CEFR, навык, тема и причины неверных вариантов анализируются автоматически после сохранения."],
    ["cancel", "Bekor qilish", "Cancel", "Отмена"],
    ["save", "Saqlash", "Save", "Сохранить"],
    ["saving", "Saqlanmoqda...", "Saving...", "Сохранение..."],
    ["questionComplaint", "Savol shikoyati", "Question report", "Жалоба на вопрос"],
    ["questionComplaintSubtitle", "Shikoyatni tekshiring va savolni tahrirlang", "Review the report and edit the question", "Проверьте жалобу и отредактируйте вопрос"],
    ["tournamentBracket", "Turnir setkasi", "Tournament bracket", "Турнирная сетка"],
    ["editTournament", "Turnirni tahrirlash", "Edit tournament", "Редактировать турнир"],
    ["editUser", "Foydalanuvchini tahrirlash", "Edit user", "Редактировать пользователя"],
    ["cefrLevel", "Daraja (CEFR)", "Level (CEFR)", "Уровень (CEFR)"],
    ["school", "Maktab", "School", "Школа"],
    ["chooseRole", "Rolni tanlang", "Select role", "Выберите роль"],
    ["confirm", "Tasdiqlash", "Confirm", "Подтвердить"],
    ["deleteQuestion", "Savolni o'chirish", "Delete question", "Удалить вопрос"],
    ["deleteIrreversible", "Bu amalni qaytarib bo'lmaydi. Rostdan o'chirmoqchimisiz?", "This action cannot be undone. Are you sure you want to delete it?", "Это действие нельзя отменить. Вы уверены, что хотите удалить?"],
    ["delete", "O'chirish", "Delete", "Удалить"],
    ["upload", "Yuklash", "Upload", "Загрузка"],
    ["validate", "Tekshirish", "Validate", "Проверка"],
    ["reviewStep", "Ko'rib chiqish", "Review", "Просмотр"],
    ["chooseExcel", "Excel faylni tanlang (.xlsx)", "Choose an Excel file (.xlsx)", "Выберите файл Excel (.xlsx)"],
    ["excelColumns", "savol, option A–D, to'g'ri javob, daraja, ko'nikma, explanation", "question, options A–D, correct answer, level, skill, explanation", "вопрос, варианты A–D, правильный ответ, уровень, навык, объяснение"],
    ["close", "Yopish", "Close", "Закрыть"],
    ["importAction", "Import qilish", "Import", "Импортировать"],
    ["aiAnalysis", "Savol AI tahlili", "AI question analysis", "ИИ-анализ вопроса"],
    ["reanalyze", "Qayta tahlil", "Analyze again", "Повторить анализ"],
    ["canonicalReviewQueue", "Canonical qoida review navbati", "Canonical rule review queue", "Очередь проверки канонических правил"],
    ["riskyReviews", "Xavfli, karantindagi va tasdiqlanmagan tahlillar", "Risky, quarantined and unapproved analyses", "Рискованные, карантинные и неподтверждённые анализы"],
    ["allReviewRequired", "Barcha review talab qiladiganlar", "All requiring review", "Все требующие проверки"],
    ["canonicalUnreviewed", "Canonical tasdiqlanmagan", "Canonical not approved", "Каноническое правило не подтверждено"],
    ["riskyRequired", "Xavfli / REVIEW_REQUIRED", "Risky / REVIEW_REQUIRED", "Риск / REVIEW_REQUIRED"],
    ["quarantinedRules", "Karantindagi qoidalar", "Quarantined rules", "Правила в карантине"],
    ["previous", "Oldingi", "Previous", "Назад"],
    ["next", "Keyingi", "Next", "Далее"],
    ["couldNotLoad", "Yuklab bo'lmadi", "Could not load", "Не удалось загрузить"],
    ["retry", "Qayta urinish", "Try again", "Повторить"],
    ["questionNotFound", "Savol topilmadi", "Question not found", "Вопрос не найден"],
    ["noQuestions", "Hali savol yo'q", "No questions yet", "Вопросов пока нет"],
    ["noActivity", "Hali faollik yo'q", "No activity yet", "Активности пока нет"],
    ["noTournament", "Hali turnir yaratilmagan", "No tournaments created yet", "Турниры ещё не созданы"],
    ["noAudit", "Hali audit yozuvi yo'q", "No audit entries yet", "Записей аудита пока нет"],
    ["noUsers", "Foydalanuvchi topilmadi", "No users found", "Пользователи не найдены"],
    ["noSchools", "Maktab topilmadi", "No schools found", "Школы не найдены"],
    ["noStudentsAtSchool", "Bu maktabda o'quvchi yo'q", "This school has no students", "В этой школе нет учеников"],
    ["noReports", "Shikoyatlar yo'q", "No reports", "Жалоб нет"],
    ["noReportsState", "Bu holatda shikoyat topilmadi", "No reports with this status", "Жалобы с таким статусом не найдены"],
    ["unknown", "Noma'lum", "Unknown", "Неизвестно"],
    ["question", "Savol", "Question", "Вопрос"],
    ["user", "Foydalanuvchi", "User", "Пользователь"],
    ["reporter", "Shikoyatchi", "Reporter", "Автор жалобы"],
    ["resolveReport", "Shikoyatni tasdiqlash", "Resolve report", "Подтвердить жалобу"],
    ["dismissReport", "Shikoyatni rad etish", "Dismiss report", "Отклонить жалобу"],
    ["resolveReportText", "Bu shikoyat asosli deb tasdiqlanadi va yopiladi.", "This report will be confirmed as valid and closed.", "Жалоба будет признана обоснованной и закрыта."],
    ["dismissReportText", "Bu shikoyat asossiz deb rad etiladi va yopiladi.", "This report will be dismissed as invalid and closed.", "Жалоба будет отклонена как необоснованная и закрыта."],
    ["dismiss", "Rad etish", "Dismiss", "Отклонить"],
    ["reportResolved", "Shikoyat hal qilindi", "Report resolved", "Жалоба рассмотрена"],
    ["reportDismissed", "Shikoyat rad etildi", "Report dismissed", "Жалоба отклонена"],
    ["reportNotFound", "Shikoyat topilmadi", "Report not found", "Жалоба не найдена"],
    ["questionLoading", "Savol yuklanmoqda...", "Loading question...", "Загрузка вопроса..."],
    ["questionLoadFailed", "Savolni yuklab bo'lmadi", "Could not load the question", "Не удалось загрузить вопрос"],
    ["correct", "To'g'ri", "Correct", "Правильно"],
    ["reportSection", "Shikoyat", "Report", "Жалоба"],
    ["totalUsers", "Jami foydalanuvchi", "Total users", "Всего пользователей"],
    ["totalBattles", "Jami janglar", "Total battles", "Всего боёв"],
    ["questions", "Savollar", "Questions", "Вопросы"],
    ["pendingReports", "Kutilayotgan shikoyat", "Pending reports", "Ожидающие жалобы"],
    ["userGrowth", "Foydalanuvchi o'sishi", "User growth", "Рост пользователей"],
    ["dailyRegistrations", "Kunlik yangi ro'yxatdan o'tishlar", "Daily new registrations", "Новые регистрации по дням"],
    ["battleActivity", "Jang faolligi", "Battle activity", "Активность боёв"],
    ["dailyBattles", "Kunlik janglar soni", "Daily battles", "Количество боёв по дням"],
    ["levelDistributionStudents", "O'quvchilar CEFR darajasi bo'yicha", "Students by CEFR level", "Ученики по уровню CEFR"],
    ["byStudentCount", "O'quvchi soni bo'yicha", "By student count", "По количеству учеников"],
    ["activeSchools", "Eng faol maktablar", "Most active schools", "Самые активные школы"],
    ["topSix", "O'quvchi soni bo'yicha top 6", "Top 6 by student count", "Топ-6 по числу учеников"],
    ["csvExport", "CSV eksport", "Export CSV", "Экспорт CSV"],
    ["noPeriodData", "Bu davrda ma'lumot yo'q", "No data for this period", "Нет данных за этот период"],
    ["noData", "Ma'lumot yo'q", "No data", "Нет данных"],
    ["reportDownloaded", "Hisobot yuklab olindi", "Report downloaded", "Отчёт загружен"],
    ["error", "Xato", "Error", "Ошибка"],
    ["serverError", "Server xatosi", "Server error", "Ошибка сервера"],
    ["roleChanged", "Rol o'zgartirildi", "Role changed", "Роль изменена"],
    ["banUser", "Foydalanuvchini bloklash", "Block user", "Заблокировать пользователя"],
    ["unblock", "Blokni ochish", "Unblock", "Разблокировать"],
    ["block", "Bloklash", "Block", "Заблокировать"],
    ["blocked", "Bloklandi", "Blocked", "Заблокирован"],
    ["unblocked", "Blok ochildi", "Unblocked", "Разблокирован"],
    ["userUpdated", "Foydalanuvchi yangilandi", "User updated", "Пользователь обновлён"],
    ["requiredFields", "Barcha maydonlarni to'ldiring", "Fill in all fields", "Заполните все поля"],
    ["passwordTooShort", "Yangi parol kamida 6 belgi bo'lishi kerak", "The new password must be at least 6 characters", "Новый пароль должен содержать не менее 6 символов"],
    ["passwordMismatch", "Yangi parollar mos kelmadi", "The new passwords do not match", "Новые пароли не совпадают"],
    ["passwordSame", "Yangi parol eskisidan farq qilishi kerak", "The new password must differ from the old one", "Новый пароль должен отличаться от старого"],
    ["changing", "O'zgartirilmoqda...", "Updating...", "Обновление..."],
    ["onlyXlsx", "Faqat .xlsx fayl", "Only .xlsx files are allowed", "Разрешены только файлы .xlsx"],
    ["excelLibraryMissing", "Excel kutubxonasi yuklanmadi (internet kerak)", "The Excel library did not load (internet required)", "Библиотека Excel не загрузилась (требуется интернет)"],
    ["excelReadError", "Excel o'qishda xato", "Could not read the Excel file", "Ошибка чтения Excel"],
    ["excelEmpty", "Excel bo'sh yoki faqat sarlavha", "The Excel file is empty or contains only headers", "Файл Excel пуст или содержит только заголовки"],
    ["headersMissing", "Sarlavhalar topilmadi (savol, option A, to'g'ri javob kerak)", "Required headers are missing (question, option A and correct answer)", "Не найдены обязательные заголовки (вопрос, вариант A и правильный ответ)"],
    ["noRows", "Hech qanday qator topilmadi", "No rows found", "Строки не найдены"],
    ["importing", "Import qilinmoqda...", "Importing...", "Импорт..."],
    ["importError", "Import xatosi", "Import error", "Ошибка импорта"],
    ["analysisPending", "Navbatda", "Queued", "В очереди"],
    ["analyzing", "Tahlil qilinmoqda", "Analyzing", "Анализируется"],
    ["ready", "Tayyor", "Ready", "Готово"],
    ["reviewSuggested", "Ko'rib chiqish tavsiya etiladi", "Review suggested", "Рекомендуется проверка"],
    ["reviewRequired", "Admin tekshiruvi shart", "Admin review required", "Требуется проверка администратора"],
    ["analysisFailed", "Tahlil xatosi", "Analysis failed", "Ошибка анализа"],
    ["disabled", "O'chirilgan", "Disabled", "Отключено"],
    ["distractorUnavailable", "Distractor tahlili mavjud emas.", "Distractor analysis is unavailable.", "Анализ дистракторов недоступен."],
    ["patternUnknown", "Aniqlanmagan pattern", "Unknown pattern", "Неопределённый шаблон"],
    ["reasonUnknown", "Sabab aniqlanmagan", "Reason not identified", "Причина не определена"],
    ["confidence", "Ishonch", "Confidence", "Уверенность"],
    ["source", "Manba", "Source", "Источник"],
    ["noPrerequisites", "Prerequisite ko'nikma ko'rsatilmagan.", "No prerequisite skill specified.", "Предварительные навыки не указаны."],
    ["noOverrideHistory", "Admin override tarixi yo'q.", "No admin override history.", "История изменений администратора отсутствует."],
    ["reasonMissing", "Sabab kiritilmagan", "No reason provided", "Причина не указана"],
    ["qualityGood", "Sifat bo'yicha jiddiy ogohlantirish yo'q.", "No serious quality warnings.", "Серьёзных предупреждений о качестве нет."],
    ["estimatedLevel", "Taxminiy daraja", "Estimated level", "Предполагаемый уровень"],
    ["skill", "Ko'nikma", "Skill", "Навык"],
    ["topic", "Mavzu", "Topic", "Тема"],
    ["subskill", "Quyi ko'nikma", "Subskill", "Поднавык"],
    ["microSkill", "Mikro-ko'nikma", "Micro-skill", "Микронавык"],
    ["aiConfidence", "AI ishonchi", "AI confidence", "Уверенность ИИ"],
    ["qualityStatus", "Sifat holati", "Quality status", "Статус качества"],
    ["diagnosticEligible", "Diagnostikaga yaroqli", "Diagnostic eligible", "Подходит для диагностики"],
    ["yes", "Ha", "Yes", "Да"],
    ["no", "Yo'q", "No", "Нет"],
    ["aiRuleCandidate", "AI qoida nomzodi", "AI rule candidate", "Кандидат правила ИИ"],
    ["canonicalRule", "Canonical qoida", "Canonical rule", "Каноническое правило"],
    ["canonicalReview", "Canonical tekshiruv", "Canonical review", "Проверка канонического правила"],
    ["adminApproved", "Admin tasdiqlagan", "Admin approved", "Подтверждено администратором"],
    ["unapproved", "Tasdiqlanmagan", "Unapproved", "Не подтверждено"],
    ["levelEvidence", "Daraja dalillari", "Level evidence", "Обоснование уровня"],
    ["noLevelEvidence", "Daraja dalili mavjud emas.", "No level evidence available.", "Обоснование уровня отсутствует."],
    ["prerequisiteSkills", "Prerequisite ko'nikmalar", "Prerequisite skills", "Предварительные навыки"],
    ["qualityWarnings", "Sifat va diagnostika ogohlantirishlari", "Quality and diagnostic warnings", "Предупреждения качества и диагностики"],
    ["distractorAnalysis", "Noto'g'ri variantlar tahlili", "Distractor analysis", "Анализ неверных вариантов"],
    ["correctExplanation", "To'g'ri javob izohi", "Correct answer explanation", "Объяснение правильного ответа"],
    ["noExplanation", "Izoh mavjud emas.", "No explanation available.", "Объяснение отсутствует."],
    ["languageMaterial", "Til materiali", "Language material", "Языковой материал"],
    ["structure", "Struktura", "Structure", "Структура"],
    ["canonicalAction", "Canonical amal", "Canonical action", "Действие с правилом"],
    ["preserve", "O'zgartirmaslik", "Preserve", "Не изменять"],
    ["approveReplace", "Tasdiqlash / almashtirish", "Approve / replace", "Подтвердить / заменить"],
    ["clear", "Bekor qilish", "Clear", "Очистить"],
    ["reason", "Sabab", "Reason", "Причина"],
    ["reasonPlaceholder", "Pedagogik sababni yozing", "Enter the pedagogical reason", "Укажите педагогическую причину"],
    ["saveOverride", "Override saqlash", "Save override", "Сохранить изменение"],
    ["analysisPreparing", "AI tahlil tayyorlanmoqda", "AI analysis is being prepared", "ИИ-анализ подготавливается"],
    ["analysisNotFound", "Tahlil topilmadi", "Analysis not found", "Анализ не найден"],
    ["connectionUnavailable", "Server bilan aloqa yo'q", "Cannot connect to the server", "Нет связи с сервером"],
    ["enterOverrideReason", "Override sababini kiriting", "Enter an override reason", "Укажите причину изменения"],
    ["overrideNotSaved", "Override saqlanmadi", "Override was not saved", "Изменение не сохранено"],
    ["overrideSaved", "Admin override saqlandi", "Admin override saved", "Изменение администратора сохранено"],
    ["analysisApproveFailed", "Tahlilni tasdiqlab bo'lmadi", "Could not approve the analysis", "Не удалось подтвердить анализ"],
    ["analysisApproved", "AI tahlil tasdiqlandi", "AI analysis approved", "ИИ-анализ подтверждён"],
    ["requeueFailed", "Navbatga qo'shib bo'lmadi", "Could not add to the queue", "Не удалось добавить в очередь"],
    ["requeued", "Qayta tahlil navbatiga qo'shildi", "Added to the reanalysis queue", "Добавлено в очередь повторного анализа"],
    ["quarantine", "Karantin", "Quarantine", "Карантин"],
    ["candidate", "Nomzod", "Candidate", "Кандидат"],
    ["openReview", "Tekshirish", "Review", "Проверить"],
    ["reviewQueueLoadFailed", "Review navbatini yuklab bo'lmadi", "Could not load the review queue", "Не удалось загрузить очередь проверки"],
    ["noReviewItems", "Bu filter bo'yicha review talab qiladigan savol yo'q.", "No questions require review for this filter.", "По этому фильтру нет вопросов, требующих проверки."],
    ["questionsOnPage", "{count} ta (shu sahifada)", "{count} (on this page)", "{count} (на этой странице)"],
    ["questionPagination", "{from}–{to} / jami {total} ta savol", "{from}–{to} / {total} questions", "{from}–{to} / всего {total} вопросов"],
    ["userPagination", "{from}–{to} / jami {total} ta foydalanuvchi", "{from}–{to} / {total} users", "{from}–{to} / всего {total} пользователей"],
    ["schoolPagination", "{from}–{to} / jami {total} ta maktab", "{from}–{to} / {total} schools", "{from}–{to} / всего {total} школ"],
    ["reportPagination", "{from}–{to} / jami {total} ta shikoyat", "{from}–{to} / {total} reports", "{from}–{to} / всего {total} жалоб"],
    ["auditPagination", "{from}–{to} / jami {total} ta yozuv", "{from}–{to} / {total} entries", "{from}–{to} / всего {total} записей"],
    ["schoolCount", "{count} ta maktab:", "{count} schools:", "Школ: {count}:"],
    ["studentCount", "{count} o'quvchi", "{count} students", "Учеников: {count}"],
    ["currentRole", "{name} — hozirgi rol: {role}", "{name} — current role: {role}", "{name} — текущая роль: {role}"],
    ["current", "(joriy)", "(current)", "(текущая)"],
    ["banPrompt", "{name} ni bloklaysizmi? U tizimga kira olmaydi.", "Block {name}? They will not be able to sign in.", "Заблокировать {name}? Пользователь не сможет войти."],
    ["unbanPrompt", "{name} blokini ochasizmi?", "Unblock {name}?", "Разблокировать {name}?"],
    ["reportConversation", "Shikoyat qilingan jang suhbati ({count} xabar)", "Reported battle conversation ({count} messages)", "Чат боя с жалобой ({count} сообщений)"],
    ["recentMessages", "So'nggi chat xabarlari ({count})", "Recent chat messages ({count})", "Последние сообщения ({count})"],
    ["reportQuestionLabel", "Savol (#{id}) · ko'rish va tahrirlash uchun bosing", "Question (#{id}) · select to view and edit", "Вопрос (#{id}) · нажмите для просмотра и редактирования"],
    ["reportUserLabel", "Foydalanuvchi (#{id}) · ko'rish uchun bosing", "User (#{id}) · select to view", "Пользователь (#{id}) · нажмите для просмотра"],
    ["reportedQuestion", "Shikoyat qilingan savol (#{id})", "Reported question (#{id})", "Вопрос с жалобой (#{id})"],
    ["reviewQuestionCount", "{count} ta savol", "{count} questions", "Вопросов: {count}"],
    ["importQuestionCount", "{count} ta savolni import qilish", "Import {count} questions", "Импортировать вопросов: {count}"],
    ["importSuccess", "{count} ta savol import qilindi", "Imported {count} questions", "Импортировано вопросов: {count}"],
    ["comingSoon", "{name} bo'limi tez orada", "{name} is coming soon", "Раздел «{name}» скоро будет доступен"]
  ];

  var messages = { uz: {}, en: {}, ru: {} };
  rows.forEach(function (row) {
    messages.uz[row[0]] = row[1];
    messages.en[row[0]] = row[2];
    messages.ru[row[0]] = row[3];
  });

  function language() {
    return root.IlmLigaI18n ? root.IlmLigaI18n.getLanguage() : "uz";
  }

  function format(template, params) {
    if (!params) return template;
    return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
      return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : "{" + key + "}";
    });
  }

  function t(key, params, targetLanguage) {
    var selected = targetLanguage || language();
    var template = messages[selected] && messages[selected][key];
    if (template == null) template = messages.uz[key];
    return format(template == null ? key : template, params);
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function compileTemplate(template) {
    var names = [];
    var source = "^";
    var cursor = 0;
    String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, name, offset) {
      source += escapeRegex(template.slice(cursor, offset)) + "(.+?)";
      names.push(name);
      cursor = offset + match.length;
      return match;
    });
    source += escapeRegex(template.slice(cursor)) + "$";
    return { regex: new RegExp(source), names: names };
  }

  var exactLookup = {};
  var templates = [];
  Object.keys(messages.uz).forEach(function (key) {
    var hasParams = /\{[a-zA-Z0-9_]+\}/.test(messages.uz[key]);
    if (hasParams) {
      ["uz", "en", "ru"].forEach(function (sourceLanguage) {
        var compiled = compileTemplate(messages[sourceLanguage][key]);
        templates.push({ key: key, regex: compiled.regex, names: compiled.names });
      });
      return;
    }
    ["uz", "en", "ru"].forEach(function (sourceLanguage) {
      exactLookup[messages[sourceLanguage][key]] = key;
    });
  });

  function translate(value, targetLanguage) {
    var text = String(value == null ? "" : value);
    var exactKey = exactLookup[text];
    if (exactKey) return t(exactKey, null, targetLanguage);
    for (var i = 0; i < templates.length; i += 1) {
      var match = templates[i].regex.exec(text);
      if (!match) continue;
      var params = {};
      templates[i].names.forEach(function (name, index) { params[name] = match[index + 1]; });
      return t(templates[i].key, params, targetLanguage);
    }
    return text;
  }

  function translateTextNode(node, targetLanguage) {
    var value = node.nodeValue || "";
    var core = value.trim();
    if (!core) return;
    var translated = translate(core, targetLanguage);
    if (translated === core) return;
    var leading = value.match(/^\s*/)[0];
    var trailing = value.match(/\s*$/)[0];
    node.nodeValue = leading + translated + trailing;
  }

  function apply(scope) {
    if (!root.document) return;
    var target = scope || root.document;
    var selected = language();
    if (target.nodeType === 3) {
      translateTextNode(target, selected);
      return;
    }
    if (target.nodeType !== 1 && target.nodeType !== 9) return;
    var walker = root.document.createTreeWalker(target, 4);
    var textNode;
    while ((textNode = walker.nextNode())) translateTextNode(textNode, selected);
    var elements = target.querySelectorAll ? target.querySelectorAll("[placeholder],[title],[aria-label]") : [];
    Array.prototype.forEach.call(elements, function (element) {
      ["placeholder", "title", "aria-label"].forEach(function (attribute) {
        if (!element.hasAttribute(attribute)) return;
        var value = element.getAttribute(attribute);
        var translated = translate(value, selected);
        if (translated !== value) element.setAttribute(attribute, translated);
      });
    });
  }

  function setLanguage(code) {
    if (root.IlmLigaI18n) root.IlmLigaI18n.setLanguage(code);
    else apply(root.document);
  }

  function syncLanguageSelect() {
    if (!root.document) return;
    var selects = root.document.querySelectorAll(".admin-language-switch");
    Array.prototype.forEach.call(selects, function (select) { select.value = language(); });
  }

  function start() {
    if (!root.document) return;
    syncLanguageSelect();
    apply(root.document);
    root.addEventListener("ilmliga:languagechange", function () {
      syncLanguageSelect();
      apply(root.document);
    });
    if (typeof root.MutationObserver === "function") {
      var observer = new root.MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.type === "characterData") apply(mutation.target);
          Array.prototype.forEach.call(mutation.addedNodes || [], function (node) { apply(node); });
          if (mutation.type === "attributes") apply(mutation.target);
        });
      });
      observer.observe(root.document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["placeholder", "title", "aria-label"]
      });
    }
  }

  var api = { apply: apply, messages: messages, setLanguage: setLanguage, t: t, translate: translate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && root.document) {
    root.AdminI18n = api;
    start();
  }
}(typeof window !== "undefined" ? window : globalThis));
