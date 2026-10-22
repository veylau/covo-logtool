'use strict';
/* Interface: invoer in drie stappen, tijdlijn, overzicht, instellingen. */

const S = {
  data: null,            // inhoud van log.json
  map: null,             // FileSystemDirectoryHandle
  scherm: 'tijdlijn',
  ed: null,              // { rec, origId, stap } – werkkopie in de invoer
  filters: { groep: '', constraint: '', view: '', modus: '' },
  open: new Set(),       // opengeklapte records in de tijdlijn
  alleenLezen: false
};
let edItems = {};        // meldingen per constraint zoals getoond in stap 2
const liveCache = { pre: { t: null, p: null }, aft: { t: null, p: null } };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/* ================= gegevens ================= */

// Views zijn eigen aan elk model: voeg ze toe via Instellingen.
const STANDAARD_VIEWS = [];
function standaardInstellingen() {
  return {
    views: [...STANDAARD_VIEWS],
    constraints: [...Array.from({ length: 13 }, (_, i) => `C${p2(i + 1)}`), 'M01', 'V01', 'V02'],
    requirements: Array.from({ length: 8 }, (_, i) => `R${i + 1}`)
  };
}
function nieuweData() {
  return { schemaVersion: 1, settings: standaardInstellingen(), records: [], werkversie: null };
}
function nieuwRecord() {
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
    gevolg: null, waarschuwingen: [], parseHistoriek: []
  };
}
function vulRecordAan(r) {
  if (!Array.isArray(r.views)) r.views = r.view ? [r.view] : []; // oud formaat: één view
  delete r.view;
  for (const side of ['pre', 'aft']) { // oud formaat: één screenshot per moment
    const x = r[side];
    if (!x || Array.isArray(x.screenshots)) continue;
    x.screenshots = x.screenshot ? [{ naam: x.screenshot, eigen: !!x.screenshotEigen }] : [];
    delete x.screenshot; delete x.screenshotEigen;
  }
  const n = nieuwRecord();
  for (const k of Object.keys(n)) {
    if (r[k] === undefined) r[k] = n[k];
    else if (n[k] && typeof n[k] === 'object' && !Array.isArray(n[k])) r[k] = Object.assign({}, n[k], r[k]);
  }
  return r;
}
function migreer(d) {
  d.schemaVersion = d.schemaVersion || 1;
  d.settings = Object.assign(standaardInstellingen(), d.settings || {});
  d.records = (d.records || []).map(vulRecordAan);
  d.werkversie = d.werkversie || null;
  if (d.werkversie) vulRecordAan(d.werkversie.rec);
  return d;
}
const zoek = id => S.data.records.find(r => r.id === id);
function vorigVan(origId) {
  const lijst = chrono(S.data.records);
  if (!origId) return lijst[lijst.length - 1] || null;
  const i = lijst.findIndex(r => r.id === origId);
  return i > 0 ? lijst[i - 1] : null;
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
  if (soort !== 'fout') meldingTimer = setTimeout(() => { el.hidden = true; }, 6000);
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
    render();
  });
  $('#btn-csv').addEventListener('click', () => S.data && exporteerCsv(S.data));
  $('#btn-json').addEventListener('click', () => S.data && exporteerJson(S.data));
  bindLightbox();

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
async function openMap(h) {
  S.map = h; S.ed = null; S.open.clear(); S.alleenLezen = false;
  try { await Opslag.onthoudMap(h); } catch (e) { /* niet fataal */ }
  $('#mapnaam').textContent = '📁 ' + h.name;
  let t;
  try { t = await Opslag.leesTekst(h, 'log.json'); }
  catch (e) { toonMelding('log.json kan niet gelezen worden: ' + e.message, 'fout'); return; }
  if (t === null) {
    S.data = nieuweData();
    bewaarLog(true);
  } else {
    try { S.data = migreer(JSON.parse(t)); }
    catch (e) {
      S.alleenLezen = true;
      $('#main').innerHTML = `<section class="kaart start"><h2>log.json is beschadigd</h2>
        <p>${esc(e.message)}</p><p>De tool schrijft niets weg zolang dit niet opgelost is. Herstel eventueel een <code>log.backup-…json</code> door het te hernoemen naar <code>log.json</code>.</p></section>`;
      return;
    }
  }
  document.body.classList.add('geladen');
  S.scherm = 'tijdlijn';
  if (S.data.werkversie) {
    S.ed = S.data.werkversie;
    S.scherm = 'invoer';
    toonMelding('Niet-bewaarde invoer van de vorige keer is hersteld.');
  }
  render();
}

/* ================= render ================= */

function render() {
  $$('#nav [data-scherm]').forEach(b => b.classList.toggle('actief', b.dataset.scherm === S.scherm));
  $('#nav-invoer').textContent = S.ed ? '✎ Invoer (bezig)' : '+ Nieuw record';
  const m = $('#main');
  if (S.scherm === 'invoer' && S.ed) renderEditor(m);
  else if (S.scherm === 'overzicht') renderOverzicht(m);
  else if (S.scherm === 'instellingen') renderInstellingen(m);
  else { S.scherm = 'tijdlijn'; renderTijdlijn(m); }
}

/* ================= invoer ================= */

function startNieuw() {
  const vorig = vorigVan(null);
  const r = nieuwRecord();
  r.run = vorig ? (volgendeRun(vorig.run) || '') : 'R1.01';
  if (vorig) {
    r.pre.output = vorig.aft.output || '';
    r.build = vorig.build || '';
    r.pre.screenshots = vorig.aft.screenshots.map(s => ({ naam: s.naam, eigen: false }));
  }
  r.modus = parseValidatorOutput(r.pre.output).modus;
  S.ed = { rec: r, origId: null, stap: 1 };
  S.scherm = 'invoer';
  bewaarWerkversie();
  render();
}
async function startBewerken(id) {
  if (S.ed && !(await bevestig('<p>Er is al een invoer bezig. Die werkkopie gaat verloren. Doorgaan?</p>', 'Doorgaan', true))) return;
  const o = zoek(id);
  S.ed = { rec: structuredClone(o), origId: id, stap: o.status === 'concept' ? (o.aft.output ? 3 : 2) : 1 };
  S.scherm = 'invoer';
  bewaarWerkversie();
  render();
}
const origRec = () => (S.ed && S.ed.origId ? zoek(S.ed.origId) : null);

/* Geparste gegevens om te tonen: vastgelegd (indien tekst ongewijzigd) of live. */
function parsedVoor(side) {
  const r = S.ed.rec, o = origRec();
  if (o && o[side].parsed && o[side].output === r[side].output) return { p: o[side].parsed, vast: true };
  const c = liveCache[side];
  if (c.t !== r[side].output) { c.t = r[side].output; c.p = parseValidatorOutput(c.t); }
  return { p: c.p, vast: false };
}

const veld = (label, inhoud, extra = '') => `<label class="veld ${extra}"><span class="label">${label}</span>${inhoud}</label>`;
const radio = (bind, waarde, label, huidig, naam) =>
  `<label class="keuze"><input type="radio" name="${naam || bind}" data-bind="${bind}" value="${waarde}" ${huidig === waarde ? 'checked' : ''}> ${label}</label>`;

function outputBlok(side, label) {
  const t = S.ed.rec[side].output;
  return `<details class="output" id="${side}-details" ${t ? '' : 'open'}>
    <summary><b>${label}</b> <span class="samenv" id="${side}-samenv"></span></summary>
    <div class="output-grid">
      <textarea data-bind="${side}.output" spellcheck="false" rows="20" placeholder="Plak hier de volledige validatoroutput (Ctrl+V)">${esc(t)}</textarea>
      <div class="parsed" id="${side}-parsed"></div>
    </div>
  </details>`;
}
const shotBlok = (side, label) =>
  `<div class="veld"><span class="label">${label} <small class="hint">screenshot n vóór hoort bij screenshot n na</small></span><div class="shots-lijst" id="${side}-shots"></div></div>`;

