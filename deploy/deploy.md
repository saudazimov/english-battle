# IlmLiga — VPS Deployment Qo'llanmasi (Single-Instance, Closed Beta)

Ubuntu 22.04/24.04 VPS uchun. Same-origin monolit: frontend + API + Socket.IO bitta Node service'da. Redis YO'Q (single-instance).

---

## 0. Talablar
- Ubuntu VPS (2GB RAM tavsiya)
- Domen (englishbattle.uz) → VPS IP'ga yo'naltirilgan (A record)
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
ls migrations/           # 001..010 .sql shu yerda BO'LISHI KERAK
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

To'ldiring (MAJBURIY):
- `NODE_ENV=production`
- `TRUST_PROXY_HOPS=1`  (Nginx ortida)
- `DB_HOST=localhost`, `DB_PORT=5432`, `DB_USER=eb_user`, `DB_PASSWORD=...`, `DB_NAME=english_battle`
- `DB_SSL=false`  (local PostgreSQL)
- `JWT_SECRET=`  → `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `ADMIN_PASSWORD=`  (kuchli)
- `PARENT_CODE_PEPPER=`  → `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
- `ESKIZ_EMAIL=`, `ESKIZ_PASSWORD=`  (Eskiz.uz hisobi — production'da MAJBURIY, aks holda server o'chadi)
- `ESKIZ_FROM=`  (tasdiqlangan sender nomi)

Ixtiyoriy: `PAYME_*` (to'lov), `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` (AI, aks holda fallback).

---

## 5. Upload papkasi permissions

server.js startda `public/uploads/` va `public/uploads/resources/` ni yaratadi, lekin permission'ni ta'minlang:

```bash
mkdir -p public/uploads/resources
# Node jarayoni yozа olishi uchun (PM2 sizning user'ingizda ishlaydi)
chmod -R 755 public/uploads
```

MUHIM: VPS local disk PERSISTENT — restart'da fayllar YO'QOLMAYDI (Render/Railway'dan farqli). Shuning uchun bu deploy'da S3/R2 SHART EMAS. Lekin backup oling (7-qadam).

---

## 6. Database migratsiya

```bash
node migrate.js status   # qaysi migratsiyalar kutilmoqda
node migrate.js          # barchasini qo'llaydi (001..010)
```

Kutilgan natija: "10 ta migratsiya qo'llandi" (yoki allaqachon qo'llangan bo'lsa o'tkazib yuboradi).

---

## 7. PM2 bilan ishga tushirish

```bash
pm2 start deploy/ecosystem.config.js
pm2 save                 # joriy holatни saqlaydi
pm2 startup              # chiqqan buyruqni copy-paste qilib bajaring (bootga ulaydi)

pm2 status               # ishlayaptimi
pm2 logs english-battle  # loglar
```

Tekshiring (localdan):
```bash
curl http://127.0.0.1:3000/health   # {"status":"ok",...}
curl http://127.0.0.1:3000/ready    # {"status":"ready"} (DB ulangan bo'lsa)
```

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

Tekshiring (brauzerdan): `http://englishbattle.uz` → sayt ochilishi kerak.

---

## 9. SSL (HTTPS) — Let's Encrypt

```bash
sudo certbot --nginx -d englishbattle.uz -d www.englishbattle.uz
```

Certbot avtomatik: sertifikat oladi, Nginx config'ni HTTPS'ga yangilaydi, HTTP→HTTPS redirect qo'shadi. Avtomatik yangilanish cron o'rnatiladi.

Tekshiring: `https://englishbattle.uz` → yashil qulf.

MUHIM: SSL yoqilgach, Socket.IO avtomatik `wss://` (secure WebSocket) ishlatadi — frontend `io()` same-origin bo'lgani uchun kod o'zgarmaydi.

---

## 10. Database backup (kunlik)

```bash
mkdir -p ~/backups
crontab -e
```

Qo'shing (har kuni 03:00):
```
0 3 * * * PGPASSWORD='SIZNING_DB_PAROL' pg_dump -U eb_user -h localhost english_battle > ~/backups/eb_$(date +\%Y-\%m-\%d).sql 2>> ~/backups/backup.log && find ~/backups -name "eb_*.sql" -mtime +14 -delete
```

(14 kundan eski backuplar avtomatik o'chadi.)

---

## Yangilanish (keyingi deploylar)

```bash
cd /var/www/englishbattle
git pull
npm ci --omit=dev
node migrate.js          # yangi migratsiyalar bo'lsa
pm2 reload english-battle   # zero-downtime (graceful shutdown bilan)
```

---

## Muammolarni bartaraf qilish

- **Server ko'tarilmaydi, "ESKIZ" xatosi**: production'da `ESKIZ_EMAIL`/`ESKIZ_PASSWORD` majburiy. `.env`ni to'ldiring.
- **/ready 503 qaytaradi**: DB ulanmagan. `.env` DB kredensiallarini va PostgreSQL ishlayotganini tekshiring (`sudo systemctl status postgresql`).
- **Live battle ulanmaydi**: Nginx `/socket.io/` blokidagi Upgrade headerlarини tekshiring, `nginx -t`.
- **413 upload xatosi**: Nginx `client_max_body_size` (25M qo'yilgan).
- **Rate limit noto'g'ri ishlaydi**: `TRUST_PROXY_HOPS=1` o'rnatilganini tekshiring.