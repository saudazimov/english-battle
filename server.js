const bcrypt = require("bcrypt");
const pool = require("./db");

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// ===== Upload papkalarini avtomatik yaratish (server startda) =====
[
  path.join(__dirname, "public/uploads"),
  path.join(__dirname, "uploads/resources"),
].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log("Papka yaratildi:", dir);
  }
});
const { signToken, authMiddleware, requireTeacher, requireStudent, requireParent, signAdminToken, requireAdmin } = require("./auth");
const { saveBattleSession, loadBattleSession, finishBattleSession, loadActiveSessions } = require("./battleStore");
const { recoverActiveBattles } = require("./battleRecovery");
const parentCode = require("./parentCode");
const schoolInvite = require("./schoolInvite");   // ← YANGI QATOR
const premium = require("./premium");
const aiService = require("./aiService");
const aiSnapshot = require("./aiSnapshot");
const { createSmsService } = require("./src/services/smsService");
const { createPersistentRateLimitService } = require("./src/services/persistentRateLimitService");
const { createExamAttemptGradingService } = require("./src/services/examAttemptGradingService");
const { registerSocketConnection } = require("./src/sockets/socketBootstrap");
const {
  createHttpApplication,
  registerHttpErrorHandler,
  registerProcessErrorHandlers,
  startHttpServer,
} = require("./src/services/httpBootstrapService");
const { createAuthFeatureRoutes } = require("./src/routes/authFeatureRoutes");
const registerPremiumSubscriptionRoutes = require("./src/routes/premiumSubscriptionRoutes");
const registerPaymentRoutes = require("./src/routes/paymentRoutes");
const { createAdminAccessRoutes } = require("./src/routes/adminAccessRoutes");
const { createPracticeRoutes } = require("./src/routes/practiceRoutes");
const registerParentRoutes = require("./src/routes/parentRoutes");
const { createAdminInsightsRoutes } = require("./src/routes/adminInsightsRoutes");
const userProfileRoutes = require("./src/routes/userProfileRoutes");
const registerSchoolInviteRoutes = require("./src/routes/schoolInviteRoutes");
const rankingFeatureRoutes = require("./src/routes/rankingFeatureRoutes");
const registerSchoolAdminFeatureRoutes = require("./src/routes/schoolAdminFeatureRoutes");
const registerModerationFeatureRoutes = require("./src/routes/moderationFeatureRoutes");
const adminSettingsInfoRoutes = require("./src/routes/adminSettingsInfoRoutes");
const registerNotificationRoutes = require("./src/routes/notificationRoutes");
const registerFriendRoutes = require("./src/routes/friendRoutes");
const registerTeacherResourceRoutes = require("./src/routes/teacherResourceRoutes");
const registerTeacherMessagingRoutes = require("./src/routes/teacherMessagingRoutes");
const registerTeacherSettingsRoutes = require("./src/routes/teacherSettingsRoutes");
const registerTeacherDashboardFeatureRoutes = require("./src/routes/teacherDashboardFeatureRoutes");
const { teacherStudentLinked } = require("./src/services/teacherStudentLinkService");
const { ownedActiveClass } = require("./src/services/ownedActiveClassService");
const { activeClassMembership } = require("./src/services/activeClassMembershipService");
const { validMeetingUrl } = require("./src/utils/meetingUrl");
const { maskParentPhone } = require("./src/utils/parentPhone");
const { activityLabel } = require("./src/utils/parentActivity");
const { parentLeagueName } = require("./src/utils/parentLeague");
const { getNextLevel } = require("./src/utils/levelProgression");
const { detectFileType } = require("./src/utils/resourceFileType");
const { generateOtpCode } = require("./src/utils/otpCode");
const { requireNormalizedPhone } = require("./src/middleware/requireNormalizedPhone");
const { schoolIdentityKey } = require("./src/utils/schoolIdentity");
const { mmCompatible } = require("./src/utils/matchmakingCompatibility");
const { seedOrder } = require("./src/utils/tournamentSeeding");
const { stripUnsafe } = require("./src/utils/stripUnsafe");
const { sanitizeText } = require("./src/utils/sanitizeText");
const { findPlayerKeyByUser } = require("./src/utils/battlePlayerLookup");
const { makePartyId } = require("./src/utils/partyId");
const { getLeagueName } = require("./src/utils/leagueName");
const { currentSeason } = require("./src/utils/currentSeason");
const { getRandomBotName } = require("./src/utils/botName");
const { BATTLE_LENGTHS, lengthConfig } = require("./src/utils/battleLength");
const { resourceAbsolutePath } = require("./src/utils/resourceAbsolutePath");
const { removeUploadedFile } = require("./src/utils/uploadedFileCleanup");
const { makeTeamBot } = require("./src/utils/teamBot");
const { normalizeSchool } = require("./src/utils/schoolNormalization");
const { adminTotpValid } = require("./src/utils/adminTotp");
const { uploadedContentMatches } = require("./src/utils/uploadedContentMatcher");
const { filterProfanity } = require("./src/utils/profanityFilter");
const { validatePassword } = require("./src/utils/passwordValidator");
const { clientIp } = require("./src/utils/clientIp");
const { createSchoolAdminLookupService } = require("./src/services/schoolAdminLookupService");
const getSchoolAdmin = createSchoolAdminLookupService({ pool, schoolIdentityKey });
const { createOpponentCardService } = require("./src/services/opponentCardService");
const getOpponentCardInfo = createOpponentCardService({ pool });
const { createNotificationService } = require("./src/services/notificationService");
const createNotification = createNotificationService({ pool, logger: console });
const { createFriendStatusService } = require("./src/services/friendStatusService");
const { getSeededWinner } = require("./src/services/seededWinnerService");
const { createSchoolBattlePointsService } = require("./src/services/schoolBattlePointsService");
const awardSchoolPoints = createSchoolBattlePointsService({ pool, currentSeason, logger: console });
const { createParentCodeAssignmentService } = require("./src/services/parentCodeAssignmentService");
const assignNewParentCode = createParentCodeAssignmentService({ pool, parentCode });
const { createAdminPasswordService } = require("./src/services/adminPasswordService");
const checkAdminPassword = createAdminPasswordService({ pool, bcrypt, environment: process.env, logger: console });
const { createAdminLoginAttemptService } = require("./src/services/adminLoginAttemptService");
const { createAuditLogService } = require("./src/services/auditLogService");
const logAudit = createAuditLogService({ pool, clientIp, logger: console });
const { createTournamentResultNotifier } = require("./src/services/tournamentResultNotifier");
const { createMatchPlayerNotificationService } = require("./src/services/matchPlayerNotificationService");
const { propagateByes } = require("./src/services/tournamentByePropagationService");
const { createDailyQuestService } = require("./src/services/dailyQuestService");
const getOrCreateDailyQuests = createDailyQuestService({ pool });
const { createDailyQuestProgressService } = require("./src/services/dailyQuestProgressService");
const updateQuestProgress = createDailyQuestProgressService({ pool, getOrCreateDailyQuests, logger: console });
const { createTournamentWinnerAdvancementService } = require("./src/services/tournamentWinnerAdvancementService");
const advanceWinner = createTournamentWinnerAdvancementService({ logger: console });
const { createTournamentMatchCompletionService } = require("./src/services/tournamentMatchCompletionService");
const finishMatchWithWinner = createTournamentMatchCompletionService({ advanceWinner });
const { createTournamentMatchCompletionCheckService } = require("./src/services/tournamentMatchCompletionCheckService");
const { createTournamentMatchExpiryService } = require("./src/services/tournamentMatchExpiryService");
const { createTournamentMatchWatcherService } = require("./src/services/tournamentMatchWatcherService");
const { createTournamentMatchCheckinService } = require("./src/services/tournamentMatchCheckinService");
const { createTournamentMatchLiveService } = require("./src/services/tournamentMatchLiveService");
const { createBattleSocketRebindService } = require("./src/services/battleSocketRebindService");
const { createMatchmakingQueueRemovalService } = require("./src/services/matchmakingQueueRemovalService");
const { createMatchmakingQueueMatchService } = require("./src/services/matchmakingQueueMatchService");
const { createMatchmakingPairService } = require("./src/services/matchmakingPairService");
const { createBattleBotAnswerSimulationService } = require("./src/services/battleBotAnswerSimulationService");
const { createBotBattleStartService } = require("./src/services/botBattleStartService");
const { createBattleStartService } = require("./src/services/battleStartService");
const { createBattleFinishService } = require("./src/services/battleFinishService");
const { createTeamQueueStatusService } = require("./src/services/teamQueueStatusService");
const { createTeamMatchEntryService } = require("./src/services/teamMatchEntryService");
const { createTeamMatchFormationService } = require("./src/services/teamMatchFormationService");
const { createTeamMatchBotFillService } = require("./src/services/teamMatchBotFillService");
const { createLegacyTeamBotFillService } = require("./src/services/legacyTeamBotFillService");
const { createTeamBattleCompletionCheckService } = require("./src/services/teamBattleCompletionCheckService");
const { createTeamBattleProgressService } = require("./src/services/teamBattleProgressService");
const { createTeamBattleFinishService } = require("./src/services/teamBattleFinishService");
const { createTeamBotAnswerSimulationService } = require("./src/services/teamBotAnswerSimulationService");
const { createTeamBattleStartService } = require("./src/services/teamBattleStartService");
const { createPartyBroadcastService } = require("./src/services/partyBroadcastService");
const { createPartyMemberRemovalService } = require("./src/services/partyMemberRemovalService");
const { createPartyBattleStartService } = require("./src/services/partyBattleStartService");
const { createParentLinkAttemptService } = require("./src/services/parentLinkAttemptService");
const { parentLinkBlocked, parentLinkNoteFail, parentLinkNoteOk } = createParentLinkAttemptService({ clientIp, now: Date.now });
const { createClassFeatureRoutes } = require("./src/routes/classFeatureRoutes");
const assignmentFeatureRoutes = require("./src/routes/assignmentFeatureRoutes");
const examFeatureRoutes = require("./src/routes/examFeatureRoutes");
const registerTeacherStudentManagementRoutes = require("./src/routes/teacherStudentManagementRoutes");
const tournamentFeatureRoutes = require("./src/routes/tournamentFeatureRoutes");
const adminQuestionRoutes = require("./src/routes/adminQuestionRoutes");
const registerAdminUserManagementRoutes = require("./src/routes/adminUserManagementRoutes");
const registerAdminSchoolRoutes = require("./src/routes/adminSchoolRoutes");
const registerBattleResultsRoutes = require("./src/routes/battleResultsRoutes");
const registerAiReportRoutes = require("./src/routes/aiReportRoutes");
const registerDailyEngagementRoutes = require("./src/routes/dailyEngagementRoutes");

