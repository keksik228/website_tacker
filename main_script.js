// ─── CONFIG ──────────────────────────────────────────────────────────────────

const SHEETS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTPbZ92r4ihDUvBwjPLW4Jkg7Ni4tgmeNcF5Z1402pn3AhNfd5CRSYutELmfjyoLP5IkQS0WtZZ3rFq/pub?output=csv";

const ACCOUNTS = {
  'User_1': { name: 'User_1', phone: '+7 123 456 79 10' },
  'User_2': { name: 'User_2', phone: '+7 987 654 32 10' },
};

// ─── СОСТОЯНИЕ ───────────────────────────────────────────────────────────────

let allData = [];
let currentUser = null;

// ─── ПАРСЕР ──────────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.split("\n").filter(l => l.trim());

  function parseLine(line) {
    const cols = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  }

  // Первая строка — заголовок, пропускаем
  const rows = lines.slice(1).map(parseLine);

  // Жёсткие индексы колонок (Google Sheets — есть доп. колонка "Владелец КТК" на [1]):
  // [0]  Номер КТК
  // [1]  Владелец КТК  ← новая колонка, сдвигает все на +1
  // [2]  Вид собственности КТК
  // [3]  Принадлежность КТК
  // [4]  Размер КТК
  // [5]  Терминал/депо выдачи
  // [6]  Дата приема порожнего КТК
  // [7]  Погрузка груженого КТК на судно (дата окончания)
  // [8]  Движение груженого КТК на судне (дата начала) → Создан + Погрузка
  // [9]  Движение груженого КТК на судне (дата окончания)
  // [10] № морского рейса
  // [11] Судно
  // [12] Выгрузка груженого КТК с судна (дата окончания)
  // [13] Терминал в порту назначения
  // [14] Появление телекса (дата окончания)
  // [15] Получение декларации (дата окончания)
  // [16] Получение поручения на отправку по ж/д (дата окончания)
  // [17] Дата готовности КТК к вывозу с порта
  // [18] Движение по ж/д (дата начала) → Движение по ж/д
  // [19] Движение по ж/д (дата окончания) → Станция перегруза (если есть)
  // [20] Начальная станция отправления
  // [21] Станция перегруза ПВ-ФИТ
  // [22] Движение после перегруза (дата начала) → Движение по ж/д после перегруза
  // [23] Движение после перегруза (дата окончания)
  // [24] Конечная станция назначения
  // [25] № лота
  // [26] Прием груженого КТК на сухом терминале
  // [27] Выдача груженого КТК на сухом терминале
  // [28] Прием порожнего КТК → Груз доставлен
  const C = {
    id:          0,
    sobstv:      2,
    prinadl:     3,
    razmer:      4,
    dvizh_nach:  8,   // Движение КТК на судне (начало) → Создан + Погрузка
    dvizh_kon:   9,   // Движение КТК на судне (конец)
    reys:        10,
    sudno:       11,
    vygruzka:    12,  // Выгрузка с судна
    terminal:    13,
    teleks:      14,  // Появление телекса
    deklarac:    15,  // Получение декларации
    poruchenie:  16,  // Получение поручения по ж/д
    gotovnost:   17,  // Дата готовности КТК
    otpr_jd:     18,  // Движение по ж/д (начало)
    peregr_stancia: 21,  // Станция перегруза ПВ-ФИТ
    peregr_st:   22,  // Движение груженого КТК по ж/д после перегруза КТК (ПВ-ФИТ), факт. дата начала → Станция перегруза
    peregr_nach: 23,  // После перегруза (начало)
    dest:        24,  // Конечная станция
    lot:         25,
    priem_por:   28,  // Прием порожнего → Груз доставлен
  };

  // Сегодняшняя дата для проверки
  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);

  // Конвертация даты → DD.MM.YYYY
  // Возвращает { str, isPast } — строку даты и флаг "дата уже прошла"
  function excelDate(val) {
    if (!val || val === "(пусто)" || val.trim() === "") return null;
    const s = val.trim();

    let dateStr = null;
    let dateObj = null;

    // Уже в формате DD.MM.YYYY
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
      dateStr = s;
      const [dd, mm, yyyy] = s.split(".");
      dateObj = new Date(+yyyy, +mm - 1, +dd);
    }
    // Формат M/D/YYYY (Google Sheets иногда отдаёт так)
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const [m, d, y] = s.split("/");
      dateStr = `${d.padStart(2,"0")}.${m.padStart(2,"0")}.${y}`;
      dateObj = new Date(+y, +m - 1, +d);
    }
    // Числовая дата Excel
    else {
      const n = parseFloat(s);
      if (!isNaN(n) && n > 40000) {
        const date = new Date((n - 25569) * 86400 * 1000);
        const dd   = String(date.getUTCDate()).padStart(2, "0");
        const mm   = String(date.getUTCMonth() + 1).padStart(2, "0");
        const yyyy = date.getUTCFullYear();
        if (yyyy >= 2000 && yyyy <= 2100) {
          dateStr = `${dd}.${mm}.${yyyy}`;
          dateObj = new Date(yyyy, +mm - 1, +dd);
        }
      }
    }

    if (!dateStr || !dateObj) return null;

    const isPast = dateObj <= TODAY;
    return { str: dateStr, isPast };
  }

  const ROUTE_MAP = {
    "Белый Раст": "Китай — Белый Раст",
    "Аппаратная": "Китай — Аппаратная",
  };

  return rows.map(row => {
    const get   = i => (i >= 0 && i < row.length) ? row[i] : null;
    const dStr  = i => {
      const r = excelDate(get(i));
      if (!r) return null;
      return r.isPast ? r.str : `ожидается ${r.str}`;
    };
    const dDone = i => { const r = excelDate(get(i)); return r ? r.isPast : false; };

    const id = get(C.id) || "";
    if (!id || id === "Номер КТК") return null;

    const dest  = get(C.dest) || "";
    const route = ROUTE_MAP[dest] || `Китай — ${dest}`;

    const hasPeregr     = !!dStr(C.peregr_st);
    const hasPostPeregr = !!dStr(C.peregr_nach);
    const peregrStation = get(C.peregr_stancia) || "";

    const statuses = [
      { title: "Создан",
        date: dStr(C.dvizh_nach), done: dDone(C.dvizh_nach) },
      { title: "Движение КТК на судне",
        date: null, done: dDone(C.dvizh_nach), isHeader: true },
      { title: "Погрузка на судно",
        date: dStr(C.dvizh_nach), done: dDone(C.dvizh_nach) },
      { title: "Выгрузка с судна",
        date: dStr(C.vygruzka), done: dDone(C.vygruzka) },
      { title: "Таможенное оформление",
        date: null, done: dDone(C.teleks), isHeader: true },
      { title: "Появление телекса",
        date: dStr(C.teleks), done: dDone(C.teleks) },
      { title: "Получение декларации на товары",
        date: dStr(C.deklarac), done: dDone(C.deklarac) },
      { title: "Получение поручения на отправку по ж/д",
        date: dStr(C.poruchenie), done: dDone(C.poruchenie) },
      { title: "Дата готовности КТК к вывозу с порта",
        date: dStr(C.gotovnost), done: dDone(C.gotovnost) },
      { title: "Отправка по ж/д",
        date: null, done: dDone(C.otpr_jd), isHeader: true },
      { title: "Движение по ж/д",
        date: dStr(C.otpr_jd), done: dDone(C.otpr_jd) },
      ...(hasPeregr ? [
        { title: peregrStation ? `Станция перегруза: ${peregrStation}` : "Станция перегруза",
          date: dStr(C.peregr_st), done: dDone(C.peregr_st) },
      ] : []),
      ...(hasPostPeregr ? [
        { title: "Движение по ж/д после перегруза",
          date: dStr(C.peregr_nach), done: dDone(C.peregr_nach) },
      ] : []),
      { title: "Груз доставлен",
        date: dStr(C.priem_por), done: dDone(C.priem_por) },
    ];

    const nonHeaders = statuses.filter(s => !s.isHeader);
    const allDone    = nonHeaders.every(s => s.done);
    const badge      = allDone
      ? { label: "Готово", variant: "done"    }
      : { label: "В пути", variant: "transit" };

    const summarySteps = [
      { title: "Создан",                date: dStr(C.dvizh_nach) },
      { title: "Движение КТК на судне", date: dStr(C.dvizh_nach) },
      { title: "Таможенное оформление", date: dStr(C.teleks)     },
      { title: "Отправка по ж/д",       date: dStr(C.otpr_jd)    },
      { title: "Груз доставлен",        date: dStr(C.priem_por)  },
    ];
    // currentStep — последний шаг с датой в прошлом
    const summaryCurrentStep = Math.max(
      0,
      ...summarySteps.map((s, i) => (s.date && dDone(
        [C.dvizh_nach, C.dvizh_nach, C.teleks, C.otpr_jd, C.priem_por][i]
      )) ? i : -1)
    );

    const info = {
      "Размер КТК": get(C.razmer)   || "—",
      "Судно":      get(C.sudno)    || "—",
      "Рейс":       get(C.reys)     || "—",
      "Терминал":   get(C.terminal) || "—",
      "№ лота":     get(C.lot)      || "—",
      "Тип":        [get(C.sobstv), get(C.prinadl)].filter(Boolean).join(" / ") || "—",
    };

    const documents = [
      { title: "Телекс",                       done: dDone(C.teleks)     },
      { title: "Декларация на товары",         done: dDone(C.deklarac)   },
      { title: "Поручение на отправку по ж/д", done: dDone(C.poruchenie) },
    ];

    return {
      id, route, badge,
      owner: get(1) || "",   // колонка [1] — Владелец КТК
      summary: { steps: summarySteps, currentStep: summaryCurrentStep },
      statuses, info, documents,
    };
  }).filter(Boolean);
}

