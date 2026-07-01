/* =========================================================
   Owner dashboard (/admin/) — live orders, status updates, stock control.
   Gated to role='owner'. RLS also enforces owner-only writes server-side.
   ========================================================= */
(function(){
  if (document.body.dataset.page !== 'admin') return;
  const root = document.getElementById('dash-root');
  const html = (s) => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (n) => '£' + (Math.round(Number(n||0)*100)/100).toFixed(2);
  const STATUSES = ['New','Confirmed','Preparing','Ready','Completed','Cancelled'];

  function notReady(){
    root.innerHTML = `<div class="dash-empty"><b style="color:var(--text)">Accounts aren't switched on yet.</b><br>Add your Supabase keys in <code>assets/data.js</code> and run the schema. See <code>SUPABASE_SETUP.md</code>.</div>`;
  }

  async function init(){
    if (!window.JD || !JD.supaReady){ notReady(); return; }
    const user = await JD.requireAuth('../auth/');
    if (!user) return;
    const owner = await JD.isOwner();
    if (!owner){
      root.innerHTML = `<div class="dash-empty"><b style="color:var(--text)">This area is for the shop owner.</b><br><a href="../account/">Go to your account →</a></div>`;
      return;
    }
    await renderShell(user);
    await loadOrders();
  }

  let shellUser;
  async function renderShell(user){
    shellUser = user;
    root.innerHTML = `
      <div class="dash-head">
        <div><h1>Owner dashboard</h1><p class="who">${html(user.email)}</p></div>
        <button class="dash-signout" id="signout">Sign out</button>
      </div>
      <div class="dash-tabs">
        <button class="dash-tab is-active" data-pane="orders">Orders</button>
        <button class="dash-tab" data-pane="stock">Stock</button>
      </div>
      <div id="pane-orders"><div class="slots-loading"><span class="spin"></span><span>Loading orders…</span></div></div>
      <div id="pane-stock" style="display:none"></div>`;

    document.getElementById('signout').addEventListener('click', async () => { await JD.signOut(); location.href='../'; });
    root.querySelectorAll('.dash-tabs .dash-tab').forEach(b => b.addEventListener('click', () => {
      root.querySelectorAll('.dash-tabs .dash-tab').forEach(x=>x.classList.remove('is-active'));
      b.classList.add('is-active');
      const ord = b.dataset.pane === 'orders';
      document.getElementById('pane-orders').style.display = ord ? '' : 'none';
      document.getElementById('pane-stock').style.display = ord ? 'none' : '';
      if (!ord) loadStock();
    }));
  }

  /* ---------- ORDERS ---------- */
  async function loadOrders(){
    const pane = document.getElementById('pane-orders');
    const { data: orders, error } = await JD.supabase.from('orders').select('*').order('created_at',{ascending:false}).limit(200);
    if (error){ pane.innerHTML = `<div class="dash-empty">Couldn't load: ${html(error.message)}</div>`; return; }

    const today = new Date().toISOString().slice(0,10);
    const todays = orders.filter(o => (o.slot_date||'').slice(0,10) === today);
    const takings = todays.filter(o=>o.status!=='Cancelled').reduce((s,o)=>s+Number(o.total||0),0);
    const newCount = orders.filter(o=>o.status==='New').length;

    pane.innerHTML = `
      <div class="dash-stats">
        <div class="dash-stat"><div class="n">${orders.length}</div><div class="l">Total orders</div></div>
        <div class="dash-stat"><div class="n">${newCount}</div><div class="l">New / unactioned</div></div>
        <div class="dash-stat"><div class="n">${todays.length}</div><div class="l">For today</div></div>
        <div class="dash-stat"><div class="n">${money(takings)}</div><div class="l">Today's takings</div></div>
      </div>
      ${orders.length===0 ? `<div class="dash-empty">No orders yet.</div>` : orders.map(orderCard).join('')}`;

    pane.querySelectorAll('select[data-id]').forEach(sel => sel.addEventListener('change', async () => {
      sel.disabled = true;
      const { error } = await JD.supabase.from('orders').update({ status: sel.value }).eq('id', sel.dataset.id);
      sel.disabled = false;
      if (!error){ const badge = sel.closest('.order-card').querySelector('.ostatus'); if (badge){ badge.className = 'ostatus ' + sel.value; badge.textContent = sel.value; } }
      else alert('Could not update: ' + error.message);
    }));
  }

  function orderCard(o){
    const when = new Date(o.created_at).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    const items = Array.isArray(o.items) ? o.items : [];
    const addr = o.mode==='delivery' ? `${html(o.flat?o.flat+', ':'')}${html(o.address||'')} ${html(o.postcode||'')}` : 'Collection';
    return `
      <div class="order-card">
        <div class="oc-top">
          <span class="oc-ref">${html(o.ref)} · ${statusBadgeHTML(o.status)}</span>
          <span class="oc-when">${html(o.mode==='delivery'?'🚗 Delivery':'🛍️ Collection')} · placed ${when}</span>
        </div>
        <div class="oc-items">${items.map(it=>`${it.qty}× ${html(it.name)}`).join(' · ')||'—'}</div>
        <div class="oc-items" style="font-size:.82rem;margin-top:6px">
          👤 ${html(o.name||'')} · 📞 ${html(o.phone||'')} ${o.email?'· '+html(o.email):''}<br>
          📍 ${addr}${o.coupon?` · 🎟️ ${html(o.coupon)}`:''}${o.notes?`<br>📝 ${html(o.notes)}`:''}
        </div>
        <div class="oc-foot">
          <span class="oc-total">${money(o.total)}${Number(o.delivery_fee)>0?` <span style="color:var(--muted);font-weight:400;font-size:.8rem">(inc. ${money(o.delivery_fee)} delivery)</span>`:''}</span>
          <div class="oc-actions">
            <select data-id="${html(o.id)}">${STATUSES.map(s=>`<option${s===o.status?' selected':''}>${s}</option>`).join('')}</select>
          </div>
        </div>
      </div>`;
  }
  function statusBadgeHTML(s){ return `<span class="ostatus ${html(s)}">${html(s)}</span>`; }

  /* ---------- STOCK ---------- */
  async function loadStock(){
    const pane = document.getElementById('pane-stock');
    if (pane.dataset.loaded) return;
    pane.innerHTML = `<div class="slots-loading"><span class="spin"></span><span>Loading stock…</span></div>`;
    const { data: stockRows } = await JD.supabase.from('stock').select('*');
    const soldOut = new Set((stockRows||[]).filter(r=>r.sold_out).map(r=>String(r.item_name).toLowerCase().trim()));

    pane.innerHTML = `<p class="co-hint" style="margin-bottom:18px">Toggle an item off to show <b style="color:var(--danger)">Not available</b> on the site. Customers can't order it until you toggle it back.</p>` +
      CATEGORIES.map(c => `
        <div class="co-block" style="border:none;padding-bottom:8px;margin-bottom:8px">
          <div class="co-block-head" style="margin-bottom:10px"><h2 style="font-size:1.2rem">${html(c.title)}</h2></div>
          ${(MENU[c.id]||[]).map(it => `
            <div class="stock-row">
              <span class="nm">${html(it.name)} <span style="color:var(--muted)">${html(it.price)}</span></span>
              <button class="toggle ${soldOut.has(it.name.toLowerCase().trim())?'':'on'}" data-name="${html(it.name)}" aria-label="Toggle ${html(it.name)}"></button>
            </div>`).join('')}
        </div>`).join('');
    pane.dataset.loaded = '1';

    pane.querySelectorAll('.toggle').forEach(t => t.addEventListener('click', async () => {
      const available = t.classList.contains('on');   // currently on = available
      const name = t.dataset.name;
      t.classList.toggle('on');                        // optimistic
      if (available){
        /* turning OFF → mark sold out */
        const { error } = await JD.supabase.from('stock').upsert({ item_name: name, sold_out: true, updated_at: new Date().toISOString() });
        if (error){ t.classList.toggle('on'); alert(error.message); }
      } else {
        /* turning ON → back in stock (delete row) */
        const { error } = await JD.supabase.from('stock').delete().eq('item_name', name);
        if (error){ t.classList.toggle('on'); alert(error.message); }
      }
    }));
  }

  init();
})();
