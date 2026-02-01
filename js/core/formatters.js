export const formatCurrency = (amount, currency = 'KGS') => {
    return new Intl.NumberFormat('ru-KG', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0
    }).format(amount);
};

export const formatDate = (val) => {
    if (!val) return '-';
    const date = val.toDate ? val.toDate() : new Date(val);
    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(date);
};

export const truncate = (str, length = 20) => {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substring(0, length) + '...';
};

export const capitalize = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
};