// ─── РЕНДЕР КАРТОЧЕК ─────────────────────────────────────────────────────────

function renderCards(containers) {
  const el = document.getElementById("card-container");
  if (!el) return;

  if (containers.length === 0) {
    el.innerHTML = `<div class="loading-msg">Нет данных для отображения</div>`;
    return;
  }

  el.innerHTML = containers.map(item => {
    const badgeHtml = item.badge.variant === "done"
      ? `<span class="status-badge badge-done">${item.badge.label}</span>`
      : `<span class="status-badge badge-transit">${item.badge.label}</span>`;

    const { steps, currentStep } = item.summary;
    const tlHtml = steps.map((s, i) => {
      const done    = i <= currentStep;
      const isLast  = i === steps.length - 1;
      const lineOff = !done || (!isLast && i + 1 > currentStep);
      return `
        <div class="tl-row">
          <div class="tl-spine">
            <div class="tl-dot ${done ? "tl-dot-done" : "tl-dot-off"}"></div>
            ${!isLast ? `<div class="tl-line ${lineOff ? "tl-line-off" : "tl-line-done"}"></div>` : ""}
          </div>
          <div class="tl-body">
            <div class="tl-name">${s.title}</div>
            ${s.date ? `<div class="tl-date">${s.date}</div>` : ""}
          </div>
        </div>`;
    }).join("");

    return `
      <div class="track-card" onclick="openDetail('${item.id}')">
        <div class="card-header">
          <div class="track-title-row">
            <span class="track-number">${item.id}</span>
            ${badgeHtml}
          </div>
          <span class="route-info">${item.route}</span>
        </div>
        <div class="statuses-title">Статусы доставки</div>
        <div class="timeline">${tlHtml}</div>
      </div>`;
  }).join("");
}

