'use strict';
/* Kern: toestand, gegevens & migratie, opslaan, opstart, navigatie, filters, lightbox.
   Invoer staat in invoer.js, de weergaven in weergaven.js. */

const S = {
  data: null,            // inhoud van log.json
  map: null,             // FileSystemDirectoryHandle
  scherm: 'tijdlijn',
  ed: null,              // { rec, origId, stap } – werkkopie in de invoer
  filters: leegFilter(),
  sort: { kol: 'datum', richting: 1 },
  detailId: null,        // record open in de tabel-detailweergave
  open: new Set(),       // opengeklapte records in de tijdlijn
  alleenLezen: false
};
function leegFilter() { return { groep: '', constraint: '', tobereq: '', view: '', modus: '', recordtype: '', zoek: '' }; }

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/* ================= gegevens ================= */

const SCHEMA_VERSIE = 2;
// Views zijn eigen aan elk model: voeg ze toe via Instellingen.
const STANDAARD_VIEWS = [];
function standaardOnderdelen() {
  return [
    { id: 'covo', naam: 'COVO-iteratie', type: 'covo', runPrefix: 'R' },
    { id: 'tobe-zonder', naam: 'TO-BE – model zonder COVO', type: 'tobe-zonder', runPrefix: 'T1' },
    { id: 'tobe-met', naam: 'TO-BE – model met COVO', type: 'tobe-met', runPrefix: 'T2' }
  ];
}
function standaardInstellingen() {
  return {
    views: [...STANDAARD_VIEWS],
    constraints: [...Array.from({ length: 13 }, (_, i) => `C${p2(i + 1)}`), 'M01', 'V01', 'V02'],
    requirements: Array.from({ length: 8 }, (_, i) => `R${i + 1}`),
    tobeRequirements: ['TB-R1', 'TB-R5', 'TB-R6', 'TB-R8', 'TB-R9'],
    onderdelen: standaardOnderdelen()
  };
}
function nieuweData() {
  return { schemaVersion: SCHEMA_VERSIE, settings: standaardInstellingen(), actiefOnderdeel: 'covo', migraties: [], records: [], werkversie: null };
}
function nieuwRecord(onderdeel = 'covo') {
  return {
    id: uid(), status: 'concept', aangemaakt: null, gewijzigd: null, run: '',
    pre: { datum: vandaag(), tijd: nuTijd(), output: '', parsed: null, screenshots: [] },
    modus: null, build: '',
    constraints: [], meldingen: [],
    intuitief: { perConstraint: {}, opmerking: '' },
    views: [], acties: [], beschrijving: '',
    behulpzaam: { moment: null, herzieningen: [] },
    requirements: { status: null, ids: [], verfijning: '' },
    aft: { datum: '', tijd: '', output: '', parsed: null, screenshots: [] },
    gevolg: null, waarschuwingen: [], parseHistoriek: [],
    onderdeel, recordtype: null, tobeRequirements: []
  };
}
/* Vult ontbrekende velden aan; bestaande waarden blijven ongemoeid. */
function vulRecordAan(r) {
  if (!Array.isArray(r.views)) r.views = r.view ? [r.view] : []; // oud formaat (v1.0): één view
  delete r.view;
  for (const side of ['pre', 'aft']) { // oud formaat (v1.0): één screenshot per moment
    const x = r[side];
    if (!x || Array.isArray(x.screenshots)) continue;
    x.screenshots = x.screenshot ? [{ naam: x.screenshot, eigen: !!x.screenshotEigen }] : [];
    delete x.screenshot; delete x.screenshotEigen;
  }
  const n = nieuwRecord('covo');
  for (const k of Object.keys(n)) {
    if (r[k] === undefined) r[k] = n[k];
    else if (n[k] && typeof n[k] === 'object' && !Array.isArray(n[k])) r[k] = Object.assign({}, n[k], r[k]);
  }
  return r;
}
function migreer(d) {
  if (!d.schemaVersion || d.schemaVersion < SCHEMA_VERSIE) d.schemaVersion = SCHEMA_VERSIE;
  d.settings = Object.assign(standaardInstellingen(), d.settings || {});
  if (d.actiefOnderdeel === undefined) d.actiefOnderdeel = d.settings.onderdelen[0].id;
  if (!Array.isArray(d.migraties)) d.migraties = [];
  d.records = (d.records || []).map(vulRecordAan);
  d.werkversie = d.werkversie || null;
  if (d.werkversie) vulRecordAan(d.werkversie.rec);
  return d;
}
/* Zelfcontrole: elk pad uit het origineel moet ongewijzigd aanwezig zijn in het resultaat. */
const TOEGESTANE_WIJZIGINGEN = /^schemaVersion$|^(records\[\d+\]|werkversie\.rec)\.(view|(pre|aft)\.screenshot(Eigen)?)$/;
function verschillen(a, b, pad = '', uit = []) {
  if (uit.length > 25) return uit;
  if (a === null || typeof a !== 'object') { if (a !== b) uit.push(pad || '(root)'); return uit; }
  if (b === null || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) { uit.push(pad); return uit; }
  if (Array.isArray(a)) {
    if (a.length !== b.length) uit.push(`${pad} (lengte)`);
    a.forEach((x, i) => verschillen(x, b[i], `${pad}[${i}]`, uit));
    return uit;
  }
  for (const k of Object.keys(a)) verschillen(a[k], b[k], pad ? `${pad}.${k}` : k, uit);
  return uit;
}

