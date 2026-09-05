const state = { orders: [], selectedOrder: null };
const elements = {
  loginScreen: document.querySelector("#loginScreen"),
  dashboard: document.querySelector("#dashboard"),
  loginForm: document.querySelector("#loginForm"),
  loginError: document.querySelector("#loginError"),
  ordersBody: document.querySelector("#ordersBody"),
  tableMessage: document.querySelector("#tableMessage"),
  resultCount: document.querySelector("#resultCount"),
  statusFilter: document.querySelector("#statusFilter"),
  orderSearch: document.querySelector("#orderSearch"),
  orderDialog: document.querySelector("#orderDialog"),
  statusForm: document.querySelector("#statusForm"),
  dialogError: document.querySelector("#dialogError"),
  toast: document.querySelector("#adminToast")
};

const statusLabels = {
  awaiting_payment: "Awaiting payment",
  new: "New",
  quote_requested: "Quote requested",
  in_production: "In production",
  ready: "Ready",
  fulfilled: "Fulfilled",
  canceled: "Canceled",
  unpaid: "Unpaid",
  paid: "Paid",
  failed: "Failed",
  expired: "Expired",
  checkout_error: "Checkout error",
  quote_required: "Quote required"
};

function money(cents, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((Number(cents) || 0) / 100);
}

function formatDate(value, includeTime = false) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", includeTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }
  ).format(date);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makePill(value) {
  return makeElement("span", `pill ${value}`, statusLabels[value] || value.replaceAll("_", " "));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function showLogin(message = "") {
  elements.dashboard.hidden = true;
  elements.loginScreen.hidden = false;
  elements.loginError.textContent = message;
}

function showDashboard() {
  elements.loginScreen.hidden = true;
  elements.dashboard.hidden = false;
  loadOrders();
}

function renderStats(stats) {
  document.querySelector("#statNew").textContent = stats.new;
  document.querySelector("#statProduction").textContent = stats.inProduction;
  document.querySelector("#statReady").textContent = stats.ready;
  document.querySelector("#statRevenue").textContent = money(stats.paidRevenueCents);
}

function renderAnalytics(analytics = {}) {
  document.querySelector("#metricPageViews").textContent = analytics.pageViews || 0;
  document.querySelector("#metricProductViews").textContent = analytics.productViews || 0;
  document.querySelector("#metricQuoteClicks").textContent = analytics.customRequestClicks || 0;
  document.querySelector("#metricAddToCart").textContent = analytics.addToCart || 0;
  document.querySelector("#metricCheckout").textContent = analytics.checkoutStarted || 0;
  document.querySelector("#metricPurchases").textContent = analytics.purchaseCompleted || 0;
  document.querySelector("#metricQuotes").textContent = analytics.customRequestsSubmitted || 0;
  const sources = analytics.sources || [];
  document.querySelector("#trafficSources").textContent = sources.length
    ? sources.map((entry) => `${entry.source}: ${entry.count}`).join(" · ")
    : "No visits recorded yet.";
}

function isQuote(order) {
  return order.order_type === "quote";
}

function renderOrders() {
  elements.ordersBody.replaceChildren();
  elements.resultCount.textContent = `${state.orders.length} result${state.orders.length === 1 ? "" : "s"}`;
  elements.tableMessage.hidden = state.orders.length > 0;
  elements.tableMessage.textContent = "No orders match these filters.";

  for (const order of state.orders) {
    const row = document.createElement("tr");
    if (isQuote(order)) row.className = "quote-row";
    row.tabIndex = 0;
    row.setAttribute("aria-label", `Open ${order.id}`);

    const orderCell = makeElement("td", "");
    const orderCopy = makeElement("div", "order-cell");
    if (isQuote(order)) orderCopy.append(makeElement("span", "order-kind request-kind", "CUSTOM REQUEST"));
    orderCopy.append(makeElement("strong", "", order.id), makeElement("span", "", formatDate(order.created_at)));
    orderCell.append(orderCopy);

    const customerCell = makeElement("td", "");
    const customerCopy = makeElement("div", "customer-cell");
    customerCopy.append(makeElement("strong", "", order.customer_name), makeElement("span", "", order.customer_email));
    customerCell.append(customerCopy);

    const fulfillment = makeElement("td", "", order.fulfillment === "delivery" ? "Delivery" : "Pickup");
    const total = makeElement("td", "amount", isQuote(order) ? "Needs quote" : money(order.total_cents, order.currency));
    const payment = makeElement("td", "");
    payment.append(makePill(order.payment_status));
    const status = makeElement("td", "");
    status.append(makePill(order.status));
    const action = makeElement("td", "");
    const actionButton = makeElement("button", "row-button", "→");
    actionButton.type = "button";
    actionButton.setAttribute("aria-label", `View ${order.id}`);
    action.append(actionButton);
    row.append(orderCell, customerCell, fulfillment, total, payment, status, action);
    row.addEventListener("click", () => openOrder(order));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") openOrder(order);
    });
    elements.ordersBody.append(row);
  }
}

function customerDetail(label, value, href = "") {
  const block = makeElement("div", "customer-detail");
  block.append(makeElement("span", "", label));
  if (href && value) {
    const link = makeElement("a", "", value);
    link.href = href;
    block.append(link);
  } else {
    block.append(makeElement("p", "", value || "—"));
  }
  return block;
}

