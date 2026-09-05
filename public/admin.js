const state = { orders: [], selectedOrder: null, view: "all" };
const elements = {
  loginScreen: document.querySelector("#loginScreen"),
  dashboard: document.querySelector("#dashboard"),
  loginForm: document.querySelector("#loginForm"),
  loginError: document.querySelector("#loginError"),
  ordersBody: document.querySelector("#ordersBody"),
  tableMessage: document.querySelector("#tableMessage"),
  resultCount: document.querySelector("#resultCount"),
  orderPanelTitle: document.querySelector("#orderPanelTitle"),
  statusFilter: document.querySelector("#statusFilter"),
  orderSearch: document.querySelector("#orderSearch"),
  orderTabs: [...document.querySelectorAll("[data-order-view]")],
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

function isQuote(order) {
  return order.order_type === "quote";
}

function isPaidOpen(order) {
  return !isQuote(order) && order.payment_status === "paid" && !["fulfilled", "canceled"].includes(order.status);
}

function matchesView(order) {
  if (state.view === "quotes") return isQuote(order);
  if (state.view === "paid_open") return isPaidOpen(order);
  if (state.view === "fulfilled") return order.status === "fulfilled";
  return true;
}

function orderGroup(order) {
  if (isQuote(order)) return "quotes";
  if (isPaidOpen(order)) return "paid_open";
  if (order.status === "fulfilled") return "fulfilled";
  return "other";
}

const groupLabels = {
  quotes: "Quote requests",
  paid_open: "Paid — needs fulfillment",
  other: "Other orders",
  fulfilled: "Fulfilled orders"
};

const groupPriority = { quotes: 0, paid_open: 1, other: 2, fulfilled: 3 };
const viewTitles = { all: "All orders", quotes: "Quote requests", paid_open: "Paid & open", fulfilled: "Fulfilled orders" };

function visibleOrders() {
  const status = elements.statusFilter.value;
  return state.orders
    .filter((order) => matchesView(order) && (status === "all" || order.status === status))
    .sort((left, right) => {
      if (state.view === "all") {
        const groupDifference = groupPriority[orderGroup(left)] - groupPriority[orderGroup(right)];
        if (groupDifference) return groupDifference;
      }
      return new Date(right.created_at) - new Date(left.created_at);
    });
}

function renderTabCounts() {
  document.querySelector("#tabAllCount").textContent = state.orders.length;
  document.querySelector("#tabQuoteCount").textContent = state.orders.filter(isQuote).length;
  document.querySelector("#tabPaidCount").textContent = state.orders.filter(isPaidOpen).length;
  document.querySelector("#tabFulfilledCount").textContent = state.orders.filter((order) => order.status === "fulfilled").length;
  for (const tab of elements.orderTabs) {
    const active = tab.dataset.orderView === state.view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  }
}

function renderOrders() {
  const orders = visibleOrders();
  elements.ordersBody.replaceChildren();
  elements.resultCount.textContent = `${orders.length} result${orders.length === 1 ? "" : "s"}`;
  elements.tableMessage.hidden = orders.length > 0;
  elements.tableMessage.textContent = "No orders match these filters.";
  elements.orderPanelTitle.textContent = viewTitles[state.view];
  renderTabCounts();

  let previousGroup = "";
  for (const order of orders) {
    const group = orderGroup(order);
    if (state.view === "all" && group !== previousGroup) {
      const headingRow = document.createElement("tr");
      headingRow.className = `order-group order-group-${group}`;
      const headingCell = makeElement("td", "", groupLabels[group]);
      headingCell.colSpan = 7;
      headingRow.append(headingCell);
      elements.ordersBody.append(headingRow);
      previousGroup = group;
    }

    const row = document.createElement("tr");
    row.className = isQuote(order) ? "quote-row" : isPaidOpen(order) ? "paid-open-row" : order.status === "fulfilled" ? "fulfilled-row" : "other-row";
    row.tabIndex = 0;
    row.setAttribute("aria-label", `Open ${order.id}`);

    const orderCell = makeElement("td", "");
    const orderCopy = makeElement("div", "order-cell");
    const orderKind = makeElement("span", `order-kind ${isQuote(order) ? "request-kind" : "sale-kind"}`, isQuote(order) ? "REQUEST" : "ORDER");
    orderCopy.append(orderKind, makeElement("strong", "", order.id), makeElement("span", "", formatDate(order.created_at)));
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
  return [
    item.color ? `Color: ${item.color}` : "",
    item.color2 ? `Line color: ${item.color2}` : "",
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
    status: "all",
    search: elements.orderSearch.value.trim()
  });
  try {
    const data = await api(`/api/admin/orders?${query}`);
    state.orders = data.orders;
    renderStats(data.stats);
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
elements.statusFilter.addEventListener("change", renderOrders);
for (const tab of elements.orderTabs) {
  tab.addEventListener("click", () => {
    state.view = tab.dataset.orderView;
    elements.statusFilter.value = "all";
    renderOrders();
  });
}
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