/* ---------- onderdelen ---------- */
const onderdelen = () => S.data.settings.onderdelen;
const onderdeelVan = id => onderdelen().find(o => o.id === id) || null;
const actief = () => onderdeelVan(S.data.actiefOnderdeel) || onderdelen()[0];
const typeVan = r => (onderdeelVan(r.onderdeel) || { type: 'covo' }).type;
const recsVan = id => S.data.records.filter(r => r.onderdeel === id);
const recsActief = () => recsVan(actief().id);
const zoek = id => S.data.records.find(r => r.id === id);

/* Vorig record binnen hetzelfde onderdeel. */
function vorigBinnen(onderdeelId, origId) {
  const lijst = chrono(recsVan(onderdeelId));
  if (!origId) return lijst[lijst.length - 1] || null;
  const i = lijst.findIndex(r => r.id === origId);
  return i > 0 ? lijst[i - 1] : null;
}
/* Eindtoestand van de COVO-iteratie: startpunt voor het eerste record van TO-BE met COVO. */
function laatsteCovo() {
  const ids = onderdelen().filter(o => o.type === 'covo').map(o => o.id);
  const lijst = chrono(S.data.records.filter(r => ids.includes(r.onderdeel)));
  return lijst[lijst.length - 1] || null;
}
function vorigVoor(rec, origId) {
  const v = vorigBinnen(rec.onderdeel, origId);
  if (v) return v;
  return typeVan(rec) === 'tobe-met' ? laatsteCovo() : null;
}

/* ================= opslaan & meldingen ================= */

let saveTimer = null, savePending = false;
function bewaarLog(direct) {
  if (S.alleenLezen || !S.map) return;
  clearTimeout(saveTimer);
  savePending = true;
  const doe = () => {
    zetStatus('Opslaan…');
    Opslag.schrijfLog(S.map, S.data)
      .then(() => { savePending = false; zetStatus('Opgeslagen ' + nuTijd()); })
      .catch(e => { zetStatus('Fout bij opslaan!', true); toonMelding('Opslaan mislukt: ' + e.message, 'fout'); });
  };
  if (direct) doe(); else saveTimer = setTimeout(doe, 700);
}
function bewaarWerkversie() { S.data.werkversie = S.ed; bewaarLog(); }
function zetStatus(t, fout) { const el = $('#opslagstatus'); el.textContent = t; el.classList.toggle('fout', !!fout); }

