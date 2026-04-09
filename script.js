class InventoryApp {
  constructor() {
    this.categoryOrder = ["Vegetables", "Fruits", "Dairy", "Grocery", "Household"];
    this.inventory = [];
    this.cart = this.loadCartFromStorage();
    this.state = {
      query: "",
      category: "all",
      theme: localStorage.getItem("inventory-theme") || "light"
    };

    this.elements = {
      inventoryContainer: document.getElementById("inventoryContainer"),
      itemTemplate: document.getElementById("itemTemplate"),
      searchInput: document.getElementById("searchInput"),
      categoryFilter: document.getElementById("categoryFilter"),
      cartList: document.getElementById("cartList"),
      totalItems: document.getElementById("totalItems"),
      totalPrice: document.getElementById("totalPrice"),
      sendWhatsAppBtn: document.getElementById("sendWhatsAppBtn"),
      clearCartBtn: document.getElementById("clearCartBtn"),
      editOrderBtn: document.getElementById("editOrderBtn"),
      phoneInput: document.getElementById("phoneInput"),
      statusMessage: document.getElementById("statusMessage"),
      themeToggle: document.getElementById("themeToggle"),
      fileFallback: document.getElementById("fileFallback"),
      loadFileBtn: document.getElementById("loadFileBtn"),
      inventoryFileInput: document.getElementById("inventoryFileInput")
    };
  }

  async init() {
    this.applyTheme();
    this.attachEvents();
    await this.loadInventoryData();
    this.populateCategoryFilter();
    this.renderInventory();
    this.renderCart();
  }

  attachEvents() {
    this.elements.searchInput.addEventListener("input", (event) => {
      this.state.query = event.target.value.trim().toLowerCase();
      this.renderInventory();
    });

    this.elements.categoryFilter.addEventListener("change", (event) => {
      this.state.category = event.target.value;
      this.renderInventory();
    });

    this.elements.clearCartBtn.addEventListener("click", () => {
      this.cart = {};
      this.persistCart();
      this.renderInventory();
      this.renderCart();
      this.setStatus("Cart cleared.");
    });

    this.elements.editOrderBtn.addEventListener("click", () => {
      document.querySelector(".inventory-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    this.elements.sendWhatsAppBtn.addEventListener("click", () => this.sendToWhatsApp());

    this.elements.themeToggle.addEventListener("click", () => {
      this.state.theme = this.state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("inventory-theme", this.state.theme);
      this.applyTheme();
    });

    this.elements.loadFileBtn.addEventListener("click", () => {
      this.elements.inventoryFileInput.click();
    });

    this.elements.inventoryFileInput.addEventListener("change", async (event) => {
      const [file] = event.target.files || [];
      if (!file) {
        return;
      }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          throw new Error("Inventory file must contain a JSON array.");
        }
        this.inventory = parsed;
        this.elements.fileFallback.classList.add("hidden");
        this.setStatus("Inventory loaded from selected file.");
        this.populateCategoryFilter(true);
        this.renderInventory();
        this.renderCart();
      } catch (error) {
        this.setStatus("Selected file is not a valid inventory JSON array.");
      }
    });
  }

  applyTheme() {
    document.body.classList.toggle("dark", this.state.theme === "dark");
  }

  async loadInventoryData() {
    const scriptUrl = document.currentScript?.src || "";
    const scriptBase = scriptUrl ? scriptUrl.substring(0, scriptUrl.lastIndexOf("/") + 1) : "";
    const categoryIndexCandidates = [
      new URL("inventory/index.json", window.location.href).href,
      scriptBase ? `${scriptBase}inventory/index.json` : "inventory/index.json",
      "inventory/index.json",
      "./inventory/index.json"
    ];
    const candidatePaths = [
      new URL("inventory.json", window.location.href).href,
      scriptBase ? `${scriptBase}inventory.json` : "inventory.json",
      "inventory.json",
      "./inventory.json"
    ];

    try {
      this.inventory = await this.loadInventoryFromCategoryIndex(categoryIndexCandidates);
      this.setStatus("Inventory loaded.");
      this.elements.fileFallback.classList.add("hidden");
      return;
    } catch (categoryLoadError) {
      // Fall back to legacy single-file inventory.
    }

    try {
      this.inventory = await this.tryLoadInventoryFromCandidates(candidatePaths);
      this.setStatus("Inventory loaded.");
      this.elements.fileFallback.classList.add("hidden");
      return;
    } catch (fetchError) {
      // Some browsers restrict fetch()/XHR from file:// URLs.
      try {
        this.inventory = await this.loadInventoryWithXHR("inventory.json");
        this.setStatus("Inventory loaded.");
        this.elements.fileFallback.classList.add("hidden");
      } catch (xhrError) {
        console.error("Inventory load error:", fetchError, xhrError);
        this.inventory = [];
        this.setStatus("Unable to auto-load inventory.json. Use the Load button below.");
        this.elements.fileFallback.classList.remove("hidden");
      }
    }
  }

  async loadInventoryFromCategoryIndex(indexCandidates) {
    const tried = new Set();

    for (const indexPath of indexCandidates) {
      if (!indexPath || tried.has(indexPath)) {
        continue;
      }
      tried.add(indexPath);

      try {
        const indexResponse = await fetch(indexPath, { cache: "no-store" });
        if (!indexResponse.ok) {
          continue;
        }

        const parsedIndex = await indexResponse.json();
        if (!parsedIndex || !Array.isArray(parsedIndex.files) || !parsedIndex.files.length) {
          continue;
        }

        const baseHref = new URL(".", indexPath).href;
        const merged = [];

        for (const fileName of parsedIndex.files) {
          const fileCandidates = [
            new URL(fileName, baseHref).href,
            `inventory/${fileName}`,
            fileName
          ];
          const items = await this.tryLoadInventoryFromCandidates(fileCandidates);
          if (!Array.isArray(items)) {
            throw new Error(`Inventory category file is not an array: ${fileName}`);
          }
          merged.push(...items);
        }

        if (merged.length) {
          return merged;
        }
      } catch (error) {
        // Try next index candidate.
      }
    }

    throw new Error("Could not load inventory category files.");
  }

  async tryLoadInventoryFromCandidates(candidatePaths) {
    const tried = new Set();

    for (const path of candidatePaths) {
      if (!path || tried.has(path)) {
        continue;
      }
      tried.add(path);
      try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) {
          continue;
        }
        const parsed = await response.json();
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (error) {
        // Try next candidate URL.
      }
    }

    throw new Error("All inventory fetch candidates failed.");
  }

  loadInventoryWithXHR(path) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", path, true);
      xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) {
          return;
        }
        if (xhr.status === 200 || (xhr.status === 0 && xhr.responseText)) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error("XHR failed to read inventory.json"));
        }
      };
      xhr.send();
    });
  }

  populateCategoryFilter(reset = false) {
    if (reset) {
      this.elements.categoryFilter.innerHTML = `<option value="all">All Categories</option>`;
      this.state.category = "all";
      this.elements.categoryFilter.value = "all";
    }
    const categories = this.sortCategories([...new Set(this.inventory.map((item) => item.category))]);
    for (const category of categories) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      this.elements.categoryFilter.appendChild(option);
    }
  }

  getFilteredInventory() {
    return this.inventory.filter((item) => {
      const matchQuery = item.name.toLowerCase().includes(this.state.query);
      const matchCategory = this.state.category === "all" || item.category === this.state.category;
      return matchQuery && matchCategory;
    });
  }

  groupByCategory(items) {
    return items.reduce((grouped, item) => {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
      return grouped;
    }, {});
  }

  sortCategories(categories) {
    return [...categories].sort((a, b) => {
      const aIndex = this.categoryOrder.indexOf(a);
      const bIndex = this.categoryOrder.indexOf(b);
      const aKnown = aIndex !== -1;
      const bKnown = bIndex !== -1;

      if (aKnown && bKnown) {
        return aIndex - bIndex;
      }
      if (aKnown) {
        return -1;
      }
      if (bKnown) {
        return 1;
      }
      return a.localeCompare(b);
    });
  }

  renderInventory() {
    this.elements.inventoryContainer.innerHTML = "";

    const filteredItems = this.getFilteredInventory();
    if (!filteredItems.length) {
      this.elements.inventoryContainer.innerHTML = `<p class="empty-state">No matching items found.</p>`;
      return;
    }

    const grouped = this.groupByCategory(filteredItems);
    const sortedCategories = this.sortCategories(Object.keys(grouped));

    for (const category of sortedCategories) {
      const categoryDetails = document.createElement("details");
      categoryDetails.className = "category";
      categoryDetails.open = true;

      const summary = document.createElement("summary");
      summary.className = "category-summary";
      summary.innerHTML = `<span>${category}</span><span><span>${grouped[category].length} items</span> <span class="category-icon">▾</span></span>`;
      categoryDetails.appendChild(summary);

      const itemsWrap = document.createElement("div");
      itemsWrap.className = "category-items";

      grouped[category].forEach((item) => {
        const itemNode = this.createItemNode(item);
        itemsWrap.appendChild(itemNode);
      });

      categoryDetails.appendChild(itemsWrap);
      this.elements.inventoryContainer.appendChild(categoryDetails);
    }
  }

  createItemNode(item) {
    const node = this.elements.itemTemplate.content.cloneNode(true);
    const card = node.querySelector(".item-card");
    const nameEl = node.querySelector(".item-name");
    const metaEl = node.querySelector(".item-meta");
    const minusBtn = node.querySelector(".minus");
    const plusBtn = node.querySelector(".plus");
    const qtyInput = node.querySelector(".qty-input");

    nameEl.textContent = item.name;
    const metaParts = [item.unit];
    if (typeof item.price === "number") {
      metaParts.push(`₹${item.price.toFixed(2)}`);
    }
    metaEl.textContent = metaParts.join(" • ");

    const currentQty = this.cart[item.id]?.quantity || 0;
    qtyInput.value = currentQty;

    const updateQty = (nextQty) => {
      const safeQty = Number.isFinite(nextQty) ? Math.max(0, Number(nextQty.toFixed(2))) : 0;
      qtyInput.value = safeQty;
      this.updateCart(item, safeQty);
      card.classList.add("added");
      setTimeout(() => card.classList.remove("added"), 350);
    };

    minusBtn.addEventListener("click", () => updateQty((Number(qtyInput.value) || 0) - 0.25));
    plusBtn.addEventListener("click", () => updateQty((Number(qtyInput.value) || 0) + 0.25));

    qtyInput.addEventListener("input", () => {
      const entered = parseFloat(qtyInput.value);
      updateQty(Number.isNaN(entered) ? 0 : entered);
    });

    return node;
  }

  updateCart(item, quantity) {
    if (quantity <= 0) {
      delete this.cart[item.id];
    } else {
      this.cart[item.id] = {
        id: item.id,
        name: item.name,
        unit: item.unit,
        quantity,
        price: typeof item.price === "number" ? item.price : null
      };
    }
    this.persistCart();
    this.renderCart();
  }

  renderCart() {
    const cartValues = Object.values(this.cart);
    this.elements.cartList.innerHTML = "";

    if (!cartValues.length) {
      this.elements.cartList.innerHTML = `<li class="empty-state">No items selected.</li>`;
    } else {
      for (const item of cartValues) {
        const li = document.createElement("li");
        li.className = "cart-item";
        const rightValue = `${item.quantity} ${item.unit}`;
        li.innerHTML = `
          <div>
            <p><strong>${item.name}</strong></p>
            <p class="item-meta">${item.price !== null ? `₹${(item.price * item.quantity).toFixed(2)}` : "Price not set"}</p>
          </div>
          <p>${rightValue}</p>
        `;
        this.elements.cartList.appendChild(li);
      }
    }

    const totalItems = cartValues.reduce((sum, item) => sum + item.quantity, 0);
    const hasPriceForAll = cartValues.every((item) => item.price !== null);
    const totalPrice = hasPriceForAll
      ? cartValues.reduce((sum, item) => sum + item.price * item.quantity, 0)
      : null;

    this.elements.totalItems.textContent = totalItems.toFixed(2).replace(/\.00$/, "");
    this.elements.totalPrice.textContent = totalPrice !== null ? `₹${totalPrice.toFixed(2)}` : "Not available";
  }

  getWhatsAppMessage() {
    const cartValues = Object.values(this.cart);
    if (!cartValues.length) {
      return "";
    }

    const lines = cartValues.map((item) => `- ${item.name}: ${item.quantity} ${item.unit}`);
    return encodeURIComponent(`Order Details:\n${lines.join("\n")}`);
  }

  sendToWhatsApp() {
    const message = this.getWhatsAppMessage();
    if (!message) {
      this.setStatus("Add at least one item before sending to WhatsApp.");
      return;
    }

    const rawPhone = this.elements.phoneInput.value.trim();
    const phone = rawPhone.replace(/\D/g, "");
    const waUrl = phone
      ? `https://wa.me/${phone}?text=${message}`
      : `https://wa.me/?text=${message}`;

    window.open(waUrl, "_blank");
    this.setStatus("Opening WhatsApp with your order.");
  }

  setStatus(text) {
    this.elements.statusMessage.textContent = text;
  }

  loadCartFromStorage() {
    try {
      const saved = localStorage.getItem("inventory-cart");
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.warn("Could not parse cart in localStorage:", error);
      return {};
    }
  }

  persistCart() {
    localStorage.setItem("inventory-cart", JSON.stringify(this.cart));
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  const app = new InventoryApp();
  await app.init();
});
