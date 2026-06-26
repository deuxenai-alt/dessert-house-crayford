/* =========================================================
   Shared render layer — runs on every page
   Reads data.js (CONFIG, CATEGORIES, MENU, FEATURED) and the page's
   data-page / data-category attributes to assemble the UI.
   ========================================================= */
(function(){
  const PAGE = document.body.dataset.page || 'home';
  const CAT  = document.body.dataset.category || null;
  const BASE = document.body.dataset.base || './';   // '..' on subpage, '.' on root
  const r = (p) => BASE.replace(/\/$/, '') + '/' + p.replace(/^\//, '');

  const html = (s) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
          <a class="nav-cta" href="${r('book/')}">
            Reserve
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </a>
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
        <a class="${isActive('book')}" href="${r('book/')}">Reserve a table</a>
      </div>
    `;

    /* Drawer toggle + nav scroll background */
    const nav = document.getElementById('topNav');
    const drawer = document.getElementById('navDrawer');
    document.getElementById('navMenuBtn')?.addEventListener('click', () => drawer.classList.add('open'));
    document.getElementById('navDrawerClose')?.addEventListener('click', () => drawer.classList.remove('open'));
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

  /* =================== HOME: HERO ETC =================== */
  function renderHome(){
    const f = document.getElementById('featured-mount');
    if (!f) return;
    f.outerHTML = FEATURED.map(item => `
      <a class="fcard" href="${r(item.href)}">
        <div class="fbg" style="background-image:url('${item.img}')"></div>
        <span class="frank">#${item.rank} most liked</span>
        <div class="fbody">
          <h3>${html(item.name)}</h3>
          <div class="fprice">${html(item.price)}${item.rate ? ` <span class="frate">· ${html(item.rate)}</span>` : ''}</div>
        </div>
      </a>
    `).join('');
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
              <span class="arr">View →</span>
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

    /* Set page metadata */
    document.title = `${cat.title} — ${CONFIG.brand.name} · ${CONFIG.brand.place}`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', cat.description);

    /* Hero */
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
              <span><b>Open now</b> · 3 pm – 11 pm</span>
              <span><b>10% off</b> when you spend £20+</span>
            </div>
          </div>
        </section>`;
    }

    /* Items */
    const items = document.getElementById('items-mount');
    if (items) {
      const list = MENU[CAT] || [];
      items.outerHTML = `
        <section class="items-wrap">
          <div class="wrap">
            <div class="sec-head">
              <p class="eyebrow center">The list</p>
              <h2><span class="stop-flourish">Every ${html(cat.title.toLowerCase())}</span></h2>
              <p class="sec-sub">Tap any item name to read the description. Want to reserve a table to eat in? Use the Reserve button above.</p>
            </div>
            <div class="items">
              ${list.map(it => `
                <article class="item">
                  <div class="item-row">
                    <h3 class="item-name">${html(it.name)}</h3>
                    <span class="item-price">${html(it.price)}</span>
                  </div>
                  ${(it.tag || it.rate) ? `<div class="item-meta">
                    ${it.tag === 'new' ? '<span class="tag new">New</span>' : ''}
                    ${it.tag === 'pop' ? '<span class="tag pop">Popular</span>' : ''}
                    ${it.rate ? `<span class="rate">★ ${html(it.rate)}</span>` : ''}
                  </div>` : ''}
                  ${it.desc ? `<p class="item-desc">${html(it.desc)}</p>` : ''}
                </article>
              `).join('')}
            </div>
          </div>
        </section>`;
    }

    /* Related categories */
    const related = document.getElementById('related-mount');
    if (related) {
      const others = CATEGORIES.filter(c => c.id !== CAT).slice(0, 4);
      related.outerHTML = `
        <section class="related">
          <div class="wrap">
            <div class="sec-head" style="padding-top:0">
              <p class="eyebrow center">More to try</p>
              <h2><span class="stop-flourish">Browse other categories</span></h2>
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
        <p class="eyebrow center" style="display:inline-flex">Opening hours</p>
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
          <p class="vintro">Walk in, click &amp; collect, or order delivery. We're open every evening until 11.</p>

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
              <h4>Hours</h4>
              <p>Every day<br>${html(CONFIG.hours.open)} – ${html(CONFIG.hours.close)}<br>Last booking ${html(CONFIG.hours.lastBooking)}</p>
            </div>
          </div>

          <div class="hero-actions" style="margin-top:50px;justify-content:center">
            <a class="pill pill-gold" href="${r('book/')}">Reserve a table</a>
            <a class="pill pill-ghost" href="${r('menu/')}">View the menu</a>
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
    /* Booking page initialises itself if booking.js is loaded */
  });
})();
