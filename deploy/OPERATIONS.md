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

Kunlik job `npm run backup:offsite` orqali database dump va ikkala upload rootni bitta
run bundle'ga yig'adi. Remote faqat `rclone crypt` turi bo'lishi mumkin. Remote upload
`rclone check` va remote listingdagi `SUCCESS.json` bilan tasdiqlanmaguncha retention hamda
`.offsite-backup-last-success.json` yangilanishi bajarilmaydi. Retention faqat qat'iy
run ID va success markeriga ega, 14 kundan eski nusxalarni o'chiradi. OS `flock` va
runner lock fayli parallel runlarni rad etadi.

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

Socket.IO operational yozuvlari structured logda `message=socket_metric` va `component=socket.io` bilan chiqadi. Monitoring collector quyidagi nomlarni counter yoki gauge sifatida ajratadi:

- `socket_auth_accepted_total` va `socket_auth_rejected_total`: namespace authentication natijalari;
- `socket_handshake_errors_total`: Engine.IO transport handshake xatolari;
- `socket_connections_total`, `socket_disconnects_total` va `socket_connections_active`: ulanish lifecycle ko'rsatkichlari;
- `socket_errors_total`: authenticated socket xatolari.

Counterlar process-local bo'lib, PM2 restartda noldan boshlanadi; tashqi monitoring delta hisoblashda resetni yangi baseline sifatida qabul qiladi. Handshake success SLI `socket_auth_accepted_total / (socket_auth_accepted_total + socket_auth_rejected_total + socket_handshake_errors_total)` asosida hisoblanadi. `socket_connections_active` gauge hisoblanadi va counter kabi jamlanmaydi. Ushbu metric contextlari socket/user ID, token, payload yoki error message saqlamaydi.

Repositorydagi `deploy/monitoring/prometheus.yml` private `/internal/metrics` endpointni
faqat `127.0.0.1:3000` orqali scrape qiladi va Bearer tokenni permissionli
`/etc/prometheus/secrets/ilm-liga-metrics-token` faylidan oladi. Alert qoidalari
`deploy/monitoring/ilm-liga-alerts.yml`da; o'rnatish va token rotation tartibi
`deploy/monitoring/README.md`da. Prometheus va Alertmanager web portlari faqat loopback
interfeysida qoladi. Notification receiver va tashqi uptime provider repositorydan
tashqarida sozlanadi.

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
curl --fail https://ilmliga.uz/health
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

Har oy kamida bitta yakunlangan off-site run encrypted remote'dan qayta yuklanib,
database va uploadlar bitta integratsiyalangan drill orqali tekshiriladi. Aniq run ID'ni
`.offsite-backup-last-success.json`dan oling; `latest` kabi noaniq qiymat qabul qilinmaydi.

```bash
RUN_ID=2026-08-04T03-00-00-000Z
RESTORE_DB=english_battle_restore_test
RESTORE_UPLOADS=/var/tmp/ilm-liga-uploads-restore-test
sudo -u postgres createdb -O eb_user "$RESTORE_DB"
npm run backup:offsite:restore-drill -- \
  --run-id "$RUN_ID" \
  --target-db "$RESTORE_DB" \
  --confirm-target-db "$RESTORE_DB" \
  --upload-target "$RESTORE_UPLOADS" \
  --confirm-upload-target "$RESTORE_UPLOADS"
```

Runner remote turi `rclone crypt` ekanini va run `SUCCESS.json` bilan yakunlanganini
tekshiradi. Yuklangan bundle `rclone check`, PostgreSQL `PGDMP`/`pg_restore --list` va
upload SHA-256 manifestidan o'tmaguncha hech qanday restore boshlanmaydi. Database faqat
`_restore_test` targetga `--single-transaction` bilan, uploadlar esa jonli kataloglardan
tashqaridagi `restore-test` papkaga tiklanadi. Vaqtinchalik remote download muvaffaqiyat
yoki xatodan keyin o'chiriladi; restore database va upload target operator tekshiruvi
uchun saqlanadi.

Natijadagi `durationMs` qiymatini drill jurnaliga yozing va RTO 4 soatdan oshmaganini
tasdiqlang. `schema_migrations`, foydalanuvchi/jang/to'lov jadvallarining kutilgan countlari,
tasodifiy upload fayllari va Payme reconciliation alohida tekshiriladi. Tekshiruvdan so'ng
aniq restore database va upload targetni operator qo'lda o'chiradi; production targetga
restore yoki `pg_restore --clean` qat'iyan bajarilmaydi.

