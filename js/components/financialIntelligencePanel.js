import { formatCurrency } from "../core/formatters.js";
import { calculateProfitScenario } from "../services/financialIntelligenceService.js";

function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderSmallMetric(label, value) {
    return `
        <div style="padding: 12px; border-radius: 12px; background: var(--color-gray-50);">
            <span style="display: block; color: var(--color-gray-500); font-size: 11px; text-transform: uppercase; letter-spacing: .05em;">${escapeHtml(label)}</span>
            <strong style="display: block; margin-top: 4px; color: var(--color-gray-900);">${escapeHtml(value)}</strong>
        </div>
    `;
}

function renderProfitability(profitability) {
    var source = profitability || {};
    var basisLabels = {
        actual: 'Recorded/catalog product costs',
        fallback: 'Fallback COGS estimate',
        blended: 'Recorded/catalog + fallback costs',
        missing: 'Cost basis required'
    };
    var hasSales = Number(source.totalUnits) > 0;
    var headline = source.complete
        ? formatCurrency(source.grossProfit)
        : (hasSales ? 'Add cost basis' : 'No sales yet');
    var supporting = source.complete
        ? String(source.marginPercent) + '% gross margin'
        : (hasSales ? 'Profit is hidden until every sold unit has a cost.' : 'Confirmed sales in this period will appear here.');

    return `
        <article style="padding: 18px; border: 1px solid var(--color-gray-200); border-radius: 16px; background: #fff;">
            <div style="display: flex; justify-content: space-between; gap: 12px; align-items: start;">
                <div>
                    <span style="font-size: 12px; color: var(--color-gray-500);">Gross profit</span>
                    <div style="font-size: 24px; font-weight: 900; margin-top: 4px; color: ${source.complete ? '#047857' : '#b45309'};">${escapeHtml(headline)}</div>
                    <p style="font-size: 12px; color: var(--color-gray-500); margin: 4px 0 0;">${escapeHtml(supporting)}</p>
                </div>
                <span class="metric-pill">${escapeHtml(String(source.coveragePercent || 0))}% cost coverage</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 14px;">
                ${renderSmallMetric('Net revenue', formatCurrency(source.netRevenue))}
                ${renderSmallMetric('COGS', source.complete ? formatCurrency(source.costOfGoods) : (hasSales ? 'Incomplete' : '—'))}
            </div>
            <p style="font-size: 11px; color: var(--color-gray-500); margin: 10px 0 0;">
                ${escapeHtml(basisLabels[source.costBasis] || basisLabels.missing)}
                ${source.fallbackCostPercent > 0 ? ' · ' + escapeHtml(String(source.fallbackCostPercent)) + '% fallback' : ''}
            </p>
        </article>
    `;
}

function renderForecast(forecast) {
    var source = forecast || {};
    var buckets = Array.isArray(source.buckets) ? source.buckets : [];
    return `
        <article style="padding: 18px; border: 1px solid var(--color-gray-200); border-radius: 16px; background: #fff;">
            <div style="display: flex; justify-content: space-between; gap: 12px; align-items: start;">
                <div>
                    <span style="font-size: 12px; color: var(--color-gray-500);">Expected cash · 30 days</span>
                    <div style="font-size: 24px; font-weight: 900; margin-top: 4px;">${escapeHtml(formatCurrency(source.expectedCash))}</div>
                </div>
                <span class="metric-pill">${escapeHtml(source.confidence || 'insufficient')} confidence</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 14px;">
                ${renderSmallMetric('Recent collections', formatCurrency(source.historicalRunRate))}
                ${renderSmallMetric('Weighted receivables', formatCurrency(source.weightedOutstanding))}
            </div>
            <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 10px;">
                ${buckets.map(function(bucket) {
                    return '<div style="font-size: 10px; color: var(--color-gray-500); text-align: center;"><span style="display:block;">' +
                        escapeHtml(bucket.label) + '</span><strong style="display:block;color:var(--color-gray-800);margin-top:3px;">' +
                        escapeHtml(formatCurrency(bucket.expectedCash)) + '</strong></div>';
                }).join('')}
            </div>
        </article>
    `;
}

