/* =========================================================
   Customer dashboard (/account/) — track orders, reorder, details.
   RLS guarantees a customer only ever receives their OWN orders.
   ========================================================= */
(function(){
  if (document.body.dataset.page !== 'account') return;
  const root = document.getElementById('dash-root');
  const html = (s) => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (n) => '£' + (Math.round(Number(n||0)*100)/100).toFixed(2);
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

  function notReady(){
    root.innerHTML = `<div class="dash-empty"><b style="color:var(--text)">Accounts aren't switched on yet.</b><br>Add your Supabase keys in <code>assets/data.js</code> and run the schema. See <code>SUPABASE_SETUP.md</code>.</div>`;
  }

  async function init(){
    if (!window.JD || !JD.supaReady){ notReady(); return; }
    const user = await JD.requireAuth('../auth/');
    if (!user) return;                       // redirected to login
    const profile = await JD.getProfile();
    if (profile && profile.role === 'owner'){ location.replace('../admin/'); return; }

    const { data: orders, error } = await JD.supabase
      .from('orders').select('*').order('created_at', { ascending: false });
    render(profile || {}, user, orders || [], error);
  }

  function statusBadge(s){ return `<span class="ostatus ${html(s)}">${html(s)}</span>`; }

  function orderCard(o){
    const when = new Date(o.created_at).toLocaleDateString(undefined,{day:'numeric',month:'short'});
    const items = Array.isArray(o.items) ? o.items : [];
    return `
      <div class="order-card">
        <div class="oc-top">
          <span class="oc-ref">${html(o.ref)}</span>
          <span class="oc-when">${html(o.mode==='delivery'?'Delivery':'Collection')} · ordered ${when}</span>
        </div>
        <div class="oc-items">${items.map(it => `${it.qty}× ${html(it.name)}`).join(' · ') || '—'}</div>
        <div class="oc-foot">
          <span class="oc-total">${money(o.total)}</span>
          <div class="oc-actions">
            ${statusBadge(o.status)}
            <button class="dash-tab" data-reorder='${html(JSON.stringify(items))}'>Reorder</button>
          </div>
        </div>
      </div>`;
  }

  function render(profile, user, orders, error){
    const name = (profile.full_name || user.email || '').split(' ')[0];
    root.innerHTML = `
      <div class="dash-head">
        <div>
          <h1>Hi${name?', '+html(name):''} 👋</h1>
          <p class="who">${html(user.email)}</p>
        </div>
        <button class="dash-signout" id="signout">Sign out</button>
      </div>

      <div class="dash-tabs">
        <button class="dash-tab is-active" data-pane="orders">My orders</button>
        <button class="dash-tab" data-pane="details">My details</button>
      </div>

      <div id="pane-orders">
        ${error ? `<div class="dash-empty">Couldn't load your orders: ${html(error.message)}</div>`
          : orders.length === 0
            ? `<div class="dash-empty">No orders yet.<br><a href="../menu/">Browse the menu →</a></div>`
            : orders.map(orderCard).join('')}
      </div>

      <div id="pane-details" style="display:none;max-width:520px">
        <div class="form-grid">
          <div class="field"><label for="p-name">Full name</label><input id="p-name" type="text" value="${html(profile.full_name||'')}"></div>
          <div class="field"><label for="p-phone">Phone</label><input id="p-phone" type="tel" value="${html(profile.phone||'')}"></div>
          <div class="field full"><label for="p-address">Address</label><input id="p-address" type="text" value="${html(profile.address||'')}"></div>
          <div class="field"><label for="p-postcode">Post code</label><input id="p-postcode" type="text" value="${html(profile.postcode||'')}"></div>
        </div>
        <button class="pill pill-gold" id="save-details" style="margin-top:8px"><span class="label">Save details</span></button>
        <div class="form-status" id="details-status" role="status" aria-live="polite"></div>
      </div>`;

    document.getElementById('signout').addEventListener('click', async () => { await JD.signOut(); location.href='../'; });

    root.querySelectorAll('.dash-tabs .dash-tab').forEach(b => b.addEventListener('click', () => {
      root.querySelectorAll('.dash-tabs .dash-tab').forEach(x=>x.classList.remove('is-active'));
      b.classList.add('is-active');
      const orders = b.dataset.pane === 'orders';
      document.getElementById('pane-orders').style.display = orders ? '' : 'none';
      document.getElementById('pane-details').style.display = orders ? 'none' : '';
    }));

    /* reorder → rebuild basket → checkout */
    root.querySelectorAll('[data-reorder]').forEach(b => b.addEventListener('click', () => {
      try {
        const items = JSON.parse(b.dataset.reorder);
        Cart.clear();
        items.forEach(it => { const id = 'reorder__'+slug(it.name); Cart.add(id, it.name, money(it.price), ''); Cart.setQty(id, it.qty); });
        location.href = '../book/';
      } catch(e){}
    }));

    /* save profile details */
    document.getElementById('save-details').addEventListener('click', async () => {
      const st = document.getElementById('details-status');
      const patch = {
        full_name: document.getElementById('p-name').value.trim(),
        phone: document.getElementById('p-phone').value.trim(),
        address: document.getElementById('p-address').value.trim(),
        postcode: document.getElementById('p-postcode').value.trim(),
      };
      const { error } = await JD.supabase.from('profiles').update(patch).eq('id', user.id);
      st.className = 'form-status ' + (error ? 'err' : 'ok');
      st.innerHTML = error ? `Couldn't save: ${html(error.message)}` : 'Saved ✓';
    });
  }

  init();
})();
