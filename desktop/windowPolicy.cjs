const path = require('path');

function resolveAppPath(root, requestUrl) {
    var url = new URL(requestUrl);
    if (url.protocol !== 'korganics:' || url.hostname !== 'app') return null;
    var relative;
    try { relative = decodeURIComponent(url.pathname); } catch (error) { return null; }
    if (relative === '/') relative = '/index.html';
    var resolvedRoot = path.resolve(root);
    var candidate = path.resolve(resolvedRoot, '.' + relative);
    if (!candidate.startsWith(resolvedRoot + path.sep)) return null;
    return candidate;
}

function isAppUrl(value) {
    try {
        var url = new URL(value);
        return url.protocol === 'korganics:' && url.hostname === 'app';
    } catch (error) { return false; }
}

function isExternalUrl(value) {
    try {
        var url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'mailto:';
    } catch (error) { return false; }
}

function isPrintBlobUrl(value) {
    return String(value).startsWith('blob:korganics://app/');
}

module.exports = { resolveAppPath: resolveAppPath, isAppUrl: isAppUrl, isExternalUrl: isExternalUrl, isPrintBlobUrl: isPrintBlobUrl };
