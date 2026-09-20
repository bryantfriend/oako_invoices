import { db, auth } from "../core/firebase.js";
import { store } from "../core/store.js";
import { collection, query, where, documentId, doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDocsWithCache, readCachedRowsAsync, writeCachedRows } from "../core/firestoreRead.js";
import { offlineStatusService } from "./offlineStatusService.js";
import { productService } from "./productService.js";
import { reconcileProductRecords, findConfirmedProductMatch } from "../core/productReconciliation.js";
import icfPipeline from "../ICF/engine/pipeline.js";
import confirmProductMatchIntentModule from "../ICF/Intents/ConfirmProductMatchIntent.js";

var SETTINGS_ID = 'product_name_mappings';
var CACHE_KEY = 'settings:product-name-mappings';
var catalog = { products: [], categories: [], mappings: {} };
var loadedAt = 0;
var loading = null;
var issueGroups = {};
var committedMappings = {};

function mergeMappings(existing, incoming) {
    var result = Object.assign({}, existing);
    Object.keys(incoming).forEach(function(key) {
        var previous = result[key];
        var next = incoming[key];
        // A later staff confirmation supersedes an older cached confirmation.
        if (!previous || !previous.confirmedAt || !next.confirmedAt || next.confirmedAt >= previous.confirmedAt) {
            result[key] = next;
        }
    });
    return result;
}

async function loadMappings(forceRefresh) {
    // Read our durable fallback before a Firestore cache miss can overwrite it.
    var cached = await readCachedRowsAsync(CACHE_KEY);
    var rows = await getDocsWithCache(query(collection(db, 'settings'), where(documentId(), '==', SETTINGS_ID)), {
        collectionName: 'settings', cacheKey: CACHE_KEY, timeoutMs: 15000, attempts: 1,
        preferServer: forceRefresh === true
    });
    var mappings = mergeMappings(cached[0] ? cached[0].mappings || {} : {}, rows[0] ? rows[0].mappings || {} : {});
    mappings = mergeMappings(mappings, committedMappings);
    writeCachedRows(CACHE_KEY, [{ id: SETTINGS_ID, mappings: mappings }]);
    return mappings;
}

async function loadContext(products, categories, forceRefresh) {
    if (!forceRefresh && loadedAt && Date.now() - loadedAt < 20000) {
        if (products) { catalog.products = products; }
        if (categories) { catalog.categories = categories; }
        return catalog;
    }
    if (loading) { return loading; }
    loading = Promise.all([
        products ? Promise.resolve(products) : productService.getAllProducts(),
        categories ? Promise.resolve(categories) : productService.getAllCategories(),
        loadMappings(forceRefresh)
    ]).then(function(groups) {
        catalog = { products: groups[0], categories: groups[1], mappings: mergeMappings(groups[2], committedMappings) };
        loadedAt = Date.now();
        return catalog;
    }).finally(function() { loading = null; });
    return loading;
}

function projectRecords(records, scope) {
    var result = reconcileProductRecords(records, catalog);
    issueGroups[scope || 'orders'] = result.issues;
    return result.records;
}

function getPendingMatches() {
    var pending = {};
    Object.keys(issueGroups).forEach(function(scope) {
        issueGroups[scope].forEach(function(issue) {
            var check = reconcileProductRecords([{ items: [{ _catalogSource: issue.source }] }], catalog);
            if (check.issues.length) { pending[issue.key] = issue; }
        });
    });
    return Object.keys(pending).map(function(key) { return pending[key]; });
}

async function writeConfirmedMatch(entry) {
    if (!auth.currentUser || !offlineStatusService.canAttemptCloudRead()) {
        throw new Error('Connect and sign in to save a product match. You can try again later.');
    }
    var reference = doc(db, 'settings', SETTINGS_ID);
    var savedMappings = await runTransaction(db, async function saveProductMapping(transaction) {
        var snapshot = await transaction.get(reference);
        var existing = snapshot.exists() ? snapshot.data().mappings || {} : {};
        var previous = findConfirmedProductMatch(entry.source, existing, catalog.categories);
        var previousStillActive = previous && catalog.products.some(function(product) {
            return product.id === previous.productId && product.active !== false && product.archived !== true;
        });
        if (previousStillActive && previous.productId !== entry.productId) {
            throw new Error('This name was already matched by another user. Refresh and review the saved match.');
        }
        var patch = {};
        patch[entry.key] = entry;
        transaction.set(reference, { mappings: patch }, { merge: true });
        return Object.assign({}, existing, patch);
    });
    committedMappings[entry.key] = entry;
    catalog.mappings = Object.assign({}, catalog.mappings, savedMappings);
    writeCachedRows(CACHE_KEY, [{ id: SETTINGS_ID, mappings: catalog.mappings }]);
    return entry;
}

async function confirmMatch(issue, productId, categoryId) {
    var profile = store.getState().adminProfile || {};
    var user = auth.currentUser;
    var actor = { id: user ? user.uid : 'anonymous', role: user ? profile.role || '' : '' };
    var intent = confirmProductMatchIntentModule.createConfirmProductMatchIntent(actor, {
        source: issue.source, key: issue.key, productId: productId, categoryId: categoryId,
        catalogApi: { load: function() { return loadContext(null, null, true); } },
        mappingApi: { save: writeConfirmedMatch }
    });
    var result = await icfPipeline.run(intent);
    if (!result.ok) { throw new Error((result.errors || ['Could not save the product match.']).join(' ')); }
    return result.data;
}

export const productReconciliationService = {
    loadContext: loadContext,
    getContext: function() { return catalog; },
    projectRecords: projectRecords,
    getPendingMatches: getPendingMatches,
    confirmMatch: confirmMatch
};
