export const firebaseConfig = {
    apiKey: "AIzaSyB2azgMx3VRCqKTVj4zhdqv51o6w1cAtxI",
    authDomain: "oa-kyrgyz-organic.firebaseapp.com",
    projectId: "oa-kyrgyz-organic",
    storageBucket: "oa-kyrgyz-organic.firebasestorage.app",
    messagingSenderId: "350088203372",
    appId: "1:350088203372:web:128e39d7f0cebc5be51c49",
    measurementId: "G-HD4B2XSVVT"
};

// Session-only web test opt-in. No storage, auth bypass or desktop activation.
export function isLiveOrderStreamsTestEnabled(browser) {
    try {
        if (!browser || !browser.location || !/^https?:$/.test(browser.location.protocol)) return false;
        var values = new URLSearchParams(browser.location.search || '').getAll('liveOrderStreams');
        return values.length === 1 && values[0] === '1';
    } catch (error) {
        return false;
    }
}
var liveOrderStreamsTestMode = isLiveOrderStreamsTestEnabled(typeof window === 'undefined' ? null : window);

export const APP_CONFIG = {
    // Default off; only this page URL can opt into the reviewed web test.
    LIVE_ORDER_STREAMS_ENABLED: liveOrderStreamsTestMode,
    LIVE_ORDER_STREAMS_TEST_MODE: liveOrderStreamsTestMode,
    ITEM_LIMIT: 50,
    CURRENCY: 'KGS',
    LOCALE: 'ru-KG',
    VERSION: '2.82',
    SERVICE_WORKER_VERSION: '2.82',
    DEXIE_SCHEMA_VERSION: 3,
    OFFLINE_INTENT_QUEUE_ENABLED: true,
    WORKBOX_CACHING_ENABLED: true,
    SYNC_DIAGNOSTICS_ENABLED: true
};

