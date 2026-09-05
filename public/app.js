const state = {
  shop: null,
  products: [],
  cart: loadCart(),
  category: "All",
  search: ""
};

const elements = {
  productGrid: document.querySelector("#productGrid"),
  categoryList: document.querySelector("#categoryList"),
  searchInput: document.querySelector("#searchInput"),
  cartDrawer: document.querySelector("#cartDrawer"),
  drawerBackdrop: document.querySelector("#drawerBackdrop"),
  cartBody: document.querySelector("#cartBody"),
  cartFooter: document.querySelector("#cartFooter"),
  cartCount: document.querySelector("#cartCount"),
  cartSubtotal: document.querySelector("#cartSubtotal"),
  openCartButton: document.querySelector("#openCartButton"),
  checkoutModal: document.querySelector("#checkoutModal"),
  checkoutForm: document.querySelector("#checkoutForm"),
  checkoutTotal: document.querySelector("#checkoutTotal"),
  checkoutError: document.querySelector("#checkoutError"),
  quoteModal: document.querySelector("#quoteModal"),
  quoteForm: document.querySelector("#quoteForm"),
  quoteError: document.querySelector("#quoteError"),
  statusBanner: document.querySelector("#statusBanner"),
  toast: document.querySelector("#toast")
};

function loadCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem("llp_cart_v2") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem("llp_cart_v2", JSON.stringify(state.cart));
}

function money(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: state.shop?.currency || "USD"
  }).format((Number(cents) || 0) / 100);
}

function productPrice(product, capacity) {
  if (product.capacityPrices) return product.capacityPrices[Number(capacity)] ?? 0;
  return product.priceCents || 0;
}

function startingPrice(product) {
  if (!product.capacityPrices) return product.priceCents || 0;
  return Math.min(...Object.values(product.capacityPrices));
}

function findProduct(productId) {
  return state.products.find((product) => product.id === productId);
}

function cartKey(item) {
  return [item.id, item.color || "", item.color2 || "", item.capacity || ""].join("|");
}

function cartSubtotal() {
  return state.cart.reduce((sum, item) => {
    const product = findProduct(item.id);
    return sum + (product ? productPrice(product, item.capacity) * item.qty : 0);
  }, 0);
}

function optionSummary(item, product) {
  return [
    item.color ? `${product.options?.colorLabel || "Color"}: ${item.color}` : "",
    item.color2 ? `${product.options?.color2Label || "Second color"}: ${item.color2}` : "",
    item.capacity ? `${product.options?.capacityLabel || "Size"}: ${item.capacity}` : ""
  ].filter(Boolean).join(" · ");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderCategories() {
  const categories = ["All", ...new Set(state.products.map((product) => product.category))];
  elements.categoryList.replaceChildren(...categories.map((category) => {
    const button = makeElement("button", `filter-button${category === state.category ? " active" : ""}`, category);
    button.type = "button";
    button.addEventListener("click", () => {
      state.category = category;
      renderCategories();
      renderProducts();
    });
    return button;
  }));
}

function makeSelect(labelText, values, selected, formatter) {
  const label = makeElement("label", "product-option");
  label.append(makeElement("span", "", labelText));
  const select = document.createElement("select");
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = formatter ? formatter(value) : value;
    option.selected = String(value) === String(selected);
    select.append(option);
  }
  label.append(select);
  return { label, select };
}

