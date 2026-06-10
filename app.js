'use strict';

// ---------- Storage ----------

const STORAGE = {
  entries: 'surveyTracker.entries',
  platforms: 'surveyTracker.platforms',
  settings: 'surveyTracker.settings',
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const state = {
  entries: loadJSON(STORAGE.entries, []),       // { id, amount, platform, timestamp }
  platforms: loadJSON(STORAGE.platforms, []),   // string[]
  settings: Object.assign({ currency: '$' }, loadJSON(STORAGE.settings, {})),
  view: 'weekly',
  anchor: new Date(),
  editingId: null,
};

function persistEntries() { saveJSON(STORAGE.entries, state.entries); }
function persistPlatforms() { saveJSON(STORAGE.platforms, state.platforms); }
function persistSettings() { saveJSON(STORAGE.settings, state.settings); }

// ---------- Helpers ----------

const $ = (sel) => document.querySelector(sel);

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function money(n) {
  return `${state.settings.currency}${n.toFixed(2)}`;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // week starts Monday
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fmtDayShort = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const fmtDayFull = new Intl.DateTimeFormat(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const fmtMonth = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const fmtMonthShort = new Intl.DateTimeFormat(undefined, { month: 'short' });
const fmtWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const fmtEntry = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Returns { start, end, label } — end is exclusive.
function getPeriodRange(view, anchor) {
  if (view === 'daily') {
    const start = startOfDay(anchor);
    return { start, end: addDays(start, 1), label: fmtDayFull.format(start) };
  }
  if (view === 'weekly') {
    const start = startOfWeek(anchor);
    const end = addDays(start, 7);
    return { start, end, label: `${fmtDayShort.format(start)} – ${fmtDayShort.format(addDays(end, -1))}, ${end.getFullYear()}` };
  }
  if (view === 'monthly') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    return { start, end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1), label: fmtMonth.format(start) };
  }
  const start = new Date(anchor.getFullYear(), 0, 1);
  return { start, end: new Date(anchor.getFullYear() + 1, 0, 1), label: String(anchor.getFullYear()) };
}

function shiftAnchor(view, anchor, dir) {
  if (view === 'daily') return addDays(anchor, dir);
  if (view === 'weekly') return addDays(anchor, dir * 7);
  if (view === 'monthly') return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  return new Date(anchor.getFullYear() + dir, 0, 1);
}

function entriesIn(start, end) {
  const s = start.getTime();
  const e = end.getTime();
  return state.entries.filter((x) => x.timestamp >= s && x.timestamp < e);
}

function sum(entries) {
  return entries.reduce((acc, x) => acc + x.amount, 0);
}

// ---------- Rendering ----------

function render() {
  renderSummary();
  renderPlatformSelect($('#platform-select'));
  renderPeriod();
  $('#currency-prefix').textContent = state.settings.currency;
  $('#no-platform-hint').classList.toggle('hidden', state.platforms.length > 0);
}

function renderSummary() {
  const now = new Date();
  const periods = [
    ['Today', getPeriodRange('daily', now)],
    ['This week', getPeriodRange('weekly', now)],
    ['This month', getPeriodRange('monthly', now)],
    ['This year', getPeriodRange('yearly', now)],
  ];
  const cards = periods.map(([label, { start, end }]) =>
    summaryCard(label, sum(entriesIn(start, end))));
  cards.push(summaryCard('All time', sum(state.entries)));
  $('#summary-cards').replaceChildren(...cards);
}

function summaryCard(label, total) {
  const div = document.createElement('div');
  div.className = 'summary-card';
  const l = document.createElement('div');
  l.className = 'label';
  l.textContent = label;
  const v = document.createElement('div');
  v.className = 'value';
  v.textContent = money(total);
  div.append(l, v);
  return div;
}

function renderPlatformSelect(select, selected) {
  const platforms = [...state.platforms];
  if (selected && !platforms.includes(selected)) platforms.push(selected);
  const prev = selected ?? select.value;
  select.replaceChildren();
  if (platforms.length === 0) {
    const opt = new Option('Add a platform first…', '');
    opt.disabled = true;
    opt.selected = true;
    select.add(opt);
    return;
  }
  for (const p of platforms) select.add(new Option(p, p));
  if (platforms.includes(prev)) select.value = prev;
}

function renderPeriod() {
  const { start, end, label } = getPeriodRange(state.view, state.anchor);
  const entries = entriesIn(start, end);

  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('active', tab.dataset.view === state.view);
  }
  $('#period-label').textContent = label;
  $('#period-total').textContent = money(sum(entries));
  $('#breakdown-period').textContent = `· ${label}`;
  $('#entries-period').textContent = `· ${label}`;

  renderChart(start, end, entries);
  renderBreakdown(entries);
  renderEntries(entries);
}