const {
  validateRegionDistrict,
  validateGlobalLocation,
  REGIONS,
} = require("./regions");

const { app, server, io, port: PORT } = createHttpApplication({
  projectRoot: __dirname,
  pool,
  environment: process.env,
  logger: console,
});

// ============ OTP (TELEFON TASDIQLASH) ============

const sendSms = createSmsService({ environment: process.env, logger: console });

// ============ RATE LIMIT (auth himoyasi — in-memory, tashqi paketsiz) ============
// Maqsad: OTP spam / SMS xarajat suiiste'moli / parol-kod brute-force'ini cheklash.
// Ikki mexanizm: countLimiter (har chaqiruvni sanaydi) + failGate/noteFail/noteOk (faqat noto'g'ri urinish).
const {
  ipOf: _ipOf,
  phoneIpKey: _phoneIpKey,
  countLimiter,
  failGate,
  noteFail,
  noteOk,
} = createPersistentRateLimitService({ pool, clientIp, logger: console });

// ----- Maxsus limiterlar -----
var otpSendPerPhone = countLimiter("otp_send_phone", { keyFn: _phoneIpKey, max: 5,  windowMs: 15*60*1000, blockMs: 30*60*1000, message: "Bu raqamga juda ko'p kod yuborildi." });
var otpSendPerIp    = countLimiter("otp_send_ip",    { keyFn: _ipOf,       max: 60, windowMs: 60*60*1000, blockMs: 30*60*1000, message: "Juda ko'p so'rov." });
var otpVerifyGate   = failGate("otp_verify", { keyFn: _phoneIpKey, message: "Juda ko'p noto'g'ri kod urinishi." });
var loginGate       = failGate("login",      { keyFn: _phoneIpKey, message: "Juda ko'p noto'g'ri kirish urinishi." });
var usernameLookupLimiter = countLimiter("username_lookup", { keyFn: _ipOf, max: 60, windowMs: 60*1000, blockMs: 10*60*1000, message: "Username tekshiruvi juda ko'p." });
var schoolCodeLookupLimiter = countLimiter("school_code_lookup", { keyFn: _ipOf, max: 15, windowMs: 15*60*1000, blockMs: 30*60*1000, message: "Taklif kodi urinishlari juda ko'p." });
var directMessageLimiter = countLimiter("direct_message", { keyFn: (req) => req.user ? req.user.id : _ipOf(req), max: 30, windowMs: 60*1000, blockMs: 5*60*1000, message: "Xabarlar juda tez yuborilmoqda." });