function renderProduct(product, index) {
  const card = makeElement("article", "product-card");
  const media = makeElement("div", "product-media");
  const image = document.createElement("img");
  image.src = product.images[0];
  image.alt = product.name;
  image.loading = index < 3 ? "eager" : "lazy";
  media.append(image, makeElement("span", "product-number", String(index + 1).padStart(2, "0")));

  if (product.images.length > 1) {
    const dots = makeElement("div", "image-dots");
    product.images.forEach((source, imageIndex) => {
      const dot = makeElement("button", `image-dot${imageIndex === 0 ? " active" : ""}`, String(imageIndex + 1));
      dot.type = "button";
      dot.setAttribute("aria-label", `View image ${imageIndex + 1} of ${product.name}`);
      dot.addEventListener("click", () => {
        image.src = source;
        dots.querySelectorAll("button").forEach((entry) => entry.classList.remove("active"));
        dot.classList.add("active");
      });
      dots.append(dot);
    });
    media.append(dots);
  }

  const badge = makeElement("span", "product-price-badge", product.capacityPrices ? `from ${money(startingPrice(product)).replace(".00", "")}` : money(startingPrice(product)).replace(".00", ""));
  media.append(badge);

  const info = makeElement("div", "product-info");
  const heading = makeElement("div", "product-heading");
  const title = makeElement("h3", "", product.name);
  const price = makeElement("strong", "", product.capacityPrices ? `From ${money(startingPrice(product))}` : money(product.priceCents));
  heading.append(title, price);
  info.append(heading, makeElement("p", "product-description", product.description));

  const tags = makeElement("div", "product-tags");
  product.tags.forEach((tag) => tags.append(makeElement("span", "", tag)));
  info.append(tags);

  const options = makeElement("div", "product-options");
  const availableColors = state.shop.colors.filter((color) => !state.shop.outOfStockColors.includes(color));
  let colorSelect;
  let color2Select;
  let capacitySelect;

  if (product.options?.color) {
    const field = makeSelect(product.options.colorLabel || "Color", availableColors, availableColors[0]);
    colorSelect = field.select;
    options.append(field.label);
  }
  if (product.options?.color2) {
    const field = makeSelect(product.options.color2Label || "Second color", availableColors, availableColors[1] || availableColors[0]);
    color2Select = field.select;
    options.append(field.label);
  }
  if (product.options?.capacity) {
    const field = makeSelect(
      product.options.capacityLabel || "Size",
      product.options.capacity,
      product.options.capacity[0],
      (value) => `${value} — ${money(product.capacityPrices[value])}`
    );
    capacitySelect = field.select;
    capacitySelect.addEventListener("change", () => {
      price.textContent = money(productPrice(product, capacitySelect.value));
      badge.textContent = money(productPrice(product, capacitySelect.value)).replace(".00", "");
    });
    options.append(field.label);
  }
  info.append(options);

  const addButton = makeElement("button", "add-button");
  addButton.type = "button";
  addButton.append(makeElement("span", "", "Add to cart"), makeElement("span", "", "+"));
  addButton.addEventListener("click", () => {
    if (colorSelect && color2Select && colorSelect.value === color2Select.value) {
      showToast("Choose two different colors for this print.");
      color2Select.focus();
      return;
    }
    addToCart({
      id: product.id,
      qty: 1,
      color: colorSelect?.value || "",
      color2: color2Select?.value || "",
      capacity: capacitySelect?.value ? Number(capacitySelect.value) : null
    });
  });
  info.append(addButton);
  card.append(media, info);
  return card;
}

function renderProducts() {
  const query = state.search.trim().toLowerCase();
  const filtered = state.products.filter((product) => {
    const matchesCategory = state.category === "All" || product.category === state.category;
    const haystack = `${product.name} ${product.description} ${product.category} ${product.tags.join(" ")}`.toLowerCase();
    return matchesCategory && (!query || haystack.includes(query));
  });
  if (!filtered.length) {
    const empty = makeElement("div", "empty-products");
    empty.append(makeElement("h3", "", "No prints found"), makeElement("p", "", "Try another category or a different search."));
    elements.productGrid.replaceChildren(empty);
    return;
  }
  elements.productGrid.replaceChildren(...filtered.map(renderProduct));
}

function addToCart(item) {
  const key = cartKey(item);
  const existing = state.cart.find((entry) => cartKey(entry) === key);
  if (existing) existing.qty = Math.min(10, existing.qty + 1);
  else state.cart.push(item);
  saveCart();
  renderCart();
  openCart();
  showToast("Added to your cart");
}

function updateQuantity(key, change) {
  const item = state.cart.find((entry) => cartKey(entry) === key);
  if (!item) return;
  item.qty = Math.max(0, Math.min(10, item.qty + change));
  if (item.qty === 0) state.cart = state.cart.filter((entry) => cartKey(entry) !== key);
  saveCart();
  renderCart();
}

