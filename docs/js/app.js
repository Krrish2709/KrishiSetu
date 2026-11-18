/* KrishiSetu dashboard · routing, scroll story, India map, credit engine UI, methodology */
(function () {
  const KS = window.KS, P = window.INDIA_PATHS, ENG = window.KSEngine;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const inrShort = n => n >= 1e7 ? '₹' + (n / 1e7).toFixed(2) + ' Cr' : n >= 1e5 ? '₹' + (n / 1e5).toFixed(1) + ' L' : inr(n);
  const pct = (v, d = 0) => (v * 100).toFixed(d) + '%';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ST = KS.states;
  const CODES = Object.keys(ST);
  const isUT = c => ST[c].sas_basis !== 'state';

  /* ───────────────────────── colour ramps (single-hue sequential, light → dark) */
  const RAMPS = {
    risk: ['#fbefe9', '#f6d5c7', '#eeb59e', '#e28f73', '#cd6b4d', '#a94e34', '#7c3622'],
    green: ['#e8f5ee', '#c6e6d4', '#98d0b4', '#63b38e', '#34946c', '#17764f', '#0b5638'],
    blue: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']
  };
  const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  function rampColor(ramp, t) {
    t = Math.max(0, Math.min(1, t)); const r = RAMPS[ramp], x = t * (r.length - 1), i = Math.min(r.length - 2, Math.floor(x)), f = x - i;
    const a = hex2rgb(r[i]), b = hex2rgb(r[i + 1]);
    return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
  }
  const lum = c => { const m = c.match(/\d+/g).map(Number); return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255; };

  /* ───────────────────────── map layers */
  const LAYERS = [
    { id: 'risk', label: 'Regional risk index', ramp: 'risk', get: s => s.risk_index, fmt: v => v.toFixed(0) + ' / 100', higherIs: 'riskier', survey: true,
      desc: 'Composite of 7 official indicators (debt load, indebtedness, rain-fed share, fragmentation, monsoon-2026 deficit, PMFBY gap, income), PCA-weighted. 100 = riskiest major state.' },
    { id: 'score', label: 'Avg KrishiSetu score', ramp: 'green', get: s => s.model.avg_score, fmt: v => Math.round(v), higherIs: 'stronger', domain: [620, 790],
      desc: 'Holdings-weighted mean score (300–850) of the trained scorecard on a farmer portfolio calibrated to that state\'s statistics.' },
    { id: 'stress', label: 'Default · monsoon 2026', ramp: 'risk', get: s => s.model.default_m26, fmt: v => pct(v, 1), higherIs: 'riskier',
      desc: 'Model one-cycle default rate conditioned on the observed 2026 monsoon (district deficits to 30 Aug). National baseline is calibrated to RBI\'s 5.1% agri GNPA.' },
    { id: 'deficit', label: 'Monsoon 2026 deficit', ramp: 'risk', get: s => s.mon26_deficit_share, fmt: v => pct(v) + ' of districts', higherIs: 'drier',
      desc: 'Share of districts with deficient or large-deficient cumulative rainfall, 1 Jun – 30 Aug 2026 (IMD data via ICAR-CRIDA).' },
    { id: 'indebted', label: 'Households in debt', ramp: 'risk', get: s => s.sas_pct_indebted / 100, fmt: v => pct(v, 1), higherIs: 'more indebted', survey: true,
      desc: 'Share of agricultural households with an outstanding loan (NSS 77th round, SAS 2019).' },
    { id: 'gap', label: 'Credit gap', ramp: 'blue', get: s => s.credit_gap, fmt: v => pct(v) + ' without KCC', higherIs: 'larger gap',
      desc: 'Holdings not matched by an operative Kisan Credit Card (KCC accounts, Mar 2025 ÷ Agri Census holdings). The opportunity, not a risk.' },
    { id: 'irrig', label: 'Irrigated share', ramp: 'blue', get: s => s.irrigation_pct, fmt: v => pct(v) + ' of net sown area', higherIs: 'more irrigated',
      desc: 'Net irrigated area ÷ net sown area, Land Use Statistics 2021-22.' },
    { id: 'income', label: 'Farm household income', ramp: 'green', get: s => s.sas_income_month_rs, fmt: v => inr(v) + '/month', higherIs: 'higher', survey: true,
      desc: 'Average monthly income per agricultural household, all sources (NSS SAS 2019, agricultural year 2018-19).' }
  ];
  let layer = LAYERS[0], selected = null, rankDir = 'desc';

  function domainOf(L) {
    if (L.domain) return L.domain;
    const vals = CODES.filter(c => !isUT(c) || !L.survey).map(c => L.get(ST[c])).filter(v => v != null && !isNaN(v));
    return [Math.min(...vals), Math.max(...vals)];
  }
  function colorOf(L, c) {
    const v = L.get(ST[c]); if (v == null || isNaN(v)) return '#e9e7e0';
    const [a, b] = domainOf(L); return rampColor(L.ramp, (v - a) / ((b - a) || 1));
  }

  /* ───────────────────────── router */
  const VIEWS = ['overview', 'map', 'engine', 'method'];
  let pendingEngineState = null;
  function route() {
    let h = (location.hash || '#overview').slice(1);
    if (!VIEWS.includes(h)) {
      // in-page anchors inside methodology
      const t = document.getElementById(h);
      if (t && $('#view-method').contains(t)) { show('method', false); setTimeout(() => t.scrollIntoView({ behavior: 'smooth' }), 30); return; }
      h = 'overview';
    }
    show(h, true);
  }
  function show(v, top) {
    VIEWS.forEach(x => { $('#view-' + x).hidden = x !== v; });
    $$('.nav-links a').forEach(a => {
      const active = a.dataset.route === v;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (top) window.scrollTo({ top: 0, behavior: 'instant' });
    if (v === 'map') initMap();
    if (v === 'engine') initEngine();
    if (v === 'method') initMethod();
    if (v === 'overview') initOverview();
    onScroll();
  }
  window.addEventListener('hashchange', route);

  /* ───────────────────────── scroll engine */
  const nav = $('#nav');
  const overview = $('#view-overview');
  const darkBands = $$('#view-overview > .dark');
  const orbitHero = $('#hero');
  let ticking = false;
  window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(() => { onScroll(); ticking = false; }); ticking = true; } }, { passive: true });
  window.addEventListener('resize', onScroll);
  function onScroll() {
    const y = window.scrollY, H = document.documentElement.scrollHeight - innerHeight;
    $('#progress').style.width = (H > 0 ? (y / H) * 100 : 0) + '%';
    const navCenter = nav.offsetHeight / 2;
    const onDark = !overview.hidden && darkBands.some(section => {
      const bounds = section.getBoundingClientRect();
      return bounds.top <= navCenter && bounds.bottom > navCenter;
    });
    nav.classList.toggle('on-dark', onDark);
    nav.classList.toggle('over-hero', !overview.hidden && orbitHero.getBoundingClientRect().bottom > innerHeight * .7);
    if (!overview.hidden) {
      window.KSOrbit.update();
      storyScroll();
    }
  }

  /* ───────────────────────── overview */
  let overviewInit = false;
  const DIAL_C = r => 2 * Math.PI * r;
  function setDial(id, r, s, color) {
    const c = $(id); if (!c) return; const L = DIAL_C(r);
    c.style.strokeDasharray = L; c.style.strokeDashoffset = L * (1 - (s - 300) / 550); if (color) c.style.stroke = color;
  }
  function countTo(node, to, dec = 0, suffix = '', dur = 1400) {
    if (reduce) { node.textContent = to.toFixed(dec) + suffix; return; }
    const t0 = performance.now();
    const tick = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); node.textContent = (to * e).toFixed(dec) + suffix; if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  function initOverview() {
    if (overviewInit) return; overviewInit = true;
    // reveal on scroll
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        $$('[data-count]', e.target).forEach(n => { if (!n.dataset.done) { n.dataset.done = 1; countTo(n, +n.dataset.count, +(n.dataset.dec || 0), n.dataset.suffix || ''); } });
        io.unobserve(e.target);
      }
    }), { threshold: 0.18 });
    $$('#view-overview .reveal').forEach(n => io.observe(n));
    // score story factor list
    const ul = $('#storyFactors');
    const order = KS.model.factors.map((k, i) => i).sort((a, b) => KS.model.learned_weights[b] - KS.model.learned_weights[a]);
    ul.innerHTML = order.map(i => `<li data-i="${i}"><span>${esc(KS.model.labels[i])}</span><span class="bar"><i data-w="${KS.model.learned_weights[i]}" data-p="${KS.model.v2_weights[i]}"></i></span><span class="w">${pct(KS.model.learned_weights[i])}</span></li>`).join('');
    drawMiniMap($('#teaserMap'));
  }
  function stepFor(sec) {
    const r = sec.getBoundingClientRect(), n = +getComputedStyle(sec).getPropertyValue('--steps') || 3;
    const p = Math.max(0, Math.min(0.999, -r.top / Math.max(1, r.height - innerHeight)));
    return { p, step: Math.floor(p * n), n, visible: r.top < innerHeight && r.bottom > 0 };
  }
  let lastStoryStep = -1;
  function storyScroll() {
    // problem pin
    const prob = $('#problem');
    if (prob) { const { step } = stepFor(prob); $$('.pin-step', prob).forEach(s => s.classList.toggle('on', +s.dataset.step === step)); $$('.pin-dots i', prob).forEach((d, i) => d.classList.toggle('on', i <= step)); }
    // score pin
    const sp = $('#scorePin');
    if (sp) {
      const { step, p } = stepFor(sp);
      $$('.pin-step', sp).forEach(s => s.classList.toggle('on', +s.dataset.step === step));
      if (step !== lastStoryStep) {
        lastStoryStep = step;
        const lis = $$('#storyFactors li');
        lis.forEach((li, i) => li.classList.toggle('on', step >= 0 && i < (step === 0 ? 8 : 8)));
        lis.forEach(li => { const b = $('i', li); const usePrior = step === 0; b.classList.toggle('prior', usePrior); b.style.width = (+(usePrior ? b.dataset.p : b.dataset.w) / 0.4 * 100) + '%'; $('.w', li).textContent = pct(+(usePrior ? b.dataset.p : b.dataset.w)); });
        const sample = ENG.score(PRESETS[0].x);
        const s = step === 0 ? 560 : step === 1 ? 640 : sample.score;
        setDial('#storyDial', 110, s, step >= 3 ? bandColor(sample.band.name) : null);
        countTo($('#storyScore'), s, 0, '', 700);
        $('#storyBand').textContent = step === 0 ? 'Expert prior' : step === 1 ? 'Learning…' : step === 2 ? sample.band.name + ' band' : `PD ${pct(sample.pd, 1)} · ${sample.band.name}`;
      }
    }
    // crop cycle timeline
    const cyc = $('#cycle');
    if (cyc) {
      const r = cyc.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (innerHeight * 0.85 - r.top) / (innerHeight * 0.7)));
      $('#tlProgress').style.width = (p * 100) + '%';
      $$('#cycle li').forEach((li, i, a) => li.classList.toggle('on', p >= i / (a.length - 1) - 0.02));
    }
  }
  function bandColor(name) { return { PRIME: '#0b7a3e', GOOD: '#2f9a5c', FAIR: '#c9851c', MARGINAL: '#d9682f', RESTRICTED: '#c43c3c' }[name] || '#666'; }

  /* ───────────────────────── map drawing */
  const UT_DOTS = ['DL', 'CH', 'GA', 'PY', 'LD', 'DH'];
  function buildMapSVG(svg, opts = {}) {
    svg.innerHTML = '';
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: (opts.prefix || 'm') + 'hatch', width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 10, stroke: 'rgba(255,255,255,.75)', 'stroke-width': 3 }, pat);
    const g = el('g', {}, svg), gh = el('g', { 'pointer-events': 'none' }, svg), gl = el('g', {}, svg), gd = el('g', {}, svg);
    const shapes = {};
    CODES.forEach(c => {
      const p = el('path', { d: P[c], class: 'st', 'data-c': c, tabindex: opts.interactive ? 0 : -1, role: opts.interactive ? 'button' : 'presentation', 'aria-label': ST[c].name }, g);
      shapes[c] = { path: p };
      if (isUT(c)) shapes[c].hatch = el('path', { d: P[c], fill: `url(#${(opts.prefix || 'm')}hatch)`, opacity: 0 }, gh);
    });
    // labels + dots need bboxes, so measure after insertion
    requestAnimationFrame(() => CODES.forEach(c => {
      const bb = shapes[c].path.getBBox(); const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
      if (opts.labels && bb.width * bb.height > 5000 && !UT_DOTS.includes(c)) {
        const adj = { KL: [6, 10], WB: [-6, 30], AS: [10, 4], HR: [6, 6], GJ: [16, 0], AR: [0, 4], MH: [0, -10], UK: [0, 4], HP: [0, 6], JK: [-16, 20], PB: [6, 4], AN: [0, 0] }[c] || [0, 0];
        shapes[c].label = el('text', { x: cx + adj[0], y: cy + adj[1], class: 'lbl' }, gl); shapes[c].label.textContent = c;
      }
      if (opts.interactive && UT_DOTS.includes(c)) {
        const dot = el('circle', { cx: c === 'LD' ? cx + 4 : cx, cy, r: 13, class: 'ut-dot', 'data-c': c, tabindex: 0, role: 'button', 'aria-label': ST[c].name }, gd);
        shapes[c].dot = dot;
      }
      if (opts.after) opts.after(shapes);
    }));
    return shapes;
  }
  function paint(shapes, L) {
    CODES.forEach(c => {
      const col = colorOf(L, c); shapes[c].path.setAttribute('fill', col);
      if (shapes[c].dot) shapes[c].dot.setAttribute('fill', col);
      if (shapes[c].hatch) shapes[c].hatch.setAttribute('opacity', L.survey ? 0.55 : 0);
      if (shapes[c].label) shapes[c].label.classList.toggle('inv', lum(col) < 0.5);
    });
  }
  function drawMiniMap(host) {
    host.innerHTML = '';
    const svg = el('svg', { viewBox: '-10 -10 1220 1380' }, host);
    const shapes = buildMapSVG(svg, { prefix: 't' });
    const L = LAYERS[0];
    CODES.forEach((c, i) => {
      shapes[c].path.setAttribute('fill', '#ebe9e2');
      shapes[c].path.style.transition = `fill 1.2s ${0.02 * i}s`;
    });
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { paint(shapes, L); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(host);
  }

  /* ───────────────────────── map view */
  let mapInit = false, mapShapes = null;
  function initMap() {
    if (mapInit) return; mapInit = true;
    renderKPIs();
    const bar = $('#layerBar');
    bar.innerHTML = LAYERS.map(L => `<button role="tab" data-l="${L.id}" aria-selected="${L === layer}">${esc(L.label)}</button>`).join('');
    bar.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; layer = LAYERS.find(L => L.id === b.dataset.l); $$('button', bar).forEach(x => x.setAttribute('aria-selected', x === b)); refreshMap(); });
    const svg = $('#indiaMap');
    mapShapes = buildMapSVG(svg, { interactive: true, labels: true, prefix: 'm', after: () => refreshMap() });
    const tip = $('#mapTip'), stage = $('.map-stage');
    const target = e => e.target.closest('[data-c]');
    svg.addEventListener('mousemove', e => {
      const t = target(e); if (!t) { tip.hidden = true; return; }
      const c = t.dataset.c, s = ST[c], v = layer.get(s), r = stage.getBoundingClientRect();
      tip.innerHTML = `<b>${esc(s.name)}</b><div class="tv">${v == null || isNaN(v) ? 'n/a' : esc(layer.fmt(v))}</div><div class="ts">${esc(layer.label)}${isUT(c) && layer.survey ? ' · UT group estimate' : ''}</div><div class="ts">Click for full profile</div>`;
      tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px'; tip.hidden = false;
    });
    svg.addEventListener('mouseleave', () => tip.hidden = true);
    svg.addEventListener('click', e => { const t = target(e); if (t) select(t.dataset.c); });
    svg.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && target(e)) { e.preventDefault(); select(target(e).dataset.c); } });
    renderSide();
  }
  function refreshMap() {
    if (!mapShapes) return;
    paint(mapShapes, layer);
    $('#layerDesc').textContent = layer.desc;
    const [a, b] = domainOf(layer);
    $('#legend').innerHTML = `<span>${esc(layer.fmt(a).split(' ')[0])}</span><span class="ramp">${RAMPS[layer.ramp].map(c => `<i style="background:${c}"></i>`).join('')}</span><span>${esc(layer.fmt(b).split(' ')[0])}</span><span>· darker = ${esc(layer.higherIs)}</span>${layer.survey ? '<span class="hatch"><i></i>UT group estimate</span>' : ''}`;
    if (!selected) renderSide();
  }
  function select(c) {
    selected = c;
    $('#indiaMap').classList.toggle('has-sel', !!c);
    CODES.forEach(k => { mapShapes[k].path.classList.toggle('sel', k === c); if (mapShapes[k].dot) mapShapes[k].dot.classList.toggle('sel', k === c); });
    if (c) mapShapes[c].path.parentNode.appendChild(mapShapes[c].path);
    renderSide();
    if (c && innerWidth < 1100) $('#sidePanel').scrollIntoView({ behavior: 'smooth' });
  }
  function renderKPIs() {
    const n = KS.national;
    const kccTotal = CODES.reduce((a, c) => a + (ST[c].kcc_operative_k || 0), 0);
    const holdings = CODES.reduce((a, c) => a + (c === 'LA' ? 0 : ST[c].holdings_all_k || 0), 0);
    const items = [
      ['Avg KrishiSetu score', n.avg_score, 'Holdings-weighted, all States/UTs'],
      ['Default · baseline', pct(n.default_baseline, 1), 'Calibrated to RBI agri GNPA 5.1%'],
      ['Default · monsoon 2026', pct(n.default_m26, 1), `+${((n.default_m26 - n.default_baseline) * 100).toFixed(1)} pp stress from this season`],
      ['Approval rate', pct(n.approval_rate), 'Score ≥ 500 and positive surplus'],
      ['Operative KCCs', (kccTotal / 1e4).toFixed(2) + ' Cr', `vs ${(holdings / 1e4).toFixed(2)} Cr holdings · Mar 2025`]
    ];
    $('#kpis').innerHTML = items.map(([l, v, s]) => `<div class="kpi"><div class="k-l">${l}</div><div class="k-v">${v}</div><div class="k-s">${s}</div></div>`).join('');
  }
  const BANDS = ['PRIME', 'GOOD', 'FAIR', 'MARGINAL', 'RESTRICTED'];
  function renderSide() {
    const sp = $('#sidePanel');
    if (!selected) {
      const rows = CODES.filter(c => !(isUT(c) && layer.survey)).map(c => [c, layer.get(ST[c])]).filter(r => r[1] != null && !isNaN(r[1]))
        .sort((a, b) => rankDir === 'desc' ? b[1] - a[1] : a[1] - b[1]).slice(0, 12);
      sp.innerHTML = `<div class="sp-head"><div><h2>Ranking</h2><div class="reg">${esc(layer.label)}</div></div>
        <div class="seg" role="group"><button data-d="desc" aria-pressed="${rankDir === 'desc'}">Highest</button><button data-d="asc" aria-pressed="${rankDir === 'asc'}">Lowest</button></div></div>
        <div class="sec"><ol class="rank-list">${rows.map(([c, v], i) => `<li data-c="${c}"><span class="rk">${i + 1}</span><span><i class="sw" style="background:${colorOf(layer, c)}"></i>${esc(ST[c].name)}</span><span class="rv">${esc(layer.fmt(v).split(' ')[0])}</span></li>`).join('')}</ol></div>
        <div class="note">Click any state on the map, or a row above, for the full credit profile: official statistics, model outcomes and what drives the risk.</div>`;
      $$('.seg button', sp).forEach(b => b.onclick = () => { rankDir = b.dataset.d; renderSide(); });
      $$('.rank-list li', sp).forEach(li => li.onclick = () => select(li.dataset.c));
      return;
    }
    const c = selected, s = ST[c], m = s.model;
    const rr = s.risk_rank, riskCls = rr == null ? '' : rr <= 9 ? 'risk-hi' : rr <= 19 ? 'risk-md' : 'risk-lo';
    const badge = rr == null ? '<span class="badge">UT · group survey estimate</span>' : `<span class="badge ${riskCls}">Risk rank ${rr} / 28</span>`;
    const comps = KS.risk_index.components, norm = KS.risk_index.normalised[c] || {};
    const compRows = comps.map(k => ({ label: k.label, v: (norm[k.col] || 0) * k.weight, raw: norm[k.col] || 0 })).sort((a, b) => b.v - a.v);
    const maxC = Math.max(...compRows.map(r => r.v), 0.0001);
    const mon = ['mon26_LE', 'mon26_E', 'mon26_N', 'mon26_D', 'mon26_LD'].map(k => s[k] || 0), monT = mon.reduce((a, b) => a + b, 0) || 1;
    const monCols = ['#256abf', '#86b6ef', '#d8d6ce', '#e28f73', '#a94e34'], monLab = ['Large excess', 'Excess', 'Normal', 'Deficient', 'Large deficient'];
    const bandCols = BANDS.map(bandColor);
    const dpp = (m.default_m26 - m.default_baseline) * 100;
    sp.innerHTML = `
      <div class="sp-head"><div><h2>${esc(s.name)}</h2><div class="reg">${esc(s.region)} India</div></div><button class="close" aria-label="Close" id="spClose">×</button></div>
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">${badge}<span class="badge">Risk index ${s.risk_index.toFixed(0)}</span></div>

      <div class="sec"><h4>KrishiSetu model <span>simulated portfolio</span></h4>
        <div class="compare">
          <div class="cmp"><div class="cl">Avg score</div><div class="cv">${m.avg_score}</div></div>
          <div class="cmp"><div class="cl">Approval rate</div><div class="cv">${pct(m.approval_rate)}</div></div>
          <div class="cmp"><div class="cl">Default · baseline</div><div class="cv">${pct(m.default_baseline, 1)}</div></div>
          <div class="cmp stress"><div class="cl">Default · monsoon 2026</div><div class="cv">${pct(m.default_m26, 1)}</div></div>
        </div>
        <div class="delta">${dpp >= 0 ? '▲' : '▼'} ${Math.abs(dpp).toFixed(1)} pp from this season's rainfall${dpp < 0 ? ' (above-normal rain eased stress)' : ''}</div>
        <div style="margin-top:14px" class="stack" aria-label="Score band mix">${BANDS.map((b, i) => `<i title="${b} ${pct(m.band_mix[b])}" style="width:${m.band_mix[b] * 100}%;background:${bandCols[i]}"></i>`).join('')}</div>
        <div class="stack-legend">${BANDS.map((b, i) => `<span><i style="background:${bandCols[i]}"></i>${b[0] + b.slice(1).toLowerCase()} ${pct(m.band_mix[b])}</span>`).join('')}</div>
      </div>

      <div class="sec"><h4>What drives the risk index <span>contribution</span></h4>
        <div class="bars">${compRows.map(r => `<div class="brow"><span>${esc(r.label)}</span><span class="bt"><i style="width:${r.v / maxC * 100}%;background:${rampColor('risk', 0.35 + 0.6 * r.raw)}"></i></span><span class="bv">${(r.v * 100).toFixed(1)}</span></div>`).join('')}</div>
      </div>

      <div class="sec"><h4>Official statistics</h4>
        <div class="metric-grid">
          ${mm('Farm household income', inr(s.sas_income_month_rs) + '/mo', 'SAS 2019' + (isUT(c) ? ' · UT group' : ''))}
          ${mm('Households in debt', s.sas_pct_indebted.toFixed(1) + '%', 'SAS 2019')}
          ${mm('Avg outstanding loan', inr(s.sas_avg_outstanding_rs), 'per farm household · SAS 2019')}
          ${mm('Debt ÷ annual income', s.debt_to_income.toFixed(2) + '×', 'derived')}
          ${mm('Operational holdings', s.holdings_all_k ? (s.holdings_all_k / 100).toFixed(2) + ' lakh' : 'n/a', 'avg ' + (s.avg_holding_ha ?? '–') + ' ha · Agri Census 2015-16')}
          ${mm('Marginal (<1 ha)', s.marginal_pct != null ? pct(s.marginal_pct) : 'n/a', 'of holdings')}
          ${mm('Irrigated share', pct(s.irrigation_pct), 'of net sown area · 2021-22')}
          ${mm('Operative KCCs', (s.kcc_operative_k / 100).toFixed(2) + ' lakh', inrShort(s.kcc_outstanding_cr * 1e7) + ' outstanding · Mar 2025')}
          ${mm('Credit gap', s.credit_gap != null ? pct(s.credit_gap) : 'n/a', 'holdings without KCC')}
          ${mm('PMFBY', s.pmfby_apps_2023_24 ? (s.pmfby_apps_2023_24 / 1e5).toFixed(1) + ' lakh apps' : '—', s.pmfby_note || s.pmfby_status)}
          ${s.rice_kgha ? mm('Rice yield', Math.round(s.rice_kgha).toLocaleString('en-IN') + ' kg/ha', '3-yr avg · DES') : ''}
          ${s.wheat_kgha ? mm('Wheat yield', Math.round(s.wheat_kgha).toLocaleString('en-IN') + ' kg/ha', '3-yr avg · DES') : ''}
        </div>
      </div>

      <div class="sec"><h4>Monsoon 2026 · districts <span>1 Jun – 30 Aug</span></h4>
        <div class="stack">${mon.map((v, i) => v ? `<i title="${monLab[i]}: ${v}" style="width:${v / monT * 100}%;background:${monCols[i]}"></i>` : '').join('')}</div>
        <div class="stack-legend">${mon.map((v, i) => `<span><i style="background:${monCols[i]}"></i>${monLab[i]} ${v}</span>`).join('')}</div>
      </div>

      <div class="sec"><h4>Crop mix modelled <span>assumption</span></h4>
        <div class="chips">${Object.entries(m.crop_mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip">${ENG.CROP_LABELS[k]} ${pct(v)}</span>`).join('')}</div>
      </div>
      ${isUT(c) ? '<div class="note">Survey figures for this UT use NSS group-of-UTs estimates' + (c === 'LA' ? ' (Ladakh uses 2019 Jammu &amp; Kashmir values; it became a UT after the Agriculture Census).' : '.') + ' Treat them as indicative.</div>' : ''}
      <button class="btn-sm" id="toEngine">Score a farmer in ${esc(s.name)} →</button>`;
    $('#spClose').onclick = () => select(null);
    $('#toEngine').onclick = () => { pendingEngineState = c; location.hash = 'engine'; };
  }
  const mm = (l, v, s) => `<div class="m"><div class="ml">${l}</div><div class="mv">${v}</div><div class="ms">${esc(s)}</div></div>`;

  /* ───────────────────────── credit engine view */
  const PRESETS = [
    { name: 'Ramesh Patil', tag: 'Cotton · Vidarbha, MH · 5 ac', x: { state: 'MH', crop: 'cotton', tenure: 'owned_clear', irrigation: 'borewell', acres: 5.2, yield: 6.8, cycles: 1, exp: 12, loan: 85000, outstanding: 60000, hh: 12000, offfarm: 3000, repay: 70, events: 1, pmfby: true, kcc: true, pmkisan: true, shg: true, enam: false, soil: true } },
    { name: 'Gurpreet Kaur', tag: 'Wheat · Punjab · 8 ac', x: { state: 'PB', crop: 'wheat', tenure: 'owned_clear', irrigation: 'canal', acres: 8, yield: 19.5, cycles: 2, exp: 12, loan: 180000, outstanding: 350000, hh: 35000, offfarm: 5000, repay: 90, events: 0, pmfby: false, kcc: true, pmkisan: true, shg: false, enam: true, soil: true } },
    { name: 'Lakshmi Devi', tag: 'Paddy · Telangana · tenant, 2 ac', x: { state: 'TS', crop: 'paddy', tenure: 'lease_oral', irrigation: 'rainfed', acres: 2, yield: 15, cycles: 1, exp: 8, loan: 60000, outstanding: 90000, hh: 8000, offfarm: 2500, repay: 60, events: 2, pmfby: false, kcc: false, pmkisan: false, shg: true, enam: false, soil: false } },
    { name: 'Sanjay Yadav', tag: 'Soybean · MP · 4 ac', x: { state: 'MP', crop: 'soybean', tenure: 'owned_unverified', irrigation: 'rainfed', acres: 4, yield: 7.5, cycles: 1, exp: 8, loan: 60000, outstanding: 40000, hh: 11000, offfarm: 2500, repay: 65, events: 2, pmfby: true, kcc: true, pmkisan: true, shg: false, enam: false, soil: true } }
  ];
  let engineInit = false;
  const F = id => $('#f-' + id);
  function initEngine() {
    if (!engineInit) {
      engineInit = true;
      const order = CODES.slice().sort((a, b) => ST[a].name.localeCompare(ST[b].name));
      F('state').innerHTML = order.map(c => `<option value="${c}">${esc(ST[c].name)}${isUT(c) ? ' (UT)' : ''}</option>`).join('');
      F('crop').innerHTML = Object.keys(ENG.CROP_LABELS).map(k => `<option value="${k}">${ENG.CROP_LABELS[k]}</option>`).join('');
      $('#presets').innerHTML = PRESETS.map((p, i) => `<button class="preset" data-i="${i}"><b>${esc(p.name)}</b><span>${esc(p.tag)}</span></button>`).join('');
      $('#presets').addEventListener('click', e => { const b = e.target.closest('.preset'); if (b) { load(PRESETS[+b.dataset.i].x); } });
      $('#engineForm').addEventListener('input', e => { if (e.target.id === 'f-state' || e.target.id === 'f-crop') benchHint(); run(); });
      $('#engineForm').addEventListener('submit', e => e.preventDefault());
      load(PRESETS[0].x);
    }
    if (pendingEngineState) {
      F('state').value = pendingEngineState;
      const mix = ST[pendingEngineState].model.crop_mix; const top = Object.entries(mix).sort((a, b) => b[1] - a[1])[0][0];
      F('crop').value = top; F('yield').value = (KS.engine.yield[pendingEngineState][top] * 0.95).toFixed(1);
      pendingEngineState = null; benchHint(); run();
    }
  }
  function load(x) {
    for (const k of ['state', 'crop', 'tenure', 'irrigation']) F(k).value = x[k];
    F('acres').value = x.acres; F('yield').value = x.yield; F('cycles').value = x.cycles; F('exp').value = x.exp;
    F('loan').value = x.loan; F('out').value = x.outstanding; F('hh').value = x.hh; F('off').value = x.offfarm; F('repay').value = x.repay; F('events').value = x.events;
    for (const k of ['pmfby', 'kcc', 'pmkisan', 'shg', 'enam', 'soil']) F(k).checked = x[k];
    benchHint(); run();
  }
  function read() {
    const n = (id, d) => { const v = parseFloat(F(id).value); return isNaN(v) ? d : v; };
    return { state: F('state').value, crop: F('crop').value, tenure: F('tenure').value, irrigation: F('irrigation').value, acres: Math.max(0.1, n('acres', 2)), yield: Math.max(0, n('yield', 5)),
      cycles: +F('cycles').value, exp: +F('exp').value, loan: Math.max(0, n('loan', 50000)), outstanding: Math.max(0, n('out', 0)), hh: Math.max(0, n('hh', 8000)), offfarm: Math.max(0, n('off', 0)),
      repay: +F('repay').value, events: +F('events').value, pmfby: F('pmfby').checked, kcc: F('kcc').checked, pmkisan: F('pmkisan').checked, shg: F('shg').checked, enam: F('enam').checked, soil: F('soil').checked };
  }
  function benchHint() {
    const s = F('state').value, c = F('crop').value; const b = KS.engine.yield[s][c];
    F('bench').textContent = `State benchmark: ${b} q/ac · ${KS.engine.yield_provenance[s][c]}`;
  }
  function run() {
    const x = read(); $('#o-repay').textContent = x.repay + '%';
    const r = ENG.score(x), s = ST[x.state], bc = bandColor(r.band.name), a = r.aux;
    const L = 2 * Math.PI * 86, off = L * (1 - (r.score - 300) / 550);
    const tl = KS.engine.timeline[x.crop], cy = r.cyc;
    const maxAbs = Math.max(...r.contrib.map(c => Math.abs(c.points)), 10);
    const wf = [
      ['Gross farm revenue', a.gross, 'in', `${x.yield} q/ac × ${x.acres} ac × ₹${KS.engine.msp[x.crop].toLocaleString('en-IN')} MSP × ${x.cycles}`],
      ['Input costs', -a.inputCost, 'out', `₹${a.costAcre.toLocaleString('en-IN')}/ac`],
      ['Off-farm income', a.offAnnual, 'in', ''],
      ['Household spend', -a.hhAnnual, 'out', ''],
      ['Existing debt service', -a.existingService, 'out', '~12% on outstanding'],
      ['Surplus for repayment', a.surplus, 'net', ''],
      ['Proposed loan interest', -r.interest, 'out', `${r.rate.toFixed(1)}% × ${a.months} mo`],
    ];
    const wmax = Math.max(...wf.map(w => Math.abs(w[1])), 1);
    const adv = [];
    r.reasons.forEach(c => adv.push(`<b>${esc(c.label)}</b> is pulling the score down by ${Math.abs(c.points).toFixed(0)} pts versus an average borrower.`));
    if (!x.pmfby) adv.push('<b>Enrol in PMFBY.</b> It is required for the auto-moratorium and adds scheme points.');
    if (!x.kcc) adv.push('<b>Apply for a KCC.</b> MISS (limit ₹5 lakh since Budget 2025-26) brings the effective rate to 4%.');
    if (x.tenure === 'lease_oral') adv.push('<b>Register the tenancy</b> and obtain an AgriStack farmer ID. A formal lease scores 220 points higher on tenure.');
    if (a.dscr < 1) adv.push(`<b>DSCR ${a.dscr.toFixed(2)}×</b>: a smaller ask of about ${inr(Math.max(0, a.surplus / 1.2 / (1 + 0.07 * a.months / 12)))} would keep cover at 1.2×.`);
    if (x.irrigation === 'rainfed') adv.push('<b>Rain-fed exposure.</b> The PMKSY drip subsidy improves yield stability and the weather factor.');
    const loanCls = r.sanctioned >= x.loan * 0.8 ? 'Full or near-full' : r.sanctioned > 0 ? 'Reduced' : 'Declined';
    $('#results').innerHTML = `
      <div class="r-top">
        <div class="panel score-card">
          <div class="ring"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="86" fill="none" stroke="var(--line)" stroke-width="12"/><circle cx="100" cy="100" r="86" fill="none" stroke="${bc}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${L}" stroke-dashoffset="${off}" transform="rotate(-90 100 100)" style="transition:stroke-dashoffset .6s"/></svg>
            <div class="num">${r.score}<small>OF 850</small></div></div>
          <span class="band-pill" style="--score-color:${bc}">${r.band.name}</span>
          <div class="prof">${x.acres} ac · ${ENG.CROP_LABELS[x.crop]} · ${esc(s.name)}<br>${tl.cycle} · ${x.irrigation}</div>
        </div>
        <div class="panel offer">
          <div class="offer-h"><h3>${r.sanctioned > 0 ? 'Conditional loan offer' : 'Loan not recommended this cycle'}</h3><span class="badge">${loanCls}</span></div>
          <div class="offer-grid">
            <div class="of"><div class="ol">Sanctioned</div><div class="ov">${inr(r.sanctioned)}</div><div class="on">of ${inr(x.loan)} requested</div></div>
            <div class="of"><div class="ol">Effective rate</div><div class="ov">${r.rate.toFixed(1)}%</div><div class="on">${r.missEligible ? 'KCC · MISS 1.5% + 3% PRI' : 'No subvention applied'}</div></div>
            <div class="of"><div class="ol">Probability of default</div><div class="ov">${pct(r.pd, 1)}</div><div class="on">${pct(r.pdStress, 1)} under monsoon-2026 stress</div></div>
            <div class="of"><div class="ol">Repayment due</div><div class="ov">${tl.repay} ${cy.repayYear}</div><div class="on">14 days after harvest sale</div></div>
            <div class="of"><div class="ol">DSCR</div><div class="ov">${a.dscr.toFixed(2)}×</div><div class="on">surplus ÷ (principal + interest)</div></div>
            <div class="of"><div class="ol">Interest this cycle</div><div class="ov">${inr(r.interest)}</div><div class="on">${a.months}-month crop tenure</div></div>
          </div>
          <div class="conds"><b>Conditions:</b> ${[!x.pmfby && 'PMFBY enrolment before disbursal', a.dscr < 0.8 && 'SHG/FPO co-guarantee or verified land record', r.sanctioned > 0 && r.sanctioned <= 200000 && 'collateral-free (within RBI ₹2 lakh limit)', r.sanctioned > 0 && `limit by KCC scale of finance (inputs + 30%), disbursal ${tl.sow} ${cy.sowYear}`].filter(Boolean).join(' · ') || 'Re-assess next cycle.'}</div>
        </div>
      </div>

      <div class="panel r-card">
        <h3>Why this score</h3>
        <p class="rsub">Points each factor adds or removes compared with an average borrower in the training portfolio. The weights are learned by the scorecard; the bar to the right of each factor shows its learned weight against the v2 expert weight.</p>
        <div class="contrib">${r.contrib.map(c => {
          const w = Math.abs(c.points) / maxAbs * 50, pos = c.points >= 0;
          return `<div class="crow"><span class="cn">${esc(c.label)}<small>raw ${Math.round(c.raw)} / 800</small></span><span class="ct"><i style="${pos ? 'left:50%' : 'right:50%'};width:${w}%;background:${pos ? '#17764f' : '#cd6b4d'}"></i></span><span class="cv">${pos ? '+' : ''}${c.points.toFixed(0)} pts</span><span class="cw" title="learned / v2">${pct(c.weight)} · ${pct(c.prior)}</span></div>`;
        }).join('')}</div>
      </div>

      <div class="two-col">
        <div class="panel r-card"><h3>Annual cash flow</h3><p class="rsub">At MSP. Interest accrues only over the crop tenure.</p>
          <div class="wf">${wf.map(([l, v, t, n]) => `<div class="wfr ${t === 'net' ? 'tot' : ''}"><span title="${esc(n)}">${l}</span><span class="wb"><i style="width:${Math.abs(v) / wmax * 100}%;background:${t === 'in' ? '#34946c' : t === 'out' ? '#e28f73' : v >= 0 ? '#256abf' : '#a94e34'}"></i></span><span class="wv">${v >= 0 ? '+' : '−'}${inr(Math.abs(v))}</span></div>`).join('')}</div>
        </div>
        <div class="panel r-card"><h3>Crop-cycle schedule</h3><p class="rsub">${tl.cycle}</p>
          <div class="tl">
            <div class="tlr"><i></i><div><b>${tl.sow} ${cy.sowYear}</b><span>Disbursed at sowing: ${inr(r.sanctioned)} via KCC / DBT</span></div></div>
            <div class="tlr"><i class="a"></i><div><b>Growing season</b><span>NDVI + IMD watch. If rainfall falls below 75% of LPA or NDVI drops 30%, a 90-day moratorium applies${x.pmfby ? ' and the PMFBY claim is filed automatically' : ' (not insured: manual process)'}</span></div></div>
            <div class="tlr"><i class="h"></i><div><b>${tl.harvest} ${cy.harvestYear}</b><span>Harvest sale${x.enam ? ' on e-NAM' : ''}, MSP floor ₹${KS.engine.msp[x.crop].toLocaleString('en-IN')}/q</span></div></div>
            <div class="tlr"><i class="r"></i><div><b>${tl.repay} ${cy.repayYear}</b><span>Repay ${inr(r.sanctioned + r.interest)} (principal + interest). Score refreshes on repayment.</span></div></div>
          </div>
        </div>
      </div>

      <div class="two-col">
        <div class="panel r-card"><h3>Improvement advisory</h3><p class="rsub">Reason codes, ranked by score impact.</p>
          ${adv.length ? `<ul class="adv">${adv.slice(0, 5).map(t => `<li>${t}</li>`).join('')}</ul>` : '<p class="rsub">No material weaknesses: profile is lender-ready.</p>'}
        </div>
        <div class="panel r-card"><h3>State context · ${esc(s.name)}</h3><p class="rsub">From the India map</p>
          <div class="metric-grid">
            ${mm('Regional risk index', s.risk_index.toFixed(0) + ' / 100', s.risk_rank ? `rank ${s.risk_rank} of 28` : 'UT')}
            ${mm('Rainfall reliability', s.rain_reliability.toFixed(2), 'irrigation + monsoon-2026 derived')}
            ${mm('Monsoon-2026 stress', '×' + r.stressMult.toFixed(2), 'PD multiplier for this state')}
            ${mm('Households in debt', s.sas_pct_indebted.toFixed(1) + '%', 'SAS 2019')}
          </div>
          <div class="sch" style="margin-top:12px">${[['PMFBY', x.pmfby], ['KCC', x.kcc], ['PM-KISAN', x.pmkisan], ['SHG/FPO', x.shg], ['e-NAM', x.enam], ['Soil card', x.soil]].map(([n, v]) => `<div class="${v ? 'y' : ''}"><b>${n}<span>${v ? '✓' : '—'}</span></b>${v ? 'Enrolled' : 'Not enrolled'}</div>`).join('')}</div>
        </div>
      </div>`;
  }

  /* ───────────────────────── methodology */
  let methodInit = false;
  function initMethod() {
    if (methodInit) return; methodInit = true;
    const M = KS.model, X = KS.metrics, R = KS.risk_index, S = KS.sources;
    const secs = [
      ['m-overview', 'Overview'], ['m-data', 'Data sources'], ['m-index', 'Regional risk index'], ['m-sim', 'Calibrated portfolio'],
      ['m-model', 'Scorecard'], ['m-valid', 'Validation'], ['m-stress', 'Monsoon-2026 stress'], ['m-policy', 'Loan policy'], ['m-gov', 'Governance'], ['m-limits', 'Limitations'], ['m-refs', 'References']];
    $('#toc').innerHTML = secs.map(([id, t]) => `<a href="#${id}">${t}</a>`).join('');
    const mt = (k, x) => `<td class="n">${x[k].auc.toFixed(3)}</td><td class="n">${x[k].gini.toFixed(3)}</td><td class="n">${x[k].ks.toFixed(3)}</td><td class="n">${x[k].brier != null ? x[k].brier.toFixed(4) : '—'}</td>`;
    const srcRows = Object.values(S).map(s => `<tr><td>${esc(s.label)}</td><td class="n">${esc(s.vintage)}</td><td><a href="${esc(s.url)}" target="_blank" rel="noopener">Source ↗</a></td></tr>`).join('');
    const nat = KS.national;
    $('#methodBody').innerHTML = `
    <section class="m-sec" id="m-overview">
      <h2>Overview</h2>
      <p>KrishiSetu answers two questions for a lender. <b>Where</b> in India is farm credit structurally riskier, and how is this season changing that? And <b>whom</b> should we lend to, how much, at what rate, and on what schedule? The first is answered from official statistics alone. The second needs farmer-level repayment outcomes, which India does not publish. KrishiSetu therefore pre-trains its scorecard on a farmer portfolio calibrated to those statistics, then re-estimates it on real repayments once loans are disbursed (the pilot targets 10,000 loans).</p>
      <div class="flow">
        <div><i>01</i><b>Official data</b><span>12 tables · 36 States/UTs</span></div>
        <div><i>02</i><b>Risk index</b><span>7 indicators · PCA weights</span></div>
        <div><i>03</i><b>Calibrated portfolio</b><span>${(X.n_portfolio / 1000).toFixed(0)}K simulated farmers</span></div>
        <div><i>04</i><b>Scorecard</b><span>8 factors · Bayesian logistic</span></div>
        <div><i>05</i><b>Validation</b><span>AUC · KS · calibration</span></div>
        <div><i>06</i><b>Dashboard</b><span>map · engine · stress test</span></div>
      </div>
      <div class="callout">The product is unchanged: the same eight factors, 300–850 scale, KCC scale-of-finance limits, MISS pricing, bullet repayment after harvest and honest refusals. What changed is underneath: every table now comes from a cited source, and the factor weights are estimated rather than asserted.</div>
      <p>The full pipeline is <code class="f">pipeline/build.py</code> (Python, scikit-learn). It is deterministic, with seeded random numbers, and it writes everything this site reads to <code class="f">site/data/ks_data.js</code>.</p>
    </section>

    <section class="m-sec" id="m-data">
      <h2>Data sources</h2>
      <p>Every official figure on the map links back to one of these tables. Where a State/UT is not separately surveyed (NSS reports Goa, Delhi and the smaller UTs as a "group of UTs"), the group value is used and the map hatches it.</p>
      <table class="tbl"><thead><tr><th>Dataset</th><th>Vintage</th><th></th></tr></thead><tbody>${srcRows}</tbody></table>
      <h3>Derived indicators</h3>
      <div class="formula">irrigation share   = net irrigated area ÷ net sown area                 (LUS 2021-22)
