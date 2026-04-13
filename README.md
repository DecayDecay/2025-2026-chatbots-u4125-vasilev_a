# s&box Steam Market Terminal

Инвестиционный терминал для отслеживания скинов s&box на торговой площадке Steam (appid 590830).

Включает Telegram-бота с интерактивным меню, веб-дашборд на Next.js и систему автоматического сбора данных с рынка.

## Возможности

- 📊 **Рынок** — цены, объёмы, листинги, стакан заявок в реальном времени
- 📈 **Top Movers** — топ-20 предметов по изменению цены за 24ч
- 🔥 **Hot** — топ-15 по количеству продаж за 30 дней (данные sbox.game)
- 💎 **Blue Chips** — топ-10 по суммарной выручке за всё время
- 💼 **Портфель** — импорт из Steam-инвентаря, ручное добавление, расчёт PnL
- ⭐ **Watchlist** — избранные предметы с быстрым доступом
- 🔔 **Алерты** — уведомления при достижении целевой цены
- 💱 **Мультивалютность** — USD / KZT с автообновлением курса
- 📉 **Графики** — 30-дневные чарты цен (PNG, рендер на сервере)

## Структура проекта

```
sbox-terminal/
├── apps/
│   ├── bot/        — Telegram-бот (Grammy, inline-клавиатуры)
│   ├── web/        — Веб-дашборд (Next.js 13.5, Tailwind CSS)
│   └── worker/     — Воркер-скрапер (каталог, снапшоты, стаканы, sbox.game)
├── packages/
│   └── db/         — Prisma ORM + PostgreSQL (схема, миграции)
├── deploy/         — Скрипты деплоя на Raspberry Pi 4
└── scripts/        — Бэкап БД, установка планировщика
```

## Быстрый старт

```bash
# 1. Скопировать конфиг и вписать свой BOT_TOKEN
cp .env.example .env
nano .env

# 2. Поднять базу данных
docker compose up -d postgres redis

# 3. Установить зависимости
pnpm install

# 4. Применить миграции
pnpm --filter @sbox/db run generate
pnpm --filter @sbox/db run migrate:deploy

# 5. Загрузить каталог предметов
pnpm --filter @sbox/worker run cli catalog

# 6. Запустить бота
pnpm --filter @sbox/bot start

# 7. (опционально) Запустить веб-дашборд
pnpm --filter @sbox/web dev
```

Или всё через Docker:

```bash
docker compose up -d --build
```

## Фоновые задачи (Worker)

| Задача     | Расписание     | Источник данных                     |
|------------|----------------|-------------------------------------|
| catalog    | каждый час     | Steam `market/search/render`        |
| snapshot   | каждые 20 мин  | Steam `market/priceoverview`        |
| orderbook  | каждый час     | Steam `itemordershistogram`         |
| sboxgame   | каждые 6 часов | sbox.game/metrics/skins (Playwright)|
| alerts     | после snapshot | локальная проверка                  |
| prune      | ежедневно 4:30 | очистка старых снапшотов            |

**Анонимный режим:** воркер работает полностью без авторизации в Steam.
Единственная функция, требующая cookie `steamLoginSecure` — разовая загрузка
годовой истории цен (ручной запуск через CLI).

## Потребление ресурсов

| Сервис     | RAM   |
|------------|-------|
| PostgreSQL | ~80 МБ  |
| Redis      | ~20 МБ  |
| Bot        | ~80 МБ  |
| Web        | ~384 МБ |
| Worker     | ~256 МБ |

Raspberry Pi 4 (2 ГБ) справляется с ботом + БД без проблем.

## Технологии

- **Telegram-бот:** Grammy, node-canvas, tsx
- **Веб:** Next.js 13.5, React, Tailwind CSS
- **БД:** PostgreSQL 16, Prisma ORM
- **Кэш:** Redis 7
- **Скрапинг:** Undici (Steam API), Playwright (sbox.game)
- **Инфра:** Docker Compose, systemd, pnpm workspaces

## Конфигурация

Все настройки хранятся в файле `.env` (см. `.env.example`).

| Переменная          | Описание                              |
|---------------------|---------------------------------------|
| `BOT_TOKEN`         | Токен Telegram-бота от @BotFather     |
| `DATABASE_URL`      | Строка подключения к PostgreSQL       |
| `REDIS_URL`         | Строка подключения к Redis            |
| `SCRAPER_REQ_PER_MIN` | Лимит запросов к Steam (по умолч. 12) |

## Лабораторные работы

В папке `reports/` находятся отчёты:
- **Лаб. 1** — Создание Telegram-бота
- **Лаб. 2** — Интеграция с внешними данными (Steam API, sbox.game)
- **Лаб. 3** — Деплой и сбор обратной связи

---

*Выполнил: Васильев А., группа U4125 — ИТМО, 2025–2026*
