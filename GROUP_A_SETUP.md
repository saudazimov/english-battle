# Guruh A — Deploy poydevori (Migration + Restart Recovery)

Bu paket audit'dagi **2 ta eng katta riskni** yopadi:
- **Risk #1:** Migration tizimi yo'q → yangi serverda DB kodga mos kelmaydi
- **Risk #2:** Restartda janglar yo'qoladi → o'yinchilar ovorada qoladi

---

## Yangi fayllar (loyihaga qo'shing)

```
migrate.js                          ← migration runner (versiyalangan, idempotent)
migrations/001_baseline.sql         ← to'liq schema (kodga mos: telefon, role, country)
migrations/002_fix_legacy_users.sql ← eski bazani tuzatish (role/country/email)
battleRecovery.js                   ← restart'da grace-finish
setup-db.js                         ← YANGILANGAN (endi migration ishlatadi)
```

---

## server.js — 2 ta kichik o'zgarish

### 1-o'zgarish: import qatoriga `recoverActiveBattles` qo'shing

**Qator 10** (`battleStore` import'idan keyin) — yangi qator qo'shing:

```js
const { saveBattleSession, loadBattleSession, finishBattleSession, loadActiveSessions } = require("./battleStore");
const { recoverActiveBattles } = require("./battleRecovery");   // ← YANGI QATOR
```

### 2-o'zgarish: bootda recovery'ni chaqiring

**Qator 8519** (`server.listen`) — `console.log`'dan keyin recovery qo'shing:

```js
server.listen(PORT, async () => {
  console.log("Server ishga tushdi: http://localhost:3000");
  await recoverActiveBattles();   // ← YANGI: yarim qolgan janglarni adolatli yakunlaydi
});
```

> Hammasi shu. `loadActiveSessions` allaqachon import qilingan edi — endi ishlatiladi.

---

## Ishlatish

```bash
# Birinchi marta yoki har deploy'da:
node migrate.js

# Holatni ko'rish (qaysi migration bajarilgan):
node migrate.js status

# Eski usul ham ishlaydi (endi migration chaqiradi):
node setup-db.js
```

`package.json` ga qulaylik uchun (ixtiyoriy):
```json
"scripts": {
  "migrate": "node migrate.js",
  "migrate:status": "node migrate.js status",
  "start": "node migrate.js && node server.js"
}
```
Bu bilan `npm start` har safar avval migration'larni qo'llab, keyin serverni ishga tushiradi — deploy xavfsiz bo'ladi.

---

## Nima kafolatlanadi

**Migration tizimi:**
- Har migration FAQAT bir marta bajariladi (`schema_migrations` jadvali kuzatadi)
- Transaction ichida — yarim bajarilib qolmaydi (xato bo'lsa rollback)
- Idempotent — qayta ishga tushirsangiz buzilmaydi (`IF NOT EXISTS`)
- Bajarilgan migration o'zgartirilsa — ogohlantiradi (checksum)
- Yangi muhitda toza ishlaydi, eski bazada esa faqat yetishmaganini qo'shadi

**Restart recovery (grace finish):**
- Yarim qolgan jang HAQIQIY javoblar (`battle_answers`) asosida adolatli yakunlanadi
- **Idempotent** — server qayta-qayta restart bo'lsa ham rating IKKI MARTA o'zgarmaydi (`battle_history.room_id` tekshiriladi)
- Botli 1v1 va jamoa janglar — rating teginmasdan yopiladi (hech kim zarar ko'rmaydi)
- Casual janglar — rating o'zgarmaydi
- O'yinchi qaytganda natijani ko'radi (mavjud `recentlyFinished` orqali)

---

## Test natijalari

Mantiqiy testlar (DB'siz, sof funksiya):
- Outcome/rating/XP hisoblash: **8/8 ✅**
- Real o'yinchi / bot / jamoa klassifikatsiya: **4/4 ✅**

> Postgres konteynerda mavjud emas (tarmoq o'chiq), shuning uchun SQL'ni jonli bazada
> sinash sizning muhitingizda kerak. Avval **test/staging bazada** `node migrate.js`
> ni ishga tushiring, `node migrate.js status` bilan tekshiring, keyin productionga o'ting.