import test from 'node:test';
import assert from 'node:assert/strict';
import {APP_CONFIG,isLiveOrderStreamsTestEnabled} from '../js/config.js';
const browser=search=>({location:{protocol:'https:',search}});
test('default and non-browser live streams remain off',()=>{
 assert.equal(APP_CONFIG.LIVE_ORDER_STREAMS_ENABLED,false);
 for(const value of [undefined,null,{}, {location:{protocol:'file:',search:'?liveOrderStreams=1'}}]) assert.equal(isLiveOrderStreamsTestEnabled(value),false);
});
test('only a single exact opt-in value activates this web page',()=>{
 assert.equal(isLiveOrderStreamsTestEnabled(browser('?liveOrderStreams=1')),true);
 assert.equal(isLiveOrderStreamsTestEnabled(browser('?other=2&liveOrderStreams=1')),true);
 for(const q of ['', '?liveOrderStreams', '?liveOrderStreams=0','?liveOrderStreams=true','?liveOrderStreams=01','?liveOrderStreams=1&liveOrderStreams=1','?liveOrderStreams=1%20','?liveorderstreams=1','?liveOrderStreams=%']) assert.equal(isLiveOrderStreamsTestEnabled(browser(q)),false,q);
});
