'use strict';

/* global api */

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function h(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard'));
}

function download(filename, text, mime = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`Saved ${filename} to Downloads`);
}

function toCsv(rows) {
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

function fmtDate(utcSeconds) {
  return new Date(utcSeconds * 1000).toLocaleDateString();
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sourceLabel(source) {
  return { live: 'Live data', cache: 'Cached data', 'stale-cache': 'Stale cache (refresh failed)', demo: 'DEMO DATA' }[source] || source;
}

// Segmented 30/60/90 control. onChange(days) is called immediately with the default.
function daysSegment(onChange, initial = 30) {
  const wrap = document.createElement('div');
  wrap.className = 'seg';
  for (const d of [30, 60, 90]) {
    const b = document.createElement('button');
    b.textContent = `${d} days`;
    if (d === initial) b.classList.add('active');
    b.addEventListener('click', () => {
      $$('button', wrap).forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      onChange(d);
    });
    wrap.appendChild(b);
  }
  queueMicrotask(() => onChange(initial));
  return wrap;
}

function bindExternalLinks(root) {
  $$('a[data-ext]', root).forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      api.openExternal(a.getAttribute('href'));
    });
  });
}

// ---------- navigation ----------
const renderers = {};
let currentView = 'dashboard';

function showView(name) {
  currentView = name;
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${name}`).classList.remove('hidden');
  renderers[name]?.();
}

$$('.nav-btn').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

async function refreshStatus(force = false) {
  const el = $('#data-status');
  el.textContent = force ? 'Refreshing…' : 'Loading data…';
  const s = await api.status({ force });
  const when = s.fetchedAt ? new Date(s.fetchedAt).toLocaleString() : 'n/a';
  el.innerHTML = `${h(sourceLabel(s.source))} · ${s.postCount} posts<br><span class="muted">Fetched: ${h(when)}</span>`;
  const banner = $('#demo-banner');
  if (s.source === 'demo') {
    banner.textContent = '⚠ Showing bundled demo data — Reddit could not be reached and no cache exists yet. Check your connection, then hit Refresh in Settings.';
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
  return s;
}

// Hand-off used by "→ Ideas" buttons across views.
function openIdeas(topic, site = null) {
  showView('ideas');
  $('#idea-topic').value = topic;
  if (site) $('#idea-site').value = site;
  $('#idea-generate').click();
}

// ---------- Dashboard ----------
renderers.dashboard = async function () {
  const view = $('#view-dashboard');
  view.innerHTML = `<h1>Dashboard</h1><p class="subtitle">Your survey/beermoney content business at a glance.</p><div class="cards-row" id="dash-cards"></div><div class="card"><h2>🚀 Rising right now (last 48h)</h2><div id="dash-rising">Loading…</div></div><div class="card"><h2>👀 Watchlist hits (last 30 days)</h2><div id="dash-watch">Loading…</div></div>`;

  const [q, sites, rising, watch, revenue, calendar] = await Promise.all([
    api.topQuestions(30), api.topSites(30), api.rising(), api.watchlist(30),
    api.getCollection('revenue'), api.getCollection('calendar')
  ]);

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthRevenue = revenue.filter((r) => new Date(r.date) >= monthStart).reduce((s, r) => s + Number(r.amount || 0), 0);
  const inProgress = calendar.filter((c) => c.status !== 'published').length;

  $('#dash-cards').innerHTML = `
    <div class="stat-card"><div class="label">Top question (30d)</div><div class="value" style="font-size:14px">${h(q.items[0]?.title || '—')}</div><div class="sub">${q.items[0] ? `${q.items[0].score} pts · ${q.items[0].comments} comments` : ''}</div></div>
    <div class="stat-card"><div class="label">Most mentioned site (30d)</div><div class="value">${h(sites.items[0]?.name || '—')}</div><div class="sub">${sites.items[0] ? `${sites.items[0].mentions} mentions` : ''}</div></div>
    <div class="stat-card"><div class="label">Affiliate revenue this month</div><div class="value">$${monthRevenue.toFixed(2)}</div><div class="sub">${revenue.length} entries total</div></div>
    <div class="stat-card"><div class="label">Content in pipeline</div><div class="value">${inProgress}</div><div class="sub">${calendar.length} planned total</div></div>`;

  $('#dash-rising').innerHTML = rising.items.length
    ? rising.items.slice(0, 5).map((p, i) => `
        <div class="rank-row"><div class="rank-num">${i + 1}</div>
        <div class="rank-main"><div class="rank-title"><a href="${h(p.url)}" data-ext>${h(p.title)}</a></div>
        <div class="rank-meta">r/${h(p.subreddit)} · ${p.score} pts · ${p.comments} comments · velocity ${p.velocity}/hr</div></div></div>`).join('')
    : '<div class="empty">Nothing rising in the last 48 hours.</div>';

  const hits = watch.items.filter((w) => w.count > 0);
  $('#dash-watch').innerHTML = hits.length
    ? hits.map((w) => `<div class="rank-row"><div class="rank-main"><div class="rank-title">"${h(w.term)}" — ${w.count} match${w.count === 1 ? '' : 'es'}</div><div class="rank-meta">${h(w.matches[0]?.title || '')}</div></div></div>`).join('')
    : '<div class="empty">No watchlist matches. Add terms under Rising &amp; Watchlist.</div>';

  bindExternalLinks(view);
};

// ---------- Top Questions ----------
renderers.questions = function () {
  const view = $('#view-questions');
  view.innerHTML = `<h1>Top Questions</h1><p class="subtitle">The 20 most-asked, most-discussed survey/beermoney questions — each one is an article or video waiting to be made.</p><div class="toolbar" id="q-toolbar"></div><div class="card"><div id="q-list">Loading…</div></div>`;

  let lastItems = [];
  let lastDays = 30;
  const toolbar = $('#q-toolbar');
  toolbar.appendChild(daysSegment(async (days) => {
    lastDays = days;
    $('#q-list').textContent = 'Loading…';
    const res = await api.topQuestions(days);
    lastItems = res.items;
    $('#q-list').innerHTML = res.items.length
      ? res.items.map((p, i) => `
          <div class="rank-row"><div class="rank-num">${i + 1}</div>
          <div class="rank-main"><div class="rank-title"><a href="${h(p.url)}" data-ext>${h(p.title)}</a></div>
          <div class="rank-meta">r/${h(p.subreddit)} · ${p.score} pts · ${p.comments} comments · ${fmtDate(p.createdUtc)}</div></div>
          <div class="rank-actions"><button class="btn btn-sm" data-idea="${h(p.title)}">💡 Ideas</button></div></div>`).join('')
      : '<div class="empty">No questions found in this window.</div>';
    bindExternalLinks(view);
    $$('[data-idea]', view).forEach((b) => b.addEventListener('click', () => openIdeas(b.dataset.idea)));
  }));

  const csvBtn = document.createElement('button');
  csvBtn.className = 'btn';
  csvBtn.textContent = '⬇ Export CSV';
  csvBtn.addEventListener('click', () => {
    download(`top-questions-${lastDays}d.csv`, toCsv([['Rank', 'Question', 'Score', 'Comments', 'Subreddit', 'Date', 'URL'],
      ...lastItems.map((p, i) => [i + 1, p.title, p.score, p.comments, p.subreddit, fmtDate(p.createdUtc), p.url])]), 'text/csv');
  });
  const mdBtn = document.createElement('button');
  mdBtn.className = 'btn';
  mdBtn.textContent = '⬇ Export Markdown brief';
  mdBtn.addEventListener('click', () => {
    download(`top-questions-${lastDays}d.md`,
      `# Top ${lastItems.length} survey/beermoney questions (last ${lastDays} days)\n\n` +
      lastItems.map((p, i) => `${i + 1}. **${p.title}** — ${p.score} pts, ${p.comments} comments ([thread](${p.url}))`).join('\n'),
      'text/markdown');
  });
  toolbar.append(csvBtn, mdBtn);
};