// ─── ПАНЕЛЬ ДОКУМЕНТОВ (детальный экран КТК) ─────────────────────────────────

function renderDocsPanel(item) {
  const rowsHtml = item.documents.map(doc => `
    <div class="docs-row">
      <span class="docs-row-label">${doc.title}</span>
      ${doc.done ? `
        <svg class="docs-check" width="18" height="18" fill="none" stroke="#1a7a17" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
          <polyline points="20 6 9 17 4 12"/>
        </svg>` : ""}
    </div>`).join("");

  return `
    <div class="docs-card">
      <div class="docs-title">Документы</div>
      ${rowsHtml}
    </div>`;
}

// ─── ДЕТАЛЬНЫЙ ЭКРАН КТК ─────────────────────────────────────────────────────

function renderDetail(item) {
  const root = document.getElementById("detail-root");
  if (!root) return;

  const badgeHtml = item.badge.variant === "done"
  ? `<span class="status-badge badge-done">${item.badge.label}</span>`
  : `<span class="status-badge badge-transit">${item.badge.label}</span>`;

  const tlHtml = item.statuses.map((s, i) => {
    const hasLineAfter = i < item.statuses.length - 1;
    const next = item.statuses.slice(i+1).find(x => !x.isHeader);
    const lineOff = !s.done || (next && !next.done);

    if (s.isHeader) {
      return `
        <div class="dtl-row">
          <div class="dtl-spine">
            <div class="dtl-dot ${s.done ? "dtl-dot-done" : "dtl-dot-off"} dtl-dot-header"></div>
            ${hasLineAfter ? `<div class="dtl-line ${lineOff ? "dtl-line-off" : "dtl-line-done"}"></div>` : ""}
          </div>
          <div class="dtl-content">
            <div class="dtl-title dtl-title-header">${s.title}</div>
          </div>
        </div>`;
    }

    const isLast = !item.statuses.slice(i+1).some(x => !x.isHeader);
    return `
      <div class="dtl-row">
        <div class="dtl-spine">
          <div class="dtl-dot ${s.done ? "dtl-dot-done" : "dtl-dot-off"}"></div>
          ${!isLast ? `<div class="dtl-line ${lineOff ? "dtl-line-off" : "dtl-line-done"}"></div>` : ""}
        </div>
        <div class="dtl-content">
          <div class="dtl-title ${s.done ? "" : "dtl-title-off"}">${s.title}</div>
          ${s.date ? `<div class="dtl-date">${s.date}</div>` : ""}
        </div>
      </div>`;
  }).join("");

  const infoHtml = Object.entries(item.info).map(([k, v]) => `
    <div class="info-row">
      <span class="info-label">${k}</span>
      <span class="info-value">${v}</span>
    </div>`).join("");

  root.innerHTML = `
    <button class="detail-back" onclick="history.back()">
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      Назад
    </button>

    <div class="detail-layout">
      <div class="detail-main">
        <div class="detail-card">
          <div class="detail-head-row">
            <div class="detail-id">${item.id}</div>
            ${badgeHtml}
          </div>
          <div class="detail-route">${item.route}</div>
          <div class="detail-section">Статусы доставки</div>
          <div>${tlHtml}</div>
        </div>

        <div class="info-table">${infoHtml}</div>
      </div>

      <div class="detail-side">
        ${renderDocsPanel(item)}
      </div>
    </div>`;
}

