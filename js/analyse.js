'use strict';
/* Afgeleide gegevens: runnummers, chronologie, gevolg, waarschuwingen, overzichten. */

const LABELS = {
  object: { relatie: 'Relatie', element: 'Element', niet_opgelost: 'Bewust niet opgelost' },
  soort: { toevoegen: 'Toevoegen', verwijderen: 'Verwijderen', verplaatsen: 'Verplaatsen', hernoemen: 'Hernoemen', type_gewijzigd: 'Type gewijzigd' },
  behulpzaam: { ja: 'Ja', nee: 'Nee', twijfel: 'Twijfel', nvt: 'Nvt' },
  req: { nee: 'Nee', geraakt: 'Geraakt', verfijnd: 'Verfijnd' },
  modus: { construction: 'Construction', audit: 'Audit' },
  status: { concept: 'concept', afgerond: 'afgerond' },
  recordtype: { wijziging: 'TO-BE-wijziging', correctie: 'COVO-correctie' },
  type: { covo: 'COVO-iteratie', 'tobe-zonder': 'TO-BE zonder COVO', 'tobe-met': 'TO-BE met COVO' }
};
const SOORTEN = Object.keys(LABELS.soort);
const OBJECTEN = ['relatie', 'element'];
/* R1.01 (COVO: prefix + groep), T1.01 / T2.01 (TO-BE: vaste prefix) */
const RUN_RE = /^([A-Z]+)(\d+)\.(\d+)$/;

