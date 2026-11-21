'use strict';

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
let currentUser = null;
let csrfToken = null;
let products = [];
let orders = [];
let services = [];
let adminServices = [];
let appointments = [];
let settings = {};
let sellerProducts = [];
let sellerServices = [];
let publicBaseUrl = '';
const savedLoginEmailKey = 'atelier.saved-login-email.v1';
const defaultImages = {
  bakery: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=85',
  clothing: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=85',
  hair: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=85',
  nails: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=800&q=85'
};

function escapeHTML(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatPrice(value) {
  return 'KSh ' + Number(value || 0).toLocaleString('en-KE');
}

function safeImage(value, businessType = 'bakery') {
  return /^https:\/\/[^\s"'<>]+$/i.test(value || '')
    ? value
    : defaultImages[businessType] || defaultImages.bakery;
}

function notify(message, error = false) {
  const messageBox = $('#app-message');
  messageBox.textContent = message;
  messageBox.classList.toggle('error', error);
  messageBox.hidden = false;
  window.clearTimeout(notify.timeout);
  notify.timeout = window.setTimeout(() => { messageBox.hidden = true; }, error ? 7000 : 4500);
}

async function api(url, options = {}) {
  const method = options.method || 'GET';
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store'
  });
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const error = new Error(result && result.error ? result.error : 'The request could not be completed.');
    error.status = response.status;
    error.code = result && result.code;
    throw error;
  }
  return result;
}

function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  const firstInput = modal.querySelector('input:not([type="hidden"]):not([readonly])');
  if (firstInput) firstInput.focus();
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove('open');
  if (!$('.modal.open')) document.body.style.overflow = '';
}

function setLoginRole(role) {
  const isSeller = role === 'seller';
  $('#login-role').value = role;
  $('#login-title').textContent = isSeller ? 'Seller sign in' : 'Admin sign in';
  $('#login-role-help').textContent = isSeller
    ? 'Use the seller email and temporary password assigned by the Admin.'
    : 'Use your administrator email and verification password.';
  $('#login-email-label').textContent = isSeller ? 'Seller account email' : 'Administrator email';
  $('#login-password-label').textContent = isSeller ? 'Password assigned by Admin' : 'Verification password';
  $$('[data-login-role]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.loginRole === role));
  });
}

function rememberLoginEmail() {
  const email = $('#login-email').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  try {
    window.localStorage.setItem(savedLoginEmailKey, email);
    $('#login-email-status').textContent = 'Email saved on this device. Your password is never saved.';
  } catch {
    $('#login-email-status').textContent = 'This browser could not save your email. You can still sign in.';
  }
}

function loadRememberedLoginEmail() {
  try {
    const savedEmail = window.localStorage.getItem(savedLoginEmailKey);
    if (savedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(savedEmail)) {
      $('#login-email').value = savedEmail;
      $('#login-email-status').textContent = 'Saved email loaded. Your password is never saved.';
    }
  } catch {
    $('#login-email-status').textContent = 'Email saving is unavailable in this browser.';
  }
}

const eyeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const eyeOffIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a14.5 14.5 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.8 10.8 0 0 0 3-.4"/></svg>';
$$('[data-toggle-password]').forEach(button => button.addEventListener('click', () => {
  const input = document.getElementById(button.dataset.togglePassword);
  const showPassword = input.type === 'password';
  input.type = showPassword ? 'text' : 'password';
  button.setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password');
  button.title = showPassword ? 'Hide password' : 'Show password';
  button.innerHTML = showPassword ? eyeOffIcon : eyeIcon;
}));

function applySettings() {
  const storeName = settings.storeName || settings.store_name || 'Atelier';
  const phone = settings.phone || '0116094185';
  const email = settings.email || 'mutukubrian95@gmail.com';
  const tagline = settings.tagline || 'Explore freshly prepared cakes, considered clothing, professional hair styling and creative nail care.';
  $$('[data-store-name]').forEach(element => { element.textContent = storeName; });
  $('#store-tagline').textContent = tagline;
  $('#store-phone').textContent = phone;
  $('#store-phone').href = 'tel:' + phone.replace(/[^\d+]/g, '');
  $('#store-email').textContent = email;
  $('#store-email').href = 'mailto:' + email;
  $('#store-call').href = 'tel:' + phone.replace(/[^\d+]/g, '');
  document.title = storeName + ' — Cakes, Clothing & Beauty';
}