function renderEditor(m) {
  const e = S.ed, r = e.rec, inst = S.data.settings;
  const views = [...inst.views, ...r.views.filter(v => !inst.views.includes(v))];
  m.innerHTML = `
  <section class="editor kaart">
    <div class="ed-kop">
      <h2>${e.origId ? `Record ${esc(zoek(e.origId).run)} bewerken` : 'Nieuw record'}</h2>
      <span class="badge ${r.status}">${r.status}</span>
    </div>
    <div id="ed-info"></div>
    <div id="ed-warn"></div>
    <div class="tabs" role="tablist">
      <button type="button" data-stap="1">1 · Opstart <small>run vóór</small></button>
      <button type="button" data-stap="2">2 · Wijziging</button>
      <button type="button" data-stap="3">3 · Afsluiting <small>run na</small></button>
    </div>

    <div class="paneel" data-paneel="1">
      <div class="rij">
        ${veld('Pre_Datum', `<input type="date" data-bind="pre.datum" value="${esc(r.pre.datum)}">`)}
        ${veld('Pre_Tijdstip', `<input type="time" step="1" data-bind="pre.tijd" value="${esc(r.pre.tijd)}">`)}
        ${veld('Run', `<input type="text" data-bind="run" value="${esc(r.run)}" placeholder="R1.01" class="kort">`)}
        ${veld('Validator build', `<input type="text" data-bind="build" value="${esc(r.build)}">`, 'breed')}
      </div>
      <div class="veld"><span class="label">Modus</span><div class="keuzes" id="ed-modus">
        ${radio('modus', 'construction', 'Construction', r.modus)}${radio('modus', 'audit', 'Audit', r.modus)}
        <small class="hint">automatisch uit de output, aanpasbaar</small></div></div>
      ${outputBlok('pre', 'Pre_Validatoroutput')}
      ${shotBlok('pre', 'Pre_Screenshot')}
    </div>

    <div class="paneel" data-paneel="2">
      <div class="veld"><span class="label">Constraint(s)</span>
        <div id="ed-constraints"></div>
        <div class="inline"><input type="text" id="ed-vrijc" placeholder="Andere constraint, bv. C14" class="kort">
          <button type="button" data-action="c-add">Toevoegen</button></div>
      </div>
      <div class="veld"><span class="label">Melding(en) en intuïtief — per aangevinkte constraint</span><div id="ed-meldingen"></div></div>
      ${veld('Opmerking bij intuïtief (optioneel)', `<input type="text" data-bind="intuitief.opmerking" value="${esc(r.intuitief.opmerking)}" placeholder="bv. tekst van de melding onduidelijk of fout geformuleerd">`)}
      <div class="veld"><span class="label">View(s) <small class="hint">meerdere mogelijk</small></span>
        ${views.length
          ? `<div class="viewlijst">${views.map(v => `<label class="item"><input type="checkbox" data-view="${esc(v)}" ${r.views.includes(v) ? 'checked' : ''}> <span>${esc(v)}</span></label>`).join('')}</div>`
          : '<p class="leeg">Nog geen views. Voeg de views van je model toe via Instellingen.</p>'}</div>
      <div class="veld"><span class="label">Uitgevoerde actie</span><div id="ed-acties"></div></div>
      <label class="veld"><span class="label" id="lbl-beschr">Beschrijving actie</span><textarea data-bind="beschrijving" rows="3">${esc(r.beschrijving)}</textarea></label>
      <div class="veld"><span class="label">Behulpzaam</span><div id="ed-behulpzaam"></div></div>
      <div class="veld"><span class="label">Requirements</span><div id="ed-req"></div></div>
    </div>

    <div class="paneel" data-paneel="3">
      <div class="rij">
        ${veld('Aft_Datum', `<input type="date" data-bind="aft.datum" value="${esc(r.aft.datum)}">`)}
        ${veld('Aft_Tijdstip', `<input type="time" step="1" data-bind="aft.tijd" value="${esc(r.aft.tijd)}">`)}
        <div class="veld"><span class="label">&nbsp;</span><button type="button" data-action="aft-nu">Nu</button></div>
      </div>
      ${outputBlok('aft', 'Aft_Validatoroutput')}
      ${shotBlok('aft', 'Aft_Screenshot')}
      <div class="veld"><span class="label">Gevolg <small class="hint">automatisch berekend</small></span><div id="ed-gevolg"></div></div>
    </div>

    <div class="ed-voet">
      <button type="button" data-action="annuleer">Annuleren</button>
      <span class="flex"></span>
      <button type="button" data-action="vorige">← Vorige stap</button>
      <button type="button" data-action="volgende" class="volgende">Volgende stap →</button>
      <button type="button" data-action="concept">Bewaar als concept</button>
      <button type="button" data-action="afronden" class="primair">Afronden en bewaren</button>
    </div>
  </section>`;

  const sec = $('.editor', m);
  sec.addEventListener('input', onEdInput);
  sec.addEventListener('change', onEdInput);
  sec.addEventListener('click', onEdClick);
  sec.addEventListener('paste', onEdPaste);
  sec.addEventListener('dragover', ev => { const v = ev.target.closest('.plakvak'); if (v) { ev.preventDefault(); v.classList.add('sleep'); } });
  sec.addEventListener('dragleave', ev => { const v = ev.target.closest('.plakvak'); if (v) v.classList.remove('sleep'); });
  sec.addEventListener('drop', onEdDrop);
  $('#ed-vrijc').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); voegConstraintToe(); } });

  toonStap();
  renderInfo();
  renderParsed('pre'); renderParsed('aft');
  renderConstraints(); renderMeldingen(); renderActies();
  renderBehulpzaam(); renderReq();
  renderShots('pre'); renderShots('aft');
  renderGevolg(); renderWarn();
}

function toonStap() {
  const s = S.ed.stap;
  $$('.editor [data-stap]').forEach(b => b.classList.toggle('actief', +b.dataset.stap === s));
  $$('.editor [data-paneel]').forEach(p => { p.hidden = +p.dataset.paneel !== s; });
  $('.editor [data-action="vorige"]').disabled = s === 1;
  $('.editor [data-action="volgende"]').disabled = s === 3;
}

function renderInfo() {
  const el = $('#ed-info'), r = S.ed.rec;
  if (S.ed.origId) { el.innerHTML = ''; return; }
  const v = vorigVan(null);
  const info = [];
  if (!v) info.push('Eerste record van de log.');
  else {
    info.push(`Vorig record: <b>${esc(v.run)}</b>.`);
    if (!v.aft.output) info.push(`Dat record heeft nog geen Aft_Validatoroutput (concept), dus Pre_Validatoroutput is leeg.`);
    else if (r.pre.output === v.aft.output) info.push('Pre_Validatoroutput en Pre_Screenshot zijn overgenomen van de afsluiting van dat record.');
  }
  el.innerHTML = `<p class="info">${info.join(' ')}</p>`;
}

function onEdInput(ev) {
  const t = ev.target, r = S.ed.rec, d = t.dataset;
  if (d.bind) {
    if (t.type === 'radio' && !t.checked) return;
    zetPad(r, d.bind, t.value);
    naBinding(d.bind, t);
  } else if (d.c !== undefined) {
    if (t.checked) { if (!r.constraints.includes(d.c)) r.constraints.push(d.c); }
    else r.constraints = r.constraints.filter(c => c !== d.c);
    renderMeldingen();
  } else if (d.m !== undefined) {
    const tekst = edItems[d.m][+d.i];
    r.meldingen = r.meldingen.filter(x => !(x.constraint === d.m && x.bron === 'output' && x.tekst === tekst));
    if (t.checked) r.meldingen.push({ constraint: d.m, tekst, bron: 'output' });
  } else if (d.vrij !== undefined) {
    r.meldingen = r.meldingen.filter(x => !(x.constraint === d.vrij && x.bron === 'vrij'));
    if (t.value.trim()) r.meldingen.push({ constraint: d.vrij, tekst: t.value, bron: 'vrij' });
  } else if (d.int !== undefined) {
    if (t.checked) r.intuitief.perConstraint[d.int] = t.value;
  } else if (d.actie !== undefined) {
    const [object, soort] = d.actie.split('|');
    r.acties = r.acties.filter(a => !(a.object === object && (a.soort || null) === (soort || null)));
    if (t.checked) r.acties.push(soort ? { object, soort } : { object });
    zetBeschrijvingLabel();
  } else if (d.view !== undefined) {
    r.views = r.views.filter(v => v !== d.view);
    if (t.checked) r.views.push(d.view);
    const volgorde = S.data.settings.views;
    r.views.sort((a, b) => (volgorde.indexOf(a) + 1 || 1e9) - (volgorde.indexOf(b) + 1 || 1e9));
  } else if (d.req !== undefined) {
    r.requirements.ids = r.requirements.ids.filter(x => x !== d.req);
    if (t.checked) r.requirements.ids.push(d.req);
    r.requirements.ids.sort((a, b) => S.data.settings.requirements.indexOf(a) - S.data.settings.requirements.indexOf(b));
  } else return;
  bewaarWerkversie();
}

