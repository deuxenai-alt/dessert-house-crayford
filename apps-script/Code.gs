/**
 * Dessert House — Google Apps Script TAKEAWAY ORDERING backend
 *
 * Paste this into your Google Sheet:
 *   Extensions → Apps Script → replace Code.gs with this whole file → Save
 *
 * Then deploy:
 *   Deploy → New deployment → Type: Web app
 *   - Execute as: Me
 *   - Who has access: Anyone
 *   - Copy the deployed Web App URL (ends in /exec)
 *   - Paste it into /assets/data.js → CONFIG.bookingApi
 *
 * Sheets (created automatically on first run):
 *   - "Orders":  Ref | Created | Collection Date | Collection Time | Items |
 *                Item Count | Subtotal | Discount | Total | Name | Phone |
 *                Email | Notes | Status | Source
 *   - "Closed":  Date | Reason            (days you're shut)
 *   - "Config":  Key | Value              (settings below)
 */

const SHEET_ORDERS = 'Orders';
const SHEET_CLOSED = 'Closed';
const SHEET_CONFIG = 'Config';

const DEFAULT_CONFIG = {
  ORDERS_PER_SLOT: 8,           // max orders per collection time slot
  SLOT_MINUTES: 30,             // collection slot length
  OPEN_HOUR: 15,                // 15 = 3pm
  CLOSE_HOUR: 23,               // 23 = 11pm
  LAST_BOOKING_OFFSET_MIN: 30,  // last collection slot 30 min before close (10:30pm)
};

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';
    if (action === 'availability') {
      return json({ slots: getAvailability(e.parameter.date) });
    }
    if (action === 'ping') return json({ ok: true, time: new Date().toISOString() });
    return json({ error: 'Unknown action' });
  } catch (err) {
    return json({ error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = parseBody(e);
    if (body.action === 'order' || body.action === 'book') {
      return json(createOrder(body));
    }
    return json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) });
  }
}

/* ============= COLLECTION SLOTS ============= */
function getAvailability(dateStr) {
  if (!dateStr) throw new Error('Date is required.');
  const cfg = getConfig();
  if (isClosed(dateStr)) return [];

  /* Count orders already placed for each collection time on that date */
  const sheet = getSheet(SHEET_ORDERS);
  const rows = sheet.getDataRange().getValues();
  const header = rows.shift() || [];
  const idx = headerIndex(header);
  const countByTime = {};
  rows.forEach(r => {
    if (!r[idx['Collection Date']] || !r[idx['Collection Time']]) return;
    if ((r[idx.Status] || '').toString().toLowerCase() === 'cancelled') return;
    if (formatDate(r[idx['Collection Date']]) !== dateStr) return;
    const t = r[idx['Collection Time']];
    countByTime[t] = (countByTime[t] || 0) + 1;
  });

  const slots = [];
  const isToday = isSameDay(new Date(), new Date(dateStr + 'T00:00:00'));
  const now = new Date();
  const lastBookable = cfg.CLOSE_HOUR * 60 - cfg.LAST_BOOKING_OFFSET_MIN;
  for (let mins = cfg.OPEN_HOUR * 60; mins <= lastBookable; mins += cfg.SLOT_MINUTES) {
    const h = Math.floor(mins / 60), m = mins % 60;
    const time = formatTime(h, m);
    /* Hide already-passed slots for same-day collection (+15 min lead time) */
    if (isToday && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes() + 15))) continue;
    const used = countByTime[time] || 0;
    const left = Math.max(0, cfg.ORDERS_PER_SLOT - used);
    slots.push({ time: time, capacityLeft: left, full: left === 0 });
  }
  return slots;
}

