import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createTripleStreams} from '../js/core/tripleStreams.mjs';
function setup(enabled=true){
 let authCallback,storeCallback;const events={},callbacks={},stats={sub:0,stop:0};const auth={currentUser:{uid:'u'}},state={currentUser:{uid:'u'},authReady:true,isAdmin:true};
 const window={location:{hash:'#/'},addEventListener:(e,f)=>events[e]=f},document={visibilityState:'visible',addEventListener:(e,f)=>events[e]=f};
 const adapter={subscribe:(n,m,next)=>{stats.sub++;callbacks[n]=next;return()=>stats.stop++;},reconcileMissing:async()=>null};
 const source=fs.readFileSync(new URL('../js/services/orderLiveQueryService.js',import.meta.url),'utf8').replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'').replace('export const orderLiveQueryService','const orderLiveQueryService');
 const globals={onAuthStateChanged:(_,cb)=>authCallback=cb,auth,db:{},firestore:{},store:{getState:()=>state,subscribe:cb=>storeCallback=cb},APP_CONFIG:{LIVE_ORDER_STREAMS_ENABLED:enabled},createFirebaseOrderStreamAdapter:()=>adapter,readServerSnapshot:()=>{},createTripleStreams,window,document};
 const service=new Function(...Object.keys(globals),source+';return orderLiveQueryService;')(...Object.values(globals));
 return {service,auth,state,events,stats,window,document,authChange:()=>authCallback(),storeChange:()=>storeCallback(),seed(){for(const n of ['orders','archive','invoices'])callbacks[n]({docs:[],fromCache:false,hasPendingWrites:false});}};
}
test('gateway default disabled never subscribes',async()=>{const h=setup(false);assert.equal(h.service.canUse(),false);await assert.rejects(h.service.requestSnapshot());assert.equal(h.stats.sub,0);});
test('gateway auth gate rejects mismatched store account',async()=>{const h=setup();h.state.currentUser.uid='other';h.storeChange();assert.equal(h.service.canUse(),false);await assert.rejects(h.service.requestSnapshot());assert.equal(h.stats.sub,0);});
test('gateway hidden teardown immediate; visibility restore alone cannot reconnect',async()=>{const h=setup();const p=h.service.requestSnapshot();h.seed();await p;assert.equal(h.stats.sub,3);h.document.visibilityState='hidden';h.events.visibilitychange();assert.equal(h.stats.stop,3);assert.equal(h.service.getSnapshot(),null);h.document.visibilityState='visible';h.events.visibilitychange();assert.equal(h.stats.sub,3);h.document.visibilityState='hidden';h.events.visibilitychange();});
test('gateway route departure cancels pending initial read; auth loss clears grace streams',async()=>{const h=setup();const p=h.service.requestSnapshot();h.service.setRoute('/inventory');await assert.rejects(p);assert.equal(h.service.canUse(),false);h.auth.currentUser=null;h.authChange();assert.equal(h.stats.stop,3);assert.equal(h.service.getSnapshot(),null);});
