/* =========================================================
   Shared render layer — runs on every page
   Reads data.js (CONFIG, CATEGORIES, MENU, FEATURED) and the page's
   data-page / data-category attributes to assemble the UI.
   Every menu item is rendered with an Uber-style +/- quantity stepper
   wired to window.Cart (cart.js).
   ========================================================= */
(function(){
  const PAGE = document.body.dataset.page || 'home';
  const CAT  = document.body.dataset.category || null;
  const BASE = document.body.dataset.base || './';   // '..' on subpage, '.' on root
  const r = (p) => BASE.replace(/\/$/, '') + '/' + p.replace(/^\//, '');

  const html = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  /* Stable id for the cart — category + item slug. Featured cards reuse this
     exact formula so adding from the home page syncs with the category page. */
  const itemId = (cat, name) => `${cat}__${slug(name)}`;

  /* A reusable stepper. Empty state = a single round "+"; once qty>0 it
     expands to  −  N  +  (Uber-style). data-* lets cart.js resync it. */
  function stepperHTML(id, name, price, cat){
    const qty = (window.Cart ? Cart.qtyOf(id) : 0);
    return `
      <div class="stepper${qty>0?' has-qty':''}" data-item-id="${html(id)}" data-name="${html(name)}" data-price="${html(price)}" data-cat="${html(cat)}">
        <button class="qbtn minus" type="button" aria-label="Remove one ${html(name)}">−</button>
        <span class="qval">${qty}</span>
        <button class="qbtn plus" type="button" aria-label="Add ${html(name)}">+</button>
      </div>`;
  }
  const soldBadge = () => `<span class="sold-badge">Not available</span>`;
  const trendBadge = () => `<span class="trend-badge"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2c.5 3-1 5-2.5 6.5S8 12 8 14a4 4 0 0 0 8 0c0-1-.3-2-1-3 2 .5 4 2.5 4 6a7 7 0 1 1-14 0C5 12 9 9 11 6c1-1.5 2-2.5 2-4z"/></svg>Trending</span>`;

  /* Wire every stepper on the page (delegated) + keep them in sync with cart */
  function wireSteppers(){
    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('.stepper .qbtn');
      if (!btn) return;
      const st = btn.closest('.stepper');
      /* Ignore clicks on sold-out items */
      if (st.closest('.sold-out')) return;
      const id = st.dataset.itemId;
      if (!window.Cart) return;
      if (btn.classList.contains('plus')) {
        if (Cart.qtyOf(id) === 0) Cart.add(id, st.dataset.name, st.dataset.price, st.dataset.cat);
        else Cart.inc(id);
      } else {
        Cart.dec(id);
      }
    });
  }

  /* Out-of-stock: data.js `soldOut:true` flags are applied at render time.
     The shop owner can ALSO mark items sold out (no code) via a "Stock" sheet
     in Google Sheets — we fetch the list once per session and apply it here.
     If the backend is unreachable, we silently fall back to the data.js flags. */
  async function applyStock(){
    let soldNames = [];
    try {
      const cached = sessionStorage.getItem('jd_stock');
      if (cached !== null) {
        soldNames = JSON.parse(cached);
      } else {
        const u = (CONFIG.bookingApi || '');
        if (u && !u.startsWith('REPLACE_')) {
          const res = await fetch(`${u}?action=stock`);
          const data = await res.json();
          soldNames = (data && data.soldOut) || [];
          sessionStorage.setItem('jd_stock', JSON.stringify(soldNames));
        }
      }
    } catch (e) { /* backend down — keep data.js flags only */ }
    if (!soldNames.length) return;
    const set = new Set(soldNames.map(s => String(s).toLowerCase().trim()));
    document.querySelectorAll('.item .stepper[data-name], .fcard .stepper[data-name]').forEach(st => {
      if (set.has(st.dataset.name.toLowerCase().trim())) {
        st.closest('.item, .fcard')?.classList.add('sold-out');
      }
    });
  }
  function syncSteppers(){
    if (!window.Cart) return;
    document.querySelectorAll('.stepper[data-item-id]').forEach(st => {
      const qty = Cart.qtyOf(st.dataset.itemId);
      st.classList.toggle('has-qty', qty > 0);
      const v = st.querySelector('.qval'); if (v) v.textContent = qty;
    });
  }

  /* =================== NAV =================== */
  function renderNav(){
    const mount = document.getElementById('nav-mount');
    if (!mount) return;
    const isActive = (page) => page === PAGE ? ' is-active' : '';
    mount.outerHTML = `
      <nav class="top" id="topNav">
        <div class="nav-inner">
          <a class="brand" href="${r('')}" aria-label="${html(CONFIG.brand.name)} home">
            <span class="mark" aria-hidden="true">${html(CONFIG.brand.monogram)}</span>
            <span class="name">${html(CONFIG.brand.name)}<small>${html(CONFIG.brand.place)}</small></span>
          </a>
          <ul class="nav-links">
            <li><a class="${isActive('menu')}" href="${r('menu/')}">Menu</a></li>
            <li><a class="${isActive('waffles')}" href="${r('waffles/')}">Waffles</a></li>
            <li><a class="${isActive('cookie-dough')}" href="${r('cookie-dough/')}">Cookie dough</a></li>
            <li><a class="${isActive('sundaes')}" href="${r('sundaes/')}">Sundaes</a></li>
            <li><a class="${isActive('visit')}" href="${r('#visit')}">Visit</a></li>
          </ul>
          <button class="nav-cart" id="navCart" type="button" aria-label="View your order">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.3a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6"/></svg>
            <span>Order</span>
            <span class="nav-cart-count" id="navCartCount">0</span>
          </button>
          <button class="nav-menu-btn" aria-label="Open menu" id="navMenuBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
        </div>
      </nav>
      <div class="nav-drawer" id="navDrawer" role="dialog" aria-modal="true" aria-label="Navigation">
        <button class="nav-drawer-close" aria-label="Close menu" id="navDrawerClose">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <a class="${isActive('home')}" href="${r('')}">Home</a>
        <a class="${isActive('menu')}" href="${r('menu/')}">All categories</a>
        ${CATEGORIES.map(c => `<a class="${isActive(c.id)}" href="${r(c.slug + '/')}">${html(c.title)}</a>`).join('')}
        <a class="${isActive('book')}" href="${r('book/')}">Checkout</a>
      </div>
    `;

    const nav = document.getElementById('topNav');
    const drawer = document.getElementById('navDrawer');
    document.getElementById('navMenuBtn')?.addEventListener('click', () => drawer.classList.add('open'));
    document.getElementById('navDrawerClose')?.addEventListener('click', () => drawer.classList.remove('open'));
    document.getElementById('navCart')?.addEventListener('click', () => { if (window.Cart) Cart.openDrawer(); });
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* =================== FOOTER =================== */
  function renderFooter(){
    const mount = document.getElementById('footer-mount');
    if (!mount) return;
    mount.outerHTML = `
      <footer>
        <div class="foot-inner">
          <span class="wordmark">${html(CONFIG.brand.name)} · ${html(CONFIG.brand.place)}</span>
          <span>© ${new Date().getFullYear()} — All rights reserved</span>
          <span>Photography: Unsplash</span>
        </div>
      </footer>
    `;
  }

  /* =================== HOME: FEATURED =================== */
  function renderHome(){
    const f = document.getElementById('featured-mount');
    if (!f) return;
    f.outerHTML = FEATURED.map(item => {
      const cat = (item.href || '').replace(/\/+$/,'');     // 'waffles/' -> 'waffles'
      const id = itemId(cat, item.name);
      const trending = item.rank <= 3;
      return `
      <article class="fcard${trending ? ' is-trending' : ''}${item.soldOut ? ' sold-out' : ''}">
        <a class="fcard-link" href="${r(item.href)}" aria-label="${html(item.name)}">
          <div class="fbg" style="background-image:url('${item.img}')"></div>
          ${trending ? trendBadge() : `<span class="frank">#${item.rank} most liked</span>`}
        </a>
        <div class="fbody">
          <h3>${html(item.name)}</h3>
          <div class="fbody-row">
            <div class="fprice">${html(item.price)}${item.rate ? ` <span class="frate">· ${html(item.rate)}</span>` : ''}</div>
            ${stepperHTML(id, item.name, item.price, cat)}
            ${soldBadge()}
          </div>
        </div>
      </article>`;
    }).join('');
  }

  /* =================== MENU: CATEGORY OVERVIEW =================== */
  function renderCategoryOverview(){
    const mount = document.getElementById('cat-overview-mount');
    if (!mount) return;
    mount.outerHTML = CATEGORIES.map(c => {
      const count = (MENU[c.id] || []).length;
      return `
        <a class="ccard" href="${r(c.slug + '/')}">
          <div class="cbg" style="background-image:url('${c.thumb}')"></div>
          <div class="cbody">
            <h3>${html(c.title)}</h3>
            <div class="cmeta">
              <span>${count} item${count===1?'':'s'}</span>
              <span class="arr">Order →</span>
            </div>
          </div>
        </a>`;
    }).join('');
  }

  /* =================== CATEGORY PAGE =================== */
  function renderCategoryPage(){
    if (!CAT) return;
    const cat = CATEGORIES.find(c => c.id === CAT);
    if (!cat) return;

    document.title = `${cat.title} — ${CONFIG.brand.name} · ${CONFIG.brand.place}`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', cat.description);

    const hero = document.getElementById('chero-mount');
    if (hero) {
      hero.outerHTML = `
        <section class="chero">
          <div class="hero-photo" aria-hidden="true" style="background-image:url('${cat.hero}')"></div>
          <div class="hero-scrim" aria-hidden="true"></div>
          <div class="hero-grain" aria-hidden="true"></div>
          <div class="chero-inner">
            <p class="eyebrow">Category · ${(MENU[CAT]||[]).length} items</p>
            <h1>${html(cat.title)} <em>—</em> ${html(cat.tagline)}</h1>
            <p class="chero-sub">${html(cat.description)}</p>
            <div class="chero-meta">
              <span><b>Collection</b> · 3 pm – 11 pm</span>
              <span><b>10% off</b> when you spend £20+</span>
            </div>
          </div>
        </section>`;
    }

    const items = document.getElementById('items-mount');
    if (items) {
      const list = MENU[CAT] || [];
      items.outerHTML = `
        <section class="items-wrap">
          <div class="wrap">
            <div class="sec-head">
              <p class="eyebrow center">Order for collection</p>
              <h2><span class="stop-flourish">Every ${html(cat.title.toLowerCase())}</span></h2>
              <p class="sec-sub">Tap <b style="color:var(--gold)">+</b> to add to your basket. Your order follows you across the menu — check out when you're ready.</p>
            </div>
            <div class="items">
              ${list.map(it => {
                const id = itemId(CAT, it.name);
                return `
                <article class="item${it.soldOut ? ' sold-out' : ''}" data-item="${html(id)}">
                  <div class="item-top">
                    <h3 class="item-name">${html(it.name)}</h3>
                    <span class="item-price">${html(it.price)}</span>
                  </div>
                  ${(it.tag || it.rate) ? `<div class="item-meta">
                    ${it.tag === 'new' ? '<span class="tag new">New</span>' : ''}
                    ${it.tag === 'pop' ? '<span class="tag pop">Popular</span>' : ''}
                    ${it.rate ? `<span class="rate">★ ${html(it.rate)}</span>` : ''}
                  </div>` : ''}
                  ${it.desc ? `<p class="item-desc">${html(it.desc)}</p>` : ''}
                  <div class="item-foot">
                    ${stepperHTML(id, it.name, it.price, CAT)}
                    ${soldBadge()}
                  </div>
                </article>`;
              }).join('')}
            </div>
          </div>
        </section>`;
    }

    const related = document.getElementById('related-mount');
    if (related) {
      const others = CATEGORIES.filter(c => c.id !== CAT).slice(0, 4);
      related.outerHTML = `
        <section class="related">
          <div class="wrap">
            <div class="sec-head" style="padding-top:0">
              <p class="eyebrow center">More to try</p>
              <h2><span class="stop-flourish">Add something else</span></h2>
            </div>
            <div class="related-grid">
              ${others.map(c => `
                <a class="rcard" href="${r(c.slug + '/')}">
                  <span class="rimg" style="background-image:url('${c.thumb}')"></span>
                  <span class="rbody">
                    <span class="rname">${html(c.title)}</span>
                    <span class="rcount">${(MENU[c.id]||[]).length} items</span>
                  </span>
                </a>
              `).join('')}
            </div>
          </div>
        </section>`;
    }
  }

  /* =================== HOURS / VISIT (shared partials) =================== */
  function renderHours(){
    const mount = document.getElementById('hours-mount');
    if (!mount) return;
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    mount.outerHTML = `
      <section class="strip" id="hours">
        <p class="eyebrow center" style="display:inline-flex">Collection hours</p>
        <h2><span class="stop-flourish">Open every evening</span></h2>
        <div class="hours">
          ${days.map(d => `<div class="day">${d}</div><div class="time">3 pm – 11 pm</div>`).join('')}
        </div>
      </section>`;
  }

  function renderVisit(){
    const mount = document.getElementById('visit-mount');
    if (!mount) return;
    mount.outerHTML = `
      <section class="visit" id="visit">
        <div class="wrap">
          <p class="eyebrow center" style="display:inline-flex">Find us</p>
          <h2><span class="stop-flourish">In the heart of Crayford</span></h2>
          <p class="vintro">Order online for collection, or walk in. We're open every evening until 11.</p>

          <div class="visit-grid">
            <div class="vcard">
              <h4>Address</h4>
              <p>${html(CONFIG.brand.address).replace(/, /g,'<br>')}</p>
            </div>
            <div class="vcard">
              <h4>Contact</h4>
              <p><a href="${html(CONFIG.brand.phoneHref)}">${html(CONFIG.brand.phone)}</a><br><a href="mailto:${html(CONFIG.brand.email)}">${html(CONFIG.brand.email)}</a></p>
            </div>
            <div class="vcard">
              <h4>Collection hours</h4>
              <p>Every day<br>${html(CONFIG.hours.open)} – ${html(CONFIG.hours.close)}<br>Last order ${html(CONFIG.hours.lastBooking)}</p>
            </div>
          </div>

          <div class="hero-actions" style="margin-top:50px;justify-content:center">
            <a class="pill pill-gold" href="${r('menu/')}">Start an order</a>
            <a class="pill pill-ghost" href="${r('book/')}">Go to checkout</a>
          </div>
        </div>
      </section>`;
  }

  /* =================== KICKOFF =================== */
  document.addEventListener('DOMContentLoaded', () => {
    renderNav();
    renderHome();
    renderCategoryOverview();
    renderCategoryPage();
    renderHours();
    renderVisit();
    renderFooter();
    wireSteppers();
    syncSteppers();
    if (window.Cart) Cart.onChange(syncSteppers);
    applyStock();
    /* Checkout page initialises itself if checkout.js is loaded */
  });
})();
