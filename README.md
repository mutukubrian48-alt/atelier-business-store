# Atelier Storefront

This project includes a public storefront and a Node.js server for protected admin and seller features. The database is stored in `.data/store.sqlite`.

## Run locally

Use Node.js 22.5 or newer:

```powershell
npm start
```

Open `http://127.0.0.1:4174`. On a new database the server creates an administrator account. It prints a one-time temporary password in the server terminal; sign in with `admin@localhost` and change it immediately. To choose the first administrator credentials before the first start, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the environment. The initial password must be at least 12 characters.

Admins can create seller accounts. Each seller receives a generated temporary password once and must change it at first sign-in. Send the seller the `/seller` link shown with their credentials; it opens the seller sign-in directly. Seller product and stock submissions remain private until an admin approves them. Guest orders are saved on the server and only admins can view or export them.

## Hosting

GitHub can store the source code, but GitHub Pages cannot run this app's Node.js server or SQLite database. A Render Blueprint is provided in `render.yaml`; it uses a paid Starter service with a persistent disk so orders and products survive restarts. To deploy, create a public GitHub repository, push this project's files, then create a new Render Blueprint from that repository. Set the prompted `ADMIN_PASSWORD` secret to a strong password of at least 12 characters. The remote service starts with a new database; the local database and local Admin password are not uploaded.

Do not commit `.env` files, serve the project folder through a second static server, or expose `.data` to the public web.

The local server binds to `127.0.0.1` by default. Only configure `HOST=0.0.0.0` when the app is behind a correctly configured HTTPS reverse proxy. Sessions are held in memory and will expire when the process restarts.