function renderScenarioPlanner(profitability) {
    var source = profitability || {};
    if (!source.complete) {
        var hasSales = Number(source.totalUnits) > 0;
        return `
            <article style="padding: 18px; border: 1px solid var(--color-gray-200); border-radius: 16px; background: #fff;">
                <span style="font-size: 12px; color: var(--color-gray-500);">Scenario planner</span>
                <h3 style="margin: 5px 0 6px; font-size: 17px;">${hasSales ? 'Set a cost basis first' : 'No sales to model yet'}</h3>
                <p style="font-size: 12px; color: var(--color-gray-500); margin: 0;">${hasSales ? 'Add unit costs to products or set a fallback COGS percentage in Settings to model price and cost changes.' : 'Once confirmed sales exist, you can test price and cost changes here.'}</p>
            </article>
        `;
    }

    return `
        <article
            id="financial-scenario-planner"
            data-net-revenue="${escapeHtml(source.netRevenue)}"
            data-cost-of-goods="${escapeHtml(source.costOfGoods)}"
            style="padding: 18px; border: 1px solid var(--color-gray-200); border-radius: 16px; background: #fff;"
        >
            <span style="font-size: 12px; color: var(--color-gray-500);">Scenario planner</span>
            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 10px;">
                <label style="font-size: 11px; color: var(--color-gray-500);">Price change %
                    <input id="scenario-price-change" type="number" value="0" min="-100" max="500" step="1" class="input" style="margin-top: 4px;">
                </label>
                <label style="font-size: 11px; color: var(--color-gray-500);">Cost change %
                    <input id="scenario-cost-change" type="number" value="0" min="-100" max="500" step="1" class="input" style="margin-top: 4px;">
                </label>
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px;">
                ${renderSmallMetric('Scenario profit', '<span id="scenario-profit-output">' + formatCurrency(source.grossProfit) + '</span>')}
                ${renderSmallMetric('Scenario margin', '<span id="scenario-margin-output">' + String(source.marginPercent) + '%</span>')}
            </div>
        </article>
    `.replace(/&lt;span id=&quot;(scenario-(?:profit|margin)-output)&quot;&gt;(.*?)&lt;\/span&gt;/g, '<span id="$1">$2</span>');
}

function renderProductMargins(productMargins) {
    var rows = Array.isArray(productMargins) ? productMargins.slice(0, 5) : [];
    return `
        <article style="padding: 18px; border: 1px solid var(--color-gray-200); border-radius: 16px; background: #fff;">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
                <h3 style="margin:0;font-size:15px;">Product margins</h3>
                <span class="metric-pill">Top ${rows.length}</span>
            </div>
            <div style="margin-top: 10px;">
                ${rows.length ? rows.map(function(row) {
                    return `
                        <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:9px 0;border-bottom:1px solid var(--color-gray-100);font-size:12px;">
                            <div style="min-width:0;">
                                <strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(row.productName)}</strong>
                                <span style="color:var(--color-gray-500);">${escapeHtml(row.units)} units · ${escapeHtml(formatCurrency(row.revenue))} revenue</span>
                            </div>
                            <div style="text-align:right;">
                                <strong style="display:block;color:${row.complete ? '#047857' : '#b45309'};">${row.complete ? escapeHtml(String(row.marginPercent)) + '%' : 'Incomplete'}</strong>
                                <span style="color:var(--color-gray-500);">${escapeHtml(String(row.coveragePercent))}% covered</span>
                            </div>
                        </div>
                    `;
                }).join('') : '<div class="empty-state compact">No confirmed product sales in this range.</div>'}
            </div>
        </article>
    `;
}

function renderCustomerValue(customers) {
    var rows = Array.isArray(customers) ? customers.slice(0, 5) : [];
    return `
        <article style="padding: 18px; border: 1px solid var(--color-gray-200); border-radius: 16px; background: #fff;">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
                <h3 style="margin:0;font-size:15px;">Customer lifetime value & reliability</h3>
                <span class="metric-pill">Top ${rows.length}</span>
            </div>
            <div style="margin-top: 10px;">
                ${rows.length ? rows.map(function(row) {
                    return `
                        <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:9px 0;border-bottom:1px solid var(--color-gray-100);font-size:12px;">
                            <div style="min-width:0;">
                                <strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(row.customerName)}</strong>
                                <span style="color:var(--color-gray-500);">${escapeHtml(row.reliabilityLabel)} · ${escapeHtml(row.reliabilityScore)}/100 · ${escapeHtml(row.orderCount)} orders</span>
                            </div>
                            <div style="text-align:right;">
                                <strong style="display:block;">${escapeHtml(formatCurrency(row.totalValue))}</strong>
                                <span style="color:var(--color-gray-500);">${escapeHtml(formatCurrency(row.outstandingValue))} due</span>
                            </div>
                        </div>
                    `;
                }).join('') : '<div class="empty-state compact">No confirmed customer history in this range.</div>'}
            </div>
        </article>
    `;
}