function zetPad(obj, pad, v) {
  const delen = pad.split('.');
  let o = obj;
  for (let i = 0; i < delen.length - 1; i++) o = o[delen[i]];
  o[delen[delen.length - 1]] = v;
}

function naBinding(pad, el) {
  const r = S.ed.rec;
  if (pad === 'pre.output') {
    const p = parsedVoor('pre').p;
    if (p.modus && p.modus !== r.modus) {
      r.modus = p.modus;
      $$('#ed-modus input').forEach(i => { i.checked = i.value === r.modus; });
    }
    renderParsed('pre'); renderConstraints(); renderMeldingen(); renderGevolg(); renderWarn();
  } else if (pad === 'aft.output') {
    if (r.aft.output.trim() && !r.aft.datum) {
      r.aft.datum = vandaag(); r.aft.tijd = nuTijd();
      $('[data-bind="aft.datum"]').value = r.aft.datum;
      $('[data-bind="aft.tijd"]').value = r.aft.tijd;
    }
    renderParsed('aft'); renderGevolg(); renderWarn();
  } else if (pad === 'modus' || pad === 'run') {
    renderWarn();
  } else if (pad === 'requirements.status') {
    renderReq();
  }
}

async function onEdClick(ev) {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.stap) { S.ed.stap = +b.dataset.stap; toonStap(); bewaarWerkversie(); return; }
  const a = b.dataset.action, r = S.ed.rec;
  if (a === 'vorige' || a === 'volgende') {
    S.ed.stap = Math.min(3, Math.max(1, S.ed.stap + (a === 'vorige' ? -1 : 1)));
    toonStap(); bewaarWerkversie(); window.scrollTo(0, 0);
  } else if (a === 'annuleer') {
    if (!(await bevestig('<p>Invoer annuleren? Niet-bewaarde wijzigingen gaan verloren.</p><p class="hint">Al geplakte screenshots blijven in de map screenshots/ staan.</p>', 'Annuleren', true))) return;
    S.ed = null; S.data.werkversie = null; S.scherm = 'tijdlijn'; bewaarLog(true); render();
  } else if (a === 'concept') bewaar(false);
  else if (a === 'afronden') bewaar(true);
  else if (a === 'aft-nu') {
    r.aft.datum = vandaag(); r.aft.tijd = nuTijd();
    $('[data-bind="aft.datum"]').value = r.aft.datum;
    $('[data-bind="aft.tijd"]').value = r.aft.tijd;
    bewaarWerkversie();
  } else if (a === 'c-add') voegConstraintToe();
  else if (a === 'shot-weg' || a === 'shot-op' || a === 'shot-neer') {
    const side = b.dataset.side, i = +b.dataset.i, lijst = r[side].screenshots;
    if (a === 'shot-weg') lijst.splice(i, 1);
    else {
      const j = a === 'shot-op' ? i - 1 : i + 1;
      if (j < 0 || j >= lijst.length) return;
      [lijst[i], lijst[j]] = [lijst[j], lijst[i]];
    }
    renderShots('pre'); renderShots('aft'); bewaarWerkversie();
  } else if (a === 'herz-add') {
    const k = $('input[name="herz"]:checked');
    if (!k) { toonMelding('Kies eerst een waarde voor de herziening.', 'waarsch'); return; }
    r.behulpzaam.herzieningen.push({ waarde: k.value, datum: vandaag(), tijd: nuTijd(), opmerking: $('#herz-opm').value.trim() });
    renderBehulpzaam(); bewaarWerkversie();
  } else if (a === 'herz-del') {
    if (!(await bevestig('<p>Deze herziening verwijderen?</p>', 'Verwijderen', true))) return;
    r.behulpzaam.herzieningen.splice(+b.dataset.i, 1);
    renderBehulpzaam(); bewaarWerkversie();
  }
}

function voegConstraintToe() {
  const inp = $('#ed-vrijc'), c = inp.value.trim().toUpperCase();
  if (!c) return;
  const r = S.ed.rec;
  if (!r.constraints.includes(c)) r.constraints.push(c);
  inp.value = '';
  renderConstraints(); renderMeldingen(); bewaarWerkversie();
}

/* ---------- deelweergaven van de invoer ---------- */

function parsedHtml(p, vast) {
  const sel = p.selectie;
  const codes = Object.keys(p.samenvatting);
  const statusKlas = p.status === 'PASSED' ? 'ok' : p.status === 'FAILED' ? 'nok' : '';
  return `
    <div class="parsed-kop"><span class="badge ${vast ? 'vast' : 'live'}">${vast ? `vastgelegd · parser v${p.parserVersie}` : 'nog niet vastgelegd'}</span></div>
    <table class="mini">
      <tr><th>Status</th><td><span class="status ${statusKlas}">${esc(p.status || '?')}</span></td></tr>
      <tr><th>Modus</th><td>${p.modus ? LABELS.modus[p.modus] : '?'}</td></tr>
      <tr><th>Selectie</th><td>${sel.views ?? '?'} views · ${sel.elements ?? '?'} elements<br>${sel.horizontal ?? '?'} horizontal · ${sel.vertical ?? '?'} vertical rel.</td></tr>
      <tr><th>Duur</th><td>${p.duurMs != null ? p.duurMs + ' ms' : '–'}</td></tr>
    </table>
    <h4>Meldingen per constraint${p.samenvattingAfgeleid ? ' <small>(afgeleid)</small>' : ''}</h4>
    ${codes.length ? `<table class="mini">${codes.map(c => `<tr><th>${esc(c)}</th><td class="getal">${p.samenvatting[c]}</td><td>${esc(meldingenVoor(p, c).titel || '')}</td></tr>`).join('')}</table>` : '<p class="leeg">geen</p>'}
    ${p.secties.length ? `<h4>Secties</h4><ul class="secties">${p.secties.map(s => `<li>${s.soort === 'view' ? `View: ${esc(s.view)}${s.aantal != null ? ` (${s.aantal})` : ''}` : esc(s.titel || s.soort)} — ${s.blokken.map(b => esc(b.code)).join(', ') || 'geen blokken'}</li>`).join('')}</ul>` : ''}
    ${p.waarschuwingen.length ? `<div class="waarsch klein"><ul>${p.waarschuwingen.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}`;
}
function korteSamenvatting(p) {
  if (!p.herkend) return '<span class="nok">niet herkend</span>';
  const codes = Object.entries(p.samenvatting).map(([c, n]) => `${c} ${n}`).join(' · ');
  return `${esc(p.status || '?')} · ${p.modus ? LABELS.modus[p.modus] : '?'}${codes ? ' · ' + esc(codes) : ''}`;
}
function renderParsed(side) {
  const r = S.ed.rec, el = $(`#${side}-parsed`), sv = $(`#${side}-samenv`);
  if (!r[side].output.trim()) { el.innerHTML = '<p class="leeg">Nog geen output geplakt.</p>'; sv.innerHTML = ''; return; }
  const { p, vast } = parsedVoor(side);
  el.innerHTML = parsedHtml(p, vast);
  sv.innerHTML = '— ' + korteSamenvatting(p);
}

