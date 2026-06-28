const quoteTimers = {};
const quoteIndexes = {};

export const LOADING_QUOTES = {
    orders: [
        'Every great bakery is built one order at a time.',
        'Small orders, handled well, become loyal customers.',
        'Good service starts before the bread leaves the oven.',
        'A clear order today prevents confusion tomorrow.',
        'Consistency is what turns a product into a brand.',
        'The best businesses make every customer feel remembered.',
        'Behind every order is someone waiting to be delighted.',
        'Fast is good. Accurate is better. Both is excellent.',
        'A well-managed order is the beginning of a happy customer.',
        'Great operations make great products easier to deliver.',
        'Fresh bread needs fresh focus.',
        'Every detail matters when customers trust your kitchen.',
        'Strong systems create calm workdays.',
        'The order list is not just work. It is opportunity.',
        'Serve the next customer well, and the business grows.',
        'Simple processes make busy days manageable.',
        'A beautiful product deserves a smooth delivery.',
        'Today\'s order is tomorrow\'s reputation.',
        'Quality travels through every step of the process.',
        'Organized orders create confident teams.'
    ],
    invoices: [
        'Clear invoices build clear trust.',
        'Healthy cashflow begins with organized records.',
        'A professional invoice is part of a professional brand.',
        'Good numbers help good businesses grow.',
        'Every invoice tells the story of work completed.',
        'Simple records make stronger decisions.',
        'Cashflow rewards consistency.',
        'Clean accounting creates calm leadership.',
        'The best businesses know what was sold, paid, and delivered.',
        'A clear invoice saves a future conversation.',
        'Good systems protect good relationships.',
        'Profit is easier to understand when records are clean.',
        'Organized invoices make growth less stressful.',
        'The details matter after the sale too.',
        'A strong business respects both product and paperwork.',
        'Good records turn hard work into visible progress.',
        'Every paid invoice is fuel for the next idea.',
        'Professional service continues after delivery.',
        'Clarity today prevents confusion tomorrow.',
        'A clean invoice is a quiet kind of excellence.'
    ]
};

function getQuotes(scope) {
    return LOADING_QUOTES[scope] || LOADING_QUOTES.orders;
}

function shouldReduceMotion() {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getNextQuoteIndex(scope, quoteCount) {
    var previousIndex = quoteIndexes[scope];
    if (quoteCount <= 1) {
        quoteIndexes[scope] = 0;
        return 0;
    }

    var nextIndex = Math.floor(Math.random() * quoteCount);
    if (nextIndex === previousIndex) {
        nextIndex = (nextIndex + 1) % quoteCount;
    }
    quoteIndexes[scope] = nextIndex;
    return nextIndex;
}

function setQuoteText(panel, scope) {
    var quotes = getQuotes(scope);
    var quoteElement = panel.querySelector('[data-loading-quote-text]');
    if (!quoteElement) {
        return;
    }
    quoteElement.textContent = quotes[getNextQuoteIndex(scope, quotes.length)];
}

export function renderLoadingQuotePanel(scope) {
    var quotes = getQuotes(scope);
    var firstQuote = quotes[0];
    var label = scope === 'invoices' ? 'Loading invoices' : 'Loading orders';
    return [
        '<div class="loading-skeleton loading-quote-panel" data-loading-quote-scope="' + scope + '" style="padding: var(--space-4);">',
        '    <div class="loading-quote-card" aria-live="polite">',
        '        <p class="is-visible" data-loading-quote-text>' + firstQuote + '</p>',
        '        <span class="is-visible">' + label + '</span>',
        '    </div>',
        '    <div class="skeleton-card" style="margin-bottom: var(--space-4);"></div>',
        '    <div class="skeleton-card"></div>',
        '</div>'
    ].join('');
}

export function startLoadingQuoteRotation(root, scope) {
    var panel = root ? root.querySelector('[data-loading-quote-scope="' + scope + '"]') : null;
    if (!panel) {
        return;
    }

    stopLoadingQuoteRotation(scope);
    quoteIndexes[scope] = 0;

    if (shouldReduceMotion()) {
        return;
    }

    quoteTimers[scope] = setInterval(function() {
        setQuoteText(panel, scope);
    }, 4000);
}

export function stopLoadingQuoteRotation(scope) {
    if (quoteTimers[scope]) {
        clearInterval(quoteTimers[scope]);
        delete quoteTimers[scope];
    }
}

export function stopAllLoadingQuoteRotations() {
    Object.keys(quoteTimers).forEach(function(scope) {
        stopLoadingQuoteRotation(scope);
    });
}