function chartBuckets(start, end, entries) {
  if (state.view === 'daily') {
    // One bar per platform for the day
    const byPlatform = new Map();
    for (const e of entries) byPlatform.set(e.platform, (byPlatform.get(e.platform) ?? 0) + e.amount);
    return [...byPlatform.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, total]) => ({ label, total, showLabel: true, showValue: true }));
  }
  if (state.view === 'weekly') {
    return Array.from({ length: 7 }, (_, i) => {
      const dayStart = addDays(start, i);
      return {
        label: fmtWeekday.format(dayStart),
        total: sum(entriesIn(dayStart, addDays(dayStart, 1))),
        showLabel: true,
        showValue: true,
      };
    });
  }
  if (state.view === 'monthly') {
    const days = Math.round((end - start) / 86400000);
    return Array.from({ length: days }, (_, i) => {
      const dayStart = addDays(start, i);
      const day = i + 1;
      return {
        label: String(day),
        total: sum(entriesIn(dayStart, addDays(dayStart, 1))),
        showLabel: day === 1 || day % 5 === 0,
        showValue: false,
        title: fmtDayShort.format(dayStart),
      };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const mStart = new Date(start.getFullYear(), i, 1);
    return {
      label: fmtMonthShort.format(mStart),
      total: sum(entriesIn(mStart, new Date(start.getFullYear(), i + 1, 1))),
      showLabel: true,
      showValue: true,
    };
  });
}

function renderChart(start, end, entries) {
  const chart = $('#chart');
  chart.replaceChildren();
  if (entries.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'chart-empty';
    msg.textContent = 'No earnings in this period yet.';
    chart.append(msg);
    return;
  }
  const buckets = chartBuckets(start, end, entries);
  const max = Math.max(...buckets.map((b) => b.total), 0.01);
  for (const b of buckets) {
    const col = document.createElement('div');
    col.className = 'chart-col';
    col.title = `${b.title ?? b.label}: ${money(b.total)}`;

    if (b.showValue && b.total > 0) {
      const val = document.createElement('div');
      val.className = 'chart-value';
      val.textContent = money(b.total);
      col.append(val);
    }
    const bar = document.createElement('div');
    bar.className = 'chart-bar' + (b.total === 0 ? ' empty' : '');
    bar.style.height = `${Math.max((b.total / max) * 100, 1)}%`;
    const label = document.createElement('div');
    label.className = 'chart-label';
    label.textContent = b.showLabel ? b.label : ' ';
    col.append(bar, label);
    chart.append(col);
  }
}

