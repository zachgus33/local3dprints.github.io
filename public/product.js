const productId = document.body.dataset.productId;
const optionsRoot = document.querySelector("#productPageOptions");
const addButton = document.querySelector("#productPageAdd");
const toast = document.querySelector("#toast");
let product;
let shop;

function trafficSource() {
  const params = new URLSearchParams(window.location.search);
  const tagged = params.get("utm_source");
  if (tagged) sessionStorage.setItem("llp_source", tagged.slice(0, 60));
  if (sessionStorage.getItem("llp_source")) return sessionStorage.getItem("llp_source");
  try {
    return document.referrer ? new URL(document.referrer).hostname.slice(0, 60) : "direct";
  } catch {
    return "direct";
  }
}

function track(eventName) {
  fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName, productId, source: trafficSource(), path: window.location.pathname }),
    keepalive: true
  }).catch(() => {});
}

function cartKey(item) {
  return [item.id, item.color || "", item.color2 || "", item.capacity || ""].join("|");
}

function loadCart() {
  try {
    const value = JSON.parse(localStorage.getItem("llp_cart_v2") || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function colorClass(value) {
  return `swatch-${String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function makeSelect(labelText, values, formatter, swatches = false) {
  const label = document.createElement("label");
  label.className = `product-option${swatches ? " color-option" : ""}`;
  const caption = document.createElement("span");
  caption.textContent = labelText;
  const row = document.createElement("div");
  row.className = "select-with-swatch";
  const select = document.createElement("select");
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = formatter ? formatter(value) : value;
    select.append(option);
  }
  if (swatches) {
    const dot = document.createElement("i");
    const update = () => { dot.className = `color-swatch ${colorClass(select.value)}`; };
    select.addEventListener("change", update);
    update();
    row.append(dot);
  }
  row.append(select);
  label.append(caption, row);
  optionsRoot.append(label);
  return select;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

async function initialize() {
  const catalog = await fetch("/api/catalog").then((response) => response.json());
  shop = catalog.shop;
  product = catalog.products.find((entry) => entry.id === productId);
  if (!product) return;
  const colors = shop.colors.filter((color) => !shop.outOfStockColors.includes(color));
  let color;
  let color2;
  let capacity;
  if (product.options?.color) color = makeSelect(product.options.colorLabel || "Color", colors, null, true);
  if (product.options?.color2) {
    color2 = makeSelect(product.options.color2Label || "Second color", colors, null, true);
    color2.selectedIndex = Math.min(1, colors.length - 1);
    color2.dispatchEvent(new Event("change"));
  }
  if (product.options?.capacity) {
    capacity = makeSelect(product.options.capacityLabel || "Size", product.options.capacity, (value) => `${value} — $${(product.capacityPrices[value] / 100).toFixed(2)}`);
  }
  addButton.disabled = false;
  document.querySelector("#productCartCount").textContent = loadCart().reduce((sum, item) => sum + Number(item.qty || 0), 0);

  addButton.addEventListener("click", () => {
    if (color && color2 && color.value === color2.value) {
      showToast("Choose two different colors for this print.");
      color2.focus();
      return;
    }
    const item = { id: product.id, qty: 1, color: color?.value || "", color2: color2?.value || "", capacity: capacity ? Number(capacity.value) : null };
    const cart = loadCart();
    const existing = cart.find((entry) => cartKey(entry) === cartKey(item));
    if (existing) existing.qty = Math.min(10, Number(existing.qty || 0) + 1);
    else cart.push(item);
    localStorage.setItem("llp_cart_v2", JSON.stringify(cart));
    track("add_to_cart");
    window.location.assign("/?cart=open");
  });

  track("page_view");
  track("product_view");
}

document.querySelectorAll("[data-product-image]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("#productMainImage").src = button.dataset.productImage;
    document.querySelectorAll("[data-product-image]").forEach((entry) => entry.classList.toggle("active", entry === button));
  });
});

initialize().catch(() => {
  addButton.textContent = "Product temporarily unavailable";
});