// ---------- Top Sites ----------
renderers['sites-rank'] = function () {
  const view = $('#view-sites-rank');
  view.innerHTML = `<h1>Top Sites</h1><p class="subtitle">Most talked-about survey/beermoney sites — ranked by community mentions, with trend vs the previous period.</p><div class="toolbar" id="s-toolbar"></div><div class="card"><div id="s-list">Loading…</div></div>`;

  $('#s-toolbar').appendChild(daysSegment(async (days) => {
    $('#s-list').textContent = 'Loading…';
    const res = await api.topSites(days);
    const max = Math.max(1, ...res.items.map((s) => s.mentions));
    $('#s-list').innerHTML = res.items.length
      ? res.items.map((s, i) => {
          const diff = s.mentions - s.prevMentions;
          const trend = diff > 0 ? `<span class="trend-up">▲ +${diff}</span>` : diff < 0 ? `<span class="trend-down">▼ ${diff}</span>` : '<span class="trend-flat">—</span>';
          return `<div class="rank-row"><div class="rank-num">${i + 1}</div>
            <div class="rank-main"><div class="rank-title">${h(s.name)} <span class="muted small">· ${s.mentions} mentions · ${trend} vs prior ${$$('.seg .active', view)[0]?.textContent || ''}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.round((s.mentions / max) * 100)}%"></div></div>
            ${s.topPost ? `<div class="rank-meta">Top thread: ${h(s.topPost)}</div>` : ''}</div>
            <div class="rank-actions"><button class="btn btn-sm" data-idea="${h(s.name)} review">💡 Ideas</button></div></div>`;
        }).join('')
      : '<div class="empty">No site mentions found in this window.</div>';
    $$('[data-idea]', view).forEach((b) => b.addEventListener('click', () => openIdeas(b.dataset.idea)));
  }));
};