// KOD YUBORISH VA TEKSHIRISH endpointlari
const authFeatureRoutes = createAuthFeatureRoutes();
authFeatureRoutes.registerOtpRoutes({
  app,
  pool,
  bcrypt,
  generateOtpCode,
  sendSms,
  otpSendPerIp,
  otpSendPerPhone,
  otpVerifyGate,
  noteFail,
  noteOk,
  phoneIpKey: _phoneIpKey,
});

// Telegram uslubi: 5-32 belgi, lotin harflari, raqamlar va pastki chiziq.
// Username kichik harfda saqlanadi, shu sababli noyoblik registrga bog'liq emas.
const USERNAME_REGEX = /^[a-z0-9_]{5,32}$/;

// ===== USERNAME TEKSHIRISH VA RO'YXATDAN O'TISH =====
authFeatureRoutes.registerRegistrationRoutes({
  app,
  pool,
  usernameLookupLimiter,
  usernameRegex: USERNAME_REGEX,
  bcrypt,
  validatePassword,
  schoolInvite,
  noteFail,
  noteOk,
  phoneIpKey: _phoneIpKey,
  validateGlobalLocation,
  stripUnsafe,
  normalizeSchool,
  signToken,
  otpVerifyGate,
});

// ============ PAROLNI TIKLASH — KOD YUBORISH VA TASDIQLASH ============
authFeatureRoutes.registerPasswordResetRoutes({
  app,
  pool,
  bcrypt,
  generateOtpCode,
  sendSms,
  otpSendPerIp,
  otpSendPerPhone,
  otpVerifyGate,
  noteFail,
  noteOk,
  phoneIpKey: _phoneIpKey,
});