let meldingTimer = null;
function toonMelding(t, soort = 'info') {
  const el = $('#melding');
  el.className = soort; el.textContent = t; el.hidden = false;
  clearTimeout(meldingTimer);
  if (soort !== 'fout') meldingTimer = setTimeout(() => { el.hidden = true; }, 7000);
  else el.onclick = () => { el.hidden = true; };
}
function bevestig(html, jaTekst = 'Bevestigen', gevaar = false) {
  return new Promise(res => {
    const d = $('#dlg'), ja = $('#dlg-ja'), nee = $('#dlg-nee');
    $('#dlg-inhoud').innerHTML = html;
    ja.textContent = jaTekst;
    ja.classList.toggle('gevaar', gevaar);
    let klaar = false;
    const sluit = v => { if (klaar) return; klaar = true; d.close(); res(v); };
    ja.onclick = () => sluit(true);
    nee.onclick = () => sluit(false);
    d.oncancel = () => sluit(false);
    d.showModal();
  });
}

/* ================= opstart ================= */

document.addEventListener('DOMContentLoaded', start);
window.addEventListener('beforeunload', e => { if (savePending) { e.preventDefault(); e.returnValue = ''; } });

async function start() {
  $('#nav').addEventListener('click', e => {
    const b = e.target.closest('[data-scherm]');
    if (!b || !S.data) return;
    if (b.dataset.scherm === 'invoer' && !S.ed) { startNieuw(); return; }
    S.scherm = b.dataset.scherm;
    if (S.scherm !== 'tabel') S.detailId = null;
    render();
  });
  $('#onderdeel').addEventListener('change', e => kiesOnderdeel(e.target.value));
  $('#btn-csv').addEventListener('click', () => S.data && exporteerCsv(S.data, actief()));
  $('#btn-json').addEventListener('click', () => S.data && exporteerJson(S.data));
  bindLightbox();
  bindToetsen();

  if (!('showDirectoryPicker' in window)) { toonStart('geenapi'); return; }
  let h = null;
  try { h = await Opslag.haalBewaardeMap(); } catch (e) { /* geen bewaarde map */ }
  if (!h) { toonStart('kies'); return; }
  if (await Opslag.toestemming(h, false)) await openMap(h);
  else toonStart('hervat', h);
}

