import { layoutView } from "./layoutView.js";
import { customerController } from "../controllers/customerController.js";
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

    // Table
    const table = new DataTable({
    columns: [
        { key: 'companyName', label: 'Company', render: (val, row) => `<strong>${val || row.name}</strong>` },
        { key: 'name', label: 'Contact Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' }
    ],
    data: customers,
    onRowClick: false,
    actions: (row) => `
        <button class="btn btn-secondary btn-sm"
            onclick="window.editCustomer('${row.id}')">
            Edit
        </button>

        <button class="btn btn-destructive btn-sm"
            onclick="window.archiveCustomer('${row.id}')">
            Archive
        </button>
    `
});


    container.innerHTML = `
        <div class="animate-fade-in">
            <div style="display: flex; justify-content: flex-end; margin-bottom: var(--space-4);">
                <button id="add-customer-btn" class="btn btn-primary">+ Add Customer</button>
            </div>
            
            ${createCard({
        title: 'Customer Directory',
        content: customers.length ? table.render() : '<div style="padding: 24px; text-align: center; color: var(--color-gray-500);">No customers found. Add your first one!</div>'
    })}
        </div>
    `;

    // Add Customer Handler
    document.getElementById('add-customer-btn').addEventListener('click', () => {
        const modal = new Modal({
            title: 'Add New Customer',
            content: `
                <form id="add-customer-form">
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
                        <textarea name="address" rows="2"></textarea>
                    </div>
                </form>
            `,
            onConfirm: async () => {
                const form = document.getElementById('add-customer-form');
                if (!form.reportValidity()) return false; // Keep modal open if invalid

                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());

                // Use Name as fallback if Company is empty, or vice versa logic if needed
                if (!data.name && data.companyName) data.name = data.companyName;

                const success = await customerController.handleCreateCustomer(data);
                if (success) {
                    renderCustomers(); // Reload
                    
                }
                return success;
            }
        });
        modal.open();
    });
};

window.editCustomer = async (id) => {
    const customer = await customerController.getCustomerById(id);
    if (!customer) return;

    const modal = new Modal({
        title: 'Edit Customer',
        content: `
            <form id="edit-customer-form">
                <div class="input-group">
                    <label>Company Name</label>
                    <input type="text" name="companyName" value="${customer.companyName || ''}" required>
                </div>
                <div class="input-group">
                    <label>Contact Name</label>
                    <input type="text" name="name" value="${customer.name || ''}">
                </div>
                <div class="input-group">
                    <label>Phone</label>
                    <input type="tel" name="phone" value="${customer.phone || ''}">
                </div>
                <div class="input-group">
                    <label>Email</label>
                    <input type="email" name="email" value="${customer.email || ''}">
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
            await customerController.updateCustomer(id, data);
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

