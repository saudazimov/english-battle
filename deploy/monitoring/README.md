# IlmLiga private metrics collector

Ushbu konfiguratsiya production Node.js processidagi `/internal/metrics` endpointni
faqat VPS loopback interfeysi orqali scrape qiladi. Nginx bu pathni internetdan `404`
bilan yopadi. Prometheus yoki Alertmanager web portlarini public interfeysga ochmang.

## 1. Paket va papkalar

Ubuntu package nomlarini server versiyasida tekshirib, Prometheus, Alertmanager va
ularning validation CLI vositalarini o'rnating. Keyin:

```bash
sudo install -d -o root -g prometheus -m 0750 /etc/prometheus/secrets
sudo install -d -o root -g prometheus -m 0755 /etc/prometheus/rules
sudo install -o root -g root -m 0644 deploy/monitoring/prometheus.yml /etc/prometheus/prometheus.yml
sudo install -o root -g root -m 0644 deploy/monitoring/ilm-liga-alerts.yml /etc/prometheus/rules/ilm-liga-alerts.yml
```

## 2. Tokenni xavfsiz ulash

Ilova `.env` faylidagi `METRICS_TOKEN` va Prometheus token faylidagi qiymat aynan bir
xil, kamida 32 belgili va boshqa secretlardan farqli bo'lishi kerak. Qiymatni command
argumenti, Git, deploy logi yoki chatga yozmang.

```bash
read -rsp "METRICS_TOKEN: " METRICS_TOKEN; echo
printf '%s' "$METRICS_TOKEN" | sudo tee /etc/prometheus/secrets/ilm-liga-metrics-token >/dev/null
sudo chown root:prometheus /etc/prometheus/secrets/ilm-liga-metrics-token
sudo chmod 0640 /etc/prometheus/secrets/ilm-liga-metrics-token
unset METRICS_TOKEN
```

Tokenni `.env`ga xavfsiz editor orqali kiriting va tekshiring:

```bash
npm run config:check:production
```

Rotate qilishda avval `.env` va token faylini yangilang, keyin ilova hamda Prometheusni
restart qiling. Eski tokenni qayta ishlatmang.

## 3. Local-only va Alertmanager

Prometheusni `127.0.0.1:9090`, Alertmanagerni `127.0.0.1:9093` manzilida tinglashga
sozlang. Distribution service parametrlari farq qilishi mumkin; `systemctl cat
prometheus` va `systemctl cat prometheus-alertmanager` bilan aniq unitni tekshiring.
So'ng `--web.listen-address=127.0.0.1:PORT` flagini distro qo'llaydigan environment
yoki systemd override orqali bering.

`/etc/prometheus/alertmanager.yml` repositorydan tashqarida boshqariladi. Unda real
notification receiver, routing va ikki on-call manzili sozlanishi shart. Provider
credentialini ushbu repositoryga yoki Prometheus rule fayliga yozmang. Local
Alertmanagerning o'zi VPS butunlay ishlamay qolganini bildira olmaydi; `/health` va
`/ready` uchun alohida tashqi uptime provider majburiy.

## 4. Validatsiya va ishga tushirish

```bash
promtool check config /etc/prometheus/prometheus.yml
promtool check rules /etc/prometheus/rules/ilm-liga-alerts.yml
amtool check-config /etc/prometheus/alertmanager.yml
sudo systemctl restart prometheus-alertmanager
sudo systemctl restart prometheus
sudo systemctl --no-pager --full status prometheus prometheus-alertmanager
ss -ltnp | grep -E ':(9090|9093)'
```

`ss` natijasida ikkala port ham faqat `127.0.0.1`ga bind qilingan bo'lishi shart.
Prometheus target va rule holatini tekshiring:

```bash
curl --fail http://127.0.0.1:9090/-/ready
curl --fail http://127.0.0.1:9090/api/v1/targets
curl --fail http://127.0.0.1:9090/api/v1/rules
```

Stagingda ilovani vaqtincha to'xtatib `IlmLigaMetricsTargetDown` alerti 3 daqiqada
`firing` bo'lishini va haqiqiy notification on-call kanaliga yetib borishini sinang.
Production gate faqat receiver va tashqi uptime alertlari ham amalda sinovdan o'tgach
yopiladi.
