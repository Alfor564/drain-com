# drain-com API — Cloudflare Worker + D1

**Уже задеплоено:** https://drain-com-api.p45max120w5.workers.dev
D1: `drain-com` (`2d4a1627-7d40-4b54-93ba-7e1d58bca7fe`), регион EEUR.
Frontend `API_BASE` в `app.js` уже указывает сюда.

Постоянное хранилище для сайта: заходы, лайки и дизлайки. Уникальность — по
IP, но сырой IP **не хранится**: в базу пишется SHA-256 от `CF-Connecting-IP`
с секретной солью. Один IP = один заход и один стоящий голос.

## Почему D1, а не другие

- **Cloudflare D1** — база на самом Cloudflare, без карты: 5 ГБ, 5 млн чтений
  и 100 тыс. записей в день. Данные не «засыпают» от простоя (в отличие от
  бесплатного Supabase/Neon), живут, пока жив аккаунт Cloudflare.
- **Workers KV** — проще, но это не база, а ключи-значения; для подсчёта
  уникальных голосов по IP D1 удобнее.
- **Turso** — если под «Traks» ты имел в виду его: это не Cloudflare, но тоже
  бесплатный serverless SQLite (500 МБ). Переехать можно, но D1 уже в
  Cloudflare и без карты.

## Файлы

```
backend/
  wrangler.toml   — воркер, D1 binding, CORS-origin
  schema.sql      — таблицы visitors и votes
  src/worker.js   — API: /visit, /vote, /stats
  .gitignore      — .wrangler/
```

## Деплой (5 минут)

Нужен аккаунт Cloudflare (free) и Node.js.

```bash
cd backend
npx wrangler login

npx wrangler d1 create drain-com
# вставь database_id из вывода в wrangler.toml

npx wrangler d1 execute drain-com --remote --file schema.sql

# секрет для хеша IP (придумай длинную строку)
npx wrangler secret put IP_SALT

npx wrangler deploy
```

В выводе `deploy` будет URL вида
`https://drain-com-api.<твой-subdomain>.workers.dev`. Его нужно вписать в
`app.js`:

```js
const API_BASE = "https://drain-com-api.<твой-subdomain>.workers.dev";
```

После этого — коммит и пуш в GitHub, GitHub Pages сам пересоберётся.

## API

| Метод | Путь | Что делает |
|---|---|---|
| `POST` | `/visit` | записывает уникальный заход, возвращает статистику |
| `POST` | `/vote` | `{"vote":"like" \| "dislike"}`; ставит/снимает голос, возвращает статистику |
| `GET` | `/stats` | только статистика |

Ответ:

```json
{ "visits": 12, "likes": 4, "dislikes": 1, "vote": "like" }
```

`vote` — голос этого IP (`like`, `dislike` или `null`).

## CORS

В `wrangler.toml`:

```toml
ALLOWED_ORIGINS = "https://alfor564.github.io,http://localhost:8099,http://127.0.0.1:8099,null"
```

`null` — для открытия `index.html` с диска. Если сайт переедет на другой
домен, добавь его сюда и переdeploy.

## Локальная разработка

```bash
cd backend
npx wrangler dev
```

Локальный D1 создастся сам; API будет на `http://localhost:8787`. В `app.js`
на время разработки поставь `API_BASE = "http://localhost:8787"`, в
`ALLOWED_ORIGINS` уже есть localhost.

## Ограничения

- Один браузер/один IP — один голос; чтобы переголосовать, нажми ещё раз
  (голос снимется) или выбери другой.
- Заход считается уникальным по IP навсегда (таблица `visitors`).
- Бесплатный лимит D1: 100 тыс. записей в день; для личного сайта — с запасом.
- Это не «аналитика по странам», а простые счётчики; для полноценной
  аналитики — Cloudflare Web Analytics (тоже бесплатно).
