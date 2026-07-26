const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("./db");
const http = require("http");
const { Server } = require("socket.io");
// ===== XAVFSIZLIK PAKETLARI (Sprint 1) =====
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");

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
const { signToken, authMiddleware, requireTeacher, requireStudent, requireParent, signAdminToken, requireAdmin, verifySocketToken } = require("./auth");
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
const rootRoutes = require("./src/routes/rootRoutes");
const { createHealthRoutes } = require("./src/routes/healthRoutes");
const { createLocationRoutes } = require("./src/routes/locationRoutes");
const logoutRoutes = require("./src/routes/logoutRoutes");
const subscriptionRoutes = require("./src/routes/subscriptionRoutes");
const paymentCreateRoutes = require("./src/routes/paymentCreateRoutes");
const paymentStatusRoutes = require("./src/routes/paymentStatusRoutes");
const paymeRoutes = require("./src/routes/paymeWebhookRoutes");
const adminMeRoutes = require("./src/routes/adminMeRoutes");
const adminLogoutRoutes = require("./src/routes/adminLogoutRoutes");
const { createAdminAuthRoutes } = require("./src/routes/adminAuthRoutes");
const adminFlagCountRoutes = require("./src/routes/adminFlagCountRoutes");
const moderationFlagRoutes = require("./src/routes/moderationFlagRoutes");
const adminSettingsInfoRoutes = require("./src/routes/adminSettingsInfoRoutes");
const adminUserMessagesRoutes = require("./src/routes/adminUserMessagesRoutes");
const adminRoomMessagesRoutes = require("./src/routes/adminRoomMessagesRoutes");
const notificationListRoutes = require("./src/routes/notificationListRoutes");
const notificationReadRoutes = require("./src/routes/notificationReadRoutes");
const notificationClearRoutes = require("./src/routes/notificationClearRoutes");
const notificationDeleteRoutes = require("./src/routes/notificationDeleteRoutes");
const schoolRankingsRoutes = require("./src/routes/schoolRankingsRoutes");
const regionRankingsRoutes = require("./src/routes/regionRankingsRoutes");
const districtRankingsRoutes = require("./src/routes/districtRankingsRoutes");
const friendSearchRoutes = require("./src/routes/friendSearchRoutes");
const friendSuggestedRoutes = require("./src/routes/friendSuggestedRoutes");
const friendRequestRoutes = require("./src/routes/friendRequestRoutes");
const friendRespondRoutes = require("./src/routes/friendRespondRoutes");
const friendRemoveRoutes = require("./src/routes/friendRemoveRoutes");
const friendRequestsRoutes = require("./src/routes/friendRequestsRoutes");
const friendListRoutes = require("./src/routes/friendListRoutes");
const friendWinsRoutes = require("./src/routes/friendWinsRoutes");
const friendActivityRoutes = require("./src/routes/friendActivityRoutes");
const teacherResourceUploadRoutes = require("./src/routes/teacherResourceUploadRoutes");
const teacherResourceListRoutes = require("./src/routes/teacherResourceListRoutes");
const teacherResourceDownloadRoutes = require("./src/routes/teacherResourceDownloadRoutes");
const teacherResourceDeleteRoutes = require("./src/routes/teacherResourceDeleteRoutes");
const profilePictureRoutes = require("./src/routes/profilePictureRoutes");
const schoolOverviewRoutes = require("./src/routes/schoolOverviewRoutes");
const schoolTournamentsRoutes = require("./src/routes/schoolTournamentsRoutes");
const schoolTournamentStudentsRoutes = require("./src/routes/schoolTournamentStudentsRoutes");
const schoolTournamentBracketRoutes = require("./src/routes/schoolTournamentBracketRoutes");
const schoolTournamentTeamListRoutes = require("./src/routes/schoolTournamentTeamListRoutes");
const schoolTournamentTeamSaveRoutes = require("./src/routes/schoolTournamentTeamSaveRoutes");
const teacherConversationsRoutes = require("./src/routes/teacherConversationsRoutes");
const teacherConversationMessagesListRoutes = require("./src/routes/teacherConversationMessagesListRoutes");
const teacherSettingsProfileReadRoutes = require("./src/routes/teacherSettingsProfileReadRoutes");
const teacherSettingsProfileUpdateRoutes = require("./src/routes/teacherSettingsProfileUpdateRoutes");
const teacherSettingsPasswordRoutes = require("./src/routes/teacherSettingsPasswordRoutes");
const teacherDashboardRoutes = require("./src/routes/teacherDashboardRoutes");
const teacherConversationMessageSendRoutes = require("./src/routes/teacherConversationMessageSendRoutes");
const studentTeacherMessageSendRoutes = require("./src/routes/studentTeacherMessageSendRoutes");
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
const { createTournamentMatchPlayerService } = require("./src/services/tournamentMatchPlayerService");
const getMatchPlayer = createTournamentMatchPlayerService({ pool });
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
const { createGracefulShutdownService } = require("./src/services/gracefulShutdownService");
const teacherClassArchiveRoutes = require("./src/routes/teacherClassArchiveRoutes");
const teacherClassUpdateRoutes = require("./src/routes/teacherClassUpdateRoutes");
const teacherClassCreateRoutes = require("./src/routes/teacherClassCreateRoutes");
const teacherClassListRoutes = require("./src/routes/teacherClassListRoutes");
const teacherClassAnnouncementsListRoutes = require("./src/routes/teacherClassAnnouncementsListRoutes");
const studentClassAnnouncementsListRoutes = require("./src/routes/studentClassAnnouncementsListRoutes");
const teacherClassAnnouncementDeleteRoutes = require("./src/routes/teacherClassAnnouncementDeleteRoutes");
const studentClassLeaveRoutes = require("./src/routes/studentClassLeaveRoutes");
const classLessonRoutes = require("./src/routes/classLessonRoutes");
const classAttendanceRoutes = require("./src/routes/classAttendanceRoutes");
const teacherClassAnnouncementCreateRoutes = require("./src/routes/teacherClassAnnouncementCreateRoutes");
const teacherClassAnnouncementUpdateRoutes = require("./src/routes/teacherClassAnnouncementUpdateRoutes");
const adminTournamentRegionsRoutes = require("./src/routes/adminTournamentRegionsRoutes");
const adminTournamentDetailRoutes = require("./src/routes/adminTournamentDetailRoutes");
const adminQuestionDeleteRoutes = require("./src/routes/adminQuestionDeleteRoutes");
const adminTournamentListRoutes = require("./src/routes/adminTournamentListRoutes");
const adminUserRoleRoutes = require("./src/routes/adminUserRoleRoutes");
const adminUserBanRoutes = require("./src/routes/adminUserBanRoutes");
const adminTournamentDistrictSchoolsRoutes = require("./src/routes/adminTournamentDistrictSchoolsRoutes");
const adminTournamentDeleteRoutes = require("./src/routes/adminTournamentDeleteRoutes");
const adminQuestionListRoutes = require("./src/routes/adminQuestionListRoutes");
const adminQuestionCreateRoutes = require("./src/routes/adminQuestionCreateRoutes");
const adminQuestionUpdateRoutes = require("./src/routes/adminQuestionUpdateRoutes");
const adminQuestionStatsRoutes = require("./src/routes/adminQuestionStatsRoutes");
const adminQuestionHealthRoutes = require("./src/routes/adminQuestionHealthRoutes");
const adminAuditLogListRoutes = require("./src/routes/adminAuditLogListRoutes");
const adminOverviewRoutes = require("./src/routes/adminOverviewRoutes");
const adminUserDetailRoutes = require("./src/routes/adminUserDetailRoutes");
const adminUserListRoutes = require("./src/routes/adminUserListRoutes");
const adminUserUpdateRoutes = require("./src/routes/adminUserUpdateRoutes");
const adminSchoolStudentListRoutes = require("./src/routes/adminSchoolStudentListRoutes");
const adminSchoolListRoutes = require("./src/routes/adminSchoolListRoutes");
const battleHistoryListRoutes = require("./src/routes/battleHistoryListRoutes");
const battleResultRoutes = require("./src/routes/battleResultRoutes");
const teamBattleResultRoutes = require("./src/routes/teamBattleResultRoutes");
const devSubscriptionActivateRoutes = require("./src/routes/devSubscriptionActivateRoutes");
const parentAiReportListRoutes = require("./src/routes/parentAiReportListRoutes");
const teacherAiReportDetailRoutes = require("./src/routes/teacherAiReportDetailRoutes");
const teacherAiReportListRoutes = require("./src/routes/teacherAiReportListRoutes");
const questListRoutes = require("./src/routes/questListRoutes");
const studentWeeklyAiReportRoutes = require("./src/routes/studentWeeklyAiReportRoutes");
const teacherWeeklyAiReportRoutes = require("./src/routes/teacherWeeklyAiReportRoutes");
const streakCheckinRoutes = require("./src/routes/streakCheckinRoutes");
const questClaimRoutes = require("./src/routes/questClaimRoutes");

const {
  validateRegionDistrict,
  validateGlobalLocation,
  REGIONS,
} = require("./regions");

const app = express();

// ===== REVERSE PROXY ISHONCHI (production) =====
// VPS'da Nginx reverse proxy oldida turadi. Express'ga real client IP'ni
// X-Forwarded-For'dan olishini aytamiz. LEKIN "hammaga ishonish" (true) xavfli —
// hujumchi to'g'ridan-to'g'ri ulanolsa header'ni soxtalashtiradi.
//   TRUST_PROXY_HOPS=1  → bitta ishonchli proxy (Nginx) — production uchun to'g'ri
//   berilmagan / 0      → hech kimga ishonmaydi (local dev) — req.ip = socket manzili
// Bu sozlangач req.ip ISHONCHLI bo'ladi va raw x-forwarded-for'ga tegmaymiz.
const TRUST_PROXY_HOPS = parseInt(process.env.TRUST_PROXY_HOPS || "0", 10);
if (TRUST_PROXY_HOPS > 0) {
  app.set("trust proxy", TRUST_PROXY_HOPS);
}

const server = http.createServer(app);

// ===== CORS SIYOSATI (Sprint 1) =====
// Frontend shu serverning o'zidan (same-origin) xizmat qilinadi, shuning uchun
// odatda CORS umuman kerak emas. CLIENT_ORIGIN .env'da berilsa (masalan mobil
// ilova yoki alohida domen uchun), FAQAT o'sha origin(lar)ga ruxsat beriladi.
// Hech qachon "*" ishlatilmaydi.
//   .env misol:  CLIENT_ORIGIN=https://englishbattle.uz,https://app.englishbattle.uz
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // origin yo'q = same-origin sahifa, curl, server-to-server (Payme webhook) — ruxsat
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Lokal ishlab chiqishni buzmaslik uchun: productiondan tashqarida localhostga ruxsat
    if (process.env.NODE_ENV !== "production" && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    // Ro'yxatda yo'q origin: xato tashlamaymiz (500 bo'lib qolmasin) —
    // shunchaki CORS header bermaymiz, brauzer o'zi bloklaydi.
    return callback(null, false);
  },
  credentials: true,
};

const io = new Server(server, { cors: corsOptions });
const PORT = process.env.PORT || 3000;

// ===== SOCKET XAVFSIZLIGI: JWT autentifikatsiya =====
// Har bir socket ulanishida tokenni tekshiramiz. Token to'g'ri bo'lsa, haqiqiy
// userId'ni socket.authUserId'ga yozamiz. Bundan keyin client yuborgan userId'ga
// EMAS, faqat socket.authUserId'ga ishonamiz (IDOR himoyasi).
// Token yo'q bo'lsa ham ulanishga ruxsat beramiz (authUserId = null) — eski
// xatti-harakat buzilmasin, lekin himoyalangan amallar authUserId'ni talab qiladi.
io.use(async (socket, next) => {
  const token = (socket.handshake.auth && socket.handshake.auth.token) ||
                (socket.handshake.query && socket.handshake.query.token) || null;
  const decoded = verifySocketToken(token);

  if (!decoded || decoded.id == null) {
    return next(new Error("AUTH_REQUIRED"));
  }

  try {
    const userResult = await pool.query(
      "SELECT id, is_banned, auth_version FROM users WHERE id = $1",
      [decoded.id]
    );
    const user = userResult.rows[0];
    if (!user) return next(new Error("ACCOUNT_NOT_FOUND"));
    if (user.is_banned) return next(new Error("ACCOUNT_BANNED"));
    if ((Number(decoded.ver) || 0) !== (Number(user.auth_version) || 0)) {
      return next(new Error("SESSION_REVOKED"));
    }

    // Barcha event handlerlar faqat JWT'dan olingan shu ID'ni ishlatadi.
    socket.authUserId = String(user.id);
    socket.userId = String(user.id);
    return next();
  } catch (err) {
    console.error("Socket autentifikatsiya xatosi:", err.message);
    return next(new Error("AUTH_SERVICE_ERROR"));
  }
});

// ===== XAVFSIZLIK MIDDLEWARE (Sprint 1) =====
// helmet: standart xavfsizlik headerlari (nosniff, frameguard, HSTS va h.k.)
// CSP mavjud inline sahifalar va ruxsat etilgan CDNlar bilan mos baseline siyosat.
// object/base/frame manbalari qat'iy yopilgan; inline scriptlar keyingi refaktorda nonce'ga o'tadi.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
        // Hozirgi sahifalarda onclick/onkeydown handlerlari bor. Ular alohida
        // modullarga ko'chirilguncha Helmet'ning default script-src-attr 'none'
        // qoidasi barcha tugmalarni ishdan chiqarmasligi kerak.
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://flagcdn.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'", "https://checkout.paycom.uz"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,   // CDN resurslarini buzmaslik uchun
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);
app.use(cors(corsOptions));
app.use(compression());
// JSON ma'lumotlarni o'qiy olish uchun (hajm chegarasi: JSON-bomba himoyasi)
app.use(express.json({ limit: "1mb" }));
app.use(
  "/vendor/flag-icons",
  express.static(path.join(__dirname, "node_modules", "flag-icons"))
);
// O'qituvchi resurslari faqat autentifikatsiyalangan download endpoint orqali beriladi.
// Eski public/uploads/resources fayllari ham to'g'ridan-to'g'ri ochilmaydi.
app.use("/uploads/resources", (req, res) => res.status(404).json({ error: "Topilmadi" }));
app.use(express.static("public"));
// Asosiy sahifa
app.use(rootRoutes());

// ===== HEALTH / READINESS ENDPOINTLAR (deploy monitoring uchun) =====
app.use(createHealthRoutes({ pool }));

// ===== AUTH UCHUN JOYLASHUV KATALOGI =====
// Mobil ilovadagi country-state-city oqimini web bilan bir xil qiladi.
app.use(createLocationRoutes());


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

