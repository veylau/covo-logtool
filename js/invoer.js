'use strict';
/* Invoer in drie stappen. Het formulier hangt af van het type van het onderdeel:
   covo (COVO-iteratie), tobe-zonder (TO-BE, model zonder COVO), tobe-met (TO-BE, model met COVO). */

let edItems = {};        // meldingen per constraint zoals getoond in stap 2
const liveCache = { pre: { t: null, p: null }, aft: { t: null, p: null } };

const edOnderdeel = () => onderdeelVan(S.ed.rec.onderdeel) || actief();
const edType = () => edOnderdeel().type;
const isCorrectie = () => edType() === 'tobe-met' && S.ed.rec.recordtype === 'correctie';
const toontConstraints = () => edType() === 'covo' || isCorrectie();

function startNieuw() {
  const o = actief();
  const r = nieuwRecord(o.id);
  const vorigEigen = vorigBinnen(o.id, null);
  r.run = vorigEigen ? (volgendeRun(vorigEigen.run) || eersteRun(o)) : eersteRun(o);
  const bron = vorigVoor(r, null);
  if (bron) {
    r.pre.screenshots = bron.aft.screenshots.map(s => ({ naam: s.naam, eigen: false }));
    if (o.type !== 'tobe-zonder') { r.pre.output = bron.aft.output || ''; r.build = bron.build || ''; }
  }
  if (o.type === 'tobe-met') r.recordtype = 'wijziging';
  if (o.type !== 'tobe-zonder') r.modus = parseValidatorOutput(r.pre.output).modus;
  S.ed = { rec: r, origId: null, stap: 1 };
  S.scherm = 'invoer';
  bewaarWerkversie();
  render();
}
async function startBewerken(id) {
  if (S.ed && !(await bevestig('<p>Er is al een invoer bezig. Die werkkopie gaat verloren. Doorgaan?</p>', 'Doorgaan', true))) return;
  const o = zoek(id);
  S.ed = { rec: structuredClone(o), origId: id, stap: o.status === 'concept' ? (o.aft.output || o.aft.datum ? 3 : 2) : 1 };
  S.data.actiefOnderdeel = o.onderdeel;
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

function outputBlok(side, label, openAlsLeeg = true) {
  const t = S.ed.rec[side].output;
  return `<details class="output" id="${side}-details" ${!t && openAlsLeeg ? 'open' : ''}>
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
  const e = S.ed, r = e.rec, inst = S.data.settings, o = edOnderdeel(), type = o.type;
  const metValidator = type !== 'tobe-zonder';
  const views = [...inst.views, ...r.views.filter(v => !inst.views.includes(v))];
  const stappen = type === 'tobe-zonder'
    ? ['1 · Start', '2 · Wijziging', '3 · Einde']
    : ['1 · Opstart <small>run vóór</small>', '2 · Wijziging', '3 · Afsluiting <small>run na</small>'];
  m.innerHTML = `
  <section class="editor kaart">
    <div class="ed-kop">
      <span class="badge onderdeel">${esc(o.naam)}</span>
      <h2>${e.origId ? `Record ${esc(zoek(e.origId).run)} bewerken` : 'Nieuw record'}</h2>
      <span class="badge ${r.status}">${r.status}</span>
    </div>
    <div id="ed-info"></div>
    <div id="ed-warn"></div>
    <div class="tabs" role="tablist">${stappen.map((s, i) => `<button type="button" data-stap="${i + 1}">${s}</button>`).join('')}</div>

    <div class="paneel" data-paneel="1">
      <div class="rij">
        ${veld(type === 'tobe-zonder' ? 'Datum start' : 'Pre_Datum', `<input type="date" data-bind="pre.datum" value="${esc(r.pre.datum)}">`)}
        ${veld(type === 'tobe-zonder' ? 'Tijdstip start' : 'Pre_Tijdstip', `<input type="time" step="1" data-bind="pre.tijd" value="${esc(r.pre.tijd)}">`)}
        ${veld('Run', `<input type="text" data-bind="run" value="${esc(r.run)}" placeholder="${esc(eersteRun(o))}" class="kort">`)}
        ${metValidator ? veld('Validator build', `<input type="text" data-bind="build" value="${esc(r.build)}">`, 'breed') : ''}
      </div>
      ${type === 'tobe-met' ? `<div class="veld"><span class="label">Soort record</span><div class="keuzes">
        ${radio('recordtype', 'wijziging', 'TO-BE-wijziging', r.recordtype)}${radio('recordtype', 'correctie', 'COVO-correctie (meldingen oplossen na een wijziging)', r.recordtype)}</div></div>` : ''}
      ${metValidator ? `<div class="veld"><span class="label">Modus</span><div class="keuzes" id="ed-modus">
        ${radio('modus', 'construction', 'Construction', r.modus)}${radio('modus', 'audit', 'Audit', r.modus)}
        <small class="hint">automatisch uit de output, aanpasbaar</small></div></div>
      ${outputBlok('pre', 'Pre_Validatoroutput')}` : ''}
      ${shotBlok('pre', type === 'tobe-zonder' ? 'Screenshot(s) vóór' : 'Pre_Screenshot')}
    </div>

    <div class="paneel" data-paneel="2">
      ${toontConstraints() ? `
      <div class="veld"><span class="label">Constraint(s)</span>
        <div id="ed-constraints"></div>
        <div class="inline"><input type="text" id="ed-vrijc" placeholder="Andere constraint, bv. C14" class="kort">
          <button type="button" data-action="c-add">Toevoegen</button></div>
      </div>
      <div class="veld"><span class="label">Melding(en) en intuïtief — per aangevinkte constraint</span><div id="ed-meldingen"></div></div>
      ${veld('Opmerking bij intuïtief (optioneel)', `<input type="text" data-bind="intuitief.opmerking" value="${esc(r.intuitief.opmerking)}" placeholder="bv. tekst van de melding onduidelijk of fout geformuleerd">`)}` : ''}
      ${type !== 'covo' ? `<div class="veld"><span class="label">${isCorrectie() ? 'Hoort bij TO-BE-requirement(s)' : 'TO-BE-requirement(s)'} <small class="hint">meerdere mogelijk</small></span><div id="ed-tobereq"></div></div>` : ''}
      <div class="veld"><span class="label">View(s) <small class="hint">meerdere mogelijk</small></span>
        ${views.length
          ? `<div class="viewlijst">${views.map(v => `<label class="item"><input type="checkbox" data-view="${esc(v)}" ${r.views.includes(v) ? 'checked' : ''}> <span>${esc(v)}</span></label>`).join('')}</div>`
          : '<p class="leeg">Nog geen views. Voeg de views van je model toe via Instellingen.</p>'}</div>
      <div class="veld"><span class="label">Uitgevoerde actie${type === 'covo' ? ' <small class="hint">aantal optioneel</small>' : ' — aantallen'}</span><div id="ed-acties"></div></div>
      <label class="veld"><span class="label" id="lbl-beschr">Beschrijving actie</span><textarea data-bind="beschrijving" rows="3">${esc(r.beschrijving)}</textarea></label>
      ${type !== 'tobe-zonder' ? `<div class="veld"><span class="label">Behulpzaam${type === 'tobe-met' ? ' <small class="hint">hielp de validator bij deze wijziging? Nvt als hij niets te melden had</small>' : ''}</span><div id="ed-behulpzaam"></div></div>` : ''}
      ${type === 'covo' ? '<div class="veld"><span class="label">Requirements</span><div id="ed-req"></div></div>' : ''}
    </div>

    <div class="paneel" data-paneel="3">
      <div class="rij">
        ${veld(type === 'tobe-zonder' ? 'Datum einde' : 'Aft_Datum', `<input type="date" data-bind="aft.datum" value="${esc(r.aft.datum)}">`)}
        ${veld(type === 'tobe-zonder' ? 'Tijdstip einde' : 'Aft_Tijdstip', `<input type="time" step="1" data-bind="aft.tijd" value="${esc(r.aft.tijd)}">`)}
        <div class="veld"><span class="label">&nbsp;</span><button type="button" data-action="aft-nu">Nu</button></div>
        <div class="veld"><span class="label">Duur</span><div id="ed-duur" class="duur"></div></div>
      </div>
      ${metValidator ? outputBlok('aft', 'Aft_Validatoroutput') : outputBlok('aft', 'Validatoroutput (ter info, optioneel) — één eindrun, zonder gevolgberekening', false)}
      ${shotBlok('aft', type === 'tobe-zonder' ? 'Screenshot(s) na' : 'Aft_Screenshot')}
      ${metValidator ? '<div class="veld"><span class="label">Gevolg <small class="hint">automatisch berekend</small></span><div id="ed-gevolg"></div></div>' : ''}
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
  const vrijc = $('#ed-vrijc');
  if (vrijc) vrijc.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); voegConstraintToe(); } });

  toonStap();
  renderInfo();
  renderParsed('pre'); renderParsed('aft');
  renderConstraints(); renderMeldingen(); renderTobeReq(); renderActies();
  renderBehulpzaam(); renderReq();
  renderShots('pre'); renderShots('aft');
  renderGevolg(); renderDuur(); renderWarn();
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
  const eigen = vorigBinnen(r.onderdeel, null), bron = vorigVoor(r, null), type = edType();
  const info = [];
  if (eigen) info.push(`Vorig record in dit onderdeel: <b>${esc(eigen.run)}</b>.`);
  else info.push('Eerste record van dit onderdeel.');
  if (bron && bron !== eigen) info.push(`Startpunt overgenomen van de eindtoestand van de COVO-iteratie (<b>${esc(bron.run)}</b>): validatoroutput en screenshots.`);
  else if (bron && type !== 'tobe-zonder') {
    if (!bron.aft.output) info.push('Dat record heeft nog geen Aft_Validatoroutput (concept), dus Pre_Validatoroutput is leeg.');
    else if (r.pre.output === bron.aft.output) info.push('Pre_Validatoroutput en Pre_Screenshot zijn overgenomen van de afsluiting van dat record.');
  } else if (bron && bron.aft.screenshots.length) info.push('Screenshots vóór zijn overgenomen van het einde van dat record.');
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
    else { const n = $(`[data-aantal="${d.actie}"]`); if (n) n.value = ''; }
    zetBeschrijvingLabel();
  } else if (d.aantal !== undefined) {
    zetAantal(d.aantal, t.value);
    if (ev.type === 'change') renderActies();
  } else if (d.view !== undefined) {
    r.views = r.views.filter(v => v !== d.view);
    if (t.checked) r.views.push(d.view);
    const volgorde = S.data.settings.views;
    r.views.sort((a, b) => (volgorde.indexOf(a) + 1 || 1e9) - (volgorde.indexOf(b) + 1 || 1e9));
  } else if (d.req !== undefined) {
    r.requirements.ids = r.requirements.ids.filter(x => x !== d.req);
    if (t.checked) r.requirements.ids.push(d.req);
    r.requirements.ids.sort((a, b) => S.data.settings.requirements.indexOf(a) - S.data.settings.requirements.indexOf(b));
  } else if (d.treq !== undefined) {
    r.tobeRequirements = r.tobeRequirements.filter(x => x !== d.treq);
    if (t.checked) r.tobeRequirements.push(d.treq);
    const volgorde = S.data.settings.tobeRequirements;
    r.tobeRequirements.sort((a, b) => (volgorde.indexOf(a) + 1 || 1e9) - (volgorde.indexOf(b) + 1 || 1e9));
    renderWarn();
  } else return;
  bewaarWerkversie();
}

