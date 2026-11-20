'use strict';

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
let currentUser = null;
let csrfToken = null;
let products = [];
let orders = [];
let settings = {};
let sellerProducts = [];

function escapeHTML(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatPrice(value) {
  return 'KSh ' + Number(value || 0).toLocaleString('en-KE');
}

function safeImage(value) {
  return /^https:\/\/[^\s"'<>]+$/i.test(value || '')
    ? value
    : 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=85';
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

function applySettings() {
  const storeName = settings.storeName || settings.store_name || 'Atelier';
  const phone = settings.phone || '0116094185';
  const email = settings.email || 'mutukubrian95@gmail.com';
  const tagline = settings.tagline || '';
  $$('[data-store-name]').forEach(element => { element.textContent = storeName; });
  $('#store-tagline').textContent = tagline;
  $('#store-phone').textContent = phone;
  $('#store-phone').href = 'tel:' + phone.replace(/[^\d+]/g, '');
  $('#store-email').textContent = email;
  $('#store-email').href = 'mailto:' + email;
  $('#store-call').href = 'tel:' + phone.replace(/[^\d+]/g, '');
  document.title = storeName + ' — Business Websites';
}

function renderPublicProducts() {
  const publicProducts = products.filter(product => product.status === 'published' && product.stock > 0);
  $('#bakery-products').innerHTML = publicProducts.length
    ? publicProducts.map(product => `
      <article class="cake-card">
        <div class="cake-image"><img src="${escapeHTML(safeImage(product.image))}" alt="${escapeHTML(product.name)}"></div>
        <div class="cake-info">
          <div class="cake-info-top">
            <div><h3 class="serif">${escapeHTML(product.name)}</h3><p>${escapeHTML(product.description)}</p></div>
            <span class="cake-price">${formatPrice(product.price)}<small>per kg</small></span>
          </div>
          <div class="cake-details">
            <span>${escapeHTML(product.size || 'Custom size')}</span>
            <span>Serves ${escapeHTML(product.serves || 'Ask us')}</span>
            <span>${escapeHTML(product.lead || 'Please enquire')}</span>
          </div>
          <span class="availability">${escapeHTML(product.availability || 'Available to order')} · ${escapeHTML(product.stock)} kg in stock</span><br>
          <button class="cake-order" type="button" data-order-product="${escapeHTML(product.id)}">Pre-order</button>
        </div>
      </article>`).join('')
    : '<p class="empty-state">There are no cakes available at the moment. Please call or email the bakery.</p>';
}

async function loadPublicStore() {
  const result = await api('/api/public/bootstrap');
  settings = {
    storeName: result.settings.store_name,
    phone: result.settings.phone,
    email: result.settings.email,
    tagline: result.settings.tagline
  };
  products = result.products;
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
      <td>${escapeHTML(order.cake)}<br><span style="color:#85887f">${escapeHTML(order.quantity)} kg</span></td>
      <td>${escapeHTML(order.collection_date)}</td>
      <td>${formatPrice(order.total)}</td>
      <td><select class="status-select" data-order-status="${escapeHTML(order.id)}" aria-label="Update status for ${escapeHTML(order.customer)}">${statuses.map(status => `<option${order.status === status ? ' selected' : ''}>${status}</option>`).join('')}</select></td>
    </tr>`).join('');
  return `<table class="orders-table"><thead><tr><th>Customer contact</th><th>Product / amount</th><th>Collection</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderAdminProducts() {
  const rows = products.map(product => `
    <div class="product-row">
      <strong>${escapeHTML(product.name)}</strong>
      <span>${formatPrice(product.price)} / kg</span>
      <span>Stock: ${escapeHTML(product.stock)} kg</span>
      <span class="status">${product.status === 'published' && product.stock > 0 ? 'Live' : product.status === 'hidden' ? 'Hidden' : 'Out of stock'}</span>
      <span>
        <button type="button" data-edit-product="${escapeHTML(product.id)}">Edit</button>
        <button type="button" data-toggle-product="${escapeHTML(product.id)}">${product.status === 'published' ? 'Hide' : 'Publish'}</button>
        <button type="button" class="product-disabled" data-delete-product="${escapeHTML(product.id)}">Delete</button>
      </span>
    </div>`).join('');
  $('#admin-products').innerHTML = rows || '<p class="empty-state">No products yet. Add the first cake.</p>';
  $('#overview-products').innerHTML = products.length
    ? products.map(product => `<div class="product-row"><strong>${escapeHTML(product.name)}</strong><span>${formatPrice(product.price)} / kg</span><span>Stock: ${escapeHTML(product.stock)} kg</span><span class="status">${product.status === 'published' && product.stock > 0 ? 'Live' : 'Hidden'}</span></div>`).join('')
    : '<p class="empty-state">No products have been added.</p>';
}

function renderSubmissions(submissions) {
  $('#seller-submissions').innerHTML = submissions.length
    ? submissions.map(submission => `
      <article class="submission-card">
        <h3 class="serif">${escapeHTML(submission.data.name)} ${submission.product_id ? '· Update' : '· New product'}</h3>
        <p>Seller: ${escapeHTML(submission.seller_name)} (${escapeHTML(submission.seller_email)})</p>
        <p>${escapeHTML(submission.data.description)} · ${formatPrice(submission.data.price)} / kg · ${escapeHTML(submission.data.stock)} kg in stock</p>
        <div class="submission-actions">
          <button class="admin-button" type="button" data-submission-decision="approve" data-submission-id="${escapeHTML(submission.id)}">Approve & publish</button>
          <button class="admin-button danger" type="button" data-submission-decision="reject" data-submission-id="${escapeHTML(submission.id)}">Reject</button>
        </div>
      </article>`).join('')
    : '<p class="empty-state">No seller submissions are waiting for review.</p>';
}

function renderSellers(sellers) {
  $('#seller-list').innerHTML = sellers.length
    ? `<table class="orders-table"><thead><tr><th>Seller</th><th>Email</th><th>Pending changes</th><th>Account</th><th>Action</th></tr></thead><tbody>${sellers.map(seller => `
      <tr>
        <td>${escapeHTML(seller.name)}</td><td>${escapeHTML(seller.email)}</td><td>${escapeHTML(seller.pending_count)}</td>
        <td><span class="status">${seller.active ? 'Active' : 'Disabled'}</span></td>
        <td>
          <button class="admin-button secondary" type="button" data-reset-seller="${seller.id}">Issue new password</button>
          <button class="admin-button secondary" type="button" data-toggle-seller="${seller.id}" data-active="${seller.active ? 'true' : 'false'}">${seller.active ? 'Disable' : 'Enable'}</button>
        </td>
      </tr>`).join('')}</tbody></table>`
    : '<p class="empty-state">No seller accounts yet. Create an account and issue a temporary password above.</p>';
}

async function loadAdminWorkspace() {
  const [summary, productResult, orderResult, settingsResult, submissionResult, sellerResult] = await Promise.all([
    api('/api/admin/summary'),
    api('/api/admin/products'),
    api('/api/admin/orders'),
    api('/api/admin/settings'),
    api('/api/admin/submissions'),
    api('/api/admin/sellers')
  ]);
  products = productResult.products;
  $('#metric-orders').textContent = summary.orders;
  $('#metric-pending').textContent = summary.attention;
  $('#metric-sales').textContent = formatPrice(summary.orderValue);
  $('#metric-products').textContent = summary.products;
  $('#metric-submissions').textContent = summary.pending;
  $('#metric-sellers').textContent = summary.sellers;
  $('#order-filter').value = 'all';
  renderOrders(orderResult.orders);
  renderAdminProducts();
  renderSubmissions(submissionResult.submissions);
  renderSellers(sellerResult.sellers);
  const siteSettings = settingsResult.settings;
  $('#setting-name').value = siteSettings.store_name;
  $('#setting-phone').value = siteSettings.phone;
  $('#setting-email').value = siteSettings.email;
  $('#setting-tagline').value = siteSettings.tagline;
}

async function loadSellerWorkspace() {
  const result = await api('/api/seller/portal');
  sellerProducts = result.products;
  const select = $('#seller-product-choice');
  select.innerHTML = '<option value="">New product</option>' + sellerProducts.map(product =>
    `<option value="${escapeHTML(product.id)}">${escapeHTML(product.name)}</option>`).join('');
  $('#seller-submission-history').innerHTML = result.submissions.length
    ? result.submissions.map(item => `
      <div class="product-row">
        <strong>${escapeHTML(item.data.name)}</strong>
        <span>${formatPrice(item.data.price)} / kg</span>
        <span>Stock: ${escapeHTML(item.data.stock)} kg</span>
        <span class="status">${escapeHTML(item.status)}</span>
      </div>`).join('')
    : '<p class="empty-state">Your submissions and review decisions will appear here.</p>';
}

function setAuthenticatedUser(user) {
  currentUser = user;
  document.body.classList.remove('admin-mode', 'seller-mode', 'password-change-mode');
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
  $('#signed-in-user').textContent = user.name + ' · ' + (isAdmin ? 'Admin' : 'Seller');
  $('#dashboard-title').textContent = isAdmin ? 'Store dashboard' : 'Seller workspace';
  $('#dashboard-role').textContent = isAdmin ? 'Administrator' : 'Seller account';
  const needsPasswordChange = user.mustChangePassword;
  $('#password-change-panel').hidden = !needsPasswordChange;
  document.body.classList.toggle('password-change-mode', needsPasswordChange);
  showAdminPanel(isAdmin ? 'overview' : 'seller');
  if (!needsPasswordChange) {
    const loader = isAdmin ? loadAdminWorkspace : loadSellerWorkspace;
    loader().catch(error => notify(error.message, true));
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function initialize() {
  await loadPublicStore();
  const session = await api('/api/auth/session');
  csrfToken = session.csrfToken;
  if (session.user) setAuthenticatedUser(session.user);
  else if (window.location.pathname === '/seller') {
    $('#login-title').textContent = 'Seller sign in';
    openModal('login-modal');
  }
}

$('#admin-login-button').addEventListener('click', () => {
  $('#login-error').textContent = '';
  $('#login-form').reset();
  openModal('login-modal');
});

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  $('#login-error').textContent = '';
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: form.elements.email.value, password: form.elements.password.value })
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
  signOut().then(() => { window.location.hash = '#bakery'; });
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

$('#bakery-products').addEventListener('click', event => {
  const button = event.target.closest('[data-order-product]');
  if (!button) return;
  const product = products.find(item => item.id === button.dataset.orderProduct);
  if (!product) return;
  const form = $('#order-form');
  form.reset();
  form.elements.productId.value = product.id;
  form.elements.cake.value = product.name + ' — ' + formatPrice(product.price) + ' per kg';
  form.elements.quantity.min = product.minQty || 1;
  form.elements.quantity.max = product.stock;
  form.elements.quantity.value = product.minQty || 1;
  form.elements.date.min = new Date().toISOString().slice(0, 10);
  $('#order-message').textContent = '';
  openModal('order-modal');
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
    $('#order-message').textContent = 'Request received. The bakery will contact you to confirm your order.';
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
  $('#product-modal-title').textContent = product ? 'Edit product' : 'Add a cake';
  openModal('product-modal');
}

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

$('#seller-create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  $('#seller-create-message').textContent = '';
  try {
    const result = await api('/api/admin/sellers', {
      method: 'POST',
      body: JSON.stringify({ name: form.elements.name.value, email: form.elements.email.value })
    });
    $('#credential-email').textContent = result.seller.email;
    $('#credential-password').textContent = result.temporaryPassword;
    $('#seller-credentials').hidden = false;
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
  const text = window.location.origin + '/seller\n' + $('#credential-email').textContent + '\n' + $('#credential-password').textContent;
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
      $('#credential-email').textContent = seller.children[1].textContent;
      $('#credential-password').textContent = result.temporaryPassword;
      $('#seller-credentials').hidden = false;
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
  const subject = encodeURIComponent('Website consultation request');
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
