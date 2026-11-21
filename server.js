'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4174);
let publicBaseUrl = '';
if (process.env.PUBLIC_BASE_URL) {
  const parsedBaseUrl = new URL(process.env.PUBLIC_BASE_URL);
  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol) || parsedBaseUrl.username || parsedBaseUrl.password ||
    parsedBaseUrl.pathname !== '/' || parsedBaseUrl.search || parsedBaseUrl.hash) {
    throw new Error('PUBLIC_BASE_URL must be an http(s) origin without a path, query, or credentials.');
  }
  publicBaseUrl = parsedBaseUrl.origin;
}
const dataDirectory = path.join(__dirname, '.data');
fs.mkdirSync(dataDirectory, { recursive: true });

const databasePath = path.resolve(process.env.DATABASE_PATH || path.join(dataDirectory, 'store.sqlite'));
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'seller')),
    business_type TEXT NOT NULL DEFAULT 'bakery',
    must_change_password INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    seller_id INTEGER REFERENCES users(id),
    business_type TEXT NOT NULL DEFAULT 'bakery',
    quantity_unit TEXT NOT NULL DEFAULT 'kg',
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL,
    min_qty INTEGER NOT NULL DEFAULT 1,
    size TEXT NOT NULL DEFAULT '',
    serves TEXT NOT NULL DEFAULT '',
    lead TEXT NOT NULL DEFAULT '',
    availability TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    stock INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    seller_id INTEGER NOT NULL REFERENCES users(id),
    business_type TEXT NOT NULL DEFAULT 'bakery',
    item_type TEXT NOT NULL DEFAULT 'product',
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    service_id TEXT,
    data_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    business_type TEXT NOT NULL DEFAULT 'bakery',
    quantity_unit TEXT NOT NULL DEFAULT 'kg',
    cake TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    collection_date TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Confirmed', 'In preparation', 'Ready', 'Completed', 'Cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    store_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    tagline TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    seller_id INTEGER REFERENCES users(id),
    business_type TEXT NOT NULL CHECK (business_type IN ('hair', 'nails')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    availability TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
    business_type TEXT NOT NULL CHECK (business_type IN ('hair', 'nails')),
    service_name TEXT NOT NULL,
    customer TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    appointment_date TEXT NOT NULL,
    appointment_time TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Confirmed', 'Completed', 'Cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function ensureColumn(table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(item => item.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn('users', 'business_type', "TEXT NOT NULL DEFAULT 'bakery'");
ensureColumn('products', 'business_type', "TEXT NOT NULL DEFAULT 'bakery'");
ensureColumn('products', 'quantity_unit', "TEXT NOT NULL DEFAULT 'kg'");
ensureColumn('submissions', 'business_type', "TEXT NOT NULL DEFAULT 'bakery'");
ensureColumn('submissions', 'item_type', "TEXT NOT NULL DEFAULT 'product'");
ensureColumn('submissions', 'service_id', 'TEXT');
ensureColumn('orders', 'business_type', "TEXT NOT NULL DEFAULT 'bakery'");
ensureColumn('orders', 'quantity_unit', "TEXT NOT NULL DEFAULT 'kg'");

database.prepare(`
  INSERT OR IGNORE INTO settings (id, store_name, phone, email, tagline)
  VALUES (1, 'Atelier', '0116094185', 'mutukubrian95@gmail.com',
    'Explore freshly prepared cakes, considered clothing, professional hair styling and creative nail care. Every listing has a clear price and a simple way to order or book.')
`).run();
database.prepare(`
  UPDATE settings SET tagline = ?
  WHERE id = 1 AND tagline = ?
`).run(
  'Explore freshly prepared cakes, considered clothing, professional hair styling and creative nail care. Every listing has a clear price and a simple way to order or book.',
  'Thoughtful digital spaces for brands with a point of view. From first launch to daily storefront, every detail works beautifully.'
);

const defaultProducts = [
  ['chocolate-ganache', 'Chocolate Ganache', 'Rich cocoa sponge with silky dark-chocolate ganache', 2500, 1, '1–3 kg', '8–18', '48-hour notice', 'Available this week', 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=85', 12],
  ['vanilla-berry', 'Vanilla Berry', 'Vanilla sponge layered with cream and fresh berries', 2800, 1, '1–3 kg', '8–18', '48-hour notice', 'Available this week', 'https://images.unsplash.com/photo-1557925923-cd4648e211a0?auto=format&fit=crop&w=800&q=85', 10],
  ['red-velvet', 'Classic Red Velvet', 'Soft cocoa sponge with smooth cream-cheese frosting', 3200, 1, '1–4 kg', '8–24', '72-hour notice', 'Limited weekend dates', 'https://images.unsplash.com/photo-1535141192574-5d4897c12636?auto=format&fit=crop&w=800&q=85', 8],
  ['salted-caramel', 'Salted Caramel', 'Golden caramel sponge with salted-buttercream filling', 3000, 1, '1–3 kg', '8–18', '48-hour notice', 'Available this week', 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=800&q=85', 7],
  ['wedding-elegance', 'Wedding Elegance', 'Custom tiered cake with vanilla or chocolate layers', 6500, 2, '2–8 kg', '20–80', '7-day notice', 'Booking consultations open', 'https://images.unsplash.com/photo-1588195538326-c5b1e9f80a1b?auto=format&fit=crop&w=800&q=85', 4],
  ['fresh-fruit', 'Fresh Fruit', 'Light cream cake finished with seasonal fresh fruit', 3400, 1, '1–3 kg', '8–18', '48-hour notice', 'Fresh fruit daily', 'https://images.unsplash.com/photo-1562777717-dc6984f65a63?auto=format&fit=crop&w=800&q=85', 6]
];

if (database.prepare('SELECT COUNT(*) AS count FROM products').get().count === 0) {
  const insertProduct = database.prepare(`
    INSERT INTO products
      (id, name, description, price, min_qty, size, serves, lead, availability, image, stock, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
  `);
  for (const product of defaultProducts) insertProduct.run(...product);
}

if (!database.prepare('SELECT name FROM app_migrations WHERE name = ?').get('starter-commerce-catalog-v1')) {
  const clothingProducts = [
    ['atelier-linen-dress', 'clothing', 'Linen Day Dress', 'A relaxed, breathable dress for polished everyday wear.', 3800, 1, 'S–XL', '', '', 'Available in selected sizes', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=85', 12],
    ['atelier-classic-blazer', 'clothing', 'Classic Tailored Blazer', 'A versatile tailored layer with a clean, timeless finish.', 5200, 1, 'S–XL', '', '', 'Ask about available colours', 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=85', 8],
    ['atelier-everyday-set', 'clothing', 'Everyday Style Set', 'An easy-to-wear coordinated look, selected for comfort and style.', 4500, 1, 'S–XL', '', '', 'Limited pieces available', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=85', 10]
  ];
  const salonServices = [
    ['atelier-hair-soft-waves', 'hair', 'Soft Glam Waves', 'A polished, soft-wave finish styled to suit your occasion.', 1800, 60, 'By appointment · Tue–Sat', 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=85'],
    ['atelier-hair-knotless-braids', 'hair', 'Knotless Braids', 'Lightweight, neat braids finished with care. Final price may vary by length.', 5500, 240, 'By appointment · Tue–Sat', 'https://images.unsplash.com/photo-1560869713-7d0a29430803?auto=format&fit=crop&w=800&q=85'],
    ['atelier-hair-silk-press', 'hair', 'Silk Press & Finish', 'A smooth, glossy style with a professional finish.', 2500, 120, 'By appointment · Tue–Sat', 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=800&q=85'],
    ['atelier-nails-classic-manicure', 'nails', 'Classic Manicure', 'Nail shaping, cuticle care and a clean polish finish.', 1200, 45, 'By appointment · Tue–Sat', 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=800&q=85'],
    ['atelier-nails-gel-finish', 'nails', 'Gel Nail Finish', 'A long-wearing gel colour with careful shaping and finishing.', 2000, 75, 'By appointment · Tue–Sat', 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=800&q=85'],
    ['atelier-nails-signature-art', 'nails', 'Signature Nail Art', 'A custom nail-art design with a polished, personal look.', 2800, 90, 'By appointment · Tue–Sat', 'https://images.unsplash.com/photo-1604902396830-aca29e19b067?auto=format&fit=crop&w=800&q=85']
  ];
  database.exec('BEGIN IMMEDIATE');
  try {
    const insertProduct = database.prepare(`
      INSERT OR IGNORE INTO products
        (id, business_type, quantity_unit, name, description, price, min_qty, size, serves, lead, availability, image, stock, status)
      VALUES (?, ?, 'item', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
    `);
    for (const product of clothingProducts) insertProduct.run(...product);
    const insertService = database.prepare(`
      INSERT OR IGNORE INTO services
        (id, business_type, name, description, price, duration_minutes, availability, image, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
    `);
    for (const service of salonServices) insertService.run(...service);
    database.prepare('INSERT INTO app_migrations (name) VALUES (?)').run('starter-commerce-catalog-v1');
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

if (database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count === 0) {
  const email = (process.env.ADMIN_EMAIL || 'admin@localhost').trim().toLowerCase();
  const generatedPassword = process.env.ADMIN_PASSWORD ? null : crypto.randomBytes(18).toString('base64url');
  const password = process.env.ADMIN_PASSWORD || generatedPassword;
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  database.prepare(`
    INSERT INTO users (name, email, password_hash, role, must_change_password)
    VALUES (?, ?, ?, 'admin', 1)
  `).run(process.env.ADMIN_NAME || 'Store Administrator', email, hashPassword(password));
  if (generatedPassword) {
    console.log('\nInitial administrator account (change this password after signing in):');
    console.log('Email: ' + email);
    console.log('Temporary password: ' + generatedPassword + '\n');
  } else {
    console.log('Initial administrator provisioned from ADMIN_EMAIL / ADMIN_PASSWORD.');
  }
}

const sessions = new Map();
const loginAttempts = new Map();
const orderAttempts = new Map();
const appointmentAttempts = new Map();
const sessionDuration = 8 * 60 * 60 * 1000;
const dummyPasswordHash = hashPassword(crypto.randomBytes(24).toString('base64url'));

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'REQUEST_FAILED';
  }
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const derived = crypto.scryptSync(password, salt, 64);
  return salt.toString('hex') + ':' + derived.toString('hex');
}

function verifyPassword(password, storedHash) {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const salt = Buffer.from(parts[0], 'hex');
  const expected = Buffer.from(parts[1], 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function makeId(prefix) {
  return prefix + '_' + crypto.randomBytes(16).toString('hex');
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    businessType: user.business_type || 'bakery',
    mustChangePassword: Boolean(user.must_change_password)
  };
}

function sendJson(response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers
  });
  response.end(body);
}

function sendError(response, error) {
  const status = error instanceof HttpError ? error.status : 500;
  if (!(error instanceof HttpError)) console.error(error);
  sendJson(response, status, {
    error: status === 500 ? 'An unexpected server error occurred.' : error.message,
    code: error.code || 'INTERNAL_ERROR'
  });
}

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 32768) throw new HttpError(413, 'Request is too large.', 'BODY_TOO_LARGE');
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.', 'INVALID_JSON');
  }
}

function getSession(request) {
  const cookie = request.headers.cookie || '';
  const token = cookie.split(';').map(part => part.trim()).find(part => part.startsWith('atelier_session='));
  if (!token) return null;
  let sessionId;
  try {
    sessionId = decodeURIComponent(token.slice('atelier_session='.length));
  } catch {
    return null;
  }
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return { ...session, sessionId };
}

function requireSession(request, roles) {
  const session = getSession(request);
  if (!session) throw new HttpError(401, 'Please sign in to continue.', 'AUTH_REQUIRED');
  if (session.user.mustChangePassword) {
    throw new HttpError(403, 'Change your temporary password before continuing.', 'PASSWORD_CHANGE_REQUIRED');
  }
  if (roles && !roles.includes(session.user.role)) {
    throw new HttpError(403, 'You do not have permission to access this resource.', 'FORBIDDEN');
  }
  return session;
}

function requireCsrf(request, session) {
  const supplied = request.headers['x-csrf-token'] || '';
  if (!supplied || supplied !== session.csrfToken) {
    throw new HttpError(403, 'The security token expired. Refresh and try again.', 'CSRF_INVALID');
  }
}

function requireSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin || !request.headers.host) throw new HttpError(403, 'Request origin could not be verified.', 'ORIGIN_INVALID');
  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new HttpError(403, 'Request origin could not be verified.', 'ORIGIN_INVALID');
  }
  if (parsedOrigin.host !== request.headers.host || !['http:', 'https:'].includes(parsedOrigin.protocol)) {
    throw new HttpError(403, 'Cross-site requests are not allowed.', 'ORIGIN_INVALID');
  }
}

function validateText(value, label, maxLength, required = true) {
  if (typeof value !== 'string') {
    if (!required && (value === undefined || value === null)) return '';
    throw new HttpError(400, label + ' must be text.', 'INVALID_INPUT');
  }
  const clean = value.trim();
  if (required && !clean) throw new HttpError(400, label + ' is required.', 'INVALID_INPUT');
  if (clean.length > maxLength) throw new HttpError(400, label + ' is too long.', 'INVALID_INPUT');
  return clean;
}

function validateFutureDate(value, label) {
  const date = validateText(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, 'Choose a valid future date.', 'INVALID_DATE');
  }
  const parsed = new Date(date + 'T00:00:00.000Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date < new Date().toISOString().slice(0, 10)) {
    throw new HttpError(400, 'Choose a valid future date.', 'INVALID_DATE');
  }
  return date;
}

const businessTypes = ['bakery', 'clothing', 'hair', 'nails'];

function validateBusinessType(value, allowedTypes = businessTypes) {
  if (!allowedTypes.includes(value)) {
    throw new HttpError(400, 'Choose a valid business category.', 'INVALID_BUSINESS_TYPE');
  }
  return value;
}

function validateProduct(body, assignedBusinessType) {
  const businessType = assignedBusinessType || validateBusinessType(body.businessType || 'bakery', ['bakery', 'clothing']);
  const name = validateText(body.name, 'Product name', 100);
  const description = validateText(body.description || '', 'Description', 1000, false);
  const price = Number(body.price);
  const minQty = Number(body.minQty || 1);
  const stock = Number(body.stock || 0);
  if (!Number.isSafeInteger(price) || price < 1 || price > 10000000) {
    throw new HttpError(400, 'Price must be a whole number greater than zero.', 'INVALID_INPUT');
  }
  if (!Number.isSafeInteger(minQty) || minQty < 1 || minQty > 100) {
    throw new HttpError(400, 'Minimum quantity must be between 1 and 100 kg.', 'INVALID_INPUT');
  }
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 10000) {
    throw new HttpError(400, 'Stock must be a whole number between 0 and 10,000.', 'INVALID_INPUT');
  }
  const image = validateText(body.image || '', 'Image URL', 500, false);
  if (image && !/^https:\/\/[^\s"'<>]+$/i.test(image)) {
    throw new HttpError(400, 'Image URL must use HTTPS.', 'INVALID_INPUT');
  }
  return {
    businessType,
    quantityUnit: businessType === 'bakery' ? 'kg' : 'item',
    name,
    description,
    price,
    minQty,
    size: validateText(body.size || '', 'Size range', 80, false),
    serves: validateText(body.serves || '', 'Serving size', 80, false),
    lead: validateText(body.lead || '', 'Preparation time', 80, false),
    availability: validateText(body.availability || '', 'Availability', 120, false),
    image,
    stock
  };
}

function productFromRow(row) {
  return {
    id: row.id,
    sellerId: row.seller_id,
    businessType: row.business_type || 'bakery',
    quantityUnit: row.quantity_unit || 'kg',
    name: row.name,
    description: row.description,
    price: row.price,
    minQty: row.min_qty,
    size: row.size,
    serves: row.serves,
    lead: row.lead,
    availability: row.availability,
    image: row.image,
    stock: row.stock,
    status: row.status,
    updatedAt: row.updated_at
  };
}

function getProductValues(product) {
  return [
    product.businessType, product.quantityUnit, product.name, product.description, product.price, product.minQty, product.size,
    product.serves, product.lead, product.availability, product.image, product.stock
  ];
}

function updateProduct(id, product, sellerId) {
  database.prepare(`
    UPDATE products SET
      business_type = ?, quantity_unit = ?, name = ?, description = ?, price = ?, min_qty = ?, size = ?, serves = ?,
      lead = ?, availability = ?, image = ?, stock = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND (? IS NULL OR seller_id = ?)
  `).run(...getProductValues(product), id, sellerId, sellerId);
}

function validateService(body, assignedBusinessType) {
  const businessType = assignedBusinessType || validateBusinessType(body.businessType, ['hair', 'nails']);
  const price = Number(body.price);
  const durationMinutes = Number(body.durationMinutes);
  if (!Number.isSafeInteger(price) || price < 1 || price > 10000000) {
    throw new HttpError(400, 'Price must be a whole number greater than zero.', 'INVALID_INPUT');
  }
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 480) {
    throw new HttpError(400, 'Service duration must be between 10 and 480 minutes.', 'INVALID_INPUT');
  }
  const image = validateText(body.image || '', 'Image URL', 500, false);
  if (image && !/^https:\/\/[^\s"'<>]+$/i.test(image)) {
    throw new HttpError(400, 'Image URL must use HTTPS.', 'INVALID_INPUT');
  }
  return {
    businessType,
    name: validateText(body.name, 'Service name', 100),
    description: validateText(body.description || '', 'Description', 1000, false),
    price,
    durationMinutes,
    availability: validateText(body.availability || '', 'Availability', 120, false),
    image
  };
}

function serviceFromRow(row) {
  return {
    id: row.id,
    sellerId: row.seller_id,
    businessType: row.business_type,
    name: row.name,
    description: row.description,
    price: row.price,
    durationMinutes: row.duration_minutes,
    availability: row.availability,
    image: row.image,
    status: row.status,
    updatedAt: row.updated_at
  };
}

function getServiceValues(service) {
  return [
    service.businessType, service.name, service.description, service.price,
    service.durationMinutes, service.availability, service.image
  ];
}

function cookieHeader(value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `atelier_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function csvCell(value) {
  return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
}

async function handleApi(request, response, url) {
  const route = url.pathname;
  const method = request.method;

  if (route === '/api/public/bootstrap' && method === 'GET') {
    const settings = database.prepare('SELECT store_name, phone, email, tagline FROM settings WHERE id = 1').get();
    const products = database.prepare("SELECT * FROM products WHERE status = 'published' AND stock > 0 ORDER BY created_at, name").all().map(productFromRow);
    const services = database.prepare("SELECT * FROM services WHERE status = 'published' ORDER BY created_at, name").all().map(serviceFromRow);
    return sendJson(response, 200, { settings, products, services, publicBaseUrl });
  }

  if (route === '/api/auth/session' && method === 'GET') {
    const session = getSession(request);
    return sendJson(response, 200, session
      ? { user: safeUser(session.user), csrfToken: session.csrfToken }
      : { user: null, csrfToken: null });
  }

  if (route === '/api/auth/login' && method === 'POST') {
    requireSameOrigin(request);
    const ip = request.socket.remoteAddress || 'unknown';
    const attempt = loginAttempts.get(ip) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
    if (attempt.resetAt <= Date.now()) {
      attempt.count = 0;
      attempt.resetAt = Date.now() + 15 * 60 * 1000;
    }
    if (attempt.count >= 10) throw new HttpError(429, 'Too many sign-in attempts. Try again in 15 minutes.', 'LOGIN_RATE_LIMIT');
    const body = await readJson(request);
    const email = validateText(body.email, 'Email', 254).toLowerCase();
    const password = validateText(body.password, 'Password', 200);
    const requestedRole = body.role == null ? null : validateText(body.role, 'Account type', 20);
    if (requestedRole && !['admin', 'seller'].includes(requestedRole)) {
      throw new HttpError(400, 'Choose Admin or Seller sign-in.', 'INVALID_ROLE');
    }
    const user = database.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
    const passwordMatches = verifyPassword(password, user ? user.password_hash : dummyPasswordHash);
    if (!user || !passwordMatches || (requestedRole && user.role !== requestedRole)) {
      attempt.count += 1;
      loginAttempts.set(ip, attempt);
      throw new HttpError(401, 'Email or password is incorrect.', 'LOGIN_INVALID');
    }
    loginAttempts.delete(ip);
    const sessionId = crypto.randomBytes(32).toString('base64url');
    const csrfToken = crypto.randomBytes(24).toString('base64url');
    const sessionUser = safeUser(user);
    sessions.set(sessionId, { user: sessionUser, csrfToken, expiresAt: Date.now() + sessionDuration });
    return sendJson(response, 200, { user: sessionUser, csrfToken }, {
      'Set-Cookie': cookieHeader(sessionId, sessionDuration / 1000)
    });
  }

  if (route === '/api/auth/logout' && method === 'POST') {
    const session = getSession(request);
    if (session) requireCsrf(request, session);
    if (session) sessions.delete(session.sessionId);
    return sendJson(response, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0) });
  }

  if (route === '/api/auth/change-password' && method === 'POST') {
    const session = getSession(request);
    if (!session) throw new HttpError(401, 'Please sign in to continue.', 'AUTH_REQUIRED');
    requireCsrf(request, session);
    const body = await readJson(request);
    const currentPassword = validateText(body.currentPassword, 'Current password', 200);
    const newPassword = validateText(body.newPassword, 'New password', 200);
    if (newPassword.length < 12) throw new HttpError(400, 'New password must be at least 12 characters.', 'PASSWORD_TOO_SHORT');
    const user = database.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(session.user.id);
    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      throw new HttpError(401, 'Current password is incorrect.', 'PASSWORD_INVALID');
    }
    database.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(hashPassword(newPassword), user.id);
    const updatedUser = { ...session.user, mustChangePassword: false };
    for (const [id, value] of sessions) {
      if (value.user.id === user.id) sessions.set(id, { ...value, user: updatedUser });
    }
    return sendJson(response, 200, { user: updatedUser });
  }

  if (route === '/api/orders' && method === 'POST') {
    requireSameOrigin(request);
    const ip = request.socket.remoteAddress || 'unknown';
    const attempt = orderAttempts.get(ip) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
    if (attempt.resetAt <= Date.now()) {
      attempt.count = 0;
      attempt.resetAt = Date.now() + 15 * 60 * 1000;
    }
    if (attempt.count >= 8) throw new HttpError(429, 'Too many order requests. Please contact the seller directly.', 'ORDER_RATE_LIMIT');
    attempt.count += 1;
    orderAttempts.set(ip, attempt);
    const body = await readJson(request);
    const productId = validateText(body.productId, 'Product', 80);
    const product = database.prepare("SELECT * FROM products WHERE id = ? AND status = 'published'").get(productId);
    if (!product || product.stock < 1) throw new HttpError(404, 'This product is no longer available.', 'PRODUCT_UNAVAILABLE');
    const customer = validateText(body.customer, 'Name', 100);
    const phone = validateText(body.phone, 'Phone number', 40);
    const email = validateText(body.email || '', 'Email', 254, false);
    const quantity = Number(body.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < product.min_qty || quantity > 100) {
      throw new HttpError(400, `Quantity must be between ${product.min_qty} and 100 ${product.quantity_unit}.`, 'INVALID_QUANTITY');
    }
    const collectionDate = validateFutureDate(body.date, 'Collection date');
    const notes = validateText(body.notes || '', 'Order notes', 1000, false);
    const id = makeId('ord');
    const total = product.price * quantity;
    database.exec('BEGIN IMMEDIATE');
    try {
      const stockResult = database.prepare(`
        UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'published' AND stock >= ?
      `).run(quantity, product.id, quantity);
      if (!stockResult.changes) throw new HttpError(409, 'There is not enough stock for that quantity.', 'INSUFFICIENT_STOCK');
      database.prepare(`
        INSERT INTO orders (id, customer, phone, email, product_id, business_type, quantity_unit, cake, quantity, collection_date, notes, total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, customer, phone, email, product.id, product.business_type, product.quantity_unit, product.name, quantity, collectionDate, notes, total);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    return sendJson(response, 201, { ok: true, orderId: id });
  }

  if (route === '/api/appointments' && method === 'POST') {
    requireSameOrigin(request);
    const ip = request.socket.remoteAddress || 'unknown';
    const attempt = appointmentAttempts.get(ip) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
    if (attempt.resetAt <= Date.now()) {
      attempt.count = 0;
      attempt.resetAt = Date.now() + 15 * 60 * 1000;
    }
    if (attempt.count >= 8) throw new HttpError(429, 'Too many appointment requests. Please contact the salon directly.', 'APPOINTMENT_RATE_LIMIT');
    attempt.count += 1;
    appointmentAttempts.set(ip, attempt);
    const body = await readJson(request);
    const serviceId = validateText(body.serviceId, 'Service', 80);
    const service = database.prepare("SELECT * FROM services WHERE id = ? AND status = 'published'").get(serviceId);
    if (!service) throw new HttpError(404, 'This service is no longer available.', 'SERVICE_UNAVAILABLE');
    const customer = validateText(body.customer, 'Name', 100);
    const phone = validateText(body.phone, 'Phone number', 40);
    const email = validateText(body.email || '', 'Email', 254, false);
    const date = validateFutureDate(body.date, 'Appointment date');
    const time = validateText(body.time, 'Appointment time', 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new HttpError(400, 'Choose a valid appointment time.', 'INVALID_TIME');
    }
    const notes = validateText(body.notes || '', 'Appointment notes', 1000, false);
    const requestedStart = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const requestedEnd = requestedStart + service.duration_minutes;
    if (requestedEnd > 24 * 60) throw new HttpError(400, 'Choose a start time that leaves room for the full service.', 'INVALID_TIME');
    const sellerAppointments = database.prepare(`
      SELECT a.appointment_time, s.duration_minutes
      FROM appointments a
      JOIN services s ON s.id = a.service_id
      WHERE (s.seller_id = ? OR (s.seller_id IS NULL AND ? IS NULL AND s.business_type = ?))
        AND a.appointment_date = ? AND a.status != 'Cancelled'
    `).all(service.seller_id, service.seller_id, service.business_type, date);
    const overlaps = sellerAppointments.some(appointment => {
      const start = Number(appointment.appointment_time.slice(0, 2)) * 60 + Number(appointment.appointment_time.slice(3, 5));
      const end = start + appointment.duration_minutes;
      return requestedStart < end && start < requestedEnd;
    });
    if (overlaps) throw new HttpError(409, 'That stylist is already booked at this time. Choose another time.', 'TIME_UNAVAILABLE');
    const id = makeId('apt');
    database.prepare(`
      INSERT INTO appointments
        (id, service_id, business_type, service_name, customer, phone, email, appointment_date, appointment_time, notes, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, service.id, service.business_type, service.name, customer, phone, email, date, time, notes, service.price);
    return sendJson(response, 201, { ok: true, appointmentId: id });
  }

  if (route === '/api/admin/summary' && method === 'GET') {
    requireSession(request, ['admin']);
    const summary = database.prepare(`
      SELECT COUNT(*) AS order_count,
        SUM(CASE WHEN status IN ('New', 'Confirmed', 'In preparation') THEN 1 ELSE 0 END) AS attention,
        SUM(CASE WHEN status != 'Cancelled' THEN total ELSE 0 END) AS order_value
      FROM orders
    `).get();
    const products = database.prepare("SELECT COUNT(*) AS count FROM products WHERE status = 'published' AND stock > 0").get().count;
    const pending = database.prepare("SELECT COUNT(*) AS count FROM submissions WHERE status = 'pending'").get().count;
    const sellers = database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'seller' AND active = 1").get().count;
    const appointments = database.prepare("SELECT COUNT(*) AS count FROM appointments WHERE status IN ('New', 'Confirmed')").get().count;
    const latestOrders = database.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5').all();
    return sendJson(response, 200, {
      orders: Number(summary.order_count || 0),
      attention: Number(summary.attention || 0),
      orderValue: Number(summary.order_value || 0),
      products,
      pending,
      sellers,
      appointments,
      latestOrders
    });
  }

  if (route === '/api/admin/orders' && method === 'GET') {
    requireSession(request, ['admin']);
    return sendJson(response, 200, { orders: database.prepare('SELECT * FROM orders ORDER BY created_at DESC').all() });
  }

  if (route === '/api/admin/orders.csv' && method === 'GET') {
    requireSession(request, ['admin']);
    const orders = database.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
    const columns = ['id', 'customer', 'phone', 'email', 'business_type', 'cake', 'quantity', 'quantity_unit', 'collection_date', 'total', 'status', 'notes', 'created_at'];
    const csv = [columns.map(csvCell).join(','), ...orders.map(order => columns.map(column => csvCell(order[column])).join(','))].join('\r\n');
    response.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="atelier-orders.csv"',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(csv)
    });
    return response.end(csv);
  }

  const orderStatusRoute = route.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (orderStatusRoute && method === 'PATCH') {
    const session = requireSession(request, ['admin']);
    requireCsrf(request, session);
    const body = await readJson(request);
    const status = validateText(body.status, 'Order status', 30);
    if (!['New', 'Confirmed', 'In preparation', 'Ready', 'Completed', 'Cancelled'].includes(status)) {
      throw new HttpError(400, 'Choose a valid order status.', 'INVALID_STATUS');
    }
    const result = database.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, decodeURIComponent(orderStatusRoute[1]));
    if (!result.changes) throw new HttpError(404, 'Order not found.', 'ORDER_NOT_FOUND');
    return sendJson(response, 200, { ok: true });
  }

  if (route === '/api/admin/appointments' && method === 'GET') {
    requireSession(request, ['admin']);
    return sendJson(response, 200, {
      appointments: database.prepare('SELECT * FROM appointments ORDER BY appointment_date, appointment_time, created_at').all()
    });
  }

  const appointmentStatusRoute = route.match(/^\/api\/admin\/appointments\/([^/]+)$/);
  if (appointmentStatusRoute && method === 'PATCH') {
    const session = requireSession(request, ['admin']);
    requireCsrf(request, session);
    const body = await readJson(request);
    const status = validateText(body.status, 'Appointment status', 30);
    if (!['New', 'Confirmed', 'Completed', 'Cancelled'].includes(status)) {
      throw new HttpError(400, 'Choose a valid appointment status.', 'INVALID_STATUS');
    }
    const result = database.prepare('UPDATE appointments SET status = ? WHERE id = ?')
      .run(status, decodeURIComponent(appointmentStatusRoute[1]));
    if (!result.changes) throw new HttpError(404, 'Appointment not found.', 'APPOINTMENT_NOT_FOUND');
    return sendJson(response, 200, { ok: true });
  }

  if (route === '/api/admin/products' && method === 'GET') {
    requireSession(request, ['admin']);
    return sendJson(response, 200, { products: database.prepare('SELECT * FROM products ORDER BY created_at, name').all().map(productFromRow) });
  }

  if (route === '/api/admin/products' && method === 'POST') {
    const session = requireSession(request, ['admin']);
    requireCsrf(request, session);
    const product = validateProduct(await readJson(request));
    const id = makeId('prd');
    database.prepare(`
      INSERT INTO products (id, business_type, quantity_unit, name, description, price, min_qty, size, serves, lead, availability, image, stock, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
    `).run(id, ...getProductValues(product));
    return sendJson(response, 201, { product: productFromRow(database.prepare('SELECT * FROM products WHERE id = ?').get(id)) });
  }

  const productRoute = route.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (productRoute && method === 'PATCH') {
    const session = requireSession(request, ['admin']);
    requireCsrf(request, session);
    const id = decodeURIComponent(productRoute[1]);
    if (!database.prepare('SELECT id FROM products WHERE id = ?').get(id)) throw new HttpError(404, 'Product not found.', 'PRODUCT_NOT_FOUND');
    const product = validateProduct(await readJson(request));
    database.prepare(`
      UPDATE products SET business_type = ?, quantity_unit = ?, name = ?, description = ?, price = ?, min_qty = ?, size = ?,
        serves = ?, lead = ?, availability = ?, image = ?, stock = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(...getProductValues(product), id);
    return sendJson(response, 200, { product: productFromRow(database.prepare('SELECT * FROM products WHERE id = ?').get(id)) });
  }

  if (route === '/api/admin/services' && method === 'GET') {
    requireSession(request, ['admin']);
    return sendJson(response, 200, {
      services: database.prepare('SELECT * FROM services ORDER BY business_type, name').all().map(serviceFromRow)
    });
  }

  if (route === '/api/admin/services' && method === 'POST') {
    const session = requireSession(request, ['admin']);
    requireCsrf(request, session);
    const service = validateService(await readJson(request));
    const id = makeId('svc');
    database.prepare(`
      INSERT INTO services (id, business_type, name, description, price, duration_minutes, availability, image, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
    `).run(id, ...getServiceValues(service));
    return sendJson(response, 201, { service: serviceFromRow(database.prepare('SELECT * FROM services WHERE id = ?').get(id)) });
  }

  const serviceRoute = route.match(/^\/api\/admin\/services\/([^/]+)$/);
  if (serviceRoute && method === 'PATCH') {
    const session = requireSession(request, ['admin']);
    requireCsrf(request, session);
    const id = decodeURIComponent(serviceRoute[1]);
    if (!database.prepare('SELECT id FROM services WHERE id = ?').get(id)) {
      throw new HttpError(404, 'Service not found.', 'SERVICE_NOT_FOUND');
    }
    const service = validateService(await readJson(request));
    database.prepare(`
      UPDATE services SET business_type = ?, name = ?, description = ?, price = ?, duration_minutes = ?,
        availability = ?, image = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(...getServiceValues(service), id);
    return sendJson(response, 200, { service: serviceFromRow(database.prepare('SELECT * FROM services WHERE id = ?').get(id)) });
  }

  const serviceVisibilityRoute = route.match(/^\/api\/admin\/services\/([^/]+)\/visibility$/);
  if (serviceVisibilityRoute && method === 'PATCH') {
    const session = requireSession(request, ['admin']);
    requireCsrf(request, session);
    const body = await readJson(request);
    if (!['published', 'hidden'].includes(body.status)) throw new HttpError(400, 'Choose a valid service visibility.', 'INVALID_STATUS');
    const result = database.prepare('UPDATE services SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(body.status, decodeURIComponent(serviceVisibilityRoute[1]));
    if (!result.changes) throw new HttpError(404, 'Service not found.', 'SERVICE_NOT_FOUND');
    return sendJson(response, 200, { ok: true });
  }

  if (productRoute && method === 'DELETE') {
    const session = requireSession(request, ['admin']);
    requireCsrf(request, session);
    const result = database.prepare('DELETE FROM products WHERE id = ?').run(decodeURIComponent(productRoute[1]));
    if (!result.changes) throw new HttpError(404, 'Product not found.', 'PRODUCT_NOT_FOUND');
    return sendJson(response, 200, { ok: true });
  }

  const productVisibilityRoute = route.match(/^\/api\/admin\/products\/([^/]+)\/visibility$/);
  if (productVisibilityRoute && method === 'PATCH') {
    const session = requireSession(request, ['admin']);
    requireCsrf(request, session);
    const body = await readJson(request);
    if (!['published', 'hidden'].includes(body.status)) throw new HttpError(400, 'Choose a valid product visibility.', 'INVALID_STATUS');
    const result = database.prepare('UPDATE products SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(body.status, decodeURIComponent(productVisibilityRoute[1]));
    if (!result.changes) throw new HttpError(404, 'Product not found.', 'PRODUCT_NOT_FOUND');
    return sendJson(response, 200, { ok: true });
  }

  if (route === '/api/admin/settings' && method === 'GET') {
    requireSession(request, ['admin']);
    return sendJson(response, 200, { settings: database.prepare('SELECT store_name, phone, email, tagline FROM settings WHERE id = 1').get() });
  }

  if (route === '/api/admin/settings' && method === 'PUT') {
    const session = requireSession(request, ['admin']);
    requireCsrf(request, session);
    const body = await readJson(request);
    const storeName = validateText(body.storeName, 'Store name', 100);
    const phone = validateText(body.phone, 'Phone number', 40);
    const email = validateText(body.email, 'Contact email', 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid contact email.', 'INVALID_EMAIL');
    const tagline = validateText(body.tagline, 'Store introduction', 500, false);
    database.prepare('UPDATE settings SET store_name = ?, phone = ?, email = ?, tagline = ? WHERE id = 1')
      .run(storeName, phone, email, tagline);
    return sendJson(response, 200, { settings: { store_name: storeName, phone, email, tagline } });
  }

  if (route === '/api/admin/sellers' && method === 'GET') {
    requireSession(request, ['admin']);
    const sellers = database.prepare(`
      SELECT u.id, u.name, u.email, u.business_type, u.active, u.created_at,
        (SELECT COUNT(*) FROM submissions s WHERE s.seller_id = u.id AND s.status = 'pending') AS pending_count
      FROM users u WHERE u.role = 'seller' ORDER BY u.created_at DESC
    `).all();
    return sendJson(response, 200, { sellers });
  }

  if (route === '/api/admin/sellers' && method === 'POST') {
    const session = requireSession(request, ['admin']);
    requireCsrf(request, session);
    const body = await readJson(request);
    const name = validateText(body.name, 'Seller name', 100);
    const email = validateText(body.email, 'Seller email', 254).toLowerCase();
    const businessType = validateBusinessType(body.businessType);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid seller email.', 'INVALID_EMAIL');
    const temporaryPassword = crypto.randomBytes(15).toString('base64url');
    try {
      const result = database.prepare(`
        INSERT INTO users (name, email, password_hash, role, business_type, must_change_password)
        VALUES (?, ?, ?, 'seller', ?, 1)
      `).run(name, email, hashPassword(temporaryPassword), businessType);
      return sendJson(response, 201, {
        seller: { id: Number(result.lastInsertRowid), name, email, businessType, active: 1 },
        temporaryPassword
      });
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed')) {
        throw new HttpError(409, 'An account already uses that email address.', 'EMAIL_IN_USE');
      }
      throw error;
    }
  }

  const sellerPasswordRoute = route.match(/^\/api\/admin\/sellers\/(\d+)\/reset-password$/);
  if (sellerPasswordRoute && method === 'POST') {
    const session = requireSession(request, ['admin']);
    requireCsrf(request, session);
    const id = Number(sellerPasswordRoute[1]);
    const temporaryPassword = crypto.randomBytes(15).toString('base64url');
    const result = database.prepare(`
      UPDATE users SET password_hash = ?, must_change_password = 1, active = 1
      WHERE id = ? AND role = 'seller'
    `).run(hashPassword(temporaryPassword), id);
    if (!result.changes) throw new HttpError(404, 'Seller account not found.', 'SELLER_NOT_FOUND');
    for (const [sessionId, value] of sessions) {
      if (value.user.id === id) sessions.delete(sessionId);
    }
    return sendJson(response, 200, { temporaryPassword });
  }

  const sellerActivationRoute = route.match(/^\/api\/admin\/sellers\/(\d+)\/active$/);
  if (sellerActivationRoute && method === 'PATCH') {
    const session = requireSession(request, ['admin']);
    requireCsrf(request, session);
    const body = await readJson(request);
    const active = body.active === true ? 1 : body.active === false ? 0 : null;
    if (active === null) throw new HttpError(400, 'Choose whether this account is active.', 'INVALID_INPUT');
    const result = database.prepare("UPDATE users SET active = ? WHERE id = ? AND role = 'seller'").run(active, Number(sellerActivationRoute[1]));
    if (!result.changes) throw new HttpError(404, 'Seller account not found.', 'SELLER_NOT_FOUND');
    for (const [id, value] of sessions) {
      if (value.user.id === Number(sellerActivationRoute[1])) sessions.delete(id);
    }
    return sendJson(response, 200, { ok: true });
  }

  if (route === '/api/admin/submissions' && method === 'GET') {
    requireSession(request, ['admin']);
    const rows = database.prepare(`
      SELECT s.*, u.name AS seller_name, u.email AS seller_email
      FROM submissions s JOIN users u ON u.id = s.seller_id
      WHERE s.status = 'pending' ORDER BY s.created_at ASC
    `).all();
    return sendJson(response, 200, { submissions: rows.map(row => ({ ...row, data: JSON.parse(row.data_json) })) });
  }

  const decisionRoute = route.match(/^\/api\/admin\/submissions\/([^/]+)\/decision$/);
  if (decisionRoute && method === 'POST') {
    const session = requireSession(request, ['admin']);
    requireCsrf(request, session);
    const body = await readJson(request);
    if (!['approve', 'reject'].includes(body.decision)) throw new HttpError(400, 'Choose approve or reject.', 'INVALID_DECISION');
    const submission = database.prepare("SELECT * FROM submissions WHERE id = ? AND status = 'pending'").get(decodeURIComponent(decisionRoute[1]));
    if (!submission) throw new HttpError(404, 'Pending submission not found.', 'SUBMISSION_NOT_FOUND');
    if (body.decision === 'approve') {
      if (submission.item_type === 'service') {
        const service = validateService(JSON.parse(submission.data_json), submission.business_type);
        if (submission.service_id) {
          const existing = database.prepare('SELECT id FROM services WHERE id = ? AND seller_id = ?').get(submission.service_id, submission.seller_id);
          if (!existing) throw new HttpError(409, 'The seller service no longer exists.', 'SERVICE_NOT_FOUND');
          database.prepare(`
            UPDATE services SET business_type = ?, name = ?, description = ?, price = ?,
              duration_minutes = ?, availability = ?, image = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND seller_id = ?
          `).run(...getServiceValues(service), submission.service_id, submission.seller_id);
        } else {
          const id = makeId('svc');
          database.prepare(`
            INSERT INTO services (id, seller_id, business_type, name, description, price, duration_minutes, availability, image, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
          `).run(id, submission.seller_id, ...getServiceValues(service));
        }
      } else {
        const product = validateProduct(JSON.parse(submission.data_json), submission.business_type);
        if (submission.product_id) {
          const existing = database.prepare('SELECT id FROM products WHERE id = ? AND seller_id = ?').get(submission.product_id, submission.seller_id);
          if (!existing) throw new HttpError(409, 'The seller product no longer exists.', 'PRODUCT_NOT_FOUND');
          updateProduct(submission.product_id, product, submission.seller_id);
        } else {
          const id = makeId('prd');
          database.prepare(`
            INSERT INTO products (id, seller_id, business_type, quantity_unit, name, description, price, min_qty, size, serves, lead, availability, image, stock, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
          `).run(id, submission.seller_id, ...getProductValues(product));
        }
      }
    }
    database.prepare(`
      UPDATE submissions SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(body.decision === 'approve' ? 'approved' : 'rejected', session.user.id, submission.id);
    return sendJson(response, 200, { ok: true });
  }

  if (route === '/api/seller/portal' && method === 'GET') {
    const session = requireSession(request, ['seller']);
    const products = database.prepare('SELECT * FROM products WHERE seller_id = ? ORDER BY name').all(session.user.id).map(productFromRow);
    const services = database.prepare('SELECT * FROM services WHERE seller_id = ? ORDER BY name').all(session.user.id).map(serviceFromRow);
    const submissions = database.prepare('SELECT * FROM submissions WHERE seller_id = ? ORDER BY created_at DESC LIMIT 50').all(session.user.id)
      .map(row => ({ ...row, data: JSON.parse(row.data_json) }));
    return sendJson(response, 200, { products, services, submissions });
  }

  if (route === '/api/seller/submissions' && method === 'POST') {
    const session = requireSession(request, ['seller']);
    requireCsrf(request, session);
    const body = await readJson(request);
    const itemType = body.itemType === 'service' ? 'service' : 'product';
    const businessType = session.user.businessType;
    let data;
    let productId = null;
    let serviceId = null;
    if (itemType === 'service') {
      if (!['hair', 'nails'].includes(businessType)) throw new HttpError(403, 'Only hair and nail sellers can submit services.', 'CATEGORY_FORBIDDEN');
      data = validateService(body, businessType);
      serviceId = body.serviceId ? validateText(body.serviceId, 'Service ID', 80) : null;
      if (serviceId && !database.prepare('SELECT id FROM services WHERE id = ? AND seller_id = ?').get(serviceId, session.user.id)) {
        throw new HttpError(404, 'You can only submit changes to your own services.', 'SERVICE_NOT_FOUND');
      }
    } else {
      if (!['bakery', 'clothing'].includes(businessType)) throw new HttpError(403, 'Only bakery and clothing sellers can submit products.', 'CATEGORY_FORBIDDEN');
      data = validateProduct(body, businessType);
      productId = body.productId ? validateText(body.productId, 'Product ID', 80) : null;
      if (productId && !database.prepare('SELECT id FROM products WHERE id = ? AND seller_id = ?').get(productId, session.user.id)) {
        throw new HttpError(404, 'You can only submit changes to your own products.', 'PRODUCT_NOT_FOUND');
      }
    }
    const id = makeId('sub');
    database.prepare(`
      INSERT INTO submissions (id, seller_id, business_type, item_type, product_id, service_id, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, session.user.id, businessType, itemType, productId, serviceId, JSON.stringify(data));
    return sendJson(response, 201, { ok: true, submissionId: id });
  }

  throw new HttpError(404, 'API endpoint not found.', 'NOT_FOUND');
}

function setSecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'"
  );
}

const server = http.createServer(async (request, response) => {
  setSecurityHeaders(response);
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.', 'METHOD_NOT_ALLOWED');
    if (url.pathname !== '/' && url.pathname !== '/index.html' && url.pathname !== '/login' && url.pathname !== '/seller' && url.pathname !== '/app.js') {
      throw new HttpError(404, 'Page not found.', 'NOT_FOUND');
    }
    const publicFiles = {
      '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
      '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
      '/login': { file: 'index.html', type: 'text/html; charset=utf-8' },
      '/seller': { file: 'index.html', type: 'text/html; charset=utf-8' },
      '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' }
    };
    const publicFile = publicFiles[url.pathname];
    if (!publicFile) throw new HttpError(404, 'Page not found.', 'NOT_FOUND');
    const content = fs.readFileSync(path.join(__dirname, publicFile.file));
    response.writeHead(200, {
      'Content-Type': publicFile.type,
      'Content-Length': content.length,
      'Cache-Control': 'no-store'
    });
    return response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (response.headersSent) {
      console.error(error);
      response.destroy();
      return;
    }
    sendError(response, error);
  }
});

server.listen(port, host, () => {
  console.log(`Atelier is listening at http://${host}:${port}`);
  console.log('The public storefront is open; Admin and seller APIs require sign-in.');
});

function shutDown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
