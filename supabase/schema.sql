-- =====================================================================
-- Just Desserts — Supabase schema (auth + orders + stock + coupons)
-- Run this ONCE in your project:  Supabase dashboard → SQL Editor → paste → Run
-- =====================================================================

-- ---------- 1. PROFILES (one row per signed-up user; role splits owner/customer)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  address     text,
  postcode    text,
  role        text not null default 'customer' check (role in ('customer','owner')),
  created_at  timestamptz not null default now()
);

-- auto-create a profile whenever someone signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- non-owners can never change their own role (stops a customer making themself owner)
create or replace function public.protect_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'owner') then
    new.role := old.role;
  end if;
  return new;
end; $$;
drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles for each row execute function public.protect_role();

-- helper used by the security rules below (security definer = bypasses RLS, no recursion)
create or replace function public.is_owner()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner');
$$;

-- ---------- 2. ORDERS
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  ref              text unique not null,
  user_id          uuid references auth.users(id) on delete set null,
  mode             text not null default 'collection',     -- 'delivery' | 'collection'
  slot_date        date not null,
  slot_time        text not null,
  items            jsonb not null default '[]',
  item_count       int  not null default 0,
  subtotal         numeric(10,2) not null default 0,
  discount         numeric(10,2) not null default 0,
  coupon           text,
  coupon_discount  numeric(10,2) not null default 0,
  delivery_fee     numeric(10,2) not null default 0,
  total            numeric(10,2) not null default 0,
  name             text, phone text, email text,
  flat             text, address text, postcode text,
  business         text, business_address text,
  notes            text,
  status           text not null default 'New'
                   check (status in ('New','Confirmed','Preparing','Ready','Completed','Cancelled')),
  created_at       timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders(user_id);
create index if not exists orders_slot_idx on public.orders(slot_date, slot_time);

-- ---------- 3. STOCK (owner marks items sold out; site reads this to hide them)
create table if not exists public.stock (
  item_name   text primary key,
  sold_out    boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- ---------- 4. COUPONS
create table if not exists public.coupons (
  code     text primary key,
  type     text not null check (type in ('percent','amount')),
  value    numeric(10,2) not null,
  label    text,
  active   boolean not null default true
);

-- =====================================================================
-- ROW LEVEL SECURITY  — the heart of "customers can't see each other's data"
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.orders   enable row level security;
alter table public.stock    enable row level security;
alter table public.coupons  enable row level security;

-- PROFILES: you can read/update only your own row; the owner can read all.
drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles update" on public.profiles;
drop policy if exists "profiles insert" on public.profiles;
create policy "profiles read"   on public.profiles for select using (auth.uid() = id or public.is_owner());
create policy "profiles update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles insert" on public.profiles for insert with check (auth.uid() = id);

-- ORDERS: a customer sees only their own; the owner sees all. Customers create their own.
drop policy if exists "orders read"   on public.orders;
drop policy if exists "orders insert" on public.orders;
drop policy if exists "orders update" on public.orders;
create policy "orders read"   on public.orders for select using (public.is_owner() or auth.uid() = user_id);
create policy "orders insert" on public.orders for insert with check (auth.uid() = user_id or user_id is null);
create policy "orders update" on public.orders for update using (public.is_owner()) with check (public.is_owner());

-- STOCK: everyone can read (to grey-out sold-out items); only the owner edits.
drop policy if exists "stock read"  on public.stock;
drop policy if exists "stock write" on public.stock;
create policy "stock read"  on public.stock for select using (true);
create policy "stock write" on public.stock for all using (public.is_owner()) with check (public.is_owner());

-- COUPONS: anyone can read active codes (to validate at checkout); only the owner edits.
drop policy if exists "coupons read"  on public.coupons;
drop policy if exists "coupons write" on public.coupons;
create policy "coupons read"  on public.coupons for select using (active = true or public.is_owner());
create policy "coupons write" on public.coupons for all using (public.is_owner()) with check (public.is_owner());

-- =====================================================================
-- MAKE YOURSELF THE OWNER
-- 1) First, sign up once on the site with your email (so a profile row exists).
-- 2) Then run this (swap in your email):
--
--    update public.profiles set role = 'owner'
--    where id = (select id from auth.users where email = 'you@justdessertscrayford.co.uk');
--
-- That account now sees the /admin/ owner dashboard. Everyone else is a customer.
-- =====================================================================
