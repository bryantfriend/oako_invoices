/**
 * Validates if a string is a valid email
 */
export const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Validates if value is a positive number
 */
export const isPositiveNumber = (value) => {
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0;
};

/**
 * Validates required fields in an object
 * @param {Object} data 
 * @param {Array<string>} fields 
 * @returns {Array<string>} List of missing fields
 */
export const getMissingFields = (data, fields) => {
    return fields.filter(field => !data[field] || data[field].toString().trim() === '');
};
