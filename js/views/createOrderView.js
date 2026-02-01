import { layoutView } from "./layoutView.js";
import { createOrderController } from "../controllers/createOrderController.js";
import { productService } from "../services/productService.js";
import { customerController } from "../controllers/customerController.js";
import { FormRepeater } from "../components/formRepeater.js";
import { createCard } from "../components/card.js";
import { notificationService } from "../core/notificationService.js";
import { Modal } from "../components/modal.js";
import { DataTable } from "../components/dataTable.js";
import { formatCurrency } from "../core/formatters.js";

export const renderCreateOrder = async () => {
    layoutView.render();
    layoutView.updateTitle("Create New Order");

    const container = document.getElementById('page-container');

    // Fetch data
    let products = [];
    let categories = [];
    let customers = [];
    try {
        [products, categories, customers] = await Promise.all([
            productService.getAllProducts(),
            productService.getAllCategories(),
            customerController.loadAllCustomers()
        ]);
    } catch (e) {
        console.warn("Could not fetch initial data", e);
    }

    let selectedItems = []; // { productId, name, price, quantity, imageUrl }

    const customerDatalist = customers.map(c => `<option value="${c.companyName || c.name}">`).join('');

    container.innerHTML = `
        <div class="animate-fade-in grid-cols-mobile-1" style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-6); align-items: start;">
            <form id="create-order-form">
                ${createCard({
        title: 'Customer Information',
        content: `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
                            <div class="input-group">
                                <label for="customerName">Customer / Company</label>
                                <div style="display: flex; gap: var(--space-2);">
                                    <div style="position: relative; flex: 1;">
                                        <span style="position: absolute; left: 10px; top: 10px;">🏢</span>
                                        <input type="text" id="customerName" name="customerName" 
                                            required placeholder="Enter or select company..." 
                                            style="padding-left: 36px; width: 100%;" autocomplete="off">
                                    </div>
                                    <button type="button" id="select-customer-btn" class="btn btn-secondary" title="Select from List" style="padding: 0 12px; font-size: 14px;">
                                        📋
                                    </button>
                                    <button type="button" id="quick-add-customer-btn" class="btn btn-secondary" title="Add New Customer" style="padding: 0 12px;">
                                        ➕
                                    </button>
                                </div>
                                <small style="color: var(--color-gray-500); cursor: pointer;" id="auto-fill-hint">
                                    ✨ Tip: Use 📋 to see all companies by category
                                </small>
                            </div>
                            <div class="input-group">
                                <label for="orderDate">Order / Delivery Date</label>
                                <input type="date" id="orderDate" name="orderDate" class="input" required style="width: 100%;">
                            </div>
                        </div>
                        <div class="input-group" style="margin-top: 10px;">
                            <label for="notes">Notes</label>
                            <textarea id="notes" name="notes" rows="2" placeholder="Special instructions..."></textarea>
                        </div>
                    `
    })}

                ${createCard({
        title: 'Order Items',
        content: `
                        <div id="items-list" style="display: flex; flex-direction: column; min-height: 100px;"></div>
                        <div style="margin-top: var(--space-4); display: flex; gap: var(--space-3);">
                            <button type="button" id="add-item-btn" class="btn btn-secondary" style="flex: 1; border-style: dashed; background: transparent; color: var(--color-primary-600); font-weight: 600;">
                                + Add Product from Catalog
                            </button>
                            <button type="button" id="add-custom-item-btn" class="btn btn-secondary" style="flex: 1; border-style: dashed; background: transparent; color: var(--color-gray-600); font-weight: 600;">
                                ✍️ Add Custom Item
                            </button>
                        </div>
                        
                        <div style="margin-top: var(--space-6); text-align: right; font-size: var(--text-lg); font-weight: 600;">
                            Total: <span id="total-preview">$0.00</span>
                        </div>
                    `
    })}

                <div style="display: flex; justify-content: flex-end; gap: var(--space-4); margin-top: var(--space-6);">
                    <button type="button" class="btn btn-secondary" onclick="window.history.back()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Create Order</button>
                </div>
            </form>
        </div>
    `;

    const renderItems = () => {
        const list = document.getElementById('items-list');
        if (!list) return;

        if (selectedItems.length === 0) {
            list.innerHTML = `
                <div style="padding: 32px; text-align: center; color: var(--color-gray-400); border: 2px dashed var(--color-gray-100); border-radius: var(--radius-lg);">
                    No items added yet. Click "+ Add Product" to begin.
                </div>
            `;
            updateTotal();
            return;
        }

        list.innerHTML = selectedItems.map((item, index) => `
            <div class="animate-fade-in" style="
                display: grid; 
                grid-template-columns: 80px 2fr 100px 120px auto; 
                gap: var(--space-4); 
                align-items: center; 
                padding: var(--space-3); 
                background: white; 
                border-bottom: 1px solid var(--color-gray-100);
            ">
                <img src="${item.imageUrl || ''}" onerror="this.src='https://placehold.co/80x80?text=📦'" 
                     style="width: 60px; height: 60px; border-radius: var(--radius-md); object-fit: cover; background: var(--color-gray-50);">
                
                <div>
                    <div style="font-weight: 600; color: var(--color-gray-900);">${item.name}</div>
                    <div style="font-size: 12px; color: var(--color-gray-500);">${item.weight || ''}</div>
                </div>

                <div>
                    <input type="number" class="input qty-input" data-index="${index}" value="${item.quantity}" min="1" style="width: 100%; text-align: center;">
                </div>

                <div style="text-align: right; font-weight: 600;">
                    ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.price * item.quantity)}
                </div>

                <button type="button" class="btn btn-ghost btn-sm remove-item-btn" data-index="${index}" style="color: var(--color-destructive);">
                    🗑️
                </button>
            </div>
        `).join('');

        // Attach listeners
        list.querySelectorAll('.qty-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index);
                selectedItems[idx].quantity = parseInt(e.target.value) || 1;
                renderItems();
            });
        });

        list.querySelectorAll('.remove-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.closest('button').dataset.index);
                selectedItems.splice(idx, 1);
                renderItems();
            });
        });

        updateTotal();
    };

    const updateTotal = () => {
        const total = selectedItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
        const el = document.getElementById('total-preview');
        if (el) {
            el.textContent = formatCurrency(total);
        }
    };

    // Modal Product Picker
    const openProductPicker = () => {
        let activeCategory = 'all';
        let searchQuery = '';

        const modal = new Modal({
            title: 'Select Products',
            size: 'large',
            content: `
                <div style="display: flex; flex-direction: column; gap: var(--space-4); height: 70vh;">
                    <!-- Filter Bar -->
                    <div style="display: flex; gap: var(--space-4); align-items: center; padding-bottom: var(--space-4); border-bottom: 1px solid var(--color-gray-200);">
                        <div style="position: relative; flex: 1;">
                            <span style="position: absolute; left: 12px; top: 10px;">🔍</span>
                            <input type="text" id="product-search" class="input" placeholder="Search products..." style="padding-left: 40px; width: 100%;">
                        </div>
                        <select id="category-picker-filter" class="input" style="width: 200px;">
                            <option value="all">All Categories</option>
                            ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                        </select>
                    </div>

                    <!-- Product Grid -->
                    <div id="product-grid" style="
                        display: grid; 
                        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); 
                        gap: var(--space-4); 
                        overflow-y: auto;
                        padding-right: 4px;
                    ">
                        <!-- Products rendered here -->
                    </div>
                </div>
            `,
            confirmText: 'Done',
            onConfirm: () => {
                renderItems();
                return true;
            }
        });

        modal.open();

        const grid = document.getElementById('product-grid');
        const searchInput = document.getElementById('product-search');
        const categorySelect = document.getElementById('category-picker-filter');

        const filterAndRender = () => {
            const filtered = products.filter(p => {
                const matchesCat = activeCategory === 'all' || p.categoryId === activeCategory;
                const name = p.displayName || '';
                const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
                return matchesCat && matchesSearch;
            });

            grid.innerHTML = filtered.map(p => {
                const isSelected = selectedItems.some(item => item.productId === p.id);
                return `
                    <div class="product-card" data-id="${p.id}" style="
                        border: 2px solid ${isSelected ? 'var(--color-primary-500)' : 'var(--color-gray-100)'};
                        border-radius: var(--radius-lg);
                        padding: var(--space-3);
                        cursor: pointer;
                        transition: all var(--transition-fast);
                        background: white;
                        display: flex;
                        flex-direction: column;
                        gap: var(--space-2);
                    ">
                        <img src="${p.imageUrl || ''}" onerror="this.src='https://placehold.co/150x150?text=📦'" 
                             style="width: 100%; height: 120px; object-fit: cover; border-radius: var(--radius-md); background: var(--color-gray-50);">
                        <div style="font-weight: 600; font-size: 14px; line-height: 1.2; height: 34px; overflow: hidden;">${p.displayName || 'Unnamed Product'}</div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
                            <span style="color: var(--color-primary-600); font-weight: 700;">${p.price || 0} Som</span>
                            ${isSelected ? '<span style="color: var(--color-primary-500);">✅</span>' : ''}
                        </div>
                    </div>
                `;
            }).join('');

            // Card Click
            grid.querySelectorAll('.product-card').forEach(card => {
                card.addEventListener('click', () => {
                    const id = card.dataset.id;
                    const p = products.find(prod => prod.id === id);
                    const idx = selectedItems.findIndex(item => item.productId === id);

                    if (idx > -1) {
                        selectedItems.splice(idx, 1);
                    } else {
                        selectedItems.push({
                            productId: p.id,
                            name: p.displayName,
                            name_en: p.name_en || p.displayName,
                            name_ru: p.name_ru || '',
                            name_kg: p.name_kg || '',
                            price: p.price,
                            quantity: 1,
                            imageUrl: p.imageUrl,
                            weight: p.weight
                        });
                    }
                    filterAndRender();
                });
            });
        };

        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            filterAndRender();
        });

        categorySelect.addEventListener('change', (e) => {
            activeCategory = e.target.value;
            filterAndRender();
        });

        filterAndRender();
    };

    // Custom Item Logic
    document.getElementById('add-custom-item-btn').addEventListener('click', () => {
        const modal = new Modal({
            title: '✍️ Add Custom Item',
            content: `
                <form id="custom-item-form">
                    <div class="input-group">
                        <label>Product Name (English)</label>
                        <input type="text" name="name_en" placeholder="Handcrafted honey..." required>
                    </div>
                    <div class="input-group">
                        <label>Product Name (Russian)</label>
                        <input type="text" name="name_ru" placeholder="Мед ручной работы...">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="input-group">
                            <label>Price (SOM)</label>
                            <input type="number" name="price" value="0" step="0.01" required>
                        </div>
                        <div class="input-group">
                            <label>Weight / Unit</label>
                            <input type="text" name="weight" placeholder="500g">
                        </div>
                    </div>
                </form>
            `,
            onConfirm: () => {
                const form = document.getElementById('custom-item-form');
                if (!form.reportValidity()) return false;

                const data = Object.fromEntries(new FormData(form).entries());
                const price = parseFloat(data.price) || 0;

                selectedItems.push({
                    productId: 'custom-' + Date.now(),
                    name: data.name_en,
                    name_en: data.name_en,
                    name_ru: data.name_ru || data.name_en,
                    name_kg: '',
                    price: price,
                    quantity: 1,
                    imageUrl: '',
                    weight: data.weight || ''
                });

                renderItems();
                return true;
            }
        });
        modal.open();
    });

    // Initial Render Items & Default Date
    setTimeout(() => {
        renderItems();
        // Set default date to Today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('orderDate').value = today;
    }, 0);

    document.getElementById('add-item-btn').addEventListener('click', openProductPicker);


    // Auto-Fill Logic
    const customerInput = document.getElementById('customerName');
    customerInput.addEventListener('change', async (e) => {
        const val = e.target.value;
        if (!val) return;

        // Check for last order
        const lastItems = await createOrderController.getLastOrderItems(val);
        if (lastItems && lastItems.length > 0) {
            // Confirm with user
            if (confirm(`Found a previous order for ${val}. Auto-fill items?`)) {
                selectedItems = lastItems.map(item => ({
                    productId: item.productId || '',
                    name: item.name,
                    name_en: item.name_en || item.name,
                    name_ru: item.name_ru || '',
                    name_kg: item.name_kg || '',
                    price: item.price,
                    quantity: item.quantity,
                    imageUrl: item.imageUrl || '',
                    weight: item.weight || ''
                }));
                renderItems();
                notificationService.success("Items auto-filled from last order");
            }
        }
    });

    // Customer Picker Modal
    document.getElementById('select-customer-btn').addEventListener('click', () => {
        let selectedCategory = 'all';
        let searchQuery = '';

        const modal = new Modal({
            title: 'Select Customer',
            size: 'large',
            content: `
                <div style="display: flex; flex-direction: column; gap: var(--space-4); min-height: 500px;">
                    <div style="display: flex; gap: var(--space-3); align-items: center; background: var(--color-gray-50); padding: 12px; border-radius: 8px;">
                        <input type="text" id="modal-cust-search" class="input" placeholder="Search name or phone..." style="flex: 1;">
                        <select id="modal-cust-category" class="input" style="width: 150px;">
                            <option value="all">All Categories</option>
                            <option value="A">Category A</option>
                            <option value="B">Category B</option>
                            <option value="C">Category C</option>
                        </select>
                    </div>
                    <div id="modal-customer-table-container" style="flex: 1; overflow-y: auto;"></div>
                </div>
            `,
            footer: false
        });

        modal.open();

        const renderTable = () => {
            const filtered = customers.filter(c => {
                const matchesCat = selectedCategory === 'all' || c.category === selectedCategory;
                const matchesQuery = (c.companyName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (c.phone || '').includes(searchQuery);
                return matchesCat && matchesQuery;
            });

            const table = new DataTable({
                columns: [
                    {
                        key: 'category',
                        label: 'Cat',
                        render: (val) => `<div style="width: 24px; height: 24px; border-radius: 4px; background: #f0f9ff; color: #0369a1; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px;">${val || 'C'}</div>`
                    },
                    { key: 'companyName', label: 'Company', render: (val) => `<strong>${val}</strong>` },
                    { key: 'phone', label: 'Phone' },
                    { key: 'city', label: 'City' }
                ],
                data: filtered,
                onRowClick: (row) => {
                    customerInput.value = row.companyName;
                    customerInput.dispatchEvent(new Event('change')); // Trigger auto-fill logic
                    modal.close();
                }
            });

            document.getElementById('modal-customer-table-container').innerHTML = table.render();

            // Re-bind row clicks since DataTable might just return string
            document.querySelectorAll('#modal-customer-table-container .data-row').forEach((rowEl, idx) => {
                rowEl.addEventListener('click', () => {
                    const row = filtered[idx];
                    customerInput.value = row.companyName;
                    customerInput.dispatchEvent(new Event('change'));
                    modal.close();
                });
            });
        };

        document.getElementById('modal-cust-search').addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderTable();
        });

        document.getElementById('modal-cust-category').addEventListener('change', (e) => {
            selectedCategory = e.target.value;
            renderTable();
        });

        renderTable();
    });

    // Quick Add Customer Logic
    document.getElementById('quick-add-customer-btn').addEventListener('click', () => {
        const modal = new Modal({
            title: 'New Customer',
            content: `
                <form id="quick-add-customer-form">
                    <div class="input-group">
                        <label>Company Name</label>
                        <input type="text" name="companyName" placeholder="Kyrgyz Organics Ltd." required>
                    </div>
                    <div class="input-group">
                        <label>Contact Name</label>
                        <input type="text" name="name" placeholder="John Doe">
                    </div>
                    <div class="input-group">
                        <label>Phone Number</label>
                        <input type="tel" name="phone" placeholder="+996 555 123 456">
                    </div>
                </form>
            `,
            onConfirm: async () => {
                const form = document.getElementById('quick-add-customer-form');
                if (!form.reportValidity()) return false;

                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());

                if (!data.name && data.companyName) data.name = data.companyName;

                const success = await customerController.handleCreateCustomer(data);
                if (success) {
                    // Auto-fill the main input
                    const newName = data.companyName || data.name;
                    document.getElementById('customerName').value = newName;

                    // Optionally refresh datalist if needed for future searches,
                    // but for this flow specifically we just want to select it.
                    notificationService.success(`Selected ${newName}`);
                }
                return success;
            }
        });
        modal.open();
    });


    // Form Submit
    document.getElementById('create-order-form').addEventListener('submit', (e) => {
        e.preventDefault();

        if (selectedItems.length === 0) {
            notificationService.error("Please add at least one product");
            return;
        }

        const formData = {
            customerName: document.getElementById('customerName').value,
            orderDate: document.getElementById('orderDate').value,
            notes: document.getElementById('notes').value,
            items: selectedItems
        };
        createOrderController.handleCreateOrder(formData);
    });
};