/* ============= CREATE ORDER ============= */
function createOrder(b) {
  ['collection_date', 'collection_time', 'name', 'phone', 'email'].forEach(k => {
    if (!b[k]) throw new Error('Missing field: ' + k);
  });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) throw new Error('Invalid email.');
  const items = Array.isArray(b.items) ? b.items : [];
  if (items.length === 0) throw new Error('Your basket is empty.');

  if (isClosed(b.collection_date)) throw new Error('We are closed on that date.');

  /* Re-check the slot still has capacity (prevents overbooking a time) */
  const slots = getAvailability(b.collection_date);
  const slot = slots.find(s => s.time === b.collection_time);
  if (!slot || slot.full) throw new Error('That collection time just filled up — please pick another.');

  /* Human-readable item list for the sheet + email */
  const itemsText = items.map(it =>
    `${it.qty}× ${it.name} (${money(it.line != null ? it.line : (it.price || 0) * (it.qty || 1))})`
  ).join('\n');

  const sheet = getSheet(SHEET_ORDERS);
  const ref = generateRef();
  sheet.appendRow([
    ref,
    new Date(),
    b.collection_date,
    b.collection_time,
    itemsText,
    Number(b.item_count || items.reduce((s, it) => s + (it.qty || 0), 0)),
    Number(b.subtotal || 0),
    Number(b.discount || 0),
    Number(b.total || 0),
    String(b.name).slice(0, 80),
    String(b.phone).slice(0, 40),
    String(b.email).slice(0, 120),
    String(b.notes || '').slice(0, 500),
    'New',
    String(b.source || 'web').slice(0, 40),
  ]);

  /* Email the shop the full order */
  try {
    const to = getConfigValue('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail();
    if (to) {
      MailApp.sendEmail({
        to: to,
        subject: `New order ${ref} — collect ${b.collection_date} ${b.collection_time} — ${money(b.total)}`,
        body: [
          `Order: ${ref}`,
          `Collection: ${b.collection_date} at ${b.collection_time}`,
          ``,
          itemsText,
          ``,
          `Subtotal: ${money(b.subtotal)}`,
          (Number(b.discount) > 0 ? `Discount: -${money(b.discount)}` : ''),
          `TOTAL (pay on collection): ${money(b.total)}`,
          ``,
          `Name:  ${b.name}`,
          `Phone: ${b.phone}`,
          `Email: ${b.email}`,
          `Notes: ${b.notes || '—'}`,
          ``,
          `Open the Orders sheet to mark it Confirmed when ready.`,
        ].filter(String).join('\n'),
      });
    }
  } catch (err) { /* email is best-effort */ }

  return { ok: true, ref: ref };
}

/* ============= SHEET BOOTSTRAP ============= */
function getSheet(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (sh) return sh;
  sh = ss.insertSheet(name);
  if (name === SHEET_ORDERS) {
    sh.appendRow(['Ref','Created','Collection Date','Collection Time','Items','Item Count','Subtotal','Discount','Total','Name','Phone','Email','Notes','Status','Source']);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,15).setFontWeight('bold');
  } else if (name === SHEET_CLOSED) {
    sh.appendRow(['Date','Reason']);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,2).setFontWeight('bold');
  } else if (name === SHEET_CONFIG) {
    sh.appendRow(['Key','Value']);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,2).setFontWeight('bold');
    Object.keys(DEFAULT_CONFIG).forEach(k => sh.appendRow([k, DEFAULT_CONFIG[k]]));
    sh.appendRow(['NOTIFY_EMAIL', '']);  // blank = email the script owner
  }
  return sh;
}

function getConfig() {
  const sh = getSheet(SHEET_CONFIG);
  const rows = sh.getDataRange().getValues();
  rows.shift();
  const cfg = Object.assign({}, DEFAULT_CONFIG);
  rows.forEach(r => {
    if (!r[0]) return;
    const k = String(r[0]).trim();
    if (k in DEFAULT_CONFIG) cfg[k] = Number(r[1]) || DEFAULT_CONFIG[k];
  });
  return cfg;
}

function getConfigValue(key) {
  const sh = getSheet(SHEET_CONFIG);
  const rows = sh.getDataRange().getValues();
  rows.shift();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) return rows[i][1];
  }
  return null;
}

function isClosed(dateStr) {
  const sh = getSheet(SHEET_CLOSED);
  const rows = sh.getDataRange().getValues();
  rows.shift();
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    if (formatDate(rows[i][0]) === dateStr) return true;
  }
  return false;
}

/* ============= UTILITIES ============= */
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function parseBody(e) {
  if (!e || !e.postData) return {};
  try { return JSON.parse(e.postData.contents || ''); }
  catch (err) { return {}; }
}

function money(n) { return '£' + (Math.round(Number(n) * 100) / 100).toFixed(2); }

function formatDate(d) {
  if (d instanceof Date) {
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  return String(d).slice(0, 10);
}

function formatTime(h, m) {
  const ampm = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 === 0 ? 12 : h % 12;
  const mm = m === 0 ? '00' : String(m).padStart(2, '0');
  return `${hh}:${mm} ${ampm}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function headerIndex(header) {
  const out = {};
  header.forEach((h, i) => out[h] = i);
  return out;
}

function generateRef() {
  const chars = 'ACDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'DH-' + s;
}