function renderCart() {
  state.cart = state.cart.filter((item) => findProduct(item.id));
  const itemCount = state.cart.reduce((sum, item) => sum + item.qty, 0);
  elements.cartCount.textContent = itemCount;
  elements.cartCount.setAttribute("aria-label", `${itemCount} item${itemCount === 1 ? "" : "s"}`);
  elements.cartSubtotal.textContent = money(cartSubtotal());
  elements.cartFooter.classList.toggle("is-empty", state.cart.length === 0);

  if (!state.cart.length) {
    const empty = makeElement("div", "empty-cart");
    empty.append(
      makeElement("div", "empty-cart-icon", "⌁"),
      makeElement("h3", "", "Your cart is ready when you are."),
      makeElement("p", "", "Choose a print and customize it to get started.")
    );
    elements.cartBody.replaceChildren(empty);
    return;
  }

  const rows = state.cart.map((item) => {
    const product = findProduct(item.id);
    const row = makeElement("article", "cart-item");
    const image = document.createElement("img");
    image.src = product.images[0];
    image.alt = "";
    const content = makeElement("div", "");
    content.append(makeElement("h3", "", product.name), makeElement("p", "", optionSummary(item, product)));
    const actions = makeElement("div", "cart-item-actions");
    const quantity = makeElement("div", "quantity-control");
    const minus = makeElement("button", "", "−");
    const plus = makeElement("button", "", "+");
    minus.type = plus.type = "button";
    minus.setAttribute("aria-label", `Decrease ${product.name} quantity`);
    plus.setAttribute("aria-label", `Increase ${product.name} quantity`);
    minus.addEventListener("click", () => updateQuantity(cartKey(item), -1));
    plus.addEventListener("click", () => updateQuantity(cartKey(item), 1));
    quantity.append(minus, makeElement("span", "", item.qty), plus);
    const remove = makeElement("button", "remove-item", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => {
      state.cart = state.cart.filter((entry) => cartKey(entry) !== cartKey(item));
      saveCart();
      renderCart();
    });
    actions.append(quantity, remove);
    content.append(actions);
    row.append(image, content, makeElement("strong", "cart-item-price", money(productPrice(product, item.capacity) * item.qty)));
    return row;
  });
  elements.cartBody.replaceChildren(...rows);
}

function openCart() {
  elements.cartDrawer.classList.add("open");
  elements.drawerBackdrop.classList.add("open");
  elements.cartDrawer.setAttribute("aria-hidden", "false");
  elements.openCartButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("no-scroll");
  document.querySelector("#closeCartButton").focus();
}

function closeCart() {
  elements.cartDrawer.classList.remove("open");
  elements.drawerBackdrop.classList.remove("open");
  elements.cartDrawer.setAttribute("aria-hidden", "true");
  elements.openCartButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("no-scroll");
}

function openModal(modal) {
  closeCart();
  if (!modal.open) modal.showModal();
}

function checkoutPayload(form) {
  const data = new FormData(form);
  return {
    customerName: data.get("customerName"),
    customerEmail: data.get("customerEmail"),
    customerPhone: data.get("customerPhone"),
    fulfillment: data.get("fulfillment"),
    address: data.get("address"),
    customerNotes: data.get("customerNotes"),
    items: state.cart.map(({ id, qty, color, color2, capacity }) => ({ id, qty, color, color2, capacity }))
  };
}

async function submitJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function toggleDeliveryFields(form, field) {
  const delivery = form.elements.fulfillment.value === "delivery";
  field.classList.toggle("hidden", !delivery);
  const address = form.elements.address;
  if (address) address.required = delivery;
  if (form === elements.checkoutForm) {
    elements.checkoutTotal.textContent = money(cartSubtotal() + (delivery ? state.shop.deliveryFeeCents : 0));
  }
}

function showStatus({ title, message, icon = "✓", error = false }) {
  document.querySelector("#statusTitle").textContent = title;
  document.querySelector("#statusMessage").textContent = message;
  const iconElement = document.querySelector("#statusIcon");
  iconElement.textContent = icon;
  iconElement.style.background = error ? "#e76f36" : "#f0b65a";
  elements.statusBanner.hidden = false;
}

