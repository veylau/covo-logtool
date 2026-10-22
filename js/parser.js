'use strict';
/*
 * Leest de tekstoutput van de COVO-Validator.
 * Robuust geschreven: ontbrekende of afwijkende regels worden overgeslagen
 * en leveren een waarschuwing op in plaats van een fout.
 * Verhoog PARSER_VERSIE bij elke inhoudelijke wijziging aan de parser.
 */
const PARSER_VERSIE = 1;

function parseValidatorOutput(tekst) {
  const res = {
    parserVersie: PARSER_VERSIE,
    herkend: false,
    aantalRapporten: 0,
    status: null,
    modus: null,
    selectie: { views: null, elements: null, horizontal: null, vertical: null },
    samenvatting: {},
    samenvattingAfgeleid: false,
    secties: [],
    duurMs: null,
    waarschuwingen: []
  };
  if (!tekst || !tekst.trim()) return res;

  const regels = tekst.replace(/\r\n?/g, '\n').split('\n');
  res.aantalRapporten = (tekst.match(/COVO VALIDATION REPORT/gi) || []).length;

  let fase = null;      // 'selectie' | 'samenvatting' | null
  let sectie = null;    // huidige sectie (globaal / view)
  let blok = null;      // huidig [!!]-blok
  let inKop = false;    // tussen twee ====-lijnen
  let rapporten = 0;
  const nieuweSectie = () => {
    sectie = { soort: 'overig', titel: '', view: null, aantal: null, type: null, pad: null, blokken: [] };
    res.secties.push(sectie);
  };

  for (const ruw of regels) {
    const r = ruw.trim();
    let m;

    if (/COVO VALIDATION REPORT/i.test(r)) {
      if (++rapporten > 1) break; // alleen het eerste rapport lezen
      continue;
    }
    if (/^#{5,}$/.test(r)) continue;

    if (/^={5,}$/.test(r)) {
      if (inKop) inKop = false;
      else { inKop = true; fase = null; blok = null; nieuweSectie(); }
      continue;
    }

    if ((m = r.match(/^\[!!\]\s*([A-Za-z]+\d+)\s*[-–:]\s*(.*?)\s*:?\s*$/))) {
      inKop = false; fase = null;
      if (!sectie) nieuweSectie();
      blok = { code: m[1].toUpperCase(), titel: m[2], items: [], meer: 0 };
      sectie.blokken.push(blok);
      continue;
    }

    if (inKop) {
      if (!r) continue;
      if ((m = r.match(/^VIEW:\s*(.*?)\s*\((\d+)\s+violations?\)\s*$/i))) {
        sectie.soort = 'view'; sectie.view = m[1]; sectie.aantal = +m[2]; sectie.titel = r;
      } else if ((m = r.match(/^VIEW:\s*(.*)$/i))) {
        sectie.soort = 'view'; sectie.view = m[1]; sectie.titel = r;
      } else if ((m = r.match(/^Type:\s*(.*)$/i))) {
        sectie.type = m[1];
      } else if ((m = r.match(/^Path:\s*(.*)$/i))) {
        sectie.pad = m[1];
      } else {
        if (/GLOBAL/i.test(r)) sectie.soort = 'globaal';
        if (!sectie.titel) sectie.titel = r;
      }
      continue;
    }

    if ((m = r.match(/^OVERALL STATUS:\s*([A-Za-z]+)/i))) { res.status = m[1].toUpperCase(); fase = null; continue; }
    if (/^SELECTION:?$/i.test(r)) { fase = 'selectie'; blok = null; continue; }
    if (/^VIOLATION SUMMARY:?$/i.test(r)) { fase = 'samenvatting'; blok = null; continue; }
    if ((m = r.match(/Validation completed in\s+(\d+)\s*ms/i))) { res.duurMs = +m[1]; fase = null; blok = null; continue; }
    if (!r) { blok = null; continue; }

    if (fase === 'selectie') {
      if ((m = r.match(/^-\s*(CONSTRUCTION|AUDIT)\s+mode/i))) res.modus = m[1].toLowerCase();
      else if ((m = r.match(/^-\s*(\d+)\s+views?\b/i))) res.selectie.views = +m[1];
      else if ((m = r.match(/^-\s*(\d+)\s+elements?\b/i))) res.selectie.elements = +m[1];
      else if ((m = r.match(/^-\s*(\d+)\s+horizontal\s+relationships?\b/i))) res.selectie.horizontal = +m[1];
      else if ((m = r.match(/^-\s*(\d+)\s+vertical\s+relationships?\b/i))) res.selectie.vertical = +m[1];
      continue;
    }
    if (fase === 'samenvatting') {
      if ((m = r.match(/^-\s*([A-Za-z]+\d+)\s*:\s*(\d+)\s+violations?/i))) res.samenvatting[m[1].toUpperCase()] = +m[2];
      continue;
    }
    if (blok) {
      if ((m = r.match(/^-\s*\.\.\.\s*and\s+(\d+)\s+more/i))) blok.meer = +m[1];
      else if ((m = r.match(/^-\s*(.+)$/))) blok.items.push(m[1]);
    }
  }

  res.herkend = rapporten > 0 || res.status !== null;
  if (!res.modus) {
    const m = tekst.match(/\b(CONSTRUCTION|AUDIT)\s+mode\b/i);
    if (m) res.modus = m[1].toLowerCase();
  }

  // Controle: aantallen uit de samenvatting tegenover wat de blokken tonen.
  const uitBlokken = {};
  for (const s of res.secties) for (const b of s.blokken) {
    uitBlokken[b.code] = (uitBlokken[b.code] || 0) + b.items.length + b.meer;
  }
  const w = res.waarschuwingen;
  if (!res.herkend) w.push('Geen COVO-rapport herkend in de tekst.');
  if (res.aantalRapporten > 1) w.push(`De tekst bevat ${res.aantalRapporten} rapporten; alleen het eerste is gelezen.`);
  if (res.herkend && !res.status) w.push('OVERALL STATUS niet gevonden.');
  if (res.herkend && !res.modus) w.push('Modus (CONSTRUCTION/AUDIT) niet gevonden.');
  if (!Object.keys(res.samenvatting).length && Object.keys(uitBlokken).length) {
    res.samenvatting = { ...uitBlokken };
    res.samenvattingAfgeleid = true;
    w.push('Geen VIOLATION SUMMARY gevonden; aantallen afgeleid uit de meldingsblokken.');
  } else {
    for (const code of Object.keys(res.samenvatting)) {
      if (!(code in uitBlokken)) w.push(`${code} staat in de samenvatting, maar er is geen meldingsblok gevonden.`);
      else if (uitBlokken[code] !== res.samenvatting[code]) w.push(`${code}: samenvatting telt ${res.samenvatting[code]}, de blokken samen ${uitBlokken[code]}.`);
    }
    for (const code of Object.keys(uitBlokken)) {
      if (!(code in res.samenvatting)) w.push(`${code} heeft een meldingsblok, maar staat niet in de samenvatting.`);
    }
  }
  const totaal = Object.values(res.samenvatting).reduce((a, b) => a + b, 0);
  if (res.status === 'FAILED' && totaal === 0) w.push('Status FAILED, maar geen meldingen gevonden.');
  if (res.status === 'PASSED' && totaal > 0) w.push('Status PASSED, maar er zijn meldingen gevonden.');
  return res;
}

/* Alle (unieke) meldingen van één constraint, over alle secties heen. */
function meldingenVoor(p, code) {
  const items = [], gezien = new Set();
  let titel = null;
  for (const s of (p && p.secties) || []) for (const b of s.blokken) {
    if (b.code !== code) continue;
    if (titel === null) titel = b.titel;
    for (const it of b.items) if (!gezien.has(it)) { gezien.add(it); items.push(it); }
  }
  return { titel, items, totaal: p && p.samenvatting[code] != null ? p.samenvatting[code] : null };
}

if (typeof module !== 'undefined') module.exports = { parseValidatorOutput, meldingenVoor, PARSER_VERSIE };