// ─── РЕНДЕР: список КТК для страницы Документация ────────────────────────────

function renderDocsList(containers) {
  const el = document.getElementById("docs-list-container");
  if (!el) return;

  if (containers.length === 0) {
    el.innerHTML = `<div class="loading-msg">Нет контейнеров</div>`;
    return;
  }

  el.innerHTML = containers.map(item => {
    const badgeHtml = item.badge.variant === "done"
      ? `<span class="status-badge badge-done">${item.badge.label}</span>`
      : `<span class="status-badge badge-transit">${item.badge.label}</span>`;

    return `
      <a class="docs-ktk-card" href="docs-detail.html?id=${encodeURIComponent(item.id)}">
        <div class="docs-ktk-left">
          <div class="docs-ktk-id">${item.id}</div>
          <div class="docs-ktk-route">${item.route}</div>
        </div>
        <div class="docs-ktk-right">
          ${badgeHtml}
          <svg width="16" height="16" fill="none" stroke="#9b9b9b" stroke-width="2.2"
            stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </a>`;
  }).join("");
}

// ─── РЕНДЕР: экран скачивания документов конкретного КТК ─────────────────────

// Названия PDF-файлов внутри папки контейнера.
// Если у тебя другие имена файлов — измени этот массив.
const DOC_FILES = [
  "АКТ сдачи-приёмки оказанных услуг к договору",
  "Акт сдачи-приёмки",
  "Счёт на оплату",
  "Счёт-фактура",
];