// TIZIMGA KIRISH (login)
authFeatureRoutes.initializeSessionRoutes({
  pool, bcrypt, loginGate, noteFail, noteOk, phoneIpKey: _phoneIpKey, signToken,
});
authFeatureRoutes.registerLoginRoutes(app);


// ============ JANG TIZIMI ============
// XAVFSIZLIK (Sprint 1): Eski REST endpointlar (/battle/start, /battle/submit)
// OLIB TASHLANDI. Ular authsiz edi va /battle/submit to'g'ri javoblarni
// autentifikatsiyasiz qaytarar edi. Hozirgi jang tizimi to'liq Socket.io
// orqali ishlaydi (findMatch, submitAnswer) — server-side tekshiruv bilan.
// Hech bir frontend sahifa bu endpointlarni chaqirmasdi (2026-07-03 auditi).

// ============ SOCKET.IO (REAL-TIME) ============

// ============ BOT RAQIB ============

// ===== SERVER-AUTHORITATIVE TIMER (har savol uchun) =====
const TIME_PER_QUESTION_MS = 15000; // har savolga 15 sekund
const ANSWER_GRACE_MS = 2000;       // tarmoq kechikishi uchun zaxira (2+ savollar)
const FIRST_Q_GRACE_MS = 6000;      // 1-savol uchun qo'shimcha zaxira (countdown/render)
// ============ MAKTAB NOMINI BIR XIL QILISH (normalizatsiya) ============
// ===== SO'KINISH FILTRI (bolalar xavfsizligi) =====
// Yomon so'zlar ro'yxati. Topilsa — yulduzcha bilan almashtiriladi.
// Ro'yxat to'liq emas, lekin eng keng tarqalganlarni qamrab oladi.
// O'zbek, ingliz, rus tillarida. Yangi so'zlarni shu massivga qo'shish mumkin.
// ===== 1v1 MATCHMAKING QUEUE (V1) =====
let waitingQueue = []; // entry: { socketId, userId, name, level, rating, mode, lengthKey, joinedAt, botName, botTimer, expandTimers }
const removeFromQueue = createMatchmakingQueueRemovalService({ waitingQueue });

const pairPlayers = createMatchmakingPairService({
  io,
  pool,
  getOpponentCardInfo,
  startBattle,
});

const tryQueueMatch = createMatchmakingQueueMatchService({
  waitingQueue,
  mmCompatible,
  removeFromQueue,
  pairPlayers,
});
const battles = {}; // Faol janglar: roomId -> jang ma'lumoti
const simulateBotAnswers = createBattleBotAnswerSimulationService({ battles, io, finishBattle });
const rebindPlayerSocket = createBattleSocketRebindService({ battles, findPlayerKeyByUser });

// Jamoa janglar navbati (eski — endi ishlatilmaydi, xavfsizlik uchun qoldirildi)
const teamQueues = { duo: [], squad: [] };
const teamQueueTimers = {};

// ===== YAGONA JAMOA MATCHMAKING POOL (party + solo birga) =====
const teamMatchPool = { duo: [], squad: [] }; // entry: {id, type:"solo"|"party", size, players:[...], partyId?}
const teamMatchTimers = {};
const emitTeamQueueStatus = createTeamQueueStatusService({ teamMatchPool, io });

const tryFormTeamMatch = createTeamMatchFormationService({
  teamMatchPool,
  teamMatchTimers,
  startTeamBattle,
});

const botFillTeamMatch = createTeamMatchBotFillService({
  teamMatchPool,
  teamMatchTimers,
  makeTeamBot,
  startTeamBattle,
});

