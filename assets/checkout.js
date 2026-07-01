/* =========================================================
   Checkout — takeaway ordering flow (runs on the /book/ page).
   - Choose Delivery or Collection
   - Delivery requires a full address (Flat/Door No, Address, Postcode)
   - Optional coupon code (codes defined in data.js → CONFIG.coupons)
   - Pick a time, enter details, place the order → Apps Script
   ========================================================= */
(function(){
  if (!document.body.dataset || document.body.dataset.page !== 'book') return;

  const root = document.getElementById('book-root');
  const DEL = (CONFIG.delivery || { enabled:false, fee:0, minOrder:0, areaNote:'' });

  const state = {
    mode: DEL.enabled ? 'delivery' : 'collection',
    date:'', time:'',
    name:'', phone:'', email:'', notes:'',
    flat:'', address:'', postcode:'', business:'', businessAddr:'',
    coupon: null,            // { code, type, value, label }
    ref:''
  };

  const pad = n => String(n).padStart(2,'0');
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today = new Date(); today.setHours(0,0,0,0);
  const max = new Date(today); max.setDate(max.getDate() + 7);
  const todayIso = isoDate(today), maxIso = isoDate(max);
  const html = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (n) => Cart.money(n);

  function configured(){
    const u = CONFIG.bookingApi || '';
    return u && !u.startsWith('REPLACE_');
  }

  /* ---------- totals (items + auto 10% + coupon + delivery fee) ---------- */
  function computeTotals(){
    const subtotal = Cart.subtotal();
    const autoDisc = Cart.discount();                       // 10% off £20+
    let couponDisc = 0;
    if (state.coupon){
      couponDisc = state.coupon.type === 'percent'
        ? subtotal * (state.coupon.value/100)
        : Math.min(state.coupon.value, subtotal);
      couponDisc = Math.round(couponDisc*100)/100;
    }
    const fee = (state.mode === 'delivery' && DEL.enabled) ? Number(DEL.fee||0) : 0;
    const total = Math.max(0, Math.round((subtotal - autoDisc - couponDisc + fee)*100)/100);
    return { subtotal, autoDisc, couponDisc, fee, total };
  }

  /* ---------- top-level render ---------- */
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
    const t = computeTotals();
    const toT = Cart.threshold() - t.subtotal;
    return `
      ${t.autoDisc>0 ? `<div class="co-reward on">★ 10% discount applied — you saved ${money(t.autoDisc)}</div>`
                     : (toT>0 ? `<div class="co-reward">Spend ${money(toT)} more to unlock 10% off</div>` : '')}
      <div class="co-sum"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
      ${t.autoDisc>0 ? `<div class="co-sum disc"><span>10% off £20+</span><span>−${money(t.autoDisc)}</span></div>` : ''}
      ${t.couponDisc>0 ? `<div class="co-sum disc"><span>Coupon ${html(state.coupon.code)}</span><span class="co-applied">−${money(t.couponDisc)} <button type="button" id="co-coupon-remove" aria-label="Remove coupon">✕</button></span></div>` : ''}
      ${state.mode==='delivery' && DEL.enabled ? `<div class="co-sum fee"><span>Delivery</span><span>${t.fee>0?money(t.fee):'Free'}</span></div>` : ''}
      <div class="co-sum grand"><span>Total</span><span>${money(t.total)}</span></div>`;
  }

  function summaryItems(){
    return Cart.list().map(it => `
      <div class="co-si"><span>${it.qty}× ${html(it.name)}</span><span>${money(it.price*it.qty)}</span></div>`).join('');
  }

  function fulfilmentBlock(){
    const isDel = state.mode === 'delivery';
    const truck = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 3h13v10H1z"/><path d="M14 7h4l3 3v3h-7z"/><circle cx="5.5" cy="17" r="1.6"/><circle cx="17.5" cy="17" r="1.6"/></svg>`;
    const bag = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>`;
    return `
      <div class="co-block">
        <div class="co-block-head"><span class="co-step-num">2</span><h2>How would you like it?</h2></div>
        ${DEL.enabled ? `
        <div class="co-mode" role="tablist">
          <button type="button" data-mode="delivery" class="${isDel?'active':''}">${truck} Delivery</button>
          <button type="button" data-mode="collection" class="${!isDel?'active':''}">${bag} Collection</button>
        </div>` : ''}

        ${isDel ? `
          <p class="co-mode-note">${html(DEL.areaNote||'')}${DEL.minOrder?` Minimum ${money(DEL.minOrder)} for delivery.`:''}</p>
          <div class="co-addr">
            <div class="form-grid">
              <div class="field">
                <label for="co-flat">Flat / Door No <span class="req">*</span></label>
                <input id="co-flat" type="text" autocomplete="address-line2" placeholder="e.g. Flat 2 / 14" value="${html(state.flat)}">
                <span class="err" id="err-flat">Required.</span>
              </div>
              <div class="field">
                <label for="co-postcode">Post code <span class="req">*</span></label>
                <input id="co-postcode" type="text" autocomplete="postal-code" placeholder="DA1 4EF" value="${html(state.postcode)}">
                <span class="err" id="err-postcode">Required.</span>
              </div>
              <div class="field full">
                <label for="co-address">Address <span class="req">*</span></label>
                <input id="co-address" type="text" autocomplete="address-line1" placeholder="Street, area, town" value="${html(state.address)}">
                <span class="err" id="err-address">Please enter your delivery address.</span>
              </div>
              <div class="field">
                <label for="co-business">Business name <span class="hint">(optional)</span></label>
                <input id="co-business" type="text" placeholder="If delivering to a business" value="${html(state.business)}">
              </div>
              <div class="field">
                <label for="co-business-addr">Business address <span class="hint">(optional)</span></label>
                <input id="co-business-addr" type="text" placeholder="Company / unit details" value="${html(state.businessAddr)}">
              </div>
            </div>
          </div>` : `
          <p class="co-collect-note">Collect from <b style="color:var(--text)">${html(CONFIG.brand.name)}</b>, ${html(CONFIG.brand.address)}. We'll have it ready at your chosen time.</p>`}

        <div class="field" style="max-width:260px;margin-top:18px">
          <label for="co-date">${isDel?'Delivery':'Collection'} date</label>
          <input id="co-date" type="date" min="${todayIso}" max="${maxIso}" value="${state.date||todayIso}">
        </div>
        <div class="slots-wrap" id="co-slots">
          <div class="slots-loading"><span class="spin" aria-hidden="true"></span><span>Checking times…</span></div>
        </div>
      </div>`;
  }

  function renderCheckout(){
    const isDel = state.mode === 'delivery';
    root.innerHTML = `
      <div class="co-grid">
        <section class="co-main">
          <div class="co-block">
            <div class="co-block-head"><span class="co-step-num">1</span><h2>Your order</h2></div>
            <div class="co-lines" id="co-lines">${Cart.list().map(lineHTML).join('')}</div>
            <a class="co-add-more" href="../menu/">+ Add more items</a>
          </div>

          ${fulfilmentBlock()}

          <div class="co-block">
            <div class="co-block-head"><span class="co-step-num">3</span><h2>Your details</h2></div>
            <div class="form-grid">
              <div class="field">
                <label for="co-name">Name <span class="req">*</span></label>
                <input id="co-name" type="text" autocomplete="name" placeholder="Your name" value="${html(state.name)}">
                <span class="err" id="err-name">Please enter your name.</span>
              </div>
              <div class="field">
                <label for="co-phone">Phone <span class="req">*</span></label>
                <input id="co-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="07…" value="${html(state.phone)}">
                <span class="err" id="err-phone">A phone number lets us confirm.</span>
              </div>
              <div class="field full">
                <label for="co-email">Email <span class="req">*</span></label>
                <input id="co-email" type="email" autocomplete="email" placeholder="you@example.com" value="${html(state.email)}">
                <span class="err" id="err-email">Please enter a valid email.</span>
              </div>
              <div class="field full">
                <label for="co-notes">Notes <span class="hint">(allergies, toppings, buzzer code…)</span></label>
                <textarea id="co-notes" placeholder="Anything we should know?">${html(state.notes)}</textarea>
              </div>
            </div>
          </div>
        </section>

        <aside class="co-aside">
          <div class="co-summary">
            <h3>Order summary</h3>
            <div class="co-summary-items" id="co-sum-items">${summaryItems()}</div>

            <div class="co-coupon">
              <input id="co-coupon-input" type="text" placeholder="Got a coupon code?" value="${html(state.coupon ? state.coupon.code : '')}" ${state.coupon?'disabled':''}>
              <button type="button" id="co-coupon-apply">${state.coupon?'Applied':'Apply'}</button>
            </div>
            <div class="co-coupon-msg" id="co-coupon-msg"></div>

            <div class="co-totals" id="co-totals">${totalsHTML()}</div>
            <button class="pill pill-gold co-place" id="co-place" type="button">
              <span class="spin" aria-hidden="true"></span>
              <span class="label">Place order · ${money(computeTotals().total)}</span>
            </button>
            <p class="co-pay-note">Pay on ${isDel?'delivery':'collection'} — cash or card.</p>
            <div class="form-status" id="co-status" role="status" aria-live="polite"></div>
          </div>
        </aside>
      </div>`;

    /* mode toggle */
    root.querySelectorAll('.co-mode button').forEach(b => {
      b.addEventListener('click', () => { captureFields(); state.mode = b.dataset.mode; state.time=''; render(); });
    });

    /* collection/delivery date */
    state.date = state.date || todayIso;
    document.getElementById('co-date').addEventListener('change', (e) => { state.date = e.target.value || todayIso; state.time=''; loadSlots(); });
    loadSlots();

    /* live field capture */
    bindField('name'); bindField('phone'); bindField('email'); bindField('notes');
    if (isDel){ bindField('flat'); bindField('address'); bindField('postcode'); bindField('business','business'); bindField('businessAddr','business-addr'); }

    /* coupon */
    document.getElementById('co-coupon-apply').addEventListener('click', applyCoupon);
    document.getElementById('co-coupon-input').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); applyCoupon(); }});

    document.getElementById('co-place').addEventListener('click', placeOrder);
  }

  function bindField(key, idSuffix){
    const el = document.getElementById('co-' + (idSuffix || key));
    if (!el) return;
    el.addEventListener('input', () => { state[key] = el.value; });
    el.addEventListener('blur', () => validateField(key, idSuffix));
  }

  function captureFields(){
    [['name'],['phone'],['email'],['notes'],['flat'],['address'],['postcode'],['business','business'],['businessAddr','business-addr']].forEach(([k,s]) => {
      const el = document.getElementById('co-' + (s||k));
      if (el) state[k] = el.value;
    });
  }

  /* keep order section + totals live as the cart changes */
  function refreshOrder(){
    if (state.ref) return;
    if (Cart.count() === 0) { render(); return; }
    const lines = document.getElementById('co-lines');
    if (!lines) { render(); return; }
    lines.innerHTML = Cart.list().map(lineHTML).join('');
    const si = document.getElementById('co-sum-items'); if (si) si.innerHTML = summaryItems();
    updateTotalsUI();
  }
  function updateTotalsUI(){
    const tt = document.getElementById('co-totals'); if (tt) tt.innerHTML = totalsHTML();
    const lbl = document.querySelector('#co-place .label'); if (lbl) lbl.textContent = `Place order · ${money(computeTotals().total)}`;
    document.getElementById('co-coupon-remove')?.addEventListener('click', removeCoupon);
  }

  /* ---------- coupon ---------- */
  async function applyCoupon(){
    const input = document.getElementById('co-coupon-input');
    const msg = document.getElementById('co-coupon-msg');
    const code = (input.value || '').trim();
    if (!code){ msg.className='co-coupon-msg err'; msg.textContent='Enter a code first.'; return; }

    /* 1) check codes defined in data.js */
    let found = null;
    const map = CONFIG.coupons || {};
    const key = Object.keys(map).find(k => k.toLowerCase() === code.toLowerCase());
    if (key) found = { code: key, type: map[key].type, value: Number(map[key].value), label: map[key].label || key };

    /* 2) otherwise check the Supabase coupons table (owner-managed) */
    if (!found && window.JD && JD.supaReady){
      msg.className='co-coupon-msg'; msg.textContent='Checking…';
      const { data } = await JD.supabase.from('coupons').select('*').ilike('code', code).eq('active', true).maybeSingle();
      if (data) found = { code: data.code, type: data.type, value: Number(data.value), label: data.label || data.code };
    }

    if (!found){
      msg.className='co-coupon-msg err'; msg.textContent="That code isn't valid.";
      state.coupon = null; return;
    }
    state.coupon = found;
    render();
    const m2 = document.getElementById('co-coupon-msg');
    if (m2){ m2.className='co-coupon-msg ok'; m2.textContent = `“${found.code}” applied — ${found.label || ''}`.trim(); }
  }
  function removeCoupon(){ state.coupon = null; render(); }

  /* ---------- time slots ---------- */
  async function loadSlots(){
    const wrap = document.getElementById('co-slots');
    if (!wrap) return;
    wrap.innerHTML = `<div class="slots-loading"><span class="spin" aria-hidden="true"></span><span>Checking times…</span></div>`;
    let slots;
    try { slots = await fetchSlots(state.date); }
    catch (err) {
      wrap.innerHTML = `<div class="slots-empty"><b style="color:var(--text)">Couldn't load times.</b><br>${html(err.message||'Network error.')}<br><br>You can still place the order and we'll call to arrange, or ring us on <a href="${html(CONFIG.brand.phoneHref)}" style="color:var(--gold)">${html(CONFIG.brand.phone)}</a>.</div>`;
      return;
    }
    if (!slots || slots.length === 0){ wrap.innerHTML = `<div class="slots-empty">No slots left for that day. Try another date.</div>`; return; }
    wrap.innerHTML = `<div class="slots" role="radiogroup" aria-label="Times">${
      slots.map(s => `
        <button type="button" class="slot${s.full?' is-full':''}${state.time===s.time?' is-selected':''}" data-time="${html(s.time)}"${s.full?' disabled':''}>
          ${html(s.time)}${s.full ? '<small>Full</small>' : `<small>${s.capacityLeft} left</small>`}
        </button>`).join('')
    }</div>`;
    wrap.querySelectorAll('.slot:not(.is-full)').forEach(b => {
      b.addEventListener('click', () => {
        wrap.querySelectorAll('.slot').forEach(x => x.classList.remove('is-selected'));
        b.classList.add('is-selected'); state.time = b.dataset.time;
        wrap.classList.remove('co-needed');
      });
    });
  }

  const SLOT_TIMES = ['3:00 pm','3:30 pm','4:00 pm','4:30 pm','5:00 pm','5:30 pm','6:00 pm','6:30 pm','7:00 pm','7:30 pm','8:00 pm','8:30 pm','9:00 pm','9:30 pm','10:00 pm','10:30 pm','11:00 pm'];
  const PER_SLOT = 8;
  function parseHour(t){ const m=t.match(/(\d+):(\d+)\s*(am|pm)/i); if(!m)return 0; let h=+m[1]%12; if(/pm/i.test(m[3]))h+=12; return h*60 + +m[2]; }

  async function fetchSlots(date){
    /* Supabase-native availability (counts live orders per slot) */
    if (window.JD && JD.supaReady){
      const { data, error } = await JD.supabase.from('orders').select('slot_time,status').eq('slot_date', date);
      if (error) throw new Error(error.message);
      const used = {};
      (data||[]).forEach(r => { if ((r.status||'')!=='Cancelled') used[r.slot_time]=(used[r.slot_time]||0)+1; });
      const isToday = date === new Date().toISOString().slice(0,10);
      const nowMin = new Date().getHours()*60 + new Date().getMinutes();
      return SLOT_TIMES.filter(t => !isToday || parseHour(t) > nowMin + 15)
        .map(t => { const left = Math.max(0, PER_SLOT - (used[t]||0)); return { time:t, capacityLeft:left, full:left===0 }; });
    }
    if (!configured()){
      return SLOT_TIMES.map((t,i) => { const left=(i%6===0)?0:Math.max(1,8-(i%5)); return {time:t,capacityLeft:left,full:left===0}; });
    }
    const res = await fetch(`${CONFIG.bookingApi}?action=availability&date=${encodeURIComponent(date)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);
    return data.slots || [];
  }

  function genRef(){ const c='ACDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<6;i++)s+=c[Math.floor(Math.random()*c.length)]; return 'JD-'+s; }

  /* ---------- validation ---------- */
  const validators = {
    name:  v => v.trim().length >= 2,
    phone: v => v.replace(/[^\d]/g,'').length >= 7,
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
    flat:  v => v.trim().length >= 1,
    address: v => v.trim().length >= 4,
    postcode: v => v.trim().length >= 4,
  };
  function validateField(key, idSuffix){
    if (!validators[key]) return true;
    const el = document.getElementById('co-' + (idSuffix || key));
    if (!el) return true;
    const ok = validators[key](el.value);
    el.closest('.field').classList.toggle('has-error', !ok);
    return ok;
  }

  /* ---------- place order ---------- */
  async function placeOrder(){
    captureFields();
    const status = document.getElementById('co-status');
    status.className = 'form-status'; status.textContent = '';
    const t = computeTotals();

    /* delivery minimum */
    if (state.mode==='delivery' && DEL.enabled && DEL.minOrder && t.subtotal < DEL.minOrder){
      status.className='form-status err';
      status.innerHTML = `<b>Minimum ${money(DEL.minOrder)} for delivery.</b> Add ${money(DEL.minOrder - t.subtotal)} more, or switch to collection.`;
      return;
    }

    let firstBad = null;
    const need = ['name','phone','email'];
    if (state.mode==='delivery') need.push('flat','address','postcode');
    need.forEach(k => { const ok = validateField(k); if (!ok && !firstBad) firstBad = document.getElementById('co-'+k); });

    if (!state.time){
      document.getElementById('co-slots')?.classList.add('co-needed');
      if (!firstBad){
        status.className='form-status err';
        status.innerHTML = `<b>Pick a ${state.mode==='delivery'?'delivery':'collection'} time</b> above to continue.`;
        document.getElementById('co-slots')?.scrollIntoView({behavior:'smooth',block:'center'});
        return;
      }
    }
    if (firstBad){ firstBad.focus(); firstBad.scrollIntoView({behavior:'smooth',block:'center'}); return; }
    if (!state.time) return;

    const btn = document.getElementById('co-place');
    btn.classList.add('loading'); btn.disabled = true;
    try {
      const result = await submitOrder(t);
      if (result.ok){ state.ref = result.ref || 'JD'; render(); window.scrollTo({top:0,behavior:'smooth'}); }
      else throw new Error(result.error || 'Order failed.');
    } catch (err){
      status.className='form-status err';
      status.innerHTML = `<b>Couldn't place your order.</b> ${html(err.message)} Please try again, or call us on <a href="${html(CONFIG.brand.phoneHref)}" style="color:var(--gold)">${html(CONFIG.brand.phone)}</a>.`;
    } finally { btn.classList.remove('loading'); btn.disabled = false; }
  }

  async function submitOrder(t){
    const items = Cart.list().map(it => ({ name: it.name, qty: it.qty, price: it.price, line: Math.round(it.price*it.qty*100)/100 }));
    const payload = {
      action: 'order',
      mode: state.mode,
      collection_date: state.date,
      collection_time: state.time,
      items,
      item_count: Cart.count(),
      subtotal: t.subtotal,
      discount: t.autoDisc,
      coupon: state.coupon ? state.coupon.code : '',
      coupon_discount: t.couponDisc,
      delivery_fee: t.fee,
      total: t.total,
      name: state.name.trim(), phone: state.phone.trim(), email: state.email.trim(),
      flat: state.flat.trim(), address: state.address.trim(), postcode: state.postcode.trim(),
      business: state.business.trim(), business_address: state.businessAddr.trim(),
      notes: state.notes.trim(), source: 'web',
    };
    /* Supabase-native order insert (so it appears in the dashboards) */
    if (window.JD && JD.supaReady){
      const u = await JD.getUser();
      const ref = genRef();
      const { error } = await JD.supabase.from('orders').insert({
        ref, user_id: u ? u.id : null,
        mode: state.mode, slot_date: state.date, slot_time: state.time,
        items, item_count: Cart.count(),
        subtotal: t.subtotal, discount: t.autoDisc,
        coupon: state.coupon ? state.coupon.code : null, coupon_discount: t.couponDisc,
        delivery_fee: t.fee, total: t.total,
        name: state.name.trim(), phone: state.phone.trim(), email: state.email.trim(),
        flat: state.flat.trim(), address: state.address.trim(), postcode: state.postcode.trim(),
        business: state.business.trim(), business_address: state.businessAddr.trim(),
        notes: state.notes.trim(), status: 'New',
      });
      if (error) throw new Error(error.message);
      return { ok:true, ref };
    }
    if (!configured()){
      await new Promise(r => setTimeout(r, 700));
      return { ok:true, ref:'DEMO-' + Math.random().toString(36).slice(2,8).toUpperCase() };
    }
    const res = await fetch(CONFIG.bookingApi, {
      method:'POST',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Network error (HTTP ${res.status}).`);
    return await res.json();
  }

  /* ---------- confirmation ---------- */
  function renderConfirmation(){
    const isDel = state.mode === 'delivery';
    const pretty = state.date ? new Date(state.date+'T00:00:00').toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'}) : '';
    const lines = Cart.list();
    const t = computeTotals();
    root.innerHTML = `
      <div class="confirmation">
        <div class="check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 13l4 4L20 5"/></svg></div>
        <h3>Order received.</h3>
        <p>Thanks ${html(state.name.split(' ')[0]||'')}! Your order is set for <b style="color:var(--text)">${isDel?'delivery':'collection'}</b> on <b style="color:var(--text)">${html(pretty)}</b> at <b style="color:var(--text)">${html(state.time)}</b>. We'll text or call to confirm shortly.</p>
        <div class="ref">REF · ${html(state.ref)}</div>
        <div class="co-receipt">
          ${lines.map(it => `<div class="co-si"><span>${it.qty}× ${html(it.name)}</span><span>${money(it.price*it.qty)}</span></div>`).join('')}
          ${t.fee>0 ? `<div class="co-si"><span>Delivery</span><span>${money(t.fee)}</span></div>` : ''}
          <div class="co-si grand"><span>Total to pay on ${isDel?'delivery':'collection'}</span><span>${money(t.total)}</span></div>
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
