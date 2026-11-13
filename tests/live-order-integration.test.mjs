import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTripleStreams } from '../js/core/tripleStreams.mjs';
import { createFirebaseOrderStreamAdapter, selectReturnInvoices } from '../js/core/firebaseOrderStreamAdapter.js';
import { normalizeArchivedRecord } from '../js/core/archiveRecordHelpers.js';

const flush=()=>new Promise(r=>setImmediate(r));
function sessionHarness() {
 const callbacks={},counts={sub:0,legacy:0,customers:0},local={order:{},invoice:{}};let queueChanged,publisher;
 const rawOrder={id:'a',status:'fulfilled',createdAt:'2026-11-01',totalAmount:100,items:[{productId:'p',quantity:5}]};
 const coordinator=createTripleStreams({subscribe:(name,meta,next)=>{counts.sub++;callbacks[name]=next;return ()=>{};},reconcileMissing:async()=>null,publish:(rows,meta)=>publisher?publisher(rows,meta):false});
 coordinator.setContext({owner:'u',active:true,visible:true});
 const gateway={canUse:()=>true,requestSnapshot:()=>coordinator.requestSnapshot(),getSnapshot:()=>coordinator.getSnapshot(),requestPublish:()=>coordinator.requestPublish(),setPublisher:fn=>{publisher=fn;},subscribeStatus:()=>()=>{},getStatus:()=>({state:'live'})};
 const source=fs.readFileSync(new URL('../js/services/sessionDataStore.js',import.meta.url),'utf8').replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'').replace(/export \{ sessionDataStore \};/,'').replace('export default publicStoreApi;','');
 const globals={auth:{currentUser:{uid:'u'}},store:{getState:()=>({adminProfile:{role:'admin'}})},orderLiveQueryService:gateway,
 offlineQueueService:{getLocalEntitySnapshots:async name=>{ if (local.hook) await local.hook(name); return local[name]; },subscribe:fn=>{queueChanged=fn;}},selectReturnInvoices,normalizeArchivedRecord,
 orderService:{getAllOrders:async()=>{counts.legacy++;throw Error('unexpected legacy scan');}},invoiceService:{getReturnedInvoicesForAnalytics:async()=>{counts.legacy++;throw Error('unexpected invoice query');}},
 customerService:{getAllCustomers:async()=>{counts.customers++;return [];}},settingsService:{getInvoiceSettings:async()=>({currency:'KGS'})},
 readCachedRowsAsync:async key=>key==='products:all'?[{id:'p',unitCost:2}]:[],openOfflineDexieDatabase:async()=>({sessionRecords:{get:async()=>null,put:async()=>{}}}),
 console:{info(){},warn(){},error(){}},performance,Date,Map,Set,setTimeout,clearTimeout};
 const module=new Function(...Object.keys(globals),source+';return {api:publicStoreApi,states:sessionDataStore,load:loadCollection,refresh:refreshCollection};')(...Object.values(globals));
 function emit(name,docs,meta={}){callbacks[name]({docs,fromCache:false,hasPendingWrites:false,...meta});}
 return {module,globals,coordinator,counts,local,rawOrder,emit,queue:()=>queueChanged(),close:()=>coordinator.dispose()};
}
async function seed(h) {
 const loading=h.module.load('orders',{});await flush();h.emit('orders',[h.rawOrder]);h.emit('archive',[]);h.emit('invoices',[]);await loading;await flush();return h;
}
test('cold initial and simultaneous loads share one triple seed without legacy scans',async()=>{
 const h=sessionHarness();const a=h.module.load('orders',{});const b=h.module.load('orders',{});await flush();
 assert.equal(h.counts.sub,3);h.emit('orders',[h.rawOrder]);h.emit('archive',[]);h.emit('invoices',[]);await Promise.all([a,b]);assert.equal(h.counts.legacy,0);assert.equal(h.module.api.getOrdersSnapshot().records.length,1);h.close();
});
test('arbitrary order-only external return updates repaint derived data without history reread',async()=>{
 const h=await seed(sessionHarness());const before=h.module.api.getOrdersSnapshot().loadedAt;
 h.emit('orders',[{...h.rawOrder,items:[{productId:'p',quantity:5,returnedQuantity:2}],courierReturns:[{quantity:2}]}]);await flush();await flush();
 assert.equal(h.module.api.getOrdersSnapshot().records[0].items[0].returnedQuantity,2);assert.equal(h.counts.sub,3);assert.equal(h.counts.legacy,0);assert.equal(h.module.api.getOrdersSnapshot().loadedAt,before);h.close();
});
test('invoice corrections/deletions rebuild from raw, preserving existing invoice-over-order precedence',async()=>{
 const h=await seed(sessionHarness());h.emit('invoices',[{id:'i',orderId:'a',returns:[{}],items:[{productId:'p',returnedQuantity:3}]}]);await flush();await flush();assert.equal(h.module.api.getOrdersSnapshot().records[0].items[0].returnedQuantity,3);
 h.emit('invoices',[]);await flush();await flush();assert.equal(h.module.api.getOrdersSnapshot().records[0].items[0].returnedQuantity,0);h.close();
});
test('queued offline overlays survive stream updates, and queue completion can replay without network reseed',async()=>{
 const h=await seed(sessionHarness());h.local.order.a={...h.rawOrder,status:'paid',syncStatus:'pending'};h.queue();await flush();await flush();assert.equal(h.module.api.getOrdersSnapshot().records[0].status,'paid');
 h.local.order={};h.queue();await flush();await flush();assert.equal(h.module.api.getOrdersSnapshot().records[0].status,'fulfilled');assert.equal(h.counts.sub,3);h.close();
});
test('server deletion then reappearance is not suppressed by old local tombstones',async()=>{
 const h=await seed(sessionHarness());h.module.api.removeOrderRecord('a','test');h.emit('orders',[]);await flush();await flush();assert.equal(h.module.api.getOrdersSnapshot().records.length,0);
 h.emit('orders',[h.rawOrder]);await flush();await flush();assert.equal(h.module.api.getOrdersSnapshot().records.length,1);h.close();
});
test('payment-style full context refresh reuses subscriptions and still refreshes side context',async()=>{
 const h=await seed(sessionHarness());const before=h.counts.customers;await h.module.refresh('orders',{});await flush();assert.equal(h.counts.sub,3);assert(h.counts.customers>before);assert.equal(h.counts.legacy,0);h.close();
});
test('adapter preserves unfiltered history, metadata changes, and exact invoice query order',()=>{
 const queries=[];let next;const sdk={collection:(_,name)=>({name}),orderBy:(...a)=>({orderBy:a}),limit:n=>({limit:n}),query:(r,...c)=>({...r,c}),onSnapshot:(q,options,cb)=>{queries.push({q,options});next=cb;return ()=>{};}};
 const adapter=createFirebaseOrderStreamAdapter(sdk,{});let result;adapter.subscribe('orders',{},()=>{},()=>{});adapter.subscribe('archive',{},()=>{},()=>{});adapter.subscribe('invoices',{},x=>result=x,()=>{});
 assert.deepEqual(queries[0].q,{name:'orders'});assert.deepEqual(queries[1].q,{name:'orders_archive'});assert.deepEqual(queries[2].q.c,[{orderBy:['updatedAt','desc']},{limit:250}]);assert(queries.every(q=>q.options.includeMetadataChanges));
 next({metadata:{fromCache:false,hasPendingWrites:false},docs:[{id:'b',data:()=>({})},{id:'a',data:()=>({})}]});assert.deepEqual(result.docs.map(r=>r.id),['b','a']);
});

