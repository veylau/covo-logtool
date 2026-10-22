'use strict';
/* Weergaven: tijdlijn, tabel met detail (vorige/volgende), overzichten, vergelijking TO-BE, instellingen.
   Alle weergaven tonen alleen de records van het actieve onderdeel (behalve de vergelijking). */

/* ================= kolommen per onderdeeltype ================= */

function kolommen(type) {
  const nieuwm = r => r.gevolg && (r.gevolg.nieuw.length || r.gevolg.toegenomen.length);
  const K = {
    run: { kop: 'Run', cel: r => `<b>${esc(r.run)}</b>`, sort: r => runSorteersleutel(r.run) },
    datum: { kop: 'Datum', cel: r => `${toonDatum(r.pre.datum)} <small>${esc((r.pre.tijd || '').slice(0, 5))}</small>`, sort: r => sleutel(r) },
    duur: { kop: 'Duur', cel: r => { const d = duurMinuten(r); return d === null ? '<span class="leeg">–</span>' : `${d} min`; }, sort: r => duurMinuten(r) ?? -1, klas: 'getal' },
    recordtype: { kop: 'Soort', cel: r => (r.recordtype ? `<span class="badge rt-${r.recordtype}">${r.recordtype === 'correctie' ? 'correctie' : 'wijziging'}</span>` : ''), sort: r => r.recordtype || '' },
    tobereq: { kop: 'Requirement(s)', cel: r => esc(r.tobeRequirements.join(', ')), sort: r => r.tobeRequirements.join(',') },
    views: { kop: 'View', cel: r => r.views.map(esc).join('<br>'), sort: r => r.views.join(','), klas: 'view-kol' },
    modus: { kop: 'Modus', cel: r => (r.modus ? LABELS.modus[r.modus] : ''), sort: r => r.modus || '' },
    constraints: { kop: 'Constraints', cel: r => esc(r.constraints.join(', ')), sort: r => r.constraints.join(',') },
    acties: { kop: 'Actie', cel: r => esc(r.acties.map(actieTekst).join(', ')), sort: r => (type === 'covo' ? r.acties.length : actiesTotaal(r)) },
    gevolg: {
      kop: 'Gevolg',
      cel: r => (r.gevolg ? `<span class="${nieuwm(r) ? 'nok' : ''}">${esc(r.gevolg.tekst)}</span>` : '<span class="leeg">–</span>'),
      sort: r => (r.gevolg ? toenameVan(r.gevolg) : -1)
    },
    badges: {
      kop: '', klas: 'badges', sort: null,
      cel: r => `${r.status === 'concept' ? '<span class="badge concept">concept</span>' : ''}${r.waarschuwingen.length ? `<span class="badge waarsch" title="${esc(r.waarschuwingen.join('\n'))}">⚠ ${r.waarschuwingen.length}</span>` : ''}`
    }
  };
  const volgorde = {
    covo: ['run', 'datum', 'views', 'modus', 'constraints', 'acties', 'gevolg', 'badges'],
    'tobe-zonder': ['run', 'datum', 'duur', 'tobereq', 'views', 'acties', 'badges'],
    'tobe-met': ['run', 'datum', 'duur', 'recordtype', 'tobereq', 'constraints', 'views', 'acties', 'gevolg', 'badges']
  }[type] || [];
  return volgorde.map(k => ({ key: k, ...K[k] }));
}
const celHtml = (c, r) => `<td class="${c.klas || ''}">${c.cel(r)}</td>`;

/* Records van het actieve onderdeel, gefilterd; in de tabel ook gesorteerd. */
function zichtbareRecords() {
  const lijst = pasFilterToe(chrono(recsActief()));
  if (S.scherm !== 'tabel') return lijst;
  const k = kolommen(actief().type).find(c => c.key === S.sort.kol && c.sort);
  if (!k) return lijst;
  return lijst.map((r, i) => ({ r, i, v: k.sort(r) }))
    .sort((a, b) => { const c = a.v < b.v ? -1 : a.v > b.v ? 1 : 0; return c ? c * S.sort.richting : a.i - b.i; })
    .map(x => x.r);
}
const kopOnderdeel = (titel, aantal, totaal) =>
  `<div class="kop-rij"><h2>${titel}</h2><span class="badge onderdeel">${esc(actief().naam)}</span><span class="hint">${aantal} van ${totaal} records</span></div>`;