debt-to-income     = avg outstanding loan ÷ (12 × avg monthly income)    (SAS 2019)
credit gap         = 1 − min(1, operative KCCs ÷ operational holdings)   (Mar 2025 ÷ 2015-16)
PMFBY coverage     = min(1, farmer applications ÷ holdings)              (2023-24)
monsoon deficit    = (deficient + large-deficient districts) ÷ districts (1 Jun–30 Aug 2026)
paddy benchmark    = rice yield (3-yr avg, kg/ha) ÷ 0.67 outturn ÷ 100 ÷ 2.471   → q/acre
rain reliability   = 0.92 − 0.40·rainfed − 0.30·deficit·rainfed − 0.05·deficit   (clipped 0.30–0.95)</div>
    </section>

    <section class="m-sec" id="m-index">
      <h2>Regional Risk Index</h2>
      <p>A composite indicator following the OECD/JRC <i>Handbook on Constructing Composite Indicators</i>. Seven indicators, each oriented so that higher means riskier, are min–max normalised across the 28 states. Weights are the absolute loadings of the first principal component, fitted on the 28 states that have their own survey estimates (Nicoletti et al., 2000). The index is rescaled to 0–100.</p>
      <div class="chart" id="chWeightsIdx"><h4>Index weights (PCA, first component)</h4><p class="cs">PC1 explains ${(R.pc1_var * 100).toFixed(0)}% of variance across states</p></div>
      <p><b>Robustness.</b> The Spearman rank correlation between the PCA-weighted index and an equal-weighted index is <span class="num">${R.spearman_equal.toFixed(3)}</span>, so the state ranking does not depend on the weighting choice.</p>
    </section>

    <section class="m-sec" id="m-sim">
      <h2>Calibrated portfolio</h2>
      <p>India has no public dataset of farmer-level agricultural loan repayments. KrishiSetu therefore builds a synthetic portfolio of ${X.n_portfolio.toLocaleString('en-IN')} farmers. Each farmer is drawn so that state-level aggregates reproduce the official statistics, then simulated through one crop cycle to see whether they repay. This is standard practice for cold-start credit models and for stress testing (BCBS, 2005). The weights are a prior to be replaced by real outcomes.</p>
      <table class="tbl"><thead><tr><th>Farmer attribute</th><th>Calibrated to</th></tr></thead><tbody>
        <tr><td>Landholding size</td><td>Log-normal around the state average operational holding (Agri Census 2015-16)</td></tr>
        <tr><td>Irrigation status</td><td>Bernoulli at the state's net irrigated share (LUS 2021-22)</td></tr>
        <tr><td>Primary crop</td><td>State crop mix across the 8 modelled crops (assumption informed by DES area statistics)</td></tr>
        <tr><td>Yield</td><td>State benchmark (DES rice/wheat; v2 tables otherwise) × farmer skill, with an irrigation premium</td></tr>
        <tr><td>Household income</td><td>Off-farm income set so that mean total income matches SAS 2019, uplifted 32% to 2026 prices</td></tr>
        <tr><td>Existing debt</td><td>Incidence = SAS share indebted; amount log-normal with mean = SAS outstanding ÷ incidence</td></tr>
        <tr><td>KCC / PMFBY enrolment</td><td>Operative KCCs ÷ holdings (Mar 2025); PMFBY applications ÷ holdings (2023-24)</td></tr>
        <tr><td>Weather events, 3 yrs</td><td>Poisson, rate rising with rain-fed share and the monsoon-2026 deficit</td></tr>
        <tr><td>Portfolio default rate</td><td>Holdings-weighted ${pct(X.default_rate_weighted, 2)}, calibrated to RBI agri GNPA 5.1% (Mar 2026)</td></tr>
      </tbody></table>
      <h3>Outcome model (one crop cycle)</h3>
      <div class="formula">shock_state,year ~ normal year ± 8%  |  drought w.p. 12% + 22%·deficit·rainfed  → 18–42% loss