function toonStart(soort, h) {
  document.body.classList.remove('geladen');
  const m = $('#main');
  if (soort === 'geenapi') {
    m.innerHTML = `<section class="kaart start"><h2>Browser niet ondersteund</h2>
      <p>Deze tool gebruikt de File System Access API. Open <code>index.html</code> in Google Chrome of Microsoft Edge.</p></section>`;
    return;
  }
  m.innerHTML = soort === 'hervat'
    ? `<section class="kaart start"><h2>Toegang tot de gegevensmap</h2>
        <p>De tool werkte met de map <b>${esc(h.name)}</b>. De browser vraagt opnieuw toestemming om die map te lezen en te schrijven.</p>
        <p><button class="primair" id="st-hervat">Toegang geven tot “${esc(h.name)}”</button> <button id="st-kies">Andere map kiezen</button></p></section>`
    : `<section class="kaart start"><h2>Welkom</h2>
        <p>Kies de map waarin de log bewaard wordt, bijvoorbeeld een map in OneDrive. De tool maakt daarin <code>log.json</code>, dagelijkse back-ups en een map <code>screenshots/</code>.</p>
        <p><button class="primair" id="st-kies">Gegevensmap kiezen</button></p></section>`;
  const hv = $('#st-hervat');
  if (hv) hv.addEventListener('click', async () => { if (await Opslag.toestemming(h, true)) openMap(h); });
  $('#st-kies').addEventListener('click', kiesAndereMap);
}
async function kiesAndereMap() {
  try { await openMap(await Opslag.kiesMap()); }
  catch (e) { if (e.name !== 'AbortError') toonMelding(e.message, 'fout'); }
}
function toonBlokkade(titel, html) {
  S.alleenLezen = true;
  document.body.classList.remove('geladen');
  $('#main').innerHTML = `<section class="kaart start"><h2>${titel}</h2>${html}
    <p>De tool schrijft niets weg zolang dit niet opgelost is.</p></section>`;
}
async function openMap(h) {
  S.map = h; S.ed = null; S.open.clear(); S.detailId = null; S.filters = leegFilter(); S.alleenLezen = false;
  try { await Opslag.onthoudMap(h); } catch (e) { /* niet fataal */ }
  $('#mapnaam').textContent = '📁 ' + h.name;
  let t;
  try { t = await Opslag.leesTekst(h, 'log.json'); }
  catch (e) { toonMelding('log.json kan niet gelezen worden: ' + e.message, 'fout'); return; }
  if (t === null) {
    S.data = nieuweData();
    bewaarLog(true);
  } else {
    let ruw;
    try { ruw = JSON.parse(t); }
    catch (e) {
      toonBlokkade('log.json is beschadigd', `<p>${esc(e.message)}</p><p>Herstel eventueel een <code>log.backup-…json</code> door het te hernoemen naar <code>log.json</code>.</p>`);
      return;
    }
    const versie = ruw.schemaVersion || 1;
    if (versie > SCHEMA_VERSIE) {
      toonBlokkade('Log is nieuwer dan deze tool', `<p>Dit log heeft schemaversie ${versie}; deze tool kent versie ${SCHEMA_VERSIE}. Gebruik een recentere versie van de tool.</p>`);
      return;
    }
    if (versie < SCHEMA_VERSIE) {
      if (!(await migreerMetBackup(h, t, versie))) return;
    } else S.data = migreer(ruw);
  }
  document.body.classList.add('geladen');
  S.scherm = 'tijdlijn';
  if (S.data.werkversie) {
    S.ed = S.data.werkversie;
    S.data.actiefOnderdeel = S.ed.rec.onderdeel;
    S.scherm = 'invoer';
    toonMelding('Niet-bewaarde invoer van de vorige keer is hersteld.');
  }
  render();
}
/* Migratie: 1) back-up schrijven en controleren, 2) migreren in het geheugen,
   3) zelfcontrole (niets gewijzigd of verwijderd), 4) pas dan wegschrijven. */
async function migreerMetBackup(h, tekst, vanVersie) {
  let backup;
  try { backup = await Opslag.backupVoorMigratie(h); }
  catch (e) {
    toonBlokkade('Migratie gestopt', `<p>De back-up vóór de migratie kon niet veilig geschreven worden: ${esc(e.message)}</p>`);
    return false;
  }
  const d = migreer(JSON.parse(tekst));
  const fout = verschillen(JSON.parse(tekst), d).filter(p => !TOEGESTANE_WIJZIGINGEN.test(p));
  if (fout.length) {
    toonBlokkade('Migratie gestopt', `<p>De zelfcontrole vond gewijzigde of ontbrekende waarden:</p><ul>${fout.slice(0, 10).map(p => `<li><code>${esc(p)}</code></li>`).join('')}</ul>
      <p><code>log.json</code> is niet aangepast. De back-up staat in <code>${esc(backup)}</code>.</p>`);
    return false;
  }
  d.migraties.push({ van: vanVersie, naar: SCHEMA_VERSIE, datum: isoNu(), backup });
  S.data = d;
  bewaarLog(true);
  toonMelding(`Log omgezet naar versie ${SCHEMA_VERSIE} (${d.records.length} records). Back-up van vóór de omzetting: ${backup}.`);
  return true;
}

/* ================= render & navigatie ================= */