test('cold invoice/desktop order read joins the same due session seed',async()=>{
 const h=sessionHarness();const source=fs.readFileSync(new URL('../js/services/orderService.js',import.meta.url),'utf8');
 const method=source.slice(source.indexOf('    async getAllOrders(options)'),source.indexOf('    async getOrderById'));
 const gateway={canUse:()=>true,requestSnapshot:()=>h.coordinator.requestSnapshot()};
 const service=new Function('orderLiveQueryService','offlineQueueService','auth','mergeLocalOrders','getMillis','logCollectionError','COLLECTION','return ({'+method+'});')(
 gateway,{subscribe:()=>()=>{},getLocalEntitySnapshots:async()=>({})},{currentUser:{uid:'u'}},rows=>rows,()=>0,()=>{},'orders');
 const a=h.module.load('orders',{});const b=service.getAllOrders();await flush();assert.equal(h.counts.sub,3);h.emit('orders',[h.rawOrder]);h.emit('archive',[]);h.emit('invoices',[]);await Promise.all([a,b]);assert.equal(h.counts.legacy,0);h.close();
});
test('owner-filtered local overlay never imports another account pending record',async()=>{
 const source=fs.readFileSync(new URL('../js/services/offlineQueueService.js',import.meta.url),'utf8');
 const method=source.slice(source.indexOf('    async getLocalEntitySnapshots('),source.indexOf('    async findActiveItemForEntity('));
 const service=new Function('getAllIntentRecords','isActiveLocalStatus','getLocalEntitySnapshotFromIntent','cloneData','return ({'+method+'});')(
 async()=>[{entityId:'mine',userId:'u',status:'pending'},{entityId:'foreign',userId:'v',status:'pending'}],()=>true,item=>({id:item.entityId}),x=>x);
 assert.deepEqual(Object.keys(await service.getLocalEntitySnapshots('order','u')),['mine']);
});