/* Aantal per actiecombinatie. COVO: het vinkje blijft leidend, het aantal is optioneel.
   TO-BE: een actie bestaat zodra het aantal groter is dan 0. */
function zetAantal(sleutelActie, waarde) {
  const r = S.ed.rec, [object, soort] = sleutelActie.split('|');
  const n = waarde === '' ? null : Math.max(0, parseInt(waarde, 10) || 0);
  const i = r.acties.findIndex(a => a.object === object && a.soort === soort);
  if (edType() === 'covo') {
    if (n) {
      if (i >= 0) r.acties[i].aantal = n; else r.acties.push({ object, soort, aantal: n });
      const vink = $(`[data-actie="${sleutelActie}"]`); if (vink) vink.checked = true;
    } else if (i >= 0) delete r.acties[i].aantal;
  } else if (n) {
    if (i >= 0) r.acties[i].aantal = n; else r.acties.push({ object, soort, aantal: n });
  } else if (i >= 0) r.acties.splice(i, 1);
  const tot = $('#acties-totaal'); if (tot) tot.textContent = actiesTotaal(r);
}

function zetPad(obj, pad, v) {
  const delen = pad.split('.');
  let o = obj;
  for (let i = 0; i < delen.length - 1; i++) o = o[delen[i]];
  o[delen[delen.length - 1]] = v;
}

