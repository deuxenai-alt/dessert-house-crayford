/* =========================================================
   Checkout — takeaway order flow (runs on the /book/ page).
   Reads window.Cart, lets the customer adjust quantities, choose a
   collection time (live availability from Apps Script), enter their
   details, and places the order.
   ========================================================= */
(function(){
  if (!document.body.dataset || document.body.dataset.page !== 'book') return;

  const root = document.getElementById('book-root');
  const state = { date:'', time:'', name:'', phone:'', email:'', notes:'', ref:'' };

  const pad = n => String(n).padStart(2,'0');
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today = new Date(); today.setHours(0,0,0,0);
  const max = new Date(today); max.setDate(max.getDate() + 7);
  const todayIso = isoDate(today), maxIso = isoDate(max);
  const html = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (n) => Cart.money(n);

  function configured(){
    const u = CONFIG.bookingApi || '';
    return u && !u.startsWith('REPLACE_');
  }

  /* ---------- Top-level render ---------- */
  function render(){
    if (state.ref) return renderConfirmation();
    if (!window.Cart || Cart.count() === 0) return renderEmpty();
    renderCheckout();
  }

  function renderEmpty(){
    root.innerHTML = `
      <div class="co-empty">
        <span class="co-empty-ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.4 12.3a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6"/></svg>
        </span>
        <h2><span class="stop-flourish">Your basket is empty</span></h2>
        <p>Add a few desserts from the menu and they'll appear here, ready to check out.</p>
        <div class="hero-actions" style="justify-content:center;margin-top:28px">
          <a class="pill pill-gold" href="../menu/">Browse the menu</a>
          <a class="pill pill-ghost" href="../waffles/">Start with waffles</a>
        </div>
      </div>`;
  }

  function lineHTML(it){
    return `
      <div class="co-line" data-line="${html(it.id)}">
        <div class="co-line-info">
          <span class="co-line-name">${html(it.name)}</span>
          <span class="co-line-price">${html(it.priceLabel)} each</span>
        </div>
        <div class="co-line-right">
          <div class="stepper has-qty" data-item-id="${html(it.id)}" data-name="${html(it.name)}" data-price="${html(it.priceLabel)}" data-cat="${html(it.cat)}">
            <button class="qbtn minus" type="button" aria-label="Remove one ${html(it.name)}">−</button>
            <span class="qval">${it.qty}</span>
            <button class="qbtn plus" type="button" aria-label="Add one ${html(it.name)}">+</button>
          </div>
          <span class="co-line-total">${money(it.price*it.qty)}</span>
        </div>
      </div>`;
  }

  function totalsHTML(){
    const sub = Cart.subtotal(), disc = Cart.discount(), tot = Cart.total();
    const toT = Cart.threshold() - sub;
    return `
      ${disc>0 ? `<div class="co-reward on">★ 10% discount applied — you saved ${money(disc)}</div>`
               : (toT>0 ? `<div class="co-reward">Spend ${money(toT)} more to unlock 10% off</div>` : '')}
      <div class="co-sum"><span>Subtotal</span><span>${money(sub)}</span></div>
      ${disc>0 ? `<div class="co-sum disc"><span>Discount (10%)</span><span>−${money(disc)}</span></div>` : ''}
      <div class="co-sum grand"><span>Total</span><span>${money(tot)}</span></div>`;
  }

  function renderCheckout(){
    root.innerHTML = `
      <div class="co-grid">
        <section class="co-main">
          <div class="co-block">
            <div class="co-block-head">
              <span class="co-step-num">1</span>
              <h2>Your order</h2>
            </div>
            <div class="co-lines" id="co-lines">${Cart.list().map(lineHTML).join('')}</div>
            <a class="co-add-more" href="../menu/">+ Add more items</a>
          </div>

          <div class="co-block">
            <div class="co-block-head">
              <span class="co-step-num">2</span>
              <h2>Collection time</h2>
            </div>
            <p class="co-hint">Pick when you'll come and collect. We start preparing fresh when your slot is near.</p>
            <div class="field" style="max-width:260px">
              <label for="co-date">Collection date</label>
              <input id="co-date" type="date" min="${todayIso}" max="${maxIso}" value="${state.date||todayIso}">
            </div>
            <div class="slots-wrap" id="co-slots">
              <div class="slots-loading"><span class="spin" aria-hidden="true"></span><span>Checking times…</span></div>
            </div>
          </div>

          <div class="co-block">
            <div class="co-block-head">
              <span class="co-step-num">3</span>
              <h2>Your details</h2>
            </div>
            <div class="form-grid">
              <div class="field">
                <label for="co-name">Name <span class="req" aria-hidden="true">*</span></label>
                <input id="co-name" type="text" autocomplete="name" placeholder="Your name" value="${html(state.name)}">
                <span class="err" id="err-name">Please enter your name.</span>
              </div>
              <div class="field">
                <label for="co-phone">Phone <span class="req" aria-hidden="true">*</span></label>
                <input id="co-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="07…" value="${html(state.phone)}">
                <span class="err" id="err-phone">A phone number lets us confirm.</span>
              </div>
              <div class="field full">
                <label for="co-email">Email <span class="req" aria-hidden="true">*</span></label>
                <input id="co-email" type="email" autocomplete="email" placeholder="you@example.com" value="${html(state.email)}">
                <span class="err" id="err-email">Please enter a valid email.</span>
              </div>
              <div class="field full">
                <label for="co-notes">Notes <span class="hint" style="margin-left:6px">(allergies, toppings, anything else)</span></label>
                <textarea id="co-notes" placeholder="Anything we should know?">${html(state.notes)}</textarea>
              </div>
            </div>
          </div>
        </section>

        <aside class="co-aside">
          <div class="co-summary">
            <h3>Order summary</h3>
            <div class="co-summary-items" id="co-sum-items">${summaryItems()}</div>
            <div class="co-totals" id="co-totals">${totalsHTML()}</div>
            <button class="pill pill-gold co-place" id="co-place" type="button">
              <span class="spin" aria-hidden="true"></span>
              <span class="label">Place order · ${money(Cart.total())}</span>
            </button>
            <p class="co-pay-note">Pay on collection — cash or card in store.</p>
            <div class="form-status" id="co-status" role="status" aria-live="polite"></div>
          </div>
        </aside>
      </div>`;

    /* collection date → reload slots */
    state.date = state.date || todayIso;
    document.getElementById('co-date').addEventListener('change', (e) => {
      state.date = e.target.value || todayIso;
      state.time = '';
      loadSlots();
    });
    loadSlots();

    /* live field capture */
    ['name','phone','email','notes'].forEach(k => {
      const el = document.getElementById('co-'+k);
      el.addEventListener('input', () => { state[k] = el.value; });
      el.addEventListener('blur', () => validateField(k));
    });

    document.getElementById('co-place').addEventListener('click', placeOrder);
  }

  function summaryItems(){
    return Cart.list().map(it => `
      <div class="co-si"><span>${it.qty}× ${html(it.name)}</span><span>${money(it.price*it.qty)}</span></div>`).join('');
  }

  /* ---------- keep order section live as cart changes ---------- */
  function refreshOrder(){
    if (state.ref) return;
    if (Cart.count() === 0) { render(); return; }
    const lines = document.getElementById('co-lines');
    if (!lines) { render(); return; }   // we were on empty/confirm — rebuild
    lines.innerHTML = Cart.list().map(lineHTML).join('');
    const si = document.getElementById('co-sum-items'); if (si) si.innerHTML = summaryItems();
    const tt = document.getElementById('co-totals'); if (tt) tt.innerHTML = totalsHTML();
    const lbl = document.querySelector('#co-place .label'); if (lbl) lbl.textContent = `Place order · ${money(Cart.total())}`;
  }

  /* ---------- collection slots ---------- */
  async function loadSlots(){
    const wrap = document.getElementById('co-slots');
    if (!wrap) return;
    wrap.innerHTML = `<div class="slots-loading"><span class="spin" aria-hidden="true"></span><span>Checking times…</span></div>`;
    let slots;
    try {
      slots = await fetchSlots(state.date);
    } catch (err) {
      wrap.innerHTML = `<div class="slots-empty"><b style="color:var(--text)">Couldn't load collection times.</b><br>${html(err.message||'Network error.')}<br><br>You can still place the order and we'll call to arrange a time, or ring us on <a href="${html(CONFIG.brand.phoneHref)}" style="color:var(--gold)">${html(CONFIG.brand.phone)}</a>.</div>`;
      return;
    }
    if (!slots || slots.length === 0){
      wrap.innerHTML = `<div class="slots-empty">No collection slots left for that day. Try another date.</div>`;
      return;
    }
    wrap.innerHTML = `<div class="slots" role="radiogroup" aria-label="Collection times">${
      slots.map(s => `
        <button type="button" class="slot${s.full?' is-full':''}${state.time===s.time?' is-selected':''}" data-time="${html(s.time)}"${s.full?' disabled':''}>
          ${html(s.time)}
          ${s.full ? '<small>Full</small>' : `<small>${s.capacityLeft} left</small>`}
        </button>`).join('')
    }</div>`;
    wrap.querySelectorAll('.slot:not(.is-full)').forEach(b => {
      b.addEventListener('click', () => {
        wrap.querySelectorAll('.slot').forEach(x => x.classList.remove('is-selected'));
        b.classList.add('is-selected');
        state.time = b.dataset.time;
        document.getElementById('co-slots').classList.remove('co-needed');
      });
    });
  }

  async function fetchSlots(date){
    if (!configured()){
      /* Demo — collection times so the flow is testable before the backend is wired */
      const times = ['3:00 pm','3:30 pm','4:00 pm','4:30 pm','5:00 pm','5:30 pm','6:00 pm','6:30 pm','7:00 pm','7:30 pm','8:00 pm','8:30 pm','9:00 pm','9:30 pm','10:00 pm','10:30 pm'];
      return times.map((t,i) => { const left = (i%6===0)?0:Math.max(1,8-(i%5)); return { time:t, capacityLeft:left, full:left===0 }; });
    }
    const url = `${CONFIG.bookingApi}?action=availability&date=${encodeURIComponent(date)}`;
    const res = await fetch(url, { method:'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);
    return data.slots || [];
  }

  /* ---------- validation ---------- */
  const validators = {
    name:  v => v.trim().length >= 2,
    phone: v => v.replace(/[^\d]/g,'').length >= 7,
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
  };
  function validateField(k){
    if (!validators[k]) return true;
    const el = document.getElementById('co-'+k);
    const ok = validators[k](el.value);
    el.closest('.field').classList.toggle('has-error', !ok);
    return ok;
  }

  /* ---------- place order ---------- */
  async function placeOrder(){
    const status = document.getElementById('co-status');
    status.className = 'form-status'; status.textContent = '';

    let firstBad = null;
    ['name','phone','email'].forEach(k => {
      const ok = validateField(k);
      if (!ok && !firstBad) firstBad = document.getElementById('co-'+k);
    });
    if (!state.time){
      document.getElementById('co-slots')?.classList.add('co-needed');
      if (!firstBad){
        status.className = 'form-status err';
        status.innerHTML = `<b>Pick a collection time</b> above to continue.`;
        document.getElementById('co-slots')?.scrollIntoView({ behavior:'smooth', block:'center' });
        return;
      }
    }
    if (firstBad){ firstBad.focus(); firstBad.scrollIntoView({ behavior:'smooth', block:'center' }); return; }
    if (!state.time){ return; }

    state.notes = document.getElementById('co-notes').value.trim();
    const btn = document.getElementById('co-place');
    btn.classList.add('loading'); btn.disabled = true;
    try {
      const result = await submitOrder();
      if (result.ok){ state.ref = result.ref || 'DH'; render(); window.scrollTo({top:0, behavior:'smooth'}); }
      else throw new Error(result.error || 'Order failed.');
    } catch (err){
      status.className = 'form-status err';
      status.innerHTML = `<b>Couldn't place your order.</b> ${html(err.message)} Please try again, or call us on <a href="${html(CONFIG.brand.phoneHref)}" style="color:var(--gold)">${html(CONFIG.brand.phone)}</a>.`;
    } finally {
      btn.classList.remove('loading'); btn.disabled = false;
    }
  }

  async function submitOrder(){
    const items = Cart.list().map(it => ({ name: it.name, qty: it.qty, price: it.price, line: Math.round(it.price*it.qty*100)/100 }));
    const payload = {
      action: 'order',
      collection_date: state.date,
      collection_time: state.time,
      items,
      item_count: Cart.count(),
      subtotal: Cart.subtotal(),
      discount: Cart.discount(),
      total: Cart.total(),
      name: state.name.trim(), phone: state.phone.trim(), email: state.email.trim(),
      notes: state.notes, source: 'web',
    };
    if (!configured()){
      await new Promise(r => setTimeout(r, 700));
      return { ok:true, ref:'DEMO-' + Math.random().toString(36).slice(2,8).toUpperCase() };
    }
    const res = await fetch(CONFIG.bookingApi, {
      method:'POST',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },   // avoids Apps Script CORS preflight
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Network error (HTTP ${res.status}).`);
    return await res.json();
  }

  /* ---------- confirmation ---------- */
  function renderConfirmation(){
    const pretty = state.date ? new Date(state.date+'T00:00:00').toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'}) : '';
    const lines = Cart.list();
    root.innerHTML = `
      <div class="confirmation">
        <div class="check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 13l4 4L20 5"/></svg></div>
        <h3>Order received.</h3>
        <p>Thanks ${html(state.name.split(' ')[0]||'')}! We've got your order for collection on <b style="color:var(--text)">${html(pretty)}</b> at <b style="color:var(--text)">${html(state.time)}</b>. We'll text or call to confirm shortly.</p>
        <div class="ref">REF · ${html(state.ref)}</div>
        <div class="co-receipt">
          ${lines.map(it => `<div class="co-si"><span>${it.qty}× ${html(it.name)}</span><span>${money(it.price*it.qty)}</span></div>`).join('')}
          <div class="co-si grand"><span>Total to pay on collection</span><span>${money(Cart.total())}</span></div>
        </div>
        <div class="book-actions" style="justify-content:center;margin-top:30px">
          <a class="pill pill-gold" href="../menu/" id="co-done">Start a new order</a>
          <a class="pill pill-ghost" href="../">Back to home</a>
        </div>
      </div>`;
    document.getElementById('co-done')?.addEventListener('click', () => { Cart.clear(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    if (window.Cart) Cart.onChange(refreshOrder);
  });
})();