test('explicit live refresh restores authoritative reappearance despite old local tombstone',async()=>{
 const h=await seed(sessionHarness());h.module.api.removeOrderRecord('a','old-deletion');
 const result=await h.module.refresh('orders',{});assert.equal(result.records.length,1);assert.equal(result.records[0].id,'a');h.close();
});
test('initial asynchronous staging replays queue mutation rather than overwriting optimistic payment',async()=>{
 const h=sessionHarness();let count=0;
 h.local.hook=async name=>{if(name==='invoice' && ++count===1){h.local.order.a={...h.rawOrder,status:'paid',syncStatus:'pending'};h.queue();}};
 await seed(h);assert.equal(h.module.api.getOrdersSnapshot().records[0].status,'paid');assert.equal(h.counts.sub,3);h.close();
});
test('account switch during live staging cannot publish old owner rows',async()=>{
 const h=sessionHarness();h.local.hook=async()=>{h.globals.auth.currentUser={uid:'other'};};
 const loading=h.module.load('orders',{});await flush();h.emit('orders',[h.rawOrder]);h.emit('archive',[]);h.emit('invoices',[]);
 await assert.rejects(loading,/Account changed/);assert.equal(h.module.api.getOrdersSnapshot(),null);h.close();
});
test('failed live refresh preserves loaded data and returns visible error metadata',async()=>{
 const h=await seed(sessionHarness());h.local.hook=async()=>{throw Error('offline fixture');};
 const result=await h.module.refresh('orders',{});assert.equal(result.records[0].id,'a');assert.equal(result.meta.source,'memory-after-error');assert.match(result.meta.error,/offline fixture/);h.close();
});

test('REVIEW invoice removal restores raw mirror rather than inventing cleanup',async()=>{
 const h=await seed(sessionHarness());
 h.emit('orders',[{...h.rawOrder,items:[{productId:'p',quantity:5,returnedQuantity:1}],returnSummary:{totalReturnedQuantity:1}}]);
 h.emit('invoices',[{id:'i',orderId:'a',returns:[{}],returnSummary:{totalReturnedQuantity:3},items:[{productId:'p',returnedQuantity:3}]}]);await flush();await flush();
 assert.equal(h.module.api.getOrdersSnapshot().records[0].items[0].returnedQuantity,3);
 h.emit('invoices',[]);await flush();await flush();
 assert.equal(h.module.api.getOrdersSnapshot().records[0].items[0].returnedQuantity,1);
 assert.equal(h.module.api.getOrdersSnapshot().records[0].returnSummary.totalReturnedQuantity,1);h.close();
});
test('REVIEW moved return invoice refreshes old and new raw orders',async()=>{
 const h=await seed(sessionHarness());h.emit('orders',[h.rawOrder,{...h.rawOrder,id:'b'}]);
 h.emit('invoices',[{id:'i',orderId:'a',returns:[{}],items:[{productId:'p',returnedQuantity:3}]}]);await flush();await flush();
 h.emit('invoices',[{id:'i',orderId:'b',returns:[{}],items:[{productId:'p',returnedQuantity:2}]}]);await flush();await flush();
 const rows=h.module.api.getOrdersSnapshot().records;assert.equal(rows.find(r=>r.id==='a').items[0].returnedQuantity,0);assert.equal(rows.find(r=>r.id==='b').items[0].returnedQuantity,2);h.close();
});
test('REVIEW removing last return fields from same invoice clears old enrichment',async()=>{
 const h=await seed(sessionHarness());h.emit('invoices',[{id:'i',orderId:'a',returns:[{}],items:[{productId:'p',returnedQuantity:3}]}]);await flush();await flush();
 h.emit('invoices',[{id:'i',orderId:'a',items:[{productId:'p',quantity:5}]}]);await flush();await flush();
 assert.equal(h.module.api.getOrdersSnapshot().records[0].items[0].returnedQuantity,0);assert.equal(h.module.api.getOrdersSnapshot().extras.returnInvoices.length,0);h.close();
});

test('direct shared order read retries a changed queue snapshot without reseeding',async()=>{
 const h=await seed(sessionHarness());const source=fs.readFileSync(new URL('../js/services/orderService.js',import.meta.url),'utf8');
 const method=source.slice(source.indexOf('    async getAllOrders(options)'),source.indexOf('    async getOrderById'));
 let changed,reads=0,stopped=false;
 const service=new Function('orderLiveQueryService','offlineQueueService','auth','mergeLocalOrders','getMillis','logCollectionError','COLLECTION','return ({'+method+'});')(
 {canUse:()=>true,requestSnapshot:()=>h.coordinator.requestSnapshot()},
 {subscribe:fn=>{changed=fn;return ()=>{stopped=true;};},getLocalEntitySnapshots:async()=>{reads++;if(reads===1){changed();return {};}return {a:{...h.rawOrder,status:'paid'}};}},
 {currentUser:{uid:'u'}},(rows,pending)=>rows.map(row=>pending[row.id]||row),()=>0,()=>{},'orders');
 const rows=await service.getAllOrders();assert.equal(rows[0].status,'paid');assert.equal(reads,2);assert.equal(stopped,true);assert.equal(h.counts.sub,3);h.close();
});
