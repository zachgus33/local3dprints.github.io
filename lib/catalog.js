export const SHOP = Object.freeze({
  name: "Local Layer Prints",
  email: process.env.SHOP_EMAIL || "thelocallayerprints3d@gmail.com",
  currency: "usd",
  deliveryFeeCents: 300,
  colors: ["Orange", "Blue", "Red", "Gold", "Grey", "White", "Black"],
  outOfStockColors: [],
  social: {
    instagram: process.env.INSTAGRAM_URL || "",
    facebook: process.env.FACEBOOK_URL || ""
  }
});

export const PRODUCTS = Object.freeze([
  {
    id: "tabletop-water-fountain",
    name: "Tabletop Water Fountain",
    category: "Home decor",
    description: "A calming three-tier printed fountain with sculpted bowls, a pebble basin, and a compact desktop footprint.",
    images: ["/assets/water-fountain-studio.png"],
    tags: ["Water feature", "Desk decor"],
    priceCents: 3500,
    specs: {
      dimensions: "Compact tabletop size; exact measurements available before ordering",
      material: "Water-resistant printed plastic",
      included: "Printed fountain, compact pump, and decorative stones",
      power: "Pump power connection included; outlet adapter requirements confirmed with your order"
    },
    options: {}
  },
  {
    id: "voronoi-style-clock",
    name: "Voronoi Style Clock",
    category: "Home decor",
    description: "A modern wall clock combining a warm wood-look face with an organic Voronoi-inspired accent panel.",
    images: ["/assets/voronoi-clock-studio.png"],
    tags: ["Wall decor", "Modern"],
    priceCents: 2500,
    specs: {
      dimensions: "Made to order; exact diameter available before ordering",
      material: "Printed frame with a wood-look face and decorative insert",
      included: "Finished clock and quartz clock mechanism",
      power: "Uses one AA battery (battery not included)"
    },
    options: {}
  },
  {
    id: "pacman-clock",
    name: "Pac-Man Clock",
    category: "Home decor",
    description: "A retro arcade-inspired wall clock with a detailed maze face and two customizable accent colors.",
    images: ["/assets/pacman-clock-studio.png"],
    tags: ["Two color", "Retro gaming"],
    priceCents: 2500,
    specs: {
      dimensions: "Made to order; exact measurements available before ordering",
      material: "Multi-color printed plastic",
      included: "Finished clock and quartz clock mechanism",
      power: "Uses one AA battery (battery not included)"
    },
    options: {
      color: true,
      color2: true,
      colorLabel: "Line color",
      color2Label: "Food color"
    }
  },
  {
    id: "stackable-glasses-stand",
    name: "Stackable Glasses Stand",
    category: "Organization",
    description: "A clean, modular home for your everyday frames. Select a size for three to six pairs.",
    images: ["/assets/stackable-glasses-studio.png"],
    tags: ["Modular", "Made to order"],
    specs: {
      dimensions: "Height varies with the selected 3–6 pair capacity",
      material: "Durable printed plastic",
      included: "One modular glasses stand in your selected size and color"
    },
    options: { color: true, capacity: [3, 4, 5, 6], capacityLabel: "Pairs" },
    capacityPrices: { 3: 1200, 4: 1300, 5: 1400, 6: 1500 }
  },
  {
    id: "stackable-shoe-stand",
    name: "Stackable Shoe Stand",
    category: "Organization",
    description: "Space-saving vertical storage designed to keep frequently worn shoes neat and accessible.",
    images: ["/assets/shoe-stand-studio.png", "/assets/shoe-stand-in-use-studio.png"],
    tags: ["Stackable", "Space saving"],
    specs: {
      dimensions: "Height varies with the selected 3–6 tier capacity",
      material: "Durable printed plastic",
      included: "One shoe stand in your selected size and color"
    },
    options: { color: true, capacity: [3, 4, 5, 6], capacityLabel: "Tiers" },
    capacityPrices: { 3: 1200, 4: 1300, 5: 1400, 6: 1500 }
  },
  {
    id: "scrub-daddy-holder",
    name: "Scrubber Holder",
    category: "Home decor",
    description: "Keeps your scrubber upright, off the counter, and ready to dry between uses.",
    images: ["/assets/scrubber-holder-studio.png"],
    tags: ["Kitchen", "Easy clean"],
    priceCents: 500,
    specs: {
      dimensions: "Sized for a standard round smiley scrubber",
      material: "Easy-clean printed plastic",
      included: "One scrubber holder; scrubber not included"
    },
    options: { color: true }
  },
  {
    id: "cascade-wallet",
    name: "Cascade Wallet",
    category: "Everyday carry",
    description: "A compact cascade-style wallet with a satisfying mechanism and a minimal footprint.",
    images: ["/assets/cascade-wallet-studio.png"],
    tags: ["Compact", "EDC"],
    priceCents: 1000,
    specs: {
      dimensions: "Pocket-sized compact profile",
      material: "Durable printed plastic",
      included: "One cascade wallet; cards not included"
    },
    options: { color: true }
  },
  {
    id: "toothpaste-squeezer",
    name: "Tube Squeezer",
    category: "Home decor",
    description: "A small daily-use tool that helps get every last bit from toothpaste and other tubes.",
    images: ["/assets/tube-squeezer-studio.png"],
    tags: ["Bathroom", "Low waste"],
    priceCents: 300,
    specs: {
      dimensions: "Sized for common toothpaste and household tubes",
      material: "Durable printed plastic",
      included: "One tube squeezer; tube not included"
    },
    options: { color: true }
  },
  {
    id: "edc-adventure-tray",
    name: "Adventure Catch-All Tray",
    category: "Everyday carry",
    description: "A two-color tray for keys, wallet, and daily essentials, finished with topographic lines.",
    images: ["/assets/adventure-tray-studio.png"],
    tags: ["Two color", "Topographic"],
    priceCents: 1200,
    specs: {
      dimensions: "Compact catch-all size; exact measurements available on request",
      material: "Two-color printed plastic",
      included: "One finished tray in your selected colors"
    },
    options: {
      color: true,
      color2: true,
      colorLabel: "Base color",
      color2Label: "Line color"
    }
  }
]);

