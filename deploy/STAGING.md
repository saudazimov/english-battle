# IlmLiga staging muhiti

Staging productiondan alohida deploy katalogi, PostgreSQL database, database user,
domain va tashqi provider credentiallari bilan ishlashi shart. Production ma'lumotini
stagingga nusxalash taqiqlanadi; anonimlashtirilgan fixture ma'lumot ishlating.

## 1. Alohida katalog va database

Tavsiya etilgan katalog: `/var/www/englishbattle-staging`.

```sql
CREATE DATABASE english_battle_staging;
CREATE USER eb_staging_user WITH ENCRYPTED PASSWORD 'STAGING_UCHUN_KUCHLI_PAROL';
GRANT ALL PRIVILEGES ON DATABASE english_battle_staging TO eb_staging_user;
\c english_battle_staging
GRANT ALL ON SCHEMA public TO eb_staging_user;
```

Staging userga production database uchun hech qanday grant bermang.

## 2. Environment

```bash
cp .env.staging.example .env
nano .env
```

Majburiy tekshiruvlar:

- `NODE_ENV=production` — production security guardlar stagingda ham ishlaydi.
- `PORT=3100` — production portidan alohida.
- `CLIENT_ORIGIN=https://staging.example.com` — faqat staging frontend domeni.
- `DB_NAME=english_battle_staging`, `DB_USER=eb_staging_user`.
- `JWT_SECRET`, pepperlar va admin credentiallari productiondan butunlay boshqa.
- Eskiz va Payme uchun faqat alohida test/staging account credentiallari.
- `AI_REPORTS_ENABLED=false` — alohida qaror va quota bo'lmaguncha.

Remote managed PostgreSQL ishlatilsa `DB_SSL=true`; local staging PostgreSQL uchun
`DB_SSL=false`. Haqiqiy `.env` Gitga qo'shilmaydi.

## 3. Migration va database identity tekshiruvi

Migrationdan oldin aynan staging database tanlanganini tekshiring:

```bash
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT current_database(), current_user;"
node migrate.js status
node migrate.js
```

Natijada `current_database` faqat `english_battle_staging` bo'lishi kerak.

## 4. PM2

```bash
mkdir -p logs public/uploads/resources
pm2 start deploy/ecosystem.staging.config.js
pm2 status
pm2 logs english-battle-staging
curl http://127.0.0.1:3100/health
curl http://127.0.0.1:3100/ready
```

Nginx staging domenini `127.0.0.1:3100`ga proxy qilishi va `/socket.io/` uchun
WebSocket Upgrade headerlarini uzatishi kerak. Staging uchun alohida TLS sertifikat
ishlating.

## 5. Test xavfsizligi

`npm run test:e2e` user, class va boshqa fixture yozuvlarini yaratadi. Uni faqat
staging/test databasega qarshi ishlating. Production databasega qarshi E2E yoki
`npm run test:full` bajarish taqiqlanadi.

Deploydan keyin staging smoke tekshiruvi:

```bash
E2E_BASE_URL=https://staging.example.com npm run test:e2e
```
