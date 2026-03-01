const DICTIONARY = {
    en: {
        // Layout & Sidebar
        sidebar_dashboard: "Dashboard",
        sidebar_orders: "Orders",
        sidebar_invoices: "Invoices",
        sidebar_inventory: "Inventory",
        sidebar_customers: "Customers",
        sidebar_settings: "Settings",
        sidebar_logout: "Log Out",
        topbar_admin: "Administrator",

        // Dashboard
        dash_title: "Dashboard Overview",
        dash_stat_orders: "Total Orders",
        dash_stat_revenue: "Total Revenue",
        dash_stat_customers: "Active Customers",
        dash_quick_actions: "Quick Actions",
        dash_new_order: "New Order",
        dash_new_customer: "New Customer",
        dash_recent_orders: "Recent Orders",
        table_order_id: "Order ID",
        table_customer: "Customer",
        table_date: "Date",
        table_total: "Total",
        table_status: "Status",

        // Invoices
        invoice_title: "Invoices",
        invoice_all_customers: "All Customers",
        invoice_all_time: "All Time",
        invoice_today: "Today",
        invoice_this_week: "This Week",
        invoice_this_month: "This Month",
        table_invoice_num: "Invoice #",
        table_amount: "Amount",

        // Print Translations (Used in invoiceView.js Document Render)
        print_invoice: "Invoice",
        print_invoice_num: "Invoice number",
        print_date: "Date",
        print_bill_to: "Bill to:",
        print_description: "Description",
        print_quantity: "Quantity",
        print_unit_price: "Unit Price",
        print_total: "Total",
        print_subtotal: "Subtotal",
        print_vat: "VAT",
        print_grand_total: "Grand Total",
        print_notes: "Notes:",
        print_thanks: "Thanks for supporting sustainable agriculture!",
        print_scan_pay: "Scan to pay",

        // Customers
        customer_title: "Customers",
        table_company: "Company / Name",
        table_contact: "Contact Person",
        table_email: "Email",
        table_phone: "Phone",
        table_actions: "Actions",
        customer_detail: "Customer Detail",
        customer_not_found: "Customer not found",
        stat_last_order: "Last Order",
        order_history: "Order History",
        no_orders_found: "No orders found for this customer.",

        // Inventory
        inventory_title: "Inventory Tracking",
        inventory_add_btn: "Add Item",
        table_item: "Item Name",
        table_sku: "SKU",
        table_category: "Category",
        table_price: "Price",
        table_stock: "In Stock",
        inventory_in_stock: "In Stock",
        inventory_out_stock: "Out of Stock",
        inventory_low_stock: "Low Stock",

        // Orders
        order_create_title: "Create New Order",
        order_detail_title: "Order",

        // Settings
        settings_title: "Invoice Settings",

        // Login
        login_title: "Sign in to your account",
        login_email: "Email address",
        login_pass: "Password",
        login_btn: "Sign in",
        login_loading: "Signing in...",
        login_err_missing: "Please enter email and password",
        login_success: "Login successful",
        login_fail: "Login failed",

        // Modals / Common
        btn_cancel: "Cancel",
        btn_save: "Save",
        btn_delete: "Delete",
        btn_close: "Close",
        msg_confirm_delete: "Are you sure you want to delete this?",
        val_required: "This field is required",
        status_paid: "PAID",
        status_pending: "PENDING",
        status_complete: "COMPLETED",
        status_draft: "DRAFT",

        // Messages
        msg_load_fail: "Failed to load data",
        msg_save_success: "Saved successfully",
        msg_save_fail: "Failed to save",
        msg_delete_success: "Deleted successfully",
        msg_delete_fail: "Failed to delete",
        msg_update_success: "Updated successfully",
        msg_update_fail: "Failed to update",
        msg_offline: "You are working offline. Changes will save locally.",
        msg_online: "You are back online. Syncing data...",
        msg_print_success: "Printed successfully",
    },
    ru: {
        // Layout & Sidebar
        sidebar_dashboard: "Панель управления",
        sidebar_orders: "Заказы",
        sidebar_invoices: "Счета",
        sidebar_inventory: "Склад",
        sidebar_customers: "Клиенты",
        sidebar_settings: "Настройки",
        sidebar_logout: "Выйти",
        topbar_admin: "Администратор",

        // Dashboard
        dash_title: "Обзор управления",
        dash_stat_orders: "Всего заказов",
        dash_stat_revenue: "Общая выручка",
        dash_stat_customers: "Активные клиенты",
        dash_quick_actions: "Быстрые действия",
        dash_new_order: "Новый заказ",
        dash_new_customer: "Новый клиент",
        dash_recent_orders: "Последние заказы",
        table_order_id: "ID заказа",
        table_customer: "Клиент",
        table_date: "Дата",
        table_total: "Итого",
        table_status: "Статус",

        // Invoices
        invoice_title: "Счета",
        invoice_all_customers: "Все клиенты",
        invoice_all_time: "За все время",
        invoice_today: "Сегодня",
        invoice_this_week: "На этой неделе",
        invoice_this_month: "В этом месяце",
        table_invoice_num: "Счет №",
        table_amount: "Сумма",

        // Print Translations
        print_invoice: "Расходная накладная",
        print_invoice_num: "Номер счёта",
        print_date: "Дата",
        print_bill_to: "Покупатель:",
        print_description: "Наименование",
        print_quantity: "Кол-во",
        print_unit_price: "Цена",
        print_total: "Сумма",
        print_subtotal: "Итого",
        print_vat: "НДС",
        print_grand_total: "Общая сумма",
        print_notes: "Заметки:",
        print_thanks: "Спасибо за поддержку экологичного фермерства!",
        print_scan_pay: "Сканируйте для оплаты",

        // Customers
        customer_title: "Клиенты",
        table_company: "Компания / Имя",
        table_contact: "Контактное лицо",
        table_email: "Email",
        table_phone: "Телефон",
        table_actions: "Действия",
        customer_detail: "Детали клиента",
        customer_not_found: "Клиент не найден",
        stat_last_order: "Последний заказ",
        order_history: "История заказов",
        no_orders_found: "Заказов для этого клиента не найдено.",

        // Inventory
        inventory_title: "Складской учет",
        inventory_add_btn: "Добавить товар",
        table_item: "Наименование",
        table_sku: "Артикул",
        table_category: "Категория",
        table_price: "Цена",
        table_stock: "В наличии",
        inventory_in_stock: "В наличии",
        inventory_out_stock: "Нет в наличии",
        inventory_low_stock: "Мало",

        // Orders
        order_create_title: "Создать новый заказ",
        order_detail_title: "Заказ",

        // Settings
        settings_title: "Настройки счетов",

        // Login
        login_title: "Войдите в аккаунт",
        login_email: "Email адрес",
        login_pass: "Пароль",
        login_btn: "Войти",
        login_loading: "Вход...",
        login_err_missing: "Пожалуйста, введите email и пароль",
        login_success: "Вход выполнен успешно",
        login_fail: "Ошибка входа",

        // Modals / Common
        btn_cancel: "Отмена",
        btn_save: "Сохранить",
        btn_delete: "Удалить",
        btn_close: "Закрыть",
        msg_confirm_delete: "Вы уверены, что хотите удалить это?",
        val_required: "Это поле обязательно",
        status_paid: "ОПЛАЧЕНО",
        status_pending: "ОЖИДАЕТ",
        status_complete: "ЗАВЕРШЕНО",
        status_draft: "ЧЕРНОВИК",

        // Messages
        msg_load_fail: "Ошибка загрузки данных",
        msg_save_success: "Успешно сохранено",
        msg_save_fail: "Ошибка сохранения",
        msg_delete_success: "Успешно удалено",
        msg_delete_fail: "Ошибка удаления",
        msg_update_success: "Обновлено успешно",
        msg_update_fail: "Ошибка обновления",
        msg_offline: "Вы работаете в автономном режиме. Изменения сохранятся локально.",
        msg_online: "Вы снова в сети. Синхронизация данных...",
        msg_print_success: "Напечатано успешно",
    },
    kg: {
        // Layout & Sidebar
        sidebar_dashboard: "Башкаруу панели",
        sidebar_orders: "Буйрутмалар",
        sidebar_invoices: "Эсеп-фактуралар",
        sidebar_inventory: "Кампа",
        sidebar_customers: "Кардарлар",
        sidebar_settings: "Жөндөөлөр",
        sidebar_logout: "Чыгуу",
        topbar_admin: "Администратор",

        // Dashboard
        dash_title: "Жалпы сереп",
        dash_stat_orders: "Жалпы буйрутмалар",
        dash_stat_revenue: "Жалпы киреше",
        dash_stat_customers: "Активдүү кардарлар",
        dash_quick_actions: "Ыкчам аракеттер",
        dash_new_order: "Жаңы буйрутма",
        dash_new_customer: "Жаңы кардар",
        dash_recent_orders: "Акыркы буйрутмалар",
        table_order_id: "Буйрутма ID",
        table_customer: "Кардар",
        table_date: "Дата",
        table_total: "Жалпы",
        table_status: "Статус",

        // Invoices
        invoice_title: "Эсеп-фактуралар",
        invoice_all_customers: "Бардык кардарлар",
        invoice_all_time: "Бардык убакыт",
        invoice_today: "Бүгүн",
        invoice_this_week: "Ушул апта",
        invoice_this_month: "Ушул ай",
        table_invoice_num: "Эсеп №",
        table_amount: "Сумма",

        // Print Translations
        print_invoice: "Чыгымдардын эсеби",
        print_invoice_num: "Эсеп кагазынын номуру",
        print_date: "Датасы",
        print_bill_to: "Сатып алуучу:",
        print_description: "Товардын аты",
        print_quantity: "Саны",
        print_unit_price: "Баасы",
        print_total: "Суммасы",
        print_subtotal: "Бардыгы",
        print_vat: "КНС",
        print_grand_total: "Жалпы сумма",
        print_notes: "Эскертүүлөр:",
        print_thanks: "Экологиялык дыйканчылыкты колдогонуңуз үчүн рахмат!",
        print_scan_pay: "Төлөө үчүн сканерлеңиз",

        // Customers
        customer_title: "Кардарлар",
        table_company: "Ишкана / Аты-жөнү",
        table_contact: "Байланышчу адам",
        table_email: "Email",
        table_phone: "Телефон",
        table_actions: "Аракеттер",
        customer_detail: "Кардар тууралуу",
        customer_not_found: "Кардар табылган жок",
        stat_last_order: "Акыркы буйрутма",
        order_history: "Буйрутмалардын тарыхы",
        no_orders_found: "Бул кардар үчүн буйрутмалар табылган жок.",

        // Inventory
        inventory_title: "Кампага көзөмөл",
        inventory_add_btn: "Товар кошуу",
        table_item: "Товардын аты",
        table_sku: "Артикул",
        table_category: "Категория",
        table_price: "Баасы",
        table_stock: "Кампада",
        inventory_in_stock: "Кампада",
        inventory_out_stock: "Кампада жок",
        inventory_low_stock: "Аз калды",

        // Orders
        order_create_title: "Жаңы буйрутма түзүү",
        order_detail_title: "Буйрутма",

        // Settings
        settings_title: "Эсеп-фактура жөндөөлөрү",

        // Login
        login_title: "Аккаунтка кирүү",
        login_email: "Email дареги",
        login_pass: "Сыр сөз",
        login_btn: "Кирүү",
        login_loading: "Кирүүдө...",
        login_err_missing: "Электрондук почтаны жана сырсөздү киргизиңиз",
        login_success: "Кирүү ийгиликтүү болду",
        login_fail: "Кирүү катасы",

        // Modals / Common
        btn_cancel: "Жокко чыгаруу",
        btn_save: "Сактоо",
        btn_delete: "Өчүрүү",
        btn_close: "Жабуу",
        msg_confirm_delete: "Муну чын эле өчүрөсүзбү?",
        val_required: "Бул талаа милдеттүү",
        status_paid: "ТӨЛӨНДҮ",
        status_pending: "КҮТҮҮДӨ",
        status_complete: "АЯКТАДЫ",
        status_draft: "ЧЕРНОВИК",

        // Messages
        msg_load_fail: "Маалыматтарды жүктөө катасы",
        msg_save_success: "Ийгиликтүү сакталды",
        msg_save_fail: "Сактоо катасы",
        msg_delete_success: "Ийгиликтүү өчүрүлдү",
        msg_delete_fail: "Өчүрүү катасы",
        msg_update_success: "Ийгиликтүү жаңыртылды",
        msg_update_fail: "Жаңыртуу катасы",
        msg_offline: "Сиз оффлайн режимде иштеп жатасыз. Өзгөртүүлөр локалдуу түрдө сакталат.",
        msg_online: "Сиз кайра онлайнсыз. Маалыматтар шайкештирилүүдө...",
        msg_print_success: "Ийгиликтүү басып чыгарылды",
    }
};

class I18nService {
    constructor() {
        this.currentLang = localStorage.getItem('ko_admin_lang') || 'en';
        this.listeners = [];
    }

    setLanguage(lang) {
        if (['en', 'ru', 'kg'].includes(lang)) {
            this.currentLang = lang;
            localStorage.setItem('ko_admin_lang', lang);
            this._notify();
        }
    }

    getLanguage() {
        return this.currentLang;
    }

    t(key, langOverride) {
        const lang = langOverride || this.currentLang;
        const langDict = DICTIONARY[lang] || DICTIONARY['en'];
        // Fallback to English if translation is missing
        return langDict[key] || DICTIONARY['en'][key] || `[${key}]`;
    }

    subscribe(listener) {
        this.listeners.push(listener);
        // Returns unsubscribe function
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    _notify() {
        this.listeners.forEach(listener => listener(this.currentLang));
    }
}

export const i18n = new I18nService();
export const t = (key, lang) => i18n.t(key, lang);
