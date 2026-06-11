// ─── CONFIG ──────────────────────────────────────────────────────────────────

const SHEETS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTPbZ92r4ihDUvBwjPLW4Jkg7Ni4tgmeNcF5Z1402pn3AhNfd5CRSYutELmfjyoLP5IkQS0WtZZ3rFq/pub?output=csv";

const ACCOUNTS = {
  'User_1': { name: 'User_1', phone: '+7 123 456 79 10' },
  'User_2': { name: 'User_2', phone: '+7 987 654 32 10' },
};

const ROUTE_MAP = {
  "Белый Раст": "Китай — Белый Раст",
  "Аппаратная": "Китай — Аппаратная",
};

// Индексы колонок Google Sheets
const C = {
  id:          0,
  owner:       1,
  sobstv:      2,
  prinadl:     3,
  razmer:      4,
  dvizh_nach:  8,
  dvizh_kon:   9,
  reys:        10,
  sudno:       11,
  vygruzka:    12,
  terminal:    13,
  teleks:      14,
  deklarac:    15,
  poruchenie:  16,
  gotovnost:   17,
  otpr_jd:     18,
  dvizh_jd:    19,
  peregr_nach: 22,
  dest:        24,
  lot:         25,
  priem_por:   28,
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

  const rows = lines.slice(1).map(parseLine);

  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);

  function parseDate(val) {
    if (!val || val.trim() === "" || val === "(пусто)") return null;
    const s = val.trim();
    let dateStr = null, dateObj = null;

    if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
      dateStr = s;
      const [dd, mm, yyyy] = s.split(".");
      dateObj = new Date(+yyyy, +mm - 1, +dd);
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const [m, d, y] = s.split("/");
      dateStr = `${d.padStart(2,"0")}.${m.padStart(2,"0")}.${y}`;
      dateObj = new Date(+y, +m - 1, +d);
    } else {
      const n = parseFloat(s);
      if (!isNaN(n) && n > 40000) {
        const dt = new Date((n - 25569) * 86400 * 1000);
        const dd = String(dt.getUTCDate()).padStart(2,"0");
        const mm = String(dt.getUTCMonth()+1).padStart(2,"0");
        const yyyy = dt.getUTCFullYear();
        if (yyyy >= 2000 && yyyy <= 2100) {
          dateStr = `${dd}.${mm}.${yyyy}`;
          dateObj = new Date(yyyy, +mm - 1, +dd);
        }
      }
    }

    if (!dateStr || !dateObj) return null;
    return { str: dateStr, isPast: dateObj <= TODAY };
  }

  return rows.map(row => {
    const get   = i => (i >= 0 && i < row.length) ? row[i] : null;
    const dStr  = i => { const r = parseDate(get(i)); if (!r) return null; return r.isPast ? r.str : `ожидается ${r.str}`; };
    const dDone = i => { const r = parseDate(get(i)); return r ? r.isPast : false; };
    const dHas  = i => !!parseDate(get(i));

    const id = get(C.id) || "";
    if (!id || id === "Номер КТК") return null;

    const owner = (get(C.owner) || "").trim();
    const dest  = get(C.dest) || "";
    const route = ROUTE_MAP[dest] || `Китай — ${dest}`;

    const hasPeregr     = dHas(C.dvizh_jd);
    const hasPostPeregr = dHas(C.peregr_nach);

    const statuses = [
      { title: "Создан",                                  date: dStr(C.dvizh_nach),  done: dDone(C.dvizh_nach) },
      { title: "Движение КТК на судне",                   date: null,                done: dDone(C.dvizh_nach), isHeader: true },
      { title: "Погрузка на судно",                       date: dStr(C.dvizh_nach),  done: dDone(C.dvizh_nach) },
      { title: "Выгрузка с судна",                        date: dStr(C.vygruzka),    done: dDone(C.vygruzka) },
      { title: "Таможенное оформление",                   date: null,                done: dDone(C.teleks),    isHeader: true },
      { title: "Появление телекса",                       date: dStr(C.teleks),      done: dDone(C.teleks) },
      { title: "Получение декларации на товары",          date: dStr(C.deklarac),    done: dDone(C.deklarac) },
      { title: "Получение поручения на отправку по ж/д", date: dStr(C.poruchenie),  done: dDone(C.poruchenie) },
      { title: "Дата готовности КТК к вывозу с порта",   date: dStr(C.gotovnost),   done: dDone(C.gotovnost) },
      { title: "Отправка по ж/д",                        date: null,                done: dDone(C.otpr_jd),   isHeader: true },
      { title: "Движение по ж/д",                        date: dStr(C.otpr_jd),     done: dDone(C.otpr_jd) },
      ...(hasPeregr     ? [{ title: "Станция перегруза",               date: dStr(C.dvizh_jd),    done: dDone(C.dvizh_jd) }]    : []),
      ...(hasPostPeregr ? [{ title: "Движение по ж/д после перегруза", date: dStr(C.peregr_nach), done: dDone(C.peregr_nach) }] : []),
      { title: "Груз доставлен",                         date: dStr(C.priem_por),   done: dDone(C.priem_por) },
    ];

    const summary = [
      { title: "Создан",                date: dStr(C.dvizh_nach), done: dDone(C.dvizh_nach) },
      { title: "Движение КТК на судне", date: dStr(C.dvizh_nach), done: dDone(C.dvizh_nach) },
      { title: "Таможенное оформление", date: dStr(C.teleks),     done: dDone(C.teleks) },
      { title: "Отправка по ж/д",       date: dStr(C.otpr_jd),    done: dDone(C.otpr_jd) },
      { title: "Груз доставлен",        date: dStr(C.priem_por),  done: dDone(C.priem_por) },
    ];

    const nonHeaders = statuses.filter(s => !s.isHeader);
    const allDone    = nonHeaders.every(s => s.done);
    const badge      = allDone ? "done" : "transit";

    const info = {
      "Размер КТК": get(C.razmer)   || "—",
      "Судно":      get(C.sudno)    || "—",
      "Рейс":       get(C.reys)     || "—",
      "Терминал":   get(C.terminal) || "—",
      "№ лота":     get(C.lot)      || "—",
      "Тип":        [get(C.sobstv), get(C.prinadl)].filter(Boolean).join(" / ") || "—",
    };

    return { id, owner, route, badge, summary, statuses, info };
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
    const badgeHtml = item.badge === "done"
      ? `<span class="status-badge badge-done">Готово</span>`
      : `<span class="status-badge badge-transit">В пути</span>`;

    const tlHtml = item.summary.map((s, i) => {
      const isLast = i === item.summary.length - 1;
      const lineOff = !s.done || (!isLast && !item.summary[i+1]?.done);
      return `
        <div class="tl-row">
          <div class="tl-spine">
            <div class="tl-dot ${s.done ? "tl-dot-done" : "tl-dot-off"}"></div>
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

// ─── ДЕТАЛЬНЫЙ ЭКРАН ─────────────────────────────────────────────────────────

function renderDetail(item) {
  const root = document.getElementById("detail-root");
  if (!root) return;

  const badgeHtml = item.badge === "done"
    ? `<span class="status-badge badge-done">Готово</span>`
    : `<span class="status-badge badge-transit">В пути</span>`;

  const tlHtml = item.statuses.map((s, i) => {
    const hasLineAfter = i < item.statuses.length - 1;
    const next = item.statuses.slice(i+1).find(x => !x.isHeader);
    const lineOff = !s.done || (next && !next.done);

    if (s.isHeader) {
      return `
        <div class="dtl-row">
          <div class="dtl-spine">
            <div class="dtl-dot dtl-dot-done dtl-dot-header"></div>
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

    <div class="detail-card">
      <div class="detail-head-row">
        <div class="detail-id">${item.id}</div>
        ${badgeHtml}
      </div>
      <div class="detail-route">${item.route}</div>
      <div class="detail-section">Статусы доставки</div>
      <div>${tlHtml}</div>
    </div>

    <div class="info-table">${infoHtml}</div>`;
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
  // Читаем пользователя из localStorage (сохраняется в script_1.js при входе)
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

    // Детальный экран
    if (window.__detailMode) {
      const params = new URLSearchParams(window.location.search);
      const id     = params.get("id");
      const item   = allData.find(s => s.id === id);
      if (item) {
        renderDetail(item);
      } else {
        document.getElementById("detail-root").innerHTML =
          `<div class="error-msg">Контейнер не найден</div>`;
      }
      return;
    }

    // Главный экран
    renderCards(userContainers);

    // Поиск — поддерживаем и id="search-input" и class="search-input"
    const searchInput = document.getElementById("search-input")
                     || document.querySelector(".search-input");
    if (searchInput) {
      searchInput.addEventListener("input", e => {
        const q = e.target.value.toLowerCase().trim();
        const filtered = q
          ? userContainers.filter(s => s.id.toLowerCase().includes(q) || s.route.toLowerCase().includes(q))
          : userContainers;
        renderCards(filtered);
      });
    }

  } catch (err) {
    console.error("Ошибка загрузки:", err);
    const el = document.getElementById("card-container") || document.getElementById("detail-root");
    if (el) el.innerHTML = `<div class="error-msg">Не удалось загрузить данные</div>`;
  }
}

init();