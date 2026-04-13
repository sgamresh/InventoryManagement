class InventoryApp {
  constructor() {
    this.categoryOrder = ["Vegetables", "Fruits", "Dairy", "Grocery", "Household"];
    this.inventory = [];
    this.cart = this.loadCartFromStorage();
    this.isLocalhost = this.checkLocalhost();
    this.currentEditItemId = null;
    this.lastFocusedElement = null;
    this.modalPointerDownOnBackdrop = false;
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
      inventoryFileInput: document.getElementById("inventoryFileInput"),
      adminPanel: document.getElementById("adminPanel"),
      addItemForm: document.getElementById("addItemForm"),
      addItemCategory: document.getElementById("addItemCategory"),
      addItemName: document.getElementById("addItemName"),
      addItemUnit: document.getElementById("addItemUnit"),
      addItemPrice: document.getElementById("addItemPrice"),
      editItemModal: document.getElementById("editItemModal"),
      editItemForm: document.getElementById("editItemForm"),
      editItemName: document.getElementById("editItemName"),
      editItemUnit: document.getElementById("editItemUnit"),
      editItemPrice: document.getElementById("editItemPrice"),
      editItemCategory: document.getElementById("editItemCategory"),
      editModalCloseBtn: document.getElementById("editModalCloseBtn"),
      editModalCancelBtn: document.getElementById("editModalCancelBtn"),
      editModalDeleteBtn: document.getElementById("editModalDeleteBtn")
    };
  }

  async init() {
    this.applyTheme();
    this.toggleAdminPanel();
    this.attachEvents();
    await this.loadInventoryData();
    this.populateCategoryFilter();
    this.populateAdminCategoryOptions();
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
        const { items, rejectedCount } = this.sanitizeInventoryItems(parsed);
        this.inventory = items;
        this.elements.fileFallback.classList.add("hidden");
        this.setStatus(
          rejectedCount
            ? `Inventory loaded from selected file. Skipped ${rejectedCount} invalid item(s).`
            : "Inventory loaded from selected file."
        );
        this.populateCategoryFilter(true);
        this.populateAdminCategoryOptions(true);
        this.renderInventory();
        this.renderCart();
      } catch (error) {
        this.setStatus("Selected file is not a valid inventory JSON array.");
      }
    });

    if (this.elements.addItemForm) {
      this.elements.addItemForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this.handleAddItem();
      });
    }

    if (this.elements.editItemForm) {
      this.elements.editItemForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this.submitEditItemModal();
      });
    }

    this.elements.editModalCloseBtn?.addEventListener("click", () => this.closeEditModal());
    this.elements.editModalCancelBtn?.addEventListener("click", () => this.closeEditModal());
    this.elements.editModalDeleteBtn?.addEventListener("click", () => this.handleDeleteFromModal());
    this.elements.editItemModal?.addEventListener("mousedown", (event) => {
      this.modalPointerDownOnBackdrop = event.target === this.elements.editItemModal;
    });
    this.elements.editItemModal?.addEventListener("click", (event) => {
      const clickedBackdrop = event.target === this.elements.editItemModal;
      if (clickedBackdrop && this.modalPointerDownOnBackdrop) {
        this.closeEditModal();
      }
      this.modalPointerDownOnBackdrop = false;
    });
    this.elements.editItemModal?.addEventListener("keydown", (event) => this.handleModalKeydown(event));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.elements.editItemModal?.classList.contains("hidden")) {
        this.closeEditModal();
      }
    });
  }

  checkLocalhost() {
    const hostname = window.location.hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  }

  toggleAdminPanel() {
    if (!this.elements.adminPanel) {
      return;
    }
    this.elements.adminPanel.classList.toggle("hidden", !this.isLocalhost);
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
      const mergedItems = await this.loadInventoryFromCategoryIndex(categoryIndexCandidates);
      const { items, rejectedCount } = this.sanitizeInventoryItems(mergedItems);
      this.inventory = items;
      this.setStatus(rejectedCount ? `Inventory loaded. Skipped ${rejectedCount} invalid item(s).` : "Inventory loaded.");
      this.elements.fileFallback.classList.add("hidden");
      return;
    } catch (categoryLoadError) {
      // Fall back to legacy single-file inventory.
    }

    try {
      const fetchedItems = await this.tryLoadInventoryFromCandidates(candidatePaths);
      const { items, rejectedCount } = this.sanitizeInventoryItems(fetchedItems);
      this.inventory = items;
      this.setStatus(rejectedCount ? `Inventory loaded. Skipped ${rejectedCount} invalid item(s).` : "Inventory loaded.");
      this.elements.fileFallback.classList.add("hidden");
      return;
    } catch (fetchError) {
      // Some browsers restrict fetch()/XHR from file:// URLs.
      try {
        const xhrItems = await this.loadInventoryWithXHR("inventory.json");
        const { items, rejectedCount } = this.sanitizeInventoryItems(xhrItems);
        this.inventory = items;
        this.setStatus(rejectedCount ? `Inventory loaded. Skipped ${rejectedCount} invalid item(s).` : "Inventory loaded.");
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

  sanitizeInventoryItems(items) {
    const incrementKeys = ["increment", "quantityIncrement", "qtyIncrement", "step"];
    const defaultQuantityKeys = ["defaultQuantity", "defaultQty", "initialQuantity", "qty", "quantity"];
    const validItems = [];
    const rejectedItems = [];

    for (const item of items) {
      if (!item || typeof item !== "object") {
        rejectedItems.push({ id: "(unknown)", key: "item", value: item });
        continue;
      }

      let invalidField = null;

      for (const key of incrementKeys) {
        if (!Object.prototype.hasOwnProperty.call(item, key)) {
          continue;
        }
        const numeric = Number(item[key]);
        if (!Number.isInteger(numeric) || numeric <= 0) {
          invalidField = key;
          break;
        }
      }

      if (!invalidField) {
        for (const key of defaultQuantityKeys) {
          if (!Object.prototype.hasOwnProperty.call(item, key)) {
            continue;
          }
          const numeric = Number(item[key]);
          if (!Number.isInteger(numeric) || numeric < 0) {
            invalidField = key;
            break;
          }
        }
      }

      if (invalidField) {
        rejectedItems.push({
          id: item.id || "(unknown)",
          key: invalidField,
          value: item[invalidField]
        });
        continue;
      }

      validItems.push(item);
    }

    if (rejectedItems.length) {
      console.warn("Rejected inventory items due to non-integer increment/default quantity fields:", rejectedItems);
    }

    return { items: validItems, rejectedCount: rejectedItems.length };
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

  populateAdminCategoryOptions(reset = false) {
    if (!this.elements.addItemCategory) {
      return;
    }
    if (reset) {
      this.elements.addItemCategory.innerHTML = "";
    }
    const categories = this.sortCategories([...new Set(this.inventory.map((item) => item.category))]);
    this.elements.addItemCategory.innerHTML = categories
      .map((category) => `<option value="${category}">${category}</option>`)
      .join("");
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

  normalizeQuantity(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Math.max(0, Math.round(numeric));
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
    const editItemBtn = node.querySelector(".admin-edit-item");

    nameEl.textContent = item.name;
    const metaParts = [item.unit];
    if (typeof item.price === "number") {
      metaParts.push(`₹${item.price.toFixed(2)}`);
    }
    metaEl.textContent = metaParts.join(" • ");

    const currentQty = this.cart[item.id]?.quantity || 0;
    qtyInput.value = currentQty;

    const updateQty = (nextQty) => {
      const safeQty = this.normalizeQuantity(nextQty);
      qtyInput.value = safeQty;
      this.updateCart(item, safeQty);
      card.classList.add("added");
      setTimeout(() => card.classList.remove("added"), 350);
    };

    minusBtn.addEventListener("click", () => updateQty((Number(qtyInput.value) || 0) - 1));
    plusBtn.addEventListener("click", () => updateQty((Number(qtyInput.value) || 0) + 1));

    qtyInput.addEventListener("input", () => {
      updateQty(qtyInput.value);
    });

    if (this.isLocalhost && editItemBtn) {
      editItemBtn.classList.remove("hidden");
      editItemBtn.addEventListener("click", () => {
        this.openEditModal(item);
      });
    }

    return node;
  }

  openEditModal(item) {
    if (!this.elements.editItemModal || !this.elements.editItemForm) {
      return;
    }
    this.lastFocusedElement = document.activeElement;
    this.currentEditItemId = item.id;
    this.elements.editItemName.value = item.name || "";
    this.elements.editItemUnit.value = item.unit || "";
    this.elements.editItemPrice.value = typeof item.price === "number" ? String(item.price) : "";
    const categories = this.sortCategories([...new Set(this.inventory.map((entry) => entry.category))]);
    this.elements.editItemCategory.innerHTML = categories
      .map((category) => `<option value="${category}">${category}</option>`)
      .join("");
    this.elements.editItemCategory.value = item.category || "";
    this.elements.editItemModal.classList.remove("hidden");
    this.elements.editItemModal.setAttribute("aria-hidden", "false");
    this.elements.editItemName.focus();
  }

  closeEditModal() {
    if (!this.elements.editItemModal) {
      return;
    }
    this.elements.editItemModal.classList.add("hidden");
    this.elements.editItemModal.setAttribute("aria-hidden", "true");
    this.currentEditItemId = null;
    if (this.lastFocusedElement && typeof this.lastFocusedElement.focus === "function") {
      this.lastFocusedElement.focus();
    }
  }

  handleModalKeydown(event) {
    if (event.key !== "Tab" || this.elements.editItemModal?.classList.contains("hidden")) {
      return;
    }

    const focusable = this.elements.editItemModal.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async submitEditItemModal() {
    if (!this.currentEditItemId) {
      return;
    }
    const payload = {
      itemId: this.currentEditItemId,
      name: this.elements.editItemName.value.trim(),
      unit: this.elements.editItemUnit.value.trim(),
      category: this.elements.editItemCategory.value,
      price: Number(this.elements.editItemPrice.value)
    };

    if (!payload.name || !payload.unit || !payload.category || !Number.isFinite(payload.price) || payload.price < 0) {
      this.setStatus("Please enter valid name, unit, category and non-negative price.");
      return;
    }

    const saved = await this.handleItemUpdate(payload);
    if (saved) {
      this.closeEditModal();
    }
  }

  async handleDeleteFromModal() {
    if (!this.currentEditItemId) {
      return;
    }
    const item = this.inventory.find((entry) => entry.id === this.currentEditItemId);
    const itemName = item?.name || "this item";
    const confirmed = window.confirm(`Delete ${itemName} from inventory? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    const deleted = await this.deleteItem(this.currentEditItemId);
    if (deleted) {
      this.closeEditModal();
    }
  }

  async handleItemUpdate(payload) {
    if (!this.isLocalhost) {
      return false;
    }

    try {
      const response = await this.callLocalApi("update_item", payload);
      const updatedItem = response.item;
      const item = this.inventory.find((entry) => entry.id === payload.itemId);
      if (item && updatedItem) {
        item.name = updatedItem.name;
        item.unit = updatedItem.unit;
        item.category = updatedItem.category;
        item.price = Number(updatedItem.price);
      }
      this.syncCartItem(payload.itemId, updatedItem);
      this.populateCategoryFilter(true);
      this.populateAdminCategoryOptions(true);
      this.renderInventory();
      this.renderCart();
      this.setStatus("Item updated and saved to inventory JSON.");
      return true;
    } catch (error) {
      this.setStatus(error.message || "Could not update item.");
      return false;
    }
  }

  async deleteItem(itemId) {
    if (!this.isLocalhost) {
      return false;
    }
    try {
      await this.callLocalApi("delete_item", { itemId });
      this.inventory = this.inventory.filter((entry) => entry.id !== itemId);
      delete this.cart[itemId];
      this.persistCart();
      this.populateCategoryFilter(true);
      this.populateAdminCategoryOptions(true);
      this.renderInventory();
      this.renderCart();
      this.setStatus("Item deleted and inventory JSON updated.");
      return true;
    } catch (error) {
      this.setStatus(error.message || "Could not delete item.");
      return false;
    }
  }

  syncCartItem(itemId, itemData) {
    if (!this.cart[itemId]) {
      return;
    }
    this.cart[itemId].name = itemData.name;
    this.cart[itemId].unit = itemData.unit;
    this.cart[itemId].price = Number(itemData.price);
    this.persistCart();
  }

  async handleAddItem() {
    if (!this.isLocalhost || !this.elements.addItemForm) {
      return;
    }

    const name = this.elements.addItemName.value.trim();
    const category = this.elements.addItemCategory.value;
    const unit = this.elements.addItemUnit.value.trim();
    const price = Number(this.elements.addItemPrice.value);

    if (!name || !category || !unit || !Number.isFinite(price) || price < 0) {
      this.setStatus("Please complete all fields with valid values.");
      return;
    }

    try {
      const response = await this.callLocalApi("add_item", {
        name,
        category,
        unit,
        price
      });
      this.inventory.push(response.item);
      this.populateCategoryFilter(true);
      this.populateAdminCategoryOptions(true);
      this.renderInventory();
      this.setStatus("New item added and saved to inventory JSON.");
      this.elements.addItemForm.reset();
    } catch (error) {
      this.setStatus(error.message || "Could not add item.");
    }
  }

  async callLocalApi(action, payload) {
    const response = await fetch("inventory/api.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action,
        ...payload
      })
    });

    const parsed = await response.json().catch(() => ({}));
    if (!response.ok || !parsed.success) {
      throw new Error(parsed.error || "Inventory update failed.");
    }
    return parsed;
  }

  updateCart(item, quantity) {
    const safeQuantity = this.normalizeQuantity(quantity);
    if (safeQuantity <= 0) {
      delete this.cart[item.id];
    } else {
      this.cart[item.id] = {
        id: item.id,
        name: item.name,
        unit: item.unit,
        quantity: safeQuantity,
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

    this.elements.totalItems.textContent = String(totalItems);
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
      if (!saved) {
        return {};
      }

      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== "object") {
        return {};
      }

      const sanitized = {};
      Object.entries(parsed).forEach(([itemId, entry]) => {
        if (!entry || typeof entry !== "object") {
          return;
        }

        const safeQuantity = this.normalizeQuantity(entry.quantity);
        if (safeQuantity <= 0) {
          return;
        }

        sanitized[itemId] = {
          ...entry,
          quantity: safeQuantity
        };
      });

      return sanitized;
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