function naBinding(pad) {
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
    renderParsed('aft'); renderGevolg(); renderDuur(); renderWarn();
  } else if (pad === 'recordtype') {
    renderEditor($('#main'));
  } else if (/^(pre|aft)\.(datum|tijd)$/.test(pad)) {
    renderDuur();
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
    renderDuur(); bewaarWerkversie();
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
  if (!el) return;
  if (!r[side].output.trim()) { el.innerHTML = '<p class="leeg">Nog geen output geplakt.</p>'; sv.innerHTML = ''; return; }
  const { p, vast } = parsedVoor(side);
  el.innerHTML = parsedHtml(p, vast);
  sv.innerHTML = '— ' + korteSamenvatting(p);
}

function renderConstraints() {
  const el = $('#ed-constraints');
  if (!el) return;
  const r = S.ed.rec, p = parsedVoor('pre').p;
  const inOutput = Object.keys(p.samenvatting);
  const vast = S.data.settings.constraints.filter(c => !inOutput.includes(c));
  const eigen = r.constraints.filter(c => !inOutput.includes(c) && !vast.includes(c));
  const chip = (c, n) => {
    const titel = n != null ? meldingenVoor(p, c).titel : '';
    return `<label class="chip ${n != null ? 'in-output' : ''}" title="${esc(titel || '')}"><input type="checkbox" data-c="${esc(c)}" ${r.constraints.includes(c) ? 'checked' : ''}> ${esc(c)}${n != null ? ` <span class="tel">${n}</span>` : ''}</label>`;
  };
  el.innerHTML = `
    <div class="chips"><span class="chips-label">In output vóór:</span>${inOutput.length ? inOutput.map(c => chip(c, p.samenvatting[c])).join('') : '<span class="leeg">geen</span>'}</div>
    <div class="chips"><span class="chips-label">Overige:</span>${vast.map(c => chip(c, null)).join('')}${eigen.map(c => chip(c, null)).join('')}</div>`;
}

