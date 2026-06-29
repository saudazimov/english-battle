# AI V1 — Stage 0,1,2 o'rnatish (Premium skeleton + AI poydevor + Snapshot)

Bu paket AI V1 (Parent Weekly Report) ning **poydevorini** quradi. AI'ning o'zi
keyingi bosqichda (Stage 3-4). Hozir: premium lock + AI jadvallar + real data snapshot.

---

## Yangi fayllar (loyihaga qo'shing)

```
migrations/004_subscriptions_and_ai.sql  ← subscriptions + ai_reports jadvallar
premium.js                                ← isPremium, requirePremium, grantSubscription
aiSnapshot.js                             ← student weekly snapshot (real data)
```

## `.env` ga qo'shing (keyingi stage uchun tayyorlab qo'ying)

```
AI_PROVIDER=openai            # yoki: anthropic
AI_REPORTS_ENABLED=true
# OPENAI_API_KEY=...          # Stage 3'da kerak bo'ladi
# ANTHROPIC_API_KEY=...       # agar anthropic tanlasangiz
```

---

## server.js — 3 ta qo'shimcha

### 1. Import (12-qator atrofida, `parentCode` import'idan keyin)

```js
const parentCode = require("./parentCode");
const premium = require("./premium");                    // ← YANGI
```

### 2. `GET /me/subscription` — foydalanuvchi o'z obunasini ko'radi

Istalgan mavjud `app.get(...)` yonига qo'shing (masalan `/streak/checkin` yaqiniga):

```js
// Foydalanuvchining joriy obunasi (frontend premium holatni bilishi uchun)
app.get("/me/subscription", authMiddleware, async (req, res) => {
  try {
    const plan = await premium.getUserPlan(req.user.id);
    res.json({
      is_premium: !!plan,
      plan: plan ? plan.plan : null,
      status: plan ? plan.status : "free",
      expires_at: plan ? plan.expires_at : null,
    });
  } catch (err) {
    console.error("Subscription holat xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});
```

### 3. `POST /dev/subscription/activate` — ADMIN-ONLY (payment o'rnига, test uchun)

```js
// DEV/ADMIN: obuna aktivlashtirish (payment hali yo'q — test uchun).
// Payme/Click qo'shilganda bu o'rniga payment callback ishlatiladi.
app.post("/dev/subscription/activate", requireAdmin, async (req, res) => {
  try {
    const { user_id, plan, days } = req.body;
    if (!user_id || !plan || !days) {
      return res.status(400).json({ error: "user_id, plan, days kerak" });
    }
    const sub = await premium.grantSubscription(parseInt(user_id), plan, parseInt(days));
    await logAudit(req, "subscription_granted", {
      entityType: "user", entityId: user_id,
      details: plan + " — " + days + " kun"
    });
    res.json({ success: true, subscription: sub });
  } catch (err) {
    console.error("Obuna aktivlashtirish xatosi:", err.message);
    res.status(400).json({ error: err.message });
  }
});
```

> **Eslatma:** Bu endpoint `requireAdmin` bilan himoyalangan — faqat admin token bilan
> chaqiriladi. Test paytida admin panel orqali yoki admin token bilan ishlatiladi.

---

## Ishlatish

```bash
node migrate.js          # 004 qo'llanadi (subscriptions + ai_reports)
node migrate.js status   # 004 ham "done" bo'lishi kerak
node server.js
```

---

## Test (Stage 0-2)

### 1. Migration qo'llandimi
`node migrate.js status` → `004_subscriptions_and_ai.sql ✅ done`

### 2. Obuna holati (har qanday foydalanuvchi)
`GET /me/subscription` (token bilan) → `{ is_premium: false, status: "free" }`

### 3. Admin obuna beradi
`POST /dev/subscription/activate` (admin token):
```json
{ "user_id": 6, "plan": "parent_premium", "days": 30 }
```
→ `{ success: true, subscription: {...} }`

### 4. Endi premium ko'rinadi
`GET /me/subscription` (o'sha user) → `{ is_premium: true, plan: "parent_premium" }`

### 5. Muddat uzaytirish
Yana `activate` chaqiring (o'sha user+plan) → `expires_at` uzayadi (yangi qator emas).

---

## Nima tayyor bo'ladi

| Komponent | Holat |
|-----------|-------|
| subscriptions jadvali | ✅ |
| ai_reports + feedback + usage_logs jadvallar | ✅ |
| isPremium / requirePremium / grantSubscription | ✅ |
| Muddati o'tgan obuna → avtomatik expired (expires_at sharti) | ✅ |
| Student weekly snapshot (real data, fake yo'q) | ✅ |
| Data quality gate (30 javob / 2 assignment / 1 exam) | ✅ |
| Maxfiylik (opponent/chat/sinfdosh snapshot'da YO'Q) | ✅ |

## Test natijalari (sof mantiq)
- premium.js + aiSnapshot.js sintaksis: ✅
- Plan guruh izolyatsiyasi (parent ≠ student premium): ✅
- Hafta hisoblash (dushanba→yakshanba, 7 kun): ✅

---

## Keyingi: Stage 3-4
- `aiService.js` — OpenAI/Anthropic chaqiruvi + strict JSON + safe fallback
- `POST /ai/reports/parent/children/:studentId/weekly` — to'liq endpoint (guard + cache + snapshot + AI)