realised yield   = reported yield × (1 − water_sensitivity × shock × irrigation exposure) × noise
price            = MSP if procured (w.p. MSP protection) else MSP × lognormal(−6%, crop price CV)
PMFBY payout     = 70% of revenue shortfall when loss > 30% (if enrolled)
surplus          = revenue − inputs + payout + off-farm − household − debt service − health shock (8%)
capacity         = surplus ÷ (loan principal + interest over crop tenure)
logit P(default) = α − 1.6·ln(capacity) − 0.95·willingness − 0.35·SHG + 0.45·oral lease − 0.15·KCC + 0.25·over-indebted</div>
      <p>The structure follows the agricultural-credit literature: repayment is driven by cash-flow capacity after weather and price shocks (Turvey, 1991), willingness and peer monitoring matter (SHG), and insurance converts weather shocks into payouts (Carter et al., 2017). Latent skill and willingness are never shown to the scorecard. It sees only what a lender could observe.</p>
    </section>

    <section class="m-sec" id="m-model">
      <h2>Scorecard</h2>
      <p>The eight factor sub-scores are computed exactly as in Credit Engine v2 and standardised. A logistic regression then predicts the probability of repaying. An unconstrained fit puts about ${pct(KS.metrics.prior.unconstrained_weights[2] + KS.metrics.prior.unconstrained_weights[3])} of the weight on repayment history and DSCR, because yield, weather and price act on default <i>through</i> cash flow. To keep the agronomic factors informative, KrishiSetu fits a <b>Bayesian (MAP) scorecard with a Gaussian prior centred on the v2 expert weights</b> (Gelman et al., 2008). The prior strength λ = ${KS.metrics.prior.lambda_chosen} is the largest that costs at most 0.005 AUC on held-out data.</p>
      <div class="chart" id="chWeights"><h4>Factor weights: expert prior vs learned</h4><p class="cs">Share of total weight on the raw factor scale (the same definition v2 used)</p></div>
      <h3>From probability to score</h3>
      <div class="formula">score = ${M.scale_offset.toFixed(1)} + ${M.scale_factor.toFixed(2)} × ln( P(good) ÷ P(bad) )      clipped to 300–850
      → 650 points = 19 : 1 odds (PD 5%),  +50 points doubles the odds   (Siddiqi, 2017)</div>
      <table class="tbl" style="margin-top:12px"><thead><tr><th>Band</th><th>Score</th><th>Base rate</th><th>Limit multiplier</th><th>Observed default (sim.)</th></tr></thead><tbody>
        ${KS.engine.bands.map((b, i, a) => `<tr><td><b style="color:${bandColor(b.name)}">${b.name}</b></td><td class="n">${b.floor === 0 ? '< 500' : b.floor + (i ? '–' + (a[i - 1].floor - 1) : '+')}</td><td class="n">${b.rate.toFixed(1)}%</td><td class="n">×${b.cap}</td><td class="n">${X.band_default[b.name] != null ? pct(X.band_default[b.name], 1) : '—'}</td></tr>`).join('')}
      </tbody></table>
    </section>

    <section class="m-sec" id="m-valid">
      <h2>Validation</h2>
      <p>Random 75/25 split, with ${X.n_train.toLocaleString('en-IN')} borrowers for training and ${X.n_test.toLocaleString('en-IN')} held out. The metrics are the standard credit-scoring battery: discrimination (AUC, Gini, KS) and calibration (Brier score, decile plot). A gradient-boosting challenger (LightGBM-style histogram GBM) on 20 raw inputs bounds what a black-box model could add (Lessmann et al., 2015).</p>
      <table class="tbl"><thead><tr><th>Model (held-out)</th><th>AUC</th><th>Gini</th><th>KS</th><th>Brier</th></tr></thead><tbody>
        <tr><td>v2 hand-weighted composite</td>${mt('v2_handweighted_test', X)}</tr>
        <tr><td><b>v3 Bayesian scorecard (deployed)</b></td>${mt('scorecard_test', X)}</tr>
        <tr><td>Unconstrained logistic</td>${mt('scorecard_unconstrained_test', X)}</tr>
        <tr><td>Gradient-boosting challenger</td>${mt('gbm_test', X)}</tr>
      </tbody></table>
      <div class="callout">The deployed scorecard keeps ${(((X.scorecard_test.auc - 0.5) / (X.gbm_test.auc - 0.5)) * 100).toFixed(0)}% of the black-box challenger's discriminating power above random, while staying fully explainable: each point is attributable to one factor, which gives the borrower reason codes. It lifts AUC from ${X.v2_handweighted_test.auc.toFixed(2)} to ${X.scorecard_test.auc.toFixed(2)} over the v2 hand weights.</div>
      <div class="grid2">
        <div class="chart" id="chCalib"><h4>Calibration</h4><p class="cs">Predicted vs observed default, held-out deciles</p></div>
        <div class="chart" id="chHist"><h4>Score distribution</h4><p class="cs">Holdings-weighted, all States/UTs, by band</p></div>
      </div>
    </section>

    <section class="m-sec" id="m-stress">
      <h2>Monsoon-2026 stress test</h2>
      <p>The same portfolio is re-simulated with each state's rainfall shock conditioned on the share of its districts in deficit during the 2026 season. Nationally, default rises from <span class="num">${pct(nat.default_baseline, 2)}</span> to <span class="num">${pct(nat.default_m26, 2)}</span>. Rain-fed states with deep deficits take the hit; Odisha, the one subdivision with excess rain, improves.</p>
      <div class="chart" id="chStress"><h4>Change in default rate under monsoon-2026 conditions</h4><p class="cs">Percentage points vs baseline, major states</p></div>
    </section>

    <section class="m-sec" id="m-policy">
      <h2>Loan policy (product rules, unchanged)</h2>
      <ul>
        <li><b>Limit</b> = min(request, 1.5 × annual surplus, KCC scale of finance = input cost × 1.3) × band multiplier.</li>
        <li><b>Pricing</b>: band base rate. KCC loans scoring ≥ 600 qualify for MISS (7% standard, 1.5% subvention + 3% prompt-repayment incentive → 4% effective). The MISS limit is <b>₹5 lakh</b> following Union Budget 2025-26 (earlier ₹3 lakh).</li>
        <li><b>Tenure</b>: bullet repayment 14 days after harvest sale. Interest accrues only over the crop tenure.</li>
        <li><b>Collateral</b>: none up to RBI's ₹2 lakh agri limit. Tenure (owned, registered or oral lease) is scored instead of pledged.</li>
        <li><b>Honest refusals</b>: a household with a negative surplus gets ₹0 and an advisory path, not a loan it cannot repay.</li>
      </ul>
    </section>

    <section class="m-sec" id="m-gov">
      <h2>Governance &amp; fairness</h2>
      <ul>
        <li><b>No protected attributes.</b> Caste, religion and gender are neither collected nor proxied. Tenure is scored because it is the credit-relevant variable, and scoring it brings tenant farmers into the book rather than excluding them.</li>
        <li><b>Explainability.</b> The additive points structure gives every applicant ranked reason codes, consistent with the explainability and fairness principles in RBI's FREE-AI framework (2025).</li>
        <li><b>Monitoring.</b> In production: population-stability index on each factor, approval-rate parity by holding size (marginal vs others) and tenure type (equal-opportunity check, Hardt et al., 2016), and quarterly re-estimation as repayment data arrives.</li>
        <li><b>Data protection.</b> Consent-based pulls under the DPDP Act 2023 via Account Aggregator and AgriStack. Repayments are reported to CICs so the history belongs to the farmer.</li>
      </ul>
    </section>

    <section class="m-sec" id="m-limits">
      <h2>Limitations</h2>
      <div class="callout warn">Farmer-level results (scores, default rates, approval rates and learned weights) come from a simulated portfolio. They show how the engine behaves on a realistic population. They are not observed repayment outcomes.</div>
      <ul>
        <li>SAS 2019 and Agri Census 2015-16 are the latest releases. Incomes are uplifted to 2026 prices, but structure may have shifted, and the Agriculture Census 2021-22 will replace the holdings data when it is published.</li>
        <li>Monsoon-2026 district categories are as of 30 August (three of four monsoon months). The full season closed at 87% of LPA nationally.</li>
        <li>Benchmarks for crops other than paddy and wheat carry the v2 tables, or a productivity-scaled national value where no v2 value exists.</li>
        <li>Map boundaries are simplified for display and are not survey-grade.</li>
      </ul>
      <h3>Path to production</h3>
      <ol><li>Live feeds: IMD district rainfall, Sentinel-2 NDVI, AgriStack land records, PM-KISAN and PMFBY enrolment APIs.</li><li>Pilot: Vidarbha and Bundelkhand, 3 co-lenders, 10,000 loans. Re-estimate the scorecard on real outcomes and recalibrate PD to the observed book.</li><li>Lender-approved credit policy and independent model validation before scale-up.</li></ol>
    </section>

    <section class="m-sec" id="m-refs">
      <h2>References</h2>
      <ol class="refs">${REFS.map(r => `<li>${r[0]} <a href="${r[1]}" target="_blank" rel="noopener">↗</a></li>`).join('')}</ol>
    </section>`;
    drawIdxWeights(); drawWeights(); drawCalib(); drawHist(); drawStress();
  }
  const sch = q => 'https://scholar.google.com/scholar?q=' + encodeURIComponent(q);
  const REFS = [
    ['Siddiqi, N. (2017). <i>Intelligent Credit Scoring: Building and Implementing Better Credit Risk Scorecards</i> (2nd ed.). Wiley.', sch('Siddiqi Intelligent Credit Scoring 2017')],
    ['Thomas, L. C., Crook, J. N., & Edelman, D. B. (2017). <i>Credit Scoring and Its Applications</i> (2nd ed.). SIAM.', sch('Thomas Crook Edelman Credit Scoring and Its Applications')],
    ['Hand, D. J., & Henley, W. E. (1997). Statistical classification methods in consumer credit scoring: a review. <i>JRSS Series A</i>, 160(3), 523–541.', sch('Hand Henley 1997 Statistical classification methods in consumer credit scoring')],
    ['Lessmann, S., Baesens, B., Seow, H.-V., & Thomas, L. C. (2015). Benchmarking state-of-the-art classification algorithms for credit scoring: An update of research. <i>European Journal of Operational Research</i>, 247(1), 124–136.', sch('Lessmann Baesens Seow Thomas 2015 benchmarking classification algorithms credit scoring')],
    ['Turvey, C. G. (1991). Credit scoring for agricultural loans: A review with applications. <i>Agricultural Finance Review</i>, 51, 43–54.', sch('Turvey 1991 Credit scoring for agricultural loans')],
    ['Schreiner, M. (2000). Credit scoring for microfinance: Can it work? <i>Journal of Microfinance</i>, 2(2), 105–118.', sch('Schreiner Credit scoring for microfinance can it work')],
    ['Gelman, A., Jakulin, A., Pittau, M. G., & Su, Y.-S. (2008). A weakly informative default prior distribution for logistic and other regression models. <i>Annals of Applied Statistics</i>, 2(4), 1360–1383.', sch('Gelman Jakulin Pittau Su 2008 weakly informative default prior logistic')],
    ['Niculescu-Mizil, A., & Caruana, R. (2005). Predicting good probabilities with supervised learning. <i>ICML</i>.', sch('Niculescu-Mizil Caruana 2005 Predicting good probabilities with supervised learning')],
    ['Ke, G., et al. (2017). LightGBM: A highly efficient gradient boosting decision tree. <i>NeurIPS</i>.', sch('Ke LightGBM highly efficient gradient boosting decision tree 2017')],
    ['OECD & JRC (2008). <i>Handbook on Constructing Composite Indicators: Methodology and User Guide</i>. OECD Publishing.', sch('OECD JRC Handbook on Constructing Composite Indicators 2008')],
    ['Nicoletti, G., Scarpetta, S., & Boylaud, O. (2000). Summary indicators of product market regulation with an extension to employment protection legislation. <i>OECD Economics Department Working Papers</i>, No. 226.', sch('Nicoletti Scarpetta Boylaud 2000 summary indicators product market regulation')],
    ['Basel Committee on Banking Supervision (2005). <i>Studies on the Validation of Internal Rating Systems</i>, Working Paper No. 14. BIS.', sch('BCBS 2005 Studies on the validation of internal rating systems working paper 14')],
    ['Carter, M., de Janvry, A., Sadoulet, E., & Sarris, A. (2017). Index insurance for developing country agriculture: A reassessment. <i>Annual Review of Resource Economics</i>, 9, 421–438.', sch('Carter de Janvry Sadoulet Sarris 2017 index insurance developing country agriculture reassessment')],
    ['Giné, X., Townsend, R., & Vickery, J. (2008). Patterns of rainfall insurance participation in rural India. <i>World Bank Economic Review</i>, 22(3), 539–566.', sch('Gine Townsend Vickery 2008 rainfall insurance participation rural India')],
    ['Cole, S., Giné, X., Tobacman, J., Topalova, P., Townsend, R., & Vickery, J. (2013). Barriers to household risk management: Evidence from India. <i>AEJ: Applied Economics</i>, 5(1), 104–135.', sch('Cole Gine Tobacman Topalova Townsend Vickery 2013 barriers household risk management India')],
    ['Burgess, R., & Pande, R. (2005). Do rural banks matter? Evidence from the Indian social banking experiment. <i>American Economic Review</i>, 95(3), 780–795.', sch('Burgess Pande 2005 Do rural banks matter Indian social banking experiment')],
    ['Giné, X., & Kanz, M. (2018). The economic effects of a borrower bailout: Evidence from an emerging market. <i>Review of Financial Studies</i>, 31(5), 1752–1783.', sch('Gine Kanz economic effects of a borrower bailout emerging market')],
    ['Hardt, M., Price, E., & Srebro, N. (2016). Equality of opportunity in supervised learning. <i>NeurIPS</i>.', sch('Hardt Price Srebro 2016 Equality of opportunity in supervised learning')],
    ['NSO, MoSPI (2021). <i>Situation Assessment of Agricultural Households and Land and Livestock Holdings of Households in Rural India, 2019</i> (NSS Report No. 587).', 'https://pib.gov.in/PressReleasePage.aspx?PRID=1753856'],
    ['Reserve Bank of India (2019). <i>Report of the Internal Working Group to Review Agricultural Credit</i>.', sch('RBI Internal Working Group to Review Agricultural Credit 2019')],
    ['Reserve Bank of India (2022). <i>Guidelines on Digital Lending</i>; (2023) <i>Default Loss Guarantee in Digital Lending</i>.', sch('RBI Guidelines on Digital Lending 2022 default loss guarantee')],
    ['Reserve Bank of India (2025). <i>Framework for Responsible and Ethical Enablement of Artificial Intelligence (FREE-AI)</i>.', sch('RBI FREE-AI framework responsible ethical enablement artificial intelligence 2025')],
    ['Reserve Bank of India (2026). <i>Financial Stability Report</i>, June 2026.', 'https://rbi.org.in/scripts/PublicationReportDetails.aspx?ID=1325'],
    ['India Meteorological Department (2026). <i>Salient Features of the 2026 Southwest Monsoon</i>.', 'https://mausam.imd.gov.in/Forecast/marquee_data/Salient_Features_SW_MONSOON%20_2026_30_sep.pdf']
  ];

  /* ───────────────────────── small SVG charts */
  function chartSvg(host, w, h) { const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img' }); host.appendChild(svg); return svg; }
  function tipFor(host) { let t = host.querySelector('.chart-tip'); if (!t) { t = document.createElement('div'); t.className = 'chart-tip'; t.hidden = true; host.appendChild(t); } return t; }
  function hover(host, node, html) {
    const t = tipFor(host);
    node.addEventListener('mouseenter', e => { t.innerHTML = html; t.hidden = false; });
    node.addEventListener('mousemove', e => { const r = host.getBoundingClientRect(); t.style.left = (e.clientX - r.left) + 'px'; t.style.top = (e.clientY - r.top) + 'px'; });
    node.addEventListener('mouseleave', () => t.hidden = true);
  }
  function drawIdxWeights() {
    const host = $('#chWeightsIdx'), comps = KS.risk_index.components.slice().sort((a, b) => b.weight - a.weight);
    const W = 760, rowH = 30, H = comps.length * rowH + 10, x0 = 290, max = Math.max(...comps.map(c => c.weight));
    const svg = chartSvg(host, W, H);
    comps.forEach((c, i) => {
      const y = i * rowH + 6;
      const t = el('text', { x: 0, y: y + 14, class: 'ax', style: 'font-family:var(--sans);font-size:12.5px;fill:var(--ink-2)' }, svg); t.textContent = c.label;
      const bw = (W - x0 - 60) * c.weight / max;
      const r = el('rect', { x: x0, y: y + 3, width: bw, height: 16, rx: 4, fill: RAMPS.risk[4] }, svg);
      const v = el('text', { x: x0 + bw + 8, y: y + 15, class: 'ax' }, svg); v.textContent = pct(c.weight, 1);
      hover(host, r, `${esc(c.label)}: ${pct(c.weight, 1)}`);
    });
  }
  function drawWeights() {
    const host = $('#chWeights'), M = KS.model, free = KS.metrics.prior.unconstrained_weights;
    const series = [['Expert prior (v2)', M.v2_weights, '#9aa09a'], ['Learned (deployed)', M.learned_weights, '#17764f'], ['Unconstrained', free, '#86b6ef']];
    const W = 760, group = 46, H = M.labels.length * group + 10, x0 = 230, max = Math.max(...series.flatMap(s => s[1]));
    const svg = chartSvg(host, W, H);
    for (let g = 0; g <= 4; g++) { const x = x0 + (W - x0 - 50) * g / 4; el('line', { x1: x, x2: x, y1: 0, y2: H - 6, class: 'gl' }, svg); const t = el('text', { x, y: H + 4, class: 'ax', 'text-anchor': 'middle' }, svg); t.textContent = pct(max * g / 4); }
    M.labels.forEach((lab, i) => {
      const y = i * group + 4;
      const t = el('text', { x: 0, y: y + 22, style: 'font-size:12.5px;fill:var(--ink-2)' }, svg); t.textContent = lab;
      series.forEach(([n, arr, col], k) => {
        const v = Math.max(0, arr[i]), bw = (W - x0 - 50) * v / max;
        const r = el('rect', { x: x0, y: y + k * 13, width: Math.max(1, bw), height: 11, rx: 3, fill: col }, svg);
        hover(host, r, `${esc(lab)} · ${n}: ${pct(arr[i], 1)}`);
        if (k === 1) { const tv = el('text', { x: x0 + bw + 6, y: y + 13 + 9, class: 'ax', style: 'fill:var(--ink)' }, svg); tv.textContent = pct(v, 1); }
      });
    });
    host.insertAdjacentHTML('beforeend', `<div class="lg">${series.map(s => `<span><i style="background:${s[2]}"></i>${s[0]}</span>`).join('')}</div>`);
  }
  function drawCalib() {
    const host = $('#chCalib'), cal = KS.metrics.calibration, W = 360, H = 260, pad = 36;
    const max = Math.max(...cal.map(c => Math.max(c.pred, c.obs))) * 1.08;
    const svg = chartSvg(host, W, H), sx = v => pad + v / max * (W - pad - 10), sy = v => H - pad - v / max * (H - pad - 10);
    for (let g = 0; g <= 4; g++) { const v = max * g / 4; el('line', { x1: pad, x2: W - 10, y1: sy(v), y2: sy(v), class: 'gl' }, svg); const t = el('text', { x: pad - 6, y: sy(v) + 3, class: 'ax', 'text-anchor': 'end' }, svg); t.textContent = pct(v); const t2 = el('text', { x: sx(v), y: H - pad + 14, class: 'ax', 'text-anchor': 'middle' }, svg); t2.textContent = pct(v); }
    el('line', { x1: sx(0), y1: sy(0), x2: sx(max), y2: sy(max), stroke: '#c9c6bb', 'stroke-dasharray': '4 4' }, svg);
    el('polyline', { points: cal.map(c => sx(c.pred) + ',' + sy(c.obs)).join(' '), fill: 'none', stroke: 'var(--chart-green)', 'stroke-width': 2 }, svg);
    cal.forEach(c => { const d = el('circle', { cx: sx(c.pred), cy: sy(c.obs), r: 5, fill: 'var(--chart-green)', stroke: '#fff', 'stroke-width': 2 }, svg); hover(host, d, `Decile ${c.dec + 1}: predicted ${pct(c.pred, 1)}, observed ${pct(c.obs, 1)}`); });
    const xl = el('text', { x: (W + pad) / 2, y: H - 4, class: 'ax', 'text-anchor': 'middle' }, svg); xl.textContent = 'Predicted PD';
    host.insertAdjacentHTML('beforeend', '<div class="lg"><span><i style="background:var(--chart-green)"></i>Held-out decile</span><span><i style="background:#c9c6bb"></i>Perfect calibration</span></div>');
  }
  function drawHist() {
    const host = $('#chHist'), h = KS.metrics.score_hist, W = 360, H = 260, pad = 36;
    const tot = h.counts.reduce((a, b) => a + b, 0), max = Math.max(...h.counts) / tot;
    const svg = chartSvg(host, W, H), n = h.counts.length, bw = (W - pad - 10) / n;
    h.counts.forEach((c, i) => {
      const v = c / tot, lo = h.edges[i], bh = (H - pad - 10) * v / max;
      const name = (KS.engine.bands.find(b => lo >= b.floor) || {}).name;
      const r = el('rect', { x: pad + i * bw + 1, y: H - pad - bh, width: bw - 2, height: Math.max(0, bh), rx: 3, fill: bandColor(name) }, svg);
      hover(host, r, `${lo}–${h.edges[i + 1] - 1}: ${pct(v, 1)} of holdings · ${name}`);
    });
    [300, 500, 600, 680, 750, 850].forEach(s => { const x = pad + (s - 300) / 575 * (W - pad - 10) * (575 / 575); const t = el('text', { x: pad + (s - 300) / 25 * bw, y: H - pad + 14, class: 'ax', 'text-anchor': 'middle' }, svg); t.textContent = s; });
    host.insertAdjacentHTML('beforeend', `<div class="lg">${BANDS.map(b => `<span><i style="background:${bandColor(b)}"></i>${b[0] + b.slice(1).toLowerCase()}</span>`).join('')}</div>`);
  }
  function drawStress() {
    const host = $('#chStress');
    const rows = CODES.filter(c => !isUT(c)).map(c => [c, (ST[c].model.default_m26 - ST[c].model.default_baseline) * 100]).sort((a, b) => b[1] - a[1]);
    const W = 760, rowH = 22, H = rows.length * rowH + 20, x0 = 150, mid = x0 + (W - x0) * 0.35, max = Math.max(...rows.map(r => Math.abs(r[1])));
    const sc = (W - mid - 50) / max;
    const svg = chartSvg(host, W, H);
    el('line', { x1: mid, x2: mid, y1: 0, y2: H - 14, stroke: '#c9c6bb' }, svg);
    rows.forEach(([c, v], i) => {
      const y = i * rowH + 2;
      const t = el('text', { x: 0, y: y + 13, style: 'font-size:12px;fill:var(--ink-2)' }, svg); t.textContent = ST[c].name;
      const w = Math.abs(v) * sc;
      const r = el('rect', { x: v >= 0 ? mid : mid - w, y: y + 3, width: Math.max(1, w), height: 13, rx: 3, fill: v >= 0 ? RAMPS.risk[4] : RAMPS.blue[3] }, svg);
      const tv = el('text', { x: v >= 0 ? mid + w + 6 : mid - w - 6, y: y + 13, class: 'ax', 'text-anchor': v >= 0 ? 'start' : 'end' }, svg); tv.textContent = (v >= 0 ? '+' : '') + v.toFixed(1) + ' pp';
      hover(host, r, `${esc(ST[c].name)}: ${pct(ST[c].model.default_baseline, 1)} → ${pct(ST[c].model.default_m26, 1)}`);
    });
  }

  /* ───────────────────────── boot */
  route();
})();
