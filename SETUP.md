# Dessert House — Setup

A multi-page restaurant site with a Google Sheets-backed booking system. Hosts on GitHub Pages (free), bookings live in your Google Sheet (free), no monthly cost.

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
├── book/index.html         ← Reservation flow (3 steps)
├── assets/
│   ├── site.css            ← Shared design system
│   ├── data.js             ← Menu + brand + booking API URL
│   ├── app.js              ← Nav / footer / page render
│   └── booking.js          ← Availability + booking POST
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

### `Bookings` sheet
Every booking is appended here. Columns:
`Ref | Created | Date | Time | Party | Name | Phone | Email | Notes | Status | Source`

- **Status** starts as `Pending`. Change to `Confirmed` or `Cancelled` manually.
- Set status to `Cancelled` to free that slot for new bookings.

### `Closed` sheet
Days you're not opening. Add a row per closed date:
- **Date**: in YYYY-MM-DD format (or any cell-recognised date)
- **Reason**: optional note (e.g. "Christmas Day", "Private event")

### `Config` sheet
Tweak booking behaviour without editing code:

| Key | Default | What it does |
|-----|---------|--------------|
| `TABLES_PER_SLOT` | 5 | Max bookings per 30-min slot |
| `SLOT_MINUTES` | 30 | Slot length (15, 30, or 60 work well) |
| `OPEN_HOUR` | 15 | 24h opening hour (15 = 3pm) |
| `CLOSE_HOUR` | 23 | 24h closing hour (23 = 11pm) |
| `LAST_BOOKING_OFFSET_MIN` | 30 | Last bookable slot before close |
| `NOTIFY_EMAIL` | (blank) | Email address to notify per booking. Leave blank to use the script-owner's email. |

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
