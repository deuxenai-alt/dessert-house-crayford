/* =========================================================
   Cart — takeaway ordering state + floating bar + slide-in drawer.
   Loaded on every page (after app.js). Persists to localStorage so the
   basket survives navigation between category pages.

   Public API (window.Cart):
     Cart.add(id, name, priceLabel, cat)   add one of an item
     Cart.inc(id) / Cart.dec(id)           +1 / -1 (removes at 0)
     Cart.setQty(id, n)                     set absolute quantity
     Cart.qtyOf(id)                         current quantity (0 if none)
     Cart.list()                            [{id,name,price,priceLabel,cat,qty}]
     Cart.count()                           total item count
     Cart.subtotal() / discount() / total() money (numbers)
     Cart.clear()                           empty the basket
     Cart.onChange(fn)                      subscribe to changes
     Cart.openDrawer() / closeDrawer()
   ========================================================= */
window.Cart = (function(){
  const KEY = 'dh_cart_v1';
  const DISCOUNT_THRESHOLD = 20;   // £ — matches the "10% off £20+" offer
  const DISCOUNT_RATE = 0.10;

  let items = load();
  const listeners = [];

  function load(){ try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch(e){ return {}; } }
  function save(){ localStorage.setItem(KEY, JSON.stringify(items)); emit(); }
  function emit(){ listeners.forEach(fn => { try { fn(); } catch(e){} }); }
  function money(n){ return '£' + (Math.round(n*100)/100).toFixed(2); }
  function parsePrice(label){ const n = parseFloat(String(label).replace(/[^0-9.]/g,'')); return isNaN(n) ? 0 : n; }
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const api = {
    add(id, name, priceLabel, cat){
      if (!items[id]) items[id] = { id, name, price: parsePrice(priceLabel), priceLabel, cat: cat||'', qty: 0 };
      items[id].qty += 1; save();
    },
    inc(id){ if (items[id]) { items[id].qty++; save(); } },
    dec(id){ if (items[id]) { items[id].qty--; if (items[id].qty <= 0) delete items[id]; save(); } },
    setQty(id, n){
      n = Math.max(0, parseInt(n,10) || 0);
      if (n === 0) { delete items[id]; }
      else if (items[id]) { items[id].qty = n; }
      save();
    },
    qtyOf(id){ return items[id] ? items[id].qty : 0; },
    list(){ return Object.values(items); },
    count(){ return Object.values(items).reduce((s,i)=>s+i.qty,0); },
    subtotal(){ return Object.values(items).reduce((s,i)=>s+i.price*i.qty,0); },
    discount(){ const s = api.subtotal(); return s >= DISCOUNT_THRESHOLD ? Math.round(s*DISCOUNT_RATE*100)/100 : 0; },
    total(){ return Math.round((api.subtotal()-api.discount())*100)/100; },
    threshold(){ return DISCOUNT_THRESHOLD; },
    rate(){ return DISCOUNT_RATE; },
    clear(){ items = {}; save(); },
    money,
    onChange(fn){ listeners.push(fn); },
    openDrawer(){ document.getElementById('cartDrawer')?.classList.add('open'); document.getElementById('cartOverlay')?.classList.add('open'); document.body.classList.add('cart-locked'); },
    closeDrawer(){ document.getElementById('cartDrawer')?.classList.remove('open'); document.getElementById('cartOverlay')?.classList.remove('open'); document.body.classList.remove('cart-locked'); },
  };

  /* =================== FLOATING BAR + DRAWER UI =================== */
  function base(){ return (document.body.dataset.base || './'); }
  function checkoutHref(){ return base().replace(/\/$/,'') + '/book/'; }

  function mountUI(){
    if (document.getElementById('cartDrawer')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <button class="cart-bar" id="cartBar" type="button" aria-label="View your order">
        <span class="cart-bar-left">
          <span class="cart-bar-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.3a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6"/></svg>
            <span class="cart-bar-count" id="cartBarCount">0</span>
          </span>
          <span>View order</span>
        </span>
        <span class="cart-bar-total" id="cartBarTotal">£0.00</span>
      </button>

      <div class="cart-overlay" id="cartOverlay" aria-hidden="true"></div>
      <aside class="cart-drawer" id="cartDrawer" role="dialog" aria-modal="true" aria-label="Your order">
        <header class="cart-head">
          <h3>Your order</h3>
          <button class="cart-close" id="cartClose" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </header>
        <div class="cart-body" id="cartBody"></div>
        <footer class="cart-foot" id="cartFoot"></footer>
      </aside>`;
    document.body.appendChild(wrap);

    document.getElementById('cartBar').addEventListener('click', api.openDrawer);
    document.getElementById('cartClose').addEventListener('click', api.closeDrawer);
    document.getElementById('cartOverlay').addEventListener('click', api.closeDrawer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.closeDrawer(); });

    /* Event delegation for line steppers inside the drawer */
    document.getElementById('cartBody').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      if (btn.dataset.act === 'inc') api.inc(id);
      else if (btn.dataset.act === 'dec') api.dec(id);
      else if (btn.dataset.act === 'rm') api.setQty(id, 0);
    });
  }

  function renderUI(){
    const count = api.count();
    const bar = document.getElementById('cartBar');
    if (bar) bar.classList.toggle('show', count > 0);
    const c = document.getElementById('cartBarCount'); if (c) c.textContent = count;
    const t = document.getElementById('cartBarTotal'); if (t) t.textContent = money(api.total());

    /* nav badge */
    const navBadge = document.getElementById('navCartCount');
    if (navBadge) { navBadge.textContent = count; navBadge.classList.toggle('show', count > 0); }

    const body = document.getElementById('cartBody');
    const foot = document.getElementById('cartFoot');
    if (!body || !foot) return;

    const list = api.list();
    if (list.length === 0){
      body.innerHTML = `
        <div class="cart-empty">
          <span class="cart-empty-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.3a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6"/></svg>
          </span>
          <p>Your basket is empty.</p>
          <span class="cart-empty-sub">Add a few desserts and they'll show up here.</span>
        </div>`;
      foot.innerHTML = '';
      return;
    }

    body.innerHTML = list.map(it => `
      <div class="cart-line">
        <div class="cart-line-info">
          <span class="cart-line-name">${esc(it.name)}</span>
          <span class="cart-line-price">${esc(it.priceLabel)} each</span>
        </div>
        <div class="cart-line-right">
          <div class="stepper has-qty cart-stepper">
            <button class="qbtn minus" data-act="dec" data-id="${esc(it.id)}" aria-label="Remove one ${esc(it.name)}">−</button>
            <span class="qval">${it.qty}</span>
            <button class="qbtn plus" data-act="inc" data-id="${esc(it.id)}" aria-label="Add one ${esc(it.name)}">+</button>
          </div>
          <span class="cart-line-total">${money(it.price*it.qty)}</span>
        </div>
      </div>`).join('');

    const sub = api.subtotal(), disc = api.discount(), tot = api.total();
    const toThreshold = DISCOUNT_THRESHOLD - sub;
    foot.innerHTML = `
      ${disc > 0
        ? `<div class="cart-reward on">★ 10% discount applied — you saved ${money(disc)}</div>`
        : (toThreshold > 0 ? `<div class="cart-reward">Spend ${money(toThreshold)} more for 10% off</div>` : '')}
      <div class="cart-sums">
        <div class="cart-sum"><span>Subtotal</span><span>${money(sub)}</span></div>
        ${disc > 0 ? `<div class="cart-sum disc"><span>Discount (10%)</span><span>−${money(disc)}</span></div>` : ''}
        <div class="cart-sum grand"><span>Total</span><span>${money(tot)}</span></div>
      </div>
      <a class="pill pill-gold cart-checkout" href="${checkoutHref()}">
        Checkout · ${money(tot)}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </a>
      <button class="cart-clear" id="cartClear" type="button">Clear basket</button>`;
    document.getElementById('cartClear')?.addEventListener('click', () => api.clear());
  }

  document.addEventListener('DOMContentLoaded', () => {
    mountUI();
    renderUI();
    api.onChange(renderUI);
  });

  return api;
})();
