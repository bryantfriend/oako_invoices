// Local UI fixture: real screens and workflow code, isolated from Firebase and printers.
const fs = require('fs');
const path = require('path');
const { build } = require('esbuild');
const root = process.cwd();
const destination = path.join(root, 'output/playwright/workflow-preview');
fs.mkdirSync(destination, { recursive: true });
const mocks = {
    authService: `export const authService={getCurrentUser:function(){return {uid:'qa-staff',email:'qa@example.test'};},isAdmin:function(){return true;}};`,
    store: `export const store={getState:function(){return {adminProfile:{role:'admin'},isAdmin:true};},subscribe:function(){}};`,
    firebase: `export const auth={currentUser:{uid:'qa-staff'}};export const db={};export const offlinePersistenceState={};`,
    layoutView: `export const layoutView={render:function(){},updateTitle:function(title){document.title=title;}};`,
    router: `export const router={navigate:function(route){window.location.hash=route;}};`,
    notificationService: `export const notificationService={info:q.notice,success:q.notice,error:q.notice};`,
    firestoreRead: `export function readCachedRowsAsync(key){return Promise.resolve(key==='products:all'?q.products:key==='categories:all'?q.categories:key==='customers:all'?q.customers:key==='settings:invoice_config'?[q.settings]:[]);}export function writeCachedRows(){};export function getDocsWithCache(){return Promise.resolve([]);}`,
    productService: `export const productService={getAllProducts:async function(){return q.products;},getAllCategories:async function(){return q.categories;}};`,
    settingsService: `export const settingsService={getInvoiceSettings:async function(){return q.settings;}};`,
    customerController: `export const customerController={loadAllCustomers:async function(){return q.customers;}};`,
    customerService: `export const customerService={getAllCustomers:async function(){return q.customers;}};`,
    createOrderController: `export const createOrderController={getLastOrderItems:async function(name){return q.orders.find(function(o){return o.customerName===name;})?.items||[];},getCustomerOrderHistory:async function(name){return q.orders.filter(function(o){return o.customerName===name;});}};`,
    dailyOrdersController: `export const dailyOrdersController={loadWorkspace:async function(){return {orders:q.orders,products:q.products,categories:q.categories,customers:q.customers,settings:q.settings};}};`,
    orderService: `export const orderService={
      getOrdersByCustomerName:async function(name){return q.orders.filter(function(o){return o.customerName===name;});},
      getOrderById:async function(id){return q.orders.find(function(o){return o.id===id;});},
      createOrder:async function(record,uid,options){var id='desk-'+options.requestId;var existing=q.orders.find(function(o){return o.id===id;});if(existing)return Object.assign({},existing,{workflowReused:true});var next=Object.assign({},record,{id:id,createdBy:uid});q.orders.push(next);q.save();return options.returnRecord?next:id;},
      updateOrderFromDailyOrders:async function(id,record){Object.assign(q.orders.find(function(o){return o.id===id;}),record);q.save();}
    };`,
    invoiceService: `export const invoiceService={
      getInvoiceByOrderId:async function(id){return q.invoices.find(function(i){return i.orderId===id;});},
      getInvoice:async function(id){return q.invoices.find(function(i){return i.id===id;});},
      getInvoicesByOrderIds:async function(ids){return q.invoices.filter(function(i){return ids.includes(i.orderId);});},
      syncInvoiceWithOrder:async function(id,invoice){var order=q.orders.find(function(o){return o.id===id;});Object.assign(invoice,{items:order.items,totalAmount:order.totalAmount});q.save();},
      preparePrintableInvoice:async function(id,record){if(q.failPrepare){q.failPrepare=false;throw new Error('Simulated preparation interruption. Retry reuses the saved order.');}var invoice=q.invoices.find(function(i){return i.orderId===id;});if(!invoice){invoice=Object.assign({},record,{id:'invoice-'+id,orderId:id,invoiceNumber:'INV-2026-'+String(q.invoices.length+1).padStart(6,'0'),secureToken:'qa-token-'+id,createdAt:new Date(),status:'draft',taxRate:0});q.invoices.push(invoice);q.save();}return {ok:true,data:{invoiceId:invoice.id,invoice:invoice}};}
    };`,
    invoiceController: `export const invoiceController={markPrinted:async function(id,orderId){var invoice=q.invoices.find(function(i){return i.id===id;});invoice.isPrinted=true;invoice.status='approved';var order=q.orders.find(function(o){return o.id===orderId;});order.isPrinted=true;order.status='confirmed';q.save();return {invoiceStatus:'approved'};}};`,
    qrService: `export const qrService={ensureInvoiceToken:async function(i){return i;},generateQrDataUrl:async function(i){return window.QRCode.toDataURL('https://example.test/invoice/'+i.invoiceNumber,{width:300});}};`,
    sessionDataStore: `const service={getInvoicesSnapshot:function(){return {records:q.invoices};},getKnownInvoiceRecords:function(){return q.invoices;},updateInvoiceRecord:function(){},updateOrderRecord:function(id,patch){var order=q.orders.find(function(o){return o.id===id;});if(order)Object.assign(order,patch);q.save();}};export default service;`,
    workflowEffectsService: `export function getWorkflowSession(){return {uid:'qa-staff',role:'admin',isAdmin:true};}export function queueWorkflowEffect(){}export function wakeWorkflowEffects(){}`,
    gamificationService: `export const gamificationService={celebrateBadge:function(badge){q.celebrations.push(badge.name);q.notice(badge.name);}};`
};
const keepServices = new Set(['workflowLocalStore', 'invoiceWorkflowService', 'nativeInvoicePrintService', 'invoicePrintTemplate', 'bulkInvoicePrintService', 'operationsPlanningService']);
function mockedExports(file) {
    const source = fs.readFileSync(file, 'utf8');
    const names = [...source.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function|class)\s+(\w+)/g)].map(match => match[1]);
    const extra = [...source.matchAll(/export\s*\{([^}]+)\}/g)].flatMap(match => match[1].split(',').map(name => name.trim().split(/\s+as\s+/).pop()).filter(Boolean));
    return [...new Set([...names, ...extra])].map(name => 'export const ' + name + '={};').join('\n') + '\nexport default {};';
}
async function main() {
    await build({ stdin: { contents: `import { installWorkflowBenchmark } from './scripts/workflow-preview-benchmark.js';installWorkflowBenchmark();import { renderCreateOrder } from './js/views/createOrderView.js';import { renderDailyInvoiceBatch } from './js/views/dailyInvoiceBatchView.js';import { beginNavigation } from './js/core/routeGuard.js';async function render(){var batch=location.hash.includes('daily-invoices');var route=batch?'daily-invoices':'create-order';var id=beginNavigation(route,batch?'/daily-invoices':'/orders/create');await (batch?renderDailyInvoiceBatch:renderCreateOrder)({}, {navigationId:id});}window.addEventListener('hashchange',render);render();`, resolveDir: root }, bundle: true, outfile: path.join(destination, 'preview.js'), format: 'iife', plugins: [{ name: 'fixture-only-data', setup(api) {
        api.onResolve({ filter: /\.js$/ }, function(args) {
            if (args.path.startsWith('https:')) return { path: args.path, namespace: 'remote-fixture' };
            const name = path.basename(args.path, '.js');
            const file = path.resolve(args.resolveDir, args.path);
            if (mocks[name]) return { path: name, namespace: 'fixture' };
            if ((file.includes(path.sep + 'services' + path.sep) && !keepServices.has(name)) || file.includes(path.sep + 'controllers' + path.sep)) return { path: file, namespace: 'empty-fixture' };
        });
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, function(args) { return { contents: 'const q=window.__workflowFixture;\n' + mocks[args.path] }; });
        api.onLoad({ filter: /.*/, namespace: 'empty-fixture' }, function(args) { return { contents: mockedExports(args.path) }; });
        api.onLoad({ filter: /.*/, namespace: 'remote-fixture' }, function() { return { contents: 'export const doc=function(){};export const getDoc=function(){};export const getDocs=function(){};export const collection=function(){};export const query=function(){};export const where=function(){};export const serverTimestamp=function(){};export const updateDoc=function(){};export const setDoc=function(){};' }; });
    } }] });
    fs.writeFileSync(path.join(destination, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><base href="/"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="css/variables.css"><link rel="stylesheet" href="css/styles.css"><link rel="stylesheet" href="css/animations.css"><style>body{display:block;background:#f4f7f1}#page-container{padding:24px;max-width:1400px;margin:auto}.qa-nav{padding:14px 24px;background:#21442e;color:white;display:flex;gap:25px}.qa-nav a{color:white}#qa-notice{padding:6px 24px;color:#527143}</style></head><body><nav class="qa-nav"><strong>Local invoice workflow fixture</strong><a href="#/orders/create">Create order</a><a href="#/daily-invoices">Daily batch</a></nav><div id="qa-notice" role="status"></div><div id="page-container"></div><div id="modal-container"></div><div id="toast-container"></div><script src="vendor/qrcode.min.js"></script><script src="vendor/html2canvas.min.js"></script><script src="vendor/jspdf.umd.min.js"></script><script>
    var today=new Date();var date=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
    var products=[{id:'bread',name:'Country loaf',name_en:'Country loaf',name_ru:'Деревенский хлеб',price:150,businessPrice:130,categoryId:'bread',imageUrl:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="60"%3E%3Crect width="60" height="60" fill="%23e5eddd"/%3E%3C/svg%3E'},{id:'rye',name:'Rye loaf',name_ru:'Ржаной хлеб',price:180,businessPrice:160,categoryId:'bread'},{id:'roll',name:'Morning roll',name_ru:'Булочка',price:70,businessPrice:60,categoryId:'bread'}];
    var customers=[{id:'cafe',companyName:'Oak Café'},{id:'market',companyName:'Green Market'},{id:'hotel',companyName:'Mountain Hotel'}];
    var fixtureHistory=[];customers.forEach(function(c,ci){for(var i=1;i<=4;i++){fixtureHistory.push({id:c.id+'-'+i,customerName:c.companyName,customerId:c.id,orderDate:'2026-09-0'+i,status:'paid',items:products.map(function(p){return {productId:p.id,name:p.name,name_ru:p.name_ru,quantity:10+ci,price:p.price,unitPrice:p.price,returnedQuantity:3};}),totalAmount:4000});}});
    window.__workflowFixture={products:products,categories:[{id:'bread',name:'Bread'}],customers:customers,orders:JSON.parse(localStorage.getItem('qa-orders')||'null')||fixtureHistory,invoices:JSON.parse(localStorage.getItem('qa-invoices')||'null')||[],settings:{companyName:'Kyrgyz Organics',defaultOrderPriceMode:'retail',invoiceItemsPerPage:7,defaultTaxRate:0,paymentQrImageUrl:'./Payment QR Code.png'},failPrepare:false,celebrations:[],notice:function(text){document.getElementById('qa-notice').textContent=text;},save:function(){localStorage.setItem('qa-orders',JSON.stringify(this.orders));localStorage.setItem('qa-invoices',JSON.stringify(this.invoices));}};
    </script><script src="output/playwright/workflow-preview/preview.js"></script></body></html>`);
    console.log('Fixture: http://127.0.0.1:8766/output/playwright/workflow-preview/index.html');
    if (process.argv.includes('--serve')) {
        const http = require('http');
        http.createServer(function(request, response) {
            const requested = request.url.split('?')[0] === '/' ? path.join(destination, 'index.html') : path.resolve(root, '.' + decodeURIComponent(request.url.split('?')[0]));
            if (!requested.startsWith(root + path.sep) || !fs.existsSync(requested) || !fs.statSync(requested).isFile()) { response.writeHead(404); response.end(); return; }
            const mime = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' }[path.extname(requested)] || 'application/octet-stream';
            response.writeHead(200, { 'Content-Type': mime }); fs.createReadStream(requested).pipe(response);
        }).listen(8766, '127.0.0.1');
    }
}
main().catch(function(error) { console.error(error); process.exitCode = 1; });
