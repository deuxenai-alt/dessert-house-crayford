/* =========================================================
   Auth page — login / signup (Supabase email + password)
   New users → signup form (collects details). Existing → login.
   ========================================================= */
(function(){
  if (document.body.dataset.page !== 'auth') return;

  const $ = (id) => document.getElementById(id);
  const html = (s) => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* If Supabase isn't connected yet, explain and stop. */
  function notReady(){
    $('auth-banner').innerHTML = `
      <div class="form-status err" style="display:block;margin-bottom:20px">
        <b>Accounts aren't switched on yet.</b> Add your Supabase Project URL + anon key in
        <code>assets/data.js</code> and run <code>supabase/schema.sql</code>. See <code>SUPABASE_SETUP.md</code>.
      </div>`;
    document.querySelectorAll('.auth-submit').forEach(b => b.disabled = true);
  }

  /* ---------- tab switching ---------- */
  function show(which){
    const login = which === 'login';
    $('form-login').classList.toggle('is-hidden', !login);
    $('form-signup').classList.toggle('is-hidden', login);
    $('tab-login').classList.toggle('is-active', login);
    $('tab-signup').classList.toggle('is-active', !login);
  }
  $('tab-login').addEventListener('click', () => show('login'));
  $('tab-signup').addEventListener('click', () => show('signup'));
  $('goto-signup').addEventListener('click', () => show('signup'));
  $('goto-login').addEventListener('click', () => show('login'));

  if (!window.JD || !JD.supaReady || !JD.supabase){ notReady(); return; }

  /* Already logged in? Send them to their dashboard. */
  (async () => {
    const u = await JD.getUser();
    if (u){ const owner = await JD.isOwner(); location.replace(owner ? '../admin/' : '../account/'); }
  })();

  /* ---------- helpers ---------- */
  function setLoading(btn, on){ btn.classList.toggle('loading', on); btn.disabled = on; }
  function status(el, type, msg){ el.className = 'form-status' + (type?(' '+type):''); el.innerHTML = msg || ''; }
  async function routeByRole(){
    const owner = await JD.isOwner();
    location.href = owner ? '../admin/' : '../account/';
  }

  /* ---------- LOG IN ---------- */
  $('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btn-login'), st = $('login-status');
    const email = $('li-email').value.trim();
    const pass  = $('li-pass').value;
    if (!email || !pass){ status(st,'err','<b>Enter your email and password.</b>'); return; }
    setLoading(btn, true); status(st, '', '');
    try {
      const { error } = await JD.supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      status(st, 'ok', 'Signed in — taking you to your dashboard…');
      await routeByRole();
    } catch (err) {
      const m = /invalid login/i.test(err.message) ? 'Email or password is incorrect.'
              : /confirm/i.test(err.message) ? 'Please confirm your email first — check your inbox.'
              : html(err.message);
      status(st, 'err', `<b>Couldn't log you in.</b> ${m}`);
    } finally { setLoading(btn, false); }
  });

  /* ---------- FORGOT PASSWORD ---------- */
  $('link-forgot').addEventListener('click', async () => {
    const st = $('login-status');
    const email = $('li-email').value.trim();
    if (!email){ status(st,'err','Enter your email above first, then tap “Forgot your password?”'); return; }
    try {
      const { error } = await JD.supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname.replace('/auth/','/auth/') });
      if (error) throw error;
      status(st, 'ok', `Password reset link sent to <b>${html(email)}</b>. Check your inbox.`);
    } catch (err) { status(st, 'err', html(err.message)); }
  });

  /* ---------- SIGN UP ---------- */
  const sv = {
    name:  v => v.trim().length >= 2,
    phone: v => v.replace(/[^\d]/g,'').length >= 7,
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
    pass:  v => v.length >= 8,
  };
  ['name','phone','email','pass'].forEach(k => {
    const el = $('su-'+k);
    el.addEventListener('blur', () => el.closest('.field').classList.toggle('has-error', !sv[k](el.value)));
  });

  $('form-signup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btn-signup'), st = $('signup-status');
    let bad = null;
    ['name','phone','email','pass'].forEach(k => {
      const el = $('su-'+k); const ok = sv[k](el.value);
      el.closest('.field').classList.toggle('has-error', !ok);
      if (!ok && !bad) bad = el;
    });
    if (bad){ bad.focus(); return; }

    setLoading(btn, true); status(st, '', '');
    try {
      const { data, error } = await JD.supabase.auth.signUp({
        email: $('su-email').value.trim(),
        password: $('su-pass').value,
        options: { data: { full_name: $('su-name').value.trim(), phone: $('su-phone').value.trim() } },
      });
      if (error) throw error;
      /* If email confirmation is on, there is no active session yet. */
      if (data.session){ await routeByRole(); }
      else {
        status(st, 'ok', `<b>Almost there!</b> We've emailed <b>${html($('su-email').value.trim())}</b> a confirmation link. Click it, then log in.`);
        $('form-signup').reset();
      }
    } catch (err) {
      const m = /already registered/i.test(err.message) ? 'That email already has an account — try logging in.' : html(err.message);
      status(st, 'err', `<b>Couldn't create your account.</b> ${m}`);
    } finally { setLoading(btn, false); }
  });
})();
