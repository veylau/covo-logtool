'use strict';
/*
 * Opslag via de File System Access API.
 * - De gekozen map wordt als handle in IndexedDB onthouden (niet de gegevens zelf).
 * - log.json bevat alles; per dag één log.backup-<datum>.json met de toestand
 *   van vóór de eerste wijziging van die dag.
 * - Screenshots in de submap screenshots/.
 */
const Opslag = (() => {
  const DB = 'covo-logtool', ST = 'kv';

  function db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idb(modus, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction(ST, modus);
      const req = fn(tx.objectStore(ST));
      tx.oncomplete = () => res(req.result);
      tx.onerror = () => rej(tx.error);
    });
  }

  const haalBewaardeMap = () => idb('readonly', s => s.get('map'));
  const onthoudMap = h => idb('readwrite', s => s.put(h, 'map'));
  const kiesMap = () => window.showDirectoryPicker({ id: 'covo-logtool', mode: 'readwrite' });

  async function toestemming(h, vraag) {
    if (typeof h.queryPermission !== 'function') return true;
    const o = { mode: 'readwrite' };
    if ((await h.queryPermission(o)) === 'granted') return true;
    if (vraag) return (await h.requestPermission(o)) === 'granted';
    return false;
  }

  async function bestaat(dir, naam) {
    try { await dir.getFileHandle(naam); return true; }
    catch (e) {
      if (e.name === 'NotFoundError') return false;
      if (e.name === 'TypeMismatchError') return true; // map met die naam
      throw e;
    }
  }
  async function leesTekst(dir, naam) {
    try { return await (await (await dir.getFileHandle(naam)).getFile()).text(); }
    catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
  }
  async function schrijf(dir, naam, inhoud) {
    const fh = await dir.getFileHandle(naam, { create: true });
    const w = await fh.createWritable();
    await w.write(inhoud);
    await w.close();
  }

  /* Schrijfopdrachten na elkaar uitvoeren, nooit tegelijk. */
  let rij = Promise.resolve();
  function schrijfLog(map, data) {
    const json = JSON.stringify(data, null, 2);
    const taak = rij.catch(() => {}).then(async () => {
      const backup = `log.backup-${vandaag()}.json`;
      if (!(await bestaat(map, backup))) {
        const oud = await leesTekst(map, 'log.json');
        if (oud !== null) await schrijf(map, backup, oud);
      }
      await schrijf(map, 'log.json', json);
    });
    rij = taak;
    return taak;
  }

  /* ---------- screenshots ---------- */
  const shotsMap = map => map.getDirectoryHandle('screenshots', { create: true });
  async function uniekeNaam(dir, basis) {
    let naam = `${basis}.png`, i = 2;
    while (await bestaat(dir, naam)) naam = `${basis}_${i++}.png`;
    return naam;
  }
  async function naarPng(blob) {
    if (blob.type === 'image/png') return blob;
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Omzetten naar PNG mislukt.'))), 'image/png'));
  }
  async function bewaarScreenshot(map, blob, basis) {
    const dir = await shotsMap(map);
    const png = await naarPng(blob);
    const naam = await uniekeNaam(dir, basis);
    await schrijf(dir, naam, png);
    return naam;
  }
  const urlCache = new Map();
  async function screenshotUrl(map, naam) {
    if (urlCache.has(naam)) return urlCache.get(naam);
    try {
      const dir = await shotsMap(map);
      const f = await (await dir.getFileHandle(naam)).getFile();
      const u = URL.createObjectURL(f);
      urlCache.set(naam, u);
      return u;
    } catch (e) { return null; }
  }
  /* Hernoemen = kopiëren naar een nieuwe unieke naam + oude verwijderen. */
  async function hernoemScreenshot(map, oud, basis) {
    const dir = await shotsMap(map);
    const inhoud = await (await (await dir.getFileHandle(oud)).getFile()).arrayBuffer();
    const naam = await uniekeNaam(dir, basis);
    await schrijf(dir, naam, inhoud);
    await dir.removeEntry(oud);
    if (urlCache.has(oud)) { URL.revokeObjectURL(urlCache.get(oud)); urlCache.delete(oud); }
    return naam;
  }

  return { haalBewaardeMap, onthoudMap, kiesMap, toestemming, leesTekst, schrijfLog, bewaarScreenshot, screenshotUrl, hernoemScreenshot };
})();
