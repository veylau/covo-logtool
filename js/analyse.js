'use strict';
/* Afgeleide gegevens: runnummers, chronologie, gevolg, waarschuwingen, overzicht per groep. */

const LABELS = {
  object: { relatie: 'Relatie', element: 'Element', niet_opgelost: 'Bewust niet opgelost' },
  soort: { toevoegen: 'Toevoegen', verwijderen: 'Verwijderen', verplaatsen: 'Verplaatsen', type_gewijzigd: 'Type gewijzigd' },
  behulpzaam: { ja: 'Ja', nee: 'Nee', twijfel: 'Twijfel' },
  req: { nee: 'Nee', geraakt: 'Geraakt', verfijnd: 'Verfijnd' },
  modus: { construction: 'Construction', audit: 'Audit' },
  status: { concept: 'concept', afgerond: 'afgerond' }
};
const SOORTEN = Object.keys(LABELS.soort);
const RUN_RE = /^R(\d+)\.(\d+)$/;

/* ---------- datum & tijd ---------- */
const p2 = n => String(n).padStart(2, '0');
function vandaag() { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
function nuTijd() { const d = new Date(); return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; }
function isoNu() { return `${vandaag()}T${nuTijd()}`; }
function toonDatum(iso) { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }

/* ---------- runs ---------- */
function groepVan(run) { const m = RUN_RE.exec((run || '').trim()); return m ? +m[1] : null; }
function volgendeRun(run) {
  const m = RUN_RE.exec((run || '').trim());
  if (!m) return '';
  return `R${m[1]}.${String(+m[2] + 1).padStart(Math.max(2, m[2].length), '0')}`;
}
function sleutel(r) { return `${r.pre.datum || ''}T${r.pre.tijd || ''}|${r.aangemaakt || ''}`; }
function chrono(recs) { return [...recs].sort((a, b) => (sleutel(a) < sleutel(b) ? -1 : sleutel(a) > sleutel(b) ? 1 : 0)); }

function actieTekst(a) {
  if (a.object === 'niet_opgelost') return 'bewust niet opgelost';
  return `${LABELS.object[a.object].toLowerCase()} ${LABELS.soort[a.soort].toLowerCase()}`;
}
function behulpzaamHerzien(r) {
  const h = r.behulpzaam.herzieningen;
  return h.length ? h[h.length - 1] : null;
}

/* ---------- gevolg ---------- */
function berekenGevolg(pre, aft) {
  const codes = [...new Set([...Object.keys(pre.samenvatting), ...Object.keys(aft.samenvatting)])].sort();
  const per = codes.map(c => ({ code: c, voor: pre.samenvatting[c] || 0, na: aft.samenvatting[c] || 0 }));
  return {
    perConstraint: per,
    nieuw: per.filter(x => x.voor === 0 && x.na > 0).map(x => x.code),
    verdwenen: per.filter(x => x.voor > 0 && x.na === 0).map(x => x.code),
    toegenomen: per.filter(x => x.voor > 0 && x.na > x.voor).map(x => x.code),
    statusVoor: pre.status,
    statusNa: aft.status,
    totaalVoor: per.reduce((a, x) => a + x.voor, 0),
    totaalNa: per.reduce((a, x) => a + x.na, 0),
    tekst: per.length ? per.map(x => `${x.code}: ${x.voor} → ${x.na}`).join(' · ') : 'geen meldingen vóór en na'
  };
}

/* ---------- waarschuwingen (niet blokkerend) ---------- */
function normTekst(t) {
  return (t || '').replace(/\r\n?/g, '\n').split('\n')
    .map(l => l.trim())
    .filter(l => l && !/Validation completed in/i.test(l))
    .join('\n');
}
function berekenWaarschuwingen(r, vorig, pre, aft) {
  const w = [];
  if (vorig && vorig.aft.output && r.pre.output && normTekst(vorig.aft.output) !== normTekst(r.pre.output)) {
    w.push(`Pre_Validatoroutput verschilt van de Aft_Validatoroutput van het vorige record (${vorig.run}): toestand veranderd buiten de log?`);
  }
  if (pre && pre.herkend && aft && aft.herkend) {
    const namen = { views: 'views', elements: 'elements', horizontal: 'horizontal relationships', vertical: 'vertical relationships' };
    const versch = Object.keys(namen).filter(k => pre.selectie[k] !== aft.selectie[k])
      .map(k => `${namen[k]} ${pre.selectie[k] ?? '?'} → ${aft.selectie[k] ?? '?'}`);
    if (versch.length) w.push(`Selectie verschilt tussen vóór en na: ${versch.join(', ')}.`);
  }
  if (pre && pre.modus && r.modus && pre.modus !== r.modus) w.push(`Modus in de output vóór (${LABELS.modus[pre.modus]}) verschilt van het veld Modus (${LABELS.modus[r.modus]}).`);
  if (aft && aft.modus && r.modus && aft.modus !== r.modus) w.push(`Modus in de output na (${LABELS.modus[aft.modus]}) verschilt van het veld Modus (${LABELS.modus[r.modus]}).`);
  for (const [naam, p] of [['vóór', pre], ['na', aft]]) {
    if (p) for (const x of p.waarschuwingen) w.push(`Output ${naam}: ${x}`);
  }
  return w;
}

/* ---------- vergelijking bij opnieuw parsen ---------- */
function vergelijkParsed(a, b) {
  if (!a) return ['Er was nog geen vastgelegde parsing.'];
  const v = [];
  const f = x => (x === null || x === undefined ? '–' : x);
  const z = (label, x, y) => { if (JSON.stringify(x) !== JSON.stringify(y)) v.push(`${label}: ${f(x)} → ${f(y)}`); };
  z('Status', a.status, b.status);
  z('Modus', a.modus, b.modus);
  for (const k of Object.keys(b.selectie)) z(`Selectie ${k}`, a.selectie[k], b.selectie[k]);
  const codes = [...new Set([...Object.keys(a.samenvatting), ...Object.keys(b.samenvatting)])].sort();
  for (const c of codes) z(`Aantal ${c}`, a.samenvatting[c], b.samenvatting[c]);
  z('Aantal secties', a.secties.length, b.secties.length);
  const strip = p => { const { parserVersie, ...rest } = p; return rest; };
  if (!v.length && JSON.stringify(strip(a)) !== JSON.stringify(strip(b))) v.push('Details van de meldingen of waarschuwingen verschillen.');
  return v;
}

/* ---------- overzicht per groep ---------- */
function overzichtGroep(recs) {
  const o = {
    aantal: recs.length,
    afgerond: recs.filter(r => r.status === 'afgerond').length,
    eerste: null, laatste: null,
    acties: {}, nietOpgelost: 0,
    intuitief: {},
    behulpzaam: { moment: { ja: 0, nee: 0, twijfel: 0, leeg: 0 }, herzien: { ja: 0, nee: 0, twijfel: 0, leeg: 0 }, aantalHerzien: 0 },
    req: { geraakt: 0, verfijnd: 0, lijst: [] },
    nieuweMeldingen: []
  };
  const metPre = recs.find(r => r.pre.parsed);
  if (metPre) o.eerste = { run: metPre.run, samenvatting: metPre.pre.parsed.samenvatting };
  for (let i = recs.length - 1; i >= 0; i--) {
    const r = recs[i];
    if (r.aft.parsed) { o.laatste = { run: r.run, moment: 'na', samenvatting: r.aft.parsed.samenvatting }; break; }
    if (r.pre.parsed) { o.laatste = { run: r.run, moment: 'vóór', samenvatting: r.pre.parsed.samenvatting }; break; }
  }
  for (const o2 of ['relatie', 'element']) { o.acties[o2] = {}; for (const s of SOORTEN) o.acties[o2][s] = 0; }

  for (const r of recs) {
    for (const a of r.acties) {
      if (a.object === 'niet_opgelost') o.nietOpgelost++;
      else if (o.acties[a.object]) o.acties[a.object][a.soort]++;
    }
    for (const c of r.constraints) {
      const v = r.intuitief.perConstraint[c];
      o.intuitief[c] = o.intuitief[c] || { ja: 0, nee: 0, leeg: 0 };
      o.intuitief[c][v === 'ja' || v === 'nee' ? v : 'leeg']++;
    }
    const m = r.behulpzaam.moment;
    o.behulpzaam.moment[m || 'leeg']++;
    const h = behulpzaamHerzien(r);
    o.behulpzaam.herzien[(h ? h.waarde : m) || 'leeg']++;
    if (h) o.behulpzaam.aantalHerzien++;
    const rq = r.requirements;
    if (rq.status === 'geraakt' || rq.status === 'verfijnd') {
      o.req[rq.status]++;
      o.req.lijst.push({ run: r.run, id: r.id, status: rq.status, ids: rq.ids, verfijning: rq.verfijning });
    }
    if (r.gevolg && (r.gevolg.nieuw.length || r.gevolg.toegenomen.length)) {
      o.nieuweMeldingen.push({ run: r.run, id: r.id, nieuw: r.gevolg.nieuw, toegenomen: r.gevolg.toegenomen, tekst: r.gevolg.tekst });
    }
  }
  return o;
}