Individual component drilllari diagnostika uchun saqlanadi:

```bash
sudo -u postgres createdb -O eb_user english_battle_restore_test
npm run db:backup:verify -- --file BACKUP_FILE.dump
npm run db:restore:drill -- --file BACKUP_FILE.dump --target-db english_battle_restore_test --confirm-target english_battle_restore_test
sudo -u postgres dropdb english_battle_restore_test
```

Runner faqat `_restore_test` nomli, production bazadan boshqa targetni qabul qiladi va `--confirm-target` aynan teng bo'lishini talab qiladi. U avval `PGDMP` header va `pg_restore --list` bilan arxivni, restore'dan keyin esa `schema_migrations` jadvalini tekshiradi; restore `--single-transaction` bilan bajariladi. Target database oldindan bo'sh holda yaratilishi kerak. Production databasega `pg_restore --clean` ishlatmang.

Upload snapshotini ham alohida vaqtinchalik papkaga tiklab tekshiring:

```bash
npm run uploads:backup:verify -- --snapshot UPLOAD_SNAPSHOT_DIRECTORY
npm run uploads:restore:drill -- --snapshot UPLOAD_SNAPSHOT_DIRECTORY --target /tmp/ilm-liga-uploads-restore-test --confirm-target /tmp/ilm-liga-uploads-restore-test
```

Runner `public/uploads/` va `uploads/resources/` uchun SHA-256 manifestni tekshiradi, symlink/path traversal'ni rad etadi va jonli upload papkalariga restore qilishga ruxsat bermaydi.

### Secret sizishi gumoni

1. SEV-1 e'lon qiling va sizgan secretni log/chatga qayta joylamang.
2. Tegishli JWT, DB, admin, SMS yoki Payme credentialini provider tomonda rotate/revoke qiling.
3. JWT sizgan bo'lsa faol sessiyalarni bekor qilish tartibini qo'llang.
4. Audit log va provider loglaridan ta'sir oralig'ini aniqlang.
5. Yangi secret bilan production preflight, health va critical flowlarni tekshiring.

## 8. Log va maxfiylik qoidalari

Quyidagilar hech qachon loglanmaydi: parol, OTP, JWT, `Authorization`/`Cookie` headerlari, to'liq telefon raqami, database paroli, pepper, admin TOTP secret va provider API keylari. Xatolar secret qiymatni emas, faqat env nomi yoki request ID'ni ko'rsatadi.

Production serverdagi PM2 app va module loglari `pm2-logrotate` orqali har kuni yoki fayl `50M` ga yetganda aylantiriladi, gzip bilan siqiladi va joriy fayldan tashqari 14 ta aylantirilgan arxiv saqlanadi. `retain=14` calendar-day kafolati emas, arxivlar sonidir; max-size rotation bir kunda bir necha marta ishlasa qamrab olingan vaqt qisqaradi. Calendar-day bo'yicha qat'iy retention, qidiruv va server yo'qolishiga chidamlilik tashqi markaziy log providerda sozlanadi. Loglarga faqat operations roli kira oladi. Incident uchun kerakli audit loglar o'chirilishdan himoyalanadi.

Har HTTP response'dagi `X-Request-ID` incident correlation uchun ishlatiladi. Support xabarida request ID so'ralishi mumkin, lekin request ID autentifikatsiya yoki ruxsat sifatida qabul qilinmaydi.

## 9. Production gate

Quyidagilarning barchasi bajarilmaguncha bu operations bandi production-ready hisoblanmaydi:

- monitoring provider va ikki on-call egasi tayinlangan;
- tashqi `/health` va `/ready` alertlari amalda sinovdan o'tgan;
- off-site database va upload backup muvaffaqiyatli;
- restore drill RTO ichida muvaffaqiyatli bajarilgan;
- PM2 crash, DB down va disk alertlari test notification yuborgan;
- private Prometheus target `up=1`, alert rulelar valid va Alertmanager receiver test notification yuborgan;
- incident aloqa kanali va rollback vakolati tasdiqlangan.

Joriy codebase monitoring provider, real off-site targetdagi birinchi muvaffaqiyatli
run yoki on-call kontakt yaratilganini tasdiqlay olmaydi. Ular production
infratuzilmasida alohida tekshirilishi shart.
