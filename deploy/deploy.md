# IlmLiga — VPS Deployment Qo'llanmasi (Single-Instance, Closed Beta)

Ubuntu 22.04/24.04 VPS uchun. Same-origin monolit: frontend + API + Socket.IO bitta Node service'da. Redis YO'Q (single-instance).

Production monitoring, SLO, backup/restore va incident talablari: [`deploy/OPERATIONS.md`](./OPERATIONS.md).

---

## 0. Talablar
- Ubuntu VPS (staging uchun kamida 2 vCPU / 4 GB RAM / 50 GB SSD;
  closed-beta production uchun 4 vCPU / 8 GB RAM / 80 GB SSD tavsiya)
- Domen (ilmliga.uz) → VPS IP'ga yo'naltirilgan (A record)
- SSH kirish

---

## 1. Tizim paketlari

```bash
sudo apt update && sudo apt upgrade -y
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
# PostgreSQL, Nginx, sertifikat vositasi
sudo apt install -y postgresql postgresql-contrib nginx certbot python3-certbot-nginx git
# PM2 (global)
sudo npm install -g pm2
```

---

## 2. PostgreSQL sozlash

```bash
sudo -u postgres psql
```

psql ichida (KUCHLI parol qo'ying — 'saud' kabi zaif emas):

```sql
CREATE DATABASE english_battle;
CREATE USER eb_user WITH ENCRYPTED PASSWORD 'BU_YERGA_KUCHLI_PAROL';
GRANT ALL PRIVILEGES ON DATABASE english_battle TO eb_user;
\c english_battle
GRANT ALL ON SCHEMA public TO eb_user;
\q
```

Local PostgreSQL (o'sha VPS'da) SSL talab qilmaydi → `.env`da `DB_SSL=false`.

---

## 3. Kodni joylash

```bash
sudo mkdir -p /var/www/englishbattle
sudo chown $USER:$USER /var/www/englishbattle
cd /var/www/englishbattle
git clone <SIZNING_REPO_URL> .
# yoki fayllarni scp bilan yuklang

# MUHIM: papka strukturasini tekshiring
ls public/ | head        # HTML/CSS/JS shu yerda BO'LISHI KERAK
ls migrations/*.sql | sort  # barcha versiyalangan migrationlar ko'rinishi kerak
```

Agar `public/` yoki `migrations/` yo'q bo'lsa — deploy ishlamaydi (server.js va migrate.js ularni kutadi).

```bash
npm ci --omit=dev    # production dependencies (lockfile'dan)
```

---

## 4. Environment (.env)

```bash
cp .env.example .env
nano .env
```

To'ldiring (production validator uchun MAJBURIY):
- `NODE_ENV=production`
- `TRUST_PROXY_HOPS=1`  (Nginx ortida)
- `CLIENT_ORIGIN=https://ilmliga.uz,https://www.ilmliga.uz` (faqat haqiqiy HTTPS originlar)
- `METRICS_TOKEN=` (private Prometheus collector uchun alohida, kamida 32 belgili secret)
- `DB_HOST=localhost`, `DB_PORT=5432`, `DB_USER=eb_user`, `DB_PASSWORD=...`, `DB_NAME=english_battle`
- `DB_SSL=false`  (local PostgreSQL)
- `JWT_SECRET=` (kamida 32 belgi)
- `PARENT_CODE_PEPPER=`, `SCHOOL_INVITE_PEPPER=` (har biri kamida 32 belgi)
- `ADMIN_PASSWORD=` (kamida 12 belgi), `ADMIN_TOTP_SECRET=` (kamida 16 belgili Base32)
- `ESKIZ_EMAIL=`, `ESKIZ_PASSWORD=`  (Eskiz.uz production hisobi)
- `ESKIZ_FROM=`  (tasdiqlangan sender nomi)
- `PAYME_MERCHANT_ID=`, `PAYME_KEY=` (Payme production hisobi)

JWT va pepperlarni alohida yarating; bir qiymatni qayta ishlatmang:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

AI ixtiyoriy. `AI_REPORTS_ENABLED=true` bo'lsa, tanlangan `AI_PROVIDER` uchun API key va model majburiy.

Server yoki migratsiyani boshlashdan oldin konfiguratsiyani tekshiring. Buyruq secret qiymatlarni chiqarmaydi:

```bash
npm run config:check:production
```

---

## 5. Upload papkasi permissions

server.js startda `public/uploads/` va private `uploads/resources/` papkalarini yaratadi, lekin permission'ni ta'minlang:

```bash
mkdir -p public/uploads uploads/resources logs
# Node jarayoni yozа olishi uchun (PM2 sizning user'ingizda ishlaydi)
chmod -R 755 public/uploads uploads/resources logs
```

MUHIM: VPS local disk PERSISTENT — restart'da fayllar YO'QOLMAYDI (Render/Railway'dan farqli). Shuning uchun bu deploy'da S3/R2 SHART EMAS. Lekin backup oling (7-qadam).

---

## 6. Database migratsiya

```bash
node migrate.js status   # qaysi migratsiyalar kutilmoqda
node migrate.js          # barcha kutilayotgan migrationlarni qo'llaydi
node migrate.js status   # yakuniy holatni qayta tekshiradi
```

Migrationlar sonini hardcode qilmang: repositorydagi barcha `.sql` fayllar `done` bo'lishi kerak. Migrationdan oldin 10-bo'limdagi backupni oling. Xato bo'lsa PM2'ni ishga tushirmang.

---

## 7. PM2 bilan ishga tushirish

```bash
mkdir -p logs

# PM2 app va module loglarini disk to'lib qolishidan himoyalang.
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:workerInterval 30
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
pm2 set pm2-logrotate:rotateModule true
pm2 set pm2-logrotate:TZ Etc/UTC

pm2 start deploy/ecosystem.config.js
pm2 startup              # chiqqan buyruqni copy-paste qilib bajaring (bootga ulaydi)
pm2 save                 # joriy holatni saqlaydi

pm2 conf                 # pm2-logrotate qiymatlarini tekshiring
pm2 status               # ishlayaptimi
pm2 logs english-battle  # loglar
```

Bu local siyosat logni har kuni yoki fayl `50M` ga yetganda aylantiradi, eski loglarni gzip bilan siqadi va joriy fayldan tashqari 14 ta aylantirilgan arxivni saqlaydi. `retain=14` kun soni emas, arxivlar sonidir: bir kunda bir necha marta size rotation ishlasa, real vaqt oralig'i 14 kundan qisqa bo'lishi mumkin. Calendar-day bo'yicha qat'iy retention va qidiruv uchun loglarni tashqi markaziy log providerga yuboring.

Tekshiring (localdan):
```bash
curl http://127.0.0.1:3000/health   # {"status":"ok",...}
curl http://127.0.0.1:3000/ready    # {"status":"ready"} (DB ulangan bo'lsa)
```

Ikkala endpoint ham `200` qaytarmaguncha Nginx orqali trafik bermang. `instances=1` va `fork` rejimida `pm2 restart` qisqa uzilish keltirishi mumkin; bu profil zero-downtime cluster emas.

Private Socket.IO metrics collector va alert qoidalarini
[`deploy/monitoring/README.md`](./monitoring/README.md) bo'yicha o'rnating. Prometheus
hamda Alertmanager faqat loopback interfeysida tinglashi, token esa permissionli secret
fayldan o'qilishi shart.

---

## 8. Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/englishbattle
# server_name'ni o'z domeningizga o'zgartiring:
sudo nano /etc/nginx/sites-available/englishbattle

sudo ln -s /etc/nginx/sites-available/englishbattle /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # default'ni o'chiring
sudo nginx -t            # config to'g'ri ekanini tekshiring
sudo systemctl reload nginx
```

Tekshiring (brauzerdan): `http://ilmliga.uz` → sayt ochilishi kerak.

---

## 9. SSL (HTTPS) — Let's Encrypt

```bash
sudo certbot --nginx -d ilmliga.uz -d www.ilmliga.uz
```

Certbot avtomatik: sertifikat oladi, Nginx config'ni HTTPS'ga yangilaydi, HTTP→HTTPS redirect qo'shadi. Avtomatik yangilanish cron o'rnatiladi.

Tekshiring: `https://ilmliga.uz` → yashil qulf.

MUHIM: SSL yoqilgach, Socket.IO avtomatik `wss://` (secure WebSocket) ishlatadi — frontend `io()` same-origin bo'lgani uchun kod o'zgarmaydi.

---

## 10. Shifrlangan off-site backup (kunlik)

`rclone` o'rnating va provider remote ustida alohida `crypt` remote yarating. Ilova
faqat `rclone listremotes --long` natijasida turi `crypt` bo'lgan remote'ni qabul qiladi.
Provider va crypt credentiallari faqat VPSdagi cheklangan `rclone.conf`da saqlanadi;
repository yoki `.env`ga yozilmaydi.

`.env`da quyidagilarni to'ldiring:

```dotenv
OFFSITE_BACKUP_REMOTE=encrypted-backup:ilm-liga/production
OFFSITE_BACKUP_LOCAL_DIR=/var/backups/ilm-liga/offsite
OFFSITE_BACKUP_RETENTION_DAYS=14
```

Remote path faqat IlmLiga production backupiga ajratilgan bo'lishi shart. Provider
bucket rootini bermang: retention faqat shu scoped path ichida ishlaydi.

```bash
sudo install -d -o "$USER" -g "$USER" -m 0700 /var/backups/ilm-liga/offsite
rclone listremotes --long
npm run backup:offsite
cat /var/backups/ilm-liga/offsite/.offsite-backup-last-success.json
crontab -e
```

Qo'shing (har kuni 03:00). OS `flock` va runnerning ichki lock fayli parallel runni
ikki qatlamda rad etadi:

```
0 3 * * * cd /var/www/englishbattle && /usr/bin/flock -n /var/lock/ilm-liga-offsite-backup.lock /usr/bin/npm run backup:offsite >> /var/log/ilm-liga-offsite-backup.log 2>&1
```

Runner mavjud database va upload backup service'larini qayta ishlatadi: PostgreSQL
custom archive `pg_restore --list` bilan, ikkala upload root esa SHA-256 manifest bilan
tekshiriladi. Bundle `rclone copy`dan keyin remote `rclone check`dan o'tadi, so'ng
`SUCCESS.json` alohida yuborilib remote listingda tasdiqlanadi. Faqat shundan keyin 14 kunlik
retention ishlaydi va `.offsite-backup-last-success.json` atomik yangilanadi.

Retention faqat qat'iy timestamp nomli va `SUCCESS.json` markerli eski runlarni
o'chiradi. Partial yoki noma'lum papkalarga tegmaydi. Job xato qilsa last-success
yangilanmaydi va remote/local retention boshlanmaydi. Ichki lock crashdan keyin qolsa,
avval boshqa backup process ishlamayotganini tekshiring; keyingina
`.offsite-backup.lock`ni qo'lda olib tashlang.

Individual backup va restore drill buyruqlari saqlanadi:

```bash
npm run db:backup -- --output /var/backups/ilm-liga/manual.dump
npm run db:backup:verify -- --file /var/backups/ilm-liga/manual.dump
npm run uploads:backup -- --output /var/backups/ilm-liga/manual-uploads
npm run uploads:backup:verify -- --snapshot /var/backups/ilm-liga/manual-uploads
```

Encrypted remote'dagi yakunlangan bundle'ni database va uploadlar bilan birga tiklash
uchun `deploy/OPERATIONS.md`dagi oylik integratsiyalangan drillni bajaring:

```bash
npm run backup:offsite:restore-drill -- --run-id RUN_ID \
  --target-db english_battle_restore_test \
  --confirm-target-db english_battle_restore_test \
  --upload-target /var/tmp/ilm-liga-uploads-restore-test \
  --confirm-upload-target /var/tmp/ilm-liga-uploads-restore-test
```

---

## Yangilanish (keyingi deploylar)

GitHub'da `Production quality gate / quality` check'i `main` uchun required branch protection sifatida yoqilgan bo'lishi kerak. Push yoki pull request'dagi `npm ci`, High/Critical dependency audit, production contract, isolated PostgreSQL migration va `test:full` bosqichlari yashil bo'lmasa deployni boshlamang. Workflow production secret ishlatmaydi va avtomatik deploy qilmaydi.

```bash
cd /var/www/englishbattle
PREVIOUS_COMMIT=$(git rev-parse HEAD)
git fetch origin main
git pull --ff-only origin main
npm ci --omit=dev
npm run config:check:production
npm test
npm run db:backup -- --output "$HOME/backups/predeploy_$(date +%Y-%m-%d_%H-%M-%S).dump"
npm run uploads:backup -- --output "$HOME/backups/uploads_predeploy_$(date +%Y-%m-%d_%H-%M-%S)"
node migrate.js status
node migrate.js
node migrate.js status
pm2 restart deploy/ecosystem.config.js --update-env
curl --fail http://127.0.0.1:3000/health
curl --fail http://127.0.0.1:3000/ready
```

`PREVIOUS_COMMIT` qiymatini deploy jurnalida saqlang. `npm run test:full` va `npm run test:e2e` ma'lumot o'zgartirishi mumkin; ularni production databasega qarshi bajarmang.

---

## Rollback

Ilova kodi ishlamasa, oldingi commitni qaytaring va dependencylarni aynan lockfiledan tiklang:

```bash
cd /var/www/englishbattle
git checkout "$PREVIOUS_COMMIT"
npm ci --omit=dev
npm run config:check:production
pm2 restart deploy/ecosystem.config.js --update-env
curl --fail http://127.0.0.1:3000/health
curl --fail http://127.0.0.1:3000/ready
```

Migrationlar forward-only: kod rollbacki schema rollbacki emas. Migration production ma'lumotiga zarar yetkazgan bo'lsa, trafikni to'xtating va pre-deploy backupni alohida databasega restore qilib tekshirgandan keyingina recovery qiling.

---

## Muammolarni bartaraf qilish

- **Server "Production konfiguratsiyasi xavfsiz emas" deb ko'tarilmaydi**: `npm run config:check:production` bajaring va ko'rsatilgan env nomlarini to'ldiring; secret qiymatlarni log yoki chatga yubormang.
- **/ready 503 qaytaradi**: DB ulanmagan. `.env` DB kredensiallarini va PostgreSQL ishlayotganini tekshiring (`sudo systemctl status postgresql`).
- **Live battle ulanmaydi**: Nginx `/socket.io/` blokidagi Upgrade headerlarини tekshiring, `nginx -t`.
- **413 upload xatosi**: Nginx `client_max_body_size` (25M qo'yilgan).
- **Rate limit noto'g'ri ishlaydi**: `TRUST_PROXY_HOPS=1` o'rnatilganini tekshiring.