// KOD YUBORISH endpoint (rate-limit: IP + telefon)
app.post("/otp/send", requireNormalizedPhone, otpSendPerIp, otpSendPerPhone, async (req, res) => {
  try {
    const { phone } = req.body;

    // Telefon tekshiruvi
    if (!phone || phone.trim().length < 9) {
      return res.status(400).json({ error: "To'g'ri telefon raqamini kiriting" });
    }

    // Bu telefon allaqachon ro'yxatdan o'tganmi?
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE phone = $1",
      [phone]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Bu telefon raqami allaqachon ro'yxatdan o'tgan" });
    }

    // 6 xonali kod yaratish
    const code = generateOtpCode();

    // Kodni hashlash (xavfsizlik uchun, parol kabi)
    const hashedCode = await bcrypt.hash(code, 10);

    // Muddati: hozirdan 5 daqiqa keyin
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Eski kodlarni shu telefon uchun o'chiramiz (faqat oxirgisi amal qilsin)
    await pool.query("DELETE FROM otp_codes WHERE phone = $1", [phone]);

    // Yangi kodni saqlash
    await pool.query(
      "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)",
      [phone, hashedCode, expiresAt]
    );

    // SMS yuborish (dev rejimda terminalga, produksiyada Eskiz)
    try {
      await sendSms(phone, code);
    } catch (smsErr) {
      console.error("SMS yuborish xatosi:", smsErr.message);
      return res.status(502).json({ error: "SMS yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring." });
    }

    // Javob — kodning O'ZINI yubormaymiz, faqat "yuborildi" deymiz
    res.json({ message: "Tasdiqlash kodi yuborildi" });
  } catch (err) {
    console.error("OTP yuborish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// KOD TEKSHIRISH endpoint (2-bosqich: "Tasdiqlash" bosilganda)
app.post("/otp/verify", requireNormalizedPhone, otpVerifyGate, async (req, res) => {
  try {
    const { phone, code } = req.body;

    // Ma'lumot tekshiruvi
    if (!phone || !code) {
      return res.status(400).json({ error: "Telefon va kod kiritilishi shart" });
    }

    // Shu telefon uchun eng oxirgi kodni topamiz
    const otpResult = await pool.query(
      "SELECT * FROM otp_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1",
      [phone]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: "Avval tasdiqlash kodini oling" });
    }

    const otpRecord = otpResult.rows[0];

    // Muddati o'tganmi?
    if (new Date() > new Date(otpRecord.expires_at)) {
      return res.status(400).json({ error: "Kod muddati tugagan, yangi kod oling" });
    }

    // Kod to'g'rimi? (hashlangan kod bilan solishtirish)
    const codeValid = await bcrypt.compare(String(code), otpRecord.code);
    if (!codeValid) {
      noteFail("otp_verify", _phoneIpKey(req), 5, 15*60*1000); // 5 noto'g'ri => 15 daqiqa blok
      return res.status(400).json({ error: "Kod noto'g'ri" });
    }

    noteOk("otp_verify", _phoneIpKey(req)); // to'g'ri kod — urinishlar tozalanadi
    // Kodni O'CHIRMAYMIZ — u /register'da yana kerak bo'ladi.
    res.json({ verified: true, message: "Telefon tasdiqlandi" });
  } catch (err) {
    console.error("OTP tekshirish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Telegram uslubi: 5-32 belgi, lotin harflari, raqamlar va pastki chiziq.
// Username kichik harfda saqlanadi, shu sababli noyoblik registrga bog'liq emas.
const USERNAME_REGEX = /^[a-z0-9_]{5,32}$/;

// ===== USERNAME BAND EMASLIGINI TEKSHIRISH (ro'yxatdan o'tishda real-time) =====
// Ochiq endpoint. Foydalanuvchi username yozganda darrov tekshiriladi.
app.post("/check-username", usernameLookupLimiter, async (req, res) => {
  try {
    let { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: "Username kiritilmadi" });
    }
    username = String(username).toLowerCase().trim();

    // Format tekshiruvi
    if (!USERNAME_REGEX.test(username)) {
      return res.json({
        available: false,
        reason: "format",
        message: "Username 5-32 belgi bo'lishi va faqat a-z, 0-9, _ belgilaridan iborat bo'lishi kerak"
      });
    }

    // Band emasligini tekshirish
    const taken = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    res.json({
      available: taken.rows.length === 0,
      message: taken.rows.length === 0 ? "Username bo'sh" : "Username band"
    });
  } catch (err) {
    console.error("Username tekshirish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// RO'YXATDAN O'TISH (register)
app.post("/register", requireNormalizedPhone, otpVerifyGate, async (req, res) => {
  try {
    let {
      first_name, last_name, phone, password,
      birth_date, birth_year, region, district, village, school,
      code, role, username, country
    } = req.body;

    // Majburiy maydonlar
    if (!first_name || !last_name || !phone || !password) {
      return res.status(400).json({ error: "Ism, familiya, telefon va parol majburiy" });
    }

    // Parol kuchini tekshirish (bolalar platformasi — xavfsizlik, 13-qoida)
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: passwordCheck.error });
    }

    // ===== USERNAME VALIDATSIYASI (Telegram uslubi) =====
    if (!username) {
      return res.status(400).json({ error: "Username majburiy" });
    }
    // Kichik harfga o'tkazamiz (@Jasurbek = @jasurbek)
    username = String(username).toLowerCase().trim();
    // Format: 5-32 belgi, a-z 0-9 _
    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({
        error: "Username 5-32 belgi bo'lishi va faqat a-z, 0-9, _ belgilaridan iborat bo'lishi kerak"
      });
    }
    // Band emasligini tekshirish
    const usernameTaken = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    if (usernameTaken.rows.length > 0) {
      return res.status(400).json({ error: "Bu username band. Boshqasini tanlang." });
    }

    // ===== COUNTRY (davlat kodi — reyting qamrovi uchun, 10/12-qoida) =====
    // Mobil ilovadan keladi (masalan 'UZ', 'KZ'). Faqat 2 harfli ISO kod.
    if (country) {
      country = String(country).toUpperCase().trim();
      if (!/^[A-Z]{2}$/.test(country)) {
        country = 'UZ'; // noto'g'ri format — default
      }
    } else {
      country = 'UZ'; // yuborilmasa — default O'zbekiston
    }

    // Ommaviy ro'yxatdan o'tish faqat o'quvchi uchun. Maktab admini faqat
    // bir martalik taklif kodi bilan o'tadi. Teacher/parent rollari alohida
    // taklif yoki admin oqimida berilishi kerak — client yuborgan rolga ishonmaymiz.
    const requestedRole = String(role || "student").trim().toLowerCase();
    const publicRoles = new Set(["student", "teacher", "parent"]);
    if (!publicRoles.has(requestedRole) && requestedRole !== "school_admin") {
      return res.status(400).json({ error: "Hisob turi noto'g'ri tanlangan" });
    }
    const userRole = requestedRole;

    // ===== MAKTAB ADMINI: taklif kodini tekshirish (anti-abuse) =====
    let schoolInviteId = null;
    if (userRole === "school_admin") {
      const { school_code } = req.body;
      if (!school_code) {
        return res.status(400).json({ error: "Maktab admini uchun taklif kodi majburiy" });
      }
      const codeHash = schoolInvite.hashCode(school_code);
      const inv = await pool.query(
        `SELECT id, school_name, region, district, used_by, expires_at
         FROM school_invites WHERE code_hash = $1`,
        [codeHash]
      );
      if (inv.rows.length === 0) {
        return res.status(400).json({ error: "Taklif kodi noto'g'ri" });
      }
      const invite = inv.rows[0];
      if (invite.used_by) {
        return res.status(400).json({ error: "Bu kod allaqachon ishlatilgan" });
      }
      if (invite.expires_at && new Date() > new Date(invite.expires_at)) {
        return res.status(400).json({ error: "Kod muddati tugagan" });
      }
      schoolInviteId = invite.id;
      // Maktab/viloyat/tuman KODDAN olinadi — frontendga ishonmaymiz
      school = invite.school_name;
      region = invite.region || region;
      district = invite.district || district;
    }

    // O'quvchilar maktabi yagona formatda saqlanadi: 1-maktab ... 200-maktab.
    // Frontend ro'yxatiga ishonmaymiz — API orqali yuborilgan qiymatni ham tekshiramiz.
    if (userRole === "student" || userRole === "teacher") {
      const schoolMatch = String(school || "").trim().toLowerCase().match(/^(\d{1,3})-maktab$/);
      const schoolNumber = schoolMatch ? Number(schoolMatch[1]) : 0;
      if (!Number.isInteger(schoolNumber) || schoolNumber < 1 || schoolNumber > 200) {
        return res.status(400).json({ error: "Maktabni 1-maktabdan 200-maktabgacha bo'lgan ro'yxatdan tanlang" });
      }
      school = schoolNumber + "-maktab";
    }

    // Telefon allaqachon ro'yxatdan o'tganmi
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [phone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Bu telefon raqami allaqachon ro'yxatdan o'tgan" });
    }
    // ============ OTP TEKSHIRUVI ============
    // Kod yuborilganmi?
    if (!code) {
      return res.status(400).json({ error: "Tasdiqlash kodi kiritilmadi" });
    }

    // Shu telefon uchun eng oxirgi kodni topamiz
    const otpResult = await pool.query(
      "SELECT * FROM otp_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1",
      [phone]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: "Avval tasdiqlash kodini oling" });
    }

    const otpRecord = otpResult.rows[0];

    // Muddati o'tganmi?
    if (new Date() > new Date(otpRecord.expires_at)) {
      return res.status(400).json({ error: "Kod muddati tugagan, yangi kod oling" });
    }

    // Yuborilgan kod to'g'rimi? (hashlangan kod bilan solishtirish)
    const codeValid = await bcrypt.compare(String(code), otpRecord.code);
    if (!codeValid) {
      noteFail("otp_verify", _phoneIpKey(req), 5, 15*60*1000);
      return res.status(400).json({ error: "Kod noto'g'ri" });
    }
    noteOk("otp_verify", _phoneIpKey(req));
    // ============ OTP TEKSHIRUVI TUGADI ============

    // Viloyat-tuman juftligini tekshiramiz (frontendga ishonmaymiz — anti-abuse, 10/12-qoida)
    // Ota-ona uchun viloyat/tuman shart emas (faqat farzand kuzatuvi)
    if (userRole !== "parent") {
      const locationCheck = validateGlobalLocation(country, region, district);
      if (!locationCheck.valid) {
        return res.status(400).json({ error: locationCheck.error });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await pool.query(
      `INSERT INTO users
       (first_name, last_name, phone, password, birth_date, birth_year, region, district, village, school, role, username, country)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, first_name, last_name, username, phone, cefr_level, xp, rating, coins,
                 region, district, school, role, country, created_at`,
      [
        stripUnsafe(first_name, 100), stripUnsafe(last_name, 100), phone, hashedPassword,
        birth_date || null, birth_year || null,
        region || null, district || null, stripUnsafe(village, 150), normalizeSchool(school),
        userRole, username, country
      ]
    );

    // Maktab kodini "ishlatilgan" deb belgilaymiz (bir martalik)
    if (schoolInviteId) {
      await pool.query(
        `UPDATE school_invites SET used_by = $1, used_at = NOW() WHERE id = $2`,
        [newUser.rows[0].id, schoolInviteId]
      );
    }

    // Ishlatilgan OTP kodni o'chiramiz
    await pool.query("DELETE FROM otp_codes WHERE phone = $1", [phone]);

    

    const token = signToken(newUser.rows[0]);

    res.status(201).json({
      message: "Ro'yxatdan o'tish muvaffaqiyatli!",
      token: token,
      user: newUser.rows[0],
    });
  } catch (err) {
    console.error("Register xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ PAROLNI TIKLASH — KOD YUBORISH (12/13-qoida) ============
// Register'ning AKSI: telefon ro'yxatdan O'TGAN bo'lishi SHART.
app.post("/password-reset/send", requireNormalizedPhone, otpSendPerIp, otpSendPerPhone, async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || phone.trim().length < 9) {
      return res.status(400).json({ error: "To'g'ri telefon raqamini kiriting" });
    }

    // Parol tiklash uchun hisob MAVJUD bo'lishi shart
    const existingUser = await pool.query("SELECT id FROM users WHERE phone = $1", [phone]);
    // Hisob mavjudligini oshkor qilmaymiz. Aks holda bu endpoint orqali
    // ro'yxatdan o'tgan telefon raqamlarini aniqlash mumkin bo'ladi.
    if (existingUser.rows.length === 0) {
      return res.json({ message: "Agar hisob mavjud bo'lsa, tasdiqlash kodi yuborildi" });
    }

    // OTP yaratish (register'dagi kabi)
    const code = generateOtpCode();
    const hashedCode = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query("DELETE FROM otp_codes WHERE phone = $1", [phone]);
    await pool.query(
      "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)",
      [phone, hashedCode, expiresAt]
    );

    try {
      await sendSms(phone, code);
    } catch (smsErr) {
      console.error("SMS yuborish xatosi:", smsErr.message);
      return res.status(502).json({ error: "SMS yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring." });
    }

    res.json({ message: "Tasdiqlash kodi yuborildi" });
  } catch (err) {
    console.error("Parol tiklash OTP xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ PAROLNI TIKLASH — TASDIQLASH VA YANGILASH ============
// Kod + yangi parol keladi; kod qayta tekshiriladi; parol yangilanadi.
app.post("/password-reset/confirm", requireNormalizedPhone, otpVerifyGate, async (req, res) => {
  try {
    const { phone, code, new_password } = req.body;

    if (!phone || !code || !new_password) {
      return res.status(400).json({ error: "Telefon, kod va yangi parol kiritilishi shart" });
    }

    // Parol validatsiyasi (kamida 8 belgi, harf + raqam)
    if (new_password.length < 8 || new_password.length > 128) {
      return res.status(400).json({ error: "Parol 8-128 belgi bo'lishi kerak" });
    }
    if (!/[a-zA-Z]/.test(new_password) || !/[0-9]/.test(new_password)) {
      return res.status(400).json({ error: "Parolda kamida 1 harf va 1 raqam bo'lishi kerak" });
    }

    // OTP qayta tekshiruvi (frontendga ishonmaymiz — anti-abuse)
    const otpResult = await pool.query(
      "SELECT * FROM otp_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1",
      [phone]
    );
    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: "Avval tasdiqlash kodini oling" });
    }

    const otpRecord = otpResult.rows[0];
    if (new Date() > new Date(otpRecord.expires_at)) {
      return res.status(400).json({ error: "Kod muddati tugagan, yangi kod oling" });
    }

    const codeValid = await bcrypt.compare(String(code), otpRecord.code);
    if (!codeValid) {
      noteFail("otp_verify", _phoneIpKey(req), 5, 15 * 60 * 1000);
      return res.status(400).json({ error: "Kod noto'g'ri" });
    }
    noteOk("otp_verify", _phoneIpKey(req));

    // Hisob bor-yo'qligini tekshiramiz
    const userResult = await pool.query("SELECT id FROM users WHERE phone = $1", [phone]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Hisob topilmadi" });
    }

    // Yangi parolni hashlab saqlaymiz
    const hashedPassword = await bcrypt.hash(new_password, 10);
    await pool.query(
      "UPDATE users SET password = $1, auth_version = auth_version + 1 WHERE phone = $2",
      [hashedPassword, phone]
    );

    // Ishlatilgan kodni o'chiramiz (qayta ishlatilmasin)
    await pool.query("DELETE FROM otp_codes WHERE phone = $1", [phone]);

    res.json({ message: "Parol muvaffaqiyatli o'zgartirildi" });
  } catch (err) {
    console.error("Parol tiklash xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// TIZIMGA KIRISH (login)
app.post("/login", requireNormalizedPhone, loginGate, async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: "Telefon va parolni kiriting" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [phone]
    );

    if (result.rows.length === 0) {
      noteFail("login", _phoneIpKey(req), 8, 15*60*1000); // 8 noto'g'ri => 15 daqiqa blok
      return res.status(400).json({ error: "Telefon yoki parol noto'g'ri" });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      noteFail("login", _phoneIpKey(req), 8, 15*60*1000);
      return res.status(400).json({ error: "Telefon yoki parol noto'g'ri" });
    }

    // Bloklangan foydalanuvchi kira olmaydi (admin tomonidan ban qilingan)
    if (user.is_banned) {
      return res.status(403).json({ error: "Hisobingiz bloklangan. Administrator bilan bog'laning." });
    }

    noteOk("login", _phoneIpKey(req)); // muvaffaqiyatli kirish — urinishlar tozalanadi

    const token = signToken(user);

    res.json({
      message: "Tizimga muvaffaqiyatli kirdingiz!",
      token: token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        phone: user.phone,
        cefr_level: user.cefr_level,
        xp: user.xp,
        rating: user.rating,
        coins: user.coins,
        profile_picture: user.profile_picture,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});


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

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // === SINF KUZATUVI (o'qituvchi class detail sahifasini ochganda) ===
  // O'qituvchi sinfni "kuzatishni" boshlaydi — shu sinf room'iga qo'shiladi.
  // Yangi o'quvchi qo'shilganda, faqat shu room'dagilar darhol xabar oladi.
  socket.on("watchClass", (classId) => {
    if (classId == null) return;
    const room = "class_" + String(classId);
    socket.join(room);
  });
  // Sahifadan chiqqanda kuzatishni to'xtatadi
  socket.on("unwatchClass", (classId) => {
    if (classId == null) return;
    const room = "class_" + String(classId);
    socket.leave(room);
  });

  // User online registration
  socket.on("registerUser", async () => {
    // XAVFSIZLIK: token bor bo'lsa — FAQAT token'dagi userId'ga ishonamiz.
    // Client yuborgan userId e'tiborsiz qoldiriladi (IDOR himoyasi).
    // Token yo'q (eski client) bo'lsa — orqaga moslik uchun client userId'ni olamiz.
    const trustedUserId = socket.userId;

    if (!trustedUserId) {
      socket.emit("errorMessage", {
        message: "User ID is required.",
      });
      return;
    }

    const normalizedUserId = String(trustedUserId);

    // XAVFSIZLIK: ban qilingan foydalanuvchi socketga ulanmasin (jang/chat qila olmasin)
    try {
      const banChk = await pool.query("SELECT is_banned FROM users WHERE id = $1", [normalizedUserId]);
      if (banChk.rows[0] && banChk.rows[0].is_banned) {
        socket.emit("accountBanned", { message: "Hisobingiz bloklangan." });
        socket.disconnect(true);
        return;
      }
    } catch (e) { console.error("ban check xato:", e.message); }

    socket.userId = normalizedUserId;

    // If you only allow one active socket per user:
    onlineUsers[normalizedUserId] = socket.id;

    console.log("User online:", normalizedUserId + " (token)");

    // Notify user's friends that this user is online
    notifyFriendsStatus(normalizedUserId, true);

    socket.emit("userRegistered", {
      success: true,
      userId: normalizedUserId,
      socketId: socket.id,
    });
  });

  // Friend battle room join

  // ===== BATTLE CHAT (V1: emotes + free chat + spam cooldown) =====
  socket.chatLast = 0;
  socket.chatTimes = [];
  socket.on("battleChatSend", ({ roomId, message }) => {
    const battle = battles[roomId];
    if (!battle || !battle.players[socket.id]) return; // bu battle ichidagi o'yinchi emas
    if (!message || typeof message !== "string") return;

    let text = stripUnsafe(message, 120); // uzunlik 120 belgi + xavfli belgilarni olib tashlaymiz
    if (!text) return;
    text = filterProfanity(text); // so'kinishlarni yulduzcha bilan almashtiramiz (bolalar xavfsizligi)

    // Spam cooldown: 2 soniyada bir marta
    const now = Date.now();
    if (now - socket.chatLast < 2000) {
      socket.emit("battleChatError", { message: "Juda tez yozyapsiz. Biroz kuting." });
      return;
    }
    // 10 soniyada maksimum 5 xabar
    socket.chatTimes = socket.chatTimes.filter(t => now - t < 10000);
    if (socket.chatTimes.length >= 5) {
      socket.emit("battleChatError", { message: "Juda ko'p xabar yubordingiz. Biroz kuting." });
      return;
    }
    socket.chatLast = now;
    socket.chatTimes.push(now);

    const sender = battle.players[socket.id];
    io.to(roomId).emit("battleChatMessage", {
      senderId: sender.userId || null,
      senderName: sender.name || "O'yinchi",
      message: text,
      createdAt: new Date().toISOString(),
    });

    // Moderatsiya uchun xabarni bazaga saqlaymiz (faqat haqiqiy o'yinchi, bot emas)
    if (sender.userId) {
      pool.query(
        "INSERT INTO chat_messages (room_id, sender_id, sender_name, message) VALUES ($1, $2, $3, $4)",
        [roomId, sender.userId, sender.name || "O'yinchi", text]
      ).catch(function (e) { console.error("Chat saqlash xatosi:", e.message); });
    }
  });

  // User disconnect
  // Rematch: bir o'yinchi qayta jang so'raydi
  socket.on("requestRematch", async ({ opponentId, level, lengthKey }) => {
    const myUserId = socket.userId;
    if (!opponentId || String(opponentId) === String(myUserId)) {
      socket.emit("rematchUnavailable", { message: "Rematch so'rovi noto'g'ri" });
      return;
    }
    const targetSocketId = onlineUsers[String(opponentId)];
    if (!targetSocketId) {
      socket.emit("rematchUnavailable", { message: "Raqib hozir mavjud emas" });
      return;
    }
    try {
      const recent = await pool.query(
        `SELECT u.first_name, u.last_name
         FROM users u
         WHERE u.id=$1 AND EXISTS (
           SELECT 1 FROM battle_history bh
           WHERE bh.user_id=$1 AND bh.opponent_id=$2
             AND bh.created_at > NOW() - INTERVAL '2 hours'
         )`,
        [myUserId, opponentId]
      );
      if (!recent.rows[0]) {
        socket.emit("rematchUnavailable", { message: "Faqat yaqinda jang qilgan raqibga rematch yuboriladi" });
        return;
      }
      const fromName = stripUnsafe(
        ((recent.rows[0].first_name || "") + " " + (recent.rows[0].last_name || "")).trim(),
        60
      ) || "O'yinchi";
      const request = {
        fromSocketId: socket.id,
        fromUserId: String(myUserId),
        toUserId: String(opponentId),
        fromName,
        level: ["A1", "A2", "B1", "B2", "C1"].includes(level) ? level : "A1",
        lengthKey: BATTLE_LENGTHS[lengthKey] ? lengthKey : "standard",
        expiresAt: Date.now() + 60000,
      };
      const rematchKey = targetSocketId + ":" + socket.id;
      pendingRematches.set(rematchKey, request);
      const cleanup = setTimeout(() => {
        if (pendingRematches.get(rematchKey) === request) pendingRematches.delete(rematchKey);
      }, 61000);
      cleanup.unref();
      io.to(targetSocketId).emit("rematchRequested", request);
    } catch (err) {
      console.error("Rematch tekshirish xatosi:", err.message);
      socket.emit("rematchUnavailable", { message: "Rematchni tekshirib bo'lmadi" });
    }
  });

  // Rematch javobi
  socket.on("rematchResponse", async ({ accepted, fromSocketId }) => {
    const myUserId = socket.userId;
    const requestKey = socket.id + ":" + fromSocketId;
    const request = pendingRematches.get(requestKey);
    pendingRematches.delete(requestKey);
    if (!request || request.expiresAt < Date.now() || request.toUserId !== String(myUserId)) {
      socket.emit("rematchUnavailable", { message: "Rematch so'rovi eskirgan yoki haqiqiy emas" });
      return;
    }
    const fromUserId = request.fromUserId;
    const fromName = request.fromName;
    const requesterSocket = io.sockets.sockets.get(fromSocketId);
    if (!requesterSocket || String(requesterSocket.userId) !== String(fromUserId)) {
      socket.emit("rematchUnavailable", { message: "Rematch so'rovi haqiqiy emas" });
      return;
    }
    let myName = "O'yinchi";
    try {
      const meRes = await pool.query("SELECT first_name, last_name FROM users WHERE id=$1", [myUserId]);
      if (meRes.rows[0]) {
        myName = stripUnsafe(((meRes.rows[0].first_name || "") + " " + (meRes.rows[0].last_name || "")).trim(), 60) || myName;
      }
    } catch (e) {}
    if (!accepted) {
      if (requesterSocket) requesterSocket.emit("rematchDeclined", { byName: myName });
      return;
    }
    const level = request.level;
    const lk = request.lengthKey;
    const roomId = "friend_battle_rematch_" + fromSocketId + "_" + socket.id + "_" + Date.now();

    let fromPic = null, myPic = null;
    try {
      const picRes = await pool.query("SELECT id, profile_picture FROM users WHERE id = ANY($1)", [[fromUserId, myUserId]]);
      picRes.rows.forEach(r => {
        if (String(r.id) === String(fromUserId)) fromPic = r.profile_picture;
        if (String(r.id) === String(myUserId)) myPic = r.profile_picture;
      });
    } catch (e) {}

    const fromCard = await getOpponentCardInfo(fromUserId);
    const myCard = await getOpponentCardInfo(myUserId);

    // Do'st jangi kabi: ikki o'yinchi battle.html'ga qayta o'tadi (found ekran + countdown)
    pendingBattles[roomId] = {
      lengthKey: lk,
      player1: { userId: fromUserId, name: fromName, level: level || "A1", lengthKey: lk, ready: false, socketId: null },
      player2: { userId: myUserId, name: myName, level: level || "A1", lengthKey: lk, ready: false, socketId: null },
    };

    if (requesterSocket) {
      requesterSocket.emit("matchFound", { roomId, opponent: { name: myName, profile_picture: myPic, rating: myCard.rating, level: level || "A1" }, lengthKey: lk, redirect: true, message: "Rematch qabul qilindi!" });
    }
    socket.emit("matchFound", { roomId, opponent: { name: fromName, profile_picture: fromPic, rating: fromCard.rating, level: level || "A1" }, lengthKey: lk, redirect: true, message: "Siz rematchni qabul qildingiz!" });
  });

  // ============ PARTY HANDLERLAR ============

  // Party yaratish (lider bo'lib)
  socket.on("createParty", ({ userId, name, teamMode, profile_picture }) => {
    // Sprint 2B (IDOR): client userId'ga ishonmaymiz — token'dan kelgan socket.userId
    var uid = socket.userId;
    if (!uid) return;

    // Avvalgi partydan chiqaramiz (agar bor bo'lsa)
    if (userParty[uid]) removeFromParty(uid);

    var mode = teamMode === "squad" ? "squad" : "duo";
    var maxSize = mode === "squad" ? 4 : 2;
    var partyId = makePartyId();

    parties[partyId] = {
      leader: uid,
      teamMode: mode,
      maxSize: maxSize,
      status: "forming",
      invited: {},
      members: [{ userId: uid, name: stripUnsafe(name, 60) || "O'yinchi", socketId: socket.id, isLeader: true, profile_picture: profile_picture || null }],
    };
    userParty[uid] = partyId;

    socket.emit("partyCreated", { partyId: partyId });
    broadcastParty(partyId);
    console.log("Party yaratildi [" + mode + "]: " + partyId + " lider:" + uid);
  });

  // Do'stni partyga taklif qilish
  socket.on("inviteToParty", ({ partyId, fromName, toUserId }) => {
    fromName = stripUnsafe(fromName, 60) || "O'yinchi"; // Sprint 1: XSS himoya
    var party = parties[partyId];
    if (!party) { socket.emit("partyError", { message: "Party topilmadi" }); return; }
    if (String(party.leader) !== String(socket.userId)) { socket.emit("partyError", { message: "Faqat lider taklif yubora oladi" }); return; }
    if (party.members.length >= party.maxSize) { socket.emit("partyError", { message: "Party to'la" }); return; }

    var targetSocket = onlineUsers[String(toUserId)];
    if (!targetSocket) { socket.emit("partyError", { message: "Do'stingiz hozir onlayn emas" }); return; }

    // Do'st allaqachon shu partyda bo'lsa
    if (party.members.find(function (m) { return m.userId === String(toUserId); })) {
      socket.emit("partyError", { message: "Bu o'yinchi allaqachon partyda" });
      return;
    }

    party.invited[String(toUserId)] = true;
    io.to(targetSocket).emit("partyInviteReceived", {
      partyId: partyId,
      fromName: fromName || "O'yinchi",
      teamMode: party.teamMode,
    });
    socket.emit("partyInviteSent", { toUserId: String(toUserId) });
    console.log("Party taklif: " + partyId + " -> " + toUserId);
  });

  // Taklifni qabul qilish
  socket.on("acceptPartyInvite", ({ partyId, userId, name, profile_picture }) => {
    userId = socket.userId;
    var party = parties[partyId];
    if (!party) { socket.emit("partyError", { message: "Party endi mavjud emas" }); return; }
    if (!party.invited || !party.invited[String(userId)]) { socket.emit("partyError", { message: "Party taklifi topilmadi" }); return; }
    if (party.members.length >= party.maxSize) { socket.emit("partyError", { message: "Party to'lib qoldi" }); return; }

    var uid = String(userId);
    // Avvalgi partydan chiqaramiz
    if (userParty[uid] && userParty[uid] !== partyId) removeFromParty(uid);

    // Allaqachon a'zomi?
    if (!party.members.find(function (m) { return m.userId === uid; })) {
      party.members.push({ userId: uid, name: stripUnsafe(name, 60) || "O'yinchi", socketId: socket.id, isLeader: false, profile_picture: profile_picture || null });
      userParty[uid] = partyId;
    }
    delete party.invited[uid];
    broadcastParty(partyId);
    console.log("Party qo'shildi: " + uid + " -> " + partyId);
  });

  // Taklifni rad etish
  socket.on("declinePartyInvite", ({ partyId, name }) => {
    var party = parties[partyId];
    if (!party) return;
    var leaderSocket = onlineUsers[party.leader];
    if (leaderSocket) io.to(leaderSocket).emit("partyInviteDeclined", { byName: name || "Do'stingiz" });
  });

  // Partydan chiqish
  socket.on("leaveParty", ({ userId }) => {
    userId = socket.userId;
    removeFromParty(String(userId));
    socket.emit("partyLeft", {});
  });

  // Lider party jangini boshlaydi
  socket.on("startPartyQueue", ({ partyId, userId }) => {
    // Sprint 2B (IDOR): lider tekshiruvi endi ishonchli socket.userId asosida
    var uid = socket.userId;
    var party = parties[partyId];
    if (!party) { socket.emit("partyError", { message: "Party topilmadi" }); return; }
    if (String(party.leader) !== String(uid)) { socket.emit("partyError", { message: "Faqat lider boshlay oladi" }); return; }
    if (party.members.length < 2) { socket.emit("partyError", { message: "Kamida 2 o'yinchi kerak" }); return; }

    party.status = "in_battle";

    // Pending match yaratamiz (a'zolar yetib kelishini kutadi)
    pendingPartyMatches[partyId] = {
      teamMode: party.teamMode,
      teamSize: party.maxSize,
      expected: party.members.map(function (m) { return String(m.userId); }),
      arrived: {},
      timer: null,
    };

    // Hamma a'zoga team-battle.html ga o'tishni aytamiz
    party.members.forEach(function (m) {
      if (m.socketId) io.to(m.socketId).emit("partyMatchStarting", { teamMode: party.teamMode, partyId: partyId });
    });
    console.log("Party queue boshlandi: " + partyId + " (" + party.members.length + " a'zo)");
  });

  // team-battle.html dan: party a'zosi yetib keldi
  socket.on("joinPartyMatch", ({ partyId, userId, name, level, lengthKey, profile_picture }) => {
    var pending = pendingPartyMatches[partyId];
    if (!pending) {
      // Pending yo'q (kech qoldi yoki xato) — solo team matchga tushiramiz
      io.to(socket.id).emit("partyMatchExpired", {});
      return;
    }
    var uid = socket.userId;
    if (pending.expected.indexOf(String(uid)) === -1) {
      socket.emit("partyError", { message: "Siz bu party a'zosi emassiz" });
      return;
    }
    pending.arrived[uid] = { socketId: socket.id, userId: uid, name: stripUnsafe(name, 60) || "O'yinchi", level: level || "A1", rating: 1000, lengthKey: lengthKey || "standard", profile_picture: profile_picture || null };

    console.log("Party a'zosi yetib keldi: " + uid + " -> " + partyId + " (" + Object.keys(pending.arrived).length + "/" + pending.expected.length + ")");

    // Hamma yetib keldimi?
    var allArrived = pending.expected.every(function (eid) { return pending.arrived[eid]; });
    if (allArrived) {
      if (pending.timer) clearTimeout(pending.timer);
      startPartyBattle(partyId);
    } else if (!pending.timer) {
      // 12s ichida hamma kelmasa — kelganlar bilan boshlaymiz
      pending.timer = setTimeout(function () { startPartyBattle(partyId); }, 12000);
    }
  });

  // Do'stga jang chaqiruvi yuborish
  socket.on("challengeFriend", async ({ fromUserId, fromName, toUserId, level, lengthKey }) => {
    // Sprint 2B (IDOR): chaqiruvchi ID token'dan — boshqa nomidan chaqiruv yuborib bo'lmaydi
    fromUserId = socket.userId;
    console.log("Chaqiruv:", fromUserId, "->", toUserId, "| Onlayn:", Object.keys(onlineUsers));
    const targetSocketId = onlineUsers[String(toUserId)];

    if (!targetSocketId) {
      socket.emit("challengeResult", { success: false, message: "Do'stingiz hozir onlayn emas" });
      return;
    }

    // Chaqiruvchining rasmini VA ISMINI bazadan olamiz (Sprint 1: XSS/spoof himoya —
    // client yuborgan fromName'ga ishonmaymiz, qabul qiluvchiga DB'dagi ism boradi)
    let fromPic = null;
    let dbName = null;
    try {
      const r = await pool.query("SELECT profile_picture, first_name, last_name FROM users WHERE id = $1", [fromUserId]);
      if (r.rows[0]) {
        fromPic = r.rows[0].profile_picture;
        dbName = ((r.rows[0].first_name || "") + " " + (r.rows[0].last_name || "")).trim();
      }
    } catch (e) {}

    io.to(targetSocketId).emit("challengeReceived", {
      fromUserId: fromUserId,
      fromName: dbName || stripUnsafe(fromName, 60) || "O'yinchi",
      fromSocketId: socket.id,
      fromPic: fromPic,
      level: level,
      lengthKey: lengthKey || "standard",
    });

    socket.emit("challengeResult", { success: true, message: "Chaqiruv yuborildi, javob kutilmoqda..." });
  });

  // Chaqiruvni bekor qilish (yuboruvchi) — do'stdagi taklifni yo'qotamiz
  socket.on("cancelChallenge", ({ fromUserId, toUserId }) => {
    fromUserId = socket.userId;
    const targetSocketId = onlineUsers[String(toUserId)];
    if (targetSocketId) {
      io.to(targetSocketId).emit("challengeCancelled", { fromUserId });
    }
  });

  // Chaqiruvga javob (qabul yoki rad)
  socket.on("challengeResponse", async ({ accepted, fromSocketId, fromUserId, fromName, myUserId, myName, level, lengthKey }) => {
    myUserId = socket.userId;
    fromName = stripUnsafe(fromName, 60) || "O'yinchi"; // Sprint 1: XSS himoya
    myName = stripUnsafe(myName, 60) || "O'yinchi";
    const challengerSocket = io.sockets.sockets.get(fromSocketId);
    if (!challengerSocket || String(challengerSocket.userId) !== String(fromUserId)) {
      socket.emit("challengeResult", { success: false, message: "Chaqiruv haqiqiy emas" });
      return;
    }
    fromUserId = challengerSocket.userId;

    if (!accepted) {
      if (challengerSocket) {
        challengerSocket.emit("challengeDeclined", { byName: myName });
      }
      return;
    }

    const lk = lengthKey || "standard";
    const roomId = "friend_battle_" + fromSocketId + "_" + socket.id;
    if (challengerSocket) challengerSocket.join(roomId);
    socket.join(roomId);

    // Raqiblarning rasmlarini bazadan olish
    let fromPic = null, myPic = null;
    try {
      const picRes = await pool.query("SELECT id, profile_picture FROM users WHERE id = ANY($1)", [[fromUserId, myUserId]]);
      picRes.rows.forEach(r => {
        if (String(r.id) === String(fromUserId)) fromPic = r.profile_picture;
        if (String(r.id) === String(myUserId)) myPic = r.profile_picture;
      });
    } catch (e) {}

    // Reyting + win rate (1v1 kabi to'liq karta)
    const fromCard = await getOpponentCardInfo(fromUserId);
    const myCard = await getOpponentCardInfo(myUserId);

    if (challengerSocket) {
      challengerSocket.emit("matchFound", {
        roomId: roomId,
        opponent: { name: myName, profile_picture: myPic, rating: myCard.rating, win_rate: myCard.win_rate, level: level || "A1" },
        lengthKey: lk,
        message: "Do'stingiz qabul qildi!",
      });
    }
    socket.emit("matchFound", {
      roomId: roomId,
      opponent: { name: fromName, profile_picture: fromPic, rating: fromCard.rating, win_rate: fromCard.win_rate, level: level || "A1" },
      lengthKey: lk,
      message: "Jang boshlanmoqda!",
    });

    // Do'st jangi: darrov boshlamaymiz. Ikki o'yinchi battle.html'ga o'tib "tayyorman" deganda boshlanadi.
    pendingBattles[roomId] = {
      lengthKey: lk,
      player1: { userId: fromUserId, name: fromName, level: level || "A1", lengthKey: lk, ready: false, socketId: null },
      player2: { userId: myUserId, name: myName, level: level || "A1", lengthKey: lk, ready: false, socketId: null },
    };
  });

  console.log("Yangi o'yinchi ulandi:", socket.id);

  // Do'st jangi: battle.html ochilganda yangi socket room'ga qo'shiladi

  // Do'st jangi: battle.html ochilganda o'yinchi "tayyorman" deydi
  socket.on("joinFriendBattle", ({ roomId, userId }) => {
    userId = socket.userId;
    const pending = pendingBattles[roomId];
    if (!pending) return;

    const isExpectedPlayer = String(pending.player1.userId) === String(userId) ||
                             String(pending.player2.userId) === String(userId);
    if (!isExpectedPlayer) {
      socket.emit("battleError", { message: "Bu jangga kirishga ruxsat yo'q" });
      return;
    }
    socket.join(roomId);

    // Qaysi o'yinchi ekanini topib, tayyor + yangi socketId belgilash
    if (String(pending.player1.userId) === String(userId)) {
      pending.player1.ready = true;
      pending.player1.socketId = socket.id;
    } else if (String(pending.player2.userId) === String(userId)) {
      pending.player2.ready = true;
      pending.player2.socketId = socket.id;
    }

    // Ikkalasi ham tayyor bo'lsa - jangni boshlaymiz (yangi socketlar bilan)
    if (pending.player1.ready && pending.player2.ready) {
      const lk = pending.lengthKey || pending.player1.lengthKey || "standard";
      const p1 = { socketId: pending.player1.socketId, userId: pending.player1.userId, name: pending.player1.name, level: pending.player1.level, lengthKey: lk };
      const p2 = { socketId: pending.player2.socketId, userId: pending.player2.userId, name: pending.player2.name, level: pending.player2.level, lengthKey: lk };
      delete pendingBattles[roomId];
      startBattle(roomId, p1, p2);
    }
  });

  socket.on("findMatch", async (playerData) => {
    console.log("Jang qidirilyapti:", socket.id);
    removeFromQueue(socket.id); // bitta socket bir vaqtda bir marta
    playerData = playerData || {};

    const me = {
      socketId: socket.id,
      userId: socket.userId,
      name: stripUnsafe(playerData.name, 60) || "O'yinchi",
      level: playerData.level || "A1",
      rating: playerData.rating || 1000,
      mode: playerData.mode || "ranked",
      lengthKey: playerData.lengthKey || "standard",
      joinedAt: Date.now(),
      botName: getRandomBotName(),
    };

    waitingQueue.push(me);

    // 1) Mos raqib bormi? (rating oynasi vaqt bilan kengayadi)
    if (tryQueueMatch(me.socketId)) return;

    // 2) Topilmadi — navbatda kutamiz
    socket.emit("waiting", { message: "Raqib qidirilmoqda..." });
    socket.emit("matchmaking:searching", { message: "Raqib qidirilmoqda..." });

    // rating oynasi kengayganda qayta urinish + UI signali
    me.expandTimers = [
      setTimeout(() => { if (waitingQueue.find((e) => e.socketId === me.socketId)) { socket.emit("matchmaking:expanded", { window: 150 }); tryQueueMatch(me.socketId); } }, 20000),
      setTimeout(() => { if (waitingQueue.find((e) => e.socketId === me.socketId)) { socket.emit("matchmaking:expanded", { window: 200 }); tryQueueMatch(me.socketId); } }, 45000),
    ];

    // 3) 60s ichida hech kim topilmasa — bot fallback (FAKE statistikasiz)
    me.botTimer = setTimeout(() => {
      const still = removeFromQueue(me.socketId);
      if (!still) return; // allaqachon match bo'lgan
      const roomId = "battle_bot_" + me.socketId;
      socket.join(roomId);
      const botFound = {
        roomId,
        opponent: { name: me.botName, isBot: true, rating: null, win_rate: null, level: me.level },
        message: "Mashqlovchi raqib topildi",
      };
      socket.emit("matchFound", botFound);
      socket.emit("matchmaking:found", botFound);
      setTimeout(() => startBotBattle(roomId, me), 6000);
    }, 20000); // 20 sekunddan keyin bot
  });

  // Foydalanuvchi qidiruvni bekor qildi
  socket.on("cancelMatch", () => {
    removeFromQueue(socket.id);
    socket.emit("matchmaking:cancelled", {});
  });

  // ============ JAMOA MATCHMAKING (Duo 2v2 / Squad 4v4) — yagona pool ============
  socket.on("findTeamMatch", async (playerData) => {
    playerData = playerData || {};
    playerData.userId = socket.userId;
    try {
      var teamMode = playerData.teamMode === "squad" ? "squad" : "duo";
      var entry = {
        id: "solo_" + socket.id + "_" + Date.now(),
        type: "solo",
        size: 1,
        players: [{
          socketId: socket.id,
          userId: playerData.userId,
          name: stripUnsafe(playerData.name, 60) || "O'yinchi",
          level: playerData.level || "A1",
          lengthKey: playerData.lengthKey || "standard",
          rating: playerData.rating || 1000,
          profile_picture: playerData.profile_picture || null,
        }],
      };
      addTeamEntry(teamMode, entry);
    } catch (err) {
      console.error("Jamoa matchmaking xatosi:", err.message);
      io.to(socket.id).emit("battleError", { message: "Jamoa qidirishda xato" });
    }
  });

  // Jamoa qidiruvini bekor qilish (pooldan chiqarish)
  socket.on("cancelTeamMatch", () => {
    ["duo", "squad"].forEach(function (mode) {
      var pool = teamMatchPool[mode];
      var before = pool.length;
      teamMatchPool[mode] = pool.filter(function (e) {
        return !e.players.some(function (p) { return p.socketId === socket.id; });
      });
      if (teamMatchPool[mode].length !== before) emitTeamQueueStatus(mode);
    });
  });

  // Jamoa jangda javob berish
  socket.on("submitTeamAnswer", async ({ roomId, questionId, answer }) => {
    var battle = battles[roomId];
    if (!battle || !battle.isTeam) return;
    var player = battle.players[socket.id];
    if (!player || player.finished) return;

    if (!player.answeredIds) player.answeredIds = {};

    // ===== DEDUPE: shu savolga allaqachon javob berilganmi? =====
    if (player.answeredIds[questionId]) {
      io.to(socket.id).emit("teamAnswerResult", {
        already_answered: true,
        answeredCount: player.answeredCount,
        total: battle.questions.length,
        myScore: player.score,
      });
      return; // ball ham, jamoa progressi ham o'zgarmaydi
    }

    var q = battle.questions.find(function (x) { return x.id === questionId; });
    if (!q) return;

    // ===== SERVER-AUTHORITATIVE 15s OYNA =====
    var now = Date.now();
    var deadline = player.qDeadline || (now + TIME_PER_QUESTION_MS);
    // Javob bermadimi (null/bo'sh) YOKI vaqt o'tdimi — timeout
    var noAnswer = (answer === null || answer === undefined || answer === "");
    var timedOut = noAnswer || (now > deadline);

    var isCorrect = false;
    if (!timedOut) {
      isCorrect = (answer === q.correct_option);
      if (isCorrect) player.score++; // faqat vaqtida + to'g'ri bo'lsa ball
    }

    player.answeredCount++;
    player.answeredIds[questionId] = true;
    player.qDeadline = now + TIME_PER_QUESTION_MS + ANSWER_GRACE_MS; // keyingi savol uchun

    player.answers.push({ questionId: q.id, selected: timedOut ? null : answer, correct: q.correct_option, isCorrect: isCorrect, timedOut: timedOut });
    if (player.answeredCount >= battle.questions.length) player.finished = true;

    // PERSISTENCE: javobni DB'ga yozish (reconnect statistika + natija refresh uchun)
    try {
      await pool.query(
        `INSERT INTO battle_answers
           (room_id, user_id, question_id, q_order, selected_option,
            correct_option, is_correct, timed_out, skill, cefr_level)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (room_id, user_id, question_id) DO NOTHING`,
        [roomId, player.userId || null, q.id, player.answeredCount,
         timedOut ? null : answer, q.correct_option, isCorrect, timedOut,
         q.skill || null, battle.level || null]
      );
    } catch (e) { console.error("team battle_answers yozish xato:", e.message); }

    io.to(socket.id).emit("teamAnswerResult", {
      isCorrect: isCorrect,
      timed_out: timedOut,
      correct_option: q.correct_option,
      answeredCount: player.answeredCount,
      total: battle.questions.length,
      myScore: player.score,
    });

    emitTeamProgress(roomId);
    checkTeamFinish(roomId);
  });

  // O'yinchi javob yuboradi
  socket.on("submitAnswer", async ({ roomId, questionId, answer }) => {
    const battle = battles[roomId];
    if (!battle || !battle.players[socket.id]) return;

    const player = battle.players[socket.id];
    if (player.finished) return;

    if (!player.answers) player.answers = [];
    if (!player.answeredIds) player.answeredIds = {};

    // ===== DEDUPE: shu savolga allaqachon javob berilganmi? =====
    if (player.answeredIds[questionId]) {
      socket.emit("answerResult", {
        already_answered: true,
        my_score: player.score,
        answered: player.answeredCount,
      });
      return; // score ham, opponent progress ham o'zgarmaydi
    }

    const question = battle.questions.find((q) => q.id === questionId);
    if (!question) return; // noma'lum savol — progressni buzmaymiz

    // ===== SERVER-AUTHORITATIVE 15s OYNA =====
    const now = Date.now();
    const deadline = player.qDeadline || (now + TIME_PER_QUESTION_MS); // zaxira (deadline o'rnatilmagan bo'lsa)
    // Javob bermadimi (null/bo'sh) YOKI vaqt o'tdimi — ikkalasi ham timeout hisoblanadi
    const noAnswer = (answer === null || answer === undefined || answer === "");
    const timedOut = noAnswer || (now > deadline);

    let isCorrect = false;
    if (!timedOut) {
      isCorrect = question.correct_option === answer;
      if (isCorrect) player.score++; // faqat vaqtida + to'g'ri bo'lsa ball
    }
    // timeout bo'lsa: ball oshmaydi, javob xato/timeout deb yoziladi

    player.answeredCount++;
    player.answeredIds[questionId] = true;

    // keyingi savol uchun yangi deadline (shu javob kelgan paytdan + 15s + grace)
    player.qDeadline = now + TIME_PER_QUESTION_MS + ANSWER_GRACE_MS;

    player.answers.push({
      question_id: questionId,
      question_text: question.question_text,
      option_a: question.option_a,
      option_b: question.option_b,
      option_c: question.option_c,
      option_d: question.option_d,
      your_answer: timedOut ? null : answer,
      correct_answer: question.correct_option,
      is_correct: isCorrect,
      timed_out: timedOut,
      explanation: question.explanation || "",
    });

    // PERSISTENCE: javobni DB'ga yozish (review refresh-proof + analytics)
    try {
      await pool.query(
        `INSERT INTO battle_answers
           (room_id, user_id, question_id, q_order, selected_option,
            correct_option, is_correct, timed_out, skill, cefr_level)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (room_id, user_id, question_id) DO NOTHING`,
        [roomId, player.userId || null, question.id, player.answeredCount,
         timedOut ? null : answer, question.correct_option, isCorrect, timedOut,
         question.skill || null, battle.level || null]
      );
    } catch (e) { console.error("battle_answers yozish xato:", e.message); }

    // PERSISTENCE: yangilangan jang holatini saqlash (score, qDeadline, answeredIds)
    saveBattleSession(roomId, battle);

    socket.emit("answerResult", {
      is_correct: isCorrect,
      timed_out: timedOut,
      correct_answer: question.correct_option,
      my_score: player.score,
      answered: player.answeredCount,
    });
    if (timedOut) socket.emit("battle:answerTimeout", { questionId: questionId });

    // Raqibga jonli progress — faqat birinchi valid javobda
    socket.to(roomId).emit("opponentProgress", { answeredCount: player.answeredCount });

    if (player.answeredCount >= battle.questions.length) {
      player.finished = true;
      const allFinished = Object.values(battle.players).every((p) => p.finished);
      if (allFinished) finishBattle(roomId);
    }
  });

  // ===== RECONNECT: client ulanганda "men aktiv jangda bormanmi?" deb so'raydi =====
 socket.on("battle:reconnectCheck", async ({ userId, expectedRoom }) => {
    userId = socket.userId;
    if (!userId) { socket.emit("battle:noActive", {}); return; }

    // XAVFSIZLIK: token bor bo'lsa — FAQAT token'dagi userId'ga ishonamiz (IDOR himoyasi).
    // Aks holda kimdir boshqa odamning userId'sini yuborib uning jangiga ulanishi mumkin.
    if (socket.authUserId) userId = socket.authUserId;

    const roomId = userToRoom[userId];
    const battle = roomId ? battles[roomId] : null;

    // DO'ST JANGI / REMATCH: client aniq bir room kutyapti (URL'dagi ?room=).
    // Agar bu room joriy aktiv/tugagan jangdan FARQ qilsa — bu YANGI jang.
    // Eski jangni qaytarmaymiz, "noActive" yuboramiz (client joinFriendBattle qiladi).
    if (expectedRoom) {
      const isActiveMatch = roomId && String(roomId) === String(expectedRoom);
      const isFinishedMatch = recentlyFinished[userId] && String(recentlyFinished[userId]) === String(expectedRoom);
      if (!isActiveMatch && !isFinishedMatch) {
        // Kutilgan room boshqa (yangi jang) — eski jangni e'tiborsiz qoldiramiz
        socket.emit("battle:noActive", {});
        return;
      }
    }

    // AVVAL: aktiv jang bormi? (jang o'rtasida refresh — bu ustuvor)
    // Aktiv jang yo'q bo'lsa — yaqinda tugagan jangni tekshiramiz (natija refresh)
    if (!roomId || !battle) {
      if (recentlyFinished[userId]) {
        socket.emit("battle:alreadyFinished", { roomId: recentlyFinished[userId] });
        return;
      }
      socket.emit("battle:noActive", {});
      return;
    }

    // Eski jangga reconnect qilmaymiz (10 daqiqadan oshган — tashlab ketilgan deb hisoblaymiz)
    const MAX_RECONNECT_AGE_MS = 10 * 60 * 1000; // 10 daqiqa
    if (battle.createdAt && (Date.now() - battle.createdAt) > MAX_RECONNECT_AGE_MS) {
      // Eski jangni tozalaymiz
      delete userToRoom[userId];
      finishBattleSession(roomId).catch(() => {});
      delete battles[roomId];
      socket.emit("battle:noActive", {});
      return;
    }

    // Eski socket.id yozuvini yangi socket'ga ko'chiramiz
    rebindPlayerSocket(roomId, userId, socket.id);
    socket.join(roomId);

    const player = battle.players[socket.id];
    if (!player) { socket.emit("battle:noActive", {}); return; }

    // REAL-TIME: o'yinchi qaytdi — raqib(lar)ga "online" signali + disconnected bayrog'ini olib tashlash
    player.disconnected = false;
    socket.to(roomId).emit("playerOnline", { userId: String(userId) });

    // ===== JAMOA JANG: alohida tiklash (1v1 mantig'iga tushmaydi) =====
    if (battle.isTeam) {
      player.disconnected = false; // qaytdi — disconnect bayrog'ini olib tashlaymiz

      // Savollar (correct_option YO'Q)
      var teamSafeQ = battle.questions.map(function (q) {
        return { id: q.id, question_text: q.question_text, option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d };
      });

      // Mening jamoam va raqib jamoa ma'lumoti (progress bilan)
      function rcTeamInfo(ids) {
        return ids.map(function (sid) {
          var p = battle.players[sid];
          return { name: p.name, isBot: p.isBot, userId: p.userId, level: p.level, rating: p.rating, profile_picture: p.profile_picture, answeredCount: p.answeredCount, score: p.score, finished: p.finished };
        });
      }
      var myTeam = player.team;
      var myTeamInfo = rcTeamInfo(battle.teams[myTeam]);
      var enemyTeamInfo = rcTeamInfo(battle.teams[myTeam === "A" ? "B" : "A"]);

      // Jamoa ballari
      function teamSum(ids) { return ids.reduce(function (s, sid) { return s + battle.players[sid].score; }, 0); }
      var myTeamScore = teamSum(battle.teams[myTeam]);
      var enemyTeamScore = teamSum(battle.teams[myTeam === "A" ? "B" : "A"]);

      // Qancha vaqt qoldi
      var tNow = Date.now();
      var tMsLeft = Math.max(0, (player.qDeadline || tNow) - tNow);

      socket.emit("team:resumeState", {
        roomId: roomId,
        teamMode: battle.teamMode,
        level: battle.level || "A1",
        questions: teamSafeQ,
        total_questions: teamSafeQ.length,
        answeredCount: player.answeredCount,
        myScore: player.score,
        myTeam: myTeam,
        myTeamPlayers: myTeamInfo,
        enemyTeamPlayers: enemyTeamInfo,
        myTeamScore: myTeamScore,
        enemyTeamScore: enemyTeamScore,
        msLeft: tMsLeft,
        finished: player.finished,   // men tugatganmanmi (Raqib kutilmoqda holati)
      });
      console.log("Jamoa reconnect: user " + userId + " → " + roomId + " (savol " + player.answeredCount + ")");
      return;
    }

    // DIQQAT: bu yerga yetib kelsak, jang HALI AKTIV (battles{}'da bor).
    // Agar player.finished = true bo'lsa — bu "men tugatdim, raqib hali o'ynayapti"
    // degani (jang tugamagan). Natija EMAS — kutish holatini yuboramiz.
    if (player.finished) {
      // Statistikani battle_answers'dan hisoblaymiz (correct + streak)
      let doneCorrect = 0, wCurrentStreak = 0, wBestStreak = 0;
      try {
        const ansRes = await pool.query(
          `SELECT is_correct FROM battle_answers
           WHERE room_id = $1 AND user_id = $2
           ORDER BY q_order ASC`,
          [roomId, userId]
        );
        let run = 0;
        for (const row of ansRes.rows) {
          if (row.is_correct) {
            doneCorrect++;
            run++;
            if (run > wBestStreak) wBestStreak = run;
          } else {
            run = 0;
          }
        }
        wCurrentStreak = run;
      } catch (e) {}

      // RAQIB ma'lumotini topamiz (jang ichidan — player'dan boshqasi)
      let oppName = "Raqib", oppPicture = null, oppAnswered = 0, oppScore = 0, oppRating = null, oppId = null;
      try {
        const oppKey = Object.keys(battle.players).find((k) => k !== socket.id);
        if (oppKey) {
          const opp = battle.players[oppKey];
          oppName = opp.name || "Raqib";
          oppAnswered = opp.answeredCount || 0;
          oppScore = opp.score || 0;
          oppId = opp.userId || null;          // bot bo'lsa null
          // Raqib rasm + rating (bot bo'lmasa DB'dan)
          if (opp.userId) {
            const oppRes = await pool.query("SELECT profile_picture, rating FROM users WHERE id = $1", [opp.userId]);
            if (oppRes.rows[0]) {
              oppPicture = oppRes.rows[0].profile_picture;
              oppRating = oppRes.rows[0].rating;
            }
          }
        }
      } catch (e) {}

      socket.emit("battle:waitingOpponent", {
        roomId: roomId,
        answeredCount: player.answeredCount,
        total: battle.questions.length,
        myScore: player.score,
        correctCount: doneCorrect,
        currentStreak: wCurrentStreak,
        bestStreak: wBestStreak,
        // Raqib ma'lumoti (F5'dan keyin tiklash uchun)
        opponentName: oppName,
        opponentPicture: oppPicture,
        opponentAnswered: oppAnswered,
        opponentScore: oppScore,
        opponentRating: oppRating,
        opponentId: oppId,                     // raqib ID (rematch tugmasi uchun)
      });
      return;
    }
    // To'g'ri javobsiz savollarni tayyorlaymiz (correct_option YUBORILMAYDI!)
    const safeQuestions = battle.questions.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
    }));

    // Qancha vaqt qoldi (joriy savol uchun)
    const now = Date.now();
    const msLeft = Math.max(0, (player.qDeadline || now) - now);

    // STATISTIKA TIKLASH: battle_answers'dan to'g'ri javoblar + streak hisoblaymiz
    let correctCount = 0, currentStreak = 0, bestStreak = 0;
    try {
      const ansRes = await pool.query(
        `SELECT is_correct FROM battle_answers
         WHERE room_id = $1 AND user_id = $2
         ORDER BY q_order ASC`,
        [roomId, userId]
      );
      let run = 0;
      for (const row of ansRes.rows) {
        if (row.is_correct) {
          correctCount++;
          run++;
          if (run > bestStreak) bestStreak = run;
        } else {
          run = 0;
        }
      }
      currentStreak = run; // oxiridagi ketma-ket to'g'rilar (uzilmagan bo'lsa)
    } catch (e) { console.error("reconnect statistika xato:", e.message); }

    // RAQIB progressi + ID/ism + rasm (jang ichidan — player'dan boshqasi)
    let rsOppAnswered = 0, rsOppId = null, rsOppName = "Raqib", rsOppPicture = null;
    try {
      const oppKey = Object.keys(battle.players).find((k) => k !== socket.id);
      if (oppKey) {
        rsOppAnswered = battle.players[oppKey].answeredCount || 0;
        rsOppId = battle.players[oppKey].userId || null;   // bot bo'lsa null
        rsOppName = battle.players[oppKey].name || "Raqib";
        // Raqib rasmini DB'dan olamiz (bot bo'lmasa)
        if (rsOppId) {
          const oppPicRes = await pool.query("SELECT profile_picture FROM users WHERE id = $1", [rsOppId]);
          if (oppPicRes.rows[0]) rsOppPicture = oppPicRes.rows[0].profile_picture;
        }
      }
    } catch (e) {}

    // Joriy holatni clientga yuboramiz — jang shu yerdan davom etadi
    socket.emit("battle:resumeState", {
      roomId: roomId,
      questions: safeQuestions,
      total_questions: safeQuestions.length,
      answeredCount: player.answeredCount,   // nechta savolga javob bergan (keyingisidan davom etadi)
      myScore: player.score,
      correctCount: correctCount,            // to'g'ri javoblar (statistika)
      currentStreak: currentStreak,          // hozirgi ketma-ket streak
      bestStreak: bestStreak,                // eng uzun streak
      msLeft: msLeft,                        // joriy savolda qolgan millisekund
      level: battle.level || "A1",
      opponentAnswered: rsOppAnswered,       // raqib nechta savolga javob bergan (progress tiklash)
      opponentId: rsOppId,                   // raqib ID (rematch tugmasi uchun)
      opponentName: rsOppName,               // raqib ismi
      opponentPicture: rsOppPicture,         // raqib rasmi (avatar tiklash)
    });

    console.log("Reconnect: user " + userId + " → " + roomId + " (savol " + player.answeredCount + ", " + msLeft + "ms qoldi)");
  });

  // ===== LEAVE: o'yinchi jangni ataylab tark etdi =====
  socket.on("battle:leave", ({ roomId }) => {
    const battle = roomId ? battles[roomId] : null;
    if (!battle) return;

    // Tark etgan o'yinchini topamiz (socket.id bo'yicha)
    const leaverKey = battle.players[socket.id] ? socket.id : null;
    if (!leaverKey) return;

    const leaver = battle.players[leaverKey];
    const leaverUserId = leaver.userId;

    // Tark etgan o'yinchini "tugagan" + "chiqib ketgan" deb belgilaymiz.
    // disconnected=true → forfeit (chiqqan o'yinchi mag'lub bo'ladi).
    leaver.finished = true;
    leaver.disconnected = true;

    // userToRoom'dan darrov tozalaymiz — endi reconnect qilmaydi
    if (leaverUserId && userToRoom[leaverUserId] === roomId) {
      delete userToRoom[leaverUserId];
    }

    console.log("Leave: user " + leaverUserId + " jangni tark etdi → " + roomId);

    if (battle.isTeam) {
      // JAMOA: raqib(lar)ga offline signal + progress + tugash tekshiruvi
      socket.to(roomId).emit("playerOffline", { userId: String(leaverUserId) });
      emitTeamProgress(roomId);
      checkTeamFinish(roomId);
    } else {
      // 1v1: hamma tugagan bo'lsa finishBattle, aks holda raqibga xabar
      const allFinished = Object.values(battle.players).every((p) => p.finished);
      if (allFinished) {
        finishBattle(roomId);
      } else {
        socket.to(roomId).emit("opponentLeft", { message: "Raqib jangni tark etdi" });
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("O'yinchi uzildi:", socket.id);
    removeFromQueue(socket.id); // navbatda qolib ketmasin

    // ===== JAMOA JANG: uzilgan o'yinchi uchun grace period =====
    // Darrov forfeit QILMAYMIZ (F5 ham disconnect chiqaradi). 30s kutamiz:
    // - o'yinchi qaytsa (reconnect) — rebind bo'ladi, hech narsa bo'lmaydi
    // - qaytmasa — uni 'finished' deb belgilaymiz, jang qotib qolmaydi
    // Bu 1v1 VA jamoa jang uchun ishlaydi.
    var dcUserId = socket.userId;
    var dcSocketId = socket.id;
    if (dcUserId) {
      var rId = userToRoom[dcUserId];
      var b = rId ? battles[rId] : null;
      if (b) {
        // REAL-TIME: "offline" signalini DARROV yubormaymiz.
        // Jang boshida socket bir necha marta ulanib-uzilishi mumkin (matchmaking → jang
        // sahifasiga o'tish). Agar darrov yuborsak, raqib noto'g'ri "oflayn" ko'rinadi.
        // 3 soniya kutamiz: o'yinchi yangi socket bilan qaytsa — offline YUBORMAYMIZ.
        setTimeout(function () {
          var battle = battles[rId];
          if (!battle) return;
          if (userToRoom[dcUserId] !== rId) return;
          var curKey = Object.keys(battle.players).find(function (k) {
            return String(battle.players[k].userId) === String(dcUserId);
          });
          // Yangi socket bilan qaytgan (curKey eski socketdan farq qiladi) — offline emas
          if (!curKey || curKey !== dcSocketId) return;
          // Hali eski socket — haqiqatan offline. Raqib(lar)ga signal.
          socket.to(rId).emit("playerOffline", { userId: String(dcUserId) });
        }, 3000);

        setTimeout(function () {
          var battle = battles[rId];
          if (!battle) return; // jang tugagan
          // O'yinchi qaytdimi? (userToRoom hali shu room'ni ko'rsatyaptimi)
          if (userToRoom[dcUserId] !== rId) return; // boshqa jangda yoki tozalangan
          var curKey = Object.keys(battle.players).find(function (k) {
            return String(battle.players[k].userId) === String(dcUserId);
          });
          if (!curKey) return; // topilmadi
          if (curKey !== dcSocketId) return; // yangi socket bilan qaytgan — hammasi joyida
          // Hali eski socket — demak qaytmadi. Forfeit: 'finished' qilamiz.
          var pl = battle.players[curKey];
          if (pl && !pl.finished) {
            pl.finished = true;
            pl.disconnected = true;
            if (battle.isTeam) {
              // JAMOA: jamoa progress + tugash tekshiruvi
              console.log("Jamoa jang: user " + dcUserId + " qaytmadi (30s) → finished, jang davom etadi");
              emitTeamProgress(rId);
              checkTeamFinish(rId);
            } else {
              // 1v1: raqibga xabar + hamma tugagan bo'lsa finishBattle
              console.log("1v1 jang: user " + dcUserId + " qaytmadi (30s) → finished, jang yakunlanadi");
              socket.to(rId).emit("opponentLeft", { message: "Raqib jangdan chiqib ketdi" });
              var allDone = Object.values(battle.players).every(function (p) { return p.finished; });
              if (allDone) finishBattle(rId);
            }
          }
        }, 30000); // 30 soniya grace
      }
    }

    // Onlayn ro'yxatdan o'chirish
    if (socket.userId && onlineUsers[socket.userId] === socket.id) {
      delete onlineUsers[socket.userId];
      console.log("Offlayn:", socket.userId);
      notifyFriendsStatus(socket.userId, false); // do'stlarga "men offlayn" signali
      removeFromParty(String(socket.userId)); // party'dan ham chiqaramiz
    }
  });
});


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

// ===== SCHOOL BATTLE: maktablar reytingi =====
app.get("/school-battle/rankings", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const scope = ["national", "region", "district"].includes(req.query.scope) ? req.query.scope : "national";
    const period = ["all", "week", "month", "season"].includes(req.query.period) ? req.query.period : "all";
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = 50;
    const offset = (page - 1) * pageSize;

    const ur = await pool.query("SELECT region, district, school FROM users WHERE id = $1", [userId]);
    const me = ur.rows[0] || {};

    // Filtrlarni quramiz
    const conds = [];
    const params = [];
    let pi = 1;
    if (period === "week") conds.push("created_at >= date_trunc('week', NOW())");
    else if (period === "month") conds.push("created_at >= date_trunc('month', NOW())");
    else if (period === "season") { conds.push(`season = $${pi++}`); params.push(currentSeason()); }
    if (scope === "region") { conds.push(`region = $${pi++}`); params.push(me.region); }
    else if (scope === "district") { conds.push(`region = $${pi++}`); params.push(me.region); conds.push(`district = $${pi++}`); params.push(me.district); }
    const whereSql = conds.length ? "WHERE " + conds.join(" AND ") : "";

    const cte = `
      WITH ranked AS (
        SELECT region, district, school,
               SUM(points)::int AS total_points,
               COUNT(DISTINCT user_id)::int AS active_students,
               ROW_NUMBER() OVER (ORDER BY SUM(points) DESC, COUNT(DISTINCT user_id) DESC, school ASC) AS rank
        FROM school_battle_points
        ${whereSql}
        GROUP BY region, district, school
      )`;

    const pageRes = await pool.query(
      `${cte} SELECT *, COUNT(*) OVER() AS total_schools FROM ranked ORDER BY rank LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    let mySchool = null;
    if (me.school) {
      const mineRes = await pool.query(
        `${cte} SELECT * FROM ranked WHERE region = $${pi} AND district = $${pi + 1} AND school = $${pi + 2}`,
        [...params, me.region, me.district, me.school]
      );
      mySchool = mineRes.rows[0] || null;
    }

    const totalSchools = pageRes.rows[0] ? parseInt(pageRes.rows[0].total_schools) : 0;
    const fmt = (r) => ({
      rank: parseInt(r.rank), region: r.region, district: r.district, school: r.school,
      total_points: r.total_points, active_students: r.active_students,
      avg_points: r.active_students ? Math.round(r.total_points / r.active_students) : 0,
      is_mine: !!(me.school && r.region === me.region && r.district === me.district && r.school === me.school),
    });

    res.json({
      scope, period, page, pageSize, total_schools: totalSchools,
      schools: pageRes.rows.map(fmt),
      my_school: mySchool ? fmt(mySchool) : null,
    });
  } catch (err) {
    console.error("School rankings xato:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// O'z maktab holati (Dashboard kartasi uchun)
app.get("/school-battle/my", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const ur = await pool.query("SELECT region, district, school FROM users WHERE id = $1", [userId]);
    const me = ur.rows[0] || {};
    if (!me.school) return res.json({ has_school: false });

    const tot = await pool.query(
      `SELECT COALESCE(SUM(points),0)::int AS total_points, COUNT(DISTINCT user_id)::int AS active_students
       FROM school_battle_points WHERE region=$1 AND district=$2 AND school=$3`,
      [me.region, me.district, me.school]
    );
    const total_points = tot.rows[0].total_points;
    const active_students = tot.rows[0].active_students;

    const seasonTot = await pool.query(
      `SELECT COALESCE(SUM(points),0)::int AS sp FROM school_battle_points WHERE region=$1 AND district=$2 AND school=$3 AND season=$4`,
      [me.region, me.district, me.school, currentSeason()]
    );
    const season_points = seasonTot.rows[0].sp;

    async function rankIn(cond, prms) {
      const q = await pool.query(
        `SELECT COUNT(*) + 1 AS rank FROM (
           SELECT region, district, school, SUM(points) AS tp FROM school_battle_points
           ${cond ? "WHERE " + cond : ""} GROUP BY region, district, school
         ) s WHERE s.tp > $${prms.length + 1}`,
        [...prms, total_points]
      );
      return parseInt(q.rows[0].rank);
    }
    async function countSchools(cond, prms) {
      const q = await pool.query(
        `SELECT COUNT(*) AS c FROM (SELECT 1 FROM school_battle_points ${cond ? "WHERE " + cond : ""} GROUP BY region, district, school) s`,
        prms
      );
      return parseInt(q.rows[0].c);
    }

    const rank_national = await rankIn("", []);
    const rank_region = await rankIn("region = $1", [me.region]);
    const rank_district = await rankIn("region = $1 AND district = $2", [me.region, me.district]);
    const total_national = await countSchools("", []);
    const total_region = await countSchools("region = $1", [me.region]);
    const total_district = await countSchools("region = $1 AND district = $2", [me.region, me.district]);

    const mine = await pool.query(`SELECT COALESCE(SUM(points),0)::int AS my_points FROM school_battle_points WHERE user_id = $1`, [userId]);
    const my_contribution = mine.rows[0].my_points;
    const myRank = await pool.query(
      `SELECT COUNT(*) + 1 AS rank FROM (
         SELECT user_id, SUM(points) AS up FROM school_battle_points
         WHERE region=$1 AND district=$2 AND school=$3 GROUP BY user_id
       ) c WHERE c.up > $4`,
      [me.region, me.district, me.school, my_contribution]
    );

    res.json({
      has_school: true,
      region: me.region, district: me.district, school: me.school,
      total_points, season_points, active_students,
      rank_national, rank_region, rank_district,
      total_national, total_region, total_district,
      my_contribution, my_rank_in_school: parseInt(myRank.rows[0].rank),
    });
  } catch (err) {
    console.error("School my xato:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== BIRLASHGAN MAKTAB REYTINGI (Fame + Effort) — rankings.html uchun =====
app.get("/rankings/combined", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const scope = ["schools", "districts", "regions"].includes(req.query.scope) ? req.query.scope : "schools";
    const period = ["all", "week", "month", "season"].includes(req.query.period) ? req.query.period : "season";
    let within = ["country", "region", "district"].includes(req.query.within) ? req.query.within : "country";
    // Tab'ga mos cheklash: regions faqat country; districts faqat region/country
    if (scope === "regions") within = "country";
    if (scope === "districts" && within === "district") within = "region";

    const ur = await pool.query("SELECT region, district, school FROM users WHERE id = $1", [userId]);
    const me = ur.rows[0] || {};

    // Scope bo'yicha guruhlash
    let groupCols, selCols, fameWhere;
    if (scope === "regions") {
      groupCols = "region"; selCols = "region";
      fameWhere = "region IS NOT NULL AND region <> ''";
    } else if (scope === "districts") {
      groupCols = "region, district"; selCols = "region, district";
      fameWhere = "region IS NOT NULL AND region <> '' AND district IS NOT NULL AND district <> ''";
    } else {
      groupCols = "region, district, school"; selCols = "region, district, school";
      fameWhere = "region IS NOT NULL AND region <> '' AND school IS NOT NULL AND school <> ''";
    }
    const keyOf = (r) => {
      if (scope === "regions") return r.region || "";
      if (scope === "districts") return (r.region || "") + "||" + (r.district || "");
      return (r.region || "") + "||" + (r.district || "") + "||" + (r.school || "");
    };

    // Geografik filtr (within) — maktabni o'z tumani/viloyati/davlat ichida
    const fameParams = [];
    let geoSql = "";
    if (within !== "country" && me.region) {
      fameParams.push(me.region); geoSql += ` AND region = $${fameParams.length}`;
    }
    if (within === "district" && me.district) {
      fameParams.push(me.district); geoSql += ` AND district = $${fameParams.length}`;
    }

    // FAME — o'rtacha rating (joriy)
    const fameRes = await pool.query(
      `SELECT ${selCols}, ROUND(AVG(rating))::int AS avg_rating, COUNT(*)::int AS player_count
       FROM users WHERE ${fameWhere}${geoSql} GROUP BY ${groupCols}`,
      fameParams
    );

    // EFFORT — davr bo'yicha jang ochkosi
    const effConds = []; const effParams = [];
    if (period === "week") effConds.push("created_at >= date_trunc('week', NOW())");
    else if (period === "month") effConds.push("created_at >= date_trunc('month', NOW())");
    else if (period === "season") { effConds.push("season = $1"); effParams.push(currentSeason()); }
    // Geografik filtr (within) — effort ham o'sha tuman/viloyat ichida
    if (within !== "country" && me.region) {
      effParams.push(me.region); effConds.push(`region = $${effParams.length}`);
    }
    if (within === "district" && me.district) {
      effParams.push(me.district); effConds.push(`district = $${effParams.length}`);
    }
    const effWhere = effConds.length ? "WHERE " + effConds.join(" AND ") : "";
    const effRes = await pool.query(
      `SELECT ${selCols}, COALESCE(SUM(points),0)::int AS effort_points, COUNT(DISTINCT user_id)::int AS active_students
       FROM school_battle_points ${effWhere} GROUP BY ${groupCols}`,
      effParams
    );
    const effMap = {};
    effRes.rows.forEach((r) => { effMap[keyOf(r)] = r; });

    // FORMULA — teng vazn (Fame 1500 / Effort 1500)
    const FAME_W = 1500, EFFORT_W = 1500, FAME_MIN = 800, FAME_MAX = 2000, EFFORT_K = 1500;
    const fameScore = (avg) => Math.max(0, Math.min(1, (avg - FAME_MIN) / (FAME_MAX - FAME_MIN))) * FAME_W;
    const effortScore = (pts) => EFFORT_W * pts / (pts + EFFORT_K);

    let rows = fameRes.rows.map((f) => {
      const eff = effMap[keyOf(f)] || {};
      const effort_points = eff.effort_points || 0;
      const fame_score = Math.round(fameScore(f.avg_rating));
      const effort_score = Math.round(effortScore(effort_points));
      return {
        region: f.region, district: f.district || null, school: f.school || null,
        avg_rating: f.avg_rating, player_count: f.player_count,
        effort_points, active_students: eff.active_students || 0,
        fame_score, effort_score, school_rating: fame_score + effort_score,
      };
    });
    rows.sort((a, b) => b.school_rating - a.school_rating || b.effort_points - a.effort_points || b.avg_rating - a.avg_rating);
    rows.forEach((r, i) => { r.rank = i + 1; });

    const mineKey = (scope === "regions") ? (me.region || "")
      : (scope === "districts") ? (me.region || "") + "||" + (me.district || "")
      : (me.region || "") + "||" + (me.district || "") + "||" + (me.school || "");
    let myEntry = null;
    rows.forEach((r) => {
      r.is_mine = (keyOf(r) === mineKey) && (scope !== "schools" || !!me.school) && (scope !== "districts" || !!me.district) && (scope !== "regions" || !!me.region);
      if (r.is_mine) myEntry = r;
    });

    res.json({ scope, period, within, season: currentSeason(), count: rows.length, total: rows.length, rankings: rows.slice(0, 100), my_entry: myEntry });
  } catch (err) {
    console.error("Combined rankings xato:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

app.get("/leaderboard", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const scope = ["global", "national", "region", "district", "school", "friends"].includes(req.query.scope) ? req.query.scope : "global";
    const period = ["all", "week", "month", "season"].includes(req.query.period) ? req.query.period : "all";

    const ur = await pool.query("SELECT region, district, school FROM users WHERE id = $1", [userId]);
    const me = ur.rows[0] || {};

    // Qamrov filtri
    let where = "";
    const params = [];
    if (scope === "region") { params.push(me.region); where = "WHERE u.region = $1"; }
    else if (scope === "district") { params.push(me.region, me.district); where = "WHERE u.region = $1 AND u.district = $2"; }
    else if (scope === "school") { params.push(me.region, me.district, me.school); where = "WHERE u.region = $1 AND u.district = $2 AND u.school = $3"; }
    else if (scope === "friends") {
      const fr = await pool.query(
        `SELECT CASE WHEN requester_id = $1 THEN receiver_id ELSE requester_id END AS fid
         FROM friendships WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
        [userId]
      );
      const ids = fr.rows.map(r => r.fid); ids.push(userId);
      params.push(ids); where = "WHERE u.id = ANY($1)";
    }

    let allRows;
    if (period === "all") {
      const result = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.xp, u.profile_picture,
                u.region, u.district, u.school, u.village, u.country,
                COUNT(bh.id) FILTER (WHERE bh.outcome = 'win') AS wins,
                COUNT(bh.id) AS total_battles
         FROM users u
         LEFT JOIN battle_history bh ON bh.user_id = u.id
         ${where}
         GROUP BY u.id
         ORDER BY u.rating DESC, u.xp DESC`,
        params
      );
      allRows = result.rows.map((p) => {
        const total = parseInt(p.total_battles), wins = parseInt(p.wins);
        return {
          id: p.id, first_name: p.first_name, last_name: p.last_name, cefr_level: p.cefr_level,
          rating: p.rating, profile_picture: p.profile_picture,
          region: p.region, district: p.district, school: p.school, village: p.village, country: p.country,
          wins: wins, win_rate: total > 0 ? Math.round((wins / total) * 100) : 0,
        };
      });
    } else {
      const startSql = period === "week" ? "date_trunc('week', NOW())" : (period === "month" ? "date_trunc('month', NOW())" : "date_trunc('quarter', NOW())");
      const result = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.profile_picture,
                u.region, u.district, u.school, u.village, u.country,
                COALESCE(SUM(bh.rating_change), 0)::int AS period_gain,
                COUNT(bh.id) FILTER (WHERE bh.outcome = 'win')::int AS period_wins,
                COUNT(bh.id)::int AS period_battles
         FROM users u
         JOIN battle_history bh ON bh.user_id = u.id AND bh.played_at >= ${startSql}
         ${where}
         GROUP BY u.id
         ORDER BY period_gain DESC, period_wins DESC`,
        params
      );
      allRows = result.rows.map((p) => ({
        id: p.id, first_name: p.first_name, last_name: p.last_name, cefr_level: p.cefr_level,
        rating: p.rating, profile_picture: p.profile_picture,
        region: p.region, district: p.district, school: p.school, village: p.village, country: p.country,
        period_gain: p.period_gain, wins: p.period_wins,
        win_rate: p.period_battles > 0 ? Math.round((p.period_wins / p.period_battles) * 100) : 0,
      }));
    }

    const myIndex = allRows.findIndex(p => p.id === userId);
    const my_rank = myIndex >= 0 ? myIndex + 1 : null;
    allRows.forEach((p, i) => { p.rank = i + 1; });
    const players = allRows.slice(0, 50);
    const my_entry = (myIndex >= 50) ? allRows[myIndex] : null;

    res.json({ scope, period, players, my_rank, my_entry, total_players: allRows.length });
  } catch (err) {
    console.error("Leaderboard xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// O'quvchining har qamrovdagi o'rni (Your Rankings kartasi uchun)
app.get("/leaderboard/my-ranks", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const ur = await pool.query("SELECT region, district, school, rating FROM users WHERE id = $1", [userId]);
    const me = ur.rows[0];
    if (!me) return res.json({});
    const myRating = me.rating || 1000;

    async function rankIn(cond, prms) {
      const q = await pool.query(
        `SELECT COUNT(*) + 1 AS rank FROM users WHERE rating > $1${cond ? " AND " + cond : ""}`,
        [myRating, ...prms]
      );
      return parseInt(q.rows[0].rank);
    }
    async function totIn(cond, prms) {
      const q = await pool.query(`SELECT COUNT(*) AS c FROM users${cond ? " WHERE " + cond : ""}`, prms);
      return parseInt(q.rows[0].c);
    }

    const fr = await pool.query(
      `SELECT CASE WHEN requester_id = $1 THEN receiver_id ELSE requester_id END AS fid
       FROM friendships WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
      [userId]
    );
    const fids = fr.rows.map(r => r.fid); fids.push(userId);
    const frRankQ = await pool.query(
      `SELECT COUNT(*) + 1 AS rank FROM users WHERE id = ANY($2) AND rating > $1`,
      [myRating, fids]
    );

    res.json({
      rating: myRating,
      global: await rankIn("", []),
      national: await rankIn("", []),
      region: me.region ? await rankIn("region = $2", [me.region]) : null,
      district: (me.region && me.district) ? await rankIn("region = $2 AND district = $3", [me.region, me.district]) : null,
      school: (me.region && me.district && me.school) ? await rankIn("region = $2 AND district = $3 AND school = $4", [me.region, me.district, me.school]) : null,
      friends: parseInt(frRankQ.rows[0].rank),
      total_global: await totIn("", []),
      total_region: me.region ? await totIn("region = $1", [me.region]) : 0,
      total_district: (me.region && me.district) ? await totIn("region = $1 AND district = $2", [me.region, me.district]) : 0,
      total_school: (me.region && me.district && me.school) ? await totIn("region = $1 AND district = $2 AND school = $3", [me.region, me.district, me.school]) : 0,
      total_friends: fids.length,
    });
  } catch (err) {
    console.error("My-ranks xato:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ ADMIN PANEL ============

// ===== ADMIN LOGIN RATE LIMIT (in-memory, tashqi paketsiz) =====
// Brute-force himoyasi: bir IP'dan ketma-ket noto'g'ri urinishlarni cheklaydi
const { adminLoginRateLimit, recordFailedLogin, clearLoginAttempts } =
  createAdminLoginAttemptService({ failGate, noteFail, noteOk, clientIp });
const adminAuthRoutes = createAdminAuthRoutes({
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
app.use(adminAuthRoutes.loginRouter);

// Admin token tekshirish — sahifa qayta yuklanganda token hali amal qiladimi
app.use(adminMeRoutes);

app.use(adminLogoutRoutes({ pool, logAudit }));

// Admin parolini o'zgartirish (eski parolni tasdiqlash bilan)
app.use(adminAuthRoutes.passwordRouter);

// Tizim ma'lumotlari (Settings sahifasi uchun)
app.use(adminSettingsInfoRoutes());

// ============ MODERATSIYA (SHIKOYAT / FLAG) ============

// O'quvchi shikoyat yuboradi (savol yoki foydalanuvchi ustidan)
app.use(moderationFlagRoutes({ pool, logAudit }));

// Admin: kutilayotgan shikoyatlar soni (sidebar badge uchun)
app.use(adminFlagCountRoutes());

// Admin: foydalanuvchining so'nggi chat xabarlari (moderatsiya uchun)
app.use(adminUserMessagesRoutes());

// Admin: bitta jang (room) suhbati — ikkala o'yinchi xabarlari (moderatsiya)
app.use(adminRoomMessagesRoutes());

// ===== ADMIN: HISOBOTLAR (REPORTS) =====
// Tahlil — vaqt oralig'i bo'yicha. Query: ?days=30 (yoki 7, 90)
app.get("/admin/reports", requireAdmin, async (req, res) => {
  try {
    var days = parseInt(req.query.days) || 30;
    if ([7, 30, 90].indexOf(days) === -1) days = 30;

    var results = await Promise.all([
      // 1. Asosiy ko'rsatkichlar (umumiy)
      pool.query("SELECT COUNT(*) AS c FROM users"),
      pool.query("SELECT COUNT(*) AS c FROM battle_history"),
      pool.query("SELECT COUNT(*) AS c FROM questions"),
      pool.query("SELECT COUNT(*) AS c FROM flags WHERE status = 'pending'"),
      // 2. Tanlangan davrdagi yangi foydalanuvchilar
      pool.query("SELECT COUNT(*) AS c FROM users WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval", [days - 1]),
      // 3. Tanlangan davrdagi janglar
      pool.query("SELECT COUNT(*) AS c FROM battle_history WHERE played_at >= CURRENT_DATE - ($1 || ' days')::interval", [days - 1]),
      // 4. Foydalanuvchi o'sishi (kunlik, tanlangan davr)
      pool.query("SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS c FROM users WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval GROUP BY day ORDER BY day", [days - 1]),
      // 5. Jang faolligi (kunlik, tanlangan davr)
      pool.query("SELECT TO_CHAR(played_at, 'YYYY-MM-DD') AS day, COUNT(*) AS c FROM battle_history WHERE played_at >= CURRENT_DATE - ($1 || ' days')::interval GROUP BY day ORDER BY day", [days - 1]),
      // 6. Daraja taqsimoti (barcha o'quvchilar)
      pool.query("SELECT cefr_level, COUNT(*) AS c FROM users WHERE role = 'student' OR role IS NULL GROUP BY cefr_level"),
      // 7. Eng faol viloyatlar (top 6)
      pool.query("SELECT region, COUNT(*) AS c FROM users WHERE region IS NOT NULL AND region != '' GROUP BY region ORDER BY c DESC LIMIT 6"),
      // 8. Eng faol maktablar (top 6, o'quvchi soni bo'yicha)
      pool.query("SELECT school, region, district, COUNT(*) AS c FROM users WHERE school IS NOT NULL AND school != '' GROUP BY school, region, district ORDER BY c DESC LIMIT 6"),
    ]);

    res.json({
      days: days,
      totals: {
        users: parseInt(results[0].rows[0].c),
        battles: parseInt(results[1].rows[0].c),
        questions: parseInt(results[2].rows[0].c),
        pendingFlags: parseInt(results[3].rows[0].c),
        newUsers: parseInt(results[4].rows[0].c),
        periodBattles: parseInt(results[5].rows[0].c),
      },
      userGrowth: results[6].rows.map(function (r) { return { day: r.day, count: parseInt(r.c) }; }),
      battleActivity: results[7].rows.map(function (r) { return { day: r.day, count: parseInt(r.c) }; }),
      levelDistribution: results[8].rows.map(function (r) { return { level: r.cefr_level || "A1", count: parseInt(r.c) }; }),
      topRegions: results[9].rows.map(function (r) { return { name: r.region, count: parseInt(r.c) }; }),
      topSchools: results[10].rows.map(function (r) { return { name: r.school, region: r.region || "—", count: parseInt(r.c) }; }),
    });
  } catch (err) {
    console.error("Hisobotlar xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ PRACTICE (YAKKA MASHQ) ============

// Practice savollarini olish (token bilan, daraja + son tanlanadi)
app.get("/practice/start", authMiddleware, async (req, res) => {
  try {
    var level = (req.query.level || req.user.cefr_level || "A1").trim();
    var count = parseInt(req.query.count) || 10;
    if (count < 5) count = 5;
    if (count > 30) count = 30;

    var validLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    if (validLevels.indexOf(level) === -1) level = "A1";

    // Savollarni olamiz (to'g'ri javob bilan — practice'da darhol ko'rsatamiz)
    var result = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, skill
       FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT $2`,
      [level, count]
    );

    // Yetarli savol bo'lmasa — har qanday darajadan to'ldiramiz
    if (result.rows.length < count) {
      var extra = await pool.query(
        `SELECT id, question_text, option_a, option_b, option_c, option_d, skill
         FROM questions WHERE cefr_level != $1 ORDER BY RANDOM() LIMIT $2`,
        [level, count - result.rows.length]
      );
      result.rows = result.rows.concat(extra.rows);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Hozircha savollar mavjud emas" });
    }

    const sessionId = crypto.randomUUID();
    const questionIds = result.rows.map((q) => Number(q.id));
    await pool.query(
      `INSERT INTO practice_sessions (id, user_id, level, question_ids, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '60 minutes')`,
      [sessionId, req.user.id, level, questionIds]
    );

    res.json({ session_id: sessionId, level: level, total: result.rows.length, questions: result.rows });
  } catch (err) {
    console.error("Practice start xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Practice yakunlash — XP berish (reyting YO'Q, faqat XP)
// Sprint 2A: XP-farming himoyasi — soatiga max 12 ta practice yakunlash (user boyicha)
// Practice javobini server tekshiradi. To'g'ri variant faqat shu savolga
// birinchi javob berilgandan keyin qaytariladi.
app.post("/practice/answer", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const sessionId = String(req.body.session_id || "");
    const questionId = parseInt(req.body.question_id, 10);
    const answer = String(req.body.answer || "").toUpperCase();
    if (!sessionId || !questionId || !["A", "B", "C", "D"].includes(answer)) {
      return res.status(400).json({ error: "Noto'g'ri javob ma'lumoti" });
    }

    await client.query("BEGIN");
    const sessionResult = await client.query(
      `SELECT * FROM practice_sessions
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [sessionId, req.user.id]
    );
    const session = sessionResult.rows[0];
    if (!session || session.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Practice sessiyasi faol emas" });
    }
    if (new Date(session.expires_at) < new Date()) {
      await client.query("UPDATE practice_sessions SET status='expired' WHERE id=$1", [sessionId]);
      await client.query("COMMIT");
      return res.status(400).json({ error: "Practice sessiyasi muddati tugagan" });
    }

    const questionIds = (session.question_ids || []).map(Number);
    const answeredIds = (session.answered_ids || []).map(Number);
    if (!questionIds.includes(questionId)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Savol bu sessiyaga tegishli emas" });
    }
    if (answeredIds.includes(questionId)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Bu savolga allaqachon javob berilgan" });
    }

    const questionResult = await client.query(
      "SELECT correct_option, explanation FROM questions WHERE id = $1",
      [questionId]
    );
    if (!questionResult.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Savol topilmadi" });
    }
    const question = questionResult.rows[0];
    const isCorrect = answer === question.correct_option;
    const updated = await client.query(
      `UPDATE practice_sessions
       SET answered_ids = array_append(answered_ids, $1::integer),
           correct_count = correct_count + $2
       WHERE id = $3
       RETURNING correct_count, cardinality(answered_ids) AS answered_count`,
      [questionId, isCorrect ? 1 : 0, sessionId]
    );
    await client.query("COMMIT");

    res.json({
      is_correct: isCorrect,
      correct_option: question.correct_option,
      explanation: question.explanation || null,
      correct_count: updated.rows[0].correct_count,
      answered_count: updated.rows[0].answered_count,
      total: questionIds.length,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Practice answer xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  } finally {
    client.release();
  }
});

// Logout token versiyasini oshiradi: shu hisobning oldingi JWT tokenlari darhol bekor bo'ladi.
app.use(logoutRoutes());

var practiceFinishLimiter = countLimiter("practice_finish", {
  keyFn: function (req) { return "u:" + (req.user && req.user.id); },
  max: 12, windowMs: 60 * 60 * 1000, blockMs: 30 * 60 * 1000,
  message: "Juda ko'p practice yakunlandi.",
});

app.post("/practice/finish", authMiddleware, practiceFinishLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    var userId = req.user.id;
    var sessionId = String(req.body.session_id || "");
    if (!sessionId) return res.status(400).json({ error: "Practice sessiyasi topilmadi" });

    await client.query("BEGIN");
    const sessionResult = await client.query(
      `SELECT * FROM practice_sessions
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [sessionId, userId]
    );
    const session = sessionResult.rows[0];
    if (!session || session.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Practice sessiyasi faol emas" });
    }
    const total = (session.question_ids || []).length;
    const answered = (session.answered_ids || []).length;
    const correct = Number(session.correct_count) || 0;

    // Sprint 2A: total'ga yuqori chegara — practice max 30 savol, undan katta so'rov = firibgarlik
    if (total <= 0 || answered !== total) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Barcha savollarga javob bering" });
    }

    // Practice XP: har to'g'ri javob uchun 2 XP (rankedّdan kam — bu mashq)
    var xpEarned = correct * 2;

    await client.query(
      "UPDATE practice_sessions SET status='finished', finished_at=NOW() WHERE id=$1",
      [sessionId]
    );
    var updated = await client.query(
      "UPDATE users SET xp = xp + $1 WHERE id = $2 RETURNING id, xp, cefr_level, rating",
      [xpEarned, userId]
    );

    await client.query("COMMIT");

    // Topshiriq progressini ham yangilaymiz (practice ham "javob berish" hisoblanadi)
    await updateQuestProgress(userId, { won: false, correctAnswers: correct, xpEarned: xpEarned });

    res.json({
      xp_earned: xpEarned,
      correct: correct,
      total: total,
      updated_user: updated.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Practice finish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  } finally {
    client.release();
  }
});

// ============================================================
// SCHOOL CUP — TURNIR (Bosqich 2: Admin turnir yaratish)
// ============================================================

app.use(adminTournamentRegionsRoutes());

app.use(adminTournamentDistrictSchoolsRoutes({ pool }));

// Turnir yaratish (tuman darajasi)
app.post("/admin/tournaments/create", requireAdmin, async (req, res) => {
  try {
    const { name, region, district, team_size, reserve_size,
            questions_per_match, seconds_per_match,
            registration_deadline, starts_at } = req.body;

    // Validatsiya
    if (!name || !name.trim()) return res.status(400).json({ error: "Turnir nomi kerak" });
    if (!region || !district) return res.status(400).json({ error: "Viloyat va tuman tanlang" });
    const safeTournamentName = sanitizeText(name, 200); // Sprint 1: XSS himoya

    const teamSize = parseInt(team_size) || 5;
    const reserveSize = parseInt(reserve_size) || 2;
    const qpm = parseInt(questions_per_match) || 20;
    const spm = parseInt(seconds_per_match) || 300;
    if (teamSize < 1 || teamSize > 10) return res.status(400).json({ error: "Jamoa hajmi 1-10 oralig'ida" });

    // Tumanda kamida 2 maktab borligini tekshiramiz (turnir uchun minimal)
    const schoolsQ = await pool.query(
      `SELECT COUNT(DISTINCT school) AS c FROM users
       WHERE region = $1 AND district = $2
         AND school IS NOT NULL AND school <> ''
         AND (role = 'student' OR role IS NULL)`,
      [region, district]
    );
    const schoolCount = parseInt(schoolsQ.rows[0].c);
    if (schoolCount < 2) {
      return res.status(400).json({ error: "Bu tumanda kamida 2 ta maktab kerak (hozir: " + schoolCount + ")" });
    }

    // Turnirni yaratamiz (status = registration: jamoa tuzish bosqichi)
    const ins = await pool.query(
      `INSERT INTO tournaments
        (name, level, scope_value, region, status, team_size, reserve_size,
         questions_per_match, seconds_per_match, registration_deadline, starts_at, created_by)
       VALUES ($1, 'district', $2, $3, 'registration', $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [safeTournamentName, district, region, teamSize, reserveSize, qpm, spm,
       registration_deadline || null, starts_at || null, null]
    );

    res.json({ success: true, tournament: ins.rows[0], eligible_schools: schoolCount });
  } catch (err) {
    console.error("Turnir yaratish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi: " + err.message });
  }
});

app.use(adminTournamentListRoutes({ pool }));

// ===== SETKA GENERATSIYASI (Bosqich 4) =====

// Setkani yaratish — seeding + bracket + jadval
app.post("/admin/tournaments/:id/generate-bracket", requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const tid = req.params.id;
    const tr = await client.query("SELECT * FROM tournaments WHERE id = $1", [tid]);
    if (tr.rows.length === 0) { client.release(); return res.status(404).json({ error: "Turnir topilmadi" }); }
    const t = tr.rows[0];

    // Faqat registration holatida setka yaratish mumkin
    if (t.status !== "registration") {
      client.release();
      return res.status(400).json({ error: "Setka faqat 'Ro'yxat' bosqichida yaratiladi (hozir: " + t.status + ")" });
    }

    // Qatnashuvchi maktablar (jamoa tuzganlar) — reyting bo'yicha
    const schoolsQ = await client.query(
      `SELECT school, region, district, school_key, avg_rating
       FROM tournament_schools
       WHERE tournament_id = $1
       ORDER BY avg_rating DESC, school ASC`,
      [tid]
    );
    const schools = schoolsQ.rows;
    const n = schools.length;

    if (n < 2) {
      client.release();
      return res.status(400).json({ error: "Setka uchun kamida 2 ta maktab kerak (jamoa tuzgan: " + n + ")" });
    }

    // Bracket hajmi: n dan keyingi 2 daraja (2,4,8,16,32)
    let size = 2;
    while (size < n) size *= 2;

    // Seeding: maktablarga 1..n seed beramiz (reyting bo'yicha), seedlarni saqlaymiz
    await client.query("BEGIN");
    for (let i = 0; i < n; i++) {
      await client.query(
        "UPDATE tournament_schools SET seed = $1, eliminated = false, placement = NULL WHERE tournament_id = $2 AND school_key = $3",
        [i + 1, tid, schools[i].school_key]
      );
    }

    // Eski matchlarni tozalaymiz (qayta generatsiya bo'lsa)
    await client.query(
      `DELETE FROM tournament_match_players WHERE match_id IN (SELECT id FROM tournament_matches WHERE tournament_id = $1)`,
      [tid]
    );
    await client.query("DELETE FROM tournament_matches WHERE tournament_id = $1", [tid]);

    // Seeding pozitsiyalari (setkadagi joylashuv)
    const positions = seedOrder(size); // size uzunlikdagi massiv, qiymatlar 1..size
    // Har pozitsiyaga maktab (seed) yoki null (bye) joylaymiz
    // positions[i] = shu slotda turadigan seed raqami
    const slots = positions.map(seedNo => (seedNo <= n ? schools[seedNo - 1] : null));

    // 1-raund matchlari: slotларни juft-juft olamiz
    const startsAt = t.starts_at ? new Date(t.starts_at) : new Date(Date.now() + 24 * 3600 * 1000);
    const gapMin = 30; // matchlar orasида 30 daqiqa
    const round1MatchCount = size / 2;
    let matchTime = new Date(startsAt);

    const round1Winners = []; // bye bo'lsa avtomatik g'olib
    for (let m = 0; m < round1MatchCount; m++) {
      const a = slots[m * 2];
      const b = slots[m * 2 + 1];

      // Bye holati: biri null bo'lsa, ikkinchisi avtomatik o'tadi (match yaratamiz, lekin done)
      let status = "pending";
      let winner = null;
      if (a && !b) { status = "done"; winner = a; }
      else if (!a && b) { status = "done"; winner = b; }
      else if (!a && !b) { status = "done"; winner = null; } // ikkalasi bye (kam holat)

      const sched = (status === "pending") ? new Date(matchTime) : null;
      const ins = await client.query(
        `INSERT INTO tournament_matches
          (tournament_id, round, match_no, school_a, school_b, school_a_key, school_b_key,
           winner_school, winner_school_key, status, scheduled_at, finished_at)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [tid, m + 1, a && a.school, b && b.school, a && a.school_key, b && b.school_key,
         winner && winner.school, winner && winner.school_key, status, sched,
         (status === "done" ? new Date() : null)]
      );

      if (status === "pending") matchTime = new Date(matchTime.getTime() + gapMin * 60000);
      round1Winners.push({ matchNo: m + 1, winner: winner });
    }

    // Keyingi raundlar uchun bo'sh matchlar (kim chiqishi keyin aniqlanadi)
    let prevCount = round1MatchCount;
    let round = 2;
    while (prevCount > 1) {
      const cnt = prevCount / 2;
      for (let m = 0; m < cnt; m++) {
        await client.query(
          `INSERT INTO tournament_matches
            (tournament_id, round, match_no, status, scheduled_at)
           VALUES ($1, $2, $3, 'pending', $4)`,
          [tid, round, m + 1, new Date(matchTime)]
        );
        matchTime = new Date(matchTime.getTime() + gapMin * 60000);
      }
      prevCount = cnt;
      round++;
    }

    // Bye g'oliblarini keyingi raundga ko'chiramiz (avtomatik o'tganlar)
    await propagateByes(client, tid);

    // Turnir statusini 'bracket' ga o'tkazamiz + bracket_size saqlaymiz
    await client.query(
      "UPDATE tournaments SET status = 'bracket', bracket_size = $1 WHERE id = $2",
      [size, tid]
    );

    await client.query("COMMIT");
    client.release();
    res.json({
      success: true,
      bracket_size: size,
      schools: n,
      byes: size - n,
      rounds: Math.log2(size),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    client.release();
    console.error("Setka generatsiya xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi: " + err.message });
  }
});

// Setkani o'qish — barcha matchlar + maktablar (admin va keyin o'quvchilar ko'radi)
app.get("/admin/tournaments/:id/bracket", requireAdmin, async (req, res) => {
  try {
    const tid = req.params.id;
    const tr = await pool.query("SELECT * FROM tournaments WHERE id = $1", [tid]);
    if (tr.rows.length === 0) return res.status(404).json({ error: "Turnir topilmadi" });
    const t = tr.rows[0];

    // Qatnashuvchi maktablar (seed bilan)
    const schoolsQ = await pool.query(
      "SELECT school, region, district, school_key, seed, avg_rating, eliminated, placement FROM tournament_schools WHERE tournament_id = $1 ORDER BY seed ASC",
      [tid]
    );

    // Barcha matchlar
    const matchesQ = await pool.query(
      `SELECT id, round, match_no, school_a, school_b, school_a_key, school_b_key, score_a, score_b,
              winner_school, winner_school_key, status, scheduled_at, started_at, finished_at
       FROM tournament_matches
       WHERE tournament_id = $1
       ORDER BY round ASC, match_no ASC`,
      [tid]
    );

    // Raundlarga guruhlaymiz
    const rounds = {};
    matchesQ.rows.forEach(m => {
      if (!rounds[m.round]) rounds[m.round] = [];
      rounds[m.round].push(m);
    });

    res.json({
      tournament: {
        id: t.id, name: t.name, status: t.status,
        bracket_size: t.bracket_size, level: t.level,
        scope_value: t.scope_value, region: t.region,
        team_size: t.team_size,
      },
      schools: schoolsQ.rows,
      rounds: rounds,
      total_rounds: t.bracket_size ? Math.log2(t.bracket_size) : 0,
    });
  } catch (err) {
    console.error("Setka o'qish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

app.use(adminTournamentDetailRoutes({ pool }));

// Turnirni tahrirlash (status'ga qarab xavfsiz)
app.post("/admin/tournaments/:id/edit", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const cur = await pool.query("SELECT * FROM tournaments WHERE id = $1", [id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: "Turnir topilmadi" });
    const t = cur.rows[0];

    const { name, team_size, reserve_size, questions_per_match,
            seconds_per_match, registration_deadline, starts_at, region, district } = req.body;

    // Setka tuzilganmi? (registration = hali tuzilmagan, erkin tahrir)
    const bracketLocked = (t.status !== "registration" && t.status !== "draft");

    // Yangi qiymatlarni yig'amiz (faqat kelganlarini o'zgartiramiz)
    const fields = [];
    const vals = [];
    let pi = 0;

    function setField(col, val) { pi++; fields.push(col + " = $" + pi); vals.push(val); }

    // Nom — har doim o'zgartirish mumkin (xavfsiz)
    if (name !== undefined && name.trim()) setField("name", name.trim());

    // Sana/deadline — har doim mumkin
    if (registration_deadline !== undefined) setField("registration_deadline", registration_deadline || null);
    if (starts_at !== undefined) setField("starts_at", starts_at || null);

    // Quyidagilar — faqat setka tuzilmaganda (bracketLocked = false)
    if (!bracketLocked) {
      if (team_size !== undefined) {
        const ts = parseInt(team_size);
        if (ts >= 1 && ts <= 10) setField("team_size", ts);
      }
      if (reserve_size !== undefined) {
        const rs = parseInt(reserve_size);
        if (rs >= 0 && rs <= 5) setField("reserve_size", rs);
      }
      if (questions_per_match !== undefined) {
        const q = parseInt(questions_per_match);
        if (q >= 5 && q <= 50) setField("questions_per_match", q);
      }
      if (seconds_per_match !== undefined) {
        const s = parseInt(seconds_per_match);
        if (s >= 60 && s <= 1200) setField("seconds_per_match", s);
      }
      if (region !== undefined && region) setField("region", region);
      if (district !== undefined && district) setField("scope_value", district);
    } else {
      // Setka tuzilgan — xavfli maydonlar so'ralsa, ogohlantirib o'tkazib yuboramiz
      const blocked = [];
      if (team_size !== undefined && parseInt(team_size) !== t.team_size) blocked.push("jamoa hajmi");
      if (region !== undefined && region !== t.region) blocked.push("viloyat");
      if (district !== undefined && district !== t.scope_value) blocked.push("tuman");
      if (blocked.length > 0) {
        return res.status(400).json({ error: "Setka tuzilgani uchun o'zgartirib bo'lmaydi: " + blocked.join(", ") });
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: "O'zgartirish uchun ma'lumot yo'q" });

    pi++;
    vals.push(id);
    const upd = await pool.query(
      `UPDATE tournaments SET ${fields.join(", ")} WHERE id = $${pi} RETURNING *`,
      vals
    );
    res.json({ success: true, tournament: upd.rows[0] });
  } catch (err) {
    console.error("Turnir tahrirlash xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi: " + err.message });
  }
});

app.use(adminTournamentDeleteRoutes({ pool }));

// Savollarni olish (admin) — pagination, search, filter bilan
// GET, token bilan (parol emas). Query: ?page=1&limit=25&search=&level=&skill=&status=&date_from=&date_to=
app.use(adminQuestionListRoutes({ pool }));

// Yangi savol qo'shish
app.use(adminQuestionCreateRoutes({ pool, logAudit }));

app.use(adminQuestionDeleteRoutes({ pool, logAudit }));

// Savolni tahrirlash (Edit)
app.use(adminQuestionUpdateRoutes({ pool, logAudit }));

// ===== QUESTION DISTRIBUTION (real statistika) =====
// Daraja, ko'nikma, status bo'yicha savol taqsimoti — hammasi bazadan
app.use(adminQuestionStatsRoutes({ pool }));

// ===== QUESTION HEALTH (real validatsiya formulasi) =====
// Validation Score = valid savollar / jami × 100. Hammasi bazadan hisoblanadi.
app.use(adminQuestionHealthRoutes({ pool }));

// ===== AUDIT LOGS RO'YXATI (Recent Admin Activity) =====
app.use(adminAuditLogListRoutes({ pool }));

// ===== ADMIN OVERVIEW (umumiy dashboard statistikasi) =====
// Jami savol, foydalanuvchi, maktab, jang — hammasi bazadan
app.use(adminOverviewRoutes({ pool }));

// ===== ADMIN: FOYDALANUVCHILAR =====
// Ro'yxat — pagination, qidiruv, filtr (rol, daraja, viloyat)
app.use(adminUserListRoutes({ pool }));

app.use(adminUserRoleRoutes({ pool, logAudit }));

app.use(adminUserBanRoutes({ pool, logAudit }));

// Foydalanuvchi ma'lumotini tahrirlash (viloyat, tuman, maktab, daraja)
app.use(adminUserUpdateRoutes({ pool, logAudit }));

// Bitta foydalanuvchi to'liq ma'lumoti (modal uchun)
app.use(adminUserDetailRoutes({ pool }));

// ===== ADMIN: MAKTABLAR =====
// Maktablar ro'yxati — viloyat + tuman + nom bo'yicha guruhlangan (sun'iy juftlik yo'q)
app.use(adminSchoolListRoutes({ pool }));

// Bitta maktab o'quvchilari (drill-down) — nom + viloyat + tuman bo'yicha
app.use(adminSchoolStudentListRoutes({ pool }));

// ===== BULK IMPORT (CSV) =====
// Frontend tahlil qilingan qatorlarni yuboradi. Backend HAR qatorni QAYTA validatsiya qiladi
// (frontendga ishonmaymiz) va faqat valid qatorlarni bazaga qo'shadi.
app.post("/admin/questions/bulk-import", requireAdmin, async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Import uchun qatorlar yo'q" });
    }
    if (rows.length > 1000) {
      return res.status(400).json({ error: "Bir martada maksimal 1000 ta savol" });
    }

    var validLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    var validAnswers = ["A", "B", "C", "D"];
    var validStatuses = ["published", "draft", "needs_review"];

    // Mavjud savollar matnini olamiz (duplicate tekshiruvi uchun)
    var existing = await pool.query("SELECT LOWER(TRIM(question_text)) AS qt FROM questions");
    var existingSet = {};
    existing.rows.forEach(function (r) { existingSet[r.qt] = true; });

    var inserted = 0, skipped = 0;
    var seenInBatch = {};
    var errors = [];

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || {};
      var qText = (r.question_text || "").trim();
      var oA = (r.option_a || "").trim();
      var oB = (r.option_b || "").trim();
      var oC = (r.option_c || "").trim();
      var oD = (r.option_d || "").trim();
      var correct = (r.correct_option || "").trim().toUpperCase();
      var level = (r.cefr_level || "A1").trim().toUpperCase();
      var skill = (r.skill || "grammar").trim().toLowerCase();
      var explanation = (r.explanation || "").trim();
      var status = (r.status || "published").trim().toLowerCase();

      // Backend validatsiya (frontenddan mustaqil)
      if (!qText || qText.length < 3 || !oA || !oB || !oC || !oD) { skipped++; continue; }
      if (validAnswers.indexOf(correct) === -1) { skipped++; continue; }
      if (validLevels.indexOf(level) === -1) level = "A1";
      if (validStatuses.indexOf(status) === -1) status = "published";

      // Duplicate tekshiruvi (bazada yoki shu partiyada)
      var norm = qText.toLowerCase();
      if (existingSet[norm] || seenInBatch[norm]) { skipped++; continue; }
      seenInBatch[norm] = true;

      try {
        await pool.query(
          `INSERT INTO questions
           (question_text, option_a, option_b, option_c, option_d, correct_option, cefr_level, skill, difficulty, explanation, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'easy',$9,$10)`,
          [qText, oA, oB, oC, oD, correct, level, skill, explanation, status]
        );
        inserted++;
      } catch (e) {
        skipped++;
        errors.push("Qator " + (i + 1) + ": " + e.message);
      }
    }

    await logAudit(req, "bulk_import_completed", { entityType: "question", details: inserted + " qo'shildi, " + skipped + " o'tkazib yuborildi" });

    res.json({ inserted: inserted, skipped: skipped, total: rows.length, errors: errors.slice(0, 10) });
  } catch (err) {
    console.error("Bulk import xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ JANG TARIXI ============
app.use(battleHistoryListRoutes({ pool }));

// ===== NATIJA (refresh-proof): roomId bo'yicha jang natijasini DB'dan olish =====
app.use(battleResultRoutes({ pool }));

// Jamoa jang natijasi (F5 refresh-proof) — snapshot'dan to'liq natija
app.use(teamBattleResultRoutes({ pool }));

// ============ PREMIUM OBUNA ============

// Foydalanuvchining joriy obunasi (frontend premium holatni bilishi uchun)
app.use(subscriptionRoutes());

// DEV/ADMIN: obuna aktivlashtirish (payment hali yo'q — test uchun).
// Payme/Click qo'shilganda bu o'rniga payment callback ishlatiladi.
app.use(devSubscriptionActivateRoutes({ premium, logAudit }));

// ============ TO'LOV (PAYME) ============

// To'lov yaratish — foydalanuvchi plan tanlab "to'lash" bosganда
app.use(paymentCreateRoutes());

// To'lov holatини tekshirish (frontend polling uchun)
app.use(paymentStatusRoutes());

// Payme webhook — Payme serveri 5 metod yuboradi (JSON-RPC)
// MUHIM: authMiddleware ISHLATMAYDI — Payme o'z Basic auth'ини yuboradi
app.use(paymeRoutes());

// ============ AI: PARENT WEEKLY REPORT ============

// Parent farzandi uchun haftalik AI hisobot (premium parent).
app.post("/ai/reports/parent/children/:studentId/weekly",
  authMiddleware, requireParent, premium.requirePremium("parent"),
  async (req, res) => {
  try {
    const parentId = req.user.id;
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(studentId)) return res.status(400).json({ error: "Noto'g'ri ID" });

    // 1. ACCESS GUARD: parent shu childga ulanganmi (active)?
    const link = await pool.query(
      "SELECT id FROM parent_links WHERE parent_id=$1 AND student_id=$2 AND status='active'",
      [parentId, studentId]
    );
    if (link.rows.length === 0) {
      return res.status(403).json({ error: "Bu farzandga ruxsatingiz yo'q" });
    }

    // 2. Joriy hafta davri
    const period = aiSnapshot.currentWeekPeriod();

    // 3. CACHE: shu hafta uchun hisobot allaqachon bormi?
    const cached = await pool.query(
      `SELECT id, ai_output, confidence, status, created_at
       FROM ai_reports
       WHERE target_student_id=$1 AND report_type='parent_weekly_report'
         AND period_start=$2
       ORDER BY created_at DESC LIMIT 1`,
      [studentId, period.start]
    );
    if (cached.rows.length > 0 && req.query.refresh !== "1") {
      const c = cached.rows[0];
      return res.json({
        report: c.ai_output,
        cached: true,
        confidence: c.confidence,
        status: c.status,
        created_at: c.created_at,
      });
    }

    // 4. SNAPSHOT: real data quramiz (faqat shu child)
    const snapshot = await aiSnapshot.buildStudentWeeklySnapshot(studentId, period.start, period.end);

    // 5. AI yoki fallback (kam data → insufficient_data)
    const result = await aiService.generateParentWeeklyReport(snapshot);

    // 6. DB'ga saqlaymiz (cache + tarix)
    const saved = await pool.query(
      `INSERT INTO ai_reports
        (user_id, target_student_id, report_type, audience, period_start, period_end,
         input_snapshot, ai_output, confidence, status)
       VALUES ($1,$2,'parent_weekly_report','parent',$3,$4,$5,$6,$7,$8)
       RETURNING id, created_at`,
      [parentId, studentId, period.start, period.end,
       JSON.stringify(snapshot), JSON.stringify(result.report),
       result.confidence, result.status]
    );

    // 7. Token/narx logи (agar AI ishlatilgan bo'lsa)
    if (result.usage) {
      pool.query(
        `INSERT INTO ai_usage_logs (user_id, report_id, model, input_tokens, output_tokens)
         VALUES ($1,$2,$3,$4,$5)`,
        [parentId, saved.rows[0].id, result.model, result.usage.input, result.usage.output]
      ).catch((e) => console.error("AI usage log xato:", e.message));
    }

    res.json({
      report: result.report,
      data_quality: snapshot.data_quality,
      cached: false,
      confidence: result.confidence,
      status: result.status,
      created_at: saved.rows[0].created_at,
    });
  } catch (err) {
    console.error("Parent AI report xatosi:", err.message);
    res.status(500).json({ error: "Hozir AI hisobotni tayyorlab bo'lmadi. Keyinroq urinib ko'ring." });
  }
});

// Parent: avval yaratilgan AI hisobotlar ro'yxati (bitta child uchun)
app.use(parentAiReportListRoutes({ pool, premium }));

// ============ AI: STUDENT WEEKLY REPORT ============

// O'quvchi o'ziga haftalik AI hisobot (premium student)
app.use(studentWeeklyAiReportRoutes({ pool, premium, aiSnapshot, aiService }));

// ============ AI: TEACHER CLASS REPORT ============

// O'qituvchi sinf uchun haftalik AI tahlil (teacher pro, faqat o'z sinfi)
app.use(teacherWeeklyAiReportRoutes({ pool, premium, aiSnapshot, aiService }));

// Teacher yaratgan barcha AI hisobotlar (AI Hisobotlar sahifasi)
app.use(teacherAiReportListRoutes({ pool }));

// BITTA AI HISOBOTNI TO'LIQ OLISH (ai_output bilan — ko'rish modali uchun)
app.use(teacherAiReportDetailRoutes({ pool }));

// ============ STREAK ============
app.use(streakCheckinRoutes({ pool }));

// ============ TOPSHIRIQLAR ENDPOINT ============

// O'yinchining bugungi topshiriqlarini olish
app.use(questListRoutes({ getOrCreateDailyQuests }));

// Mukofotni olish (bajarilgan topshiriq uchun)
app.use(questClaimRoutes({ pool }));

// ============ PROFIL STATISTIKA ============
app.get("/profile/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Asosiy foydalanuvchi ma'lumoti
    const userResult = await pool.query(
      `SELECT id, first_name, last_name, username, cefr_level, rating, xp, coins,
              current_streak, longest_streak, win_streak, best_win_streak,
              region, district, village, school, profile_picture
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    }

    const user = userResult.rows[0];

    // Jang statistikasi (battle_history dan)
    const statsResult = await pool.query(
      `SELECT
         COUNT(*) AS total_battles,
         COUNT(*) FILTER (WHERE outcome = 'win') AS wins,
         COUNT(*) FILTER (WHERE outcome = 'lose') AS loses,
         COUNT(*) FILTER (WHERE outcome = 'draw') AS draws,
         COALESCE(SUM(my_score), 0) AS total_correct,
         COALESCE(SUM(opponent_score), 0) AS opp_total
       FROM battle_history WHERE user_id = $1`,
      [userId]
    );

    const stats = statsResult.rows[0];
    const totalBattles = parseInt(stats.total_battles);
    const wins = parseInt(stats.wins);

    // Win rate hisoblash (foiz)
    const winRate = totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0;

    // Do'stlik holati (joriy foydalanuvchi bilan ko'rilayotgan profil orasida)
    let friendStatus = "none"; // none | friends | pending_sent | pending_received | self
    const viewerId = req.user.id;
    if (String(viewerId) === String(userId)) {
      friendStatus = "self";
    } else {
      try {
        const fr = await pool.query(
          `SELECT requester_id, receiver_id, status FROM friendships
           WHERE (requester_id = $1 AND receiver_id = $2) OR (requester_id = $2 AND receiver_id = $1)
           LIMIT 1`,
          [viewerId, userId]
        );
        if (fr.rows.length > 0) {
          const f = fr.rows[0];
          if (f.status === "accepted") friendStatus = "friends";
          else if (f.status === "pending") {
            friendStatus = String(f.requester_id) === String(viewerId) ? "pending_sent" : "pending_received";
          }
        }
      } catch (e) {}
    }

    // Umumiy do'stlar (mutual friends) — viewer va ko'rilayotgan profil orasidagi
    let mutualFriends = [];
    let mutualCount = 0;
    if (friendStatus !== "self") {
      try {
        const mutualQ = await pool.query(
          `WITH viewer_friends AS (
             SELECT CASE WHEN requester_id = $1 THEN receiver_id ELSE requester_id END AS fid
             FROM friendships
             WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'
           ),
           target_friends AS (
             SELECT CASE WHEN requester_id = $2 THEN receiver_id ELSE requester_id END AS fid
             FROM friendships
             WHERE (requester_id = $2 OR receiver_id = $2) AND status = 'accepted'
           )
           SELECT u.id, u.first_name, u.last_name, u.profile_picture, u.rating
           FROM viewer_friends vf
           JOIN target_friends tf ON vf.fid = tf.fid
           JOIN users u ON u.id = vf.fid
           ORDER BY u.rating DESC`,
          [viewerId, userId]
        );
        mutualCount = mutualQ.rows.length;
        mutualFriends = mutualQ.rows.slice(0, 8); // birinchi 8 tasi
      } catch (e) {}
    }

    // Aniq yashash va maktab ma'lumotlari faqat profil egasi yoki tasdiqlangan do'stga.
    if (friendStatus !== "self" && friendStatus !== "friends") {
      delete user.district;
      delete user.village;
      delete user.school;
    }

    res.json({
      user: user,
      friendStatus: friendStatus,
      mutual_friends: mutualFriends,
      mutual_count: mutualCount,
      stats: {
        total_battles: totalBattles,
        wins: wins,
        loses: parseInt(stats.loses),
        draws: parseInt(stats.draws),
        win_rate: winRate,
        total_correct: parseInt(stats.total_correct),
      },
    });
  } catch (err) {
    console.error("Profil xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ DARAJA IMTIHONI ============

// Imtihon ochilish holatini tekshirish
app.get("/exam/status/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const userResult = await pool.query(
      "SELECT cefr_level FROM users WHERE id = $1",
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    }

    const currentLevel = userResult.rows[0].cefr_level;
    const nextLevel = getNextLevel(currentLevel);

    // Eng yuqori daraja (C2) - imtihon yo'q
    if (!nextLevel) {
      return res.json({
        eligible: false,
        current_level: currentLevel,
        next_level: null,
        reason: "Siz eng yuqori darajadasiz!",
      });
    }

    // Shu darajadagi janglar statistikasi
    const statsResult = await pool.query(
      `SELECT
         COUNT(*) AS battles,
         COALESCE(SUM(my_score), 0) AS total_correct,
         COALESCE(SUM(total_questions), 0) AS total_questions
       FROM battle_history
       WHERE user_id = $1 AND cefr_level = $2 AND mode IN ('ranked','casual')`,
      [userId, currentLevel]
    );

    const battles = parseInt(statsResult.rows[0].battles);
    const totalCorrect = parseInt(statsResult.rows[0].total_correct);
    // Real javob berilgan savollar soni (10/20/30/40 — qat'iy 5 emas)
    const totalQuestions = parseInt(statsResult.rows[0].total_questions);
    const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    // Shartlar
    const MIN_BATTLES = 10;
    const MIN_ACCURACY = 70;

    const eligible = battles >= MIN_BATTLES && accuracy >= MIN_ACCURACY;

    res.json({
      eligible: eligible,
      current_level: currentLevel,
      next_level: nextLevel,
      progress: {
        battles: battles,
        battles_required: MIN_BATTLES,
        accuracy: accuracy,
        accuracy_required: MIN_ACCURACY,
      },
    });
  } catch (err) {
    console.error("Imtihon status xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Imtihon savollarini olish
app.get("/exam/start/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const userResult = await pool.query(
      "SELECT cefr_level FROM users WHERE id = $1",
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    }

    const currentLevel = userResult.rows[0].cefr_level;

    // Shu darajadan 20 ta tasodifiy savol (aralash skill)
    const result = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, skill
       FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT 20`,
      [currentLevel]
    );

    if (result.rows.length < 10) {
      return res.status(400).json({
        error: "Imtihon uchun yetarli savol yo'q (kamida 10 ta kerak)",
      });
    }

    await pool.query(
      "UPDATE exam_sessions SET status='expired' WHERE user_id=$1 AND status='active'",
      [userId]
    );
    const sessionId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO exam_sessions (id, user_id, from_level, question_ids, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 minutes')`,
      [sessionId, userId, currentLevel, result.rows.map((q) => Number(q.id))]
    );

    res.json({
      session_id: sessionId,
      level: currentLevel,
      total: result.rows.length,
      questions: result.rows, // to'g'ri javobsiz
    });
  } catch (err) {
    console.error("Imtihon start xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Imtihon javoblarini tekshirish va baholash
app.post("/exam/submit", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { answers, session_id } = req.body;
    // answers = [{ question_id, answer }, ...]

    if (!session_id || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: "Javoblar yuborilmadi" });
    }

    const sessionResult = await pool.query(
      `SELECT * FROM exam_sessions
       WHERE id=$1 AND user_id=$2 AND status='active'`,
      [session_id, userId]
    );
    const examSession = sessionResult.rows[0];
    if (!examSession) return res.status(400).json({ error: "Imtihon sessiyasi faol emas" });
    if (new Date(examSession.expires_at) < new Date()) {
      await pool.query("UPDATE exam_sessions SET status='expired' WHERE id=$1", [session_id]);
      return res.status(400).json({ error: "Imtihon vaqti tugagan" });
    }
    const sessionQuestionIds = (examSession.question_ids || []).map(Number);
    const submittedIds = answers.map((a) => parseInt(a.question_id, 10));
    const uniqueIds = new Set(submittedIds);
    const validAnswerSet = answers.every((a) =>
      a && sessionQuestionIds.includes(parseInt(a.question_id, 10)) &&
      (a.answer == null || ["A", "B", "C", "D"].includes(String(a.answer).toUpperCase()))
    );
    if (answers.length !== sessionQuestionIds.length || uniqueIds.size !== sessionQuestionIds.length || !validAnswerSet) {
      return res.status(400).json({ error: "Imtihon savollari sessiyaga mos emas" });
    }

    const userResult = await pool.query(
      "SELECT cefr_level FROM users WHERE id = $1",
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    }
    const currentLevel = userResult.rows[0].cefr_level;
    if (currentLevel !== examSession.from_level) {
      return res.status(400).json({ error: "Foydalanuvchi darajasi o'zgargan, yangi imtihon boshlang" });
    }
    const nextLevel = getNextLevel(currentLevel);

    // ===== ANTI-ABUSE 1: eng yuqori darajada imtihon yo'q =====
    if (!nextLevel) {
      return res.status(400).json({ error: "Siz eng yuqori darajadasiz — imtihon yo'q." });
    }

    // ===== ANTI-ABUSE 2: COOLDOWN — oxirgi (o'tmagan) urinishdan 24 soat o'tishi kerak =====
    const lastAttempt = await pool.query(
      `SELECT taken_at, passed FROM exam_attempts
       WHERE user_id = $1 AND from_level = $2
       ORDER BY taken_at DESC LIMIT 1`,
      [userId, currentLevel]
    );
    if (lastAttempt.rows.length > 0 && !lastAttempt.rows[0].passed) {
      const hoursSince = (Date.now() - new Date(lastAttempt.rows[0].taken_at).getTime()) / 3600000;
      const COOLDOWN_HOURS = 24;
      if (hoursSince < COOLDOWN_HOURS) {
        const wait = Math.ceil(COOLDOWN_HOURS - hoursSince);
        return res.status(429).json({
          error: `Keyingi imtihongacha ${wait} soat kuting.`,
          cooldown_hours_left: wait
        });
      }
    }

    // ===== ANTI-ABUSE 3: ELIGIBILITY re-check (frontendga ishonmaymiz) =====
    const statsChk = await pool.query(
      `SELECT COUNT(*) AS battles,
              COALESCE(SUM(my_score),0) AS total_correct,
              COALESCE(SUM(total_questions),0) AS total_questions
       FROM battle_history
       WHERE user_id = $1 AND cefr_level = $2 AND mode IN ('ranked','casual')`,
      [userId, currentLevel]
    );
    const exBattles = parseInt(statsChk.rows[0].battles);
    const exTotalQ = parseInt(statsChk.rows[0].total_questions);
    const exAccuracy = exTotalQ > 0 ? Math.round((parseInt(statsChk.rows[0].total_correct) / exTotalQ) * 100) : 0;
    if (exBattles < 10 || exAccuracy < 70) {
      return res.status(403).json({
        error: "Imtihon shartlari bajarilmagan (kamida 10 jang va 70% aniqlik kerak).",
        battles: exBattles, accuracy: exAccuracy
      });
    }

    // Har javobni tekshirish + skill bo'yicha sanash
    let totalCorrect = 0;
    const skillStats = {}; // { grammar: {correct, total}, ... }

    const questionResult = await pool.query(
      "SELECT id, correct_option, skill FROM questions WHERE id = ANY($1::int[])",
      [sessionQuestionIds]
    );
    const questionMap = new Map(questionResult.rows.map((q) => [Number(q.id), q]));
    if (questionMap.size !== sessionQuestionIds.length) {
      return res.status(400).json({ error: "Imtihon savollaridan biri topilmadi" });
    }

    for (const ans of answers) {
      const q = questionMap.get(parseInt(ans.question_id, 10));
      const skill = q.skill || "other";
      if (!skillStats[skill]) skillStats[skill] = { correct: 0, total: 0 };
      skillStats[skill].total++;

      if (q.correct_option === String(ans.answer || "").toUpperCase()) {
        totalCorrect++;
        skillStats[skill].correct++;
      }
    }

    const total = sessionQuestionIds.length;
    const overallPercent = total > 0 ? Math.round((totalCorrect / total) * 100) : 0;

    // O'tish shartlari
    const PASS_OVERALL = 75; // umumiy 75%
    const PASS_SKILL = 60;   // har skill 60%

    // Har skill bo'yicha foiz
    const skillResults = {};
    let allSkillsPassed = true;
    for (const skill in skillStats) {
      const s = skillStats[skill];
      const percent = Math.round((s.correct / s.total) * 100);
      skillResults[skill] = { correct: s.correct, total: s.total, percent: percent };
      if (percent < PASS_SKILL) allSkillsPassed = false;
    }

    const passed = overallPercent >= PASS_OVERALL && allSkillsPassed;
    const levelChanged = passed && nextLevel !== null && nextLevel !== undefined;

    // Daraja oshirish + imtihon urinishini saqlash — bitta transaction ichida
    let newLevel = currentLevel;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const lockedSession = await client.query(
        `SELECT status FROM exam_sessions
         WHERE id=$1 AND user_id=$2
         FOR UPDATE`,
        [session_id, userId]
      );
      if (!lockedSession.rows[0] || lockedSession.rows[0].status !== "active") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Imtihon sessiyasi allaqachon yakunlangan" });
      }

      if (levelChanged) {
        await client.query("UPDATE users SET cefr_level = $1 WHERE id = $2", [nextLevel, userId]);
        newLevel = nextLevel;
      }

      await client.query(
        `INSERT INTO exam_attempts
         (user_id, exam_type, from_level, to_level, total_questions, total_correct, overall_percent,
          pass_overall_required, pass_skill_required, skill_results, passed, level_changed)
         VALUES ($1, 'ultimate', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [userId, currentLevel, nextLevel || null, total, totalCorrect, overallPercent,
         PASS_OVERALL, PASS_SKILL, JSON.stringify(skillResults), passed, levelChanged]
      );

      await client.query(
        "UPDATE exam_sessions SET status='submitted', submitted_at=NOW() WHERE id=$1",
        [session_id]
      );

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    // Yangilangan foydalanuvchi
    const updated = await pool.query(
      `SELECT id, first_name, last_name, username, phone, cefr_level, xp, rating, coins,
              current_streak, longest_streak
       FROM users WHERE id = $1`,
      [userId]
    );

    res.json({
      passed: passed,
      overall_percent: overallPercent,
      total_correct: totalCorrect,
      total: total,
      pass_overall_required: PASS_OVERALL,
      pass_skill_required: PASS_SKILL,
      skill_results: skillResults,
      old_level: currentLevel,
      new_level: newLevel,
      level_changed: passed && nextLevel !== null,
      updated_user: updated.rows[0],
    });
  } catch (err) {
    console.error("Imtihon submit xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// --- Imtihon tarixi (faqat o'z tarixi) ---
app.get("/exam/history/:userId", authMiddleware, async (req, res) => {
  try {
    const targetId = parseInt(req.params.userId, 10);
    if (isNaN(targetId)) return res.status(400).json({ error: "Noto'g'ri ID" });
    // Maxfiylik: faqat o'z tarixini ko'radi
    if (targetId !== req.user.id) return res.status(403).json({ error: "Ruxsat yo'q" });

    const rows = await pool.query(
      `SELECT id, exam_type, from_level, to_level, total_questions, total_correct, overall_percent,
              pass_overall_required, pass_skill_required, skill_results, passed, level_changed, taken_at
       FROM exam_attempts
       WHERE user_id = $1
       ORDER BY taken_at DESC
       LIMIT 50`,
      [targetId]
    );

    res.json({
      attempts: rows.rows.map(r => ({
        id: r.id,
        exam_type: r.exam_type,
        from_level: r.from_level,
        to_level: r.to_level,
        total_questions: r.total_questions,
        total_correct: r.total_correct,
        overall_percent: r.overall_percent,
        pass_overall_required: r.pass_overall_required,
        pass_skill_required: r.pass_skill_required,
        skill_results: r.skill_results || {},
        passed: r.passed,
        level_changed: r.level_changed,
        taken_at: r.taken_at
      }))
    });
  } catch (err) {
    console.error("Imtihon tarixi xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ MAKTAB / VILOYAT REYTINGI ============

// Maktab reytingi (jami reyting bo'yicha)
app.use(schoolRankingsRoutes());

// Viloyat reytingi
app.use(regionRankingsRoutes());

// Tumanlar reytingi
app.use(districtRankingsRoutes());

// ============ DO'STLAR TIZIMI ============

// Foydalanuvchi qidirish (telefon yoki ism bo'yicha)
app.use(friendSearchRoutes());

// Tavsiya etilgan do'stlar (maktab + tuman + region + daraja bo'yicha ballash)
app.use(friendSuggestedRoutes());

// Do'st so'rovi yuborish
app.use(friendRequestRoutes({ createNotification, io, onlineUsers }));

// So'rovni qabul qilish yoki rad etish
app.use(friendRespondRoutes({ createNotification, io, onlineUsers }));

// Do'stni o'chirish
app.use(friendRemoveRoutes({ io, onlineUsers }));

// Kelgan so'rovlar (men qabul qilishim kerak bo'lganlar)
app.use(friendRequestsRoutes());

// Do'stlar ro'yxati (qabul qilingan)
app.use(friendListRoutes({ onlineUsers }));

// Do'stlarga qarshi g'alabalar soni
app.use(friendWinsRoutes());

// Do'stlar faoliyati (Recent Activity)
app.use(friendActivityRoutes());

// ============ BILDIRISHNOMALAR ============

// Foydalanuvchining bildirishnomalari
app.use(notificationListRoutes());

// Hammasini o'qilgan deb belgilash
app.use(notificationReadRoutes());

// Barcha bildirishnomalarni o'chirish (bar yopilganda — eski xabarlarni tozalash)
app.use(notificationClearRoutes());

// Bitta bildirishnomani o'chirish (X tugmasi uchun)
app.use(notificationDeleteRoutes());

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
// ===== RESURS YUKLASH =====
app.use(teacherResourceUploadRoutes({
  uploadResource,
  uploadedContentMatches,
  removeUploadedFile,
  sanitizeText,
  detectFileType,
  logAudit,
}));

// ===== RESURSLAR RO'YXATI =====
app.use(teacherResourceListRoutes());

// ===== RESURS YUKLAB OLISH (download hisoblagich bilan) =====
app.use(teacherResourceDownloadRoutes({ resourceAbsolutePath }));

// ===== RESURS O'CHIRISH =====
app.use(teacherResourceDeleteRoutes({ resourceAbsolutePath, logAudit }));

// Profil rasm yuklash endpoint
app.use(profilePictureRoutes({
  upload,
  uploadedContentMatches,
  removeUploadedFile,
  uploadsDirectory: path.join(__dirname, "public/uploads"),
}));

// ============================================================
// SCHOOL CUP — Bosqich 3: School Admin jamoa tuzish
// ============================================================

// School admin profil — shaxsiy + maktab + boshqaruv ma'lumotlari
app.get("/school/profile", authMiddleware, async (req, res) => {
  try {
    const sa = await getSchoolAdmin(req.user.id);
    if (!sa.ok) return res.status(403).json({ error: sa.error });
    const me = sa.user;

    // Shaxsiy ma'lumotlar (telefon, ro'yxat sanasi, avatar)
    const personalQ = await pool.query(
      "SELECT phone, profile_picture, created_at FROM users WHERE id = $1",
      [me.id]
    );
    const p = personalQ.rows[0] || {};

    // Maktab statistikasi
    const statsQ = await pool.query(
      `SELECT COUNT(*) AS total, ROUND(AVG(rating)) AS avg_rating, MAX(rating) AS top_rating
       FROM users
       WHERE region = $1 AND district = $2 AND school = $3
         AND (role = 'student' OR role IS NULL) AND (is_banned IS NULL OR is_banned = false)`,
      [me.region, me.district, me.school]
    );
    const st = statsQ.rows[0];

    // Boshqaruv: faol + jami turnirlar (maktab tegishli)
    const tournQ = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('registration','bracket','live')) AS active,
         COUNT(*) AS total
       FROM tournaments t
       WHERE (
         (t.level = 'district' AND t.scope_value = $1 AND t.region = $2)
         OR (t.level = 'region' AND t.scope_value = $2)
         OR (t.level = 'country')
       )`,
      [me.district, me.region]
    );
    const tn = tournQ.rows[0];

    // Maktab tuzgan jamoalar soni (nechta turnirda jamoa tuzilgan)
    const teamQ = await pool.query(
      `SELECT COUNT(DISTINCT tournament_id) AS c FROM tournament_team_members WHERE school_key = $1`,
      [me.school_key]
    );

    res.json({
      admin: {
        first_name: me.first_name,
        last_name: me.last_name,
        phone: p.phone || null,
        profile_picture: p.profile_picture || null,
        created_at: p.created_at || null,
      },
      school: me.school,
      region: me.region,
      district: me.district,
      school_stats: {
        total_students: parseInt(st.total) || 0,
        avg_rating: parseInt(st.avg_rating) || 0,
        top_rating: parseInt(st.top_rating) || 0,
      },
      management: {
        active_tournaments: parseInt(tn.active) || 0,
        total_tournaments: parseInt(tn.total) || 0,
        teams_built: parseInt(teamQ.rows[0].c) || 0,
      },
    });
  } catch (err) {
    console.error("School profile xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// School admin bosh panel — maktab umumiy ko'rinishi
app.use(schoolOverviewRoutes({ getSchoolAdmin }));

// 1. Mening maktabim qatnashishi mumkin bo'lgan faol turnirlar
app.use(schoolTournamentsRoutes({ getSchoolAdmin }));

// 2. Maktabimning o'quvchilari (reyting bo'yicha — jamoa tanlash uchun)
app.use(schoolTournamentStudentsRoutes({ getSchoolAdmin }));

// School admin: o'z maktabi qatnashgan turnir setkasini ko'rish
app.use(schoolTournamentBracketRoutes({ getSchoolAdmin }));

// 3. Joriy jamoa (saqlangan bo'lsa)
app.use(schoolTournamentTeamListRoutes({ getSchoolAdmin }));

// 4. Jamoani saqlash (asosiy + zaxira o'quvchilar)
app.use(schoolTournamentTeamSaveRoutes({ getSchoolAdmin }));


// ============================================================
// O'QITUVCHI PANELI (TEACHER) ENDPOINTLARI
// Barcha teacher endpointlari: authMiddleware + requireTeacher
// (avval token tekshiriladi, keyin rol bazadan tekshiriladi)
// ============================================================

app.use(teacherConversationsRoutes({ onlineUsers }));

app.use(teacherConversationMessagesListRoutes({ teacherStudentLinked }));

app.use(teacherConversationMessageSendRoutes({
  teacherStudentLinked,
  directMessageLimiter,
  sanitizeText,
  filterProfanity,
  onlineUsers,
  io,
  createNotification,
}));

app.use(studentTeacherMessageSendRoutes({
  teacherStudentLinked,
  directMessageLimiter,
  sanitizeText,
  filterProfanity,
  onlineUsers,
  io,
  createNotification,
}));

app.use(teacherSettingsProfileReadRoutes());

app.use(teacherSettingsProfileUpdateRoutes({ sanitizeText }));

app.use(teacherSettingsPasswordRoutes({ validatePassword }));

// Dashboard asosiy ma'lumotlari (Phase 1 — hozircha bo'sh/boshlang'ich holat)
app.use(teacherDashboardRoutes());

// Teacher bosh sahifa uchun to'liq real ma'lumot (statistika + grafik + vazifalar + faoliyat)
app.get("/teacher/overview", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;

    // Teacher sinflari ID lari
    const clsRes = await pool.query(
      "SELECT id FROM classes WHERE teacher_id = $1 AND archived_at IS NULL",
      [teacherId]
    );
    const classIds = clsRes.rows.map((r) => r.id);

    // Default bo'sh javob (sinf yo'q bo'lsa)
    if (classIds.length === 0) {
      return res.json({
        stats: { total_students: 0, completion_rate: 0, avg_score: 0, active_students: 0 },
        chart: { labels: [], assignments: [], exams: [] },
        upcoming_tasks: [],
        recent_activity: [],
        calendar_dates: [],
      });
    }

    // ===== 1. STATISTIKA =====
    // O'quvchilar soni
    const studRes = await pool.query(
      `SELECT COUNT(DISTINCT student_id)::int AS c
       FROM class_students WHERE class_id = ANY($1) AND status = 'active'`,
      [classIds]
    );
    const totalStudents = studRes.rows[0].c;

    // Bajarish foizi: topshirilган / (o'quvchi × topshiriq) — oxirgi 30 kun
    const compRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE s.status IN ('submitted','late_submitted'))::int AS submitted,
         COUNT(DISTINCT a.id)::int AS total_assignments
       FROM assignments a
       LEFT JOIN assignment_submissions s ON s.assignment_id = a.id
       WHERE a.class_id = ANY($1) AND a.status = 'active'
         AND a.created_at >= NOW() - INTERVAL '30 days'`,
      [classIds]
    );
    const submitted = compRes.rows[0].submitted || 0;
    const totalAsg = compRes.rows[0].total_assignments || 0;
    const expected = totalAsg * Math.max(totalStudents, 1);
    const completionRate = expected > 0 ? Math.round((submitted / expected) * 100) : 0;

    // O'rtacha natija (barcha topshirilган topshiriqlar)
    const avgRes = await pool.query(
      `SELECT ROUND(AVG(s.percent))::int AS avg
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE a.class_id = ANY($1) AND s.status IN ('submitted','late_submitted') AND s.percent IS NOT NULL`,
      [classIds]
    );
    const avgScore = avgRes.rows[0].avg || 0;

    // Faol o'quvchilar — oxirgi 7 kunda topshiriq topshirган yoki jang o'ynaган
    const activeRes = await pool.query(
      `SELECT COUNT(DISTINCT student_id)::int AS c FROM (
         SELECT s.student_id FROM assignment_submissions s
           JOIN assignments a ON a.id = s.assignment_id
           WHERE a.class_id = ANY($1) AND s.submitted_at >= NOW() - INTERVAL '7 days'
         UNION
         SELECT cs.student_id FROM class_students cs
           JOIN battle_history bh ON bh.user_id = cs.student_id
           WHERE cs.class_id = ANY($1) AND bh.played_at >= NOW() - INTERVAL '7 days'
       ) AS active_union`,
      [classIds]
    );
    const activeStudents = activeRes.rows[0].c;

    // ===== 2. GRAFIK — oxirgi 30 kun, har 5 kunlik bo'lak (topshiriq topshirishlar) =====
    const chartRes = await pool.query(
      `WITH events AS (
         SELECT DATE_TRUNC('day', s.submitted_at) AS d, 'assignment' AS kind
         FROM assignment_submissions s
         JOIN assignments a ON a.id = s.assignment_id
         WHERE a.class_id = ANY($1) AND s.submitted_at >= NOW() - INTERVAL '30 days'
           AND s.status IN ('submitted','late_submitted')
         UNION ALL
         SELECT DATE_TRUNC('day', ta.submitted_at) AS d, 'exam' AS kind
         FROM teacher_exam_attempts ta
         JOIN teacher_exams e ON e.id = ta.exam_id
         WHERE e.class_id = ANY($1) AND ta.submitted_at >= NOW() - INTERVAL '30 days'
           AND ta.status = 'submitted'
       )
       SELECT TO_CHAR(d, 'DD Mon') AS day, d,
              COUNT(*) FILTER (WHERE kind='assignment')::int AS assignment_count,
              COUNT(*) FILTER (WHERE kind='exam')::int AS exam_count
       FROM events GROUP BY d ORDER BY d ASC`,
      [classIds]
    );
    const chartLabels = chartRes.rows.map((r) => r.day);
    const chartAssignments = chartRes.rows.map((r) => r.assignment_count);
    const chartExams = chartRes.rows.map((r) => r.exam_count);

    // ===== 3. KELAYOTGAN VAZIFALAR — tekshirilиши kerak (topshirilган, lekin ko'p) =====
    const tasksRes = await pool.query(
      `SELECT a.id, a.title, a.due_at, c.name AS class_name,
              COUNT(s.id) FILTER (WHERE s.status IN ('submitted','late_submitted'))::int AS submitted_count
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       LEFT JOIN assignment_submissions s ON s.assignment_id = a.id
       WHERE a.class_id = ANY($1) AND a.status = 'active'
       GROUP BY a.id, a.title, a.due_at, c.name
       HAVING COUNT(s.id) FILTER (WHERE s.status IN ('submitted','late_submitted')) > 0
       ORDER BY a.due_at ASC NULLS LAST
       LIMIT 5`,
      [classIds]
    );
    const upcomingTasks = tasksRes.rows.map((t) => ({
      id: t.id,
      title: t.title,
      class_name: t.class_name,
      submitted_count: t.submitted_count,
      due_at: t.due_at,
    }));

    // ===== 4. SO'NGGI FAOLIYAT — oxirgi topshirishlar =====
    const feedRes = await pool.query(
      `SELECT s.percent, s.submitted_at, a.title AS assignment_title,
              c.name AS class_name,
              (u.first_name || ' ' || COALESCE(u.last_name,'')) AS student_name
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN classes c ON c.id = a.class_id
       JOIN users u ON u.id = s.student_id
       WHERE a.class_id = ANY($1) AND s.status IN ('submitted','late_submitted')
       ORDER BY s.submitted_at DESC LIMIT 6`,
      [classIds]
    );
    const recentActivity = feedRes.rows.map((f) => ({
      student_name: (f.student_name || "").trim(),
      assignment_title: f.assignment_title,
      class_name: f.class_name,
      percent: f.percent,
      submitted_at: f.submitted_at,
    }));

    // ===== 5. KALENDAR — topshiriq muddatlari (joriy oy atrofida) =====
    const calRes = await pool.query(
      `SELECT DISTINCT due_at
       FROM assignments
       WHERE class_id = ANY($1) AND due_at IS NOT NULL
         AND due_at >= NOW() - INTERVAL '60 days'
         AND due_at <= NOW() + INTERVAL '60 days'`,
      [classIds]
    );
    const calendarDates = calRes.rows.map((r) => r.due_at);

    res.json({
      stats: {
        total_students: totalStudents,
        completion_rate: completionRate,
        avg_score: avgScore,
        active_students: activeStudents,
      },
      chart: { labels: chartLabels, assignments: chartAssignments },
      upcoming_tasks: upcomingTasks,
      recent_activity: recentActivity,
      calendar_dates: calendarDates,
    });
  } catch (err) {
    console.error("Teacher overview xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============================================================
// SINF BOSHQARUVI (Teacher Panel Phase 2B)
// ============================================================

// YANGI SINF YARATISH
app.use(teacherClassCreateRoutes({ sanitizeText, logAudit }));

// SINFNI TAHRIRLASH (nom + tavsif)
app.use(teacherClassUpdateRoutes({ sanitizeText, logAudit }));

// SINFNI ARXIVLASH (yumshoq o'chirish: archived_at = NOW())
app.use(teacherClassArchiveRoutes({ logAudit }));

// O'QITUVCHINING SINFLARI RO'YXATI
app.use(teacherClassListRoutes());

// Barcha topshiriqlar (Topshiriqlar sahifasi)
app.get("/teacher/assignments", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;

    // 1) Barcha topshiriqlar + sinf nomi + o'quvchi soni + bajarilish
    const asgResult = await pool.query(
      `SELECT a.id, a.title, a.description, a.cefr_level, a.skill, a.question_count,
              a.due_at, a.status, a.created_at, a.class_id,
              c.name AS class_name,
              (SELECT COUNT(*)::int FROM class_students cs WHERE cs.class_id = a.class_id AND cs.status = 'active') AS class_student_count,
              (SELECT COUNT(DISTINCT sub.student_id)::int
               FROM assignment_submissions sub
               WHERE sub.assignment_id = a.id
                 AND sub.status IN ('submitted','late_submitted')) AS submitted_count
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       WHERE a.teacher_id = $1 AND c.archived_at IS NULL
       ORDER BY a.created_at DESC`,
      [teacherId]
    );

    const assignments = asgResult.rows.map((a) => {
      const total = a.class_student_count || 0;
      const done = a.submitted_count || 0;
      const completion = total > 0 ? Math.round((done / total) * 100) : 0;
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        cefr_level: a.cefr_level,
        skill: a.skill,
        question_count: a.question_count,
        due_at: a.due_at,
        status: a.status,
        class_id: a.class_id,
        class_name: a.class_name,
        class_student_count: total,
        submitted_count: done,
        total_students: total,
        completion_percent: completion,
      };
    });

    // 2) Statistika
    const total = assignments.length;
    const active = assignments.filter((a) => a.status === "active").length;
    const now = new Date();
    const soon = assignments.filter((a) => {
      if (!a.due_at || a.status !== "active") return false;
      const d = Math.ceil((new Date(a.due_at) - now) / 86400000);
      return d >= 0 && d <= 3;
    }).length;
    const withComp = assignments.filter((a) => a.total_students > 0);
    const avgCompletion = withComp.length
      ? Math.round(withComp.reduce((s, a) => s + a.completion_percent, 0) / withComp.length)
      : null;

    // 3) Muddati yaqin (eng yaqin 5 ta, faol, kelajakda yoki yaqinda o'tgan)
    const dueSoon = assignments
      .filter((a) => a.due_at && a.status === "active")
      .sort((x, y) => new Date(x.due_at) - new Date(y.due_at))
      .slice(0, 5)
      .map((a) => ({ id: a.id, title: a.title, class_name: a.class_name, due_at: a.due_at }));

    // 4) Sinflar kesimida bajarilish (har sinf bo'yicha o'rtacha completion)
    const classMap = {};
    assignments.forEach((a) => {
      if (!classMap[a.class_id]) classMap[a.class_id] = { class_name: a.class_name, sum: 0, cnt: 0 };
      if (a.total_students > 0) { classMap[a.class_id].sum += a.completion_percent; classMap[a.class_id].cnt++; }
    });
    const classCompletion = Object.values(classMap).map((c) => ({
      class_name: c.class_name,
      completion: c.cnt > 0 ? Math.round(c.sum / c.cnt) : 0,
    }));

    res.json({
      assignments,
      stats: { total, active, soon, avg_completion: avgCompletion },
      due_soon: dueSoon,
      class_completion: classCompletion,
    });
  } catch (err) {
    console.error("/teacher/assignments xatosi:", err);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Tanlangan topshiriq natijalari (Natijalar sahifasi)
app.get("/teacher/results/:assignmentId", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;
    const asgId = parseInt(req.params.assignmentId);
    if (!asgId) return res.status(400).json({ error: "Noto'g'ri ID" });

    // Ownership: bu topshiriq shu teacher'niki ekanini tekshiramiz
    const own = await pool.query(
      `SELECT a.id, a.title, a.class_id, a.skill, c.name AS class_name
       FROM assignments a JOIN classes c ON c.id = a.class_id
       WHERE a.id = $1 AND a.teacher_id = $2`,
      [asgId, teacherId]
    );
    if (own.rows.length === 0) return res.status(404).json({ error: "Topshiriq topilmadi" });

    // O'quvchilar natijalari (topshirilgan)
    const subs = await pool.query(
      `SELECT sub.student_id, sub.score, sub.total, sub.percent,
              sub.correct_count, sub.wrong_count, sub.unanswered_count, sub.is_late,
              sub.started_at, sub.submitted_at,
              u.first_name, u.last_name,
              c.name AS class_name
       FROM assignment_submissions sub
       JOIN users u ON u.id = sub.student_id
       JOIN assignments a ON a.id = sub.assignment_id
       JOIN classes c ON c.id = a.class_id
       WHERE sub.assignment_id = $1 AND sub.status IN ('submitted','late_submitted')
       ORDER BY sub.percent DESC`,
      [asgId]
    );

    const students = subs.rows.map((r) => {
      let timeSeconds = null;
      if (r.started_at && r.submitted_at) {
        timeSeconds = Math.max(0, Math.round((new Date(r.submitted_at) - new Date(r.started_at)) / 1000));
      }
      return {
        student_id: r.student_id,
        name: ((r.first_name || "") + " " + (r.last_name || "")).trim(),
        class_name: r.class_name,
        score: r.score,
        total: r.total,
        percent: r.percent,
        correct_count: r.correct_count,
        wrong_count: r.wrong_count,
        unanswered_count: r.unanswered_count,
        is_late: r.is_late,
        time_seconds: timeSeconds,
      };
    });

    // Jami o'quvchilar (sinfda)
    const totalRes = await pool.query(
      `SELECT COUNT(*)::int AS c FROM class_students WHERE class_id = $1 AND status = 'active'`,
      [own.rows[0].class_id]
    );
    const totalStudents = totalRes.rows[0].c;

    // ===== Statistika =====
    const submitted = students.length;
    const scores = students.map((s) => s.percent).filter((p) => p != null);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    let topS = null, topN = null, lowS = null, lowN = null;
    students.forEach((s) => {
      if (topS == null || s.percent > topS) { topS = s.percent; topN = s.name; }
      if (lowS == null || s.percent < lowS) { lowS = s.percent; lowN = s.name; }
    });
    const late = students.filter((s) => s.is_late).length;
    const submitRate = totalStudents > 0 ? Math.round((submitted / totalStudents) * 100) : 0;
    const lateRate = submitted > 0 ? Math.round((late / submitted) * 100) : 0;

    // ===== Natijalar taqsimoti (donut) =====
    const dist = { excellent: 0, good: 0, mid: 0, low: 0 };
    students.forEach((s) => {
      if (s.percent >= 90) dist.excellent++;
      else if (s.percent >= 75) dist.good++;
      else if (s.percent >= 50) dist.mid++;
      else dist.low++;
    });
    const distribution = [
      { label: "A'lo (90-100%)", count: dist.excellent, color: "#16b06a" },
      { label: "Yaxshi (75-89%)", count: dist.good, color: "#2f6bff" },
      { label: "O'rta (50-74%)", count: dist.mid, color: "#f59e0b" },
      { label: "Past (<50%)", count: dist.low, color: "#ef4655" },
    ];

    // ===== Sinf taqqoslash (agar bir necha sinf) =====
    const classMap = {};
    students.forEach((s) => {
      const k = s.class_name || "—";
      if (!classMap[k]) classMap[k] = { sum: 0, cnt: 0 };
      classMap[k].sum += s.percent; classMap[k].cnt++;
    });
    const classComparison = Object.keys(classMap).map((k) => ({
      class_name: k, avg: classMap[k].cnt > 0 ? classMap[k].sum / classMap[k].cnt : 0,
    }));

    // ===== KO'NIKMA BO'YICHA (skill) — real submission_answers + assignment_questions =====
    const skillRes = await pool.query(
      `SELECT aq.skill,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE sa.is_correct)::int AS correct
       FROM submission_answers sa
       JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
       JOIN assignment_submissions sub ON sub.id = sa.submission_id
       WHERE sub.assignment_id = $1 AND sub.status IN ('submitted','late_submitted')
         AND aq.skill IS NOT NULL
       GROUP BY aq.skill
       ORDER BY aq.skill`,
      [asgId]
    );
    const skills = skillRes.rows.map((r) => ({
      skill: r.skill,
      avg: r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0,
      total: r.total,
      correct: r.correct,
    }));

    // ===== QIYINLIK BO'YICHA (difficulty) — savollar qiyinlik taqsimoti =====
    const diffRes = await pool.query(
      `SELECT aq.difficulty, COUNT(DISTINCT aq.id)::int AS question_count
       FROM assignment_questions aq
       WHERE aq.assignment_id = $1 AND aq.difficulty IS NOT NULL
       GROUP BY aq.difficulty`,
      [asgId]
    );
    // difficulty qiymatlarini standartlashtirish + rang
    const diffMeta = {
      easy: { label: "Oson", color: "#16b06a" },
      oson: { label: "Oson", color: "#16b06a" },
      medium: { label: "O'rta", color: "#2f6bff" },
      "o'rta": { label: "O'rta", color: "#2f6bff" },
      orta: { label: "O'rta", color: "#2f6bff" },
      hard: { label: "Qiyin", color: "#ef4655" },
      qiyin: { label: "Qiyin", color: "#ef4655" },
    };
    const difficulty = diffRes.rows.map((r) => {
      const key = (r.difficulty || "").toLowerCase();
      const meta = diffMeta[key] || { label: r.difficulty, color: "#94a3b8" };
      return { label: meta.label, count: r.question_count, color: meta.color };
    });

    // ===== SAVOL BO'YICHA (har savol: nechta to'g'ri/xato) =====
    const questionRes = await pool.query(
      `SELECT aq.q_order, aq.question_text, aq.skill, aq.difficulty,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE sa.is_correct)::int AS correct
       FROM submission_answers sa
       JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
       JOIN assignment_submissions sub ON sub.id = sa.submission_id
       WHERE sub.assignment_id = $1 AND sub.status IN ('submitted','late_submitted')
       GROUP BY aq.id, aq.q_order, aq.question_text, aq.skill, aq.difficulty
       ORDER BY aq.q_order`,
      [asgId]
    );
    const questions = questionRes.rows.map((r) => ({
      q_order: r.q_order,
      question_text: r.question_text,
      skill: r.skill,
      difficulty: r.difficulty,
      total: r.total,
      correct: r.correct,
      wrong: r.total - r.correct,
      correct_rate: r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0,
    }));

    res.json({
      assignment: { id: own.rows[0].id, title: own.rows[0].title, class_name: own.rows[0].class_name },
      students,
      stats: {
        total: totalStudents, avg_score: avgScore,
        top_score: topS, top_name: topN, low_score: lowS, low_name: lowN,
        submitted, submit_rate: submitRate, late, late_rate: lateRate,
      },
      distribution,
      class_comparison: classComparison,
      skills,        // ko'nikma bo'yicha (real)
      difficulty,    // qiyinlik bo'yicha (real)
      questions,     // savol bo'yicha (real)
    });
  } catch (err) {
    console.error("/teacher/results xatosi:", err);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// O'QUVCHI SINFGA QO'SHILADI (join_code orqali)
app.post("/student/join-class", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    let { join_code } = req.body;

    // Kod tekshiruvi
    if (!join_code || typeof join_code !== "string") {
      return res.status(400).json({ error: "Qo'shilish kodini kiriting" });
    }
    join_code = join_code.trim().toUpperCase();
    if (join_code.length !== 6) {
      return res.status(400).json({ error: "Kod 6 belgidan iborat bo'lishi kerak" });
    }

    // Sinfni topamiz (arxivlanmagan)
    const classResult = await pool.query(
      "SELECT id, name, teacher_id, archived_at FROM classes WHERE join_code = $1",
      [join_code]
    );
    if (classResult.rows.length === 0) {
      return res.status(404).json({ error: "Bunday kodli sinf topilmadi" });
    }
    const cls = classResult.rows[0];
    if (cls.archived_at !== null) {
      return res.status(400).json({ error: "Bu sinf endi faol emas" });
    }

    // Allaqachon a'zomi tekshiramiz
    const existing = await pool.query(
      "SELECT id, status FROM class_students WHERE class_id = $1 AND student_id = $2",
      [cls.id, studentId]
    );
    if (existing.rows.length > 0) {
      // Agar avval chiqib ketgan bo'lsa (removed/left) — qayta faollashtirish
      if (existing.rows[0].status !== "active") {
        await pool.query(
          "UPDATE class_students SET status = 'active', joined_at = NOW() WHERE id = $1",
          [existing.rows[0].id]
        );
        // Real-time: qayta qo'shilish ham o'qituvchiga ko'rinadi
        io.to("class_" + String(cls.id)).emit("classStudentJoined", { classId: cls.id });
        return res.json({ message: "Sinfga qayta qo'shildingiz", class: { id: cls.id, name: cls.name } });
      }
      return res.status(409).json({ error: "Siz allaqachon bu sinf a'zosisiz" });
    }

    // ===== LIMIT: Free teacher max 15 o'quvchi =====
    const studentLimit = await premium.checkTeacherLimit(cls.teacher_id, "students");
    if (!studentLimit.allowed) {
      await logAudit(req, "teacher_limit_blocked_student", {
        entityType: "class", entityId: cls.id,
        details: "teacher=" + cls.teacher_id + " count=" + studentLimit.current + " limit=" + studentLimit.limit + " plan=free"
      }).catch(() => {});
      return res.status(402).json({
        error: "teacher_pro_required",
        feature: "more_students",
        message: "Bu sinfga qo'shilib bo'lmaydi — o'qituvchining bepul limiti to'lgan (15 o'quvchi).",
        upgrade_url: "/pricing.html?plan=teacher_pro"
      });
    }

    // Qo'shamiz
    await pool.query(
      "INSERT INTO class_students (class_id, student_id, status) VALUES ($1, $2, 'active')",
      [cls.id, studentId]
    );

    // Real-time: shu sinfni kuzatayotgan o'qituvchiga darhol xabar
    io.to("class_" + String(cls.id)).emit("classStudentJoined", { classId: cls.id });

    res.status(201).json({
      message: "Sinfga muvaffaqiyatli qo'shildingiz",
      class: { id: cls.id, name: cls.name }
    });
  } catch (err) {
    console.error("Sinfga qo'shilish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// O'QUVCHINING SINFLARI RO'YXATI (o'quvchi o'zi ko'radi)
app.get("/student/classes", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;

    // Faqat shu o'quvchi a'zo bo'lgan faol sinflar.
    // O'qituvchi nomi + sinfdagi jami faol o'quvchilar soni (kartada ko'rsatish uchun).
    const classes = await pool.query(
      `SELECT c.id, c.name, c.description, c.join_code, c.cefr_level, c.created_at, c.schedule, c.teacher_id,
              t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
              (SELECT COUNT(*) FROM class_students m WHERE m.class_id = c.id AND m.status = 'active') AS student_count
       FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       JOIN users t ON t.id = c.teacher_id
       WHERE cs.student_id = $1 AND cs.status = 'active' AND c.archived_at IS NULL
       ORDER BY cs.joined_at DESC`,
      [studentId]
    );

    res.json({ classes: classes.rows });
  } catch (err) {
    console.error("O'quvchi sinflari xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== Class announcements =====
app.use(teacherClassAnnouncementsListRoutes({ ownedActiveClass }));

app.use(teacherClassAnnouncementCreateRoutes({ sanitizeText, ownedActiveClass, io }));

app.use(teacherClassAnnouncementUpdateRoutes({ sanitizeText, ownedActiveClass, io }));

app.use(teacherClassAnnouncementDeleteRoutes({ ownedActiveClass, io }));

app.use(studentClassAnnouncementsListRoutes({ activeClassMembership }));

// ===== Student class actions and ranking =====
app.use(studentClassLeaveRoutes({ pool, activeClassMembership, io }));

app.get("/student/classes/:classId/ranking", authMiddleware, requireStudent, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (!Number.isInteger(classId)) return res.status(400).json({ error: "Noto'g'ri sinf ID" });
    if (!(await activeClassMembership(classId, req.user.id))) return res.status(404).json({ error: "Sinf topilmadi" });
    const rows = await pool.query(
      `WITH best_submissions AS (
         SELECT DISTINCT ON (s.student_id, s.assignment_id)
                s.student_id, s.assignment_id, s.percent
           FROM assignment_submissions s
           JOIN assignments a ON a.id=s.assignment_id
          WHERE a.class_id=$1 AND s.status IN ('submitted','late_submitted')
          ORDER BY s.student_id, s.assignment_id, s.percent DESC NULLS LAST, s.submitted_at DESC
       ), scores AS (
         SELECT student_id, ROUND(AVG(percent))::int AS avg_percent, COUNT(*)::int AS completed
           FROM best_submissions GROUP BY student_id
       )
       SELECT u.id, u.first_name, u.last_name, u.profile_picture, u.rating,
              COALESCE(sc.avg_percent,0) AS avg_percent, COALESCE(sc.completed,0) AS completed
         FROM class_students cs
         JOIN users u ON u.id=cs.student_id
         LEFT JOIN scores sc ON sc.student_id=u.id
        WHERE cs.class_id=$1 AND cs.status='active'
        ORDER BY COALESCE(sc.avg_percent,0) DESC, COALESCE(sc.completed,0) DESC,
                 COALESCE(u.rating,0) DESC, u.id ASC`, [classId]
    );
    const ranking = rows.rows.map((row, index) => ({ ...row, rank: index + 1 }));
    res.json({ ranking, my_rank: (ranking.find(r => r.id === req.user.id) || {}).rank || null });
  } catch (err) {
    console.error("Sinf reytingi xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== Attendance =====
app.use(
  classAttendanceRoutes({
    pool,
    sanitizeText,
    ownedActiveClass,
    activeClassMembership,
    io,
  })
);

// ===== Live lessons =====
app.use(
  classLessonRoutes({
    pool,
    sanitizeText,
    validMeetingUrl,
    ownedActiveClass,
    activeClassMembership,
    io,
  })
);

// ============================================================
// STUDENT ASSIGNMENTS — Stage 3: O'quvchi backend
// ============================================================

// --- O'quvchining topshiriqlari (barcha faol sinflari bo'yicha) ---
app.get("/student/assignments", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const rows = await pool.query(
      `SELECT a.id, a.title, a.class_id, c.name AS class_name,
              t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
              a.cefr_level, a.skill, a.question_count, a.due_at, a.status,
              s.status AS submission_status, s.score, s.total, s.percent, s.is_late, s.submitted_at
       FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       JOIN users t ON t.id = c.teacher_id
       JOIN assignments a ON a.class_id = c.id AND a.status = 'active'
       LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = $1
       WHERE cs.student_id = $1 AND cs.status = 'active' AND c.archived_at IS NULL
       ORDER BY a.due_at NULLS LAST, a.created_at DESC`,
      [studentId]
    );

    const assignments = rows.rows.map(r => {
      let display = "not_started";
      if (r.submission_status === "in_progress") display = "in_progress";
      else if (r.submission_status === "submitted") display = r.is_late ? "late_submitted" : "submitted";
      return {
        id: r.id, title: r.title, class_id: r.class_id, class_name: r.class_name,
        teacher_name: ((r.teacher_first_name||"") + " " + (r.teacher_last_name||"")).trim(),
        cefr_level: r.cefr_level, skill: r.skill, question_count: r.question_count,
        due_at: r.due_at, status: r.status,
        submission_status: display,
        score: r.score, total: r.total, percent: r.percent,
        is_late: r.is_late || false, submitted_at: r.submitted_at
      };
    });

    res.json({ assignments });
  } catch (err) {
    console.error("O'quvchi topshiriqlari xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// --- Topshiriqni boshlash (savollar, correct_answer YUBORILMAYDI) ---
app.get("/student/assignments/:id/start", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const assignmentId = parseInt(req.params.id, 10);
    if (isNaN(assignmentId)) return res.status(400).json({ error: "Noto'g'ri ID" });

    // Assignment + a'zolik + faollik (bittada)
    const aRes = await pool.query(
      `SELECT a.id, a.title, a.description, a.cefr_level, a.skill, a.question_count, a.due_at, a.status, a.max_attempts
       FROM assignments a
       JOIN class_students cs ON cs.class_id = a.class_id AND cs.student_id = $2 AND cs.status='active'
       JOIN classes c ON c.id = a.class_id AND c.archived_at IS NULL
       WHERE a.id = $1 AND a.status = 'active'`,
      [assignmentId, studentId]
    );
    if (aRes.rows.length === 0) return res.status(404).json({ error: "Topshiriq topilmadi" });
    const assignment = aRes.rows[0];

    // Mavjud submission?
    const sRes = await pool.query(
      "SELECT * FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2 ORDER BY attempt_number DESC LIMIT 1",
      [assignmentId, studentId]
    );
    let submission = sRes.rows[0] || null;

    // Allaqachon topshirilgan → qulflangan + review
    if (submission && submission.status === "submitted") {
      const review = await pool.query(
        `SELECT aq.q_order, aq.question_text, aq.option_a, aq.option_b, aq.option_c, aq.option_d, aq.explanation,
                sa.selected_option, sa.correct_answer, sa.is_correct
         FROM submission_answers sa
         JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
         WHERE sa.submission_id = $1 ORDER BY aq.q_order`,
        [submission.id]
      );
      return res.json({
        assignment, submission, locked: true,
        review: review.rows.map(r => ({
          q_order: r.q_order, question_text: r.question_text,
          options: [{key:"A",text:r.option_a},{key:"B",text:r.option_b},{key:"C",text:r.option_c},{key:"D",text:r.option_d}],
          user_answer: r.selected_option, correct_answer: r.correct_answer, is_correct: r.is_correct, explanation: r.explanation
        }))
      });
    }

    // Submission yo'q → in_progress yaratamiz
    if (!submission) {
      const ins = await pool.query(
        `INSERT INTO assignment_submissions (assignment_id, student_id, total, status)
         VALUES ($1, $2, $3, 'in_progress') RETURNING *`,
        [assignmentId, studentId, assignment.question_count]
      );
      submission = ins.rows[0];
    }

    // Savollar (correct_answer YO'Q)
    const qRes = await pool.query(
      `SELECT id AS assignment_question_id, q_order, question_text, option_a, option_b, option_c, option_d
       FROM assignment_questions WHERE assignment_id=$1 ORDER BY q_order`,
      [assignmentId]
    );

    res.json({
      assignment, submission, locked: false,
      questions: qRes.rows.map(q => ({
        assignment_question_id: q.assignment_question_id, q_order: q.q_order, question_text: q.question_text,
        options: [{key:"A",text:q.option_a},{key:"B",text:q.option_b},{key:"C",text:q.option_c},{key:"D",text:q.option_d}]
      }))
    });
  } catch (err) {
    console.error("Topshiriqni boshlash xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// --- Topshiriqni topshirish (transaction + server-side baholash) ---
app.post("/student/assignments/:id/submit", authMiddleware, requireStudent, async (req, res) => {
  const studentId = req.user.id;
  const assignmentId = parseInt(req.params.id, 10);
  if (isNaN(assignmentId)) return res.status(400).json({ error: "Noto'g'ri ID" });
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];

  try {
    // A'zolik + faollik + due_at
    const aRes = await pool.query(
      `SELECT a.id, a.due_at, a.question_count
       FROM assignments a
       JOIN class_students cs ON cs.class_id = a.class_id AND cs.student_id = $2 AND cs.status='active'
       JOIN classes c ON c.id = a.class_id AND c.archived_at IS NULL
       WHERE a.id = $1 AND a.status = 'active'`,
      [assignmentId, studentId]
    );
    if (aRes.rows.length === 0) return res.status(404).json({ error: "Topshiriq topilmadi" });
    const assignment = aRes.rows[0];

    // Submission
    const sRes = await pool.query(
      "SELECT * FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2 ORDER BY attempt_number DESC LIMIT 1",
      [assignmentId, studentId]
    );
    let submission = sRes.rows[0] || null;
    if (submission && submission.status === "submitted") {
      return res.status(409).json({ error: "Bu topshiriq allaqachon topshirilgan" });
    }

    // Snapshot savollar + to'g'ri javoblar
    const qRes = await pool.query(
      "SELECT id, q_order, correct_answer FROM assignment_questions WHERE assignment_id=$1 ORDER BY q_order",
      [assignmentId]
    );
    const questions = qRes.rows;

    // Javoblar xaritasi (faqat shu assignment aq_id; A-D yoki null)
    const valid = new Set(["A","B","C","D"]);
    const ansMap = {};
    for (const a of answers) {
      const aqId = parseInt(a.assignment_question_id, 10);
      let ch = (a.answer || "").toString().toUpperCase();
      if (!valid.has(ch)) ch = null;
      if (!isNaN(aqId)) ansMap[aqId] = ch;
    }

    // Baholash (assignment savollari bo'yicha — javobsiz = unanswered)
    let correct = 0, wrong = 0, unanswered = 0;
    const gradeRows = [];
    for (const q of questions) {
      const sel = Object.prototype.hasOwnProperty.call(ansMap, q.id) ? ansMap[q.id] : null;
      const isCorrect = sel !== null && sel === q.correct_answer;
      if (sel === null) unanswered++; else if (isCorrect) correct++; else wrong++;
      gradeRows.push({ aqId: q.id, sel, correct_answer: q.correct_answer, isCorrect });
    }
    const total = questions.length;
    const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
    const isLate = !!(assignment.due_at && new Date() > new Date(assignment.due_at));

    // Transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (!submission) {
        const ins = await client.query(
          `INSERT INTO assignment_submissions (assignment_id, student_id, total, status)
           VALUES ($1, $2, $3, 'in_progress') RETURNING *`,
          [assignmentId, studentId, total]
        );
        submission = ins.rows[0];
      }

      await client.query("DELETE FROM submission_answers WHERE submission_id=$1", [submission.id]);

      for (const r of gradeRows) {
        await client.query(
          `INSERT INTO submission_answers (submission_id, assignment_question_id, selected_option, correct_answer, is_correct)
           VALUES ($1, $2, $3, $4, $5)`,
          [submission.id, r.aqId, r.sel, r.correct_answer, r.isCorrect]
        );
      }

      const upd = await client.query(
        `UPDATE assignment_submissions
         SET score=$1, total=$2, percent=$3, correct_count=$4, wrong_count=$5, unanswered_count=$6,
             is_late=$7, status='submitted', submitted_at=NOW()
         WHERE id=$8
         RETURNING score, total, percent, correct_count, wrong_count, unanswered_count, is_late, submitted_at`,
        [correct, total, percent, correct, wrong, unanswered, isLate, submission.id]
      );

      await client.query("COMMIT");

      const review = await pool.query(
        `SELECT aq.q_order, aq.question_text, aq.option_a, aq.option_b, aq.option_c, aq.option_d, aq.explanation,
                sa.selected_option, sa.correct_answer, sa.is_correct
         FROM submission_answers sa
         JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
         WHERE sa.submission_id = $1 ORDER BY aq.q_order`,
        [submission.id]
      );

      res.json({
        success: true,
        result: upd.rows[0],
        review: review.rows.map(r => ({
          q_order: r.q_order, question_text: r.question_text,
          options: [{key:"A",text:r.option_a},{key:"B",text:r.option_b},{key:"C",text:r.option_c},{key:"D",text:r.option_d}],
          user_answer: r.selected_option, correct_answer: r.correct_answer, is_correct: r.is_correct, explanation: r.explanation
        }))
      });
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Topshiriq topshirish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// --- Topshirilgan topshiriq review (faqat submitted) ---
app.get("/student/assignments/:id/review", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const assignmentId = parseInt(req.params.id, 10);
    if (isNaN(assignmentId)) return res.status(400).json({ error: "Noto'g'ri ID" });

    const aRes = await pool.query(
      `SELECT a.id, a.title, a.description, a.cefr_level, a.skill, a.question_count, a.due_at, a.status
       FROM assignments a
       JOIN class_students cs ON cs.class_id = a.class_id AND cs.student_id = $2 AND cs.status='active'
       JOIN classes c ON c.id = a.class_id
       WHERE a.id = $1`,
      [assignmentId, studentId]
    );
    if (aRes.rows.length === 0) return res.status(404).json({ error: "Topshiriq topilmadi" });
    const assignment = aRes.rows[0];

    const sRes = await pool.query(
      "SELECT * FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2 AND status='submitted' ORDER BY attempt_number DESC LIMIT 1",
      [assignmentId, studentId]
    );
    if (sRes.rows.length === 0) return res.status(409).json({ error: "Topshiriq hali topshirilmagan" });
    const submission = sRes.rows[0];

    const review = await pool.query(
      `SELECT aq.q_order, aq.question_text, aq.option_a, aq.option_b, aq.option_c, aq.option_d, aq.explanation,
              sa.selected_option, sa.correct_answer, sa.is_correct
       FROM submission_answers sa
       JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
       WHERE sa.submission_id = $1 ORDER BY aq.q_order`,
      [submission.id]
    );

    res.json({
      assignment,
      result: {
        score: submission.score, total: submission.total, percent: submission.percent,
        correct_count: submission.correct_count, wrong_count: submission.wrong_count,
        unanswered_count: submission.unanswered_count, is_late: submission.is_late, submitted_at: submission.submitted_at
      },
      review: review.rows.map(r => ({
        q_order: r.q_order, question_text: r.question_text,
        options: [{key:"A",text:r.option_a},{key:"B",text:r.option_b},{key:"C",text:r.option_c},{key:"D",text:r.option_d}],
        user_answer: r.selected_option, correct_answer: r.correct_answer, is_correct: r.is_correct, explanation: r.explanation
      }))
    });
  } catch (err) {
    console.error("Topshiriq review xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============================================================
// PARENT LINKING — Stage 3: O'quvchi tomoni (ota-ona ulanishi)
// HASH bilan: raw kod faqat yaratilganda bir marta ko'rsatiladi, DB'da hash.
// ============================================================

// ============================================================================
// MAKTAB TAKLIF KODI ENDPOINTLARI
// ============================================================================

// --- Kodni tekshirish (ro'yxatdan o'tish oldidan, OCHIQ endpoint) ---
app.post("/verify-school-code", schoolCodeLookupLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Kod kiritilmadi" });

    const codeHash = schoolInvite.hashCode(code);
    const result = await pool.query(
      `SELECT id, school_name, region, district, used_by, expires_at
       FROM school_invites WHERE code_hash = $1`,
      [codeHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Kod noto'g'ri" });
    }
    const invite = result.rows[0];
    if (invite.used_by) {
      return res.status(400).json({ error: "Bu kod allaqachon ishlatilgan" });
    }
    if (invite.expires_at && new Date() > new Date(invite.expires_at)) {
      return res.status(400).json({ error: "Kod muddati tugagan" });
    }

    res.json({
      valid: true,
      school_name: invite.school_name,
      region: invite.region,
      district: invite.district
    });
  } catch (err) {
    console.error("School code tekshirish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// --- Kod yaratish (FAQAT platforma admini) ---
app.post("/admin/school-invites", requireAdmin, async (req, res) => {
  try {
    const { school_name, region, district, expires_days } = req.body;

    if (!school_name || school_name.trim().length < 3) {
      return res.status(400).json({ error: "Maktab nomi majburiy (kamida 3 harf)" });
    }
    const schoolNorm = normalizeSchool(school_name);
    if (!schoolIdentityKey(region, district, schoolNorm)) {
      return res.status(400).json({ error: "Viloyat, tuman va maktab to'liq kiritilishi kerak" });
    }

    // Bu maktab uchun ISHLATILMAGAN faol kod bormi?
    const existing = await pool.query(
      `SELECT id FROM school_invites
       WHERE school_name = $1 AND region = $2 AND district = $3 AND used_by IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [schoolNorm, region.trim(), district.trim()]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Bu maktab uchun faol kod allaqachon mavjud" });
    }

    // Bu maktabда allaqachon admin bormi? (1 admin qoidasi)
    const adminExists = await pool.query(
      `SELECT id FROM users
       WHERE role = 'school_admin' AND region = $1 AND district = $2 AND school = $3`,
      [region.trim(), district.trim(), schoolNorm]
    );
    if (adminExists.rows.length > 0) {
      return res.status(400).json({ error: "Bu maktabда allaqachon admin bor" });
    }

    const rawCode = schoolInvite.generateRawCode();
    const codeHash = schoolInvite.hashCode(rawCode);
    const expiresAt = expires_days
      ? new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO school_invites (code_hash, school_name, region, district, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [codeHash, schoolNorm, region.trim(), district.trim(), req.user?.id || null, expiresAt]
    );

    // Raw kod FAQAT shu yerда bir marta qaytariladi
    res.status(201).json({
      message: "Kod yaratildi. Maktab rahbariga bering (qayta ko'rsatilmaydi!)",
      code: rawCode,
      school_name: schoolNorm,
      expires_at: expiresAt
    });
  } catch (err) {
    console.error("School invite yaratish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// --- Kod holatini olish: amaldagi kod BOR-YO'Qligini bildiradi, lekin RAW kodni
//     QAYTA KO'RSATMAYDI (hash'dan tiklab bo'lmaydi — xuddi parol kabi). ---
app.get("/student/parent-code", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const cur = await pool.query(
      "SELECT parent_connect_code_hash, parent_connect_code_created_at, parent_connect_code_expires_at FROM users WHERE id = $1",
      [studentId]
    );
    const row = cur.rows[0];
    const hasValidCode = row && row.parent_connect_code_hash &&
                         row.parent_connect_code_expires_at &&
                         new Date(row.parent_connect_code_expires_at) > new Date();

    if (hasValidCode) {
      // Amaldagi kod bor, lekin RAW'ni ko'rsata olmaymiz
      return res.json({
        has_active_code: true,
        code: null,                          // RAW yo'q — xavfsizlik
        created_at: row.parent_connect_code_created_at,
        expires_at: row.parent_connect_code_expires_at,
        message: "Amaldagi kod bor. Kodni qayta ko'rish mumkin emas — kerak bo'lsa yangi kod yarating."
      });
    }

    // Amaldagi kod yo'q — YANGI yaratamiz va RAW'ni BIR MARTA ko'rsatamiz
    const fresh = await assignNewParentCode(studentId);
    res.json({
      has_active_code: true,
      code: fresh.rawCode,                   // BIR MARTALIK — o'quvchi ko'chirib oladi
      created_at: fresh.created_at,
      expires_at: fresh.expires_at,
      message: "Kodni saqlab oling — qayta ko'rsatilmaydi."
    });
  } catch (err) {
    console.error("Parent kod olish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// --- Kodni yangilash (eski bekor bo'ladi) ---
app.post("/student/parent-code/regenerate", authMiddleware, requireStudent, async (req, res) => {
  try {
    const fresh = await assignNewParentCode(req.user.id);
    res.json({
      success: true,
      code: fresh.rawCode,                   // BIR MARTALIK
      expires_at: fresh.expires_at,
      message: "Yangi kod yaratildi. Saqlab oling — qayta ko'rsatilmaydi."
    });
  } catch (err) {
    console.error("Parent kod yangilash xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// --- Ulangan ota-onalar ro'yxati (telefon maskalanadi) ---
app.get("/student/parents", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const rows = await pool.query(
      `SELECT pl.parent_id, pl.relationship, pl.linked_at, u.first_name, u.last_name, u.phone
       FROM parent_links pl
       JOIN users u ON u.id = pl.parent_id
       WHERE pl.student_id = $1 AND pl.status = 'active'
       ORDER BY pl.linked_at DESC`,
      [studentId]
    );
    res.json({
      parents: rows.rows.map(r => ({
        parent_id: r.parent_id,
        name: ((r.first_name || "") + " " + (r.last_name || "")).trim() || "Ota-ona",
        relationship: r.relationship || "guardian",
        phone_masked: maskParentPhone(r.phone),
        linked_at: r.linked_at
      }))
    });
  } catch (err) {
    console.error("Ota-onalar ro'yxati xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// --- Ota-onani uzish (o'quvchi bekor qiladi) ---
app.delete("/student/parents/:parentId", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const parentId = parseInt(req.params.parentId, 10);
    if (isNaN(parentId)) return res.status(400).json({ error: "Noto'g'ri ID" });
    const r = await pool.query(
      `UPDATE parent_links
       SET status='revoked', revoked_at=NOW(), revoked_by=$1, updated_at=NOW()
       WHERE student_id=$1 AND parent_id=$2 AND status='active'
       RETURNING id`,
      [studentId, parentId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Bog'lanish topilmadi" });
    res.json({ success: true });
  } catch (err) {
    console.error("Ota-onani uzish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============================================================
// PARENT DASHBOARD — Stage 4: Ota-ona backend
// ============================================================
const MAX_PARENTS_PER_STUDENT = 5;
const MAX_CHILDREN_PER_PARENT = 10;
const REL_ALLOWED = ["mother", "father", "guardian", "other"];

// --- Farzandga ulanish (kod orqali) ---
app.post("/parent/link", authMiddleware, requireParent, async (req, res) => {
  const parentId = req.user.id;
  if (parentLinkBlocked(req)) return res.status(429).json({ error: "Juda ko'p urinish. 10 daqiqadan keyin qayta urinib ko'ring." });

  let { code, relationship } = req.body;
  code = (code || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
  relationship = REL_ALLOWED.includes(relationship) ? relationship : "guardian";
  if (code.length < 6 || code.length > 12) { parentLinkNoteFail(req); return res.status(400).json({ error: "Kod noto'g'ri" }); }

  try {
    const codeHash = parentCode.hashCode(code);   // kiritilgan kodni HASH qilamiz
    const stu = await pool.query(
      `SELECT id, first_name, last_name, cefr_level, rating, role
       FROM users
       WHERE parent_connect_code_hash = $1
         AND parent_connect_code_expires_at IS NOT NULL
         AND parent_connect_code_expires_at > NOW()`,
      [codeHash]
    );
    if (stu.rows.length === 0 || stu.rows[0].role !== "student") {
      parentLinkNoteFail(req);
      return res.status(404).json({ error: "Kod noto'g'ri yoki muddati o'tgan" });
    }
    const child = stu.rows[0];
    if (child.id === parentId) return res.status(400).json({ error: "O'zingizga ulanib bo'lmaydi" });

    const pc = await pool.query("SELECT COUNT(*)::int AS c FROM parent_links WHERE student_id=$1 AND status='active'", [child.id]);
    if (pc.rows[0].c >= MAX_PARENTS_PER_STUDENT) return res.status(400).json({ error: "Bu o'quvchiga ulangan ota-onalar soni to'lgan" });
    const cc = await pool.query("SELECT COUNT(*)::int AS c FROM parent_links WHERE parent_id=$1 AND status='active'", [parentId]);
    if (cc.rows[0].c >= MAX_CHILDREN_PER_PARENT) return res.status(400).json({ error: "Ulangan farzandlar soni to'lgan" });

    const ex = await pool.query("SELECT id, status FROM parent_links WHERE parent_id=$1 AND student_id=$2", [parentId, child.id]);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (ex.rows.length === 0) {
        await client.query(
          "INSERT INTO parent_links (parent_id, student_id, relationship, status, linked_at) VALUES ($1,$2,$3,'active',NOW())",
          [parentId, child.id, relationship]
        );
      } else if (ex.rows[0].status === "revoked") {
        await client.query(
          "UPDATE parent_links SET status='active', relationship=$3, linked_at=NOW(), revoked_at=NULL, revoked_by=NULL, updated_at=NOW() WHERE id=$1 AND parent_id=$2",
          [ex.rows[0].id, parentId, relationship]
        );
      } // active bo'lsa — idempotent
      await client.query("COMMIT");
    } catch (txe) { await client.query("ROLLBACK"); throw txe; }
    finally { client.release(); }

    // BIR MARTALIK: kod ishlatildi — o'chiramiz (boshqa ota-ona shu kod bilan ulana olmasin)
    await pool.query(
      "UPDATE users SET parent_connect_code_hash = NULL, parent_connect_code_expires_at = NULL WHERE id = $1",
      [child.id]
    );

    parentLinkNoteOk(req);
    res.json({
      success: true,
      child: { id: child.id, name: ((child.first_name||"")+" "+(child.last_name||"")).trim() || "Farzand", cefr_level: child.cefr_level || "A1", rating: child.rating || 0 }
    });
  } catch (err) {
    console.error("Parent link xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// --- Ulangan bolalar ro'yxati ---
app.get("/parent/children", authMiddleware, requireParent, async (req, res) => {
  try {
    const parentId = req.user.id;
    const rows = await pool.query(
      `SELECT pl.student_id, pl.relationship, pl.linked_at,
              u.first_name, u.last_name, u.cefr_level, u.rating, u.xp, u.is_banned,
              (SELECT MAX(played_at) FROM battle_history bh WHERE bh.user_id = u.id) AS last_played
       FROM parent_links pl
       JOIN users u ON u.id = pl.student_id
       WHERE pl.parent_id = $1 AND pl.status = 'active'
       ORDER BY pl.linked_at DESC`,
      [parentId]
    );
    res.json({
      children: rows.rows.map(r => ({
        student_id: r.student_id,
        name: ((r.first_name||"")+" "+(r.last_name||"")).trim() || "Farzand",
        cefr_level: r.cefr_level || "A1",
        league: parentLeagueName(r.rating),
        rating: r.rating || 0,
        xp: r.xp || 0,
        relationship: r.relationship || "guardian",
        is_banned: !!r.is_banned,
        last_activity_label: activityLabel(r.last_played),
        linked_at: r.linked_at
      }))
    });
  } catch (err) {
    console.error("Bolalar ro'yxati xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// --- Bitta bola: batafsil panel (read-only) ---
app.get("/parent/children/:studentId", authMiddleware, requireParent, async (req, res) => {
  try {
    const parentId = req.user.id;
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(studentId)) return res.status(400).json({ error: "Noto'g'ri ID" });

    const link = await pool.query(
      "SELECT relationship, linked_at FROM parent_links WHERE parent_id=$1 AND student_id=$2 AND status='active'",
      [parentId, studentId]
    );
    if (link.rows.length === 0) return res.status(403).json({ error: "Bu farzandga ruxsatingiz yo'q" });

    const up = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.xp, u.school, u.is_banned, u.current_streak,
              (SELECT COUNT(*) FROM class_students cs WHERE cs.student_id=u.id AND cs.status='active')::int AS class_count
       FROM users u WHERE u.id = $1`,
      [studentId]
    );
    if (up.rows.length === 0) return res.status(404).json({ error: "Farzand topilmadi" });
    const u = up.rows[0];

    const bs = await pool.query(
      `SELECT COUNT(*)::int AS total,
              SUM(CASE WHEN outcome='win' THEN 1 ELSE 0 END)::int AS wins,
              COALESCE(SUM(my_score),0)::int AS correct_sum,
              COALESCE(SUM(total_questions),0)::int AS q_sum,
              SUM(CASE WHEN played_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END)::int AS weekly,
              MAX(played_at) AS last_played
       FROM battle_history WHERE user_id = $1`,
      [studentId]
    );
    const b = bs.rows[0];
    const winRate = b.total > 0 ? Math.round((b.wins / b.total) * 100) : 0;
    const accuracy = b.q_sum > 0 ? Math.min(100, Math.round((b.correct_sum / b.q_sum) * 100)) : null;

    const bh = await pool.query(
      "SELECT played_at, outcome, my_score, opponent_score, mode, total_questions FROM battle_history WHERE user_id=$1 ORDER BY played_at DESC LIMIT 10",
      [studentId]
    );

    const asg = await pool.query(
      `SELECT a.id, a.title, c.name AS class_name, t.first_name AS tf, t.last_name AS tl,
              a.cefr_level, a.skill, a.question_count, a.due_at,
              s.status AS sub_status, s.score, s.total, s.percent, s.is_late, s.submitted_at
       FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       JOIN users t ON t.id = c.teacher_id
       JOIN assignments a ON a.class_id = c.id AND a.status='active'
       LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = $1
       WHERE cs.student_id = $1 AND cs.status='active' AND c.archived_at IS NULL
       ORDER BY a.due_at NULLS LAST, a.created_at DESC LIMIT 30`,
      [studentId]
    );

    const wa = await pool.query(
      `SELECT aq.skill, COUNT(*)::int AS attempts, SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::int AS correct
       FROM submission_answers sa
       JOIN assignment_submissions s ON s.id = sa.submission_id AND s.student_id = $1 AND s.status='submitted'
       JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
       WHERE aq.skill IS NOT NULL AND aq.skill <> ''
       GROUP BY aq.skill
       HAVING COUNT(*) >= 3
       ORDER BY (SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::float / COUNT(*)) ASC`,
      [studentId]
    );

    const examRows = await pool.query(
      `SELECT from_level, to_level, overall_percent, passed, level_changed, taken_at
       FROM exam_attempts WHERE user_id = $1 ORDER BY taken_at DESC LIMIT 20`,
      [studentId]
    );

    res.json({
      child: {
        id: u.id,
        name: ((u.first_name||"")+" "+(u.last_name||"")).trim() || "Farzand",
        cefr_level: u.cefr_level || "A1",
        league: parentLeagueName(u.rating),
        rating: u.rating || 0,
        xp: u.xp || 0,
        school_name: u.school || null,
        class_count: u.class_count,
        is_banned: !!u.is_banned,
        relationship: link.rows[0].relationship,
        linked_at: link.rows[0].linked_at
      },
      overview: {
        total_battles: b.total,
        win_rate: winRate,
        accuracy: accuracy,
        current_streak: u.current_streak || 0,
        weekly_activity_count: b.weekly,
        last_activity_label: activityLabel(b.last_played)
      },
      battles: bh.rows.map(x => ({
        played_at: x.played_at,
        result: x.outcome,
        score: (x.my_score != null ? x.my_score : 0) + " : " + (x.opponent_score != null ? x.opponent_score : 0),
        opponent_label: "Raqib",
        mode: x.mode,
        question_count: x.total_questions || null
      })),
      exams: examRows.rows.map(e => ({
        from_level: e.from_level,
        to_level: e.to_level,
        overall_percent: e.overall_percent,
        passed: e.passed,
        level_changed: e.level_changed,
        taken_at: e.taken_at
      })),
      assignments: asg.rows.map(a => {
        let st = "not_started";
        if (a.sub_status === "in_progress") st = "in_progress";
        else if (a.sub_status === "submitted") st = a.is_late ? "late_submitted" : "submitted";
        return {
          title: a.title, class_name: a.class_name,
          teacher_name: ((a.tf||"")+" "+(a.tl||"")).trim(),
          due_at: a.due_at, status: st,
          score: a.score, percent: a.percent, is_late: !!a.is_late, submitted_at: a.submitted_at
        };
      }),
      weak_areas: wa.rows.map(w => ({
        skill: w.skill,
        accuracy: w.attempts > 0 ? Math.round((w.correct / w.attempts) * 100) : 0,
        attempts: w.attempts
      }))
    });
  } catch (err) {
    console.error("Bola paneli xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// --- Farzandni uzish (ota-ona o'z ro'yxatidan) ---
app.delete("/parent/children/:studentId", authMiddleware, requireParent, async (req, res) => {
  try {
    const parentId = req.user.id;
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(studentId)) return res.status(400).json({ error: "Noto'g'ri ID" });
    const r = await pool.query(
      "UPDATE parent_links SET status='revoked', revoked_at=NOW(), revoked_by=$1, updated_at=NOW() WHERE parent_id=$1 AND student_id=$2 AND status='active' RETURNING id",
      [parentId, studentId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Bog'lanish topilmadi" });
    res.json({ success: true });
  } catch (err) {
    console.error("Farzandni uzish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// SINF O'QUVCHILARI RO'YXATI (o'qituvchi ko'radi)
app.get("/teacher/classes/:classId/students", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;
    const classId = parseInt(req.params.classId, 10);

    if (isNaN(classId)) {
      return res.status(400).json({ error: "Noto'g'ri sinf ID" });
    }

    // XAVFSIZLIK: sinf shu o'qituvchiniki ekanini tekshiramiz
    const classCheck = await pool.query(
      "SELECT id, name, description, join_code, created_at FROM classes WHERE id = $1 AND teacher_id = $2",
      [classId, teacherId]
    );
    if (classCheck.rows.length === 0) {
      // Sinf yo'q yoki boshqa o'qituvchiniki — har holda rad etamiz
      return res.status(404).json({ error: "Sinf topilmadi" });
    }

    // O'quvchilar ro'yxati (faol)
    const students = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.profile_picture,
              cs.joined_at, cs.status
       FROM class_students cs
       JOIN users u ON u.id = cs.student_id
       WHERE cs.class_id = $1 AND cs.status = 'active'
       ORDER BY cs.joined_at DESC`,
      [classId]
    );

    res.json({
      class: classCheck.rows[0],
      students: students.rows
    });
  } catch (err) {
    console.error("Sinf o'quvchilari xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Barcha o'quvchilar (O'quvchilar sahifasi)
app.get("/teacher/students", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;

    // Teacher'ning barcha active sinflaridagi active o'quvchilar
    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.phone, u.cefr_level,
              c.id AS class_id, c.name AS class_name,
              -- O'rtacha natija (topshirilgan topshiriqlar)
              (SELECT ROUND(AVG(sub.percent)) FROM assignment_submissions sub
               WHERE sub.student_id = u.id AND sub.status IN ('submitted','late_submitted') AND sub.percent IS NOT NULL) AS avg_score,
              -- Bajarilgan topshiriqlar (shu sinfdagi)
              (SELECT COUNT(*)::int FROM assignment_submissions sub
               JOIN assignments a ON a.id = sub.assignment_id
               WHERE sub.student_id = u.id AND a.class_id = c.id AND sub.status IN ('submitted','late_submitted')) AS assignments_done,
              (SELECT COUNT(*)::int FROM assignments a WHERE a.class_id = c.id) AS assignments_total,
              -- Oxirgi 7 kunda faol kunlar (submission bo'yicha)
              (SELECT COUNT(DISTINCT DATE(sub.submitted_at)) FROM assignment_submissions sub
               WHERE sub.student_id = u.id AND sub.submitted_at >= NOW() - INTERVAL '7 days') AS active_days_7
       FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       JOIN users u ON u.id = cs.student_id
       WHERE c.teacher_id = $1 AND c.archived_at IS NULL AND cs.status = 'active'
       ORDER BY u.first_name, u.last_name`,
      [teacherId]
    );

    const students = result.rows.map((s) => ({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      phone: s.phone,
      cefr_level: s.cefr_level || "A1",
      class_id: s.class_id,
      class_name: s.class_name,
      avg_score: s.avg_score != null ? Number(s.avg_score) : null,
      assignments_done: Number(s.assignments_done) || 0,
      assignments_total: Number(s.assignments_total) || 0,
      active_days_7: Number(s.active_days_7) || 0,
    }));

    // ===== Statistika =====
    const total = students.length;
    const active = students.filter((s) => s.active_days_7 > 0).length;
    const withScore = students.filter((s) => s.avg_score != null);
    const avgScore = withScore.length
      ? Math.round(withScore.reduce((a, s) => a + s.avg_score, 0) / withScore.length)
      : null;
    // Eng yuqori natija
    let topScore = null, topName = null;
    withScore.forEach((s) => {
      if (topScore == null || s.avg_score > topScore) {
        topScore = s.avg_score;
        topName = ((s.first_name || "") + " " + (s.last_name || "")).trim() + (s.class_name ? " (" + s.class_name + ")" : "");
      }
    });
    // O'rtacha faollik (hafta kunlari)
    const avgFreq = total > 0
      ? Math.round((students.reduce((a, s) => a + s.active_days_7, 0) / total) * 10) / 10
      : null;

    // ===== Sinf taqsimoti (donut) =====
    const classMap = {};
    students.forEach((s) => {
      const key = s.class_name || "—";
      classMap[key] = (classMap[key] || 0) + 1;
    });
    const classDistribution = Object.keys(classMap).map((k) => ({ class_name: k, count: classMap[k] }));

    // ===== Natija bo'yicha guruhlar =====
    const groups = { excellent: 0, good: 0, mid: 0, low: 0 };
    withScore.forEach((s) => {
      if (s.avg_score >= 90) groups.excellent++;
      else if (s.avg_score >= 75) groups.good++;
      else if (s.avg_score >= 50) groups.mid++;
      else groups.low++;
    });
    const scoreGroups = [
      { key: "excellent", count: groups.excellent },
      { key: "good", count: groups.good },
      { key: "mid", count: groups.mid },
      { key: "low", count: groups.low },
    ];

    res.json({
      students,
      stats: { total, active, avg_score: avgScore, top_score: topScore, top_name: topName, avg_frequency: avgFreq },
      class_distribution: classDistribution,
      score_groups: scoreGroups,
    });
  } catch (err) {
    console.error("/teacher/students xatosi:", err);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// O'QUVCHINI SINFDAN OLIB TASHLASH (yumshoq: status='removed')
app.delete("/teacher/classes/:classId/students/:studentId", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;
    const classId = parseInt(req.params.classId, 10);
    const studentId = parseInt(req.params.studentId, 10);

    if (isNaN(classId) || isNaN(studentId)) {
      return res.status(400).json({ error: "Noto'g'ri ID" });
    }

    // XAVFSIZLIK: sinf shu o'qituvchiniki ekanini tekshiramiz
    const classCheck = await pool.query(
      "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2",
      [classId, teacherId]
    );
    if (classCheck.rows.length === 0) {
      // Sinf yo'q yoki boshqa o'qituvchiniki
      return res.status(404).json({ error: "Sinf topilmadi" });
    }

    // O'quvchi shu sinfda faolmi tekshiramiz
    const membership = await pool.query(
      "SELECT id FROM class_students WHERE class_id = $1 AND student_id = $2 AND status = 'active'",
      [classId, studentId]
    );
    if (membership.rows.length === 0) {
      return res.status(404).json({ error: "O'quvchi bu sinfda topilmadi" });
    }

    // Yumshoq o'chirish: status='removed' (yozuv saqlanadi, tarix yo'qolmaydi)
    await pool.query(
      "UPDATE class_students SET status = 'removed' WHERE class_id = $1 AND student_id = $2",
      [classId, studentId]
    );

    res.json({ message: "O'quvchi sinfdan olib tashlandi" });
  } catch (err) {
    console.error("O'quvchini olib tashlash xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============================================================
// TEACHER ASSIGNMENTS — Stage 2: O'qituvchi backend
// ============================================================
const ASSIGN_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const ASSIGN_SKILLS = ["mixed", "grammar", "vocabulary", "reading", "listening", "speaking", "writing"];

// --- Topshiriq yaratish (transaction + savol snapshot) ---
app.post("/teacher/classes/:classId/assignments", authMiddleware, requireTeacher, async (req, res) => {
  const teacherId = req.user.id;
  const classId = parseInt(req.params.classId, 10);
  if (isNaN(classId)) return res.status(400).json({ error: "Noto'g'ri sinf ID" });

  let { title, description, cefr_level, skill, question_count, due_at, max_attempts } = req.body;

  // Validatsiya (Sprint 1: sanitizeText — XSS himoya)
  title = sanitizeText(title || "", 150);
  description = sanitizeText(description || "", 1000);
  if (title.length < 3) return res.status(400).json({ error: "Sarlavha 3–150 belgi bo'lishi kerak" });
  if (!ASSIGN_LEVELS.includes(cefr_level)) return res.status(400).json({ error: "Noto'g'ri CEFR daraja" });
  skill = ASSIGN_SKILLS.includes(skill) ? skill : "mixed";
  question_count = parseInt(question_count, 10);
  if (isNaN(question_count) || question_count < 1 || question_count > 50) return res.status(400).json({ error: "Savol soni 1–50 oralig'ida bo'lishi kerak" });
  max_attempts = parseInt(max_attempts, 10);
  if (isNaN(max_attempts) || max_attempts < 1 || max_attempts > 5) max_attempts = 1;
  let dueAt = null;
  if (due_at) {
    const d = new Date(due_at);
    if (isNaN(d.getTime())) return res.status(400).json({ error: "Muddat sanasi noto'g'ri" });
    dueAt = d;
  }

  try {
    // Egalik: sinf shu o'qituvchiniki va arxivlanmagan
    const cls = await pool.query(
      "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL",
      [classId, teacherId]
    );
    if (cls.rows.length === 0) return res.status(404).json({ error: "Sinf topilmadi" });

    // ===== LIMIT: Free teacher oyiga 3 topshiriq =====
    const asgLimit = await premium.checkTeacherLimit(teacherId, "assignments");
    if (!asgLimit.allowed) {
      await logAudit(req, "teacher_limit_blocked_assignment", {
        entityType: "assignment", entityId: classId,
        details: "teacher=" + teacherId + " count=" + asgLimit.current + " limit=" + asgLimit.limit + " plan=free"
      }).catch(() => {});
      return res.status(402).json(premium.teacherLimitError("assignments"));
    }

    // Savol tanlash: faqat published, daraja (+ skill agar mixed bo'lmasa)
    let qSql = "SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, cefr_level, skill, difficulty FROM questions WHERE status = 'published' AND cefr_level = $1";
    const qParams = [cefr_level];
    if (skill !== "mixed") { qParams.push(skill); qSql += " AND skill = $2"; }
    qSql += " ORDER BY RANDOM() LIMIT " + question_count;
    const qRes = await pool.query(qSql, qParams);

    if (qRes.rows.length < question_count) {
      return res.status(400).json({ error: "Yetarli savol yo'q (kerak: " + question_count + ", mavjud: " + qRes.rows.length + "). Daraja yoki skill'ni o'zgartiring." });
    }

    // Transaction: assignment + snapshot savollar birga
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const aRes = await client.query(
        `INSERT INTO assignments (class_id, teacher_id, title, description, cefr_level, skill, question_count, due_at, max_attempts)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, title, description, cefr_level, skill, question_count, due_at, max_attempts, status, created_at`,
        [classId, teacherId, title, (description || "").trim() || null, cefr_level, skill, question_count, dueAt, max_attempts]
      );
      const assignment = aRes.rows[0];

      for (let i = 0; i < qRes.rows.length; i++) {
        const q = qRes.rows[i];
        await client.query(
          `INSERT INTO assignment_questions
           (assignment_id, original_question_id, q_order, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, cefr_level, skill, difficulty)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [assignment.id, q.id, i + 1, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation, q.cefr_level, q.skill, q.difficulty]
        );
      }

      await client.query("COMMIT");
      res.status(201).json({ success: true, assignment });
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Topshiriq yaratish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== IMTIHON YARATISH (savol snapshot bilan) =====
app.post("/teacher/exams", authMiddleware, requireTeacher, async (req, res) => {
  const teacherId = req.user.id;
  let { class_id, title, description, cefr_level, skill, question_count,
        duration_minutes, pass_percent, max_attempts, starts_at, ends_at } = req.body;

  // Validatsiya (Sprint 1: sanitizeText — XSS himoya)
  title = sanitizeText(title || "", 200);
  description = sanitizeText(description || "", 1000);
  if (title.length < 3) return res.status(400).json({ error: "Sarlavha 3–200 belgi bo'lishi kerak" });
  if (!ASSIGN_LEVELS.includes(cefr_level)) return res.status(400).json({ error: "Noto'g'ri CEFR daraja" });
  skill = ASSIGN_SKILLS.includes(skill) ? skill : "mixed";
  question_count = parseInt(question_count, 10);
  if (isNaN(question_count) || question_count < 1 || question_count > 50) return res.status(400).json({ error: "Savol soni 1–50 oralig'ida" });
  duration_minutes = parseInt(duration_minutes, 10);
  if (isNaN(duration_minutes) || duration_minutes < 5 || duration_minutes > 180) return res.status(400).json({ error: "Davomiylik 5–180 daqiqa oralig'ida" });
  pass_percent = parseInt(pass_percent, 10);
  if (isNaN(pass_percent) || pass_percent < 0 || pass_percent > 100) pass_percent = 60;
  max_attempts = parseInt(max_attempts, 10);
  if (isNaN(max_attempts) || max_attempts < 1 || max_attempts > 5) max_attempts = 1;

  let startsAt = null, endsAt = null;
  if (starts_at) { const d = new Date(starts_at); if (!isNaN(d.getTime())) startsAt = d; }
  if (ends_at) { const d = new Date(ends_at); if (!isNaN(d.getTime())) endsAt = d; }

  const classId = class_id ? parseInt(class_id, 10) : null;

  try {
    // Egalik: sinf shu o'qituvchiniki
    if (classId) {
      const cls = await pool.query(
        "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL",
        [classId, teacherId]
      );
      if (cls.rows.length === 0) return res.status(404).json({ error: "Sinf topilmadi" });
    }

    // Pro limit (imtihon ham topshiriq kabi cheklanadi — ixtiyoriy)
    // Agar imtihon uchun alohida limit kerak bo'lmasa, bu blokni o'tkazib yuboring
    // const examLimit = await premium.checkTeacherLimit(teacherId, "assignments");
    // if (!examLimit.allowed) return res.status(402).json(premium.teacherLimitError("assignments"));

    // Savol tanlash: published, daraja (+skill)
    let qSql = "SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, cefr_level, skill, difficulty FROM questions WHERE status = 'published' AND cefr_level = $1";
    const qParams = [cefr_level];
    if (skill !== "mixed") { qParams.push(skill); qSql += " AND skill = $2"; }
    qSql += " ORDER BY RANDOM() LIMIT " + question_count;

    const qRes = await pool.query(qSql, qParams);
    if (qRes.rows.length < 1) {
      return res.status(400).json({ error: "Bu daraja/ko'nikma bo'yicha yetarli savol yo'q. Avval savollar qo'shing." });
    }

    // Imtihonni yaratamiz
    const examRes = await pool.query(
      `INSERT INTO teacher_exams
        (teacher_id, class_id, title, description, cefr_level, skill, question_count,
         duration_minutes, pass_percent, max_attempts, starts_at, ends_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [teacherId, classId, title, (description || "").trim(), cefr_level, skill,
       qRes.rows.length, duration_minutes, pass_percent, max_attempts, startsAt, endsAt,
       startsAt && startsAt > new Date() ? "scheduled" : "active"]
    );
    const examId = examRes.rows[0].id;

    // Savollarni snapshot qilamiz
    for (let i = 0; i < qRes.rows.length; i++) {
      const q = qRes.rows[i];
      await pool.query(
        `INSERT INTO teacher_exam_questions
          (exam_id, original_question_id, q_order, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, skill, cefr_level, difficulty)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [examId, q.id, i + 1, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation, q.skill, q.cefr_level, q.difficulty]
      );
    }

    if (typeof logAudit === "function") logAudit(req, "exam_created", { entityType: "exam", entityId: examId });

    res.json({ success: true, id: examId, question_count: qRes.rows.length });
  } catch (err) {
    console.error("Imtihon yaratish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== IMTIHONLAR RO'YXATI =====
app.get("/teacher/exams", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;

    // Vaqtga qarab holatni yangilaymiz (scheduled->active->finished)
    await pool.query(
      `UPDATE teacher_exams SET status = 'active'
       WHERE teacher_id = $1 AND status = 'scheduled' AND (starts_at IS NULL OR starts_at <= NOW())`,
      [teacherId]
    );
    await pool.query(
      `UPDATE teacher_exams SET status = 'finished'
       WHERE teacher_id = $1 AND status = 'active' AND ends_at IS NOT NULL AND ends_at < NOW()`,
      [teacherId]
    );

    const result = await pool.query(
      `SELECT e.id, e.title, e.description, e.cefr_level, e.skill, e.question_count,
              e.duration_minutes, e.pass_percent, e.max_attempts, e.starts_at, e.ends_at,
              e.status, e.created_at, e.class_id,
              c.name AS class_name,
              (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = e.class_id AND cs.status = 'active')::int AS class_student_count,
              (SELECT COUNT(*) FROM teacher_exam_attempts a WHERE a.exam_id = e.id AND a.status = 'submitted')::int AS submitted_count,
              (SELECT ROUND(AVG(a.percent)) FROM teacher_exam_attempts a WHERE a.exam_id = e.id AND a.status = 'submitted')::int AS avg_percent
       FROM teacher_exams e
       LEFT JOIN classes c ON c.id = e.class_id
       WHERE e.teacher_id = $1
       ORDER BY e.created_at DESC`,
      [teacherId]
    );

    // Statistika
    const rows = result.rows;
    const total = rows.length;
    const active = rows.filter((r) => r.status === "active").length;
    const finished = rows.filter((r) => r.status === "finished").length;
    const avgDuration = total > 0 ? Math.round(rows.reduce((a, r) => a + (r.duration_minutes || 0), 0) / total) : 0;

    const submittedExams = rows.filter((r) => r.avg_percent != null);
    const avgScore = submittedExams.length > 0
      ? Math.round(submittedExams.reduce((a, r) => a + r.avg_percent, 0) / submittedExams.length)
      : 0;

    res.json({
      exams: rows,
      stats: {
        total,
        active,
        finished,
        avg_score: avgScore,
        avg_duration: avgDuration,
      },
    });
  } catch (err) {
    console.error("Imtihonlar ro'yxati xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== BITTA IMTIHON (savollari bilan — ko'rish/tahrirlash uchun) =====
app.get("/teacher/exams/:id", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;
    const examId = parseInt(req.params.id, 10);
    if (isNaN(examId)) return res.status(400).json({ error: "Noto'g'ri ID" });

    const examRes = await pool.query(
      `SELECT e.*, c.name AS class_name
       FROM teacher_exams e LEFT JOIN classes c ON c.id = e.class_id
       WHERE e.id = $1 AND e.teacher_id = $2`,
      [examId, teacherId]
    );
    if (examRes.rows.length === 0) return res.status(404).json({ error: "Imtihon topilmadi" });

    const qRes = await pool.query(
      `SELECT q_order, question_text, option_a, option_b, option_c, option_d, skill, difficulty
       FROM teacher_exam_questions WHERE exam_id = $1 ORDER BY q_order`,
      [examId]
    );

    res.json({ exam: examRes.rows[0], questions: qRes.rows });
  } catch (err) {
    console.error("Imtihon ko'rish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== IMTIHON O'CHIRISH =====
app.delete("/teacher/exams/:id", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;
    const examId = parseInt(req.params.id, 10);
    if (isNaN(examId)) return res.status(400).json({ error: "Noto'g'ri ID" });

    const own = await pool.query(
      "SELECT id FROM teacher_exams WHERE id = $1 AND teacher_id = $2",
      [examId, teacherId]
    );
    if (own.rows.length === 0) return res.status(404).json({ error: "Imtihon topilmadi" });

    // teacher_exam_questions ON DELETE CASCADE bilan o'chadi
    await pool.query("DELETE FROM teacher_exams WHERE id = $1", [examId]);

    if (typeof logAudit === "function") logAudit(req, "exam_deleted", { entityType: "exam", entityId: examId });

    res.json({ success: true });
  } catch (err) {
    console.error("Imtihon o'chirish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// =====================================================
// IMTIHON FAZA 2 — O'QUVCHI TOMONI
// =====================================================

// O'quvchi ko'radigan faol imtihonlar (o'z sinflari)
app.get("/student/exams", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;

    // Avval vaqti o'tган imtihonlarni finished qilamiz (global)
    await pool.query(
      `UPDATE teacher_exams SET status = 'finished'
       WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at < NOW()`
    );
    await pool.query(
      `UPDATE teacher_exams SET status = 'active'
       WHERE status = 'scheduled' AND (starts_at IS NULL OR starts_at <= NOW())`
    );

    // O'quvchining faol sinflaridagi imtihonlar
    const result = await pool.query(
      `SELECT e.id, e.title, e.description, e.cefr_level, e.skill, e.question_count,
              e.duration_minutes, e.pass_percent, e.max_attempts, e.starts_at, e.ends_at,
              e.status, c.name AS class_name,
              (SELECT COUNT(*) FROM teacher_exam_attempts a
                WHERE a.exam_id = e.id AND a.student_id = $1 AND a.status = 'submitted')::int AS my_attempts,
              (SELECT a.id FROM teacher_exam_attempts a
                WHERE a.exam_id = e.id AND a.student_id = $1 AND a.status = 'in_progress'
                ORDER BY a.started_at DESC LIMIT 1) AS in_progress_id,
              (SELECT a.percent FROM teacher_exam_attempts a
                WHERE a.exam_id = e.id AND a.student_id = $1 AND a.status = 'submitted'
                ORDER BY a.percent DESC LIMIT 1) AS best_percent
       FROM teacher_exams e
       JOIN classes c ON c.id = e.class_id
       JOIN class_students cs ON cs.class_id = c.id
       WHERE cs.student_id = $1 AND cs.status = 'active'
         AND e.status IN ('active', 'finished')
       ORDER BY e.status ASC, e.created_at DESC`,
      [studentId]
    );

    res.json({ exams: result.rows });
  } catch (err) {
    console.error("Student exams ro'yxati xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// IMTIHONNI BOSHLASH (yoki davom ettirish)
app.post("/student/exams/:id/start", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const examId = parseInt(req.params.id, 10);
    if (isNaN(examId)) return res.status(400).json({ error: "Noto'g'ri ID" });

    // Imtihon + o'quvchi sinfda ekanini tekshiramiz
    const examRes = await pool.query(
      `SELECT e.* FROM teacher_exams e
       JOIN class_students cs ON cs.class_id = e.class_id
       WHERE e.id = $1 AND cs.student_id = $2 AND cs.status = 'active'`,
      [examId, studentId]
    );
    if (examRes.rows.length === 0) return res.status(404).json({ error: "Imtihon topilmadi yoki sizga ochiq emas" });
    const exam = examRes.rows[0];

    if (exam.status !== "active") return res.status(400).json({ error: "Imtihon hozir faol emas" });

    // Davom etayotgan urinish bormi?
    const ongoing = await pool.query(
      `SELECT * FROM teacher_exam_attempts
       WHERE exam_id = $1 AND student_id = $2 AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1`,
      [examId, studentId]
    );

    if (ongoing.rows.length > 0) {
      const att = ongoing.rows[0];
      // Vaqt tugaganmi? Tugagan bo'lsa avtomatik submit (pastdagi baholash mantiqi bilan)
      if (att.expires_at && new Date(att.expires_at) < new Date()) {
        // Vaqt tugagan — auto submit qilamiz va natijani qaytaramiz
        await gradeAttempt(att.id); // pastdagi yordamchi funksiya
        return res.status(409).json({ error: "Oldingi urinish vaqti tugagan", expired: true });
      }
      // Davom ettirish — savollar + saqlangan javoblar + qolgan vaqt
      const qs = await pool.query(
        `SELECT id, q_order, question_text, option_a, option_b, option_c, option_d, skill
         FROM teacher_exam_questions WHERE exam_id = $1 ORDER BY q_order`,
        [examId]
      );
      const secondsLeft = Math.max(0, Math.floor((new Date(att.expires_at) - new Date()) / 1000));
      return res.json({
        attempt_id: att.id,
        resumed: true,
        exam: { title: exam.title, duration_minutes: exam.duration_minutes, question_count: exam.question_count },
        questions: qs.rows,     // to'g'ri javobsiz
        saved_answers: att.answers || {},
        seconds_left: secondsLeft,
      });
    }

    // Yangi urinish — max_attempts tekshiramiz
    const doneCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM teacher_exam_attempts
       WHERE exam_id = $1 AND student_id = $2 AND status IN ('submitted','expired')`,
      [examId, studentId]
    );
    if (doneCount.rows[0].c >= exam.max_attempts) {
      return res.status(403).json({ error: "Urinishlar tugagan (maksimal " + exam.max_attempts + " marta)" });
    }

    // expires_at = now + duration
    const expiresAt = new Date(Date.now() + exam.duration_minutes * 60 * 1000);
    const attRes = await pool.query(
      `INSERT INTO teacher_exam_attempts
        (exam_id, student_id, attempt_number, status, started_at, expires_at, total)
       VALUES ($1, $2, $3, 'in_progress', NOW(), $4, $5)
       RETURNING id`,
      [examId, studentId, doneCount.rows[0].c + 1, expiresAt, exam.question_count]
    );

    const qs = await pool.query(
      `SELECT id, q_order, question_text, option_a, option_b, option_c, option_d, skill
       FROM teacher_exam_questions WHERE exam_id = $1 ORDER BY q_order`,
      [examId]
    );

    res.json({
      attempt_id: attRes.rows[0].id,
      resumed: false,
      exam: { title: exam.title, duration_minutes: exam.duration_minutes, question_count: exam.question_count },
      questions: qs.rows,      // to'g'ri javobsiz (aldашga qarshi)
      saved_answers: {},
      seconds_left: exam.duration_minutes * 60,
    });
  } catch (err) {
    console.error("Imtihon start xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// BITTA JAVOBNI SAQLASH (recovery uchun — har javob darhol)
app.post("/student/exams/attempts/:attemptId/answer", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const attemptId = parseInt(req.params.attemptId, 10);
    const { question_id, answer } = req.body;
    if (isNaN(attemptId) || !question_id) return res.status(400).json({ error: "Noto'g'ri so'rov" });

    // Urinish o'ziniki va in_progress ekanini tekshiramiz
    const att = await pool.query(
      "SELECT * FROM teacher_exam_attempts WHERE id = $1 AND student_id = $2",
      [attemptId, studentId]
    );
    if (att.rows.length === 0) return res.status(404).json({ error: "Urinish topilmadi" });
    if (att.rows[0].status !== "in_progress") return res.status(400).json({ error: "Imtihon yakunlangan" });
    if (att.rows[0].expires_at && new Date(att.rows[0].expires_at) < new Date()) {
      return res.status(400).json({ error: "Vaqt tugagan", expired: true });
    }

    // answers JSONB ni yangilaymiz (bitta kalitni)
    const answers = att.rows[0].answers || {};
    answers[question_id] = (answer || "").toLowerCase();
    await pool.query(
      "UPDATE teacher_exam_attempts SET answers = $1 WHERE id = $2",
      [JSON.stringify(answers), attemptId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Javob saqlash xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// IMTIHONNI YAKUNLASH (baholash)
app.post("/student/exams/attempts/:attemptId/submit", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const attemptId = parseInt(req.params.attemptId, 10);
    if (isNaN(attemptId)) return res.status(400).json({ error: "Noto'g'ri ID" });

    const att = await pool.query(
      "SELECT * FROM teacher_exam_attempts WHERE id = $1 AND student_id = $2",
      [attemptId, studentId]
    );
    if (att.rows.length === 0) return res.status(404).json({ error: "Urinish topilmadi" });
    if (att.rows[0].status !== "in_progress") return res.status(400).json({ error: "Allaqachon yakunlangan" });

    // Frontend so'nggi javoblarni yuborishi mumkin (ixtiyoriy — recovery bilan ham bor)
    if (req.body && req.body.answers && typeof req.body.answers === "object") {
      const merged = Object.assign({}, att.rows[0].answers || {}, req.body.answers);
      await pool.query("UPDATE teacher_exam_attempts SET answers = $1 WHERE id = $2", [JSON.stringify(merged), attemptId]);
    }

    const result = await gradeAttempt(attemptId);
    res.json(result);
  } catch (err) {
    console.error("Imtihon submit xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// NATIJANI KO'RISH
app.get("/student/exams/attempts/:attemptId/result", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const attemptId = parseInt(req.params.attemptId, 10);
    const att = await pool.query(
      `SELECT a.*, e.title, e.pass_percent, e.cefr_level
       FROM teacher_exam_attempts a JOIN teacher_exams e ON e.id = a.exam_id
       WHERE a.id = $1 AND a.student_id = $2`,
      [attemptId, studentId]
    );
    if (att.rows.length === 0) return res.status(404).json({ error: "Natija topilmadi" });
    res.json({ result: att.rows[0] });
  } catch (err) {
    console.error("Natija xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

const gradeAttempt = createExamAttemptGradingService({ pool });

// --- Sinf topshiriqlari ro'yxati (statistika bilan) ---
app.get("/teacher/classes/:classId/assignments", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ error: "Noto'g'ri sinf ID" });

    const cls = await pool.query("SELECT id FROM classes WHERE id = $1 AND teacher_id = $2", [classId, teacherId]);
    if (cls.rows.length === 0) return res.status(404).json({ error: "Sinf topilmadi" });

    const statusFilter = req.query.status; // active(default) | archived | all
    let where = "a.class_id = $1";
    if (statusFilter === "archived") where += " AND a.status = 'archived'";
    else if (statusFilter !== "all") where += " AND a.status = 'active'";

    const rows = await pool.query(
      `SELECT a.id, a.title, a.description, a.cefr_level, a.skill, a.question_count, a.due_at, a.status, a.created_at,
              (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = a.class_id AND cs.status='active') AS total_students,
              (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status='submitted') AS submitted_count,
              (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status='submitted' AND s.is_late) AS late_count,
              (SELECT COUNT(DISTINCT s.student_id) FROM assignment_submissions s WHERE s.assignment_id = a.id) AS started_count,
              (SELECT COALESCE(ROUND(AVG(s.percent)),0) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status='submitted') AS average_percent
       FROM assignments a
       WHERE ${where}
       ORDER BY a.created_at DESC`,
      [classId]
    );

    const assignments = rows.rows.map(r => {
      const total = parseInt(r.total_students), started = parseInt(r.started_count);
      return {
        id: r.id, title: r.title, description: r.description, cefr_level: r.cefr_level, skill: r.skill,
        question_count: r.question_count, due_at: r.due_at, status: r.status, created_at: r.created_at,
        total_students: total,
        submitted_count: parseInt(r.submitted_count),
        late_count: parseInt(r.late_count),
        not_started_count: Math.max(0, total - started),
        average_percent: parseInt(r.average_percent),
      };
    });

    res.json({ assignments });
  } catch (err) {
    console.error("Topshiriqlar ro'yxati xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// --- Topshiriqni arxivlash (yumshoq) ---
app.post("/teacher/assignments/:id/archive", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Noto'g'ri ID" });

    const r = await pool.query(
      "UPDATE assignments SET status='archived', archived_at=NOW(), updated_at=NOW() WHERE id=$1 AND teacher_id=$2 RETURNING id",
      [id, teacherId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Topshiriq topilmadi" });
    res.json({ success: true, message: "Topshiriq arxivlandi" });
  } catch (err) {
    console.error("Topshiriq arxivlash xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// --- Topshiriq natijalari (sinf xulosasi + har o'quvchi jadvali) ---
app.get("/teacher/assignments/:id/results", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;
    const assignmentId = parseInt(req.params.id, 10);
    if (isNaN(assignmentId)) return res.status(400).json({ error: "Noto'g'ri ID" });

    // Egalik: topshiriq shu o'qituvchiniki
    const aRes = await pool.query(
      `SELECT id, class_id, title, description, cefr_level, skill, question_count, due_at, status, created_at
       FROM assignments WHERE id = $1 AND teacher_id = $2`,
      [assignmentId, teacherId]
    );
    if (aRes.rows.length === 0) return res.status(404).json({ error: "Topshiriq topilmadi" });
    const assignment = aRes.rows[0];

    // Har bir FAOL o'quvchi + uning topshirishi (boshlamaganlar ham chiqsin -> LEFT JOIN)
    const rows = await pool.query(
      `SELECT u.id AS student_id, u.first_name, u.last_name, u.profile_picture,
              s.status AS submission_status, s.score, s.total, s.percent,
              s.correct_count, s.wrong_count, s.unanswered_count,
              s.is_late, s.started_at, s.submitted_at
       FROM class_students cs
       JOIN users u ON u.id = cs.student_id
       LEFT JOIN assignment_submissions s
         ON s.assignment_id = $1 AND s.student_id = u.id
       WHERE cs.class_id = $2 AND cs.status = 'active'
       ORDER BY (s.percent IS NULL), s.percent DESC, u.first_name ASC`,
      [assignmentId, assignment.class_id]
    );

    // Har o'quvchi uchun ko'rsatiladigan holat
    const students = rows.rows.map(r => {
      let display = "not_started";
      if (r.submission_status === "in_progress") display = "in_progress";
      else if (r.submission_status === "submitted") display = r.is_late ? "late_submitted" : "submitted";
      return {
        student_id: r.student_id,
        name: ((r.first_name || "") + " " + (r.last_name || "")).trim(),
        profile_picture: r.profile_picture || null,
        status: display,
        score: r.score, total: r.total, percent: r.percent,
        correct_count: r.correct_count, wrong_count: r.wrong_count, unanswered_count: r.unanswered_count,
        is_late: r.is_late || false,
        started_at: r.started_at, submitted_at: r.submitted_at
      };
    });

    // Sinf xulosasi
    const total_students = students.length;
    const submittedList = students.filter(s => s.status === "submitted" || s.status === "late_submitted");
    const submitted_count = submittedList.length;
    const late_count = students.filter(s => s.is_late).length;
    const not_started_count = students.filter(s => s.status === "not_started").length;
    const percents = submittedList.map(s => s.percent).filter(p => p !== null && p !== undefined);
    const average_percent = percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : 0;
    const highest_percent = percents.length ? Math.max(...percents) : 0;
    const lowest_percent = percents.length ? Math.min(...percents) : 0;
    const completion_percent = total_students ? Math.round((submitted_count / total_students) * 100) : 0;

    res.json({
      assignment,
      summary: {
        total_students, submitted_count, late_count, not_started_count,
        completion_percent, average_percent, highest_percent, lowest_percent
      },
      students
    });
  } catch (err) {
    console.error("Topshiriq natijalari xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============================================================
// SCHOOL CUP — Bosqich 6.2: Check-in backend
// ============================================================

// ============================================================
// SCHOOL CUP — Bosqich 7: O'quvchi turnir markazi
// ============================================================

// O'quvchining turnirlari (jamoa a'zosi bo'lgan)
app.get("/student/tournaments", authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;

    // Foydalanuvchi ma'lumoti (maktab)
    const uq = await pool.query("SELECT school FROM users WHERE id = $1", [uid]);
    const mySchool = uq.rows[0] ? uq.rows[0].school : null;

    // O'quvchi jamoa a'zosi bo'lgan turnirlar
    const tq = await pool.query(
      `SELECT DISTINCT t.id, t.name, t.status, t.level, t.scope_value, t.region,
              t.bracket_size, t.team_size, t.created_at,
              tm.member_role, tm.school, tm.school_key
       FROM tournament_team_members tm
       JOIN tournaments t ON t.id = tm.tournament_id
       WHERE tm.user_id = $1
       ORDER BY t.created_at DESC`,
      [uid]
    );

    // Har turnir uchun mening keyingi/joriy matchimni topamiz
    const tournaments = [];
    for (const t of tq.rows) {
      // Mening maktabim ishtirok etgan matchlar
      const mq = await pool.query(
        `SELECT id, round, match_no, school_a, school_b, school_a_key, school_b_key, score_a, score_b,
                winner_school, winner_school_key, status, scheduled_at
         FROM tournament_matches
         WHERE tournament_id = $1
           AND (school_a_key = $2 OR school_b_key = $2)
         ORDER BY round ASC, match_no ASC`,
        [t.id, t.school_key]
      );

      // Joriy/keyingi match (live > checkin > pending > done tartibida muhimligi)
      let activeMatch = null;
      const priority = { live: 4, checkin: 3, pending: 2, done: 1 };
      mq.rows.forEach(m => {
        if (!activeMatch || priority[m.status] > priority[activeMatch.status]) {
          activeMatch = m;
        }
      });

      tournaments.push({
        id: t.id,
        name: t.name,
        status: t.status,
        level: t.level,
        scope_value: t.scope_value,
        region: t.region,
        my_school: t.school,
        my_school_key: t.school_key,
        my_role: t.member_role,
        bracket_size: t.bracket_size,
        active_match: activeMatch,
        my_matches: mq.rows,
      });
    }

    res.json({ my_school: mySchool, tournaments: tournaments });
  } catch (err) {
    console.error("Student tournaments xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// O'quvchi uchun turnir setkasi (school bracket bilan bir xil, lekin user a'zoligi orqali)
app.get("/student/tournaments/:id/bracket", authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    const tid = req.params.id;

    // O'quvchi shu turnirda a'zomi?
    const memQ = await pool.query(
      "SELECT school, school_key FROM tournament_team_members WHERE tournament_id = $1 AND user_id = $2 LIMIT 1",
      [tid, uid]
    );
    if (memQ.rows.length === 0) return res.status(403).json({ error: "Siz bu turnir ishtirokchisi emassiz" });
    const mySchool = memQ.rows[0].school;
    const mySchoolKey = memQ.rows[0].school_key;

    const tr = await pool.query("SELECT * FROM tournaments WHERE id = $1", [tid]);
    if (tr.rows.length === 0) return res.status(404).json({ error: "Turnir topilmadi" });
    const t = tr.rows[0];

    const schoolsQ = await pool.query(
      "SELECT school, region, district, school_key, seed, avg_rating, eliminated, placement FROM tournament_schools WHERE tournament_id = $1 ORDER BY seed ASC",
      [tid]
    );
    const matchesQ = await pool.query(
      `SELECT id, round, match_no, school_a, school_b, school_a_key, school_b_key, score_a, score_b,
              winner_school, winner_school_key, status, scheduled_at
       FROM tournament_matches WHERE tournament_id = $1
       ORDER BY round ASC, match_no ASC`,
      [tid]
    );
    const rounds = {};
    matchesQ.rows.forEach(m => {
      if (!rounds[m.round]) rounds[m.round] = [];
      m.is_mine = (m.school_a_key === mySchoolKey || m.school_b_key === mySchoolKey);
      rounds[m.round].push(m);
    });

    res.json({
      tournament: { id: t.id, name: t.name, status: t.status, bracket_size: t.bracket_size, scope_value: t.scope_value, region: t.region },
      my_school: mySchool,
      my_school_key: mySchoolKey,
      schools: schoolsQ.rows,
      rounds: rounds,
      total_rounds: t.bracket_size ? Math.log2(t.bracket_size) : 0,
    });
  } catch (err) {
    console.error("Student bracket xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Match check-in holati: a'zolar, kim tayyor, match holati
app.get("/tournament/match/:id/checkin-state", authMiddleware, async (req, res) => {
  try {
    const matchId = req.params.id;
    const uid = req.user.id;

    // Match
    const mq = await pool.query(
      `SELECT m.*, t.name AS tournament_name, t.team_size, t.questions_per_match, t.seconds_per_match
       FROM tournament_matches m
       JOIN tournaments t ON t.id = m.tournament_id
       WHERE m.id = $1`,
      [matchId]
    );
    if (mq.rows.length === 0) return res.status(404).json({ error: "Match topilmadi" });
    const match = mq.rows[0];

    // Bu foydalanuvchi shu matchning a'zosimi?
    const me = await getMatchPlayer(matchId, uid);
    if (!me) return res.status(403).json({ error: "Siz bu matchning ishtirokchisi emassiz" });

    // Ikkala maktab a'zolari (checked_in holati bilan)
    const playersQ = await pool.query(
      `SELECT mp.user_id, mp.school, mp.school_key, mp.checked_in,
              u.first_name, u.last_name, u.profile_picture, u.rating,
              tm.member_role, tm.slot_order
       FROM tournament_match_players mp
       JOIN users u ON u.id = mp.user_id
       LEFT JOIN tournament_team_members tm
         ON tm.tournament_id = $2 AND tm.user_id = mp.user_id
       WHERE mp.match_id = $1
       ORDER BY mp.school_key ASC, tm.member_role DESC, tm.slot_order ASC`,
      [matchId, match.tournament_id]
    );

    // Maktablarga ajratamiz
    const teams = {};
    [[match.school_a_key, match.school_a], [match.school_b_key, match.school_b]].forEach(([key, name]) => {
      if (key) teams[key] = { school: name, members: [] };
    });
    playersQ.rows.forEach(p => {
      if (!teams[p.school_key]) teams[p.school_key] = { school: p.school, members: [] };
      teams[p.school_key].members.push({
        user_id: p.user_id,
        name: ((p.first_name || "") + " " + (p.last_name || "")).trim(),
        profile_picture: p.profile_picture,
        rating: p.rating,
        role: p.member_role || "starter",
        checked_in: p.checked_in,
        is_me: (p.user_id === uid),
      });
    });

    res.json({
      match: {
        id: match.id,
        status: match.status,
        school_a: match.school_a,
        school_b: match.school_b,
        school_a_key: match.school_a_key,
        school_b_key: match.school_b_key,
        scheduled_at: match.scheduled_at,
        tournament_name: match.tournament_name,
        questions_per_match: match.questions_per_match,
        seconds_per_match: match.seconds_per_match,
      },
      my_school: me.school,
      my_school_key: me.school_key,
      my_checked_in: me.checked_in,
      teams: teams,
    });
  } catch (err) {
    console.error("Checkin-state xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// "Tayyorman" — check-in qilish
app.post("/tournament/match/:id/checkin", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const matchId = req.params.id;
    const uid = req.user.id;

    await client.query("BEGIN");
    // Match qatori bloklanadi: parallel check-inlar jamoa limitini oshira olmaydi.
    const mq = await client.query(
      `SELECT m.status, t.team_size
       FROM tournament_matches m
       JOIN tournaments t ON t.id = m.tournament_id
       WHERE m.id = $1
       FOR UPDATE OF m`,
      [matchId]
    );
    if (mq.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Match topilmadi" });
    }
    const match = mq.rows[0];
    if (match.status !== "checkin") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Check-in hozir ochiq emas (holat: " + match.status + ")" });
    }

    const meQ = await client.query(
      `SELECT id, school_key, checked_in
       FROM tournament_match_players
       WHERE match_id = $1 AND user_id = $2`,
      [matchId, uid]
    );
    const me = meQ.rows[0];
    if (!me) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Siz bu matchning ishtirokchisi emassiz" });
    }
    if (me.checked_in) {
      await client.query("COMMIT");
      return res.json({ success: true, checked_in: true });
    }

    const readyQ = await client.query(
      `SELECT COUNT(*) AS c
       FROM tournament_match_players
       WHERE match_id = $1 AND school_key = $2 AND checked_in = true`,
      [matchId, me.school_key]
    );
    if ((parseInt(readyQ.rows[0].c, 10) || 0) >= match.team_size) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Jamoaning barcha jang o'rinlari band" });
    }

    // Check-in belgilash
    await client.query(
      "UPDATE tournament_match_players SET checked_in = true, checked_in_at = NOW() WHERE match_id = $1 AND user_id = $2",
      [matchId, uid]
    );
    await client.query("COMMIT");

    // Boshqa a'zolarga "kimdir tayyor bo'ldi" xabari (real-time yangilanish)
    notifyMatchPlayers(matchId, "checkinUpdate", { matchId: parseInt(matchId), userId: uid });

    res.json({ success: true, checked_in: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Checkin xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  } finally {
    client.release();
  }
});

// Jang holati + savollar (o'quvchi jang ekranida)
app.get("/tournament/match/:id/battle-state", authMiddleware, async (req, res) => {
  try {
    const matchId = req.params.id;
    const uid = req.user.id;

    // A'zomi?
    const me = await getMatchPlayer(matchId, uid);
    if (!me) return res.status(403).json({ error: "Siz bu matchning ishtirokchisi emassiz" });

    const mq = await pool.query(
      `SELECT m.*, t.name AS tournament_name, t.seconds_per_match, t.questions_per_match
       FROM tournament_matches m JOIN tournaments t ON t.id = m.tournament_id
       WHERE m.id = $1`,
      [matchId]
    );
    const match = mq.rows[0];
    if (!match) return res.status(404).json({ error: "Match topilmadi" });

    // Faqat live yoki done holatida savol beriladi
    if (match.status !== "live" && match.status !== "done") {
      return res.json({ status: match.status, message: "Jang hali boshlanmagan" });
    }

    // Savollar (correct_option ni olib tashlaymiz — xavfsizlik)
    let questions = [];
    if (match.questions_data) {
      const raw = typeof match.questions_data === "string" ? JSON.parse(match.questions_data) : match.questions_data;
      questions = raw.map(q => ({
        id: q.id,
        question_text: q.question_text,
        option_a: q.option_a, option_b: q.option_b,
        option_c: q.option_c, option_d: q.option_d,
      }));
    }

    // Mening hozirgi ballim va javob bergan savollarim
    const myProgress = await pool.query(
      "SELECT score, finished FROM tournament_match_players WHERE match_id = $1 AND user_id = $2",
      [matchId, uid]
    );
    const answeredQ = await pool.query(
      `SELECT question_id FROM tournament_match_answers
       WHERE match_id = $1 AND user_id = $2
       ORDER BY created_at ASC`,
      [matchId, uid]
    );

    // Real-time jamoa ballari
    const teamScores = await pool.query(
      `SELECT school_key, COALESCE(SUM(score),0) AS total
       FROM tournament_match_players WHERE match_id = $1 GROUP BY school_key`,
      [matchId]
    );
    const scores = {};
    teamScores.rows.forEach(r => { scores[r.school_key] = parseInt(r.total) || 0; });

    res.json({
      status: match.status,
      match: {
        id: match.id,
        school_a: match.school_a, school_b: match.school_b,
        school_a_key: match.school_a_key, school_b_key: match.school_b_key,
        tournament_name: match.tournament_name,
        seconds_per_match: match.seconds_per_match,
        started_at: match.started_at,
        winner_school: match.winner_school,
        winner_school_key: match.winner_school_key,
      },
      my_school: me.school,
      my_school_key: me.school_key,
      my_score: myProgress.rows[0] ? myProgress.rows[0].score : 0,
      my_finished: myProgress.rows[0] ? myProgress.rows[0].finished : false,
      answered_question_ids: answeredQ.rows.map((row) => row.question_id),
      questions: questions,
      team_scores: scores,
    });
  } catch (err) {
    console.error("Battle-state xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Jangda javob yuborish — ball hisoblash
app.post("/tournament/match/:id/answer", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const matchId = req.params.id;
    const uid = req.user.id;
    const { questionId, answer } = req.body; // answer: 'a'|'b'|'c'|'d'
    const normalizedAnswer = String(answer || "").toLowerCase();
    if (!["a", "b", "c", "d"].includes(normalizedAnswer)) {
      return res.status(400).json({ error: "Javob varianti noto'g'ri" });
    }

    await client.query("BEGIN");
    // Match qatorini bloklash javob va timeout bir vaqtda yakunlanishini oldini oladi.
    const mq = await client.query(
      `SELECT m.status, m.questions_data, m.started_at, t.seconds_per_match
       FROM tournament_matches m
       JOIN tournaments t ON t.id = m.tournament_id
       WHERE m.id = $1
       FOR UPDATE OF m`,
      [matchId]
    );
    const match = mq.rows[0];
    if (!match || match.status !== "live") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Jang faol emas" });
    }

    const meQ = await client.query(
      `SELECT id, checked_in, finished
       FROM tournament_match_players
       WHERE match_id = $1 AND user_id = $2`,
      [matchId, uid]
    );
    const me = meQ.rows[0];
    if (!me || !me.checked_in) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Siz bu matchning faol ishtirokchisi emassiz" });
    }
    if (me.finished) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Siz jangni allaqachon yakunlagansiz" });
    }

    const deadline = new Date(match.started_at).getTime() + Number(match.seconds_per_match) * 1000;
    if (!Number.isFinite(deadline) || Date.now() >= deadline) {
      await client.query("ROLLBACK");
      await expireTournamentMatch(matchId);
      return res.status(400).json({ error: "Jang vaqti tugagan" });
    }

    // To'g'ri javobni topamiz (questions_data dan)
    const raw = typeof match.questions_data === "string" ? JSON.parse(match.questions_data) : match.questions_data;
    const q = Array.isArray(raw) ? raw.find(x => String(x.id) === String(questionId)) : null;
    if (!q) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Savol topilmadi" });
    }

    const isCorrect = (normalizedAnswer === String(q.correct_option).toLowerCase());

    // UNIQUE indeks + ON CONFLICT parallel so'rovda ham faqat bitta javobni qabul qiladi.
    const inserted = await client.query(
      `INSERT INTO tournament_match_answers (match_id, user_id, question_id, answer, is_correct)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (match_id, user_id, question_id) DO NOTHING
       RETURNING id`,
      [matchId, uid, q.id, normalizedAnswer, isCorrect]
    );
    if (inserted.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Bu savolga allaqachon javob bergansiz" });
    }

    // To'g'ri bo'lsa, ballni oshiramiz
    if (isCorrect) {
      await client.query(
        "UPDATE tournament_match_players SET score = score + 1 WHERE match_id = $1 AND user_id = $2",
        [matchId, uid]
      );
    }

    // Yangilangan jamoa ballari
    const teamScores = await client.query(
      `SELECT school_key, COALESCE(SUM(score),0) AS total FROM tournament_match_players WHERE match_id = $1 GROUP BY school_key`,
      [matchId]
    );
    const scores = {};
    teamScores.rows.forEach(r => { scores[r.school_key] = parseInt(r.total) || 0; });
    await client.query("COMMIT");

    // Real-time: barcha o'yinchilarga yangi ballarni yuboramiz
    notifyMatchPlayers(matchId, "scoreUpdate", { matchId: parseInt(matchId), team_scores: scores });

    res.json({
      success: true,
      correct: isCorrect,
      correct_option: q.correct_option, // o'quvchi javob bergach to'g'risini ko'rsatamiz
      team_scores: scores,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Answer xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  } finally {
    client.release();
  }
});

// Jangni yakunlash (o'quvchi barcha savollarni tugatganda)
app.post("/tournament/match/:id/finish", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const matchId = req.params.id;
    const uid = req.user.id;
    await client.query("BEGIN");
    const matchQ = await client.query(
      `SELECT m.status, m.questions_data, m.started_at, t.seconds_per_match
       FROM tournament_matches m
       JOIN tournaments t ON t.id = m.tournament_id
       WHERE m.id = $1
       FOR UPDATE OF m`,
      [matchId]
    );
    const match = matchQ.rows[0];
    if (!match || match.status !== "live") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Jang faol emas" });
    }

    const meQ = await client.query(
      `SELECT checked_in, finished FROM tournament_match_players
       WHERE match_id = $1 AND user_id = $2`,
      [matchId, uid]
    );
    const me = meQ.rows[0];
    if (!me || !me.checked_in) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Faol ishtirokchi emassiz" });
    }
    if (me.finished) {
      await client.query("COMMIT");
      return res.json({ success: true, already_finished: true });
    }

    const questions = typeof match.questions_data === "string"
      ? JSON.parse(match.questions_data)
      : match.questions_data;
    const totalQuestions = Array.isArray(questions) ? questions.length : 0;
    const answeredQ = await client.query(
      `SELECT COUNT(*) AS c FROM tournament_match_answers
       WHERE match_id = $1 AND user_id = $2`,
      [matchId, uid]
    );
    const answeredCount = parseInt(answeredQ.rows[0].c, 10) || 0;
    const deadline = new Date(match.started_at).getTime() + Number(match.seconds_per_match) * 1000;
    const timedOut = !Number.isFinite(deadline) || Date.now() >= deadline;
    if (!timedOut && answeredCount < totalQuestions) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Avval barcha savollarga javob bering" });
    }

    await client.query(
      "UPDATE tournament_match_players SET finished = true, finished_at = NOW() WHERE match_id = $1 AND user_id = $2",
      [matchId, uid]
    );
    await client.query("COMMIT");

    // Hamma tugatdimi tekshiramiz → match natijasini hisoblaymiz
    if (timedOut) await expireTournamentMatch(matchId);
    else await checkMatchCompletion(matchId);

    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Finish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  } finally {
    client.release();
  }
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

// API xatolari har doim JSON bo'lib qaytadi; Multer default HTML sahifasi va
// ichki stack trace brauzerga chiqib ketmaydi.
app.use((err, req, res, next) => {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE"
      ? "Fayl hajmi ruxsat etilgan limitdan katta"
      : "Faylni yuklashda xato";
    return res.status(400).json({ error: message });
  }
  if (err.message && /fayl|format|rasm|image|pdf/i.test(err.message)) {
    return res.status(400).json({ error: err.message });
  }
  console.error("HTTP handler xatosi:", err && err.stack ? err.stack : err);
  return res.status(500).json({ error: "Server xatosi" });
});

// ===== CRASH HIMOYASI: server o'chib qolmasligi uchun =====
// Ushlanmagan xato yoki rad etilgan promise butun serverni o'chirib yuborishi mumkin.
// Bu hodisalarni ushlab, loglaymiz va serverni ishlatib turamiz (barcha o'yinchilar
// uzilib qolmasligi uchun). Production'da bu juda muhim.
process.on("uncaughtException", (err) => {
  console.error("‼️ USHLANMAGAN XATO (server ishlashda davom etadi):", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (reason) => {
  console.error("‼️ RAD ETILGAN PROMISE (server ishlashda davom etadi):", reason && reason.stack ? reason.stack : reason);
});

server.listen(PORT, async () => {
  console.log("Server ishga tushdi: http://localhost:3000");

  // PRODUCTION'da SMS kredensiali majburiy — OTP console'ga tushib qolmasin
  if (process.env.NODE_ENV === "production" && (!process.env.ESKIZ_EMAIL || !process.env.ESKIZ_PASSWORD)) {
    console.error("‼️ XAVFSIZLIK: NODE_ENV=production, lekin ESKIZ_EMAIL/ESKIZ_PASSWORD yo'q!");
    console.error("   OTP kodlar SMS o'rniga konsolga chiqadi — bu xavfli. Server to'xtatildi.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && (!process.env.PAYME_MERCHANT_ID || !process.env.PAYME_KEY)) {
    console.error("XAVFSIZLIK: production rejimida PAYME_MERCHANT_ID va PAYME_KEY majburiy.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_TOTP_SECRET)) {
    console.error("XAVFSIZLIK: production rejimida ADMIN_PASSWORD va ADMIN_TOTP_SECRET majburiy.");
    process.exit(1);
  }
  if (!process.env.ESKIZ_EMAIL || !process.env.ESKIZ_PASSWORD) {
    console.warn("⚠️  DIQQAT: SMS kredensiali yo'q — DEV rejim (OTP konsolga chiqadi). Production'da .env to'ldiring.");
  }

  await recoverActiveBattles();
});

// ============================================================================
// GRACEFUL SHUTDOWN — deploy/restart paytida toza to'xtash
// Oqim: yangi ulanishlarni to'xtatish → server.close() → pool.end() → exit.
// PM2/systemd/Docker SIGTERM yuboradi; Ctrl+C SIGINT yuboradi.
// Double-shutdown himoyasi: ikkinchi signal e'tiborsiz qoldiriladi.
// Timeout: agar 10s ichida yopilmasa — majburan chiqamiz (osilib qolmaslik).
// ============================================================================
const gracefulShutdown = createGracefulShutdownService({ server, pool });

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