function renderConstraints() {
  const r = S.ed.rec, p = parsedVoor('pre').p;
  const inOutput = Object.keys(p.samenvatting);
  const vast = S.data.settings.constraints.filter(c => !inOutput.includes(c));
  const eigen = r.constraints.filter(c => !inOutput.includes(c) && !vast.includes(c));
  const chip = (c, n) => {
    const titel = n != null ? meldingenVoor(p, c).titel : '';
    return `<label class="chip ${n != null ? 'in-output' : ''}" title="${esc(titel || '')}"><input type="checkbox" data-c="${esc(c)}" ${r.constraints.includes(c) ? 'checked' : ''}> ${esc(c)}${n != null ? ` <span class="tel">${n}</span>` : ''}</label>`;
  };
  $('#ed-constraints').innerHTML = `
    <div class="chips"><span class="chips-label">In output vóór:</span>${inOutput.length ? inOutput.map(c => chip(c, p.samenvatting[c])).join('') : '<span class="leeg">geen</span>'}</div>
    <div class="chips"><span class="chips-label">Overige:</span>${vast.map(c => chip(c, null)).join('')}${eigen.map(c => chip(c, null)).join('')}</div>`;
}

function renderMeldingen() {
  const r = S.ed.rec, p = parsedVoor('pre').p, el = $('#ed-meldingen');
  edItems = {};
  if (!r.constraints.length) { el.innerHTML = '<p class="leeg">Vink eerst een of meer constraints aan.</p>'; return; }
  el.innerHTML = r.constraints.map(c => {
    const info = meldingenVoor(p, c);
    edItems[c] = info.items;
    const vrij = r.meldingen.find(x => x.constraint === c && x.bron === 'vrij');
    const int = r.intuitief.perConstraint[c];
    const nota = info.totaal != null && info.items.length < info.totaal
      ? `<p class="hint">De output toont ${info.items.length} unieke melding(en); de samenvatting telt ${info.totaal}. De rest is afgekapt (“… and N more”).</p>` : '';
    return `<div class="melding-blok">
      <div class="melding-kop"><b>${esc(c)}</b> ${info.titel ? '— ' + esc(info.titel) : ''} ${info.totaal != null ? `<span class="tel">${info.totaal}</span>` : ''}
        <span class="flex"></span>
        <span class="keuzes">Intuïtief:
          <label class="keuze"><input type="radio" name="int-${esc(c)}" data-int="${esc(c)}" value="ja" ${int === 'ja' ? 'checked' : ''}> Ja</label>
          <label class="keuze"><input type="radio" name="int-${esc(c)}" data-int="${esc(c)}" value="nee" ${int === 'nee' ? 'checked' : ''}> Nee</label>
        </span></div>
      ${info.items.length ? `<div class="items">${info.items.map((it, i) => `<label class="item"><input type="checkbox" data-m="${esc(c)}" data-i="${i}" ${r.meldingen.some(x => x.constraint === c && x.bron === 'output' && x.tekst === it) ? 'checked' : ''}> <span>${esc(it)}</span></label>`).join('')}</div>` : '<p class="leeg">Geen meldingen voor deze constraint in de output vóór.</p>'}
      ${nota}
      <textarea data-vrij="${esc(c)}" rows="1" placeholder="Vrije tekst (optioneel)">${esc(vrij ? vrij.tekst : '')}</textarea>
    </div>`;
  }).join('');
}

function renderActies() {
  const r = S.ed.rec;
  const heeft = (o, s) => r.acties.some(a => a.object === o && (a.soort || null) === (s || null));
  $('#ed-acties').innerHTML = `
    <table class="acties">
      <tr><th></th>${SOORTEN.map(s => `<th>${LABELS.soort[s]}</th>`).join('')}</tr>
      ${['relatie', 'element'].map(o => `<tr><th>${LABELS.object[o]}</th>${SOORTEN.map(s => `<td><input type="checkbox" data-actie="${o}|${s}" ${heeft(o, s) ? 'checked' : ''} aria-label="${LABELS.object[o]} ${LABELS.soort[s]}"></td>`).join('')}</tr>`).join('')}
    </table>
    <label class="keuze"><input type="checkbox" data-actie="niet_opgelost" ${heeft('niet_opgelost') ? 'checked' : ''}> Bewust niet opgelost</label>`;
  zetBeschrijvingLabel();
}
function zetBeschrijvingLabel() {
  const niet = S.ed.rec.acties.some(a => a.object === 'niet_opgelost');
  $('#lbl-beschr').textContent = niet ? 'Beschrijving actie — motivering waarom bewust niet opgelost' : 'Beschrijving actie';
}

function renderBehulpzaam() {
  const r = S.ed.rec, o = origRec(), b = r.behulpzaam;
  const vergrendeld = o && o.status === 'afgerond' && o.behulpzaam.moment;
  const opties = Object.entries(LABELS.behulpzaam);
  let html = vergrendeld
    ? `<p>Oordeel op het moment zelf: <b>${LABELS.behulpzaam[b.moment]}</b> <small class="hint">(vastgelegd bij afronden)</small></p>`
    : `<div class="keuzes">${opties.map(([k, l]) => radio('behulpzaam.moment', k, l, b.moment, 'beh-moment')).join('')}</div>`;
  if (b.herzieningen.length) {
    html += `<table class="mini herz"><tr><th>Herzien op</th><th>Oordeel</th><th>Opmerking</th><th></th></tr>${b.herzieningen.map((h, i) =>
      `<tr><td>${toonDatum(h.datum)}</td><td>${LABELS.behulpzaam[h.waarde]}</td><td>${esc(h.opmerking)}</td><td><button type="button" class="klein" data-action="herz-del" data-i="${i}">×</button></td></tr>`).join('')}</table>`;
  }
  if (vergrendeld) {
    html += `<div class="herz-nieuw"><span>Herziening toevoegen:</span>
      ${opties.map(([k, l]) => `<label class="keuze"><input type="radio" name="herz" value="${k}"> ${l}</label>`).join('')}
      <input type="text" id="herz-opm" placeholder="Opmerking (optioneel)">
      <button type="button" data-action="herz-add">Toevoegen</button></div>`;
  }
  $('#ed-behulpzaam').innerHTML = html;
}

function renderReq() {
  const q = S.ed.rec.requirements;
  let html = `<div class="keuzes">${Object.entries(LABELS.req).map(([k, l]) => radio('requirements.status', k, l, q.status, 'req-status')).join('')}</div>`;
  if (q.status === 'geraakt' || q.status === 'verfijnd') {
    html += `<div class="chips"><span class="chips-label">Welke:</span>${S.data.settings.requirements.map(id =>
      `<label class="chip"><input type="checkbox" data-req="${esc(id)}" ${q.ids.includes(id) ? 'checked' : ''}> ${esc(id)}</label>`).join('')}</div>`;
  }
  if (q.status === 'verfijnd') {
    html += `<label class="veld"><span class="label">Hoe werd het requirement verfijnd? <b class="verplicht">verplicht</b></span>
      <textarea data-bind="requirements.verfijning" rows="3">${esc(q.verfijning)}</textarea></label>`;
  }
  $('#ed-req').innerHTML = html;
}

/* Bestandsnaam per positie: R1.01_pre.png, R1.01_pre-2.png, R1.01_pre-3.png … */
const shotBasis = (run, side, i) => `${RUN_RE.test(run.trim()) ? run.trim() : 'zonder-run'}_${side}${i ? '-' + (i + 1) : ''}`;
const naamPastBijBasis = (naam, basis) => new RegExp(`^${basis.replace(/[.]/g, '\\.')}(_\\d+)?\\.png$`).test(naam);

