import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, LevelFormat, PageBreak, BorderStyle,
  Header, Footer, PageNumber,
} from "docx";
import fs from "fs";

const FONT = "Arial";
const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: "1a1a1a" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: FONT, color: "333333" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "\u2022",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [new TextRun({ text: "ITMO | Vibe Coding: AI-\u0431\u043e\u0442\u044b \u0434\u043b\u044f \u0431\u0438\u0437\u043d\u0435\u0441\u0430", font: FONT, size: 18, color: "999999" })],
            alignment: AlignmentType.RIGHT,
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "\u0421\u0442\u0440. ", font: FONT, size: 18, color: "999999" }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: "999999" }),
            ],
          })],
        }),
      },
      children: [
        // ===== TITLE PAGE =====
        ...Array(4).fill(new Paragraph({ children: [] })),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "\u0423\u043d\u0438\u0432\u0435\u0440\u0441\u0438\u0442\u0435\u0442 \u0418\u0422\u041c\u041e", font: FONT, size: 24, color: "666666" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "\u041a\u0443\u0440\u0441: Vibe Coding \u2014 AI-\u0431\u043e\u0442\u044b \u0434\u043b\u044f \u0431\u0438\u0437\u043d\u0435\u0441\u0430", font: FONT, size: 24, color: "666666" })],
        }),
        new Paragraph({ children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "\u041b\u0430\u0431\u043e\u0440\u0430\u0442\u043e\u0440\u043d\u0430\u044f \u0440\u0430\u0431\u043e\u0442\u0430 \u21161", font: FONT, size: 40, bold: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: "\u0421\u043e\u0437\u0434\u0430\u043d\u0438\u0435 Telegram-\u0431\u043e\u0442\u0430 \u0434\u043b\u044f \u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433\u0430 \u0440\u044b\u043d\u043a\u0430 s&box", font: FONT, size: 28, color: "444444" })],
        }),
        ...Array(6).fill(new Paragraph({ children: [] })),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "\u0412\u0430\u0440\u0438\u0430\u043d\u0442: \u0418\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0430\u0433\u0440\u0435\u0433\u0430\u0442\u043e\u0440", font: FONT, size: 24, color: "666666" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "\u0411\u043e\u0442: @sboxterminal_bot", font: FONT, size: 24, color: "666666" })],
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // ===== 1. ОПИСАНИЕ ЗАДАЧИ =====
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("1. \u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438")] }),
        p("Выбран вариант \u00ab\u0418\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0430\u0433\u0440\u0435\u0433\u0430\u0442\u043e\u0440\u00bb. Бот агрегирует данные рынка s&box (Steam, appid 590830): цены, объёмы торгов, order book, метрики с sbox.game (stock, revenue), управление портфолио и алерты."),
        p("Бот решает реальную бизнес-задачу: участникам рынка скинов s&box неудобно отслеживать 78+ предметов через стандартный интерфейс Steam Community Market (8 страниц, нужно входить в каждую карточку). Бот агрегирует всю информацию в одном месте с инвестиционной аналитикой."),
        p("Ключевые функции: мониторинг цен в реальном времени, Top Gainers/Losers, снайп-листинги (цена ниже медианы), фильтрация по stock/rarity, портфолио с PnL (учёт 13% комиссии Steam), алерты по цене, графики цен, экспорт CSV."),

        // ===== 2. ПРОМПТЫ =====
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("2. \u041f\u0440\u043e\u043c\u043f\u0442\u044b \u0434\u043b\u044f LLM")] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("\u041d\u0430\u0447\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u0440\u043e\u043c\u043f\u0442")] }),
        p("\"Create a Telegram bot using Grammy framework + TypeScript that connects to a PostgreSQL database with Prisma ORM. The bot should provide 19 commands for monitoring the s&box Steam Community Market (appid 590830). Commands: /start (interactive menu with inline buttons), /market (paginated table), /item (detail card with metrics + inline actions), /top, /stats, /deals, /rare, /momentum, /bluechips, /watchlist, /alert, /alerts, /portfolio, /buy, /sell, /chart, /refresh, /export, /feedback. Use MarkdownV2 formatting. Store data in existing Prisma schema with Item, PriceSnapshot, OrderBook, SboxGameStat, Position, Alert, Watchlist tables.\""),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("\u0418\u0442\u0435\u0440\u0430\u0446\u0438\u0438")] }),
        bullet("Итерация 1: MarkdownV2 escaping \u2014 все спецсимволы нужно экранировать; написан helper esc()"),
        bullet("Итерация 2: Inline keyboards \u2014 добавлены кнопки навигации, пагинация /market, action-кнопки в /item"),
        bullet("Итерация 3: ESM-совместимость \u2014 __dirname не определён в ESM модулях; заменён на import.meta.url + fileURLToPath"),
        bullet("Итерация 4: chartjs-node-canvas v4 несовместим с chart.js v4; заменён на чистый node-canvas с ручной отрисовкой"),
        bullet("Итерация 5: Интерактивное меню \u2014 12 inline-кнопок в /start + кнопка \u00ab\u2190 Меню\u00bb в каждом ответе"),

        // ===== 3. ТЕХНОЛОГИЧЕСКИЙ СТЕК =====
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("3. \u0422\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0441\u0442\u0435\u043a")] }),
        bullet("Grammy \u2014 TypeScript-first Telegram Bot API framework"),
        bullet("TypeScript + tsx \u2014 типобезопасность + быстрый запуск без компиляции"),
        bullet("Prisma ORM + PostgreSQL \u2014 ORM с type-safe queries, миграции"),
        bullet("Node.js canvas \u2014 серверный рендеринг PNG-графиков цен"),
        bullet("Steam Community Market API \u2014 priceoverview, search/render, itemordershistogram (анонимно)"),
        bullet("sbox.game/metrics/skins \u2014 Playwright headless browser для скрапинга Blazor Server"),
        bullet("Docker Compose \u2014 postgres + redis + bot контейнеры"),
        p("Бот переиспользует существующую БД, наполняемую скраперами. Архитектура монорепы: apps/bot (Telegram), apps/web (Next.js dashboard), apps/worker (скраперы), packages/db (Prisma schema)."),

        // ===== 4. СКРИНШОТЫ И ДЕМОНСТРАЦИЯ =====
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("4. \u0421\u043a\u0440\u0438\u043d\u0448\u043e\u0442\u044b \u0438 \u0434\u0435\u043c\u043e\u043d\u0441\u0442\u0440\u0430\u0446\u0438\u044f")] }),
        p("Бот @sboxterminal_bot поддерживает 19 команд:"),
        bullet("/start \u2014 интерактивное меню с 12 inline-кнопками (Рынок, Топ, Статистика, Deals, Rare, Momentum, Blue Chips, Watchlist, Портфолио, Алерты, Обновить, Отзыв)"),
        bullet("/market \u2014 таблица 78 предметов с пагинацией. Колонки: Item, Price, \u039424h, Stock"),
        bullet("/item <name> \u2014 карточка с 10+ метриками (Median, Lowest, ATH, Drawdown, Vol 24h, Order Book spread/liquidity, Stock, Lifetime rev, Momentum 30d, Break-even sell) + 5 inline-кнопок: Watch, Alert, Chart, Buy, Steam link"),
        bullet("/top \u2014 Top 5 Gainers + Top 5 Losers за 24h с процентами"),
        bullet("/stats \u2014 Market Cap $6.46M, Volume 24h, Items, sbox.game lifetime $1.35M, revenue по таймфреймам"),
        bullet("/deals \u2014 предметы где lowest < median \u00d7 0.85 (снайп-листинги)"),
        bullet("/rare \u2014 предметы с stock < 1000 единиц (sbox.game данные)"),
        bullet("/momentum \u2014 топ 10 по доле 30d revenue от lifetime"),
        bullet("/bluechips \u2014 топ 10 по lifetime revenue"),
        bullet("/watchlist \u2014 добавить/удалить/показать избранные предметы"),
        bullet("/alert <item> above/below <price> \u2014 создание алерта"),
        bullet("/alerts \u2014 список активных алертов с типами и порогами"),
        bullet("/portfolio \u2014 открытые позиции + PnL (учёт 13% комиссии Steam)"),
        bullet("/buy <item> <qty> <price> \u2014 добавить позицию в портфолио"),
        bullet("/sell <id> <price> \u2014 закрыть позицию, рассчитать realized PnL"),
        bullet("/chart <item> \u2014 PNG-график цены (серверный рендер, оранжевая линия на тёмном фоне)"),
        bullet("/refresh \u2014 ручное обновление данных (запуск snapshot scraper)"),
        bullet("/export \u2014 CSV-файл портфолио в чат"),
        bullet("/feedback \u2014 оценка 1-5 через inline-кнопки, сохранение в БД"),
        p("Видео-демо: [ССЫЛКА БУДЕТ ДОБАВЛЕНА]"),

        // ===== 5. ПРОБЛЕМЫ И РЕШЕНИЯ =====
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("5. \u041f\u0440\u043e\u0431\u043b\u0435\u043c\u044b \u0438 \u0440\u0435\u0448\u0435\u043d\u0438\u044f")] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("MarkdownV2 \u044d\u043a\u0440\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435")] }),
        p("Telegram MarkdownV2 требует экранирования всех спецсимволов (_*[]()~`>#+\\-=|{}.!). Написана утилита esc() которая применяется ко всем пользовательским данным перед отправкой."),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("tsx __name injection")] }),
        p("tsx (TypeScript executor) добавляет обёртку __name() к каждой именованной функции. При передаче функции в Playwright page.evaluate() она сериализуется и выполняется в контексте браузера, где __name не определён. Решение: использовать строковую форму evaluate()."),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("chartjs-node-canvas v4")] }),
        p("Библиотека chartjs-node-canvas v4 несовместима с chart.js v4 (метод register не найден). Решение: замена на чистый node-canvas с ручной отрисовкой графика (линия, заливка, оси, подписи). Результат даже лучше \u2014 полный контроль над визуалом."),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("ESM \u043c\u043e\u0434\u0443\u043b\u0438")] }),
        p("В ESM-модулях __dirname не определён. Заменён на конструкцию import.meta.url + fileURLToPath + dirname."),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Prisma DLL lock")] }),
        p("На Windows prisma generate не может перезаписать query_engine DLL пока любой node-процесс использует Prisma client. Решение: перед генерацией останавливать все node-процессы."),

        // ===== 6. ВЫВОДЫ =====
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("6. \u0412\u044b\u0432\u043e\u0434\u044b")] }),
        p("Создан полнофункциональный Telegram-бот с 19 командами, интерактивным меню с inline-кнопками, данными из 3 источников (Steam Market API, sbox.game, PostgreSQL), управлением портфолио с расчётом PnL (включая 13% комиссию Steam), графиками цен, системой алертов."),
        p("Бот предоставляет аналитику инвестиционного уровня для рынка скинов s&box. Grammy framework отлично подходит для быстрой разработки ботов с типобезопасностью TypeScript."),
        p("Ключевой вывод: AI-ассистированная разработка драматически ускоряет прототипирование, но требует внимательной итерации для edge cases (кодировки, модульные системы, совместимость библиотек)."),
        p("Что получилось хорошо: скорость разработки, качество inline UI, интеграция с существующей БД. Что можно улучшить: добавить кэширование ответов, улучшить визуал графиков, добавить daily digest рассылку."),
      ],
    },
  ],
});

function p(text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: FONT, size: 24 })],
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, font: FONT, size: 24 })],
  });
}

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync("C:/Users/dikii/Desktop/PROG/Cladue/sbox-terminal/reports/lab1.docx", buffer);
console.log("lab1.docx created");