const addTeamEntry = createTeamMatchEntryService({
  teamMatchPool,
  teamMatchTimers,
  emitTeamQueueStatus,
  tryFormTeamMatch,
  botFillTeamMatch,
});
const pendingBattles = {}; // Do'st janglari: battle.html'da tayyor bo'lishni kutayotgan
const onlineUsers = {}; // { userId: socketId }
const notifyFriendsStatus = createFriendStatusService({ pool, io, onlineUsers, logger: console });
const notifyMatchPlayers = createMatchPlayerNotificationService({ pool, io, onlineUsers, logger: console });
const notifyTournamentResult = createTournamentResultNotifier({ notifyMatchPlayers });
const pendingRematches = new Map(); // "qabul qiluvchiSocket:so'rovchiSocket" -> server tasdiqlagan so'rov
const userToRoom = {}; // { userId: roomId } — reconnect uchun: kim qaysi aktiv jangda
const recentlyFinished = {}; // { userId: roomId } — yaqinda tugagan jang (refresh natijani topishi uchun)
const startBotBattle = createBotBattleStartService({
  pool,
  io,
  battles,
  userToRoom,
  lengthConfig,
  saveBattleSession,
  simulateBotAnswers,
  firstQuestionGraceMs: FIRST_Q_GRACE_MS,
  timePerQuestionMs: TIME_PER_QUESTION_MS,
  logger: console,
});

// ============ PARTY (Do'stlar jamoasi) ============
const parties = {};      // { partyId: { leader, teamMode, maxSize, members: [{userId, name, socketId, isLeader}], status } }
const userParty = {};    // { userId: partyId } — tez qidirish uchun
const broadcastParty = createPartyBroadcastService({ parties, io });
const removeFromParty = createPartyMemberRemovalService({ parties, userParty, broadcastParty });

// Pending party janglar (a'zolar team-battle.html ga yetib kelishini kutadi)
const pendingPartyMatches = {}; // { partyId: { teamMode, teamSize, expected:[uid], arrived:{uid:{...}}, timer } }
const startPartyBattle = createPartyBattleStartService({
  pendingPartyMatches,
  parties,
  userParty,
  addTeamEntry,
});


const startBattleService = createBattleStartService({
  pool,
  io,
  battles,
  userToRoom,
  lengthConfig,
  saveBattleSession,
  firstQuestionGraceMs: FIRST_Q_GRACE_MS,
  timePerQuestionMs: TIME_PER_QUESTION_MS,
  logger: console,
});

async function startBattle(roomId, player1, player2) {
  return startBattleService(roomId, player1, player2);
}

// ============ TOPSHIRIQ (QUEST) YORDAMCHILARI ============

const emitTeamProgress = createTeamBattleProgressService({ battles, io });

const checkTeamFinish = createTeamBattleCompletionCheckService({ battles, finishTeamBattle });

const simulateTeamBotAnswers = createTeamBotAnswerSimulationService({
  battles,
  emitTeamProgress,
  checkTeamFinish,
});

// ============ JAMOA JANG (Duo/Squad) ============

const startTeamBattleService = createTeamBattleStartService({
  pool,
  io,
  battles,
  userToRoom,
  lengthConfig,
  saveBattleSession,
  simulateTeamBotAnswers,
  firstQuestionGraceMs: FIRST_Q_GRACE_MS,
  timePerQuestionMs: TIME_PER_QUESTION_MS,
  logger: console,
});

async function startTeamBattle(group, teamMode, teamSize) {
  return startTeamBattleService(group, teamMode, teamSize);
}

const fillTeamWithBots = createLegacyTeamBotFillService({
  teamQueues,
  teamQueueTimers,
  startTeamBattle,
});

const finishTeamBattleService = createTeamBattleFinishService({
  pool,
  io,
  battles,
  userToRoom,
  recentlyFinished,
  lengthConfig,
  getLeagueName,
  updateQuestProgress,
  awardSchoolPoints,
  finishBattleSession,
  logger: console,
});

async function finishTeamBattle(roomId) {
  return finishTeamBattleService(roomId);
}

const finishBattleService = createBattleFinishService({
  pool,
  io,
  battles,
  userToRoom,
  recentlyFinished,
  lengthConfig,
  getLeagueName,
  updateQuestProgress,
  awardSchoolPoints,
  finishBattleSession,
  logger: console,
});

async function finishBattle(roomId) {
  return finishBattleService(roomId);
}

rankingFeatureRoutes.registerGeneralRoutes({ app, pool, currentSeason });

// ============ ADMIN PANEL ============

// ===== ADMIN LOGIN RATE LIMIT (in-memory, tashqi paketsiz) =====
// Brute-force himoyasi: bir IP'dan ketma-ket noto'g'ri urinishlarni cheklaydi
const { adminLoginRateLimit, recordFailedLogin, clearLoginAttempts } =
  createAdminLoginAttemptService({ failGate, noteFail, noteOk, clientIp });