/* ---------- datum & tijd ---------- */
const p2 = n => String(n).padStart(2, '0');
function vandaag() { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
function nuTijd() { const d = new Date(); return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; }
function isoNu() { return `${vandaag()}T${nuTijd()}`; }
function toonDatum(iso) { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
/* Duur in minuten tussen tijdstip vóór en na; null als iets ontbreekt. */
function duurMinuten(r) {
  if (!r.pre.datum || !r.pre.tijd || !r.aft.datum || !r.aft.tijd) return null;
  const ms = new Date(`${r.aft.datum}T${r.aft.tijd}`) - new Date(`${r.pre.datum}T${r.pre.tijd}`);
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60000) : null;
}

/* ---------- runs ---------- */
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function groepVan(run) { const m = RUN_RE.exec((run || '').trim()); return m ? +m[2] : null; }
function volgendeRun(run) {
  const m = RUN_RE.exec((run || '').trim());
  if (!m) return '';
  return `${m[1]}${m[2]}.${String(+m[3] + 1).padStart(Math.max(2, m[3].length), '0')}`;
}
function runPatroon(o) {
  return o.type === 'covo' ? new RegExp(`^${escRe(o.runPrefix)}\\d+\\.\\d+$`) : new RegExp(`^${escRe(o.runPrefix)}\\.\\d+$`);
}
const eersteRun = o => (o.type === 'covo' ? `${o.runPrefix}1.01` : `${o.runPrefix}.01`);
function runSorteersleutel(run) {
  const m = RUN_RE.exec((run || '').trim());
  return m ? `${m[1]}${m[2].padStart(5, '0')}.${m[3].padStart(5, '0')}` : `~${run || ''}`;
}
function sleutel(r) { return `${r.pre.datum || ''}T${r.pre.tijd || ''}|${r.aangemaakt || ''}`; }
function chrono(recs) { return [...recs].sort((a, b) => (sleutel(a) < sleutel(b) ? -1 : sleutel(a) > sleutel(b) ? 1 : 0)); }

function actieTekst(a) {
  if (a.object === 'niet_opgelost') return 'bewust niet opgelost';
  const t = `${LABELS.object[a.object].toLowerCase()} ${(LABELS.soort[a.soort] || a.soort).toLowerCase()}`;
  return a.aantal != null ? `${a.aantal}× ${t}` : t;
}
const actiesTotaal = r => r.acties.reduce((s, a) => s + (a.object !== 'niet_opgelost' && a.aantal ? a.aantal : 0), 0);
function behulpzaamHerzien(r) {
  const h = r.behulpzaam.herzieningen;
  return h.length ? h[h.length - 1] : null;
}

/* ---------- gevolg ---------- */
const afgekapt = (p, code) => p.secties.some(s => s.blokken.some(b => b.code === code && b.meer > 0));
/* Nieuwe individuele meldingen: tekst komt na voor en vóór niet.
   "zeker" als de lijst vóór volledig is, anders "mogelijk" (afgekapt met "… and N more"). */
function nieuweMeldingen(pre, aft) {
  const uit = [];
  for (const code of Object.keys(aft.samenvatting)) {
    const voor = new Set(meldingenVoor(pre, code).items);
    const items = meldingenVoor(aft, code).items.filter(x => !voor.has(x));
    const voorAfgekapt = afgekapt(pre, code), naAfgekapt = afgekapt(aft, code);
    const stijging = (aft.samenvatting[code] || 0) > (pre.samenvatting[code] || 0);
    if (items.length || (naAfgekapt && stijging)) {
      uit.push({ code, zeker: voorAfgekapt ? [] : items, mogelijk: voorAfgekapt ? items : [], naAfgekapt });
    }
  }
  return uit;
}
function berekenGevolg(pre, aft) {
  const codes = [...new Set([...Object.keys(pre.samenvatting), ...Object.keys(aft.samenvatting)])].sort();
  const per = codes.map(c => ({ code: c, voor: pre.samenvatting[c] || 0, na: aft.samenvatting[c] || 0 }));
  return {
    perConstraint: per,
    nieuw: per.filter(x => x.voor === 0 && x.na > 0).map(x => x.code),
    verdwenen: per.filter(x => x.voor > 0 && x.na === 0).map(x => x.code),
    toegenomen: per.filter(x => x.voor > 0 && x.na > x.voor).map(x => x.code),
    toename: per.reduce((s, x) => s + Math.max(0, x.na - x.voor), 0),
    meldingenNieuw: nieuweMeldingen(pre, aft),
    statusVoor: pre.status,
    statusNa: aft.status,
    totaalVoor: per.reduce((a, x) => a + x.voor, 0),
    totaalNa: per.reduce((a, x) => a + x.na, 0),
    tekst: per.length ? per.map(x => `${x.code}: ${x.voor} → ${x.na}`).join(' · ') : 'geen meldingen vóór en na'
  };
}
/* Toename ook voor oude gevolgen zonder veld "toename". */
const toenameVan = g => (g ? (g.toename != null ? g.toename : g.perConstraint.reduce((s, x) => s + Math.max(0, x.na - x.voor), 0)) : 0);

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

/* ---------- overzicht COVO-iteratie (per groep) ---------- */
function leegActies() {
  const a = {};
  for (const o of OBJECTEN) { a[o] = {}; for (const s of SOORTEN) a[o][s] = 0; }
  return a;
}
function overzichtGroep(recs) {
  const leeg = () => ({ ja: 0, nee: 0, twijfel: 0, nvt: 0, leeg: 0 });
  const o = {
    aantal: recs.length,
    afgerond: recs.filter(r => r.status === 'afgerond').length,
    eerste: null, laatste: null,
    acties: leegActies(), nietOpgelost: 0,
    intuitief: {},
    behulpzaam: { moment: leeg(), herzien: leeg(), aantalHerzien: 0 },
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
  for (const r of recs) {
    for (const a of r.acties) {
      if (a.object === 'niet_opgelost') o.nietOpgelost++;
      else if (o.acties[a.object] && a.soort in o.acties[a.object]) o.acties[a.object][a.soort]++;
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

/* ---------- overzicht TO-BE (per requirement) ---------- */
function tobeRij() {
  return { records: 0, wijzigingen: 0, correcties: 0, acties: leegActies(), actiesTotaal: 0, duur: 0, duurOnbekend: 0, toename: 0, nieuweConstraints: 0, runs: [] };
}
function voegTobeToe(x, r) {
  x.records++;
  if (r.recordtype === 'wijziging') x.wijzigingen++;
  if (r.recordtype === 'correctie') x.correcties++;
  for (const a of r.acties) {
    if (a.object === 'niet_opgelost' || !x.acties[a.object] || !(a.soort in x.acties[a.object])) continue;
    x.acties[a.object][a.soort] += a.aantal || 0;
    x.actiesTotaal += a.aantal || 0;
  }
  const d = duurMinuten(r);
  if (d === null) x.duurOnbekend++; else x.duur += d;
  if (r.gevolg) { x.toename += toenameVan(r.gevolg); x.nieuweConstraints += r.gevolg.nieuw.length; }
  x.runs.push(r.run);
}
/* Records met meerdere requirements tellen bij elk requirement mee; "totaal" telt elk record één keer. */
function overzichtTobe(recs, reqLijst) {
  const per = new Map(reqLijst.map(q => [q, tobeRij()]));
  const zonder = tobeRij(), totaal = tobeRij();
  for (const r of recs) {
    if (r.tobeRequirements.length) {
      for (const q of r.tobeRequirements) {
        if (!per.has(q)) per.set(q, tobeRij());
        voegTobeToe(per.get(q), r);
      }
    } else voegTobeToe(zonder, r);
    voegTobeToe(totaal, r);
  }
  return { per, zonder, totaal };
}
