function normalizeCategoryReference(value) {
    if (value === undefined || value === null) {
        return '';
    }
    return String(value).trim().toLowerCase();
}

function addCategoryReference(references, value) {
    if (value && typeof value === 'object') {
        addCategoryReference(references, value.id);
        addCategoryReference(references, value.categoryId);
        addCategoryReference(references, value.category_id);
        addCategoryReference(references, value.name);
        addCategoryReference(references, value.name_en);
        addCategoryReference(references, value.name_ru);
        addCategoryReference(references, value.name_kg);
        addCategoryReference(references, value.slug);
        return;
    }

    var normalized = normalizeCategoryReference(value);
    if (normalized && references.indexOf(normalized) === -1) {
        references.push(normalized);
    }
}

export function getCategoryReferences(category) {
    var source = category || {};
    var references = [];
    addCategoryReference(references, source.id);
    addCategoryReference(references, source.categoryId);
    addCategoryReference(references, source.category_id);
    addCategoryReference(references, source.name);
    addCategoryReference(references, source.name_en);
    addCategoryReference(references, source.name_ru);
    addCategoryReference(references, source.name_kg);
    addCategoryReference(references, source.slug);
    return references;
}

export function getProductCategoryReferences(product) {
    var source = product || {};
    var references = [];
    addCategoryReference(references, source.categoryId);
    addCategoryReference(references, source.category_id);
    addCategoryReference(references, source.category);
    addCategoryReference(references, source.categoryName);
    addCategoryReference(references, source.category_name);
    return references;
}

export function productBelongsToCategory(product, category) {
    var productReferences = getProductCategoryReferences(product);
    var categoryReferences = getCategoryReferences(category);
    for (var index = 0; index < productReferences.length; index += 1) {
        if (categoryReferences.indexOf(productReferences[index]) !== -1) {
            return true;
        }
    }
    return false;
}

export function findProductCategory(product, categories) {
    var availableCategories = Array.isArray(categories) ? categories : [];
    for (var index = 0; index < availableCategories.length; index += 1) {
        if (productBelongsToCategory(product, availableCategories[index])) {
            return availableCategories[index];
        }
    }
    return null;
}

function getNestedCategoryValue(product, fieldName) {
    if (!product || !product.category || typeof product.category !== 'object') {
        return '';
    }
    return product.category[fieldName] || '';
}

export function normalizeProductCategory(product, categories) {
    var source = product || {};
    var matchedCategory = findProductCategory(source, categories);
    var rawCategory = typeof source.category === 'string' ? source.category : '';
    var categoryId = matchedCategory && matchedCategory.id
        ? matchedCategory.id
        : (source.categoryId || source.category_id || getNestedCategoryValue(source, 'id') || rawCategory || '');
    var categoryName = source.categoryName
        || source.category_name
        || getNestedCategoryValue(source, 'name')
        || (matchedCategory && (matchedCategory.name || matchedCategory.name_en))
        || rawCategory
        || '';

    return Object.assign({}, source, {
        categoryId: categoryId,
        categoryName: categoryName
    });
}