const adminAccessRoutes = createAdminAccessRoutes({
  adminLoginRateLimit,
  recordFailedLogin,
  clearLoginAttempts,
  checkAdminPassword,
  adminTotpValid,
  pool,
  signAdminToken,
  logAudit,
  validatePassword,
  bcrypt,
});

// ===== ADMIN AUTH ENDPOINTLAR =====

// Admin login — parolni tekshiradi, token beradi
adminAccessRoutes.registerLoginRoutes(app);

// Admin token tekshirish va logout
adminAccessRoutes.registerSessionRoutes(app);

// Admin parolini o'zgartirish (eski parolni tasdiqlash bilan)
adminAccessRoutes.registerPasswordRoutes(app);

// Tizim ma'lumotlari (Settings sahifasi uchun)
app.use(adminSettingsInfoRoutes());

// ============ MODERATSIYA (SHIKOYAT / FLAG) ============

registerModerationFeatureRoutes({ app, pool, logAudit });

// ===== ADMIN INSIGHTS: HISOBOTLAR VA DASHBOARD =====
const adminInsightsRoutes = createAdminInsightsRoutes({ pool });
adminInsightsRoutes.registerAnalyticsRoutes(app);

// ============ PRACTICE (YAKKA MASHQ) ============
const practiceRoutes = createPracticeRoutes({
  pool,
  crypto,
  updateQuestProgress,
});

// Practice savollarini olish (token bilan, daraja + son tanlanadi)
app.use(practiceRoutes.sessionRouter);

// Practice yakunlash — XP berish (reyting YO'Q, faqat XP)
// Sprint 2A: XP-farming himoyasi — soatiga max 12 ta practice yakunlash (user boyicha)
// Practice javobini server tekshiradi. To'g'ri variant faqat shu savolga
// birinchi javob berilgandan keyin qaytariladi.
// Logout token versiyasini oshiradi: shu hisobning oldingi JWT tokenlari darhol bekor bo'ladi.
authFeatureRoutes.registerLogoutRoutes(app);

var practiceFinishLimiter = countLimiter("practice_finish", {
  keyFn: function (req) { return "u:" + (req.user && req.user.id); },
  max: 12, windowMs: 60 * 60 * 1000, blockMs: 30 * 60 * 1000,
  message: "Juda ko'p practice yakunlandi.",
});

app.use(practiceRoutes.createFinishRouter(practiceFinishLimiter));

// ============================================================
// SCHOOL CUP — TURNIR (Bosqich 2: Admin turnir yaratish)
// ============================================================

tournamentFeatureRoutes.registerAdminRoutes({
  app,
  pool,
  sanitizeText,
  seedOrder,
  propagateByes,
});

adminQuestionRoutes.registerManagementRoutes({ app, pool, logAudit });

adminQuestionRoutes.registerMonitoringRoutes({ app, pool });

adminInsightsRoutes.registerDashboardRoutes(app);

// ===== ADMIN: FOYDALANUVCHILAR =====
registerAdminUserManagementRoutes({ app, pool, logAudit });

// ===== ADMIN: MAKTABLAR =====
registerAdminSchoolRoutes({ app, pool });

// ===== BULK IMPORT (CSV) =====
// Frontend tahlil qilingan qatorlarni yuboradi. Backend HAR qatorni QAYTA validatsiya qiladi
// (frontendga ishonmaymiz) va faqat valid qatorlarni bazaga qo'shadi.
adminQuestionRoutes.registerBulkImportRoutes({ app, pool, logAudit });

registerBattleResultsRoutes({ app, pool });

// ============ PREMIUM OBUNA ============

registerPremiumSubscriptionRoutes({ app, premium, logAudit });

// ============ TO'LOV (PAYME) ============

registerPaymentRoutes({ app });

// ============ AI HISOBOTLAR: PARENT, STUDENT, TEACHER ============
registerAiReportRoutes({ app, pool, premium, aiSnapshot, aiService });

// ============ KUNDALIK ENGAGEMENT: STREAK VA QUESTLAR ============
registerDailyEngagementRoutes({ app, getOrCreateDailyQuests, pool });

// ============ PROFIL STATISTIKA ============
userProfileRoutes.registerPublicRoutes({ app, pool });

// ============ DARAJA IMTIHONI ============

examFeatureRoutes.registerLevelRoutes({
  app,
  pool,
  getNextLevel,
  randomUUID: () => crypto.randomUUID(),
});

// ============ MAKTAB / VILOYAT REYTINGI ============
rankingFeatureRoutes.registerGeographicRoutes({ app });

// ============ DO'STLAR TIZIMI ============
registerFriendRoutes({ app, createNotification, io, onlineUsers });

// ============ BILDIRISHNOMALAR ============
registerNotificationRoutes({ app });