async function renderShots(side) {
  const r = S.ed.rec, el = $(`#${side}-shots`), lijst = r[side].screenshots;
  const ander = r[side === 'pre' ? 'aft' : 'pre'].screenshots.length;
  const verschil = lijst.length && ander && lijst.length !== ander
    ? `<p class="hint nok">Vóór: ${r.pre.screenshots.length} screenshot(s), na: ${r.aft.screenshots.length}. De paren lopen niet gelijk.</p>` : '';
  el.innerHTML = lijst.map((s, i) => `
    <div class="plakvak gevuld" tabindex="0" data-shot="${side}" data-pos="${i}">
      <div class="shot-kop"><span class="nr">${i + 1}</span> <code>${esc(s.naam)}</code>
        ${s.eigen ? '' : '<small class="hint">overgenomen van het vorige record</small>'}<span class="flex"></span>
        <button type="button" class="klein" data-action="shot-op" data-side="${side}" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Naar voor">↑</button>
        <button type="button" class="klein" data-action="shot-neer" data-side="${side}" data-i="${i}" ${i === lijst.length - 1 ? 'disabled' : ''} title="Naar achter">↓</button>
        <button type="button" class="klein" data-action="shot-weg" data-side="${side}" data-i="${i}">Verwijderen</button></div>
      <img data-naam="${esc(s.naam)}" alt="${esc(s.naam)}">
      <p class="hint">Plak (<kbd>Ctrl</kbd>+<kbd>V</kbd>) of sleep in dit vak om deze screenshot te vervangen.</p>
    </div>`).join('') + `
    <div class="plakvak nieuw" tabindex="0" data-shot="${side}" data-pos="nieuw">
      <span class="nr">${lijst.length + 1}</span> ${lijst.length ? 'Extra screenshot' : 'Screenshot'}: klik hier en druk <kbd>Ctrl</kbd>+<kbd>V</kbd>, of sleep een of meer afbeeldingen hierheen.
    </div>${verschil}`;
  for (const img of $$('img[data-naam]', el)) {
    const url = await Opslag.screenshotUrl(S.map, img.dataset.naam);
    if (!img.isConnected) return;
    if (url) {
      img.src = url;
      // lightbox over de screenshots van dit record
      const i = +img.closest('.plakvak').dataset.pos;
      img.onclick = () => {
        const items = lbItems([S.ed.rec]);
        openLightbox(items, items.findIndex(x => x.side === side && x.nr === i + 1));
      };
    }
    else img.replaceWith(Object.assign(document.createElement('p'), { className: 'nok', textContent: 'Bestand niet gevonden in screenshots/.' }));
  }
}

function onEdPaste(ev) {
  const vak = ev.target.closest('.plakvak');
  if (!vak) return;
  const items = [...(ev.clipboardData ? ev.clipboardData.items : [])];
  const it = items.find(i => i.kind === 'file' && i.type.startsWith('image/'));
  ev.preventDefault();
  if (!it) { toonMelding('Geen afbeelding op het klembord.', 'waarsch'); return; }
  plakAfbeeldingen(vak.dataset.shot, vak.dataset.pos, [it.getAsFile()]);
}
function onEdDrop(ev) {
  const vak = ev.target.closest('.plakvak');
  if (!vak) return;
  ev.preventDefault();
  vak.classList.remove('sleep');
  const fs = [...ev.dataTransfer.files].filter(x => x.type.startsWith('image/'));
  if (!fs.length) { toonMelding('Dat is geen afbeelding.', 'waarsch'); return; }
  // op een bestaand vak: alleen de eerste vervangt; op het nieuwe vak: allemaal toevoegen
  plakAfbeeldingen(vak.dataset.shot, vak.dataset.pos, vak.dataset.pos === 'nieuw' ? fs : fs.slice(0, 1));
}
async function plakAfbeeldingen(side, pos, blobs) {
  const r = S.ed.rec, lijst = r[side].screenshots;
  const namen = [];
  try {
    for (const blob of blobs) {
      const i = pos === 'nieuw' ? lijst.length : +pos;
      const naam = await Opslag.bewaarScreenshot(S.map, blob, shotBasis(r.run, side, i));
      if (pos === 'nieuw') lijst.push({ naam, eigen: true }); else lijst[i] = { naam, eigen: true };
      namen.push(naam);
    }
  } catch (e) { toonMelding('Screenshot opslaan mislukt: ' + e.message, 'fout'); }
  renderShots('pre'); renderShots('aft'); bewaarWerkversie();
  if (namen.length) toonMelding(`Opgeslagen in screenshots/: ${namen.join(', ')}.`);
}

function renderGevolg() {
  const el = $('#ed-gevolg'), r = S.ed.rec;
  if (!r.aft.output.trim() || !r.pre.output.trim()) {
    el.innerHTML = '<p class="leeg">Wordt berekend zodra zowel de Pre- als de Aft_Validatoroutput ingevuld zijn.</p>';
    return;
  }
  el.innerHTML = gevolgHtml(berekenGevolg(parsedVoor('pre').p, parsedVoor('aft').p));
}
function gevolgHtml(g) {
  if (!g) return '<span class="leeg">–</span>';
  const rij = x => {
    const kl = x.na > x.voor ? 'nok' : x.na < x.voor ? 'ok' : '';
    return `<tr class="${kl}"><th>${esc(x.code)}</th><td class="getal">${x.voor}</td><td>→</td><td class="getal">${x.na}</td><td>${g.nieuw.includes(x.code) ? 'nieuw' : g.verdwenen.includes(x.code) ? 'verdwenen' : ''}</td></tr>`;
  };
  return `<p class="gevolg-tekst">${esc(g.tekst)}</p>
    <table class="mini">${g.perConstraint.map(rij).join('')}
    <tr class="totaal"><th>Totaal</th><td class="getal">${g.totaalVoor}</td><td>→</td><td class="getal">${g.totaalNa}</td><td>${esc(g.statusVoor || '?')} → ${esc(g.statusNa || '?')}</td></tr></table>
    ${g.nieuw.length ? `<p class="nok">Nieuw verschenen: ${g.nieuw.map(esc).join(', ')}</p>` : ''}
    ${g.verdwenen.length ? `<p class="ok">Verdwenen: ${g.verdwenen.map(esc).join(', ')}</p>` : ''}`;
}

