/* =========================================================
   Supabase client + auth helpers (window.JD)
   Loaded AFTER the supabase-js CDN script and data.js on any page
   that needs login (auth, account, admin). Safe to load everywhere.
   ========================================================= */
window.JD = window.JD || {};
(function(){
  const cfg = (window.CONFIG && CONFIG.supabase) || {};
  JD.supaReady = !!(cfg.url && cfg.anonKey
    && !String(cfg.url).startsWith('REPLACE_')
    && !String(cfg.anonKey).startsWith('REPLACE_'));

  JD.supabase = (JD.supaReady && window.supabase)
    ? window.supabase.createClient(cfg.url, cfg.anonKey)
    : null;

  /* current session / user */
  JD.getSession = async () => {
    if (!JD.supabase) return null;
    const { data } = await JD.supabase.auth.getSession();
    return data ? data.session : null;
  };
  JD.getUser = async () => { const s = await JD.getSession(); return s ? s.user : null; };

  /* profile (incl. role) for the logged-in user */
  JD.getProfile = async () => {
    const u = await JD.getUser();
    if (!u) return null;
    const { data } = await JD.supabase.from('profiles').select('*').eq('id', u.id).maybeSingle();
    return data;
  };
  JD.isOwner = async () => { const p = await JD.getProfile(); return !!(p && p.role === 'owner'); };

  JD.signOut = async () => { if (JD.supabase) await JD.supabase.auth.signOut(); };

  /* gate a page: bounce to the login page if not signed in */
  JD.requireAuth = async (loginHref) => {
    if (!JD.supabase) return null;
    const u = await JD.getUser();
    if (!u) { location.href = loginHref || '../auth/'; return null; }
    return u;
  };

  /* react to login/logout across tabs */
  JD.onAuth = (cb) => { if (JD.supabase) JD.supabase.auth.onAuthStateChange((_e, s) => cb(s)); };
})();
