# IlmLiga Production Operations Contract

Ushbu hujjat closed-beta production muhiti uchun o'lchanadigan ishonchlilik maqsadlari, monitoring, backup/recovery va incident tartibini belgilaydi. Bu maqsadlar real monitoring natijalari asosida har oy qayta ko'rib chiqiladi.

## 1. Xizmat chegarasi va mas'uliyat

Production xizmatiga Nginx, Node.js/PM2, PostgreSQL, Socket.IO, upload diski, SMS va to'lov providerlari kiradi. Providerning o'zidagi uzilish alohida qayd etiladi, ammo foydalanuvchiga ta'sir qilsa incident sifatida boshqariladi.

Productiondan oldin quyidagi qiymatlar private operations tizimida to'ldirilishi shart:

- `PRIMARY_ON_CALL`: asosiy javobgar va aloqa kanali
- `SECONDARY_ON_CALL`: zaxira javobgar va aloqa kanali
- `STATUS_CHANNEL`: foydalanuvchiga holat xabari beriladigan kanal
- `MONITORING_PROVIDER`: uptime/metrics/alert platformasi
- `OFFSITE_BACKUP_TARGET`: VPSdan tashqaridagi shifrlangan backup manzili

Shaxsiy telefon, email yoki secretlarni repositoryga yozmang.

## 2. SLI va SLO

Hisoblash oynasi kalendar oyidir. Rejalashtirilgan deploy ham foydalanuvchiga ta'sir qilsa error budgetga kiradi.

| Ko'rsatkich | SLI hisoblash | Closed-beta SLO |
|---|---|---|
| Availability | Tashqi probe'da `/health` va `/ready` ikkalasi ham 200 qaytargan daqiqalar / jami daqiqalar | kamida 99.5% |
| API success | Valid so'rovlardagi 2xx/3xx javoblar / 2xx/3xx/5xx javoblar; 4xx chiqarib tashlanadi | kamida 99.0% |
| API latency | Upload, AI va uzoq Socket.IO ulanishlaridan tashqari API javob vaqti | p95 500 ms dan kam |
| Socket.IO handshake | Muvaffaqiyatli ulanishlar / barcha handshake urinishlari | kamida 99.0% |

99.5% availability 30 kunlik oyda ko'pi bilan **216 daqiqa (3 soat 36 daqiqa)** error budget beradi. Budgetning 50% sarflansa riskli release'lar muzlatiladi; 100% sarflansa reliability ishlari yangi featurelardan ustun bo'ladi.

## 3. RPO va RTO

- **RPO: 24 soat.** Oxirgi tasdiqlangan database va upload backupidan keyingi ko'pi bilan 24 soatlik ma'lumot yo'qolishi mumkin.
- **RTO: 4 soat.** SEV-1 e'lon qilinganidan keyin asosiy xizmat 4 soat ichida tiklanishi kerak.
- Har deploydan oldin alohida database backup olinadi.
- Kunlik PostgreSQL backup va `public/uploads/` hamda `uploads/resources/` nusxasi VPSdan tashqaridagi shifrlangan storage'ga ko'chiriladi.
- Kunlik nusxalar kamida 14 kun saqlanadi.
- Restore drill har oy alohida database va alohida vaqtinchalik upload papkasida o'tkaziladi.
- Restore'dan keyin Payme holatlari provider ma'lumotlari bilan reconciliation qilinadi; to'lov yozuvlari taxmin bilan tiklanmaydi.

Restore bajarilgani sana, backup identifikatori, davomiylik, tekshirgan shaxs va natija bilan operations jurnalida qayd qilinadi.

## 4. Majburiy monitoring

Production trafik berilishidan oldin quyidagilar alert tizimiga ulangan bo'lishi shart:

1. Tashqi HTTPS probe: `/health` va `/ready`, har 60 soniyada.
2. Nginx: 5xx ulushi, request soni va p95 latency.
3. PM2: process holati, restart soni va uptime.
4. Host: CPU, RAM, load average va disk hajmi.
5. PostgreSQL: readiness, connection soni va sekin querylar.
6. Socket.IO: handshake urinishlari, muvaffaqiyatsizlik va faol ulanishlar.
7. Backup: oxirgi muvaffaqiyatli off-site backup va restore drill sanasi.
8. Providerlar: SMS yuborish va Payme callback xatolari.

Monitoring faqat PM2 local loglariga bog'lanmasligi kerak: VPS ishlamay qolsa alert tashqi tizimdan kelishi zarur.

Productiondagi `uncaughtException` yoki `unhandledRejection` processni ishonchsiz holatda davom ettirmaydi: yangi ulanishlar to'xtatiladi, database pool yopiladi, process `exit 1` bilan tugaydi va PM2 uni qayta ishga tushiradi. Takroriy fatal event alohida ikkinchi shutdown boshlamaydi.

## 5. Alert va incident darajalari

### SEV-1 — kritik

Quyidagilardan biri yuz bersa darhol:

- `/health` yoki `/ready` ketma-ket 3 daqiqa ishlamasa;
- 5xx ulushi 5 daqiqa davomida 10% dan oshsa;
- ma'lumot yo'qolishi, noqonuniy kirish yoki secret sizishi gumoni bo'lsa;
- login barcha foydalanuvchilar uchun ishlamasa yoki to'lovlar noto'g'ri qayd qilinsa.