async function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get("checkout");
  if (checkout === "canceled") {
    showStatus({ title: "Checkout canceled", message: "Nothing was charged and your cart has been saved.", icon: "×", error: true });
    window.history.replaceState({}, "", window.location.pathname);
    return;
  }
  if (checkout !== "success") return;

  const orderId = params.get("order");
  const sessionId = params.get("session_id");
  showStatus({ title: "Confirming your payment…", message: `Order ${orderId || ""}` });
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}?session_id=${encodeURIComponent(sessionId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (data.order.paymentStatus === "paid") {
      state.cart = [];
      saveCart();
      renderCart();
      showStatus({
        title: "Order confirmed",
        message: `${data.order.id} is paid and in our queue. We’ll follow up about ${data.order.fulfillment}.`
      });
    } else {
      showStatus({
        title: "Payment is processing",
        message: `${data.order.id} was received. We’ll email you when payment is confirmed.`
      });
    }
  } catch {
    showStatus({
      title: "Payment submitted",
      message: `Keep order number ${orderId || ""}. We’re still confirming the final status.`
    });
  } finally {
    window.history.replaceState({}, "", window.location.pathname);
  }
}

async function initialize() {
  document.querySelector("#currentYear").textContent = new Date().getFullYear();
  try {
    const response = await fetch("/api/catalog");
    if (!response.ok) throw new Error("Catalog unavailable");
    const catalog = await response.json();
    state.shop = catalog.shop;
    state.products = catalog.products;
    const email = document.querySelector("#footerEmail");
    email.textContent = state.shop.email;
    email.href = `mailto:${state.shop.email}`;
    document.querySelector("#deliveryFeeText").textContent = money(state.shop.deliveryFeeCents).replace(".00", "");
    renderCategories();
    renderProducts();
    renderCart();
    await handleCheckoutReturn();
  } catch (error) {
    elements.productGrid.replaceChildren(makeElement("div", "empty-products", "The collection is temporarily unavailable. Please refresh in a moment."));
    console.error(error);
  }
}

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderProducts();
});
elements.openCartButton.addEventListener("click", openCart);
document.querySelector("#closeCartButton").addEventListener("click", closeCart);
elements.drawerBackdrop.addEventListener("click", closeCart);
document.querySelector("#beginCheckoutButton").addEventListener("click", () => {
  if (!state.cart.length) return;
  elements.checkoutError.textContent = "";
  elements.checkoutTotal.textContent = money(cartSubtotal());
  openModal(elements.checkoutModal);
});

document.querySelectorAll("[data-open-quote]").forEach((button) => {
  button.addEventListener("click", () => {
    elements.quoteError.textContent = "";
    openModal(elements.quoteModal);
  });
});
document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

const checkoutAddressField = document.querySelector("#addressField");
elements.checkoutForm.elements.fulfillment.forEach((radio) => {
  radio.addEventListener("change", () => toggleDeliveryFields(elements.checkoutForm, checkoutAddressField));
});
const quoteAddressField = document.querySelector(".quote-address");
elements.quoteForm.elements.fulfillment.forEach((radio) => {
  radio.addEventListener("change", () => toggleDeliveryFields(elements.quoteForm, quoteAddressField));
});

elements.checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.cart.length) {
    elements.checkoutError.textContent = "Your cart is empty.";
    return;
  }
  const button = document.querySelector("#payButton");
  elements.checkoutError.textContent = "";
  button.disabled = true;
  button.firstChild.textContent = "Opening secure checkout… ";
  try {
    const result = await submitJson("/api/checkout", checkoutPayload(elements.checkoutForm));
    window.location.assign(result.checkoutUrl);
  } catch (error) {
    elements.checkoutError.textContent = error.message;
    button.disabled = false;
    button.firstChild.textContent = "Continue to secure payment ";
  }
});

elements.quoteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(elements.quoteForm);
  const button = document.querySelector("#quoteButton");
  elements.quoteError.textContent = "";
  button.disabled = true;
  button.firstChild.textContent = "Sending request… ";
  try {
    const result = await submitJson("/api/quotes", Object.fromEntries(data.entries()));
    elements.quoteModal.close();
    elements.quoteForm.reset();
    toggleDeliveryFields(elements.quoteForm, quoteAddressField);
    showStatus({
      title: "Request received",
      message: `${result.orderId} is in our queue. We’ll follow up by email with next steps.`
    });
  } catch (error) {
    elements.quoteError.textContent = error.message;
  } finally {
    button.disabled = false;
    button.firstChild.textContent = "Send custom request ";
  }
});

document.querySelector("#closeStatus").addEventListener("click", () => {
  elements.statusBanner.hidden = true;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.cartDrawer.classList.contains("open")) closeCart();
});

initialize();