function renderBreakdown(entries) {
  const container = $('#breakdown');
  if (entries.length === 0) {
    container.replaceChildren(emptyMsg('Nothing to break down yet.'));
    return;
  }
  const total = sum(entries);
  const byPlatform = new Map();
  for (const e of entries) {
    const row = byPlatform.get(e.platform) ?? { total: 0, count: 0 };
    row.total += e.amount;
    row.count += 1;
    byPlatform.set(e.platform, row);
  }
  const rows = [...byPlatform.entries()].sort((a, b) => b[1].total - a[1].total);

  const table = document.createElement('table');
  table.innerHTML = `<thead><tr>
    <th>Platform</th><th class="num">Entries</th><th class="num">Total</th>
    <th class="num">Share</th><th></th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');
  for (const [platform, { total: pTotal, count }] of rows) {
    const tr = document.createElement('tr');
    const share = total > 0 ? (pTotal / total) * 100 : 0;
    const cells = [
      ['td', platform],
      ['td num', String(count)],
      ['td num', money(pTotal)],
      ['td num', `${share.toFixed(1)}%`],
    ];
    for (const [cls, text] of cells) {
      const td = document.createElement('td');
      if (cls.includes('num')) td.className = 'num';
      td.textContent = text;
      tr.append(td);
    }
    const barTd = document.createElement('td');
    barTd.innerHTML = `<div class="share-bar"><div class="share-fill" style="width:${share.toFixed(1)}%"></div></div>`;
    tr.append(barTd);
    tbody.append(tr);
  }
  table.append(tbody);
  container.replaceChildren(table);
}

function renderEntries(entries) {
  const list = $('#entries-list');
  if (entries.length === 0) {
    list.replaceChildren(emptyMsg('No entries in this period.'));
    return;
  }
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);
  list.replaceChildren(...sorted.map((e) => {
    const row = document.createElement('div');
    row.className = 'entry-row';

    const when = document.createElement('span');
    when.className = 'entry-when';
    when.textContent = fmtEntry.format(new Date(e.timestamp));

    const platform = document.createElement('span');
    platform.className = 'entry-platform';
    platform.textContent = e.platform;

    const amount = document.createElement('span');
    amount.className = 'entry-amount';
    amount.textContent = money(e.amount);

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-ghost btn-icon';
    editBtn.textContent = '✎';
    editBtn.title = 'Edit';
    editBtn.addEventListener('click', () => openEditDialog(e.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost btn-icon btn-danger';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', () => {
      if (confirm(`Delete ${money(e.amount)} from ${e.platform}?`)) {
        state.entries = state.entries.filter((x) => x.id !== e.id);
        persistEntries();
        render();
      }
    });

    row.append(when, platform, amount, editBtn, delBtn);
    return row;
  }));
}

function emptyMsg(text) {
  const div = document.createElement('div');
  div.className = 'empty-msg';
  div.textContent = text;
  return div;
}

// ---------- Add entry ----------

$('#entry-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const amount = parseFloat($('#amount-input').value);
  const platform = $('#platform-select').value;
  const when = new Date($('#datetime-input').value);
  if (!platform || !Number.isFinite(amount) || amount <= 0 || isNaN(when.getTime())) return;

  state.entries.push({ id: uid(), amount: Math.round(amount * 100) / 100, platform, timestamp: when.getTime() });
  persistEntries();
  $('#amount-input').value = '';
  $('#datetime-input').value = toLocalInputValue(new Date());
  render();
  $('#amount-input').focus();
});

// ---------- Edit entry ----------

const editDialog = $('#edit-dialog');

function openEditDialog(id) {
  const entry = state.entries.find((x) => x.id === id);
  if (!entry) return;
  state.editingId = id;
  $('#edit-amount').value = entry.amount;
  renderPlatformSelect($('#edit-platform'), entry.platform);
  $('#edit-datetime').value = toLocalInputValue(new Date(entry.timestamp));
  editDialog.showModal();
}

$('#edit-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const entry = state.entries.find((x) => x.id === state.editingId);
  const amount = parseFloat($('#edit-amount').value);
  const when = new Date($('#edit-datetime').value);
  if (!entry || !Number.isFinite(amount) || amount <= 0 || isNaN(when.getTime())) return;
  entry.amount = Math.round(amount * 100) / 100;
  entry.platform = $('#edit-platform').value;
  entry.timestamp = when.getTime();
  persistEntries();
  editDialog.close();
  render();
});

$('#edit-cancel').addEventListener('click', () => editDialog.close());

// ---------- Platforms & settings ----------

const platformsDialog = $('#platforms-dialog');

function renderPlatformsList() {
  const list = $('#platforms-list');
  list.replaceChildren(...state.platforms.map((p) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = p;
    const del = document.createElement('button');
    del.className = 'btn btn-ghost btn-icon btn-danger';
    del.textContent = '✕';
    del.title = 'Remove platform';
    del.addEventListener('click', () => {
      const used = state.entries.some((e) => e.platform === p);
      const msg = used
        ? `Remove "${p}" from the list? Existing entries keep this platform name.`
        : `Remove "${p}" from the list?`;
      if (confirm(msg)) {
        state.platforms = state.platforms.filter((x) => x !== p);
        persistPlatforms();
        renderPlatformsList();
        render();
      }
    });
    li.append(name, del);
    return li;
  }));
}

$('#manage-platforms-btn').addEventListener('click', () => {
  renderPlatformsList();
  $('#currency-input').value = state.settings.currency;
  platformsDialog.showModal();
  $('#new-platform-input').focus();
});

$('#add-platform-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const input = $('#new-platform-input');
  const name = input.value.trim();
  if (!name) return;
  const exists = state.platforms.some((p) => p.toLowerCase() === name.toLowerCase());
  if (!exists) {
    state.platforms.push(name);
    state.platforms.sort((a, b) => a.localeCompare(b));
    persistPlatforms();
    renderPlatformsList();
    render();
  }
  input.value = '';
  input.focus();
});

$('#currency-input').addEventListener('change', () => {
  state.settings.currency = $('#currency-input').value.trim() || '$';
  persistSettings();
  render();
});

$('#platforms-close').addEventListener('click', () => platformsDialog.close());

// ---------- Period navigation ----------

$('#view-tabs').addEventListener('click', (ev) => {
  const view = ev.target.dataset?.view;
  if (!view) return;
  state.view = view;
  renderPeriod();
});

$('#prev-period').addEventListener('click', () => {
  state.anchor = shiftAnchor(state.view, state.anchor, -1);
  renderPeriod();
});

$('#next-period').addEventListener('click', () => {
  state.anchor = shiftAnchor(state.view, state.anchor, 1);
  renderPeriod();
});

$('#today-btn').addEventListener('click', () => {
  state.anchor = new Date();
  renderPeriod();
});

// ---------- CSV export ----------

$('#export-csv-btn').addEventListener('click', () => {
  if (state.entries.length === 0) {
    alert('No entries to export yet.');
    return;
  }
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const pad = (n) => String(n).padStart(2, '0');
  const lines = ['Date,Time,Platform,Amount'];
  const sorted = [...state.entries].sort((a, b) => a.timestamp - b.timestamp);
  for (const e of sorted) {
    const d = new Date(e.timestamp);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    lines.push([date, time, esc(e.platform), e.amount.toFixed(2)].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `survey-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- Init ----------

$('#datetime-input').value = toLocalInputValue(new Date());
render();