Acknowledgement: 10 daqiqa. Status yangilanishi: kamida har 30 daqiqa.

### SEV-2 — yuqori

- 5xx ulushi 15 daqiqa davomida 2% dan oshsa;
- API p95 15 daqiqa davomida 1.5 soniyadan oshsa;
- RAM 15 daqiqa davomida 85% dan, disk 80% dan oshsa;
- oxirgi muvaffaqiyatli off-site backup 26 soatdan eski bo'lsa;
- Socket.IO handshake muvaffaqiyati 15 daqiqada 95% dan past bo'lsa.

Acknowledgement: 30 daqiqa. Status yangilanishi: kamida har 60 daqiqa.

### SEV-3 — past

Bitta foydalanuvchi yoki cheklangan no-critical funksiya muammosi. Bir ish kuni ichida triage qilinadi va odatiy release jarayonida tuzatiladi.

## 6. Incident tartibi

1. Incident commander tayinlanadi, vaqt va severity yoziladi.
2. Ta'sir doirasi aniqlanadi; loglarda secret yoki shaxsiy ma'lumot ulashilmaydi.
3. Eng xavfsiz mitigation tanlanadi: trafikni to'xtatish, provider funksiyasini o'chirish, restart yoki oldingi commitga rollback.
4. `/health`, `/ready`, login va tegishli critical flow tekshiriladi.
5. Foydalanuvchiga `STATUS_CHANNEL` orqali faktlar va keyingi yangilanish vaqti beriladi.
6. Tiklangach kamida 30 daqiqa kuzatiladi.
7. SEV-1/SEV-2 uchun 2 ish kuni ichida aybdor izlamaydigan postmortem yoziladi: timeline, root cause, impact va egasi/muddati bor action itemlar.

## 7. Runbooklar

### Ilova ishlamayapti

```bash
curl --fail https://englishbattle.uz/health
ssh PRODUCTION_HOST
cd /var/www/englishbattle
pm2 status
pm2 logs english-battle --lines 200
npm run config:check:production
df -h
free -m
pm2 restart deploy/ecosystem.config.js --update-env
curl --fail http://127.0.0.1:3000/health
curl --fail http://127.0.0.1:3000/ready
```

Sabab aniqlanmasa yoki yangi release bilan bog'liq bo'lsa `deploy/deploy.md` rollback bo'limini bajaring.

### Readiness ishlamayapti

```bash
sudo systemctl status postgresql
pg_isready -h localhost -p 5432 -d english_battle -U eb_user
pm2 logs english-battle --lines 200
```

Databasega yozuvchi trafikni tiklashdan oldin disk, connection limit va so'nggi migration holatini tekshiring. Noma'lum SQL'ni productionda sinamang.

### Oylik restore drill

```bash
sudo -u postgres createdb -O eb_user english_battle_restore_test
pg_restore -U eb_user -h localhost --no-owner --dbname english_battle_restore_test BACKUP_FILE.dump
psql -U eb_user -h localhost -d english_battle_restore_test -c "SELECT COUNT(*) FROM schema_migrations;"
sudo -u postgres dropdb english_battle_restore_test
```

Restore test database nomini buyruqdan oldin yana tekshiring. Production databasega `pg_restore --clean` ishlatmang. Upload backupini ham alohida vaqtinchalik papkaga ochib, fayl soni va o'qilishini tekshiring.

### Secret sizishi gumoni

1. SEV-1 e'lon qiling va sizgan secretni log/chatga qayta joylamang.
2. Tegishli JWT, DB, admin, SMS yoki Payme credentialini provider tomonda rotate/revoke qiling.
3. JWT sizgan bo'lsa faol sessiyalarni bekor qilish tartibini qo'llang.
4. Audit log va provider loglaridan ta'sir oralig'ini aniqlang.
5. Yangi secret bilan production preflight, health va critical flowlarni tekshiring.

## 8. Log va maxfiylik qoidalari

Quyidagilar hech qachon loglanmaydi: parol, OTP, JWT, `Authorization`/`Cookie` headerlari, to'liq telefon raqami, database paroli, pepper, admin TOTP secret va provider API keylari. Xatolar secret qiymatni emas, faqat env nomi yoki request ID'ni ko'rsatadi.

Production loglari uchun rotation va retention belgilanadi; faqat operations roli kira oladi. Incident uchun kerakli audit loglar o'chirilishdan himoyalanadi.

Har HTTP response'dagi `X-Request-ID` incident correlation uchun ishlatiladi. Support xabarida request ID so'ralishi mumkin, lekin request ID autentifikatsiya yoki ruxsat sifatida qabul qilinmaydi.

## 9. Production gate

Quyidagilarning barchasi bajarilmaguncha bu operations bandi production-ready hisoblanmaydi:

- monitoring provider va ikki on-call egasi tayinlangan;
- tashqi `/health` va `/ready` alertlari amalda sinovdan o'tgan;
- off-site database va upload backup muvaffaqiyatli;
- restore drill RTO ichida muvaffaqiyatli bajarilgan;
- PM2 crash, DB down va disk alertlari test notification yuborgan;
- incident aloqa kanali va rollback vakolati tasdiqlangan.

Joriy codebase monitoring provider, off-site backup yoki on-call kontakt yaratilganini tasdiqlay olmaydi. Ular production infratuzilmasida alohida tekshirilishi shart.
