'use strict';
/* Export naar CSV (Belgische Excel: UTF-8 met BOM, scheidingsteken ;) en JSON. */

function csvWaarde(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = ' ' + s; // voorkomt dat Excel tekst als formule leest
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const aantallen = p => (p ? Object.entries(p.samenvatting).map(([c, n]) => `${c}=${n}`).join('|') : '');
const sel = (p, k) => (p ? p.selectie[k] : '');

const CSV_KOLOMMEN = [
  ['id', r => r.id],
  ['status', r => r.status],
  ['run', r => r.run],
  ['groep', r => groepVan(r.run)],
  ['pre_datum', r => r.pre.datum],
  ['pre_tijdstip', r => r.pre.tijd],
  ['modus', r => (r.modus ? LABELS.modus[r.modus] : '')],
  ['validator_build', r => r.build],
  ['pre_status', r => r.pre.parsed && r.pre.parsed.status],
  ['pre_modus_output', r => r.pre.parsed && r.pre.parsed.modus],
  ['pre_views', r => sel(r.pre.parsed, 'views')],
  ['pre_elements', r => sel(r.pre.parsed, 'elements')],
  ['pre_horizontal', r => sel(r.pre.parsed, 'horizontal')],
  ['pre_vertical', r => sel(r.pre.parsed, 'vertical')],
  ['pre_aantallen', r => aantallen(r.pre.parsed)],
  ['pre_screenshots', r => r.pre.screenshots.map(s => s.naam).join('|')],
  ['constraints', r => r.constraints.join('|')],
  ['meldingen', r => r.meldingen.map(m => `${m.constraint}: ${m.tekst}${m.bron === 'vrij' ? ' (vrij)' : ''}`).join('|')],
  ['intuitief', r => r.constraints.map(c => `${c}=${r.intuitief.perConstraint[c] || ''}`).join('|')],
  ['intuitief_opmerking', r => r.intuitief.opmerking],
  ['views', r => r.views.join('|')],
  ['acties', r => r.acties.map(actieTekst).join('|')],
  ['beschrijving_actie', r => r.beschrijving],
  ['behulpzaam_moment', r => r.behulpzaam.moment],
  ['behulpzaam_herzien', r => { const h = behulpzaamHerzien(r); return h ? h.waarde : ''; }],
  ['behulpzaam_herzien_datum', r => { const h = behulpzaamHerzien(r); return h ? h.datum : ''; }],
  ['behulpzaam_herzieningen', r => r.behulpzaam.herzieningen.map(h => `${h.datum}: ${h.waarde}${h.opmerking ? ' (' + h.opmerking + ')' : ''}`).join('|')],
  ['requirements', r => r.requirements.status],
  ['requirements_ids', r => r.requirements.ids.join('|')],
  ['requirements_verfijning', r => r.requirements.verfijning],
  ['aft_datum', r => r.aft.datum],
  ['aft_tijdstip', r => r.aft.tijd],
  ['aft_status', r => r.aft.parsed && r.aft.parsed.status],
  ['aft_modus_output', r => r.aft.parsed && r.aft.parsed.modus],
  ['aft_views', r => sel(r.aft.parsed, 'views')],
  ['aft_elements', r => sel(r.aft.parsed, 'elements')],
  ['aft_horizontal', r => sel(r.aft.parsed, 'horizontal')],
  ['aft_vertical', r => sel(r.aft.parsed, 'vertical')],
  ['aft_aantallen', r => aantallen(r.aft.parsed)],
  ['aft_screenshots', r => r.aft.screenshots.map(s => s.naam).join('|')],
  ['gevolg', r => r.gevolg && r.gevolg.tekst],
  ['gevolg_nieuw', r => r.gevolg && r.gevolg.nieuw.join('|')],
  ['gevolg_verdwenen', r => r.gevolg && r.gevolg.verdwenen.join('|')],
  ['gevolg_toegenomen', r => r.gevolg && r.gevolg.toegenomen.join('|')],
  ['waarschuwingen', r => r.waarschuwingen.join('|')],
  ['parser_versie', r => (r.pre.parsed || r.aft.parsed || {}).parserVersie],
  ['pre_validatoroutput', r => r.pre.output],
  ['aft_validatoroutput', r => r.aft.output]
];

function maakCsv(records) {
  const regels = [CSV_KOLOMMEN.map(k => k[0]).join(';')];
  for (const r of chrono(records)) regels.push(CSV_KOLOMMEN.map(([, f]) => csvWaarde(f(r))).join(';'));
  return '﻿' + regels.join('\r\n') + '\r\n';
}

function download(naam, inhoud, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([inhoud], { type }));
  a.download = naam;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function exporteerCsv(data) {
  download(`covo-log-${vandaag()}.csv`, maakCsv(data.records), 'text/csv;charset=utf-8');
}
function exporteerJson(data) {
  const { werkversie, ...rest } = data;
  download(`covo-log-export-${vandaag()}.json`, JSON.stringify(rest, null, 2), 'application/json');
}