// ---------- Keyword Explorer ----------
renderers.keywords = function () {
  const view = $('#view-keywords');
  if (view.dataset.ready) return;
  view.dataset.ready = '1';
  view.innerHTML = `<h1>Keyword Explorer</h1>
    <p class="subtitle">Fan a seed keyword out through Google Autocomplete to see what people actually type. Plug a paid API key into Settings later for real volumes.</p>
    <div class="toolbar"><input id="kw-seed" placeholder="e.g. swagbucks, paid surveys, prolific" style="width:320px">
    <button class="btn btn-primary" id="kw-go">🔍 Explore</button><button class="btn" id="kw-csv">⬇ CSV</button></div>
    <div class="card"><h2>Questions people search</h2><div id="kw-questions" class="chip-list"><span class="empty">Run an exploration first.</span></div></div>
    <div class="card"><h2>Other related searches</h2><div id="kw-other" class="chip-list"></div></div>`;

  let last = [];
  $('#kw-go').addEventListener('click', async () => {
    const seed = $('#kw-seed').value.trim();
    if (!seed) return toast('Enter a seed keyword first');
    $('#kw-questions').innerHTML = 'Querying Google Autocomplete…';
    $('#kw-other').innerHTML = '';
    try {
      const res = await api.exploreKeywords(seed);
      last = res.suggestions;
      const render = (items, target) => {
        target.innerHTML = items.length
          ? items.map((s) => `<button class="chip" data-kw="${h(s.text)}">${h(s.text)}${s.volume != null ? ` <span class="muted">(${s.volume}/mo)</span>` : ''}</button>`).join('')
          : '<span class="empty">None found.</span>';
      };
      render(last.filter((s) => s.isQuestion), $('#kw-questions'));
      render(last.filter((s) => !s.isQuestion), $('#kw-other'));
      $$('[data-kw]', view).forEach((c) => c.addEventListener('click', () => openIdeas(c.dataset.kw)));
      toast(`${last.length} suggestions from ${res.queried} queries${res.errors ? ` (${res.errors} failed)` : ''}`);
    } catch (err) {
      $('#kw-questions').innerHTML = `<span class="danger-text">Could not reach Google Autocomplete: ${h(err.message)}</span>`;
    }
  });
  $('#kw-seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#kw-go').click(); });
  $('#kw-csv').addEventListener('click', () => {
    if (!last.length) return toast('Nothing to export yet');
    download('keywords.csv', toCsv([['Keyword', 'Is question', 'Volume'], ...last.map((s) => [s.text, s.isQuestion ? 'yes' : 'no', s.volume ?? ''])]), 'text/csv');
  });
};

// ---------- Rising & Watchlist ----------
renderers.rising = async function () {
  const view = $('#view-rising');
  view.innerHTML = `<h1>Rising &amp; Watchlist</h1><p class="subtitle">Catch topics while they're hot, and track the exact phrases that matter to your business.</p>
    <div class="card"><h2>🚀 Rising posts (last 48h, by engagement velocity)</h2><div id="r-list">Loading…</div></div>
    <div class="card"><h2>👀 Keyword watchlist</h2>
    <div class="toolbar"><input id="watch-input" placeholder="e.g. prolific waitlist" style="width:280px"><button class="btn btn-primary" id="watch-add">Add term</button></div>
    <div id="watch-list">Loading…</div></div>`;

  const rising = await api.rising();
  $('#r-list').innerHTML = rising.items.length
    ? rising.items.map((p, i) => `<div class="rank-row"><div class="rank-num">${i + 1}</div>
        <div class="rank-main"><div class="rank-title"><a href="${h(p.url)}" data-ext>${h(p.title)}</a></div>
        <div class="rank-meta">r/${h(p.subreddit)} · ${p.score} pts · ${p.comments} comments · ${p.velocity} engagement/hr</div></div>
        <div class="rank-actions"><button class="btn btn-sm" data-idea="${h(p.title)}">💡 Ideas</button></div></div>`).join('')
    : '<div class="empty">Nothing rising in the last 48 hours.</div>';

  async function renderWatch() {
    const res = await api.watchlist(30);
    const settings = await api.getSettings();
    $('#watch-list').innerHTML = res.items.length
      ? res.items.map((w) => `
          <div class="rank-row"><div class="rank-main">
          <div class="rank-title">"${h(w.term)}" — ${w.count ? `<span class="ok-text">${w.count} match${w.count === 1 ? '' : 'es'} (30d)</span>` : '<span class="muted">no matches (30d)</span>'}</div>
          ${w.matches.map((m) => `<div class="rank-meta">↳ <a href="${h(m.url)}" data-ext>${h(m.title)}</a> (${m.score} pts)</div>`).join('')}</div>
          <div class="rank-actions"><button class="btn btn-sm btn-danger" data-rm="${h(w.term)}">✕</button></div></div>`).join('')
      : '<div class="empty">No watchlist terms yet.</div>';
    bindExternalLinks(view);
    $$('[data-rm]', view).forEach((b) => b.addEventListener('click', async () => {
      await api.setSettings({ watchlist: settings.watchlist.filter((t) => t !== b.dataset.rm) });
      renderWatch();
    }));
  }
  $('#watch-add').addEventListener('click', async () => {
    const term = $('#watch-input').value.trim().toLowerCase();
    if (!term) return;
    const settings = await api.getSettings();
    if (!settings.watchlist.includes(term)) await api.setSettings({ watchlist: [...settings.watchlist, term] });
    $('#watch-input').value = '';
    renderWatch();
  });
  renderWatch();
  bindExternalLinks(view);
  $$('[data-idea]', view).forEach((b) => b.addEventListener('click', () => openIdeas(b.dataset.idea)));
};

