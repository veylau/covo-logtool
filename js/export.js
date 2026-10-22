'use strict';
/* Export naar CSV (Belgische Excel: UTF-8 met BOM, scheidingsteken ;) en JSON.
   CSV per onderdeel: de kolommen hangen af van het type van het onderdeel. */

function csvWaarde(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = ' ' + s; // voorkomt dat Excel tekst als formule leest
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const aantallen = p => (p ? Object.entries(p.samenvatting).map(([c, n]) => `${c}=${n}`).join('|') : '');
const sel = (p, k) => (p ? p.selectie[k] : '');
const actieKolommen = () => OBJECTEN.flatMap(o => SOORTEN.map(s => `${o}_${s}`));
/* Aantal per combinatie. COVO: leeg als niet ingevuld (vinkje zonder aantal = "x"). TO-BE: 0 als de actie ontbreekt. */
function actieWaarde(r, sleutelKol, type) {
  const [o, ...rest] = sleutelKol.split('_'), s = rest.join('_');
  const a = r.acties.find(x => x.object === o && x.soort === s);
  if (type === 'covo') return a ? (a.aantal != null ? a.aantal : 'x') : '';
  return a && a.aantal ? a.aantal : 0;
}
const nieuwZeker = r => (r.gevolg && r.gevolg.meldingenNieuw ? r.gevolg.meldingenNieuw.flatMap(x => x.zeker.map(t => `${x.code}: ${t}`)).join('|') : '');
const nieuwMogelijk = r => (r.gevolg && r.gevolg.meldingenNieuw ? r.gevolg.meldingenNieuw.flatMap(x => x.mogelijk.map(t => `${x.code}: ${t}`)).join('|') : '');

const KOL = {
  id: r => r.id,
  status: r => r.status,
  onderdeel: r => (onderdeelVan(r.onderdeel) || {}).naam,
  run: r => r.run,
  groep: r => groepVan(r.run),
  recordtype: r => r.recordtype,
  pre_datum: r => r.pre.datum,
  pre_tijdstip: r => r.pre.tijd,
  modus: r => (r.modus ? LABELS.modus[r.modus] : ''),
  validator_build: r => r.build,
  pre_status: r => r.pre.parsed && r.pre.parsed.status,
  pre_modus_output: r => r.pre.parsed && r.pre.parsed.modus,
  pre_views: r => sel(r.pre.parsed, 'views'),
  pre_elements: r => sel(r.pre.parsed, 'elements'),
  pre_horizontal: r => sel(r.pre.parsed, 'horizontal'),
  pre_vertical: r => sel(r.pre.parsed, 'vertical'),
  pre_aantallen: r => aantallen(r.pre.parsed),
  pre_screenshots: r => r.pre.screenshots.map(s => s.naam).join('|'),
  constraints: r => r.constraints.join('|'),
  meldingen: r => r.meldingen.map(m => `${m.constraint}: ${m.tekst}${m.bron === 'vrij' ? ' (vrij)' : ''}`).join('|'),
  intuitief: r => r.constraints.map(c => `${c}=${r.intuitief.perConstraint[c] || ''}`).join('|'),
  intuitief_opmerking: r => r.intuitief.opmerking,
  tobe_requirements: r => r.tobeRequirements.join('|'),
  views: r => r.views.join('|'),
  acties: r => r.acties.map(actieTekst).join('|'),
  acties_totaal: r => actiesTotaal(r),
  beschrijving_actie: r => r.beschrijving,
  behulpzaam_moment: r => r.behulpzaam.moment,
  behulpzaam_herzien: r => { const h = behulpzaamHerzien(r); return h ? h.waarde : ''; },
  behulpzaam_herzien_datum: r => { const h = behulpzaamHerzien(r); return h ? h.datum : ''; },
  behulpzaam_herzieningen: r => r.behulpzaam.herzieningen.map(h => `${h.datum}: ${h.waarde}${h.opmerking ? ' (' + h.opmerking + ')' : ''}`).join('|'),
  requirements: r => r.requirements.status,
  requirements_ids: r => r.requirements.ids.join('|'),
  requirements_verfijning: r => r.requirements.verfijning,
  aft_datum: r => r.aft.datum,
  aft_tijdstip: r => r.aft.tijd,
  duur_min: r => duurMinuten(r),
  aft_status: r => r.aft.parsed && r.aft.parsed.status,
  aft_modus_output: r => r.aft.parsed && r.aft.parsed.modus,
  aft_views: r => sel(r.aft.parsed, 'views'),
  aft_elements: r => sel(r.aft.parsed, 'elements'),
  aft_horizontal: r => sel(r.aft.parsed, 'horizontal'),
  aft_vertical: r => sel(r.aft.parsed, 'vertical'),
  aft_aantallen: r => aantallen(r.aft.parsed),
  aft_screenshots: r => r.aft.screenshots.map(s => s.naam).join('|'),
  gevolg: r => r.gevolg && r.gevolg.tekst,
  gevolg_nieuw: r => r.gevolg && r.gevolg.nieuw.join('|'),
  gevolg_verdwenen: r => r.gevolg && r.gevolg.verdwenen.join('|'),
  gevolg_toegenomen: r => r.gevolg && r.gevolg.toegenomen.join('|'),
  toename_meldingen: r => (r.gevolg ? toenameVan(r.gevolg) : ''),
  nieuwe_meldingen_zeker: nieuwZeker,
  nieuwe_meldingen_mogelijk: nieuwMogelijk,
  waarschuwingen: r => r.waarschuwingen.join('|'),
  parser_versie: r => (r.pre.parsed || r.aft.parsed || {}).parserVersie,
  pre_validatoroutput: r => r.pre.output,
  aft_validatoroutput: r => r.aft.output
};

/* Kolomvolgorde per type. COVO: de kolommen van v1, met de nieuwe kolommen achteraan vóór de ruwe teksten. */
const ACTIES = '#acties';
const CSV_VOLGORDE = {
  covo: ['id', 'status', 'run', 'groep', 'pre_datum', 'pre_tijdstip', 'modus', 'validator_build', 'pre_status', 'pre_modus_output',
    'pre_views', 'pre_elements', 'pre_horizontal', 'pre_vertical', 'pre_aantallen', 'pre_screenshots', 'constraints', 'meldingen',
    'intuitief', 'intuitief_opmerking', 'views', 'acties', 'beschrijving_actie', 'behulpzaam_moment', 'behulpzaam_herzien',
    'behulpzaam_herzien_datum', 'behulpzaam_herzieningen', 'requirements', 'requirements_ids', 'requirements_verfijning',
    'aft_datum', 'aft_tijdstip', 'aft_status', 'aft_modus_output', 'aft_views', 'aft_elements', 'aft_horizontal', 'aft_vertical',
    'aft_aantallen', 'aft_screenshots', 'gevolg', 'gevolg_nieuw', 'gevolg_verdwenen', 'gevolg_toegenomen', 'waarschuwingen',
    'parser_versie', 'onderdeel', ACTIES, 'pre_validatoroutput', 'aft_validatoroutput'],
  'tobe-zonder': ['id', 'status', 'onderdeel', 'run', 'pre_datum', 'pre_tijdstip', 'aft_datum', 'aft_tijdstip', 'duur_min',
    'tobe_requirements', 'views', 'acties', ACTIES, 'acties_totaal', 'beschrijving_actie', 'pre_screenshots', 'aft_screenshots',
    'aft_status', 'aft_aantallen', 'waarschuwingen', 'aft_validatoroutput'],
  'tobe-met': ['id', 'status', 'onderdeel', 'run', 'recordtype', 'pre_datum', 'pre_tijdstip', 'aft_datum', 'aft_tijdstip', 'duur_min',
    'tobe_requirements', 'modus', 'validator_build', 'constraints', 'meldingen', 'intuitief', 'intuitief_opmerking', 'views',
    'acties', ACTIES, 'acties_totaal', 'beschrijving_actie', 'behulpzaam_moment', 'behulpzaam_herzien', 'behulpzaam_herzien_datum',
    'pre_status', 'pre_aantallen', 'aft_status', 'aft_aantallen', 'gevolg', 'gevolg_nieuw', 'gevolg_verdwenen', 'gevolg_toegenomen',
    'toename_meldingen', 'nieuwe_meldingen_zeker', 'nieuwe_meldingen_mogelijk', 'pre_screenshots', 'aft_screenshots',
    'waarschuwingen', 'parser_versie', 'pre_validatoroutput', 'aft_validatoroutput']
};

function csvTekst(kop, rijen) {
  return '﻿' + [kop.join(';'), ...rijen.map(r => r.map(csvWaarde).join(';'))].join('\r\n') + '\r\n';
}
function maakCsv(records, type) {
  const kolommen = CSV_VOLGORDE[type].flatMap(k => (k === ACTIES ? actieKolommen().map(a => ({ naam: a, f: r => actieWaarde(r, a, type) })) : [{ naam: k, f: KOL[k] }]));
  return csvTekst(kolommen.map(k => k.naam), chrono(records).map(r => kolommen.map(k => k.f(r))));
}
function maakVergelijkingCsv(v) {
  const kop = ['requirement', 'records_zonder', 'records_met', 'wijzigingen_met', 'correcties_met', 'acties_zonder', 'acties_met',
    'duur_min_zonder', 'duur_min_met', 'zonder_tijd_zonder', 'zonder_tijd_met', 'toename_meldingen_met', 'nieuwe_constraints_met',
    ...actieKolommen().map(a => `zonder_${a}`), ...actieKolommen().map(a => `met_${a}`), 'runs_zonder', 'runs_met'];
  const rij = x => [x.requirement, x.z.records, x.m.records, x.m.wijzigingen, x.m.correcties, x.z.actiesTotaal, x.m.actiesTotaal,
    x.z.duur, x.m.duur, x.z.duurOnbekend, x.m.duurOnbekend, x.m.toename, x.m.nieuweConstraints,
    ...OBJECTEN.flatMap(o => SOORTEN.map(s => x.z.acties[o][s])), ...OBJECTEN.flatMap(o => SOORTEN.map(s => x.m.acties[o][s])),
    x.z.runs.join('|'), x.m.runs.join('|')];
  return csvTekst(kop, [...v.rijen.map(rij), rij(v.totaal)]);
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
const bestandsdeel = s => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function exporteerCsv(data, onderdeel) {
  const recs = data.records.filter(r => r.onderdeel === onderdeel.id);
  download(`covo-log-${bestandsdeel(onderdeel.naam)}-${vandaag()}.csv`, maakCsv(recs, onderdeel.type), 'text/csv;charset=utf-8');
}
function exporteerVergelijkingCsv(v) {
  download(`covo-log-vergelijking-tobe-${vandaag()}.csv`, maakVergelijkingCsv(v), 'text/csv;charset=utf-8');
}
function exporteerJson(data) {
  const { werkversie, ...rest } = data;
  download(`covo-log-export-${vandaag()}.json`, JSON.stringify(rest, null, 2), 'application/json');
}
