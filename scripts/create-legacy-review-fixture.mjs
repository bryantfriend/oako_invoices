// Synthetic browser fixture: all Firebase, catalog and order boundaries are local stubs.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

var root = process.cwd();
var output = path.join(root, 'output/playwright/legacy-review');
fs.mkdirSync(output, { recursive: true });
var result = await build({
    stdin: {
        contents: 'export { renderLegacyProducts } from "./js/views/legacyProductsView.js"; export { mountProductReconciliation } from "./js/components/productReconciliationModal.js"; export { productReconciliationService } from "./js/services/productReconciliationService.js";',
        resolveDir: root
    },
    bundle: true, write: false, format: 'cjs', platform: 'browser',
    plugins: [{ name: 'synthetic-review-boundaries', setup: function(api) {
        api.onResolve({ filter: /\/services\/|\/(productService|offlineStatusService|firebase|layoutView)\.js$|\/core\/(authService|notificationService|i18n|store|firestoreRead|routeGuard)\.js$|^https:/ }, function(args) {
            if (args.path.endsWith('/services/productReconciliationService.js')) { return; }
            return { path: args.path, external: true };
        });
    } }]
});
var setup = `
window.fixture = {
    server: JSON.parse(localStorage.getItem('synthetic-legacy-review') || '{"mappings":{}}'),
    categories: [{id:'bread',name:'Bread'}, {id:'cookies',name:'Cookies'}],
    products: [{id:'current-bread',name:'Whole grain bread',categoryId:'bread'}, {id:'current-cookie',name:'Oat cookies',categoryId:'cookies'}],
    records: [{id:'synthetic-order',totalAmount:360,items:[
        {productId:'old-bread',name:'Old sourdough loaf',categoryId:'bread',quantity:3,price:50},
        {productId:'old-cookie',name:'Discontinued cookie box',categoryId:'cookies',quantity:2,price:80},
        {productId:'old-unknown',name:'Retired seasonal product',quantity:1,price:50}
    ]}], reject:false, offline:false
};
var module = {exports:{}};
function require(specifier) {
    var state = window.fixture;
    var name = specifier.split('/').pop().replace('.js','');
    if (specifier.startsWith('https:')) return {
        collection:function(){}, query:function(){}, where:function(){}, documentId:function(){}, doc:function(){},
        runTransaction:async function(db,callback) {
            if(state.reject) throw new Error('Synthetic save failed. Please retry.');
            return callback({get:async function(){return {exists:function(){return true;},data:function(){return state.server;}};},
                set:function(reference,patch){Object.assign(state.server.mappings,patch.mappings);localStorage.setItem('synthetic-legacy-review',JSON.stringify(state.server));}});
        }
    };
    if(name==='firebase') return {db:{},auth:{currentUser:{uid:'synthetic-staff'}}};
    if(name==='store') return {store:{getState:function(){return {adminProfile:{role:'admin'}};}}};
    if(name==='routeGuard') return {getCurrentNavigationId:function(){return 1;},isNavigationStillCurrent:function(){return true;}};
    if(name==='layoutView') return {layoutView:{render:function(){},updateTitle:function(){}}};
    if(name==='offlineStatusService') return {offlineStatusService:{canAttemptCloudRead:function(){return !state.offline;}}};
    if(name==='productService') return {productService:{getAllProducts:async function(){return state.products;},getAllCategories:async function(){return state.categories;}}};
    if(name==='sessionDataStore') return {loadOrders:async function(){return {records:state.records,extras:{}};}};
    if(name==='firestoreRead') return {
        readCachedRowsAsync:async function(){return [{mappings:state.server.mappings}];},
        getDocsWithCache:async function(){return [{mappings:state.server.mappings}];},writeCachedRows:function(){}
    };
    return {};
}
`;
fs.writeFileSync(path.join(output, 'fixture.js'), '(function(){' + setup + result.outputFiles[0].text + '\nwindow.reviewFixture=module.exports;window.reviewReady=reviewFixture.renderLegacyProducts();}());');
var styles = ['variables.css', 'animations.css', 'styles.css'].map(function readStyle(name) { return fs.readFileSync(path.join(root, 'css', name), 'utf8'); }).join('\n');
fs.writeFileSync(path.join(output, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic legacy product review</title><style>' + styles + 'body{display:block;height:auto;overflow:auto;padding:24px;background:#f7f9f6}#page-container{width:100%}</style><main id="page-container"></main><script src="fixture.js"></script></html>');
console.log('Created local-only legacy review fixture in ' + output);