// Путь: документы ктк/{id}/{название}.pdf
function getDocPath(containerId, docName) {
  return `документы ктк/${containerId}/${docName}.pdf`;
}

function renderDocsDetail(item) {
  const root = document.getElementById("docs-dl-root");
  if (!root) return;

  const rowsHtml = DOC_FILES.map(name => {
    const path = getDocPath(item.id, name);
    return `
      <div class="docs-dl-row">
        <span class="docs-dl-label">${name}</span>
        <a href="${path}" download="${name}.pdf" class="docs-dl-btn" title="Скачать">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </a>
      </div>`;
  }).join("");

  root.innerHTML = `
    <button class="docs-dl-back" onclick="history.back()">
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      Назад
    </button>
    <div class="docs-dl-card">
      <div class="docs-dl-heading">Документация</div>
      <div class="docs-dl-sub">${item.id} · ${item.route}</div>
      ${rowsHtml}
    </div>`;
}

// ─── НАВИГАЦИЯ ────────────────────────────────────────────────────────────────

function openDetail(id) {
  window.location.href = `detail.html?id=${encodeURIComponent(id)}`;
}

function logout() {
  localStorage.removeItem("currentUser");
  window.location.href = "index.html";
}

// ─── ИНИЦИАЛИЗАЦИЯ ────────────────────────────────────────────────────────────

async function init() {
  const stored = JSON.parse(localStorage.getItem("currentUser") || "{}");
  currentUser = stored.username || null;

  // Если не авторизован — редирект на вход
  if (!currentUser && !window.location.pathname.endsWith("index.html")) {
    window.location.href = "index.html";
    return;
  }

  // Обновляем шапку — поддерживаем оба варианта id
  const acc = ACCOUNTS[currentUser] || stored;
  ["header-name", "header-username"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = acc.name || acc.username || "";
  });
  ["header-phone"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = acc.phone || "";
  });

  // Загружаем данные
  try {
    const res  = await fetch(SHEETS_URL);
    const text = await res.text();
    allData = parseCSV(text);

    // Фильтруем по владельцу
    const userContainers = allData.filter(s => s.owner === currentUser);

    // ── Детальный экран КТК ──
    if (window.__detailMode) {
      const id   = new URLSearchParams(window.location.search).get("id");
      const item = allData.find(s => s.id === id);
      if (item) {
        renderDetail(item);
      } else {
        document.getElementById("detail-root").innerHTML =
          `<div class="error-msg">Контейнер не найден</div>`;
      }
      return;
    }

    // ── Список КТК на странице Документация ──
    if (window.__docsListMode) {
      renderDocsList(userContainers);
      return;
    }

    // ── Скачивание документов конкретного КТК ──
    if (window.__docsDetailMode) {
      const id   = new URLSearchParams(window.location.search).get("id");
      const item = allData.find(s => s.id === id);
      if (item) {
        renderDocsDetail(item);
      } else {
        document.getElementById("docs-dl-root").innerHTML =
          `<div class="error-msg">Контейнер не найден</div>`;
      }
      return;
    }

    // ── Главный экран ──
    renderCards(userContainers);

    // Поиск — поддерживаем и id="search-input" и class="search-input"
    const searchInput = document.getElementById("search-input")
                     || document.querySelector(".search-input");
    if (searchInput) {
      searchInput.addEventListener("input", e => {
        const q = e.target.value.toLowerCase().trim();
        const filtered = q
          ? userContainers.filter(s =>
              s.id.toLowerCase().includes(q) || s.route.toLowerCase().includes(q))
          : userContainers;
        renderCards(filtered);
      });
    }

  } catch (err) {
    console.error("Ошибка загрузки:", err);
    const el = document.getElementById("card-container")
            || document.getElementById("detail-root")
            || document.getElementById("docs-list-container")
            || document.getElementById("docs-dl-root");
    if (el) el.innerHTML = `<div class="error-msg">Не удалось загрузить данные</div>`;
  }
}

init();