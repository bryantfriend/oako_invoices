import { layoutView } from "./layoutView.js";
import { createOrderController } from "../controllers/createOrderController.js";
import { productService } from "../services/productService.js";
import { customerController } from "../controllers/customerController.js";
import { FormRepeater } from "../components/formRepeater.js";
import { createCard } from "../components/card.js";
import { notificationService } from "../core/notificationService.js";
import { Modal } from "../components/modal.js";

export const renderCreateOrder = async () => {
    layoutView.render();
    layoutView.updateTitle("Create New Order");

    const container = document.getElementById('page-container');

    // Fetch products
    let products = [];
    try {
        products = await productService.getAllProducts();
    } catch (e) {
        console.warn("Could not fetch products", e);
    }

    // Product Options Helper
    const productOptions = products.length > 0
        ? `<option value="">Select a product...</option>` +
        products.map(p => `<option value="${p.displayName}" data-price="${p.price}">${p.displayName}</option>`).join('')
        : `<option value="" disabled>No products found</option>`;

    // Fetch Customers for Autocomplete
    let customers = await customerController.loadAllCustomers();
    const customerDatalist = customers.map(c => `<option value="${c.companyName || c.name}">`).join('');

    container.innerHTML = `
        <div class="animate-slide-up" style="max-width: 800px; margin: 0 auto;">
            <form id="create-order-form">
                ${createCard({
        title: 'Customer Information',
        content: `
                        <div class="input-group">
                            <label for="customerName">Customer / Company</label>
                            <div style="display: flex; gap: var(--space-2);">
                                <div style="position: relative; flex: 1;">
                                    <span style="position: absolute; left: 10px; top: 10px;">🔍</span>
                                    <input type="text" id="customerName" name="customerName" list="customer-list" 
                                        required placeholder="Search company..." 
                                        style="padding-left: 36px; width: 100%;" autocomplete="off">
                                    <datalist id="customer-list">
                                        ${customerDatalist}
                                    </datalist>
                                </div>
                                <button type="button" id="quick-add-customer-btn" class="btn btn-secondary" title="Add New Customer" style="padding: 0 12px;">
                                    ➕
                                </button>
                            </div>
                            <small style="color: var(--color-gray-500); cursor: pointer;" id="auto-fill-hint">
                                ✨ Tip: Select a company to check for previous orders
                            </small>
                        </div>
                        <div class="input-group">
                            <label for="notes">Notes</label>
                            <textarea id="notes" name="notes" rows="3" placeholder="Special instructions..."></textarea>
                        </div>
                    `
    })}

                ${createCard({
        title: 'Order Items',
        content: `
                        <div id="items-repeater"></div>
                        <div style="margin-top: var(--space-4);">
                            <button type="button" id="add-item-btn" class="btn btn-secondary">+ Add Item</button>
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

    // Init Repeater
    const repeater = new FormRepeater({
        containerId: 'items-repeater',
        itemTemplate: (id, data) => `
            <div class="order-item-card">
                <div class="input-group">
                    <label style="font-size: 11px; color: var(--color-gray-500); margin-bottom: 4px;">ITEM</label>
                    <select name="items[${id}][name]" required class="product-select" onchange="window.updatePrice(this)" style="width: 100%;">
                        ${productOptions}
                    </select>
                </div>
                <div class="input-group">
                    <label style="font-size: 11px; color: var(--color-gray-500); margin-bottom: 4px;">QTY</label>
                    <input type="number" name="items[${id}][quantity]" required min="1" value="${data?.quantity || 1}" class="calc-trigger" style="width: 100%;">
                </div>
                <div class="input-group">
                    <label style="font-size: 11px; color: var(--color-gray-500); margin-bottom: 4px;">PRICE</label>
                    <input type="number" name="items[${id}][price]" required min="0" step="0.01" value="${data?.price || ''}" class="calc-trigger price-input" style="width: 100%;">
                </div>
                <div style="padding-top: 16px;">
                    <button type="button" class="btn btn-destructive remove-item-btn" title="Remove Item" style="padding: 8px 12px; font-weight: bold;">
                        Remove
                    </button>
                </div>
            </div>
        `,
        // Pre-select function needed to set dropdown value after render
        onAdd: (el, data) => {
            bindCalcEvents();
            if (data && data.name) {
                const select = el.querySelector('.product-select');
                if (select) select.value = data.name;
            }
        },
        onRemove: () => calculateTotal()
    });

    repeater.init();

    document.getElementById('add-item-btn').addEventListener('click', () => repeater.addItem());

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
                // Clear existing? Or append? usually clear
                document.getElementById('items-repeater').innerHTML = '';
                lastItems.forEach(item => {
                    // Ensure price is maintained or updated? Better to use current price or last price?
                    // Let's use last price for history accuracy, user can change.
                    repeater.addItem(item);
                });
                notificationService.success("Items auto-filled from last order");
                calculateTotal();
            }
        }
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


    // Helper to update price when product selected
    window.updatePrice = (selectEl) => {
        const option = selectEl.options[selectEl.selectedIndex];
        const price = option.getAttribute('data-price');
        if (price) {
            const row = selectEl.closest('div[style*="display: grid"]');
            const priceInput = row.querySelector('.price-input');
            if (priceInput) {
                // Only update price if it's empty or user just selected (simple heuristic)
                priceInput.value = price;
                calculateTotal();
            }
        }
    };

    // Calc Logic
    function calculateTotal() {
        const data = repeater.getData();
        const total = data.reduce((sum, item) => {
            return sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.price) || 0));
        }, 0);
        document.getElementById('total-preview').textContent =
            new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total);
    }

    function bindCalcEvents() {
        document.querySelectorAll('.calc-trigger').forEach(input => {
            input.removeEventListener('input', calculateTotal);
            input.addEventListener('input', calculateTotal);
        });
    }

    // Form Submit
    document.getElementById('create-order-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = {
            customerName: document.getElementById('customerName').value,
            notes: document.getElementById('notes').value,
            items: repeater.getData()
        };
        createOrderController.handleCreateOrder(formData);
    });
};