const geenRecords = alle => `<p class="leeg">${alle.length ? 'Geen records voor deze filters.' : 'Nog geen records in dit onderdeel. Klik op “+ Nieuw record” om te beginnen.'}</p>`;

/* ================= tijdlijn ================= */

function renderTijdlijn(m) {
  const type = actief().type, alle = chrono(recsActief()), recs = zichtbareRecords(), cols = kolommen(type);
  m.innerHTML = `<section class="kaart">
    ${kopOnderdeel('Tijdlijn', recs.length, alle.length)}
    ${filterBalk(alle, type)}
    ${recs.length ? `<table class="tijdlijn">
      <thead><tr>${cols.map(c => `<th>${c.kop}</th>`).join('')}</tr></thead>
      <tbody>${recs.map(r => `
        <tr class="rec ${S.open.has(r.id) ? 'open' : ''}" data-id="${r.id}">${cols.map(c => celHtml(c, r)).join('')}</tr>
        ${S.open.has(r.id) ? `<tr class="detail"><td colspan="${cols.length}">${detailHtml(r)}</td></tr>` : ''}`).join('')}
      </tbody></table>` : geenRecords(alle)}
  </section>`;
  bindFilters(m.firstElementChild);
  m.firstElementChild.addEventListener('click', onTijdlijnClick);
  laadShots(m);
}

/* ================= tabel + detail ================= */

function renderTabel(m) {
  const type = actief().type, alle = chrono(recsActief()), recs = zichtbareRecords();
  if (S.detailId && recs.some(r => r.id === S.detailId)) { renderDetailNav(m, recs); return; }
  S.detailId = null;
  const cols = kolommen(type);
  m.innerHTML = `<section class="kaart">
    ${kopOnderdeel('Tabel', recs.length, alle.length)}
    ${filterBalk(alle, type)}
    ${recs.length ? `<table class="tijdlijn tabel">
      <thead><tr>${cols.map(c => `<th ${c.sort ? `data-sort="${c.key}" class="sorteerbaar ${S.sort.kol === c.key ? (S.sort.richting > 0 ? 'op' : 'af') : ''}"` : ''}>${c.kop}</th>`).join('')}</tr></thead>
      <tbody>${recs.map(r => `<tr class="rec" data-id="${r.id}">${cols.map(c => celHtml(c, r)).join('')}</tr>`).join('')}</tbody>
    </table><p class="hint">Klik op een kolomkop om te sorteren, op een rij voor de details.</p>` : geenRecords(alle)}
  </section>`;
  const sec = m.firstElementChild;
  bindFilters(sec);
  sec.addEventListener('click', ev => {
    const th = ev.target.closest('th[data-sort]');
    if (th) {
      S.sort = S.sort.kol === th.dataset.sort ? { kol: th.dataset.sort, richting: -S.sort.richting } : { kol: th.dataset.sort, richting: 1 };
      render();
      return;
    }
    const tr = ev.target.closest('tr.rec');
    if (tr) { S.detailId = tr.dataset.id; render(); window.scrollTo(0, 0); }
  });
}

function renderDetailNav(m, recs) {
  const i = recs.findIndex(r => r.id === S.detailId), r = recs[i];
  m.innerHTML = `<section class="kaart">
    <div class="detail-nav">
      <button type="button" data-nav="terug">← Terug naar de tabel</button>
      <span class="flex"></span>
      <button type="button" data-nav="-1" ${i === 0 ? 'disabled' : ''}>‹ Vorige</button>
      <span class="positie"><b>${esc(r.run)}</b> · ${i + 1} / ${recs.length}</span>
      <button type="button" data-nav="1" ${i === recs.length - 1 ? 'disabled' : ''}>Volgende ›</button>
    </div>
    <p class="hint">Pijltjestoetsen: vorige / volgende record (in de volgorde en met de filters van de tabel) · Esc: terug naar de tabel.</p>
    ${detailHtml(r)}
  </section>`;
  const sec = m.firstElementChild;
  sec.addEventListener('click', ev => {
    const b = ev.target.closest('[data-nav]');
    if (!b) return;
    if (b.dataset.nav === 'terug') { S.detailId = null; render(); } else bladerDetail(+b.dataset.nav);
  });
  sec.addEventListener('click', onTijdlijnClick);
  laadShots(m);
}
function bladerDetail(stap) {
  const recs = zichtbareRecords(), i = recs.findIndex(r => r.id === S.detailId);
  const j = Math.max(0, Math.min(recs.length - 1, i + stap));
  if (i < 0 || j === i) return;
  S.detailId = recs[j].id;
  render();
}

