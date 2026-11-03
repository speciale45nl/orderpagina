// Pushmeldingen voor de orderpagina van Spéciale45.
// Draait als Cloud Functions (2e generatie) op Firestore-wijzigingen en stuurt via Firebase Cloud Messaging
// een melding naar de telefoons die zich in de app hebben aangemeld (collectie `tokens`, één document per telefoon, met de rol).
//
// Regels:
// - de interieurspecialist ziet nooit kenteken, meldcode of model: die krijgt alleen de klantnaam en het werk;
// - 1stop en Spéciale45 krijgen kenteken (of meldcode) + model + klant;
// - geen foto's of andere privégegevens in een melding.
'use strict';
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'europe-west4', maxInstances: 3, memory: '256MiB', timeoutSeconds: 60 });
const db = admin.firestore();

const SITE = 'https://speciale45nl.github.io/orderpagina/';
const ROLLEN = ['1stop', 'Interieurspecialist', 'Spéciale45'];
const MND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sept', 'okt', 'nov', 'dec'];
const fmtD = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${+m[3]} ${MND[+m[2] - 1]}` : ''; };
const minDagen = (iso, n) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return ''; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const kort = (s, n = 110) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// Hoe de auto in een melding heet, per rol
function autoTekst(o, rol) {
  if (rol === 'Interieurspecialist') return o.klant || ('order ' + (o.nummer || ''));
  const auto = o.kenteken || (o.meldcode ? 'meldcode ' + o.meldcode : '');
  return [auto, o.model, o.klant].filter(Boolean).join(' · ') || ('order ' + (o.nummer || ''));
}
// Datum waar deze rol op werkt: de interieurset moet 3 dagen vóór de klaar-vóór-datum van 1stop binnen zijn
function deadlineTekst(o, rol) {
  if (!o.deadline) return '';
  if (rol === 'Interieurspecialist') { const d = o.type === 'los' ? o.deadline : minDagen(o.deadline, 3); return d ? 'bij 1stop vóór ' + fmtD(d) : ''; }
  return 'klaar vóór ' + fmtD(o.deadline);
}
const rollenMetWerk = o => [...new Set((o.stappen || []).map(s => s.wie).filter(r => ROLLEN.includes(r)))];

// Eén melding naar alle telefoons van een rol. Ongeldige tokens (app verwijderd) worden opgeruimd.
async function stuur(rol, m) {
  if (!ROLLEN.includes(rol)) return;
  const snap = await db.collection('tokens').where('rol', '==', rol).get();
  const tokens = snap.docs.map(d => d.id);
  if (!tokens.length) { logger.info('geen telefoons voor ' + rol); return; }
  const link = SITE + (m.nr ? '#' + m.nr : '');
  const title = kort(m.title, 70), body = kort(m.body, 140);
  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: { nr: String(m.nr || ''), link },
    webpush: {
      headers: { Urgency: 'high', TTL: '86400' },
      notification: { title, body, icon: SITE + 'icon-192.png', badge: SITE + 'icon-192.png', tag: m.tag || ('s45-' + (m.nr || 'x')), renotify: true, data: { link } },
      fcmOptions: { link },
    },
  });
  const weg = [];
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = (r.error && r.error.code) || '';
    logger.warn('melding mislukt', { rol, code });
    if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) weg.push(tokens[i]);
  });
  await Promise.all(weg.map(t => db.doc('tokens/' + t).delete().catch(() => {})));
  logger.info(`melding "${title}" → ${rol}: ${res.successCount} ok, ${res.failureCount} mislukt`);
}

// 1. Nieuwe order → iedereen die er werk aan heeft, en altijd Spéciale45
async function nieuweOrder(ev) {
  const o = ev.data && ev.data.data(); if (!o) return;
  const nr = ev.params.nr;
  const rollen = new Set(['Spéciale45', ...rollenMetWerk(o)]);
  for (const rol of rollen) {
    const los = o.type === 'los';
    const werk = rol === 'Interieurspecialist' ? (o.opdracht && o.opdracht.interieur || []) : (o.opdracht && o.opdracht.spuitwerk || []);
    const titel = rol === 'Interieurspecialist' ? (los ? 'Nieuwe interieurbestelling' : 'Nieuwe interieurset') : (los ? 'Nieuwe losse klus' : 'Nieuwe order');
    const body = [autoTekst(o, rol), werk.length ? kort(werk.join(', '), 60) : '', deadlineTekst(o, rol)].filter(Boolean).join(' · ');
    await stuur(rol, { nr, tag: 'nieuw-' + nr, title: titel, body });
  }
}

// 2. Wijziging op een order (nieuwe regel in `wijzigingen`, of een andere datum) → de rollen voor wie het is
async function orderGewijzigd(ev) {
  const b = ev.data.before.data() || {}, a = ev.data.after.data() || {};
  const nr = ev.params.nr;
  const oud = new Set((b.wijzigingen || []).map(w => w.id));
  const nieuw = (a.wijzigingen || []).filter(w => !oud.has(w.id));
  const perRol = {};
  nieuw.forEach(w => (w.voor || ['1stop', 'Interieurspecialist']).forEach(r => { (perRol[r] = perRol[r] || []).push(w.tekst); }));
  for (const [rol, teksten] of Object.entries(perRol)) {
    await stuur(rol, { nr, tag: 'wijz-' + nr, title: 'Gewijzigd · ' + autoTekst(a, rol), body: teksten.join(' · ') });
  }
  if (a.deadline && a.deadline !== b.deadline && !nieuw.length) {
    for (const rol of rollenMetWerk(a).filter(r => r !== 'Spéciale45')) {
      await stuur(rol, { nr, tag: 'datum-' + nr, title: 'Andere datum · ' + autoTekst(a, rol), body: deadlineTekst(a, rol) });
    }
  }
}

// 3. Vinkje gezet → als daarmee een hele stap klaar is: wie daarop wachtte krijgt een seintje, en Spéciale45 bij de mijlpalen
async function stapKlaar(ev) {
  const na = ev.data.after.exists ? ev.data.after.data() : null;
  const voor = ev.data.before.exists ? ev.data.before.data() : null;
  if (!na || !na.done || (voor && voor.done)) return; // alleen een nieuw gezet vinkje
  const item = ev.params.item, nr = ev.params.nr;
  if (item.startsWith('w-')) return; // "gezien"-vinkjes bij wijzigingen
  const oSnap = await db.doc('orders/' + nr).get(); if (!oSnap.exists) return;
  const o = oSnap.data();
  const stap = (o.stappen || []).find(s => (s.items || []).some(i => i.id === item)); if (!stap) return;
  const cs = await db.collection('orders/' + nr + '/checks').get(); const m = {}; cs.docs.forEach(d => { m[d.id] = d.data(); });
  const klaar = s => (s.items || []).length > 0 && (s.items || []).every(i => m[i.id] && m[i.id].done);
  if (!klaar(stap)) return; // stap nog niet helemaal af
  const door = stap.wie || '';
  // wie zat op deze stap te wachten?
  const wachters = {};
  (o.stappen || []).forEach(s => { if ((s.vereistStappen || []).includes(stap.id) && s.wie && s.wie !== door) (wachters[s.wie] = wachters[s.wie] || []).push(s.titel); });
  const kop = { klaar: '✓ Klaar bij 1stop', interieur: 'Interieurset verstuurd', 'aflevering-regelen': 'Aflevering geregeld' }[stap.id] || 'Je kunt verder';
  for (const [rol, titels] of Object.entries(wachters)) {
    await stuur(rol, { nr, tag: 'verder-' + nr, title: kop + ' · ' + autoTekst(o, rol), body: `${stap.titel} is klaar (${door}) → nu: ${titels.join(', ')}` });
  }
  if (door !== 'Spéciale45' && !wachters['Spéciale45']) { // mijlpalen voor Spéciale45
    const mijlpaal = { klaar: '✓ Klaar bij 1stop', afleveren: 'Afgeleverd', interieur: 'Interieurset verstuurd', 'voorkap-los': 'Voorkap is los' }[stap.id];
    if (mijlpaal) await stuur('Spéciale45', { nr, tag: 'stap-' + nr, title: mijlpaal + ' · ' + autoTekst(o, 'Spéciale45'), body: `${stap.titel} afgevinkt door ${door}` });
  }
}

// 4. Opmerking of probleem in het logboek → Spéciale45; een bericht van Spéciale45 → wie er werk aan heeft
async function opmerking(ev) {
  const e = ev.data.after.data(); if (!e || !e.tekst) return;
  const nr = ev.params.nr;
  const oSnap = await db.doc('orders/' + nr).get(); if (!oSnap.exists) return;
  const o = oSnap.data(); const van = e.rol || '';
  if (e.probleem) { await stuur('Spéciale45', { nr, tag: 'prob-' + nr, title: '⚠ Probleem · ' + autoTekst(o, 'Spéciale45'), body: (van ? van + ': ' : '') + e.tekst }); return; }
  if (van === 'Spéciale45') {
    for (const rol of rollenMetWerk(o).filter(r => r !== 'Spéciale45')) await stuur(rol, { nr, tag: 'opm-' + nr, title: 'Bericht van Spéciale45 · ' + autoTekst(o, rol), body: e.tekst });
  } else {
    await stuur('Spéciale45', { nr, tag: 'opm-' + nr, title: 'Opmerking ' + (van || 'werkplaats') + ' · ' + autoTekst(o, 'Spéciale45'), body: e.tekst });
  }
}

// 5. Probleem opgelost → wie het meldde
async function probleemOpgelost(ev) {
  const b = ev.data.before.data() || {}, a = ev.data.after.data() || {};
  if (!a.probleem || !a.opgelost || b.opgelost) return;
  const nr = ev.params.nr; const rol = a.rol; if (!ROLLEN.includes(rol) || rol === 'Spéciale45') return;
  const oSnap = await db.doc('orders/' + nr).get(); if (!oSnap.exists) return;
  await stuur(rol, { nr, tag: 'prob-' + nr, title: 'Probleem opgelost · ' + autoTekst(oSnap.data(), rol), body: a.tekst });
}

// Twee triggers: alles op een order, en alles in de subcollecties (checks, log)
exports.orderEvent = onDocumentWritten('orders/{nr}', async ev => {
  const voor = ev.data.before.exists, na = ev.data.after.exists;
  if (!na) return; // verwijderd
  if (!voor) return nieuweOrder({ params: ev.params, data: ev.data.after });
  return orderGewijzigd(ev);
});
exports.subEvent = onDocumentWritten('orders/{nr}/{sub}/{id}', async ev => {
  if (!ev.data.after.exists) return;
  if (ev.params.sub === 'checks') return stapKlaar({ params: { nr: ev.params.nr, item: ev.params.id }, data: ev.data });
  if (ev.params.sub === 'log') return ev.data.before.exists ? probleemOpgelost(ev) : opmerking(ev);
});
