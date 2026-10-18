# Marquee Manager

Event and wedding hall management: bookings (Barat, Walima, Mehndi), guests, advance and balance, day or night,
staff and waiters, salaries, expenses, assets, a dashboard and a printable monthly profit report.

The app works in two ways and picks the right one by itself.

| How it is opened | Where data is saved | Login |
|---|---|---|
| Double-click `index.html` | In that browser only | None |
| Through `server.js` (a web link) | PostgreSQL, shared by every device | Password |

## Run it online with PostgreSQL

The server needs two settings:

| Setting | What it is |
|---|---|
| `DATABASE_URL` | The PostgreSQL address, for example `postgres://localhost:5432/marquee` |
| `APP_PASSWORD` | The password the client signs in with, at least 6 characters |

Optional: `PORT` (default 3000) and `SESSION_SECRET` (defaults to a value derived from the password).

```bash
npm install
DATABASE_URL=postgres://localhost:5432/marquee APP_PASSWORD=choose-a-strong-one node server.js
```

Tables are created automatically on first start. Open the address the server prints and sign in.

On a hosting service, set the two settings in its dashboard, use `npm start` as the start command,
and serve it over HTTPS. If the database address contains `sslmode=require`, SSL is turned on automatically.

## Security notes

- Only `index.html` is public. Every data request needs a signed-in session.
- Sessions last 30 days in an HTTP-only cookie. Changing `APP_PASSWORD` signs everyone out.
- After 5 wrong passwords, that address must wait 5 minutes.
- Everyone shares one password. There are no separate user accounts.

## Add a field

Add one line to the module's `fields` list in `index.html` and a matching column in `schema.sql`.
For an existing database, also run `ALTER TABLE <table> ADD COLUMN <name> TEXT;`.
