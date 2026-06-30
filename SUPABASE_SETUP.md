# Just Desserts — Accounts & Dashboards (Supabase)

This adds **customer logins** and an **owner login** with separate, user-friendly dashboards,
backed by Supabase (Postgres + Auth + Row Level Security). Free tier, no server to host.

> **Why it's secure:** passwords are bcrypt-hashed by Supabase (we never see them), sessions are
> signed JWTs, email confirmation is on, brute-force is rate-limited, and **Row Level Security**
> means the database itself refuses to give one customer another's data — even though the site's
> key is public (that's by design; the anon key is safe to expose).

---

## Step 1 — Create a free Supabase project (5 min)

1. Go to **https://supabase.com** → sign up → **New project**.
2. Pick a name (e.g. `just-desserts`), set a database password (save it), choose the closest region (London).
3. Wait ~2 min for it to provision.

## Step 2 — Run the schema

1. In your project: **SQL Editor** → **New query**.
2. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. This creates the `profiles`, `orders`, `stock`, `coupons` tables and all the security rules.

## Step 3 — Connect the site

1. In Supabase: **Project Settings → API**. Copy:
   - **Project URL** (e.g. `https://abcd1234.supabase.co`)
   - **anon public** key (a long string)
2. Open `assets/data.js` → find `CONFIG.supabase` and paste them in:
   ```js
   supabase: {
     url: 'https://abcd1234.supabase.co',
     anonKey: 'eyJhbGciOi...your-anon-key...',
   },
   ```
3. Commit & push. The **Account** link in the nav now works.

## Step 4 — Make yourself the owner

1. On the live site, open **/auth/** and **create an account** with your email.
2. Confirm via the email Supabase sends.
3. Back in Supabase **SQL Editor**, run (swap in your email):
   ```sql
   update public.profiles set role = 'owner'
   where id = (select id from auth.users where email = 'you@justdessertscrayford.co.uk');
   ```
4. Log in again — you'll land on the **owner dashboard** (`/admin/`). Everyone else sees the
   **customer dashboard** (`/account/`).

## Step 5 — Email settings (recommended)

- **Authentication → Providers → Email**: keep **Confirm email** ON (stops fake signups).
- **Authentication → URL Configuration**: set **Site URL** to your live site
  (e.g. `https://deuxenai-alt.github.io/dessert-house-crayford/`) so confirmation links work.
- The free tier sends a limited number of auth emails/hour. For higher volume, add an SMTP
  provider (e.g. Resend/SendGrid) under **Authentication → SMTP** later.

---

## What each login sees

| | Customer (`/account/`) | Owner (`/admin/`) |
|---|---|---|
| Orders | Their own — track status, reorder | **All** orders, live |
| Actions | Save address, reorder | Update status (New→Ready→Completed), toggle stock |
| Data isolation | Can't see anyone else's orders (RLS) | Full access (RLS owner check) |

> The two dashboards (`/account/`, `/admin/`) are **Phase 2** — added once your project is live
> so the access rules can be tested against real data.

---

## Coupons & stock (managed in Supabase, no code)

- **Coupons:** add rows to the `coupons` table (`code`, `type` = `percent`/`amount`, `value`, `label`, `active`).
- **Stock:** add a row to `stock` (`item_name` exactly as on the menu, `sold_out` = true) to grey it out on the site.
  (The owner dashboard will give you buttons for this so you won't need the table directly.)

---

## Cost

| | Free tier | When you'd pay |
|---|---|---|
| Auth (logins) | 50,000 monthly active users | basically never, for one shop |
| Database | 500 MB | thousands of orders fit easily |
| Bandwidth | 5 GB/mo | fine for a local shop |
| **Monthly** | **£0** | ~$25/mo only if you outgrow the above |
