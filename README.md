# Atelier Storefront

This project includes a public storefront and a Node.js server for protected admin and seller features. The database is stored in `.data/store.sqlite`.

## Run locally

Use Node.js 22.5 or newer:

```powershell
npm start
```

Open `http://127.0.0.1:4174`. On a new database the server creates an administrator account. It prints a one-time temporary password in the server terminal; sign in with `admin@localhost` and change it immediately. To choose the first administrator credentials before the first start, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the environment. The initial password must be at least 12 characters.

The public storefront opens at `/` and shows bakery, clothing, hair and nail listings. Starter clothing and salon listings include photos and prices; Admins can add or edit products, service photos, descriptions, prices and visibility from the protected dashboard. New listings are added only once, so later Admin edits are preserved.

Admins can create sellers and assign them to Bakery, Clothing, Hair, or Nails. Sellers receive a one-time temporary password and must change it at first sign-in. Bakery and clothing sellers submit products and stock changes for Admin approval. Hair and nail sellers submit priced services for approval; clients can request appointments, and Admins manage the requests in the protected dashboard.

The Admin login page is `/login`; the seller login page is `/seller`. The sign-in screen remembers the last email on that browser only (never the password), and users choose Admin or Seller before signing in. On a local `127.0.0.1` server, login links work only on the computer running the server; sellers on other devices need the deployed HTTPS address. On the host, optionally set `PUBLIC_BASE_URL` to the canonical site origin so Admin-issued credentials can show the public seller link. Guest orders and appointments are stored on the server; only Admins can view them.

## Hosting

GitHub can store the source code, but GitHub Pages cannot run this app's Node.js server or SQLite database. A Render Blueprint is provided in `render.yaml`; it uses a paid Starter service with a persistent disk so orders, bookings, products, and services survive restarts. To deploy, create a Render Blueprint from the public GitHub repository and set the prompted `ADMIN_PASSWORD` secret to a strong password of at least 12 characters. The remote service starts with a new database; the local database and local Admin password are not uploaded.

Do not commit `.env` files, serve the project folder through a second static server, or expose `.data` to the public web.

The local server binds to `127.0.0.1` by default. Only configure `HOST=0.0.0.0` when the app is behind a correctly configured HTTPS reverse proxy. Sessions are held in memory and will expire when the process restarts.
