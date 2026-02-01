import { layoutView } from "./layoutView.js";
import { customerController } from "../controllers/customerController.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { DataTable } from "../components/dataTable.js";
import { createCard } from "../components/card.js";
import { Modal } from "../components/modal.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";

export const renderCustomers = async () => {
    layoutView.render();
    layoutView.updateTitle("Customers");
    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    // Fetch Data
    const customers = await customerController.loadAllCustomers();

    let isEditingLocked = true;
    let categoryFilter = 'all';

    const renderHeaderContainer = () => {
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = 'var(--space-6)';

        header.innerHTML = `
            <div style="display: flex; gap: var(--space-4); align-items: center;">
                <select id="category-filter" class="input" style="width: auto; padding: 6px 12px;">
                    <option value="all">All Categories</option>
                    <option value="A" ${categoryFilter === 'A' ? 'selected' : ''}>Category A (Premium)</option>
                    <option value="B" ${categoryFilter === 'B' ? 'selected' : ''}>Category B (Standard)</option>
                    <option value="C" ${categoryFilter === 'C' ? 'selected' : ''}>Category C (Basic)</option>
                </select>
                
                <button id="toggle-lock-btn" class="btn ${isEditingLocked ? 'btn-secondary' : 'btn-primary'}" style="display: flex; align-items: center; gap: 8px;">
                    ${isEditingLocked ? '🔒 Locked' : '🔓 Editing Enabled'}
                </button>
            </div>
            <button id="add-customer-btn" class="btn btn-primary">+ Add Customer</button>
        `;
        return header;
    };

    const refreshTable = () => {
        const filteredData = categoryFilter === 'all'
            ? customers
            : customers.filter(c => c.category === categoryFilter);

        const table = new DataTable({
            columns: [
                {
                    key: 'category',
                    label: 'Cat',
                    render: (val, row) => {
                        if (isEditingLocked) {
                            const colors = { A: 'var(--color-primary-600)', B: 'var(--color-warning)', C: 'var(--color-gray-500)' };
                            const bg = { A: 'var(--color-primary-50)', B: 'var(--color-warning-light, #fffbe6)', C: 'var(--color-gray-50)' };
                            return `<span style="
                                padding: 2px 8px; 
                                border-radius: 4px; 
                                font-weight: 700; 
                                background: ${bg[val] || 'transparent'}; 
                                color: ${colors[val] || 'var(--color-gray-400)'};
                            ">${val || '-'}</span>`;
                        } else {
                            return `
                                <select class="inline-edit-category" data-id="${row.id}" style="padding: 2px 4px; border-radius: 4px; border: 1px solid var(--color-gray-300);">
                                    <option value="" ${!val ? 'selected' : ''}>-</option>
                                    <option value="A" ${val === 'A' ? 'selected' : ''}>A</option>
                                    <option value="B" ${val === 'B' ? 'selected' : ''}>B</option>
                                    <option value="C" ${val === 'C' ? 'selected' : ''}>C</option>
                                </select>
                            `;
                        }
                    }
                },
                {
                    key: 'companyName',
                    label: 'Company',
                    render: (val, row) => {
                        const displayVal = val || row.name || '';
                        const safeVal = displayVal.replace(/"/g, '&quot;');
                        return isEditingLocked
                            ? `<strong>${displayVal || 'Untitled'}</strong>`
                            : `<input type="text" class="inline-edit" data-id="${row.id}" data-field="companyName" value="${safeVal}" style="width: 100%; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-gray-300);">`;
                    }
                },
                {
                    key: 'name',
                    label: 'Contact Name',
                    render: (val, row) => {
                        const safeVal = (val || '').replace(/"/g, '&quot;');
                        return isEditingLocked
                            ? val || ''
                            : `<input type="text" class="inline-edit" data-id="${row.id}" data-field="name" value="${safeVal}" style="width: 100%; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-gray-300);">`;
                    }
                },
                {
                    key: 'phone',
                    label: 'Phone',
                    render: (val, row) => {
                        const safeVal = (val || '').replace(/"/g, '&quot;');
                        return isEditingLocked
                            ? val || ''
                            : `<input type="tel" class="inline-edit" data-id="${row.id}" data-field="phone" value="${safeVal}" style="width: 100%; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-gray-300);">`;
                    }
                },
                {
                    key: 'email',
                    label: 'Email',
                    render: (val, row) => {
                        const safeVal = (val || '').replace(/"/g, '&quot;');
                        return isEditingLocked
                            ? val || ''
                            : `<input type="email" class="inline-edit" data-id="${row.id}" data-field="email" value="${safeVal}" style="width: 100%; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-gray-300);">`;
                    }
                }
            ],
            data: filteredData,
            onRowClick: (row) => router.navigate(ROUTES.CUSTOMER_DETAIL.replace(':id', row.id)),
            actions: (row) => `
                <div style="display: flex; gap: var(--space-2); align-items: center; justify-content: flex-end;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.editCustomer('${row.id}')">Edit</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.archiveCustomer('${row.id}')">Archive</button>
                    <button type="button" class="btn btn-destructive btn-sm" style="padding: 2px 6px;" onclick="event.stopPropagation(); window.deleteCustomer('${row.id}')" title="Delete Permanently">🗑️</button>
                </div>
            `
        });

        const tableContainer = container.querySelector('#table-wrapper');
        tableContainer.innerHTML = filteredData.length
            ? table.render()
            : '<div style="padding: 48px; text-align: center; color: var(--color-gray-500);">No customers found in this category.</div>';

        // Attach Inline Listeners
        if (!isEditingLocked) {
            // Category Listener
            tableContainer.querySelectorAll('.inline-edit-category').forEach(select => {
                select.addEventListener('change', async (e) => {
                    const id = e.target.dataset.id;
                    const newCat = e.target.value;
                    const success = await customerController.handleUpdateCustomer(id, { category: newCat });
                    if (success) {
                        const cust = customers.find(c => c.id === id);
                        if (cust) cust.category = newCat;
                    }
                });
            });

            // Generic Field Listeners (on blur to avoid too many updates)
            tableContainer.querySelectorAll('.inline-edit').forEach(input => {
                input.addEventListener('blur', async (e) => {
                    const id = e.target.dataset.id;
                    const field = e.target.dataset.field;
                    const newVal = e.target.value;

                    // Simple check if value actually changed
                    const cust = customers.find(c => c.id === id);
                    if (cust && cust[field] === newVal) return;

                    const success = await customerController.handleUpdateCustomer(id, { [field]: newVal });
                    if (success && cust) {
                        cust[field] = newVal;
                    }
                });

                // Also save on Enter
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') e.target.blur();
                });
            });
        }
    };

    container.innerHTML = `
        <div class="animate-fade-in">
            <div id="header-wrapper"></div>
            <div id="table-wrapper"></div>
        </div>
    `;

    container.querySelector('#header-wrapper').appendChild(renderHeaderContainer());
    refreshTable();

    // Event Delegation for Header
    container.addEventListener('click', async (e) => {
        if (e.target.id === 'toggle-lock-btn' || e.target.closest('#toggle-lock-btn')) {
            isEditingLocked = !isEditingLocked;
            const headerWrapper = container.querySelector('#header-wrapper');
            headerWrapper.innerHTML = '';
            headerWrapper.appendChild(renderHeaderContainer());
            refreshTable();
        }

        if (e.target.id === 'add-customer-btn') {
            window.showAddCustomerModal();
        }
    });

    container.addEventListener('change', (e) => {
        if (e.target.id === 'category-filter') {
            categoryFilter = e.target.value;
            refreshTable();
        }
    });
};

window.showAddCustomerModal = () => {
    const modal = new Modal({
        title: 'Add New Customer',
        content: `
            <form id="add-customer-form">
                <div class="input-group">
                    <label>Category</label>
                    <select name="category" class="input">
                        <option value="C">Category C (Basic)</option>
                        <option value="B">Category B (Standard)</option>
                        <option value="A">Category A (Premium)</option>
                    </select>
                </div>
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
                <div class="input-group">
                    <label>Email</label>
                    <input type="email" name="email" placeholder="john@example.com">
                </div>
                <div class="input-group">
                    <label>Address</label>
                    <textarea name="address" rows="2" class="input"></textarea>
                </div>
            </form>
        `,
        onConfirm: async () => {
            const form = document.getElementById('add-customer-form');
            if (!form.reportValidity()) return false;

            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            if (!data.name && data.companyName) data.name = data.companyName;

            const success = await customerController.handleCreateCustomer(data);
            if (success) renderCustomers();
            return success;
        }
    });
    modal.open();
};

window.editCustomer = async (id) => {
    const customer = await customerController.getCustomerById(id);
    if (!customer) return;

    const modal = new Modal({
        title: 'Edit Customer',
        content: `
            <form id="edit-customer-form">
                <div class="input-group">
                    <label>Category</label>
                    <select name="category" class="input">
                        <option value="C" ${customer.category === 'C' ? 'selected' : ''}>Category C (Basic)</option>
                        <option value="B" ${customer.category === 'B' ? 'selected' : ''}>Category B (Standard)</option>
                        <option value="A" ${customer.category === 'A' ? 'selected' : ''}>Category A (Premium)</option>
                    </select>
                </div>
                <div class="input-group">
                    <label>Company Name</label>
                    <input
                        type="text"
                        name="companyName"
                        value="${customer.companyName || ''}"
                        placeholder="Company Name"
                    >
                </div>

                <div class="input-group">
                    <label>Contact Name</label>
                    <input
                        type="text"
                        name="name"
                        value="${customer.name || ''}"
                    >
                </div>

                <div class="input-group">
                    <label>Phone</label>
                    <input
                        type="tel"
                        name="phone"
                        value="${customer.phone || ''}"
                    >
                </div>

                <div class="input-group">
                    <label>Email</label>
                    <input
                        type="email"
                        name="email"
                        value="${customer.email || ''}"
                    >
                </div>

                <div class="input-group">
                    <label>Address</label>
                    <textarea name="address">${customer.address || ''}</textarea>
                </div>
            </form>
        `,
        confirmText: 'Save Changes',
        onConfirm: async () => {
            const form = document.getElementById('edit-customer-form');
            if (!form.reportValidity()) return false;

            const data = Object.fromEntries(new FormData(form).entries());

            // Normalize forward (optional but recommended)
            if (!data.name && data.companyName) data.name = data.companyName;
            if (!data.companyName && data.name) data.companyName = data.name;

            await customerController.handleUpdateCustomer(id, data);
            renderCustomers();
            return true;
        }
    });

    modal.open();
};

window.archiveCustomer = (id) => {
    Modal.confirm(
        'Archive Customer',
        'This customer will be hidden but not deleted.',
        async () => {
            await customerController.archiveCustomer(id);
            renderCustomers();
        }
    );
};

window.deleteCustomer = (id) => {
    Modal.confirm(
        'Delete Customer Permanently',
        'Are you sure? This will permanently remove the customer from the database. This action cannot be undone.',
        async () => {
            const success = await customerController.handleDeleteCustomer(id);
            if (success) renderCustomers();
        }
    );
};