// ---------- Reputation Monitor ----------
renderers.reputation = function () {
  const view = $('#view-reputation');
  view.innerHTML = `<h1>Reputation Monitor</h1><p class="subtitle">Scam/ban/payment complaints per site. Protect your audience's trust — and find "is X legit?" article angles that convert.</p>
    <div class="toolbar" id="rep-toolbar"></div><div class="card"><div id="rep-list">Loading…</div></div>`;

  $('#rep-toolbar').appendChild(daysSegment(async (days) => {
    $('#rep-list').textContent = 'Loading…';
    const res = await api.reputation(days);
    $('#rep-list').innerHTML = res.items.length
      ? res.items.map((r) => `
          <div class="rank-row"><div class="rank-main">
          <div class="rank-title">${h(r.name)} — <span class="${r.ratio >= 40 ? 'danger-text' : r.ratio >= 20 ? 'warn-text' : 'muted'}">${r.negative} negative of ${r.total} mentions (${r.ratio}%)</span></div>
          <div class="bar-track"><div class="bar-fill danger" style="width:${r.ratio}%"></div></div>
          ${r.samples.map((s) => `<div class="rank-meta">↳ <a href="${h(s.url)}" data-ext>${h(s.title)}</a> (${s.score} pts)</div>`).join('')}</div>
          <div class="rank-actions"><button class="btn btn-sm" data-idea="is ${h(r.name)} legit">💡 Ideas</button></div></div>`).join('')
      : '<div class="empty">No negative mentions found in this window. 🎉</div>';
    bindExternalLinks(view);
    $$('[data-idea]', view).forEach((b) => b.addEventListener('click', () => openIdeas(b.dataset.idea)));
  }));
};

// ---------- Idea Generator ----------
renderers.ideas = async function () {
  const view = $('#view-ideas');
  if (view.dataset.ready) return;
  view.dataset.ready = '1';
  const sites = await api.listSites();
  view.innerHTML = `<h1>Idea Generator</h1><p class="subtitle">Turn any question or keyword into blog titles, YouTube angles, email subjects, and a ready-to-write SEO outline. Click any line to copy it.</p>
    <div class="toolbar"><input id="idea-topic" placeholder="Paste a question or keyword…" style="width:380px">
    <select id="idea-site"><option value="">No specific site</option>${sites.map((s) => `<option>${h(s.name)}</option>`).join('')}</select>
    <button class="btn btn-primary" id="idea-generate">💡 Generate</button></div>
    <div id="idea-output"></div>`;

  $('#idea-generate').addEventListener('click', async () => {
    const topic = $('#idea-topic').value.trim();
    if (!topic) return toast('Enter a topic first');
    const r = await api.generateIdeas(topic, $('#idea-site').value || null);
    const list = (items) => `<ul>${items.map((x) => `<li class="copy-line" data-copy="${h(x)}">${h(x)}</li>`).join('')}</ul>`;
    $('#idea-output').innerHTML = `
      <div class="card idea-block"><h2>📝 Blog post titles</h2>${list(r.blogTitles)}</div>
      <div class="card idea-block"><h2>🎬 YouTube titles</h2>${list(r.youtubeTitles)}<h2>Opening hooks</h2>${list(r.youtubeHooks)}</div>
      <div class="card idea-block"><h2>✉️ Email subject lines</h2>${list(r.emailSubjects)}</div>
      <div class="card idea-block"><h2>🧱 SEO article outline</h2>${list(r.outline)}
        <div class="toolbar"><button class="btn" id="idea-md">⬇ Export brief (.md)</button><button class="btn btn-primary" id="idea-to-cal">📅 Add to Content Planner</button></div></div>`;
    $$('.copy-line', view).forEach((li) => li.addEventListener('click', () => copyText(li.dataset.copy)));
    $('#idea-md').addEventListener('click', () => {
      download(`brief-${r.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}.md`,
        `# Content brief: ${r.topic}\n\n## Blog titles\n${r.blogTitles.map((t) => `- ${t}`).join('\n')}\n\n## YouTube titles\n${r.youtubeTitles.map((t) => `- ${t}`).join('\n')}\n\n## Hooks\n${r.youtubeHooks.map((t) => `- ${t}`).join('\n')}\n\n## Email subjects\n${r.emailSubjects.map((t) => `- ${t}`).join('\n')}\n\n## Outline\n${r.outline.map((t) => `- ${t}`).join('\n')}\n`,
        'text/markdown');
    });
    $('#idea-to-cal').addEventListener('click', async () => {
      const items = await api.getCollection('calendar');
      items.push({ id: uid(), title: r.blogTitles[0], type: 'blog', keyword: r.topic, site: $('#idea-site').value || '', status: 'idea', due: '', notes: 'Created from Idea Generator' });
      await api.setCollection('calendar', items);
      toast('Added to Content Planner as an idea');
    });
  });
};

