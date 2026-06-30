# Dessert House — Setup

A multi-page dessert shop with an **Uber Eats–style takeaway ordering system**: every item has a +/- quantity stepper, a live basket follows the customer across the menu, and orders land in your Google Sheet. Hosts on GitHub Pages (free), orders live in your Google Sheet (free), no monthly cost. Customers pay on collection.

---

## File structure

```
dessert-shop/
├── index.html              ← Home
├── menu/index.html         ← All categories overview
├── waffles/                ← Category pages — one folder each
├── cookie-dough/
├── sundaes/
├── milkshakes/
├── gelato/
├── cakes/
├── pot-of-fruits/
├── drinks/
├── book/index.html         ← Checkout (basket → collection time → details)
├── assets/
│   ├── site.css            ← Shared design system
│   ├── data.js             ← Menu + brand + orders API URL
│   ├── app.js              ← Nav / footer / page render + item steppers
│   ├── cart.js             ← Basket state + floating bar + slide-in drawer
│   └── checkout.js         ← Order review + collection time + order POST
├── apps-script/Code.gs     ← Paste into your Google Sheet (see below)
└── SETUP.md                ← You're reading it
```

To edit a menu item, change the entry in `assets/data.js` — every page that lists it updates.

---

## Step 1 — Set up the Google Sheet booking backend

1. **Create a new Google Sheet** (any name — "Dessert House Bookings" works).
2. **Extensions → Apps Script** — this opens the script editor in a new tab.
3. Delete the default `function myFunction() {}` and **paste the entire contents of `apps-script/Code.gs`** from this repo.
4. **Save** (cmd/ctrl + S). Name the project anything.
5. **Deploy → New deployment** (top right).
   - Type: **Web app**
   - Description: `Dessert House booking API`
   - Execute as: **Me (your account)**
   - Who has access: **Anyone**
   - Click **Deploy**.
6. Google asks you to authorise the script — click through (it needs Sheets + Mail access).
7. **Copy the Web App URL** at the bottom of the dialog. Looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

### Step 2 — Wire the site to the backend

Open `assets/data.js`. Find this line:

```js
bookingApi: 'REPLACE_WITH_YOUR_APPS_SCRIPT_WEB_APP_URL',
```

Replace the placeholder with the Web App URL from step 1.7. Commit and push.

That's it — visit `/book/` and you'll see live availability.

> **Until you wire the backend**, `/book/` runs in **demo mode** with fake slot data so you can see how the flow looks. A yellow banner at the top of the page tells you it's not connected yet.

---

## Step 3 — Configure the booking system

The Apps Script creates three sheets on first run:

### `Orders` sheet
Every order is appended here. Columns:
`Ref | Created | Collection Date | Collection Time | Items | Item Count | Subtotal | Discount | Total | Name | Phone | Email | Notes | Status | Source`

- **Items** is a readable list, e.g. `2× Oreo Waffle (£19.90)`.
- **Status** starts as `New`. Change to `Confirmed`, `Ready`, `Collected`, or `Cancelled` as you go.
- Set status to `Cancelled` to free that collection slot for new orders.

### `Closed` sheet
Days you're not opening. Add a row per closed date:
- **Date**: in YYYY-MM-DD format (or any cell-recognised date)
- **Reason**: optional note (e.g. "Christmas Day", "Private event")

### `Config` sheet
Tweak ordering behaviour without editing code:

| Key | Default | What it does |
|-----|---------|--------------|
| `ORDERS_PER_SLOT` | 8 | Max orders per 30-min collection slot |
| `SLOT_MINUTES` | 30 | Collection slot length (15, 30, or 60 work well) |
| `OPEN_HOUR` | 15 | 24h opening hour (15 = 3pm) |
| `CLOSE_HOUR` | 23 | 24h closing hour (23 = 11pm) |
| `LAST_BOOKING_OFFSET_MIN` | 30 | Last collection slot before close |
| `NOTIFY_EMAIL` | (blank) | Email address to notify per order. Leave blank to use the script-owner's email. |

> The **10% off £20+** discount is applied automatically in the basket and recorded in the `Discount` / `Total` columns.

Change a value, save the sheet — the API picks it up on the next request. No redeploy needed.

---

## Step 4 — Receive booking emails

Every confirmed booking triggers an email to either:
- The address in `Config` → `NOTIFY_EMAIL`, or
- The Google account that owns the script (if the cell is blank)

The email contains the full booking details + reference number. Reply to the customer using their email/phone.

---

## Step 5 — Customise the site

### Brand & contact details
Edit `assets/data.js` → `CONFIG.brand`:
```js
brand: {
  name: 'Dessert House',
  place: 'Crayford',
  monogram: 'DH',
  phone: '+44 (0) 00 0000 0000',
  phoneHref: 'tel:+440000000000',
  email: 'hello@example.co.uk',
  address: 'Your street, Crayford, Kent, DA1 X',
},
```
These flow into the nav, footer, visit section and booking error messages automatically.

### Menu items
Edit `assets/data.js` → `MENU.[category-slug]` arrays. Fields:
- `name` (required), `price` (required), `desc` (optional)
- `tag: 'new'` shows a gold "NEW" pill
- `tag: 'pop'` shows a white "POPULAR" pill
- `rate: '93% (120)'` shows a star rating

### Add a category
1. Add an entry to `CATEGORIES` in `data.js` (id, slug, title, hero image, tagline, description).
2. Add an entry to `MENU` keyed by the same slug.
3. Create `{slug}/index.html` — copy one of the existing category pages and change the two `data-page` / `data-category` attributes.
4. Optionally add to nav: edit `assets/app.js` → `renderNav()`.

### Custom domain
- Buy a domain.
- Add a `CNAME` file in the repo root containing just the domain (e.g. `desserthouse.co.uk`).
- In your domain DNS, add 4 A records for GitHub Pages:
  `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- And a CNAME record for `www` pointing to `<your-github-user>.github.io.`
- In repo Settings → Pages, add the custom domain and tick "Enforce HTTPS" once provisioned.

---

## Cost summary

| Component | Cost |
|-----------|------|
| GitHub Pages hosting | Free (public repo) |
| Google Apps Script API | Free (20,000 URL fetches/day quota) |
| Google Sheet storage | Free |
| Email notifications | Free (100 emails/day from Gmail) |
| **Total** | **£0/month** |

For a single shop, this comfortably handles 1000+ bookings/month without hitting any quota.

---

## Troubleshooting

**Booking page shows the yellow "Demo mode" banner**
→ You haven't pasted your Apps Script URL into `data.js`. See Step 2.

**Bookings POST but I never see them in the sheet**
→ Open the deployed Web App URL in your browser. If you see "Sorry, the file you have requested does not exist" — the deployment wasn't set to "Anyone" access. Redeploy with the correct setting.

**CORS error in browser console**
→ Apps Script needs Web App URL — *not* the script URL. URL must end in `/exec`. Redeploy if needed.

**"That time just filled up" on submit**
→ Normal. Someone else booked the same slot during your form fill. The site re-checks capacity at submit time to prevent overbooking.

**Want SMS notifications instead of email**
→ Add a Twilio integration in `createBooking()` — see Apps Script docs for the HTTP request pattern.