function renderWarn() {
  const r = S.ed.rec;
  const pre = r.pre.output.trim() ? parsedVoor('pre').p : null;
  const aft = r.aft.output.trim() ? parsedVoor('aft').p : null;
  const w = berekenWaarschuwingen(r, vorigVan(S.ed.origId), pre, aft);
  if (r.run && !RUN_RE.test(r.run.trim())) w.unshift('Run moet de vorm R<groep>.<volgnummer> hebben, bv. R1.01.');
  $('#ed-warn').innerHTML = w.length ? `<div class="waarsch"><b>Controleer:</b><ul>${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
}

/* ---------- bewaren ---------- */


async function bewaar(afronden) {
  const e = S.ed, r = e.rec, o = origRec();
  r.run = r.run.trim();
  const fouten = [];
  if (!RUN_RE.test(r.run)) fouten.push('Run moet de vorm R<groep>.<volgnummer> hebben, bv. R1.01.');
  else if (S.data.records.some(x => x.id !== e.origId && x.run === r.run)) fouten.push(`Run ${r.run} bestaat al.`);
  const q = r.requirements;
  if ((q.status === 'geraakt' || q.status === 'verfijnd') && !q.ids.length) fouten.push('Kies bij Requirements welke requirement(s) geraakt of verfijnd zijn.');
  if (q.status === 'verfijnd' && !q.verfijning.trim()) fouten.push('Bij “Verfijnd” is “hoe werd het requirement verfijnd?” verplicht.');
  if (afronden && !r.pre.output.trim()) fouten.push('Vul de Pre_Validatoroutput in om af te ronden.');
  if (afronden && !r.aft.output.trim()) fouten.push('Vul de Aft_Validatoroutput in om af te ronden (of bewaar als concept).');
  if (fouten.length) {
    await bevestig(`<h3>Nog niet bewaard</h3><ul>${fouten.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`, 'OK');
    return;
  }

  // opschonen
  r.meldingen = r.meldingen.filter(m => r.constraints.includes(m.constraint) && m.tekst.trim());
  const pc = {};
  for (const c of r.constraints) if (r.intuitief.perConstraint[c]) pc[c] = r.intuitief.perConstraint[c];
  r.intuitief.perConstraint = pc;
  if (q.status !== 'geraakt' && q.status !== 'verfijnd') q.ids = [];
  if (q.status !== 'verfijnd') q.verfijning = '';

  // parsing vastleggen: alleen opnieuw parsen als de tekst gewijzigd is
  for (const side of ['pre', 'aft']) {
    if (!r[side].output.trim()) r[side].parsed = null;
    else if (o && o[side].parsed && o[side].output === r[side].output) r[side].parsed = o[side].parsed;
    else r[side].parsed = parseValidatorOutput(r[side].output);
  }
  const ongewijzigd = o && o.gevolg && o.pre.output === r.pre.output && o.aft.output === r.aft.output;
  r.gevolg = r.pre.parsed && r.aft.parsed ? (ongewijzigd ? o.gevolg : berekenGevolg(r.pre.parsed, r.aft.parsed)) : null;
  r.waarschuwingen = berekenWaarschuwingen(r, vorigVan(e.origId), r.pre.parsed, r.aft.parsed);

  // eigen screenshots hernoemen naar runnummer + positie (na gewijzigde run of volgorde).
  // Twee fasen (eerst tijdelijke naam), zodat omgewisselde bestanden niet botsen.
  for (const side of ['pre', 'aft']) {
    const lijst = r[side].screenshots;
    const teHernoemen = lijst.filter((s, i) => s.eigen && !naamPastBijBasis(s.naam, shotBasis(r.run, side, i)));
    try {
      for (const s of teHernoemen) s.naam = await Opslag.hernoemScreenshot(S.map, s.naam, `tmp-${uid()}`);
      for (const s of teHernoemen) s.naam = await Opslag.hernoemScreenshot(S.map, s.naam, shotBasis(r.run, side, lijst.indexOf(s)));
    } catch (err) { toonMelding(`Screenshots hernoemen mislukt: ${err.message}`, 'fout'); }
  }

  r.status = afronden ? 'afgerond' : 'concept';
  r.gewijzigd = isoNu();
  if (!r.aangemaakt) r.aangemaakt = r.gewijzigd;
  const i = S.data.records.findIndex(x => x.id === r.id);
  if (i >= 0) S.data.records[i] = r; else S.data.records.push(r);
  S.data.werkversie = null;
  S.ed = null;
  bewaarLog(true);
  S.open.add(r.id);
  S.scherm = 'tijdlijn';
  render();
  toonMelding(`${r.run} bewaard als ${r.status}.`);
  const rij = $(`tr[data-id="${r.id}"]`);
  if (rij) rij.scrollIntoView({ block: 'center' });
}

/* ================= filters ================= */

function filterBalk(alleRecs) {
  const f = S.filters;
  const groepen = [...new Set(alleRecs.map(r => groepVan(r.run)).filter(g => g !== null))].sort((a, b) => a - b);
  const cons = [...new Set(alleRecs.flatMap(r => r.constraints))].sort();
  const views = [...new Set([...S.data.settings.views, ...alleRecs.flatMap(r => r.views)])];
  const sel = (naam, label, opties) => `<label>${label} <select data-filter="${naam}"><option value="">alle</option>${opties.map(([v, l]) => `<option value="${esc(v)}" ${String(f[naam]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  return `<div class="filters">
    ${sel('groep', 'Groep', groepen.map(g => [g, 'Groep ' + g]))}
    ${sel('constraint', 'Constraint', cons.map(c => [c, c]))}
    ${sel('view', 'View', views.map(v => [v, v]))}
    ${sel('modus', 'Modus', Object.entries(LABELS.modus))}
    ${Object.values(f).some(Boolean) ? '<button type="button" class="klein" data-action="wis-filters">Filters wissen</button>' : ''}
  </div>`;
}
function pasFilterToe(recs) {
  const f = S.filters;
  return recs.filter(r =>
    (!f.groep || String(groepVan(r.run)) === String(f.groep)) &&
    (!f.constraint || r.constraints.includes(f.constraint)) &&
    (!f.view || r.views.includes(f.view)) &&
    (!f.modus || r.modus === f.modus));
}
function bindFilters(m) {
  m.addEventListener('change', ev => {
    const s = ev.target.closest('[data-filter]');
    if (s) { S.filters[s.dataset.filter] = s.value; render(); }
  });
  m.addEventListener('click', ev => {
    if (ev.target.closest('[data-action="wis-filters"]')) { for (const k in S.filters) S.filters[k] = ''; render(); }
  });
}

/* ================= tijdlijn ================= */

function renderTijdlijn(m) {
  const alle = chrono(S.data.records), recs = pasFilterToe(alle);
  const nieuwm = r => r.gevolg && (r.gevolg.nieuw.length || r.gevolg.toegenomen.length);
  m.innerHTML = `<section class="kaart">
    <div class="kop-rij"><h2>Tijdlijn</h2><span class="hint">${recs.length} van ${alle.length} records</span></div>
    ${filterBalk(alle)}
    ${recs.length ? `<table class="tijdlijn">
      <thead><tr><th>Run</th><th>Datum</th><th>View</th><th>Modus</th><th>Constraints</th><th>Actie</th><th>Gevolg</th><th></th></tr></thead>
      <tbody>${recs.map(r => `
        <tr class="rec ${S.open.has(r.id) ? 'open' : ''}" data-id="${r.id}">
          <td><b>${esc(r.run)}</b></td>
          <td>${toonDatum(r.pre.datum)} <small>${esc((r.pre.tijd || '').slice(0, 5))}</small></td>
          <td class="view-kol">${r.views.map(esc).join('<br>')}</td>
          <td>${r.modus ? LABELS.modus[r.modus] : ''}</td>
          <td>${esc(r.constraints.join(', '))}</td>
          <td>${esc(r.acties.map(actieTekst).join(', '))}</td>
          <td class="${nieuwm(r) ? 'nok' : ''}">${r.gevolg ? esc(r.gevolg.tekst) : '<span class="leeg">–</span>'}</td>
          <td class="badges">${r.status === 'concept' ? '<span class="badge concept">concept</span>' : ''}${r.waarschuwingen.length ? `<span class="badge waarsch" title="${esc(r.waarschuwingen.join('\n'))}">⚠ ${r.waarschuwingen.length}</span>` : ''}</td>
        </tr>
        ${S.open.has(r.id) ? `<tr class="detail"><td colspan="8">${detailHtml(r)}</td></tr>` : ''}`).join('')}
      </tbody></table>`
      : `<p class="leeg">${alle.length ? 'Geen records voor deze filters.' : 'Nog geen records. Klik op “+ Nieuw record” om te beginnen.'}</p>`}
  </section>`;
  bindFilters(m.firstElementChild);
  m.firstElementChild.addEventListener('click', onTijdlijnClick);
  laadShots(m);
}

function detailHtml(r) {
  const h = behulpzaamHerzien(r);
  const meld = r.constraints.map(c => {
    const ms = r.meldingen.filter(x => x.constraint === c);
    const int = r.intuitief.perConstraint[c];
    return `<li><b>${esc(c)}</b> <small>intuïtief: ${int ? LABELS.behulpzaam[int] : '–'}</small>${ms.length ? `<ul>${ms.map(x => `<li>${esc(x.tekst)}${x.bron === 'vrij' ? ' <small>(vrij)</small>' : ''}</li>`).join('')}</ul>` : ''}</li>`;
  }).join('');
  const q = r.requirements;
  // screenshots per paar: vóór n naast na n
  const shot = (side, label, i) => {
    const s = r[side].screenshots[i];
    return `<figure><figcaption>${label} ${i + 1}${s ? ` — <code>${esc(s.naam)}</code>` : ''}</figcaption>
      ${s ? `<img data-shot-naam="${esc(s.naam)}" data-rec="${r.id}" data-side="${side}" data-i="${i}" alt="${label} ${i + 1}" title="Klik om groot te openen">` : '<div class="leeg-shot">geen screenshot</div>'}</figure>`;
  };
  const paren = Math.max(1, r.pre.screenshots.length, r.aft.screenshots.length);
  const shotsHtml = Array.from({ length: paren }, (_, i) => shot('pre', 'Vóór', i) + shot('aft', 'Na', i)).join('');
  return `<div class="detail-inhoud">
    <div class="detail-knoppen">
      <button type="button" data-action="bewerk" data-id="${r.id}">${r.status === 'concept' ? 'Verder invullen' : 'Bewerken'}</button>
      <button type="button" data-action="herparse" data-id="${r.id}">Opnieuw parsen…</button>
      <button type="button" data-action="verwijder" data-id="${r.id}" class="gevaar">Verwijderen</button>
    </div>
    ${r.waarschuwingen.length ? `<div class="waarsch"><b>Waarschuwingen bij bewaren:</b><ul>${r.waarschuwingen.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
    <div class="detail-grid">
      <dl>
        <dt>Run vóór</dt><dd>${toonDatum(r.pre.datum)} ${esc(r.pre.tijd)} — ${r.pre.parsed ? korteSamenvatting(r.pre.parsed) : '–'}</dd>
        <dt>Run na</dt><dd>${r.aft.datum ? `${toonDatum(r.aft.datum)} ${esc(r.aft.tijd)}` : '–'} — ${r.aft.parsed ? korteSamenvatting(r.aft.parsed) : '–'}</dd>
        <dt>Modus</dt><dd>${r.modus ? LABELS.modus[r.modus] : '–'}</dd>
        <dt>Validator build</dt><dd>${esc(r.build) || '–'}</dd>
        <dt>View(s)</dt><dd>${r.views.map(esc).join('<br>') || '–'}</dd>
        <dt>Constraints &amp; meldingen</dt><dd>${meld ? `<ul class="meld">${meld}</ul>` : '–'}</dd>
        <dt>Opmerking intuïtief</dt><dd>${esc(r.intuitief.opmerking) || '–'}</dd>
        <dt>Uitgevoerde actie</dt><dd>${esc(r.acties.map(actieTekst).join(', ')) || '–'}</dd>
        <dt>Beschrijving</dt><dd class="pre-wrap">${esc(r.beschrijving) || '–'}</dd>
        <dt>Behulpzaam</dt><dd>moment zelf: <b>${r.behulpzaam.moment ? LABELS.behulpzaam[r.behulpzaam.moment] : '–'}</b>${h ? ` · herzien op ${toonDatum(h.datum)}: <b>${LABELS.behulpzaam[h.waarde]}</b>${h.opmerking ? ` (${esc(h.opmerking)})` : ''}` : ''}${r.behulpzaam.herzieningen.length > 1 ? ` <small>(${r.behulpzaam.herzieningen.length} herzieningen)</small>` : ''}</dd>
        <dt>Requirements</dt><dd>${q.status ? LABELS.req[q.status] : '–'}${q.ids.length ? ': ' + esc(q.ids.join(', ')) : ''}${q.verfijning ? `<div class="pre-wrap">${esc(q.verfijning)}</div>` : ''}</dd>
        <dt>Gevolg</dt><dd>${gevolgHtml(r.gevolg)}</dd>
        <dt>Parser</dt><dd>${(r.pre.parsed || r.aft.parsed) ? 'v' + (r.pre.parsed || r.aft.parsed).parserVersie : '–'}${r.parseHistoriek.length ? ` · ${r.parseHistoriek.length}× opnieuw geparst` : ''}</dd>
      </dl>
      <div class="shots">${shotsHtml}</div>
    </div>
    <details><summary>Pre_Validatoroutput (ruw)</summary><pre class="ruw">${esc(r.pre.output) || '–'}</pre></details>
    <details><summary>Aft_Validatoroutput (ruw)</summary><pre class="ruw">${esc(r.aft.output) || '–'}</pre></details>
  </div>`;
}

async function laadShots(root) {
  for (const img of $$('img[data-shot-naam]', root)) {
    const url = await Opslag.screenshotUrl(S.map, img.dataset.shotNaam);
    if (url) {
      img.src = url;
      // lightbox over alle screenshots van de (gefilterde) tijdlijn
      img.onclick = () => {
        const items = lbItems(pasFilterToe(chrono(S.data.records)));
        const d = img.dataset;
        openLightbox(items, items.findIndex(x => x.recId === d.rec && x.side === d.side && x.nr === +d.i + 1));
      };
    }
    else img.replaceWith(Object.assign(document.createElement('p'), { className: 'nok', textContent: 'Bestand niet gevonden.' }));
  }
}

async function onTijdlijnClick(ev) {
  const b = ev.target.closest('button[data-action]');
  if (b) {
    const id = b.dataset.id;
    if (b.dataset.action === 'bewerk') startBewerken(id);
    else if (b.dataset.action === 'verwijder') verwijder(id);
    else if (b.dataset.action === 'herparse') herparse(id);
    return;
  }
  const tr = ev.target.closest('tr.rec');
  if (tr) {
    const id = tr.dataset.id;
    if (S.open.has(id)) S.open.delete(id); else S.open.add(id);
    render();
  }
}

async function verwijder(id) {
  const r = zoek(id);
  if (!(await bevestig(`<p>Record <b>${esc(r.run)}</b> definitief verwijderen uit de log?</p><p class="hint">Screenshots blijven in de map screenshots/ staan. De dagelijkse back-up bevat de toestand van vóór de eerste wijziging van vandaag.</p>`, 'Verwijderen', true))) return;
  S.data.records = S.data.records.filter(x => x.id !== id);
  S.open.delete(id);
  bewaarLog(true);
  render();
  toonMelding(`${r.run} verwijderd.`);
}

async function herparse(id) {
  const r = zoek(id);
  const nieuw = {}, lijsten = [];
  for (const side of ['pre', 'aft']) {
    if (!r[side].output.trim()) continue;
    nieuw[side] = parseValidatorOutput(r[side].output);
    const v = vergelijkParsed(r[side].parsed, nieuw[side]);
    if (v.length) lijsten.push(`<h4>Output ${side === 'pre' ? 'vóór' : 'na'}</h4><ul>${v.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
  }
  if (!lijsten.length) { toonMelding('Opnieuw parsen geeft hetzelfde resultaat. Er verandert niets.'); return; }
  const pre = nieuw.pre || r.pre.parsed, aft = nieuw.aft || r.aft.parsed;
  const g = pre && aft ? berekenGevolg(pre, aft) : null;
  const gTekst = g && (!r.gevolg || r.gevolg.tekst !== g.tekst) ? `<h4>Gevolg</h4><p>${esc(r.gevolg ? r.gevolg.tekst : '–')}<br>→ ${esc(g.tekst)}</p>` : '';
  const ok = await bevestig(`<h3>Opnieuw parsen: ${esc(r.run)}</h3><p>De huidige parser (v${PARSER_VERSIE}) leest de ruwe tekst anders dan wat vastgelegd is:</p>${lijsten.join('')}${gTekst}
    <p class="hint">Bij vervangen blijft de oude parsing bewaard in de historiek van dit record.</p>`, 'Vervangen');
  if (!ok) return;
  r.parseHistoriek.push({ datum: isoNu(), pre: r.pre.parsed, aft: r.aft.parsed, gevolg: r.gevolg });
  if (nieuw.pre) r.pre.parsed = nieuw.pre;
  if (nieuw.aft) r.aft.parsed = nieuw.aft;
  r.gevolg = g;
  r.gewijzigd = isoNu();
  bewaarLog(true);
  render();
  toonMelding(`Parsing van ${r.run} vervangen.`);
}

/* ================= overzicht ================= */

function renderOverzicht(m) {
  const alle = chrono(S.data.records), recs = pasFilterToe(alle);
  const groepen = new Map();
  for (const r of recs) {
    const g = groepVan(r.run);
    if (!groepen.has(g)) groepen.set(g, []);
    groepen.get(g).push(r);
  }
  const keys = [...groepen.keys()].sort((a, b) => (a ?? 1e9) - (b ?? 1e9));
  m.innerHTML = `<section class="kaart">
    <div class="kop-rij"><h2>Overzicht per groep</h2><span class="hint">${recs.length} records</span></div>
    ${filterBalk(alle)}
    ${keys.length ? keys.map(g => groepHtml(g, groepen.get(g))).join('') : '<p class="leeg">Geen records.</p>'}
  </section>`;
  bindFilters(m.firstElementChild);
}

function groepHtml(g, recs) {
  const o = overzichtGroep(recs);
  const codes = [...new Set([...Object.keys(o.eerste ? o.eerste.samenvatting : {}), ...Object.keys(o.laatste ? o.laatste.samenvatting : {})])].sort();
  const pct = (a, n) => (n ? Math.round((100 * a) / n) + '%' : '–');
  const bTabel = ['moment', 'herzien'].map(k => {
    const d = o.behulpzaam[k];
    return `<tr><th>${k === 'moment' ? 'Moment zelf' : 'Na herziening'}</th><td class="getal">${d.ja}</td><td class="getal">${d.nee}</td><td class="getal">${d.twijfel}</td><td class="getal">${d.leeg}</td></tr>`;
  }).join('');
  const intCodes = Object.keys(o.intuitief).sort();
  return `<div class="groep">
    <h3>${g === null ? 'Zonder geldig runnummer' : 'Groep ' + g} <small>${o.aantal} records, ${o.afgerond} afgerond</small></h3>
    <div class="groep-grid">
      <div><h4>Meldingen per constraint</h4>
        ${codes.length ? `<table class="mini"><tr><th></th><th>Eerste<br><small>${esc(o.eerste ? o.eerste.run + ' vóór' : '–')}</small></th><th>Laatste<br><small>${esc(o.laatste ? o.laatste.run + ' ' + o.laatste.moment : '–')}</small></th></tr>
          ${codes.map(c => `<tr><th>${esc(c)}</th><td class="getal">${o.eerste ? o.eerste.samenvatting[c] || 0 : '–'}</td><td class="getal">${o.laatste ? o.laatste.samenvatting[c] || 0 : '–'}</td></tr>`).join('')}</table>` : '<p class="leeg">geen meldingen</p>'}
      </div>
      <div><h4>Acties</h4>
        <table class="mini"><tr><th></th>${SOORTEN.map(s => `<th>${LABELS.soort[s]}</th>`).join('')}</tr>
          ${['relatie', 'element'].map(ob => `<tr><th>${LABELS.object[ob]}</th>${SOORTEN.map(s => `<td class="getal">${o.acties[ob][s]}</td>`).join('')}</tr>`).join('')}
        </table><p>Bewust niet opgelost: <b>${o.nietOpgelost}</b></p>
      </div>
      <div><h4>Intuïtief per constraint</h4>
        ${intCodes.length ? `<table class="mini"><tr><th></th><th>Ja</th><th>Nee</th><th>leeg</th><th>aandeel ja</th></tr>
          ${intCodes.map(c => { const d = o.intuitief[c]; return `<tr><th>${esc(c)}</th><td class="getal">${d.ja}</td><td class="getal">${d.nee}</td><td class="getal">${d.leeg}</td><td class="getal">${pct(d.ja, d.ja + d.nee)}</td></tr>`; }).join('')}</table>` : '<p class="leeg">–</p>'}
      </div>
      <div><h4>Behulpzaam</h4>
        <table class="mini"><tr><th></th><th>Ja</th><th>Nee</th><th>Twijfel</th><th>leeg</th></tr>${bTabel}</table>
        <p class="hint">${o.behulpzaam.aantalHerzien} record(s) herzien. “Na herziening” = laatste herziening, anders het oordeel van het moment zelf.</p>
      </div>
      <div><h4>Requirements</h4>
        <p>Geraakt: <b>${o.req.geraakt}</b> · Verfijnd: <b>${o.req.verfijnd}</b></p>
        ${o.req.lijst.length ? `<ul class="lijst">${o.req.lijst.map(x => `<li><b>${esc(x.run)}</b> ${LABELS.req[x.status].toLowerCase()}: ${esc(x.ids.join(', '))}${x.verfijning ? `<div class="pre-wrap hint">${esc(x.verfijning)}</div>` : ''}</li>`).join('')}</ul>` : ''}
      </div>
      <div><h4>Records met nieuwe meldingen</h4>
        ${o.nieuweMeldingen.length ? `<ul class="lijst">${o.nieuweMeldingen.map(x => `<li><b>${esc(x.run)}</b>: ${x.nieuw.length ? 'nieuw ' + esc(x.nieuw.join(', ')) : ''}${x.nieuw.length && x.toegenomen.length ? '; ' : ''}${x.toegenomen.length ? 'toegenomen ' + esc(x.toegenomen.join(', ')) : ''}<div class="hint">${esc(x.tekst)}</div></li>`).join('')}</ul>` : '<p class="leeg">geen</p>'}
      </div>
    </div>
  </div>`;
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
  document.addEventListener('keydown', ev => {
    if ($('#lb').hidden) return;
    const acties = {
      ArrowLeft: () => bladerLightbox(LB.i - 1), ArrowUp: () => bladerLightbox(LB.i - 1),
      ArrowRight: () => bladerLightbox(LB.i + 1), ArrowDown: () => bladerLightbox(LB.i + 1),
      Home: () => bladerLightbox(0), End: () => bladerLightbox(LB.items.length - 1),
      Escape: sluitLightbox
    };
    if (acties[ev.key]) { ev.preventDefault(); acties[ev.key](); }
  });
}

/* ================= instellingen ================= */

function renderInstellingen(m) {
  const inst = S.data.settings;
  const lijst = (id, label, waarden, hint) => `<label class="veld"><span class="label">${label}</span>
    <textarea id="${id}" rows="${Math.min(14, waarden.length + 2)}">${esc(waarden.join('\n'))}</textarea><small class="hint">${hint}</small></label>`;
  m.innerHTML = `<section class="kaart instellingen">
    <h2>Instellingen</h2>
    <div class="veld"><span class="label">Gegevensmap</span>
      <p>📁 <b>${esc(S.map.name)}</b> — ${S.data.records.length} records. <button type="button" id="in-map">Andere map kiezen…</button></p>
      <small class="hint">Bij een andere map laadt de tool de log.json uit die map (of start een nieuwe).</small></div>
    ${lijst('in-views', 'Views (keuzelijst bij veld View)', inst.views, 'Eén view per regel. Records met een verwijderde view behouden hun waarde.')}
    ${lijst('in-cons', 'Vaste lijst constraints', inst.constraints, 'Eén code per regel.')}
    ${lijst('in-req', 'Requirements', inst.requirements, 'Eén requirement per regel.')}
    <p><button type="button" class="primair" id="in-bewaar">Instellingen bewaren</button></p>
    <p class="hint">Parser versie ${PARSER_VERSIE}. Gegevens worden automatisch opgeslagen in log.json.</p>
  </section>`;
  const regels = id => [...new Set($('#' + id).value.split('\n').map(x => x.trim()).filter(Boolean))];
  $('#in-bewaar').addEventListener('click', () => {
    inst.views = regels('in-views');
    inst.constraints = regels('in-cons').map(x => x.toUpperCase());
    inst.requirements = regels('in-req');
    bewaarLog(true);
    toonMelding('Instellingen bewaard.');
    render();
  });
  $('#in-map').addEventListener('click', async () => {
    if (S.ed && !(await bevestig('<p>Er is een invoer bezig. Die blijft bewaard in de log.json van de huidige map. Doorgaan?</p>', 'Doorgaan'))) return;
    kiesAndereMap();
  });
}