// ===== PROFIL RASM YUKLASH =====
const uploadStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "public/uploads"));
  },
  filename: function (req, file, cb) {
    const extByMime = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
    cb(null, "user_" + req.user.id + "_" + Date.now() + (extByMime[file.mimetype] || ".img"));
  },
});
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype)) cb(null, true);
    else cb(new Error("Faqat rasm fayllari!"));
  },
});

// ===== RESURSLAR uchun multer (hujjat + rasm) =====
const resourceStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "uploads/resources"));
  },
  filename: function (req, file, cb) {
    const extByMime = {
      "application/pdf": ".pdf", "application/msword": ".doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
      "application/vnd.ms-powerpoint": ".ppt",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
      "application/vnd.ms-excel": ".xls",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
      "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
      "text/plain": ".txt",
    };
    cb(null, "res_" + req.user.id + "_" + Date.now() + (extByMime[file.mimetype] || ".bin"));
  },
});
const ALLOWED_RESOURCE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "text/plain",
];
const uploadResource = multer({
  storage: resourceStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: function (req, file, cb) {
    if (ALLOWED_RESOURCE_TYPES.indexOf(file.mimetype) !== -1) cb(null, true);
    else cb(new Error("Ruxsat etilmagan fayl turi. PDF, Word, PowerPoint, Excel yoki rasm yuklang."));
  },
});



// Fayl turini aniqlash (ikonка uchun)
registerTeacherResourceRoutes({
  app,
  uploadResource,
  uploadedContentMatches,
  removeUploadedFile,
  sanitizeText,
  detectFileType,
  logAudit,
  resourceAbsolutePath,
});

// Profil rasm yuklash endpoint
userProfileRoutes.registerPictureRoutes({ app, upload,
  uploadedContentMatches,
  removeUploadedFile,
  uploadsDirectory: path.join(__dirname, "public/uploads"),
});

// ============================================================
// SCHOOL CUP — Bosqich 3: School Admin jamoa tuzish
// ============================================================

registerSchoolAdminFeatureRoutes({ app, pool, getSchoolAdmin });


// ============================================================
// O'QITUVCHI PANELI (TEACHER) ENDPOINTLARI
// Barcha teacher endpointlari: authMiddleware + requireTeacher
// (avval token tekshiriladi, keyin rol bazadan tekshiriladi)
// ============================================================

registerTeacherMessagingRoutes({
  app,
  teacherStudentLinked,
  directMessageLimiter,
  sanitizeText,
  filterProfanity,
  onlineUsers,
  io,
  createNotification,
});

registerTeacherSettingsRoutes({ app, sanitizeText, validatePassword });

registerTeacherDashboardFeatureRoutes({ app, pool });

// ============================================================
// SINF BOSHQARUVI (Teacher Panel Phase 2B)
// ============================================================

const classFeatureRoutes = createClassFeatureRoutes();
classFeatureRoutes.registerTeacherManagementRoutes({ app, sanitizeText, logAudit });

// Barcha topshiriqlar va tanlangan topshiriq natijalari
assignmentFeatureRoutes.registerTeacherOverviewRoutes({ app, pool });

classFeatureRoutes.initializeStudentMembershipRoutes({ pool, premium, logAudit, io, activeClassMembership });
classFeatureRoutes.registerStudentEntryRoutes(app);

classFeatureRoutes.registerAnnouncementRoutes({
  app,
  sanitizeText,
  ownedActiveClass,
  activeClassMembership,
  io,
});

classFeatureRoutes.registerStudentPostAnnouncementRoutes(app);

// ===== Attendance and live lessons =====
classFeatureRoutes.registerLearningRoutes({
  app,
  pool,
  sanitizeText,
  validMeetingUrl,
  ownedActiveClass,
  activeClassMembership,
  io,
});

// ============================================================
// STUDENT ASSIGNMENTS — Stage 3: O'quvchi backend
// ============================================================

assignmentFeatureRoutes.registerStudentRoutes({ app, pool });

// ============================================================
// PARENT LINKING — Stage 3: O'quvchi tomoni (ota-ona ulanishi)
// HASH bilan: raw kod faqat yaratilganda bir marta ko'rsatiladi, DB'da hash.
// ============================================================

// ============================================================================
// MAKTAB TAKLIF KODI ENDPOINTLARI
// ============================================================================

registerSchoolInviteRoutes({
  app,
  pool,
  schoolInvite,
  schoolCodeLookupLimiter,
});

