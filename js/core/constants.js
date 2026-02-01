export const ORDER_STATUS = {
    DRAFT: 'draft',
    PENDING: 'pending', // Submitted by customer/sales
    CONFIRMED: 'confirmed', // Reviewed by admin
    FULFILLED: 'fulfilled', // Shipped/Done
    PAID: 'paid', // Payment received
    CANCELLED: 'cancelled'
};

export const ROUTES = {
    DASHBOARD: '/',
    LOGIN: '/login',
    CREATE_ORDER: '/orders/create',
    ORDER_DETAIL: '/orders/:id',
    INVOICES: '/invoices',
    INVOICE_DETAIL: '/invoices/:id',
    CUSTOMERS: '/customers',
    CUSTOMER_DETAIL: '/customers/:id',
    INVENTORY: '/inventory',
    SETTINGS: '/settings'
};

export const ALERTS = {
    CONFIRM_DELETE: 'Are you sure you want to delete this? This action cannot be undone.',
    CONFIRM_INVOICE: 'Generate invoice for this order? This will lock the order details.'
};