// ---------- Content Planner ----------
renderers.calendar = async function () {
  const view = $('#view-calendar');
  const sites = await api.listSites();
  view.innerHTML = `<h1>Content Planner</h1><p class="subtitle">Plan every piece from idea to published, tied to its target keyword and affiliate site.</p>
    <div class="card"><h2>Add content</h2><div class="form-grid">
      <div class="field"><label>Title / working title</label><input id="cal-title"></div>
      <div class="field"><label>Type</label><select id="cal-type"><option value="blog">Blog post</option><option value="video">YouTube video</option><option value="email">Email</option><option value="social">Social post</option></select></div>
      <div class="field"><label>Target keyword</label><input id="cal-kw"></div>
      <div class="field"><label>Affiliate site</label><select id="cal-site"><option value="">—</option>${sites.map((s) => `<option>${h(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Due date</label><input id="cal-due" type="date"></div>
      <div class="field"><button class="btn btn-primary" id="cal-add">Add</button></div></div></div>
    <div class="toolbar"><div class="seg" id="cal-filter">
      <button data-f="all" class="active">All</button><button data-f="idea">Ideas</button><button data-f="drafting">Drafting</button><button data-f="published">Published</button></div></div>
    <div class="card"><div id="cal-list"></div></div>`;

  let filter = 'all';
  async function render() {
    const items = await api.getCollection('calendar');
    const shown = items.filter((c) => filter === 'all' || c.status === filter);
    $('#cal-list').innerHTML = shown.length
      ? `<table><tr><th>Title</th><th>Type</th><th>Keyword</th><th>Site</th><th>Due</th><th>Status</th><th></th></tr>` +
        shown.map((c) => `<tr>
          <td>${h(c.title)}${c.notes ? `<div class="muted small">${h(c.notes)}</div>` : ''}</td>
          <td>${h(c.type)}</td><td>${h(c.keyword || '—')}</td><td>${h(c.site || '—')}</td><td>${h(c.due || '—')}</td>
          <td><span class="pill status-${h(c.status)}">${h(c.status)}</span></td>
          <td><div class="rank-actions">
            <button class="btn btn-sm" data-next="${c.id}" title="Advance status">→</button>
            <button class="btn btn-sm btn-danger" data-del="${c.id}">✕</button></div></td></tr>`).join('') + '</table>'
      : '<div class="empty">No content planned yet. Add a piece above or send a question over from Top Questions.</div>';

    $$('[data-next]', view).forEach((b) => b.addEventListener('click', async () => {
      const all = await api.getCollection('calendar');
      const item = all.find((c) => c.id === b.dataset.next);
      item.status = { idea: 'drafting', drafting: 'published', published: 'idea' }[item.status] || 'idea';
      await api.setCollection('calendar', all);
      render();
    }));
    $$('[data-del]', view).forEach((b) => b.addEventListener('click', async () => {
      const all = (await api.getCollection('calendar')).filter((c) => c.id !== b.dataset.del);
      await api.setCollection('calendar', all);
      render();
    }));
  }

  $('#cal-add').addEventListener('click', async () => {
    const title = $('#cal-title').value.trim();
    if (!title) return toast('Give it a title');
    const items = await api.getCollection('calendar');
    items.push({ id: uid(), title, type: $('#cal-type').value, keyword: $('#cal-kw').value.trim(), site: $('#cal-site').value, due: $('#cal-due').value, status: 'idea', notes: '' });
    await api.setCollection('calendar', items);
    $('#cal-title').value = ''; $('#cal-kw').value = '';
    render();
  });
  $$('#cal-filter button', view).forEach((b) => b.addEventListener('click', () => {
    $$('#cal-filter button', view).forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    filter = b.dataset.f;
    render();
  }));
  render();
};

// ---------- Affiliate Links ----------
renderers.links = async function () {
  const view = $('#view-links');
  const sites = await api.listSites();
  view.innerHTML = `<h1>Affiliate Links</h1><p class="subtitle">One place for every program: link, commission, cookie window. Click 📋 to copy a link straight into your content.</p>
    <div class="card"><h2>Add link</h2><div class="form-grid">
      <div class="field"><label>Site / program</label><select id="lnk-site">${sites.map((s) => `<option>${h(s.name)}</option>`).join('')}<option>Other…</option></select></div>
      <div class="field"><label>Custom name (if Other)</label><input id="lnk-name" placeholder="optional"></div>
      <div class="field"><label>Affiliate URL</label><input id="lnk-url" placeholder="https://…"></div>
      <div class="field"><label>Commission</label><input id="lnk-comm" placeholder="e.g. $3 CPA / 10% rev share"></div>
      <div class="field"><label>Cookie window</label><input id="lnk-cookie" placeholder="e.g. 30 days"></div>
      <div class="field"><button class="btn btn-primary" id="lnk-add">Add</button></div></div></div>
    <div class="card"><div id="lnk-list"></div></div>`;

  async function render() {
    const items = await api.getCollection('links');
    $('#lnk-list').innerHTML = items.length
      ? `<table><tr><th>Program</th><th>Link</th><th>Commission</th><th>Cookie</th><th></th></tr>` +
        items.map((l) => `<tr><td>${h(l.name)}</td><td class="mono">${h(l.url)}</td><td>${h(l.commission || '—')}</td><td>${h(l.cookie || '—')}</td>
          <td><div class="rank-actions"><button class="btn btn-sm" data-copy="${h(l.url)}">📋</button><button class="btn btn-sm btn-danger" data-del="${l.id}">✕</button></div></td></tr>`).join('') + '</table>'
      : '<div class="empty">No affiliate links saved yet.</div>';
    $$('[data-copy]', view).forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy)));
    $$('[data-del]', view).forEach((b) => b.addEventListener('click', async () => {
      await api.setCollection('links', (await api.getCollection('links')).filter((l) => l.id !== b.dataset.del));
      render();
    }));
  }
  $('#lnk-add').addEventListener('click', async () => {
    const url = $('#lnk-url').value.trim();
    if (!url) return toast('Paste the affiliate URL');
    const sel = $('#lnk-site').value;
    const name = sel === 'Other…' ? ($('#lnk-name').value.trim() || 'Unnamed') : sel;
    const items = await api.getCollection('links');
    items.push({ id: uid(), name, url, commission: $('#lnk-comm').value.trim(), cookie: $('#lnk-cookie').value.trim() });
    await api.setCollection('links', items);
    $('#lnk-url').value = ''; $('#lnk-comm').value = ''; $('#lnk-cookie').value = ''; $('#lnk-name').value = '';
    render();
  });
  render();
};

// ---------- Site Database ----------
renderers['sites-db'] = async function () {
  const view = $('#view-sites-db');
  view.innerHTML = `<h1>Site Database</h1><p class="subtitle">Reference data for every site you might promote: payouts, methods, referral programs. Double-click notes/referral cells to edit.</p>
    <div class="card"><h2>Add custom site</h2><div class="form-grid">
      <div class="field"><label>Name</label><input id="db-name"></div>
      <div class="field"><label>Category</label><input id="db-cat" placeholder="e.g. Surveys"></div>
      <div class="field"><label>Min payout</label><input id="db-min"></div>
      <div class="field"><label>Referral program</label><input id="db-ref"></div>
      <div class="field"><button class="btn btn-primary" id="db-add">Add</button></div></div>
      <p class="muted small">Custom sites are automatically tracked in Top Sites and Reputation (matched by name).</p></div>
    <div class="card"><div id="db-list">Loading…</div></div>`;

  async function render() {
    const sites = await api.listSites();
    $('#db-list').innerHTML = `<table><tr><th>Site</th><th>Category</th><th>Min payout</th><th>Payout methods</th><th>Referral program</th><th>Notes</th><th></th></tr>` +
      sites.map((s) => `<tr>
        <td><a href="${h(s.url || '#')}" data-ext>${h(s.name)}</a></td>
        <td>${h(s.category || '—')}</td><td>${h(s.minPayout || '—')}</td><td>${h(s.payoutMethods || '—')}</td>
        <td class="editable" data-id="${h(s.id)}" data-field="referral">${h(s.referral || '—')}</td>
        <td class="editable" data-id="${h(s.id)}" data-field="notes">${h(s.notes || '—')}</td>
        <td>${String(s.id).startsWith('custom-') ? `<button class="btn btn-sm btn-danger" data-del="${h(s.id)}">✕</button>` : ''}</td></tr>`).join('') + '</table>';
    bindExternalLinks(view);
    $$('.editable', view).forEach((td) => td.addEventListener('dblclick', async () => {
      const current = td.textContent === '—' ? '' : td.textContent;
      const next = prompt(`Edit ${td.dataset.field}:`, current);
      if (next === null) return;
      await api.updateSite(td.dataset.id, { [td.dataset.field]: next });
      render();
    }));
    $$('[data-del]', view).forEach((b) => b.addEventListener('click', async () => {
      await api.deleteCustomSite(b.dataset.del);
      render();
    }));
  }
  $('#db-add').addEventListener('click', async () => {
    const name = $('#db-name').value.trim();
    if (!name) return toast('Site needs a name');
    await api.addCustomSite({ name, category: $('#db-cat').value.trim(), minPayout: $('#db-min').value.trim(), referral: $('#db-ref').value.trim(), payoutMethods: '', url: '', notes: '', aliases: [name.toLowerCase()] });
    ['#db-name', '#db-cat', '#db-min', '#db-ref'].forEach((id) => { $(id).value = ''; });
    render();
  });
  render();
};

// ---------- Revenue ----------
renderers.revenue = async function () {
  const view = $('#view-revenue');
  const sites = await api.listSites();
  view.innerHTML = `<h1>Revenue</h1><p class="subtitle">Track affiliate commissions per program and per content piece, so you know what to double down on.</p>
    <div class="cards-row" id="rev-cards"></div>
    <div class="card"><h2>Add commission</h2><div class="form-grid">
      <div class="field"><label>Amount ($)</label><input id="rev-amount" type="number" step="0.01" min="0"></div>
      <div class="field"><label>Program / site</label><select id="rev-site">${sites.map((s) => `<option>${h(s.name)}</option>`).join('')}<option>Other</option></select></div>
      <div class="field"><label>Content piece (optional)</label><input id="rev-piece" placeholder="e.g. Swagbucks review post"></div>
      <div class="field"><label>Date</label><input id="rev-date" type="date"></div>
      <div class="field"><button class="btn btn-primary" id="rev-add">Add</button></div></div></div>
    <div class="card"><h2>Last 6 months</h2><div id="rev-chart"></div></div>
    <div class="card"><h2>By program</h2><div id="rev-by-site"></div></div>
    <div class="card"><div class="toolbar"><h2 style="margin:0;flex:1">Entries</h2><button class="btn" id="rev-csv">⬇ Export CSV</button></div><div id="rev-list"></div></div>`;

  $('#rev-date').value = new Date().toISOString().slice(0, 10);

  async function render() {
    const items = (await api.getCollection('revenue')).sort((a, b) => b.date.localeCompare(a.date));
    const total = items.reduce((s, r) => s + Number(r.amount || 0), 0);
    const now = new Date();
    const monthKey = (d) => d.toISOString().slice(0, 7);
    const thisMonth = items.filter((r) => r.date.startsWith(monthKey(now))).reduce((s, r) => s + Number(r.amount), 0);
    const best = {};
    for (const r of items) best[r.site] = (best[r.site] || 0) + Number(r.amount);
    const bestSite = Object.entries(best).sort((a, b) => b[1] - a[1])[0];

    $('#rev-cards').innerHTML = `
      <div class="stat-card"><div class="label">This month</div><div class="value">$${thisMonth.toFixed(2)}</div></div>
      <div class="stat-card"><div class="label">All time</div><div class="value">$${total.toFixed(2)}</div></div>
      <div class="stat-card"><div class="label">Best program</div><div class="value" style="font-size:16px">${h(bestSite?.[0] || '—')}</div><div class="sub">${bestSite ? `$${bestSite[1].toFixed(2)} all time` : ''}</div></div>`;

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      months.push({ key, label: d.toLocaleString(undefined, { month: 'short' }), total: items.filter((r) => r.date.startsWith(key)).reduce((s, r) => s + Number(r.amount), 0) });
    }
    const maxM = Math.max(1, ...months.map((m) => m.total));
    $('#rev-chart').innerHTML = months.map((m) => `
      <div class="rank-row"><div class="rank-num small">${m.label}</div>
      <div class="rank-main"><div class="bar-track"><div class="bar-fill" style="width:${Math.round((m.total / maxM) * 100)}%"></div></div></div>
      <div class="small" style="width:80px;text-align:right">$${m.total.toFixed(2)}</div></div>`).join('');

    const bySite = Object.entries(best).sort((a, b) => b[1] - a[1]);
    const maxS = Math.max(1, ...bySite.map(([, v]) => v));
    $('#rev-by-site').innerHTML = bySite.length
      ? bySite.map(([site, v]) => `<div class="rank-row"><div class="rank-main"><div class="rank-title small">${h(site)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((v / maxS) * 100)}%"></div></div></div>
          <div class="small" style="width:80px;text-align:right">$${v.toFixed(2)}</div></div>`).join('')
      : '<div class="empty">No revenue yet — it compounds, keep publishing.</div>';

    $('#rev-list').innerHTML = items.length
      ? `<table><tr><th>Date</th><th>Program</th><th>Content piece</th><th>Amount</th><th></th></tr>` +
        items.map((r) => `<tr><td>${h(r.date)}</td><td>${h(r.site)}</td><td>${h(r.piece || '—')}</td><td>$${Number(r.amount).toFixed(2)}</td>
          <td><button class="btn btn-sm btn-danger" data-del="${r.id}">✕</button></td></tr>`).join('') + '</table>'
      : '<div class="empty">No entries yet.</div>';
    $$('[data-del]', view).forEach((b) => b.addEventListener('click', async () => {
      await api.setCollection('revenue', (await api.getCollection('revenue')).filter((r) => r.id !== b.dataset.del));
      render();
    }));
  }
  $('#rev-add').addEventListener('click', async () => {
    const amount = parseFloat($('#rev-amount').value);
    if (!(amount > 0)) return toast('Enter a valid amount');
    const items = await api.getCollection('revenue');
    items.push({ id: uid(), amount, site: $('#rev-site').value, piece: $('#rev-piece').value.trim(), date: $('#rev-date').value || new Date().toISOString().slice(0, 10) });
    await api.setCollection('revenue', items);
    $('#rev-amount').value = ''; $('#rev-piece').value = '';
    render();
  });
  $('#rev-csv').addEventListener('click', async () => {
    const items = await api.getCollection('revenue');
    download('affiliate-revenue.csv', toCsv([['Date', 'Program', 'Content piece', 'Amount'], ...items.map((r) => [r.date, r.site, r.piece, r.amount])]), 'text/csv');
  });
  render();
};

// ---------- Settings ----------
renderers.settings = async function () {
  const view = $('#view-settings');
  const settings = await api.getSettings();
  const providers = await api.volumeProviders();
  view.innerHTML = `<h1>Settings</h1><p class="subtitle">Data sources and refresh behavior.</p>
    <div class="card"><h2>Reddit data</h2>
      <div class="field"><label>Subreddits to scan (comma-separated, no r/)</label>
      <input id="set-subs" style="width:100%" value="${h(settings.subreddits.join(', '))}"></div>
      <div class="field"><label>Cache lifetime (hours) — data is re-fetched after this</label>
      <input id="set-ttl" type="number" min="1" max="48" value="${h(settings.cacheTtlHours)}" style="width:90px"></div>
      <div class="toolbar"><button class="btn btn-primary" id="set-save">Save</button>
      <button class="btn" id="set-refresh">🔄 Force refresh data now</button></div></div>
    <div class="card"><h2>Search volume provider (optional, paid)</h2>
      <p class="muted small">The app works fully on free sources. To see real monthly search volumes in the Keyword Explorer, pick a provider and paste its API key. Adding new providers is documented in <span class="mono">lib/providers/index.js</span>.</p>
      <div class="form-grid">
        <div class="field"><label>Provider</label><select id="set-provider">${providers.map((p) => `<option value="${h(p.id)}" ${p.id === settings.volumeProvider ? 'selected' : ''}>${h(p.label)}</option>`).join('')}</select></div>
        <div class="field"><label>API key</label><input id="set-key" type="password" value="${h(settings.volumeApiKey)}" placeholder="paste key…"></div>
      </div></div>`;

  $('#set-save').addEventListener('click', async () => {
    await api.setSettings({
      subreddits: $('#set-subs').value.split(',').map((s) => s.trim()).filter(Boolean),
      cacheTtlHours: Math.max(1, parseInt($('#set-ttl').value, 10) || 6),
      volumeProvider: $('#set-provider').value,
      volumeApiKey: $('#set-key').value.trim()
    });
    toast('Settings saved');
  });
  $('#set-refresh').addEventListener('click', async () => {
    toast('Refreshing from Reddit…');
    const s = await refreshStatus(true);
    toast(s.source === 'live' ? `Refreshed: ${s.postCount} posts` : `Refresh failed — using ${sourceLabel(s.source).toLowerCase()}`);
    renderers[currentView]?.();
  });
};

// ---------- boot ----------
(async function boot() {
  await refreshStatus();
  showView('dashboard');
})();