// --- Kod holatini olish: amaldagi kod BOR-YO'Qligini bildiradi, lekin RAW kodni
//     QAYTA KO'RSATMAYDI (hash'dan tiklab bo'lmaydi — xuddi parol kabi). ---
// --- Kodni yangilash (eski bekor bo'ladi) ---
// --- Ulangan ota-onalar ro'yxati (telefon maskalanadi) ---
// --- Ota-onani uzish (o'quvchi bekor qiladi) ---
// ============================================================
// PARENT DASHBOARD — Stage 4: Ota-ona backend
// ============================================================
registerParentRoutes({
  app,
  pool,
  assignNewParentCode,
  maskParentPhone,
  parentCode,
  parentLinkBlocked,
  parentLinkNoteFail,
  parentLinkNoteOk,
  parentLeagueName,
  activityLabel,
});

registerTeacherStudentManagementRoutes({ app, pool });

// ============================================================
// TEACHER ASSIGNMENTS — Stage 2: O'qituvchi backend
// ============================================================
// --- Topshiriq yaratish (transaction + savol snapshot) ---
assignmentFeatureRoutes.registerTeacherCreateRoutes({ app, pool, premium, logAudit, sanitizeText });

examFeatureRoutes.registerTeacherRoutes({ app, pool, sanitizeText, logAudit });

// =====================================================
// IMTIHON FAZA 2 — O'QUVCHI TOMONI
// =====================================================

examFeatureRoutes.registerStudentRoutes({
  app,
  pool,
  startGradeAttempt: (...args) => gradeAttempt(...args),
  submitGradeAttempt: (...args) => gradeAttempt(...args),
});

const gradeAttempt = createExamAttemptGradingService({ pool });

// --- Sinf topshiriqlari, arxivlash va natijalar ---
assignmentFeatureRoutes.registerTeacherManagementRoutes({ app, pool });

// ============================================================
// SCHOOL CUP — Bosqich 6.2: Check-in backend
// ============================================================

// ============================================================
// SCHOOL CUP — Bosqich 7: O'quvchi turnir markazi
// ============================================================

// O'quvchining turnirlari (jamoa a'zosi bo'lgan)
tournamentFeatureRoutes.registerStudentRoutes({ app, pool });

// Match check-in holati: a'zolar, kim tayyor, match holati
tournamentFeatureRoutes.registerMatchRoutes({
  app,
  pool,
  expireTournamentMatch: (...args) => expireTournamentMatch(...args),
  checkMatchCompletion: (...args) => checkMatchCompletion(...args),
  notifyMatchPlayers,
});

const checkMatchCompletion = createTournamentMatchCompletionCheckService({
  pool,
  getSeededWinner,
  advanceWinner,
  notifyMatchPlayers,
  logger: console,
});

// ============================================================
// SCHOOL CUP — Bosqich 6.1: Match holat kuzatuvchisi
// scheduled_at ni kuzatib, matchlarni avtomatik o'tkazadi:
//   pending → checkin (15 daqiqa oldin) → live (vaqt kelganda)
// ============================================================

const expireTournamentMatch = createTournamentMatchExpiryService({
  pool,
  checkMatchCompletion,
  logger: console,
});

const openMatchCheckin = createTournamentMatchCheckinService({
  pool,
  notifyMatchPlayers,
  logger: console,
});

const startMatchLive = createTournamentMatchLiveService({
  pool,
  getSeededWinner,
  finishMatchWithWinner,
  notifyTournamentResult,
  notifyMatchPlayers,
  logger: console,
});

const tournamentMatchWatcher = createTournamentMatchWatcherService({
  pool,
  openMatchCheckin,
  startMatchLive,
  expireTournamentMatch,
  logger: console,
});

// Watcher'ni har 30 soniyada ishga tushiramiz
setInterval(tournamentMatchWatcher, 30000);

registerHttpErrorHandler({ app, MulterError: multer.MulterError, logger: console });
registerProcessErrorHandlers({ processRef: process, logger: console });

registerSocketConnection({
  io,
  pool,
  battles,
  userToRoom,
  onlineUsers,
  removeFromQueue,
  notifyFriendsStatus,
  removeFromParty,
  emitTeamProgress,
  checkTeamFinish,
  finishBattle,
  stripUnsafe,
  filterProfanity,
  battleLengths: BATTLE_LENGTHS,
  pendingRematches,
  pendingBattles,
  getOpponentCardInfo,
  parties,
  userParty,
  pendingPartyMatches,
  broadcastParty,
  startPartyBattle,
  makePartyId,
  startBattle,
  waitingQueue,
  tryQueueMatch,
  getRandomBotName,
  startBotBattle,
  saveBattleSession,
  timePerQuestionMs: TIME_PER_QUESTION_MS,
  answerGraceMs: ANSWER_GRACE_MS,
  recentlyFinished,
  finishBattleSession,
  rebindPlayerSocket,
  teamMatchPool,
  addTeamEntry,
  emitTeamQueueStatus,
  logger: console,
});

startHttpServer({
  server,
  port: PORT,
  pool,
  recoverActiveBattles,
  environment: process.env,
  processRef: process,
  logger: console,
});
