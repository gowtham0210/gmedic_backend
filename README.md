# Gmedic Receptionist Portal

Web portal for hospital receptionists: doctors & availability, appointments booked
through the Gmedic patient app, payment status, and the hospital's unique QR code.

## Run

```bash
npm install
npm start
```

Open http://localhost:3000 and log in with the demo account:

- **Email:** riya.sharma@sunrisegeneral.in (or username `riya.sharma`)
- **Password:** Gmedic@123

`npm run dev` restarts on file changes. `npm run reset-data` restores the sample data.
Use `PORT=3001 npm start` if port 3000 is busy.

## Structure

```
server.js            starts the app
app.js               Express setup (sessions, static files, routes)
config/              settings (port, session secret, QR link format, specialisations)
routes/              page routes, /auth, /api
controllers/         request handling + validation
models/              data access (swap these for a real database)
data/                JSON data store + sample data generator (db.json is created on first run)
middleware/          auth guard, view helpers, error pages
views/               EJS pages, partials (sidebar, top bar) and modals
public/              CSS, JS, images (logo, icons)
```

## Tokens

`/tokens` issues queue tokens for appointments (`models/tokenModel.js`, `controllers/tokenController.js`,
API under `/api/tokens`). Numbers run T001, T002… per hospital per day and are never reused that day
(a cancelled token keeps its number; a new token gets the next one). One active token per appointment;
tokens can only be issued for today or upcoming appointments. Statuses: Waiting → Called → Completed, or Cancelled.

## Notes

- Data lives in `data/db.json`. Sample appointments are regenerated around today's date
  each day (doctor, hospital and profile edits are kept). Set `DEMO_AUTO_REFRESH=false` to disable.
- The hospital QR is shown as the "Skip the Queue" poster (`services/qrPoster.js`, served at
  `/api/hospital/qr-poster.svg`). **Download QR** saves it as a 2120×3000 PNG; **Print** fits it to A4.
- The QR code encodes `QR_BASE_URL/<hospitalId>?k=<token>` (default `https://gmedic.app/h`).
  Change `qrBaseUrl` in `config/index.js` to match the link format the patient app expects.
- Set `SESSION_SECRET` before deploying anywhere other than your own machine.