function kiesOnderdeel(id) {
  if (S.ed || !onderdeelVan(id)) return;
  S.data.actiefOnderdeel = id;
  S.filters = leegFilter(); S.open.clear(); S.detailId = null;
  bewaarLog();
  render();
}
function render() {
  const o = actief();
  document.body.dataset.type = o.type;
  const sel = $('#onderdeel');
  sel.innerHTML = onderdelen().map(x => `<option value="${esc(x.id)}" ${x.id === o.id ? 'selected' : ''}>${esc(x.naam)}</option>`).join('');
  sel.disabled = !!S.ed;
  sel.title = S.ed ? 'Rond eerst de invoer af of annuleer ze.' : '';
  const heeftTobe = ['tobe-zonder', 'tobe-met'].every(t => onderdelen().some(x => x.type === t));
  $('#nav-vergelijking').hidden = !heeftTobe;
  if (S.scherm === 'vergelijking' && !heeftTobe) S.scherm = 'tijdlijn';
  $$('#nav [data-scherm]').forEach(b => b.classList.toggle('actief', b.dataset.scherm === S.scherm));
  $('#nav-invoer').textContent = S.ed ? '✎ Invoer (bezig)' : '+ Nieuw record';
  $('#btn-csv').title = `CSV van “${o.naam}”`;
  const m = $('#main');
  if (S.scherm === 'invoer' && S.ed) renderEditor(m);
  else if (S.scherm === 'tabel') renderTabel(m);
  else if (S.scherm === 'overzicht') renderOverzicht(m);
  else if (S.scherm === 'vergelijking') renderVergelijking(m);
  else if (S.scherm === 'instellingen') renderInstellingen(m);
  else { S.scherm = 'tijdlijn'; renderTijdlijn(m); }
}

/* ================= filters & zoeken ================= */