/* ================= detail van één record ================= */

function detailHtml(r) {
  const type = typeVan(r), metValidator = type !== 'tobe-zonder';
  const h = behulpzaamHerzien(r), q = r.requirements, d = duurMinuten(r);
  const meld = r.constraints.map(c => {
    const ms = r.meldingen.filter(x => x.constraint === c);
    const int = r.intuitief.perConstraint[c];
    return `<li><b>${esc(c)}</b> <small>intuïtief: ${int ? LABELS.behulpzaam[int] : '–'}</small>${ms.length ? `<ul>${ms.map(x => `<li>${esc(x.tekst)}${x.bron === 'vrij' ? ' <small>(vrij)</small>' : ''}</li>`).join('')}</ul>` : ''}</li>`;
  }).join('');
  // screenshots per paar: vóór n naast na n
  const shot = (side, label, i) => {
    const s = r[side].screenshots[i];
    return `<figure><figcaption>${label} ${i + 1}${s ? ` — <code>${esc(s.naam)}</code>` : ''}</figcaption>
      ${s ? `<img data-shot-naam="${esc(s.naam)}" data-rec="${r.id}" data-side="${side}" data-i="${i}" alt="${label} ${i + 1}" title="Klik om groot te openen">` : '<div class="leeg-shot">geen screenshot</div>'}</figure>`;
  };
  const paren = Math.max(1, r.pre.screenshots.length, r.aft.screenshots.length);
  const shotsHtml = Array.from({ length: paren }, (_, i) => shot('pre', 'Vóór', i) + shot('aft', 'Na', i)).join('');
  const rij = (dt, dd) => `<dt>${dt}</dt><dd>${dd}</dd>`;
  const tijd = side => (r[side].datum ? `${toonDatum(r[side].datum)} ${esc(r[side].tijd)}` : '–');
  const rijen = [];
  if (r.recordtype) rijen.push(rij('Soort record', LABELS.recordtype[r.recordtype]));
  if (metValidator) {
    rijen.push(rij('Run vóór', `${tijd('pre')} — ${r.pre.parsed ? korteSamenvatting(r.pre.parsed) : '–'}`));
    rijen.push(rij('Run na', `${tijd('aft')} — ${r.aft.parsed ? korteSamenvatting(r.aft.parsed) : '–'}`));
  } else {
    rijen.push(rij('Start', tijd('pre')), rij('Einde', tijd('aft')));
    if (r.aft.parsed) rijen.push(rij('Validatoroutput (ter info)', korteSamenvatting(r.aft.parsed)));
  }
  if (type !== 'covo') rijen.push(rij('Duur', d === null ? '–' : `${d} min`));
  if (metValidator) rijen.push(rij('Modus', r.modus ? LABELS.modus[r.modus] : '–'), rij('Validator build', esc(r.build) || '–'));
  if (type !== 'covo') rijen.push(rij(r.recordtype === 'correctie' ? 'Hoort bij TO-BE-requirement(s)' : 'TO-BE-requirement(s)', esc(r.tobeRequirements.join(', ')) || '–'));
  rijen.push(rij('View(s)', r.views.map(esc).join('<br>') || '–'));
  if (type === 'covo' || r.constraints.length) {
    rijen.push(rij('Constraints &amp; meldingen', meld ? `<ul class="meld">${meld}</ul>` : '–'));
    rijen.push(rij('Opmerking intuïtief', esc(r.intuitief.opmerking) || '–'));
  }
  rijen.push(rij('Uitgevoerde actie', esc(r.acties.map(actieTekst).join(', ')) || '–'));
  if (type !== 'covo') rijen.push(rij('Acties totaal', String(actiesTotaal(r))));
  rijen.push(rij('Beschrijving', `<div class="pre-wrap">${esc(r.beschrijving) || '–'}</div>`));
  if (type !== 'tobe-zonder') {
    rijen.push(rij('Behulpzaam', `moment zelf: <b>${r.behulpzaam.moment ? LABELS.behulpzaam[r.behulpzaam.moment] : '–'}</b>${h ? ` · herzien op ${toonDatum(h.datum)}: <b>${LABELS.behulpzaam[h.waarde]}</b>${h.opmerking ? ` (${esc(h.opmerking)})` : ''}` : ''}${r.behulpzaam.herzieningen.length > 1 ? ` <small>(${r.behulpzaam.herzieningen.length} herzieningen)</small>` : ''}`));
  }
  if (type === 'covo') rijen.push(rij('Requirements', `${q.status ? LABELS.req[q.status] : '–'}${q.ids.length ? ': ' + esc(q.ids.join(', ')) : ''}${q.verfijning ? `<div class="pre-wrap">${esc(q.verfijning)}</div>` : ''}`));
  if (metValidator) rijen.push(rij('Gevolg', gevolgHtml(r.gevolg)));
  rijen.push(rij('Parser', `${(r.pre.parsed || r.aft.parsed) ? 'v' + (r.pre.parsed || r.aft.parsed).parserVersie : '–'}${r.parseHistoriek.length ? ` · ${r.parseHistoriek.length}× opnieuw geparst` : ''}`));
  return `<div class="detail-inhoud">
    <div class="detail-knoppen">
      <button type="button" data-action="bewerk" data-id="${r.id}">${r.status === 'concept' ? 'Verder invullen' : 'Bewerken'}</button>
      ${r.pre.output || r.aft.output ? `<button type="button" data-action="herparse" data-id="${r.id}">Opnieuw parsen…</button>` : ''}
      <button type="button" data-action="verwijder" data-id="${r.id}" class="gevaar">Verwijderen</button>
    </div>
    ${r.waarschuwingen.length ? `<div class="waarsch"><b>Waarschuwingen bij bewaren:</b><ul>${r.waarschuwingen.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
    <div class="detail-grid">
      <dl>${rijen.join('')}</dl>
      <div class="shots">${shotsHtml}</div>
    </div>
    ${r.pre.output ? `<details><summary>Pre_Validatoroutput (ruw)</summary><pre class="ruw">${esc(r.pre.output)}</pre></details>` : ''}
    ${r.aft.output ? `<details><summary>${metValidator ? 'Aft_Validatoroutput' : 'Validatoroutput ter info'} (ruw)</summary><pre class="ruw">${esc(r.aft.output)}</pre></details>` : ''}
  </div>`;
}

async function laadShots(root) {
  for (const img of $$('img[data-shot-naam]', root)) {
    const url = await Opslag.screenshotUrl(S.map, img.dataset.shotNaam);
    if (!img.isConnected) return;
    if (url) {
      img.src = url;
      // lightbox over alle screenshots van de zichtbare records (zelfde volgorde en filters)
      img.onclick = () => {
        const items = lbItems(zichtbareRecords());
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
  if (S.scherm !== 'tijdlijn') return;
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
  if (S.detailId === id) S.detailId = null;
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
  const g = typeVan(r) !== 'tobe-zonder' && pre && aft ? berekenGevolg(pre, aft) : null;
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
  const type = actief().type, alle = chrono(recsActief()), recs = pasFilterToe(alle);
  let inhoud;
  if (!recs.length) inhoud = geenRecords(alle);
  else if (type === 'covo') {
    const groepen = new Map();
    for (const r of recs) {
      const g = groepVan(r.run);
      if (!groepen.has(g)) groepen.set(g, []);
      groepen.get(g).push(r);
    }
    const keys = [...groepen.keys()].sort((a, b) => (a ?? 1e9) - (b ?? 1e9));
    inhoud = keys.map(g => groepHtml(g, groepen.get(g))).join('');
  } else inhoud = tobeOverzichtHtml(recs, type);
  m.innerHTML = `<section class="kaart">
    ${kopOnderdeel(type === 'covo' ? 'Overzicht per groep' : 'Overzicht per TO-BE-requirement', recs.length, alle.length)}
    ${filterBalk(alle, type)}
    ${inhoud}
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
      <div><h4>Acties <small>(aantal records)</small></h4>
        <table class="mini"><tr><th></th>${SOORTEN.map(s => `<th>${LABELS.soort[s]}</th>`).join('')}</tr>
          ${OBJECTEN.map(ob => `<tr><th>${LABELS.object[ob]}</th>${SOORTEN.map(s => `<td class="getal">${o.acties[ob][s]}</td>`).join('')}</tr>`).join('')}
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
      <div><h4>Records met nieuwe meldingen</h4>${nieuweMeldingenLijst(o.nieuweMeldingen)}</div>
    </div>
  </div>`;
}
const nieuweMeldingenLijst = lijst => (lijst.length
  ? `<ul class="lijst">${lijst.map(x => `<li><b>${esc(x.run)}</b>: ${x.nieuw.length ? 'nieuw ' + esc(x.nieuw.join(', ')) : ''}${x.nieuw.length && x.toegenomen.length ? '; ' : ''}${x.toegenomen.length ? 'toegenomen ' + esc(x.toegenomen.join(', ')) : ''}<div class="hint">${esc(x.tekst)}</div></li>`).join('')}</ul>`
  : '<p class="leeg">geen</p>');

const duurCel = x => `${x.duur} min${x.duurOnbekend ? ` <small class="hint">(${x.duurOnbekend} zonder tijd)</small>` : ''}`;
function tobeOverzichtHtml(recs, type) {
  const met = type === 'tobe-met';
  const ov = overzichtTobe(recs, S.data.settings.tobeRequirements);
  const rijen = [...ov.per.entries()];
  if (ov.zonder.records) rijen.push(['(geen requirement)', ov.zonder]);
  const hoofd = (q, x, th = 'th') => `<tr><${th}>${esc(q)}</${th}><td class="getal">${x.records}</td>
    ${met ? `<td class="getal">${x.wijzigingen}</td><td class="getal">${x.correcties}</td>` : ''}
    <td class="getal">${x.actiesTotaal}</td><td class="getal">${duurCel(x)}</td>
    ${met ? `<td class="getal">${x.toename}</td><td class="getal">${x.nieuweConstraints}</td>` : ''}</tr>`;
  const perSoort = (q, x) => `<tr><th>${esc(q)}</th>${OBJECTEN.flatMap(o => SOORTEN.map(s => `<td class="getal">${x.acties[o][s] || ''}</td>`)).join('')}</tr>`;
  return `<div class="groep">
    <h4>Per requirement</h4>
    <table class="mini breed">
      <tr><th>Requirement</th><th>Records</th>${met ? '<th>Wijzigingen</th><th>Correcties</th>' : ''}<th>Acties</th><th>Duur</th>${met ? '<th>Toename meldingen</th><th>Nieuwe constraints</th>' : ''}</tr>
      ${rijen.map(([q, x]) => hoofd(q, x)).join('')}
      <tfoot>${hoofd('Totaal', ov.totaal)}</tfoot>
    </table>
    <p class="hint">Een record met meerdere requirements telt bij elk van die requirements mee; de totaalrij telt elk record één keer. Duur = tijdstip na − tijdstip vóór.</p>
    <h4>Acties per soort <small>(som van de aantallen)</small></h4>
    <table class="mini breed acties-soort">
      <tr><th rowspan="2">Requirement</th>${OBJECTEN.map(o => `<th colspan="${SOORTEN.length}">${LABELS.object[o]}</th>`).join('')}</tr>
      <tr>${OBJECTEN.map(() => SOORTEN.map(s => `<th>${LABELS.soort[s]}</th>`).join('')).join('')}</tr>
      ${rijen.map(([q, x]) => perSoort(q, x)).join('')}
      <tfoot>${perSoort('Totaal', ov.totaal)}</tfoot>
    </table>
    ${met ? `<h4>Records met nieuwe meldingen</h4>${nieuweMeldingenLijst(overzichtGroep(recs).nieuweMeldingen)}` : ''}
  </div>`;
}

/* ================= vergelijking TO-BE ================= */

/* Per requirement: model zonder COVO tegenover model met COVO. */
function vergelijkingData() {
  const oz = onderdelen().find(x => x.type === 'tobe-zonder'), om = onderdelen().find(x => x.type === 'tobe-met');
  const reqs = S.data.settings.tobeRequirements;
  const vz = overzichtTobe(chrono(recsVan(oz.id)), reqs), vm = overzichtTobe(chrono(recsVan(om.id)), reqs);
  const keys = [...new Set([...vz.per.keys(), ...vm.per.keys()])];
  const rijen = keys.map(q => ({ requirement: q, z: vz.per.get(q) || tobeRij(), m: vm.per.get(q) || tobeRij() }));
  if (vz.zonder.records || vm.zonder.records) rijen.push({ requirement: '(geen requirement)', z: vz.zonder, m: vm.zonder });
  return { oz, om, rijen, totaal: { requirement: 'Totaal', z: vz.totaal, m: vm.totaal } };
}
function renderVergelijking(m) {
  const v = vergelijkingData();
  const rij = (x, th = 'th') => `<tr><${th}>${esc(x.requirement)}</${th}>
    <td class="getal z">${x.z.records}</td><td class="getal m">${x.m.records} <small class="hint">(${x.m.wijzigingen} w · ${x.m.correcties} c)</small></td>
    <td class="getal z">${x.z.actiesTotaal}</td><td class="getal m">${x.m.actiesTotaal}</td>
    <td class="getal z">${duurCel(x.z)}</td><td class="getal m">${duurCel(x.m)}</td>
    <td class="getal m">${x.m.toename}</td><td class="getal m">${x.m.correcties}</td></tr>`;
  m.innerHTML = `<section class="kaart">
    <div class="kop-rij"><h2>Vergelijking TO-BE</h2><span class="hint">combineert bewust beide TO-BE-onderdelen</span>
      <span class="flex"></span><button type="button" id="btn-csv-vgl">CSV vergelijking</button></div>
    <table class="mini breed vergelijking">
      <tr><th rowspan="2">Requirement</th><th colspan="2">Records</th><th colspan="2">Acties</th><th colspan="2">Duur</th><th colspan="2">Alleen met COVO</th></tr>
      <tr><th class="z">${esc(v.oz.naam)}</th><th class="m">${esc(v.om.naam)}</th><th class="z">zonder</th><th class="m">met</th><th class="z">zonder</th><th class="m">met</th><th class="m">Toename meldingen</th><th class="m">Correcties</th></tr>
      ${v.rijen.map(x => rij(x)).join('')}
      <tfoot>${rij(v.totaal)}</tfoot>
    </table>
    <p class="hint">w = TO-BE-wijzigingen, c = COVO-correcties. Correcties tellen mee bij het requirement waar ze bij horen. Een record met meerdere requirements telt bij elk ervan; de totaalrij telt elk record één keer. Per actiesoort: zie de CSV.</p>
  </section>`;
  $('#btn-csv-vgl').addEventListener('click', () => exporteerVergelijkingCsv(vergelijkingData()));
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

    <div class="veld"><span class="label">Onderdelen</span>
      <table class="mini breed onderdelen">
        <tr><th>Naam</th><th>Type (formulier)</th><th>Run-prefix</th><th>Records</th><th></th></tr>
        ${inst.onderdelen.map(o => { const n = recsVan(o.id).length; return `<tr>
          <td><input type="text" data-o-naam="${esc(o.id)}" value="${esc(o.naam)}"></td>
          <td>${esc(LABELS.type[o.type])}</td>
          <td><input type="text" class="kort" data-o-prefix="${esc(o.id)}" value="${esc(o.runPrefix)}" ${n ? 'disabled title="Niet aanpasbaar zolang er records zijn."' : ''}></td>
          <td class="getal">${n}</td>
          <td>${n || inst.onderdelen.length === 1 ? '' : `<button type="button" class="klein gevaar" data-o-del="${esc(o.id)}">Verwijderen</button>`}</td></tr>`; }).join('')}
        <tr class="nieuw-onderdeel">
          <td><input type="text" id="no-naam" placeholder="Naam nieuw onderdeel"></td>
          <td><select id="no-type">${Object.entries(LABELS.type).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></td>
          <td><input type="text" class="kort" id="no-prefix" placeholder="bv. T3"></td>
          <td></td><td><button type="button" id="no-add">Toevoegen</button></td></tr>
      </table>
      <small class="hint">Het type bepaalt het invoerformulier. Runnummers: COVO-type = prefix + groep (R1.01), TO-BE-types = vaste prefix (T1.01).</small>
    </div>

    ${lijst('in-views', 'Views (keuzelijst bij veld View)', inst.views, 'Eén view per regel. Records met een verwijderde view behouden hun waarde.')}
    ${lijst('in-cons', 'Vaste lijst constraints', inst.constraints, 'Eén code per regel.')}
    ${lijst('in-req', 'Requirements (COVO-iteratie: geraakt / verfijnd)', inst.requirements, 'Eén requirement per regel.')}
    ${lijst('in-treq', 'TO-BE-requirements', inst.tobeRequirements, 'Eén requirement per regel.')}
    <p><button type="button" class="primair" id="in-bewaar">Instellingen bewaren</button></p>
    <p class="hint">Parser versie ${PARSER_VERSIE} · schemaversie log ${S.data.schemaVersion}${S.data.migraties.length ? ` · omgezet op ${S.data.migraties.map(x => `${toonDatum(x.datum)} (back-up ${esc(x.backup)})`).join(', ')}` : ''}.</p>
  </section>`;
  const regels = id => [...new Set($('#' + id).value.split('\n').map(x => x.trim()).filter(Boolean))];
  const prefixGeldig = (p, type) => (type === 'covo' ? /^[A-Z]+$/ : /^[A-Z]+\d*$/).test(p);
  $('#in-bewaar').addEventListener('click', () => {
    const fouten = [];
    const nieuw = inst.onderdelen.map(o => ({
      ...o,
      naam: $(`[data-o-naam="${o.id}"]`).value.trim() || o.naam,
      runPrefix: $(`[data-o-prefix="${o.id}"]`).value.trim().toUpperCase()
    }));
    for (const o of nieuw) if (!prefixGeldig(o.runPrefix, o.type)) fouten.push(`Ongeldige run-prefix “${o.runPrefix}” voor ${o.naam}.`);
    if (new Set(nieuw.map(o => o.runPrefix)).size !== nieuw.length) fouten.push('Elke run-prefix moet uniek zijn.');
    if (fouten.length) { bevestig(`<h3>Niet bewaard</h3><ul>${fouten.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`, 'OK'); return; }
    inst.onderdelen = nieuw;
    inst.views = regels('in-views');
    inst.constraints = regels('in-cons').map(x => x.toUpperCase());
    inst.requirements = regels('in-req');
    inst.tobeRequirements = regels('in-treq');
    bewaarLog(true);
    toonMelding('Instellingen bewaard.');
    render();
  });
  $('#no-add').addEventListener('click', () => {
    const naam = $('#no-naam').value.trim(), type = $('#no-type').value, prefix = $('#no-prefix').value.trim().toUpperCase();
    if (!naam || !prefixGeldig(prefix, type) || inst.onderdelen.some(o => o.runPrefix === prefix)) {
      toonMelding('Geef een naam en een unieke, geldige run-prefix (COVO-type: letters, bv. Q; TO-BE-type: bv. T3).', 'waarsch');
      return;
    }
    const id = naam.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) + '-' + uid().slice(0, 4);
    inst.onderdelen.push({ id, naam, type, runPrefix: prefix });
    bewaarLog(true);
    render();
  });
  m.querySelector('.onderdelen').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-o-del]');
    if (!b) return;
    const o = onderdeelVan(b.dataset.oDel);
    if (recsVan(o.id).length || !(await bevestig(`<p>Onderdeel <b>${esc(o.naam)}</b> verwijderen? Het heeft geen records.</p>`, 'Verwijderen', true))) return;
    inst.onderdelen = inst.onderdelen.filter(x => x.id !== o.id);
    if (S.data.actiefOnderdeel === o.id) S.data.actiefOnderdeel = inst.onderdelen[0].id;
    bewaarLog(true);
    render();
  });
  $('#in-map').addEventListener('click', async () => {
    if (S.ed && !(await bevestig('<p>Er is een invoer bezig. Die blijft bewaard in de log.json van de huidige map. Doorgaan?</p>', 'Doorgaan'))) return;
    kiesAndereMap();
  });
}