function renderPublicProducts() {
  const render = (businessType, target, emptyMessage) => {
    const publicProducts = products.filter(product =>
      product.businessType === businessType && product.status === 'published' && product.stock > 0
    );
    $(target).innerHTML = publicProducts.length
      ? publicProducts.map(product => `
      <article class="cake-card">
        <div class="cake-image"><img src="${escapeHTML(safeImage(product.image, businessType))}" alt="${escapeHTML(product.name)}"></div>
        <div class="cake-info">
          <div class="cake-info-top">
            <div><h3 class="serif">${escapeHTML(product.name)}</h3><p>${escapeHTML(product.description)}</p></div>
            <span class="cake-price">${formatPrice(product.price)}<small>per ${escapeHTML(product.quantityUnit || 'kg')}</small></span>
          </div>
          <div class="cake-details">
            ${businessType === 'bakery'
              ? `<span>${escapeHTML(product.size || 'Custom size')}</span><span>Serves ${escapeHTML(product.serves || 'Ask us')}</span><span>${escapeHTML(product.lead || 'Please enquire')}</span>`
              : `<span>${escapeHTML(product.size || 'Various sizes')}</span><span>${escapeHTML(product.availability || 'Available to order')}</span>`}
          </div>
          <span class="availability">${escapeHTML(product.stock)} ${escapeHTML(product.quantityUnit || 'kg')} in stock</span><br>
          <button class="cake-order" type="button" data-order-product="${escapeHTML(product.id)}">${businessType === 'bakery' ? 'Pre-order' : 'Order'}</button>
        </div>
      </article>`).join('')
      : `<p class="empty-state">${emptyMessage}</p>`;
  };
  render('bakery', '#bakery-products', 'There are no cakes available at the moment. Please call or email the bakery.');
  render('clothing', '#clothing-products', 'Clothing items will appear here when the seller publishes a collection.');
  for (const businessType of ['hair', 'nails']) {
    const target = businessType === 'hair' ? '#hair-services' : '#nail-services';
    const available = services.filter(service => service.businessType === businessType && service.status === 'published');
    $(target).innerHTML = available.length
      ? available.map(service => `
        <article class="service-card">
          <img src="${escapeHTML(safeImage(service.image, service.businessType))}" alt="${escapeHTML(service.name)}">
          <h3 class="serif">${escapeHTML(service.name)}</h3>
          <p>${escapeHTML(service.description)}</p>
          <span class="cake-price">${formatPrice(service.price)}<small>${escapeHTML(service.durationMinutes)} minutes</small></span>
          <span class="availability">${escapeHTML(service.availability || 'Contact us to confirm availability')}</span>
          <button class="cake-order" type="button" data-book-service="${escapeHTML(service.id)}">Book this service</button>
        </article>`).join('')
      : `<p class="empty-state">Services from the ${businessType === 'hair' ? 'hair' : 'nail'} studio will appear here after admin approval.</p>`;
  }
}

async function loadPublicStore() {
  const result = await api('/api/public/bootstrap');
  settings = {
    storeName: result.settings.store_name,
    phone: result.settings.phone,
    email: result.settings.email,
    tagline: result.settings.tagline,
    publicBaseUrl: result.publicBaseUrl || ''
  };
  publicBaseUrl = result.publicBaseUrl || '';
  products = result.products;
  services = result.services || [];
  applySettings();
  renderPublicProducts();
}

