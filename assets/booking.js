/* =========================================================
   Booking flow — 3 steps:
   1. Date + party size
   2. Pick an available time slot (fetched from Apps Script)
   3. Contact details → POST booking → confirmation
   ========================================================= */
(function(){
  if (!document.body.dataset || document.body.dataset.page !== 'book') return;

  const state = {
    date: '',
    party: '',
    slot: null,         // { time, capacityLeft }
    name: '', phone: '', email: '', notes: '',
    step: 1,
  };

  /* DOM */
  const root = document.getElementById('book-root');

  /* Boundaries */
  const today = new Date(); today.setHours(0,0,0,0);
  const pad = n => String(n).padStart(2,'0');
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const max = new Date(today); max.setDate(max.getDate() + 60);
  const todayIso = isoDate(today);
  const maxIso = isoDate(max);

  const html = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function stepsBar(){
    const s = state.step;
    const item = (n, label) => {
      const cls = n < s ? 'is-done' : (n === s ? 'is-active' : '');
      return `<span class="step ${cls}"><span class="num">${n < s ? '✓' : n}</span><span class="label">${label}</span></span>`;
    };
    return `
      <div class="steps">
        ${item(1, 'Date & party')}
        <span class="dash"></span>
        ${item(2, 'Choose time')}
        <span class="dash"></span>
        ${item(3, 'Your details')}
      </div>
    `;
  }

  function render(){
    if (state.step === 1) renderStep1();
    else if (state.step === 2) renderStep2();
    else if (state.step === 3) renderStep3();
    else if (state.step === 4) renderConfirmation();
  }

  /* ---------- STEP 1 ---------- */
  function renderStep1(){
    root.innerHTML = `
      ${stepsBar()}
      <h2><span class="stop-flourish">When are you coming in</span></h2>
      <p class="lede" style="color:var(--muted-2);margin-bottom:24px">Pick a date and tell us how many of you there are. We'll show you the available time slots next.</p>

      <div class="form-grid">
        <div class="field">
          <label for="bk-date">Date <span class="req" aria-hidden="true">*</span></label>
          <input id="bk-date" type="date" min="${todayIso}" max="${maxIso}" value="${state.date}">
          <span class="err" id="err-date">Please pick a date.</span>
        </div>
        <div class="field">
          <label for="bk-party">Party size <span class="req" aria-hidden="true">*</span></label>
          <select id="bk-party">
            <option value="">How many?</option>
            ${CONFIG.partySizes.map(n => `<option value="${n}"${state.party==n?' selected':''}>${n} ${n===1?'guest':'guests'}</option>`).join('')}
            <option value="9+"${state.party==='9+'?' selected':''}>9+ guests (we'll call to confirm)</option>
          </select>
          <span class="err" id="err-party">Please pick a party size.</span>
        </div>
      </div>

      <div class="book-actions">
        <button class="pill pill-gold" id="btn-next-1">
          Find a time
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
        <span style="color:var(--muted);font-size:.78rem;letter-spacing:.06em">Or call us: <a href="${html(CONFIG.brand.phoneHref)}" style="color:var(--gold)">${html(CONFIG.brand.phone)}</a></span>
      </div>
    `;
    document.getElementById('btn-next-1').addEventListener('click', () => {
      const date = document.getElementById('bk-date').value;
      const party = document.getElementById('bk-party').value;
      let ok = true;
      document.querySelector('#bk-date').closest('.field').classList.toggle('has-error', !date);
      document.querySelector('#bk-party').closest('.field').classList.toggle('has-error', !party);
      if (!date || !party) return;
      state.date = date; state.party = party;
      state.step = 2; render();
    });
  }

  /* ---------- STEP 2 ---------- */
  async function renderStep2(){
    const pretty = new Date(state.date + 'T00:00:00').toLocaleDateString(undefined, { weekday:'long', day:'numeric', month:'long' });
    root.innerHTML = `
      ${stepsBar()}
      <h2><span class="stop-flourish">Pick a time</span></h2>
      <p class="lede" style="color:var(--muted-2);margin-bottom:24px">Available slots for <b style="color:var(--text)">${html(pretty)}</b> · party of <b style="color:var(--text)">${html(state.party)}</b>.</p>
      <div class="slots-wrap" id="slots-wrap">
        <div class="slots-loading"><span class="spin" aria-hidden="true"></span><span>Checking availability…</span></div>
      </div>
      <div class="book-actions">
        <a class="back" href="#" id="btn-back-2">← Back</a>
        <button class="pill pill-gold" id="btn-next-2" disabled>
          Continue
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </div>
    `;
    document.getElementById('btn-back-2').addEventListener('click', (e) => { e.preventDefault(); state.step = 1; render(); });

    /* Fetch availability */
    let slots;
    try {
      slots = await fetchAvailability(state.date, state.party);
    } catch (err) {
      document.getElementById('slots-wrap').innerHTML = `
        <div class="slots-empty">
          <b style="color:var(--text)">Couldn't reach the booking system.</b><br>
          ${html(err.message || 'Network error.')}<br><br>
          Please call us on <a href="${html(CONFIG.brand.phoneHref)}" style="color:var(--gold)">${html(CONFIG.brand.phone)}</a> to book by phone.
        </div>`;
      return;
    }

    const wrap = document.getElementById('slots-wrap');
    if (!slots || slots.length === 0) {
      wrap.innerHTML = `<div class="slots-empty">No tables available for that date. Try another day, or call us — sometimes we can fit you in.</div>`;
      return;
    }

    wrap.innerHTML = `<div class="slots" role="radiogroup" aria-label="Available time slots">${
      slots.map(s => `
        <button type="button" class="slot${s.full?' is-full':''}" data-time="${html(s.time)}" data-left="${s.capacityLeft}"${s.full?' disabled':''} role="radio" aria-checked="false">
          ${html(s.time)}
          ${s.full ? '<small>Fully booked</small>' : `<small>${s.capacityLeft} table${s.capacityLeft===1?'':'s'} free</small>`}
        </button>
      `).join('')
    }</div>`;

    /* Slot selection */
    const btnNext = document.getElementById('btn-next-2');
    wrap.querySelectorAll('.slot:not(.is-full)').forEach(b => {
      b.addEventListener('click', () => {
        wrap.querySelectorAll('.slot').forEach(x => { x.classList.remove('is-selected'); x.setAttribute('aria-checked','false'); });
        b.classList.add('is-selected');
        b.setAttribute('aria-checked','true');
        state.slot = { time: b.dataset.time, capacityLeft: Number(b.dataset.left) };
        btnNext.disabled = false;
      });
    });
    btnNext.addEventListener('click', () => { if (state.slot) { state.step = 3; render(); } });
  }

  /* ---------- STEP 3 ---------- */
  function renderStep3(){
    const pretty = new Date(state.date + 'T00:00:00').toLocaleDateString(undefined, { weekday:'long', day:'numeric', month:'long' });
    root.innerHTML = `
      ${stepsBar()}
      <h2><span class="stop-flourish">Your details</span></h2>
      <p class="lede" style="color:var(--muted-2);margin-bottom:24px">Last step — how do we reach you?</p>

      <div class="summary-card">
        <h4>Your booking</h4>
        <div class="summary-row"><span class="k">When</span><span class="v">${html(pretty)} · ${html(state.slot.time)}</span></div>
        <div class="summary-row"><span class="k">Party</span><span class="v">${html(state.party)} ${state.party==='1'?'guest':'guests'}</span></div>
      </div>

      <form id="book-form" novalidate>
        <div class="form-grid">
          <div class="field">
            <label for="bk-name">Name <span class="req" aria-hidden="true">*</span></label>
            <input id="bk-name" type="text" autocomplete="name" required placeholder="Your name" value="${html(state.name)}">
            <span class="err" id="err-name">Please enter your name.</span>
          </div>
          <div class="field">
            <label for="bk-phone">Phone <span class="req" aria-hidden="true">*</span></label>
            <input id="bk-phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="07…" value="${html(state.phone)}">
            <span class="err" id="err-phone">A phone number lets us confirm.</span>
          </div>
          <div class="field full">
            <label for="bk-email">Email <span class="req" aria-hidden="true">*</span></label>
            <input id="bk-email" type="email" autocomplete="email" required placeholder="you@example.com" value="${html(state.email)}">
            <span class="err" id="err-email">Please enter a valid email.</span>
          </div>
          <div class="field full">
            <label for="bk-notes">Notes <span class="hint" style="margin-left:6px">(allergies, occasion, dietary)</span></label>
            <textarea id="bk-notes" placeholder="Anything we should know?">${html(state.notes)}</textarea>
          </div>
        </div>
        <div class="book-actions">
          <a class="back" href="#" id="btn-back-3">← Back</a>
          <button class="pill pill-gold submit-btn" id="btn-submit" type="submit">
            <span class="spin" aria-hidden="true"></span>
            <span class="label">Confirm booking</span>
          </button>
        </div>
        <div class="form-status" id="form-status" role="status" aria-live="polite"></div>
      </form>
    `;

    document.getElementById('btn-back-3').addEventListener('click', (e) => { e.preventDefault(); state.step = 2; render(); });

    const validators = [
      { id:'bk-name', validate: v => v.trim().length >= 2, save: v => state.name = v.trim() },
      { id:'bk-phone', validate: v => v.replace(/[^\d]/g,'').length >= 7, save: v => state.phone = v.trim() },
      { id:'bk-email', validate: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), save: v => state.email = v.trim() },
    ];

    validators.forEach(f => {
      const el = document.getElementById(f.id);
      const mark = () => el.closest('.field').classList.toggle('has-error', !f.validate(el.value));
      el.addEventListener('blur', mark);
      el.addEventListener('input', () => { if (el.closest('.field').classList.contains('has-error')) mark(); });
    });

    document.getElementById('book-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = document.getElementById('form-status');
      const btn = document.getElementById('btn-submit');
      status.className = 'form-status';
      status.textContent = '';

      let firstInvalid = null;
      validators.forEach(f => {
        const el = document.getElementById(f.id);
        const ok = f.validate(el.value);
        el.closest('.field').classList.toggle('has-error', !ok);
        if (ok) f.save(el.value);
        else if (!firstInvalid) firstInvalid = el;
      });
      state.notes = document.getElementById('bk-notes').value.trim();
      if (firstInvalid) { firstInvalid.focus(); return; }

      btn.classList.add('loading'); btn.disabled = true;
      try {
        const result = await submitBooking();
        if (result.ok) {
          state.ref = result.ref || '';
          state.step = 4;
          render();
        } else {
          throw new Error(result.error || 'Booking failed.');
        }
      } catch (err) {
        status.className = 'form-status err';
        status.innerHTML = `<b>Couldn't confirm your booking.</b> ${html(err.message)} Please try again, or call us on <a href="${html(CONFIG.brand.phoneHref)}" style="color:var(--gold)">${html(CONFIG.brand.phone)}</a>.`;
      } finally {
        btn.classList.remove('loading'); btn.disabled = false;
      }
    });
  }

  /* ---------- STEP 4: CONFIRMATION ---------- */
  function renderConfirmation(){
    const pretty = new Date(state.date + 'T00:00:00').toLocaleDateString(undefined, { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    root.innerHTML = `
      <div class="confirmation">
        <div class="check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 13l4 4L20 5"/></svg>
        </div>
        <h3>You're booked in.</h3>
        <p>We've received your request for <b style="color:var(--text)">${html(state.party)}</b> on <b style="color:var(--text)">${html(pretty)}</b> at <b style="color:var(--text)">${html(state.slot.time)}</b>. We'll confirm by phone or email within an hour.</p>
        ${state.ref ? `<div class="ref">REF · ${html(state.ref)}</div>` : ''}
        <div class="book-actions" style="justify-content:center;margin-top:30px">
          <a class="pill pill-ghost" href="./">Make another booking</a>
          <a class="pill pill-gold" href="../">Back to home</a>
        </div>
      </div>
    `;
  }

  /* ---------- API ---------- */
  function configured(){
    const u = CONFIG.bookingApi || '';
    return u && !u.startsWith('REPLACE_');
  }

  async function fetchAvailability(date, party){
    if (!configured()) {
      /* Demo mode — generate fake slots so the UI is testable without a backend */
      return demoSlots();
    }
    const url = `${CONFIG.bookingApi}?action=availability&date=${encodeURIComponent(date)}&party=${encodeURIComponent(party)}`;
    const res = await fetch(url, { method:'GET' });
    if (!res.ok) throw new Error(`Availability check failed (HTTP ${res.status}).`);
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);
    return data.slots || [];
  }

  async function submitBooking(){
    if (!configured()) {
      /* Demo mode — pretend it worked */
      await new Promise(r => setTimeout(r, 700));
      return { ok: true, ref: 'DEMO-' + Math.random().toString(36).slice(2,8).toUpperCase() };
    }
    const payload = {
      action: 'book',
      date: state.date,
      time: state.slot.time,
      party_size: state.party,
      name: state.name,
      phone: state.phone,
      email: state.email,
      notes: state.notes,
      source: 'web',
    };
    /* text/plain content-type avoids CORS preflight, which Apps Script doesn't handle cleanly */
    const res = await fetch(CONFIG.bookingApi, {
      method:'POST',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Network error (HTTP ${res.status}).`);
    return await res.json();
  }

  function demoSlots(){
    /* Replicates what Apps Script returns when the backend isn't wired up yet */
    const slots = [];
    const times = ['3:00 pm','3:30 pm','4:00 pm','4:30 pm','5:00 pm','5:30 pm','6:00 pm','6:30 pm','7:00 pm','7:30 pm','8:00 pm','8:30 pm','9:00 pm','9:30 pm','10:00 pm','10:30 pm'];
    times.forEach((t,i) => {
      const left = (i % 5 === 0) ? 0 : Math.max(1, 5 - (i % 4));
      slots.push({ time: t, capacityLeft: left, full: left === 0 });
    });
    return slots;
  }

  /* Inline notice when running in demo mode (no backend yet) */
  function maybeShowDemoNotice(){
    if (configured()) return;
    const banner = document.getElementById('book-banner');
    if (banner) {
      banner.innerHTML = `
        <div class="form-status err" style="display:block;margin:0 0 24px;background:rgba(242,204,76,.06);border-color:rgba(242,204,76,.4);color:var(--gold)">
          <b>Demo mode.</b> The booking system isn't connected to your Google Sheet yet. Paste your Apps Script Web App URL into <code>assets/data.js</code> (search for <code>REPLACE_WITH_YOUR_APPS_SCRIPT_WEB_APP_URL</code>). See <code>SETUP.md</code> for the full setup.
        </div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    maybeShowDemoNotice();
    render();
  });
})();
