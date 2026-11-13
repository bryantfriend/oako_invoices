import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../js/views/dashboardView.js',import.meta.url),'utf8');
test('a user date/filter render consumes deferred live data and clears only settled payment markers',()=>{
 const start=source.indexOf('        // Any deliberate view render');
 const end=source.indexOf('            pendingLiveResult = null;',start)+'            pendingLiveResult = null;\n        }'.length;
 const body=source.slice(start,end);
 const run=new Function('pendingLiveResult','pendingCheckmarkUpdates','updatedCheckmarkUpdates','getActiveOrders','dashboardController',
 'var allOrders=[],activeOrders=[],returnOrders=[],returnInvoices=[],intelligenceSettings={};'+body+';return {pendingLiveResult,allOrders,returnInvoices};');
 const updated=new Set(['settled','saving']);
 const result=run({result:{orders:[{id:'new'}],returnOrders:[],returnInvoices:[{id:'return'}],intelligenceSettings:{},meta:{revision:1}},status:{state:'live'}},new Set(['saving']),updated,rows=>rows,{currentRevision:()=>1});
 assert.equal(result.pendingLiveResult,null);assert.equal(result.allOrders[0].id,'new');assert.equal(result.returnInvoices[0].id,'return');assert.deepEqual([...updated],['saving']);
 // The live callback stores pending data before creating a disposable DOM notice.
 assert(source.indexOf('pendingLiveResult = { result: result, status: status };') < source.indexOf("notice = document.createElement('button')"));
});

test('failed side context refresh surfaces error before inventory or result rendering',()=>{
 const refresh=source.slice(source.indexOf('const refreshDashboardDataPreservingState'),source.indexOf('const refreshDashboardDataPreservingState')+2400);
 assert(refresh.indexOf('if (refreshedMeta.error) throw new Error') < refresh.indexOf('await inventoryController.loadInventoryData'));
 assert(refresh.includes('if (refreshedMeta.error) throw new Error'));
});

test('older deferred revision cannot replace newer explicit refresh data',()=>{
 const start=source.indexOf('        // Any deliberate view render');
 const end=source.indexOf('            pendingLiveResult = null;',start)+'            pendingLiveResult = null;\n        }'.length;
 const body=source.slice(start,end);
 const run=new Function('pendingLiveResult','dashboardController','var allOrders=[{id:"fresh"}];'+body+';return allOrders;');
 assert.deepEqual(run({result:{orders:[{id:'old'}],meta:{revision:1}}},{currentRevision:()=>2}),[{id:'fresh'}]);
 assert(source.indexOf("ignoreStaleRouteResult('dashboard-render-ui'") < source.indexOf('// Any deliberate view render'));
});