function renderRisks(risks) {
    var rows = Array.isArray(risks) ? risks.slice(0, 5) : [];
    return `
        <article style="padding: 18px; border: 1px solid var(--color-gray-200); border-radius: 16px; background: #fff;">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
                <h3 style="margin:0;font-size:15px;">Collection risk</h3>
                <span class="metric-pill">${rows.length} flagged</span>
            </div>
            <div style="margin-top: 10px;">
                ${rows.length ? rows.map(function(row) {
                    var color = row.riskLevel === 'high' ? '#b91c1c' : (row.riskLevel === 'medium' ? '#b45309' : '#047857');
                    return `
                        <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:9px 0;border-bottom:1px solid var(--color-gray-100);font-size:12px;">
                            <div style="min-width:0;">
                                <strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(row.customerName)}</strong>
                                <span style="color:${color};text-transform:capitalize;">${escapeHtml(row.riskLevel)} risk · ${row.agingDays > 0 ? escapeHtml(row.agingDays) + ' days overdue' : 'not overdue'}</span>
                            </div>
                            <strong>${escapeHtml(formatCurrency(row.amount))}</strong>
                        </div>
                    `;
                }).join('') : '<div class="empty-state compact">No unpaid orders are currently at risk.</div>'}
            </div>
        </article>
    `;
}

function renderInsights(insights) {
    var rows = Array.isArray(insights) ? insights : [];
    return `
        <article style="padding: 18px; border: 1px solid var(--color-gray-200); border-radius: 16px; background: #fff;">
            <h3 style="margin:0;font-size:15px;">What changed?</h3>
            <div style="display:grid;gap:8px;margin-top:10px;">
                ${rows.length ? rows.map(function(insight) {
                    var color = insight.tone === 'positive' ? '#047857' : (insight.tone === 'warning' ? '#b45309' : '#475569');
                    return '<div style="padding:10px 12px;border-radius:10px;background:var(--color-gray-50);border-left:3px solid ' +
                        color + ';font-size:12px;color:var(--color-gray-700);">' + escapeHtml(insight.text) + '</div>';
                }).join('') : '<div class="empty-state compact">More history is needed for period-over-period insights.</div>'}
            </div>
        </article>
    `;
}

export function renderFinancialIntelligencePanel(intelligence) {
    var source = intelligence || {};
    return `
        <section id="financial-intelligence-panel" class="dashboard-card" style="margin-top: var(--space-5);">
            <div class="dashboard-card-header">
                <div>
                    <span class="dashboard-eyebrow">Financial Intelligence</span>
                    <h2 style="margin-top:4px;">Profitability & cash-flow command center</h2>
                    <p>Cost-aware margin, collection forecast, customer quality, and actionable changes for the selected period.</p>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
                ${renderProfitability(source.profitability)}
                ${renderForecast(source.cashFlowForecast)}
                ${renderScenarioPlanner(source.profitability)}
                ${renderInsights(source.insights)}
                ${renderProductMargins(source.productMargins)}
                ${renderCustomerValue(source.customerValue)}
                ${renderRisks(source.risks)}
            </div>
        </section>
    `;
}

export function attachFinancialIntelligencePanel() {
    var planner = document.getElementById('financial-scenario-planner');
    var priceInput = document.getElementById('scenario-price-change');
    var costInput = document.getElementById('scenario-cost-change');
    var profitOutput = document.getElementById('scenario-profit-output');
    var marginOutput = document.getElementById('scenario-margin-output');
    if (!planner || !priceInput || !costInput || !profitOutput || !marginOutput) {
        return;
    }

    function updateScenario() {
        var base = {
            netRevenue: Number(planner.dataset.netRevenue) || 0,
            costOfGoods: Number(planner.dataset.costOfGoods) || 0
        };
        var scenario = calculateProfitScenario(base, priceInput.value, costInput.value);
        profitOutput.textContent = formatCurrency(scenario.grossProfit);
        marginOutput.textContent = String(scenario.marginPercent) + '%';
    }

    priceInput.addEventListener('input', updateScenario);
    costInput.addEventListener('input', updateScenario);
}