function renderMeldingen() {
  const el = $('#ed-meldingen');
  if (!el) return;
  const r = S.ed.rec, p = parsedVoor('pre').p;
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

function renderTobeReq() {
  const el = $('#ed-tobereq');
  if (!el) return;
  const r = S.ed.rec, lijst = [...S.data.settings.tobeRequirements, ...r.tobeRequirements.filter(q => !S.data.settings.tobeRequirements.includes(q))];
  el.innerHTML = lijst.length
    ? `<div class="chips">${lijst.map(q => `<label class="chip"><input type="checkbox" data-treq="${esc(q)}" ${r.tobeRequirements.includes(q) ? 'checked' : ''}> ${esc(q)}</label>`).join('')}</div>`
    : '<p class="leeg">Nog geen TO-BE-requirements. Voeg ze toe via Instellingen.</p>';
}

function renderActies() {
  const el = $('#ed-acties');
  if (!el) return;
  const r = S.ed.rec, type = edType();
  const actie = (o, s) => r.acties.find(a => a.object === o && (a.soort || null) === (s || null));
  const cel = (o, s) => {
    const a = actie(o, s), k = `${o}|${s}`, lbl = `${LABELS.object[o]} ${LABELS.soort[s]}`;
    if (type === 'covo') {
      return `<td><input type="checkbox" data-actie="${k}" ${a ? 'checked' : ''} aria-label="${lbl}">
        <input type="number" min="0" class="aantal" data-aantal="${k}" value="${a && a.aantal != null ? a.aantal : ''}" placeholder="–" aria-label="Aantal ${lbl}"></td>`;
    }
    return `<td><input type="number" min="0" class="aantal" data-aantal="${k}" value="${a && a.aantal ? a.aantal : 0}" aria-label="Aantal ${lbl}"></td>`;
  };
  el.innerHTML = `
    <table class="acties">
      <tr><th></th>${SOORTEN.map(s => `<th>${LABELS.soort[s]}</th>`).join('')}</tr>
      ${OBJECTEN.map(o => `<tr><th>${LABELS.object[o]}</th>${SOORTEN.map(s => cel(o, s)).join('')}</tr>`).join('')}
    </table>
    ${type !== 'covo' ? `<p class="hint">Totaal: <b id="acties-totaal">${actiesTotaal(r)}</b> actie(s).</p>` : ''}
    ${type !== 'tobe-zonder' ? `<label class="keuze"><input type="checkbox" data-actie="niet_opgelost" ${actie('niet_opgelost') ? 'checked' : ''}> Bewust niet opgelost</label>` : ''}`;
  zetBeschrijvingLabel();
}
function zetBeschrijvingLabel() {
  const niet = S.ed.rec.acties.some(a => a.object === 'niet_opgelost');
  $('#lbl-beschr').textContent = niet ? 'Beschrijving actie — motivering waarom bewust niet opgelost' : 'Beschrijving actie';
}

function renderBehulpzaam() {
  const el = $('#ed-behulpzaam');
  if (!el) return;
  const r = S.ed.rec, o = origRec(), b = r.behulpzaam;
  const vergrendeld = o && o.status === 'afgerond' && o.behulpzaam.moment;
  const opties = Object.entries(LABELS.behulpzaam).filter(([k]) => k !== 'nvt' || edType() === 'tobe-met');
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
  el.innerHTML = html;
}

function renderReq() {
  const el = $('#ed-req');
  if (!el) return;
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
  el.innerHTML = html;
}

function renderDuur() {
  const el = $('#ed-duur');
  if (!el) return;
  const d = duurMinuten(S.ed.rec);
  el.innerHTML = d === null ? '<span class="leeg">–</span>' : `<b>${d} min</b>`;
  el.title = 'Berekend uit het tijdstip vóór en na.';
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
  if (!el) return;
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
  const nm = (g.meldingenNieuw || []).filter(x => x.zeker.length || x.mogelijk.length || x.naAfgekapt);
  return `<p class="gevolg-tekst">${esc(g.tekst)}</p>
    <table class="mini">${g.perConstraint.map(rij).join('')}
    <tr class="totaal"><th>Totaal</th><td class="getal">${g.totaalVoor}</td><td>→</td><td class="getal">${g.totaalNa}</td><td>${esc(g.statusVoor || '?')} → ${esc(g.statusNa || '?')}</td></tr></table>
    ${g.nieuw.length ? `<p class="nok">Nieuw verschenen: ${g.nieuw.map(esc).join(', ')}</p>` : ''}
    ${g.verdwenen.length ? `<p class="ok">Verdwenen: ${g.verdwenen.map(esc).join(', ')}</p>` : ''}
    ${nm.length ? `<div class="nieuwe-meldingen"><b class="nok">Nieuwe meldingen</b><ul>${nm.map(x => `<li><b>${esc(x.code)}</b>
      ${x.zeker.length ? `<div>zeker nieuw: ${x.zeker.map(esc).join('; ')}</div>` : ''}
      ${x.mogelijk.length ? `<div>mogelijk nieuw (lijst vóór afgekapt): ${x.mogelijk.map(esc).join('; ')}</div>` : ''}
      ${x.naAfgekapt ? '<div class="hint">lijst na is afgekapt: mogelijk nog meer nieuwe meldingen</div>' : ''}</li>`).join('')}</ul></div>` : ''}`;
}

function renderWarn() {
  const r = S.ed.rec, o = edOnderdeel();
  const pre = r.pre.output.trim() ? parsedVoor('pre').p : null;
  const aft = r.aft.output.trim() ? parsedVoor('aft').p : null;
  const w = berekenWaarschuwingen(r, vorigVoor(r, S.ed.origId), pre, aft);
  if (r.run && !runPatroon(o).test(r.run.trim())) w.unshift(`Run moet de vorm ${eersteRun(o)} hebben (onderdeel “${o.naam}”).`);
  if (o.type !== 'covo' && !r.tobeRequirements.length) w.push('Nog geen TO-BE-requirement gekozen.');
  $('#ed-warn').innerHTML = w.length ? `<div class="waarsch"><b>Controleer:</b><ul>${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
}

/* ---------- bewaren ---------- */

async function bewaar(afronden) {
  const e = S.ed, r = e.rec, o = origRec(), ond = edOnderdeel(), type = ond.type;
  r.run = r.run.trim();
  const fouten = [];
  if (!runPatroon(ond).test(r.run)) fouten.push(`Run moet de vorm ${eersteRun(ond)} hebben (onderdeel “${ond.naam}”).`);
  else if (S.data.records.some(x => x.id !== e.origId && x.run === r.run)) fouten.push(`Run ${r.run} bestaat al.`);
  const q = r.requirements;
  if (type === 'covo') {
    if ((q.status === 'geraakt' || q.status === 'verfijnd') && !q.ids.length) fouten.push('Kies bij Requirements welke requirement(s) geraakt of verfijnd zijn.');
    if (q.status === 'verfijnd' && !q.verfijning.trim()) fouten.push('Bij “Verfijnd” is “hoe werd het requirement verfijnd?” verplicht.');
  }
  if (afronden && type !== 'tobe-zonder') {
    if (!r.pre.output.trim()) fouten.push('Vul de Pre_Validatoroutput in om af te ronden.');
    if (!r.aft.output.trim()) fouten.push('Vul de Aft_Validatoroutput in om af te ronden (of bewaar als concept).');
  }
  if (fouten.length) {
    await bevestig(`<h3>Nog niet bewaard</h3><ul>${fouten.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`, 'OK');
    return;
  }

  // opschonen: velden die in dit onderdeel (of recordtype) niet getoond worden, leegmaken
  if (!toontConstraints()) { r.constraints = []; r.meldingen = []; r.intuitief = { perConstraint: {}, opmerking: '' }; }
  r.meldingen = r.meldingen.filter(m => r.constraints.includes(m.constraint) && m.tekst.trim());
  const pc = {};
  for (const c of r.constraints) if (r.intuitief.perConstraint[c]) pc[c] = r.intuitief.perConstraint[c];
  r.intuitief.perConstraint = pc;
  if (type === 'covo') {
    r.tobeRequirements = [];
    if (q.status !== 'geraakt' && q.status !== 'verfijnd') q.ids = [];
    if (q.status !== 'verfijnd') q.verfijning = '';
  } else {
    r.requirements = { status: null, ids: [], verfijning: '' };
    r.acties = r.acties.filter(a => a.object === 'niet_opgelost' || a.aantal > 0);
  }
  if (type === 'tobe-zonder') {
    r.pre.output = ''; r.modus = null; r.build = '';
    r.behulpzaam = { moment: null, herzieningen: [] };
    r.acties = r.acties.filter(a => a.object !== 'niet_opgelost');
  }

  // parsing vastleggen: alleen opnieuw parsen als de tekst gewijzigd is
  for (const side of ['pre', 'aft']) {
    if (!r[side].output.trim()) r[side].parsed = null;
    else if (o && o[side].parsed && o[side].output === r[side].output) r[side].parsed = o[side].parsed;
    else r[side].parsed = parseValidatorOutput(r[side].output);
  }
  const ongewijzigd = o && o.gevolg && o.pre.output === r.pre.output && o.aft.output === r.aft.output;
  r.gevolg = type !== 'tobe-zonder' && r.pre.parsed && r.aft.parsed
    ? (ongewijzigd ? o.gevolg : berekenGevolg(r.pre.parsed, r.aft.parsed)) : null;
  r.waarschuwingen = berekenWaarschuwingen(r, vorigVoor(r, e.origId), r.pre.parsed, r.aft.parsed);
  if (type !== 'covo' && !r.tobeRequirements.length) r.waarschuwingen.push('Geen TO-BE-requirement gekozen.');

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