export function publicCatalog() {
  return {
    shop: {
      name: SHOP.name,
      email: SHOP.email,
      currency: SHOP.currency,
      deliveryFeeCents: SHOP.deliveryFeeCents,
      colors: SHOP.colors,
      outOfStockColors: SHOP.outOfStockColors,
      social: SHOP.social
    },
    products: PRODUCTS.map((product) => ({ ...product }))
  };
}

export function priceFor(product, capacity) {
  if (product.capacityPrices) {
    const amount = product.capacityPrices[Number(capacity)];
    return Number.isInteger(amount) ? amount : null;
  }
  return Number.isInteger(product.priceCents) ? product.priceCents : null;
}

function cleanText(value, maxLength = 160) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function validColor(color) {
  return SHOP.colors.includes(color) && !SHOP.outOfStockColors.includes(color);
}

export function validateCart(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 20) {
    throw new Error("Your cart must contain between 1 and 20 items.");
  }

  const items = input.map((raw) => {
    const product = PRODUCTS.find((entry) => entry.id === raw?.id);
    if (!product) throw new Error("One of the selected products is no longer available.");

    const quantity = Number(raw.qty);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new Error(`Choose a quantity from 1 to 10 for ${product.name}.`);
    }

    const color = product.options?.color ? cleanText(raw.color, 24) : "";
    const color2 = product.options?.color2 ? cleanText(raw.color2, 24) : "";
    const capacity = product.options?.capacity ? Number(raw.capacity) : null;

    if (product.options?.color && !validColor(color)) {
      throw new Error(`Choose an available color for ${product.name}.`);
    }
    if (product.options?.color2 && !validColor(color2)) {
      throw new Error(`Choose an available second color for ${product.name}.`);
    }
    if (product.options?.color2 && color === color2) {
      throw new Error(`Choose two different colors for ${product.name}.`);
    }
    if (product.options?.capacity && !product.options.capacity.includes(capacity)) {
      throw new Error(`Choose a valid size for ${product.name}.`);
    }

    const unitAmount = priceFor(product, capacity);
    if (!Number.isInteger(unitAmount) || unitAmount < 50) {
      throw new Error(`${product.name} is not available for online checkout.`);
    }

    return {
      productId: product.id,
      name: product.name,
      quantity,
      unitAmount,
      color,
      color2,
      colorLabel: product.options?.colorLabel || "Color",
      color2Label: product.options?.color2Label || "Second color",
      capacity,
      capacityLabel: product.options?.capacityLabel || "Size"
    };
  });

  const subtotalCents = items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
  if (subtotalCents > 100000) throw new Error("Please contact us directly for orders over $1,000.");
  return { items, subtotalCents };
}

export function describeOptions(item) {
  return [
    item.color ? `${item.colorLabel || "Color"}: ${item.color}` : "",
    item.color2 ? `${item.color2Label || "Second color"}: ${item.color2}` : "",
    item.capacity ? `${item.capacityLabel}: ${item.capacity}` : ""
  ].filter(Boolean).join(" · ");
}

export function describeStoredOptions(item) {
  const productId = item.productId || item.product_id;
  const product = PRODUCTS.find((entry) => entry.id === productId);
  return describeOptions({
    ...item,
    colorLabel: product?.options?.colorLabel || "Color",
    color2Label: product?.options?.color2Label || "Second color",
    capacityLabel: product?.options?.capacityLabel || "Size"
  });
}