function filterBalk(alleRecs, type) {
  const f = S.filters;
  const sel = (naam, label, opties) => `<label>${label} <select data-filter="${naam}"><option value="">alle</option>${opties.map(([v, l]) => `<option value="${esc(v)}" ${String(f[naam]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const groepen = [...new Set(alleRecs.map(r => groepVan(r.run)).filter(g => g !== null))].sort((a, b) => a - b);
  const cons = [...new Set(alleRecs.flatMap(r => r.constraints))].sort();
  const treqs = [...new Set([...S.data.settings.tobeRequirements, ...alleRecs.flatMap(r => r.tobeRequirements)])];
  const views = [...new Set([...S.data.settings.views, ...alleRecs.flatMap(r => r.views)])];
  const delen = [];
  if (type === 'covo') delen.push(sel('groep', 'Groep', groepen.map(g => [g, 'Groep ' + g])));
  if (type === 'tobe-met') delen.push(sel('recordtype', 'Type', Object.entries(LABELS.recordtype)));
  if (type !== 'covo') delen.push(sel('tobereq', 'Requirement', treqs.map(q => [q, q])));
  if (type !== 'tobe-zonder') delen.push(sel('constraint', 'Constraint', cons.map(c => [c, c])));
  delen.push(sel('view', 'View', views.map(v => [v, v])));
  if (type !== 'tobe-zonder') delen.push(sel('modus', 'Modus', Object.entries(LABELS.modus)));
  delen.push(`<label>Zoeken <input type="search" data-filter="zoek" value="${esc(f.zoek)}" placeholder="in run en beschrijving"></label>`);
  return `<div class="filters">${delen.join('')}
    ${Object.values(f).some(Boolean) ? '<button type="button" class="klein" data-action="wis-filters">Filters wissen</button>' : ''}</div>`;
}
function pasFilterToe(recs) {
  const f = S.filters, z = f.zoek.trim().toLowerCase();
  return recs.filter(r =>
    (!f.groep || String(groepVan(r.run)) === String(f.groep)) &&
    (!f.constraint || r.constraints.includes(f.constraint)) &&
    (!f.tobereq || r.tobeRequirements.includes(f.tobereq)) &&
    (!f.view || r.views.includes(f.view)) &&
    (!f.modus || r.modus === f.modus) &&
    (!f.recordtype || r.recordtype === f.recordtype) &&
    (!z || `${r.run}\n${r.beschrijving}`.toLowerCase().includes(z)));
}
function bindFilters(m) {
  m.addEventListener('change', ev => {
    const s = ev.target.closest('select[data-filter]');
    if (s) { S.filters[s.dataset.filter] = s.value; S.detailId = null; render(); }
  });
  m.addEventListener('input', ev => {
    const z = ev.target.closest('input[data-filter="zoek"]');
    if (!z) return;
    S.filters.zoek = z.value; S.detailId = null;
    const pos = z.selectionStart;
    render();
    const nieuw = $('input[data-filter="zoek"]');
    if (nieuw) { nieuw.focus(); nieuw.setSelectionRange(pos, pos); }
  });
  m.addEventListener('click', ev => {
    if (ev.target.closest('[data-action="wis-filters"]')) { S.filters = leegFilter(); S.detailId = null; render(); }
  });
}

/* ================= lightbox ================= */

/* Alle screenshots van een reeks records, in volgorde: per record PRE 1..n, dan AFT 1..n. */
function lbItems(recs) {
  return recs.flatMap(r => ['pre', 'aft'].flatMap(side => r[side].screenshots.map((s, i) => ({
    naam: s.naam, eigen: s.eigen, run: r.run || '(geen run)', recId: r.id, side, nr: i + 1, van: r[side].screenshots.length
  }))));
}
const LB = { items: [], i: 0 };
function openLightbox(items, index) {
  if (!items.length) return;
  LB.items = items; LB.i = Math.max(0, Math.min(index, items.length - 1));
  $('#lb').hidden = false;
  toonLightbox();
}
async function toonLightbox() {
  const it = LB.items[LB.i];
  $('#lb-run').textContent = it.run;
  const m = $('#lb-moment');
  m.textContent = `${it.side.toUpperCase()} ${it.nr}/${it.van}`;
  m.className = 'lb-moment ' + it.side;
  $('#lb-naam').textContent = it.naam + (it.side === 'pre' && !it.eigen ? ' (overgenomen van vorig record)' : '');
  $('#lb-teller').textContent = `${LB.i + 1} / ${LB.items.length}`;
  $('#lb-vorige').disabled = LB.i === 0;
  $('#lb-volgende').disabled = LB.i === LB.items.length - 1;
  const img = $('#lb-img');
  img.removeAttribute('src');
  img.alt = `${it.run} ${it.side.toUpperCase()} ${it.nr}`;
  const url = await Opslag.screenshotUrl(S.map, it.naam);
  if (LB.items[LB.i] === it) { if (url) img.src = url; else img.alt = 'Bestand niet gevonden: ' + it.naam; }
}
function bladerLightbox(naar) {
  const j = Math.max(0, Math.min(naar, LB.items.length - 1));
  if (j !== LB.i) { LB.i = j; toonLightbox(); }
}
const sluitLightbox = () => { $('#lb').hidden = true; };
function bindLightbox() {
  $('#lb-sluit').addEventListener('click', sluitLightbox);
  $('#lb-vorige').addEventListener('click', () => bladerLightbox(LB.i - 1));
  $('#lb-volgende').addEventListener('click', () => bladerLightbox(LB.i + 1));
  $('#lb').addEventListener('click', ev => { if (ev.target.classList.contains('lb-beeld')) sluitLightbox(); });
}

/* Pijltjestoetsen: in de lightbox door de afbeeldingen, anders in de detailweergave door de records. */
function bindToetsen() {
  document.addEventListener('keydown', ev => {
    if (!$('#lb').hidden) {
      const acties = {
        ArrowLeft: () => bladerLightbox(LB.i - 1), ArrowUp: () => bladerLightbox(LB.i - 1),
        ArrowRight: () => bladerLightbox(LB.i + 1), ArrowDown: () => bladerLightbox(LB.i + 1),
        Home: () => bladerLightbox(0), End: () => bladerLightbox(LB.items.length - 1),
        Escape: sluitLightbox
      };
      if (acties[ev.key]) { ev.preventDefault(); acties[ev.key](); }
      return;
    }
    if ($('#dlg').open || S.scherm !== 'tabel' || !S.detailId) return;
    if (ev.target instanceof Element && ev.target.closest('input, textarea, select, [contenteditable]')) return;
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') { ev.preventDefault(); bladerDetail(-1); }
    else if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') { ev.preventDefault(); bladerDetail(1); }
    else if (ev.key === 'Escape') { S.detailId = null; render(); }
  });
}