function itemOptions(item) {
  const isPacmanClock = item.product_id === "pacman-clock";
  const colorLabel = isPacmanClock ? "Line color" : "Color";
  const color2Label = isPacmanClock ? "Food color" : "Line color";
  return [
    item.color ? `${colorLabel}: ${item.color}` : "",
    item.color2 ? `${color2Label}: ${item.color2}` : "",
    item.capacity ? `Size: ${item.capacity}` : "",
    item.details || ""
  ].filter(Boolean).join(" · ");
}

function openOrder(order) {
  state.selectedOrder = order;
  document.querySelector("#detailOrderId").textContent = order.id;
  const meta = document.querySelector("#detailMeta");
  meta.replaceChildren(
    makePill(order.status),
    makePill(order.payment_status),
    makeElement("span", "pill", formatDate(order.created_at, true))
  );

  const items = document.querySelector("#detailItems");
  items.replaceChildren(...order.items.map((item) => {
    const row = makeElement("div", "detail-item");
    row.append(
      makeElement("strong", "", `${item.quantity}× ${item.name}`),
      makeElement("span", "amount", item.unit_amount ? money(item.unit_amount * item.quantity, order.currency) : "Quote"),
      makeElement("p", "", itemOptions(item) || "Standard configuration")
    );
    return row;
  }));

  const attachmentsSection = document.querySelector("#detailAttachmentsSection");
  const attachments = document.querySelector("#detailAttachments");
  attachmentsSection.hidden = !order.attachments?.length;
  attachments.replaceChildren(...(order.attachments || []).map((attachment) => {
    const link = makeElement("a", "attachment-link");
    link.href = `/api/admin/attachments/${encodeURIComponent(attachment.id)}`;
    link.append(
      makeElement("strong", "", attachment.original_name),
      makeElement("span", "", `${(attachment.size_bytes / 1024 / 1024).toFixed(2)} MB · Download →`)
    );
    return link;
  }));

  const customer = document.querySelector("#detailCustomer");
  customer.replaceChildren(
    customerDetail("Name", order.customer_name),
    customerDetail("Email", order.customer_email, `mailto:${order.customer_email}`),
    customerDetail("Phone", order.customer_phone, order.customer_phone ? `tel:${order.customer_phone}` : ""),
    customerDetail("Fulfillment", order.fulfillment === "delivery" ? "Local delivery" : "Local pickup"),
    customerDetail("Address", order.address || "Not provided")
  );
  const notesSection = document.querySelector("#detailNotesSection");
  notesSection.hidden = !order.customer_notes;
  document.querySelector("#detailNotes").textContent = order.customer_notes || "";
  document.querySelector("#detailTotal").textContent = order.order_type === "quote" ? "To be quoted" : money(order.total_cents, order.currency);
  elements.statusForm.elements.orderId.value = order.id;
  elements.statusForm.elements.status.value = order.status;
  elements.dialogError.textContent = "";
  elements.orderDialog.showModal();
}

async function loadOrders() {
  elements.tableMessage.hidden = false;
  elements.tableMessage.textContent = "Loading orders…";
  const query = new URLSearchParams({
    status: elements.statusFilter.value,
    search: elements.orderSearch.value.trim()
  });
  try {
    const data = await api(`/api/admin/orders?${query}`);
    state.orders = data.orders;
    renderStats(data.stats);
    renderAnalytics(data.analytics);
    renderOrders();
  } catch (error) {
    if (error.status === 401) return showLogin("Your session expired. Sign in again.");
    elements.tableMessage.textContent = error.message;
  }
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#loginButton");
  elements.loginError.textContent = "";
  button.disabled = true;
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: elements.loginForm.elements.password.value }) });
    elements.loginForm.reset();
    showDashboard();
  } catch (error) {
    elements.loginError.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" }).catch(() => {});
  showLogin();
});
document.querySelector("#refreshButton").addEventListener("click", () => {
  loadOrders();
  showToast("Orders refreshed");
});
elements.statusFilter.addEventListener("change", loadOrders);
elements.orderSearch.addEventListener("input", () => {
  clearTimeout(elements.orderSearch.timer);
  elements.orderSearch.timer = setTimeout(loadOrders, 280);
});
document.querySelector("#closeDialog").addEventListener("click", () => elements.orderDialog.close());
elements.orderDialog.addEventListener("click", (event) => {
  if (event.target === elements.orderDialog) elements.orderDialog.close();
});

elements.statusForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#saveStatusButton");
  elements.dialogError.textContent = "";
  button.disabled = true;
  try {
    const orderId = elements.statusForm.elements.orderId.value;
    const result = await api(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: elements.statusForm.elements.status.value })
    });
    const index = state.orders.findIndex((order) => order.id === orderId);
    if (index >= 0) state.orders[index] = result.order;
    renderStats(result.stats);
    renderOrders();
    elements.orderDialog.close();
    showToast("Order status updated");
  } catch (error) {
    elements.dialogError.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#menuButton").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));

(async function initialize() {
  try {
    const session = await api("/api/admin/session");
    if (session.authenticated) showDashboard();
    else showLogin(session.configured ? "" : "Admin access has not been configured on the server yet.");
  } catch {
    showLogin("Unable to reach the order server.");
  }
})();
