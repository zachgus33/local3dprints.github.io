function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function startingPrice(product) {
  return product.capacityPrices
    ? Math.min(...Object.values(product.capacityPrices))
    : product.priceCents;
}

function money(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function jsonLd(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function renderProductPage(product, shop, appUrl) {
  const canonical = `${appUrl}/products/${encodeURIComponent(product.id)}`;
  const image = `${appUrl}${product.images[0]}`;
  const amount = startingPrice(product);
  const priceCopy = product.capacityPrices ? `From ${money(amount)}` : money(amount);
  const specs = Object.entries(product.specs || {});
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images.map((entry) => `${appUrl}${entry}`),
    category: product.category,
    brand: { "@type": "Brand", name: shop.name },
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "USD",
      price: (amount / 100).toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition"
    }
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(product.description)} Made to order locally in Jacksonville, Florida.">
  <meta name="theme-color" content="#f5f1e8">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="${escapeHtml(shop.name)}">
  <meta property="og:title" content="${escapeHtml(product.name)} | ${escapeHtml(shop.name)}">
  <meta property="og:description" content="${escapeHtml(product.description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:alt" content="${escapeHtml(product.name)}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css?v=6">
  <link rel="stylesheet" href="/product.css?v=1">
  <script type="application/ld+json">${jsonLd(structuredData)}</script>
  <script src="/product.js?v=1" defer></script>
  <title>${escapeHtml(product.name)} | Jacksonville 3D Printing</title>
</head>
<body data-product-id="${escapeHtml(product.id)}">
  <div class="announcement"><p><span class="announcement-dot"></span> Made locally in Jacksonville, Florida</p><p class="announcement-detail">Free local pickup &amp; $3 eligible-area delivery</p></div>
  <header class="site-header product-header">
    <a class="brand" href="/" aria-label="Local Layer Prints home"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 42 42"><path d="M7 12.4 21 5l14 7.4L21 20 7 12.4Z"></path><path d="m7 20.8 14 7.5 14-7.5"></path><path d="m7 29.1 14 7.5 14-7.5"></path></svg></span><span class="brand-copy"><strong>LOCAL LAYER</strong><small>PRINTS</small></span></a>
    <nav class="desktop-nav" aria-label="Main navigation"><a href="/#shop">Shop</a><a href="/#process">How it works</a><a href="/#custom">Custom prints</a></nav>
    <a class="cart-trigger" href="/?cart=open"><span>Cart</span><span class="cart-count" id="productCartCount">0</span></a>
  </header>
  <main class="product-page shell">
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/#shop">Shop</a><span>/</span><span>${escapeHtml(product.name)}</span></nav>
    <section class="product-detail-layout" itemscope itemtype="https://schema.org/Product">
      <div class="product-gallery">
        <img id="productMainImage" src="${escapeHtml(product.images[0])}" alt="${escapeHtml(product.name)}" itemprop="image" fetchpriority="high">
        ${product.images.length > 1 ? `<div class="product-thumbnails">${product.images.map((entry, index) => `<button type="button" data-product-image="${escapeHtml(entry)}" aria-label="View ${escapeHtml(product.name)} image ${index + 1}" class="${index === 0 ? "active" : ""}"><img src="${escapeHtml(entry)}" alt=""></button>`).join("")}</div>` : ""}
      </div>
      <div class="product-detail-copy">
        <p class="eyebrow">${escapeHtml(product.category)} · Made in Jacksonville</p>
        <h1 itemprop="name">${escapeHtml(product.name)}</h1>
        <p class="product-detail-price" itemprop="offers" itemscope itemtype="https://schema.org/Offer"><span itemprop="priceCurrency" content="USD">${escapeHtml(priceCopy)}</span><meta itemprop="price" content="${(amount / 100).toFixed(2)}"><link itemprop="availability" href="https://schema.org/InStock"></p>
        <p class="product-detail-description" itemprop="description">${escapeHtml(product.description)}</p>
        <div class="product-tags">${product.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        <div id="productPageOptions" class="product-options product-page-options"></div>
        <button class="button button-dark button-full" id="productPageAdd" type="button" disabled>Add to cart <span aria-hidden="true">+</span></button>
        <p class="product-local-note">Made to order in Jacksonville. Typical turnaround is 3–5 business days. Free pickup or $3 delivery within 8 driving miles of the pickup location.</p>
        <dl class="product-specs">${specs.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}<div><dt>Turnaround</dt><dd>Usually 3–5 business days; large or custom orders may take longer</dd></div></dl>
        <p class="product-question">Need exact measurements or a special variation? <a href="/#custom">Send a custom request.</a></p>
      </div>
    </section>
  </main>
  <footer class="site-footer product-footer"><div class="shell footer-bottom"><span>© ${new Date().getFullYear()} Local Layer Prints · Jacksonville, FL</span><span><a href="/policies#fulfillment">Fulfillment</a> · <a href="/policies#returns">Returns</a> · <a href="/policies#privacy">Privacy</a> · <a href="/policies#terms">Terms</a></span></div></footer>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
</body>
</html>`;
}
