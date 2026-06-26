/**
 * Dessert House — Google Apps Script booking backend
 *
 * Paste this into your Google Sheet:
 *   Extensions → Apps Script → replace Code.gs with this file
 *
 * Then deploy:
 *   Deploy → New deployment → Type: Web app
 *   - Execute as: Me
 *   - Who has access: Anyone
 *   - Copy the deployed Web App URL
 *   - Paste it into /assets/data.js → CONFIG.bookingApi
 *
 * Sheet schema (Apps Script creates the sheets on first run):
 *   - "Bookings": Ref | Created | Date | Time | Party | Name | Phone | Email | Notes | Status | Source
 *   - "Closed":   Date | Reason          (override days that are closed)
 *   - "Config":   Key | Value            (TABLES_PER_SLOT, SLOT_MINUTES, OPEN_HOUR, CLOSE_HOUR, LAST_BOOKING_OFFSET_MIN)
 */

const SHEET_BOOKINGS = 'Bookings';
const SHEET_CLOSED   = 'Closed';
const SHEET_CONFIG   = 'Config';

const DEFAULT_CONFIG = {
  TABLES_PER_SLOT: 5,           // max bookings per 30-min slot
  SLOT_MINUTES: 30,
  OPEN_HOUR: 15,                // 15 = 3pm
  CLOSE_HOUR: 23,               // 23 = 11pm
  LAST_BOOKING_OFFSET_MIN: 30,  // last bookable slot 30 min before close (= 10:30pm)
  MAX_PARTY: 8,                 // 9+ goes through phone confirmation
};

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';
    if (action === 'availability') {
      const date = e.parameter.date;
      const party = e.parameter.party;
      return json({ slots: getAvailability(date, party) });
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
    if (body.action === 'book') {
      return json(createBooking(body));
    }
    return json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) });
  }
}

/* ============= AVAILABILITY ============= */
function getAvailability(dateStr, party) {
  if (!dateStr) throw new Error('Date is required.');
  const cfg = getConfig();

  /* Closed day? */
  const closed = isClosed(dateStr);
  if (closed) return [];

  /* Pull all bookings for that date */
  const sheet = getSheet(SHEET_BOOKINGS);
  const rows = sheet.getDataRange().getValues();
  const header = rows.shift() || [];
  const idx = headerIndex(header);
  const countByTime = {};
  rows.forEach(r => {
    if (!r[idx.Date] || !r[idx.Time]) return;
    if ((r[idx.Status] || 'Confirmed').toString().toLowerCase() === 'cancelled') return;
    const d = formatDate(r[idx.Date]);
    if (d !== dateStr) return;
    countByTime[r[idx.Time]] = (countByTime[r[idx.Time]] || 0) + 1;
  });

  /* Generate slots */
  const slots = [];
  const isToday = isSameDay(new Date(), new Date(dateStr + 'T00:00:00'));
  const now = new Date();
  const lastBookable = cfg.CLOSE_HOUR * 60 - cfg.LAST_BOOKING_OFFSET_MIN;
  for (let mins = cfg.OPEN_HOUR * 60; mins <= lastBookable; mins += cfg.SLOT_MINUTES) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const time = formatTime(h, m);
    /* Hide slots in the past for today */
    if (isToday && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes() + 15))) continue;
    const used = countByTime[time] || 0;
    const left = Math.max(0, cfg.TABLES_PER_SLOT - used);
    slots.push({ time: time, capacityLeft: left, full: left === 0 });
  }
  return slots;
}

/* ============= BOOKING ============= */
function createBooking(b) {
  /* Validate */
  ['date','time','party_size','name','phone','email'].forEach(k => {
    if (!b[k]) throw new Error('Missing field: ' + k);
  });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) throw new Error('Invalid email.');

  const cfg = getConfig();
  if (isClosed(b.date)) throw new Error('We are closed on that date.');

  /* Re-check capacity (race safety) */
  const slots = getAvailability(b.date, b.party_size);
  const slot = slots.find(s => s.time === b.time);
  if (!slot || slot.full) throw new Error('That time just filled up — please pick another.');

  /* Append row */
  const sheet = getSheet(SHEET_BOOKINGS);
  const ref = generateRef();
  sheet.appendRow([
    ref,
    new Date(),
    b.date,
    b.time,
    String(b.party_size),
    String(b.name).slice(0, 80),
    String(b.phone).slice(0, 40),
    String(b.email).slice(0, 120),
    String(b.notes || '').slice(0, 500),
    'Pending',
    String(b.source || 'web').slice(0, 40),
  ]);

  /* Email the shop */
  try {
    const to = getConfigValue('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail();
    if (to) {
      MailApp.sendEmail({
        to: to,
        subject: `New booking ${ref} — ${b.date} ${b.time}`,
        body: [
          `Reference: ${ref}`,
          `When: ${b.date} at ${b.time}`,
          `Party: ${b.party_size}`,
          `Name: ${b.name}`,
          `Phone: ${b.phone}`,
          `Email: ${b.email}`,
          `Notes: ${b.notes || '—'}`,
          ``,
          `Open the Bookings sheet to confirm.`,
        ].join('\n'),
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
  if (name === SHEET_BOOKINGS) {
    sh.appendRow(['Ref','Created','Date','Time','Party','Name','Phone','Email','Notes','Status','Source']);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,11).setFontWeight('bold');
  } else if (name === SHEET_CLOSED) {
    sh.appendRow(['Date','Reason']);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,2).setFontWeight('bold');
  } else if (name === SHEET_CONFIG) {
    sh.appendRow(['Key','Value']);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,2).setFontWeight('bold');
    /* Seed defaults */
    Object.keys(DEFAULT_CONFIG).forEach(k => sh.appendRow([k, DEFAULT_CONFIG[k]]));
    sh.appendRow(['NOTIFY_EMAIL', '']);  // optional — leave blank to use script owner's email
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
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseBody(e) {
  if (!e || !e.postData) return {};
  const raw = e.postData.contents || '';
  try { return JSON.parse(raw); }
  catch (err) { return {}; }
}

function formatDate(d) {
  if (d instanceof Date) {
    const pad = n => String(n).padStart(2,'0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
  }
  return String(d).slice(0,10);
}

function formatTime(h, m) {
  const ampm = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 === 0 ? 12 : h % 12;
  const mm = m === 0 ? '00' : String(m).padStart(2,'0');
  return `${hh}:${mm} ${ampm}`;
}

function isSameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

function headerIndex(header) {
  const out = {};
  header.forEach((h,i) => out[h] = i);
  return out;
}

function generateRef() {
  const chars = 'ACDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random()*chars.length)];
  return 'DH-' + s;
}