function showAdminPanel(name) {
  $$('[data-admin-tab]').forEach(button => button.classList.toggle('active', button.dataset.adminTab === name));
  $$('[data-admin-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.adminPanel === name));
}

function renderOrders(list) {
  orders = list;
  const filter = $('#order-filter').value;
  const filtered = filter === 'all' ? orders : orders.filter(order => order.status === filter);
  $('#recent-orders').innerHTML = ordersTable(orders.slice(0, 5));
  $('#all-orders').innerHTML = ordersTable(filtered);
}

function ordersTable(list) {
  if (!list.length) return '<p class="empty-state">No orders have been placed yet.</p>';
  const statuses = ['New', 'Confirmed', 'In preparation', 'Ready', 'Completed', 'Cancelled'];
  const rows = list.map(order => `
    <tr>
      <td>${escapeHTML(order.customer)}<br><span style="color:#85887f">${escapeHTML(order.phone)}${order.email ? '<br>' + escapeHTML(order.email) : ''}</span></td>
      <td>${escapeHTML(order.cake)}<br><span style="color:#85887f">${escapeHTML(order.quantity)} ${escapeHTML(order.quantity_unit || 'kg')} · ${escapeHTML(order.business_type || 'bakery')}</span></td>
      <td>${escapeHTML(order.collection_date)}</td>
      <td>${formatPrice(order.total)}</td>
      <td><select class="status-select" data-order-status="${escapeHTML(order.id)}" aria-label="Update status for ${escapeHTML(order.customer)}">${statuses.map(status => `<option${order.status === status ? ' selected' : ''}>${status}</option>`).join('')}</select></td>
    </tr>`).join('');
  return `<table class="orders-table"><thead><tr><th>Customer contact</th><th>Product / amount</th><th>Pickup / delivery</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderAppointments(list) {
  appointments = list;
  if (!list.length) {
    $('#all-appointments').innerHTML = '<p class="empty-state">No salon appointments have been requested yet.</p>';
    return;
  }
  const statuses = ['New', 'Confirmed', 'Completed', 'Cancelled'];
  $('#all-appointments').innerHTML = `<table class="orders-table"><thead><tr><th>Client</th><th>Service</th><th>Appointment</th><th>Price</th><th>Status</th></tr></thead><tbody>${list.map(item => `
    <tr>
      <td>${escapeHTML(item.customer)}<br><span style="color:#85887f">${escapeHTML(item.phone)}${item.email ? '<br>' + escapeHTML(item.email) : ''}</span></td>
      <td>${escapeHTML(item.service_name)}<br><span style="color:#85887f">${escapeHTML(item.business_type)}</span></td>
      <td>${escapeHTML(item.appointment_date)} · ${escapeHTML(item.appointment_time)}</td>
      <td>${formatPrice(item.total)}</td>
      <td><select class="status-select" data-appointment-status="${escapeHTML(item.id)}" aria-label="Update appointment for ${escapeHTML(item.customer)}">${statuses.map(status => `<option${item.status === status ? ' selected' : ''}>${status}</option>`).join('')}</select></td>
    </tr>`).join('')}</tbody></table>`;
}

function renderAdminProducts() {
  const rows = products.map(product => `
    <div class="product-row">
      <strong>${escapeHTML(product.name)}<small> · ${escapeHTML(product.businessType)}</small></strong>
      <span>${formatPrice(product.price)} / ${escapeHTML(product.quantityUnit || 'kg')}</span>
      <span>Stock: ${escapeHTML(product.stock)} ${escapeHTML(product.quantityUnit || 'kg')}</span>
      <span class="status">${product.status === 'published' && product.stock > 0 ? 'Live' : product.status === 'hidden' ? 'Hidden' : 'Out of stock'}</span>
      <span>
        <button type="button" data-edit-product="${escapeHTML(product.id)}">Edit</button>
        <button type="button" data-toggle-product="${escapeHTML(product.id)}">${product.status === 'published' ? 'Hide' : 'Publish'}</button>
        <button type="button" class="product-disabled" data-delete-product="${escapeHTML(product.id)}">Delete</button>
      </span>
    </div>`).join('');
  $('#admin-products').innerHTML = rows || '<p class="empty-state">No products yet. Add the first cake.</p>';
  $('#overview-products').innerHTML = products.length
    ? products.map(product => `<div class="product-row"><strong>${escapeHTML(product.name)} · ${escapeHTML(product.businessType)}</strong><span>${formatPrice(product.price)} / ${escapeHTML(product.quantityUnit || 'kg')}</span><span>Stock: ${escapeHTML(product.stock)} ${escapeHTML(product.quantityUnit || 'kg')}</span><span class="status">${product.status === 'published' && product.stock > 0 ? 'Live' : 'Hidden'}</span></div>`).join('')
    : '<p class="empty-state">No products have been added.</p>';
}

function renderSubmissions(submissions) {
  $('#seller-submissions').innerHTML = submissions.length
    ? submissions.map(submission => `
      <article class="submission-card">
        <h3 class="serif">${escapeHTML(submission.data.name)} ${submission.item_type === 'service' ? '· Salon service' : submission.product_id ? '· Product update' : '· New product'}</h3>
        <p>Seller: ${escapeHTML(submission.seller_name)} (${escapeHTML(submission.seller_email)}) · ${escapeHTML(submission.business_type)}</p>
        <p>${escapeHTML(submission.data.description)} · ${formatPrice(submission.data.price)}${submission.item_type === 'service' ? ` · ${escapeHTML(submission.data.durationMinutes)} minutes` : ` / ${submission.business_type === 'bakery' ? 'kg' : 'item'} · ${escapeHTML(submission.data.stock)} in stock`}</p>
        <div class="submission-actions">
          <button class="admin-button" type="button" data-submission-decision="approve" data-submission-id="${escapeHTML(submission.id)}">Approve & publish</button>
          <button class="admin-button danger" type="button" data-submission-decision="reject" data-submission-id="${escapeHTML(submission.id)}">Reject</button>
        </div>
      </article>`).join('')
    : '<p class="empty-state">No seller submissions are waiting for review.</p>';
}

function renderSellers(sellers) {
  $('#seller-list').innerHTML = sellers.length
    ? `<table class="orders-table"><thead><tr><th>Seller</th><th>Email</th><th>Assigned work</th><th>Pending changes</th><th>Account</th><th>Action</th></tr></thead><tbody>${sellers.map(seller => `
      <tr>
        <td>${escapeHTML(seller.name)}</td><td>${escapeHTML(seller.email)}</td><td>${escapeHTML(seller.business_type)}</td><td>${escapeHTML(seller.pending_count)}</td>
        <td><span class="status">${seller.active ? 'Active' : 'Disabled'}</span></td>
        <td>
          <button class="admin-button secondary" type="button" data-reset-seller="${seller.id}">Issue new password</button>
          <button class="admin-button secondary" type="button" data-toggle-seller="${seller.id}" data-active="${seller.active ? 'true' : 'false'}">${seller.active ? 'Disable' : 'Enable'}</button>
        </td>
      </tr>`).join('')}</tbody></table>`
    : '<p class="empty-state">No seller accounts yet. Create an account and issue a temporary password above.</p>';
}

function renderAdminServices(list) {
  adminServices = list;
  $('#admin-services').innerHTML = list.length
      ? `<table class="orders-table admin-services-table"><thead><tr><th>Photo</th><th>Service</th><th>Category</th><th>Price</th><th>Duration</th><th>Visibility</th><th>Action</th></tr></thead><tbody>${list.map(service => `
      <tr>
          <td><img class="admin-service-image" src="${escapeHTML(safeImage(service.image, service.businessType))}" alt=""></td>
          <td>${escapeHTML(service.name)}</td><td>${escapeHTML(service.businessType)}</td><td>${formatPrice(service.price)}</td>
        <td>${escapeHTML(service.durationMinutes)} min</td><td>${escapeHTML(service.status)}</td>
          <td><button class="admin-button secondary" type="button" data-edit-service="${escapeHTML(service.id)}">Edit</button>
            <button class="admin-button secondary" type="button" data-toggle-service="${escapeHTML(service.id)}" data-status="${escapeHTML(service.status)}">${service.status === 'published' ? 'Hide' : 'Publish'}</button></td>
      </tr>`).join('')}</tbody></table>`
    : '<p class="empty-state">Salon services submitted by hair and nail sellers will appear here.</p>';
}

async function loadAdminWorkspace() {
  const [summary, productResult, orderResult, settingsResult, submissionResult, sellerResult, serviceResult, appointmentResult] = await Promise.all([
    api('/api/admin/summary'),
    api('/api/admin/products'),
    api('/api/admin/orders'),
    api('/api/admin/settings'),
    api('/api/admin/submissions'),
    api('/api/admin/sellers'),
    api('/api/admin/services'),
    api('/api/admin/appointments')
  ]);
  products = productResult.products;
  $('#metric-orders').textContent = summary.orders;
  $('#metric-pending').textContent = summary.attention;
  $('#metric-sales').textContent = formatPrice(summary.orderValue);
  $('#metric-products').textContent = summary.products;
  $('#metric-submissions').textContent = summary.pending;
  $('#metric-sellers').textContent = summary.sellers;
  $('#metric-appointments').textContent = summary.appointments || 0;
  $('#order-filter').value = 'all';
  renderOrders(orderResult.orders);
  renderAdminProducts();
  renderSubmissions(submissionResult.submissions);
  renderSellers(sellerResult.sellers);
  renderAdminServices(serviceResult.services);
  renderAppointments(appointmentResult.appointments);
  const siteSettings = settingsResult.settings;
  $('#setting-name').value = siteSettings.store_name;
  $('#setting-phone').value = siteSettings.phone;
  $('#setting-email').value = siteSettings.email;
  $('#setting-tagline').value = siteSettings.tagline;
}

async function loadSellerWorkspace() {
  const result = await api('/api/seller/portal');
  sellerProducts = result.products;
  sellerServices = result.services;
  const select = $('#seller-product-choice');
  select.innerHTML = '<option value="">New product</option>' + sellerProducts.map(product =>
    `<option value="${escapeHTML(product.id)}">${escapeHTML(product.name)}</option>`).join('');
  const serviceSelect = $('#seller-service-choice');
  serviceSelect.innerHTML = '<option value="">New service</option>' + sellerServices.map(service =>
    `<option value="${escapeHTML(service.id)}">${escapeHTML(service.name)}</option>`).join('');
  $('#seller-submission-history').innerHTML = result.submissions.length
    ? result.submissions.map(item => `
      <div class="product-row">
        <strong>${escapeHTML(item.data.name)}</strong>
        <span>${formatPrice(item.data.price)}${item.item_type === 'service' ? '' : ` / ${item.business_type === 'bakery' ? 'kg' : 'item'}`}</span>
        <span>${item.item_type === 'service' ? `${escapeHTML(item.data.durationMinutes)} min` : `Stock: ${escapeHTML(item.data.stock)}`}</span>
        <span class="status">${escapeHTML(item.status)}</span>
      </div>`).join('')
    : '<p class="empty-state">Your submissions and review decisions will appear here.</p>';
}

function setAuthenticatedUser(user) {
  currentUser = user;
  document.body.classList.remove('admin-mode', 'seller-mode', 'seller-bakery', 'seller-clothing', 'seller-hair', 'seller-nails', 'password-change-mode');
  const signedIn = Boolean(user);
  $('#admin-login-button').hidden = signedIn;
  $('#signed-in-user').hidden = !signedIn;
  $('#change-password-button').hidden = !signedIn;
  $('#logout-button').hidden = !signedIn;
  $('#host-dashboard').classList.toggle('open', signedIn);
  if (!signedIn) {
    $('#signed-in-user').textContent = '';
    return;
  }
  const isAdmin = user.role === 'admin';
  document.body.classList.add(isAdmin ? 'admin-mode' : 'seller-mode');
  if (!isAdmin) document.body.classList.add('seller-' + user.businessType);
  $('#signed-in-user').textContent = user.name + ' · ' + (isAdmin ? 'Admin' : user.businessType + ' seller');
  $('#dashboard-title').textContent = isAdmin ? 'Store dashboard' : 'Seller workspace';
  $('#dashboard-role').textContent = isAdmin ? 'Administrator' : user.businessType + ' · assigned work';
  $('#seller-work-heading').textContent = user.businessType === 'hair' ? 'Hair services workspace'
    : user.businessType === 'nails' ? 'Nail services workspace'
      : user.businessType === 'clothing' ? 'Clothing store workspace' : 'Bakery workspace';
  $('#seller-product-price-label').textContent = user.businessType === 'clothing' ? 'Price per item (KSh)' : 'Price per kg (KSh)';
  $('#seller-product-stock-label').textContent = user.businessType === 'clothing' ? 'Items in stock' : 'Stock available (kg)';
  $('#seller-product-min-label').textContent = user.businessType === 'clothing' ? 'Minimum order quantity (items)' : 'Minimum order size (kg)';
  const needsPasswordChange = user.mustChangePassword;
  $('#password-change-panel').hidden = !needsPasswordChange;
  document.body.classList.toggle('password-change-mode', needsPasswordChange);
  if (!isAdmin) {
    const isSalon = ['hair', 'nails'].includes(user.businessType);
    $('#seller-product-workspace').hidden = isSalon;
    $('#seller-service-workspace').hidden = !isSalon;
  }
  showAdminPanel(isAdmin ? 'overview' : 'seller');
  if (!needsPasswordChange) {
    const loader = isAdmin ? loadAdminWorkspace : loadSellerWorkspace;
    loader().catch(error => notify(error.message, true));
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function initialize() {
  loadRememberedLoginEmail();
  await loadPublicStore();
  const session = await api('/api/auth/session');
  csrfToken = session.csrfToken;
  const isLoginPage = ['/login', '/seller'].includes(window.location.pathname);
  if (isLoginPage) document.body.classList.add('login-page');
  if (session.user) setAuthenticatedUser(session.user);
  else if (isLoginPage) {
    setLoginRole(window.location.pathname === '/seller' ? 'seller' : 'admin');
    openModal('login-modal');
  }
}

$('#admin-login-button').addEventListener('click', () => {
  setLoginRole('admin');
  $('#login-error').textContent = '';
  $('#login-password').value = '';
  openModal('login-modal');
});

$$('[data-login-role]').forEach(button => button.addEventListener('click', () => {
  setLoginRole(button.dataset.loginRole);
  $('#login-error').textContent = '';
  $('#login-password').value = '';
}));

$('#login-email').addEventListener('input', rememberLoginEmail);

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  rememberLoginEmail();
  $('#login-error').textContent = '';
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: form.elements.email.value,
        password: form.elements.password.value,
        role: form.elements.role.value
      })
    });
    csrfToken = result.csrfToken;
    closeModal($('#login-modal'));
    setAuthenticatedUser(result.user);
  } catch (error) {
    $('#login-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

async function signOut() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    notify(error.message, true);
  } finally {
    csrfToken = null;
    setAuthenticatedUser(null);
    if (['/login', '/seller'].includes(window.location.pathname)) {
      setLoginRole(window.location.pathname === '/seller' ? 'seller' : 'admin');
      openModal('login-modal');
    }
  }
}

$('#logout-button').addEventListener('click', async () => {
  await signOut();
  notify('You have signed out.');
});

$('#change-password-button').addEventListener('click', () => {
  $('#password-change-panel').hidden = false;
  document.body.classList.add('password-change-mode');
  $('#current-password').focus();
});

$('#password-change-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const result = await api('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: form.elements.currentPassword.value,
        newPassword: form.elements.newPassword.value
      })
    });
    form.reset();
    setAuthenticatedUser(result.user);
    notify('Password updated.');
  } catch (error) {
    notify(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

$$('[data-dashboard-storefront]').forEach(button => button.addEventListener('click', () => {
  signOut().then(() => { window.location.href = '/#business-types'; });
}));

$$('[data-admin-tab]').forEach(button => button.addEventListener('click', () => showAdminPanel(button.dataset.adminTab)));
$$('[data-go-tab]').forEach(button => button.addEventListener('click', () => showAdminPanel(button.dataset.goTab)));
$$('.filter').forEach(filter => filter.addEventListener('click', () => {
  $$('.filter').forEach(item => item.classList.remove('active'));
  filter.classList.add('active');
  const category = filter.dataset.filter;
  $$('.card').forEach(card => card.classList.toggle('hidden', category !== 'all' && !card.dataset.category.includes(category)));
}));

$$('[data-open-modal]').forEach(button => button.addEventListener('click', () => openModal('booking-modal')));
$$('.close-modal').forEach(button => button.addEventListener('click', () => closeModal(button.closest('.modal'))));
$$('.modal').forEach(modal => modal.addEventListener('click', event => {
  if (event.target === modal) closeModal(modal);
}));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') $$('.modal.open').forEach(closeModal);
});

function openProductOrder(event) {
  const button = event.target.closest('[data-order-product]');
  if (!button) return;
  const product = products.find(item => item.id === button.dataset.orderProduct);
  if (!product) return;
  const form = $('#order-form');
  form.reset();
  form.elements.productId.value = product.id;
  const unit = product.quantityUnit || 'kg';
  form.elements.cake.value = product.name + ' — ' + formatPrice(product.price) + ' per ' + unit;
  form.elements.quantity.min = product.minQty || 1;
  form.elements.quantity.max = Math.min(product.stock, 100);
  form.elements.quantity.value = product.minQty || 1;
  form.elements.date.min = new Date().toISOString().slice(0, 10);
  $('#order-quantity-label').textContent = 'Quantity (' + unit + ')';
  $('#order-date-label').textContent = product.businessType === 'bakery' ? 'Preferred collection date' : 'Preferred delivery date';
  $('#order-modal-title').textContent = product.businessType === 'bakery' ? 'Pre-order a cake' : 'Order clothing';
  $('#order-message').textContent = '';
  openModal('order-modal');
}

$('#bakery-products').addEventListener('click', openProductOrder);
$('#clothing-products').addEventListener('click', openProductOrder);

function openServiceBooking(event) {
  const button = event.target.closest('[data-book-service]');
  if (!button) return;
  const service = services.find(item => item.id === button.dataset.bookService);
  if (!service) return;
  const form = $('#appointment-form');
  form.reset();
  form.elements.serviceId.value = service.id;
  $('#appointment-service').textContent = service.name;
  $('#appointment-service-details').textContent = formatPrice(service.price) + ' · ' + service.durationMinutes + ' minutes';
  form.elements.date.min = new Date().toISOString().slice(0, 10);
  $('#appointment-message').textContent = '';
  openModal('appointment-modal');
}

$('#hair-services').addEventListener('click', openServiceBooking);
$('#nail-services').addEventListener('click', openServiceBooking);

$('#appointment-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  $('#appointment-message').textContent = '';
  try {
    await api('/api/appointments', {
      method: 'POST',
      body: JSON.stringify({
        serviceId: form.elements.serviceId.value,
        customer: form.elements.customer.value,
        phone: form.elements.phone.value,
        email: form.elements.email.value,
        date: form.elements.date.value,
        time: form.elements.time.value,
        notes: form.elements.notes.value
      })
    });
    $('#appointment-message').textContent = 'Appointment request received. The salon will contact you to confirm.';
    window.setTimeout(() => closeModal($('#appointment-modal')), 2500);
    form.reset();
  } catch (error) {
    $('#appointment-message').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('#order-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  $('#order-message').textContent = '';
  try {
    await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        productId: form.elements.productId.value,
        customer: form.elements.customer.value,
        phone: form.elements.phone.value,
        email: form.elements.email.value,
        quantity: Number(form.elements.quantity.value),
        date: form.elements.date.value,
        notes: form.elements.notes.value
      })
    });
    $('#order-message').textContent = 'Order request received. The seller will contact you to confirm.';
    await loadPublicStore();
    window.setTimeout(() => closeModal($('#order-modal')), 2200);
    form.reset();
  } catch (error) {
    $('#order-message').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

const productModal = $('#product-modal');
const productForm = $('#product-form');
function editProduct(product) {
  productForm.reset();
  productForm.elements.id.value = product ? product.id : '';
  productForm.elements.businessType.value = product ? product.businessType : 'bakery';
  productForm.elements.name.value = product ? product.name : '';
  productForm.elements.price.value = product ? product.price : '';
  productForm.elements.minQty.value = product ? product.minQty : 1;
  productForm.elements.stock.value = product ? product.stock : 0;
  productForm.elements.size.value = product ? product.size : '';
  productForm.elements.serves.value = product ? product.serves : '';
  productForm.elements.lead.value = product ? product.lead : '';
  productForm.elements.description.value = product ? product.description : '';
  productForm.elements.image.value = product ? product.image : '';
  productForm.elements.availability.value = product ? product.availability : '';
  updateAdminProductLabels();
  $('#product-modal-title').textContent = product ? 'Edit product' : 'Add a product';
  openModal('product-modal');
}

function updateAdminProductLabels() {
  const clothing = productForm.elements.businessType.value === 'clothing';
  $('#product-price-label').textContent = clothing ? 'Price per item (KSh)' : 'Price per kg (KSh)';
  $('#product-min-label').textContent = clothing ? 'Minimum order quantity (items)' : 'Minimum size (kg)';
  $('#product-stock-label').textContent = clothing ? 'Items in stock' : 'Stock available (kg)';
}

productForm.elements.businessType.addEventListener('change', updateAdminProductLabels);

$('#add-product').addEventListener('click', () => editProduct(null));
$('#admin-products').addEventListener('click', async event => {
  const editButton = event.target.closest('[data-edit-product]');
  const toggleButton = event.target.closest('[data-toggle-product]');
  const deleteButton = event.target.closest('[data-delete-product]');
  try {
    if (editButton) {
      const product = products.find(item => item.id === editButton.dataset.editProduct);
      if (product) editProduct(product);
    } else if (toggleButton) {
      const product = products.find(item => item.id === toggleButton.dataset.toggleProduct);
      if (!product) return;
      await api('/api/admin/products/' + encodeURIComponent(product.id) + '/visibility', {
        method: 'PATCH',
        body: JSON.stringify({ status: product.status === 'published' ? 'hidden' : 'published' })
      });
      await loadAdminWorkspace();
    } else if (deleteButton) {
      const product = products.find(item => item.id === deleteButton.dataset.deleteProduct);
      if (!product || !window.confirm('Delete ' + product.name + '? Existing orders will remain recorded.')) return;
      await api('/api/admin/products/' + encodeURIComponent(product.id), { method: 'DELETE' });
      await loadAdminWorkspace();
    }
  } catch (error) {
    notify(error.message, true);
  }
});

productForm.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  const product = {
    businessType: form.elements.businessType.value,
    name: form.elements.name.value,
    price: Number(form.elements.price.value),
    minQty: Number(form.elements.minQty.value),
    stock: Number(form.elements.stock.value),
    size: form.elements.size.value,
    serves: form.elements.serves.value,
    lead: form.elements.lead.value,
    description: form.elements.description.value,
    image: form.elements.image.value,
    availability: form.elements.availability.value
  };
  try {
    const id = form.elements.id.value;
    await api(id ? '/api/admin/products/' + encodeURIComponent(id) : '/api/admin/products', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(product)
    });
    closeModal(productModal);
    await loadAdminWorkspace();
    await loadPublicStore();
    notify('Product saved and storefront updated.');
  } catch (error) {
    notify(error.message, true);
  } finally {
    button.disabled = false;
  }
});

$('#admin-services').addEventListener('click', async event => {
  const editButton = event.target.closest('[data-edit-service]');
  const button = event.target.closest('[data-toggle-service]');
  if (editButton) {
    const service = adminServices.find(item => item.id === editButton.dataset.editService);
    if (service) editAdminService(service);
    return;
  }
  if (!button) return;
  try {
    await api('/api/admin/services/' + encodeURIComponent(button.dataset.toggleService) + '/visibility', {
      method: 'PATCH',
      body: JSON.stringify({ status: button.dataset.status === 'published' ? 'hidden' : 'published' })
    });
    await loadAdminWorkspace();
    await loadPublicStore();
  } catch (error) {
    notify(error.message, true);
  }
});

const adminServiceForm = $('#admin-service-form');
function editAdminService(service) {
  adminServiceForm.reset();
  adminServiceForm.elements.serviceId.value = service ? service.id : '';
  adminServiceForm.elements.businessType.value = service ? service.businessType : 'hair';
  adminServiceForm.elements.name.value = service ? service.name : '';
  adminServiceForm.elements.price.value = service ? service.price : '';
  adminServiceForm.elements.durationMinutes.value = service ? service.durationMinutes : 60;
  adminServiceForm.elements.availability.value = service ? service.availability : '';
  adminServiceForm.elements.description.value = service ? service.description : '';
  adminServiceForm.elements.image.value = service ? service.image : '';
  $('#service-modal-title').textContent = service ? 'Edit service & price' : 'Add a service';
  openModal('service-modal');
}

$('#add-service').addEventListener('click', () => editAdminService(null));
adminServiceForm.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const serviceId = form.elements.serviceId.value;
  button.disabled = true;
  try {
    await api(serviceId ? '/api/admin/services/' + encodeURIComponent(serviceId) : '/api/admin/services', {
      method: serviceId ? 'PATCH' : 'POST',
      body: JSON.stringify({
        businessType: form.elements.businessType.value,
        name: form.elements.name.value,
        price: Number(form.elements.price.value),
        durationMinutes: Number(form.elements.durationMinutes.value),
        availability: form.elements.availability.value,
        description: form.elements.description.value,
        image: form.elements.image.value
      })
    });
    closeModal($('#service-modal'));
    await loadAdminWorkspace();
    await loadPublicStore();
    notify('Service and price saved.');
  } catch (error) {
    notify(error.message, true);
  } finally {
    button.disabled = false;
  }
});

$('#order-filter').addEventListener('change', () => renderOrders(orders));
$('#host-dashboard').addEventListener('change', async event => {
  const select = event.target.closest('[data-order-status]');
  if (select) {
    try {
      await api('/api/admin/orders/' + encodeURIComponent(select.dataset.orderStatus), {
        method: 'PATCH',
        body: JSON.stringify({ status: select.value })
      });
      const result = await api('/api/admin/orders');
      renderOrders(result.orders);
    } catch (error) {
      notify(error.message, true);
    }
  }
  const appointmentSelect = event.target.closest('[data-appointment-status]');
  if (appointmentSelect) {
    try {
      await api('/api/admin/appointments/' + encodeURIComponent(appointmentSelect.dataset.appointmentStatus), {
        method: 'PATCH',
        body: JSON.stringify({ status: appointmentSelect.value })
      });
      const result = await api('/api/admin/appointments');
      renderAppointments(result.appointments);
    } catch (error) {
      notify(error.message, true);
    }
  }
});

$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const resultBox = $('#settings-message');
  try {
    const result = await api('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({
        storeName: form.elements.storeName.value,
        phone: form.elements.phone.value,
        email: form.elements.email.value,
        tagline: form.elements.tagline.value
      })
    });
    settings = {
      storeName: result.settings.store_name,
      phone: result.settings.phone,
      email: result.settings.email,
      tagline: result.settings.tagline
    };
    applySettings();
    resultBox.textContent = 'Website settings saved.';
  } catch (error) {
    resultBox.textContent = error.message;
  }
});

function showSellerCredentials(seller, temporaryPassword) {
  $('#credential-email').textContent = seller.email;
  $('#credential-password').textContent = temporaryPassword;
  $('#credential-work').textContent = 'Assigned work: ' + seller.businessType + '.';
  const origin = publicBaseUrl || window.location.origin;
  $('#seller-signin-link').href = origin + '/seller';
  const localLink = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(new URL(origin).hostname);
  $('#seller-link-note').hidden = !localLink;
  $('#seller-link-note').textContent = localLink
    ? 'This is a local-only link and will not open on the seller’s phone or another computer. Deploy the site and set PUBLIC_BASE_URL to share it.'
    : 'Send this public sign-in link to the seller.';
  $('#seller-credentials').hidden = false;
}

$('#seller-create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  $('#seller-create-message').textContent = '';
  try {
    const result = await api('/api/admin/sellers', {
      method: 'POST',
      body: JSON.stringify({
        name: form.elements.name.value,
        email: form.elements.email.value,
        businessType: form.elements.businessType.value
      })
    });
    showSellerCredentials(result.seller, result.temporaryPassword);
    form.reset();
    await loadAdminWorkspace();
    notify('Seller created. Copy the temporary password now; it cannot be viewed again.');
  } catch (error) {
    $('#seller-create-message').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('#copy-credentials').addEventListener('click', async () => {
  const text = $('#seller-signin-link').href + '\n' + $('#credential-email').textContent + '\n' + $('#credential-password').textContent;
  try {
    await navigator.clipboard.writeText(text);
    notify('Seller sign-in details copied.');
  } catch (error) {
    notify('Copy was blocked by the browser. Select the displayed credentials and copy them manually.', true);
  }
});

$('#seller-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-toggle-seller]');
  const resetButton = event.target.closest('[data-reset-seller]');
  if (!button && !resetButton) return;
  try {
    if (resetButton) {
      if (!window.confirm('Issue a new temporary password? The seller will be signed out and must change it.')) return;
      const result = await api('/api/admin/sellers/' + resetButton.dataset.resetSeller + '/reset-password', { method: 'POST' });
      const seller = $('#seller-list').querySelector(`[data-reset-seller="${resetButton.dataset.resetSeller}"]`).closest('tr');
      showSellerCredentials({
        email: seller.children[1].textContent,
        businessType: seller.children[2].textContent
      }, result.temporaryPassword);
      showAdminPanel('sellers');
      notify('Temporary password issued. Copy it now; it cannot be viewed again.');
    } else {
      await api('/api/admin/sellers/' + button.dataset.toggleSeller + '/active', {
        method: 'PATCH',
        body: JSON.stringify({ active: button.dataset.active !== 'true' })
      });
    }
    await loadAdminWorkspace();
    if (button) notify('Seller account updated.');
  } catch (error) {
    notify(error.message, true);
  }
});

$('#seller-submissions').addEventListener('click', async event => {
  const button = event.target.closest('[data-submission-decision]');
  if (!button) return;
  try {
    await api('/api/admin/submissions/' + encodeURIComponent(button.dataset.submissionId) + '/decision', {
      method: 'POST',
      body: JSON.stringify({ decision: button.dataset.submissionDecision })
    });
    await loadAdminWorkspace();
    await loadPublicStore();
    notify(button.dataset.submissionDecision === 'approve' ? 'Seller update approved and published.' : 'Seller update rejected.');
  } catch (error) {
    notify(error.message, true);
  }
});

$('#seller-product-choice').addEventListener('change', event => {
  const product = sellerProducts.find(item => item.id === event.target.value);
  const form = $('#seller-submit-form');
  form.elements.productId.value = product ? product.id : '';
  form.elements.name.value = product ? product.name : '';
  form.elements.price.value = product ? product.price : '';
  form.elements.stock.value = product ? product.stock : '';
  form.elements.minQty.value = product ? product.minQty : 1;
  form.elements.size.value = product ? product.size : '';
  form.elements.serves.value = product ? product.serves : '';
  form.elements.lead.value = product ? product.lead : '';
  form.elements.availability.value = product ? product.availability : '';
  form.elements.description.value = product ? product.description : '';
  form.elements.image.value = product ? product.image : '';
});

$('#seller-service-choice').addEventListener('change', event => {
  const service = sellerServices.find(item => item.id === event.target.value);
  const form = $('#seller-service-form');
  form.elements.serviceId.value = service ? service.id : '';
  form.elements.name.value = service ? service.name : '';
  form.elements.price.value = service ? service.price : '';
  form.elements.durationMinutes.value = service ? service.durationMinutes : 60;
  form.elements.availability.value = service ? service.availability : '';
  form.elements.description.value = service ? service.description : '';
  form.elements.image.value = service ? service.image : '';
});

$('#seller-submit-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  $('#seller-submit-message').textContent = '';
  try {
    await api('/api/seller/submissions', {
      method: 'POST',
      body: JSON.stringify({
        productId: form.elements.productId.value || null,
        name: form.elements.name.value,
        price: Number(form.elements.price.value),
        stock: Number(form.elements.stock.value),
        minQty: Number(form.elements.minQty.value),
        size: form.elements.size.value,
        serves: form.elements.serves.value,
        lead: form.elements.lead.value,
        availability: form.elements.availability.value,
        description: form.elements.description.value,
        image: form.elements.image.value
      })
    });
    $('#seller-submit-message').textContent = 'Sent to the admin for review.';
    await loadSellerWorkspace();
  } catch (error) {
    $('#seller-submit-message').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('#seller-service-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  $('#seller-service-message').textContent = '';
  try {
    await api('/api/seller/submissions', {
      method: 'POST',
      body: JSON.stringify({
        itemType: 'service',
        serviceId: form.elements.serviceId.value || null,
        name: form.elements.name.value,
        price: Number(form.elements.price.value),
        durationMinutes: Number(form.elements.durationMinutes.value),
        availability: form.elements.availability.value,
        description: form.elements.description.value,
        image: form.elements.image.value
      })
    });
    $('#seller-service-message').textContent = 'Service sent to the admin for approval.';
    await loadSellerWorkspace();
  } catch (error) {
    $('#seller-service-message').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('#export-orders').addEventListener('click', () => {
  const link = document.createElement('a');
  link.href = '/api/admin/orders.csv';
  link.download = 'atelier-orders.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
});

$('#booking-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const subject = encodeURIComponent('Customer order or appointment enquiry');
  const message = encodeURIComponent([
    'Name: ' + form.elements.name.value,
    'Email: ' + form.elements.email.value,
    'Business: ' + form.elements.business.value,
    'Details: ' + form.elements.message.value
  ].join('\n'));
  window.location.href = 'mailto:' + (settings.email || 'mutukubrian95@gmail.com') + '?subject=' + subject + '&body=' + message;
  closeModal($('#booking-modal'));
});

initialize().catch(error => {
  console.error(error);
  notify('The storefront could not load its server data. ' + error.message, true);
});
