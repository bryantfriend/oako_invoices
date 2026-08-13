import { getMillis, isArchivedRecord } from "./orderRecordHelpers.js";
import { getReturnState } from "./returnStatus.js";

var REVENUE_STATUSES = ["confirmed", "fulfilled", "paid", "returned"];
var OUTSTANDING_STATUSES = ["confirmed", "fulfilled"];

function safeNumber(value, fallback) {
    var number = Number(value);
    if (Number.isFinite(number)) {
        return number;
    }
    return fallback || 0;
}

function normalizeLifecycleStatus(status) {
    var normalized = String(status || "").trim().toLowerCase();
    var aliases = {
        approved: "confirmed",
        submitted: "pending",
        fullfilled: "fulfilled",
        completed: "fulfilled",
        completed_pending_sync: "fulfilled",
        canceled: "cancelled",
        partially_returned: "returned",
        partial_return: "returned",
        fully_returned: "returned",
        return_pending: "returned"
    };

    return aliases[normalized] || normalized || "unknown";
}

function getLifecycleStatus(order, warnings) {
    var source = order || {};
    var storedStatus = String(source.status || "").trim().toLowerCase();

    if (isArchivedRecord(source)) {
        if (source.previousStatus) {
            return normalizeLifecycleStatus(source.previousStatus);
        }
        if (storedStatus && storedStatus !== "archived") {
            return normalizeLifecycleStatus(storedStatus);
        }
        warnings.push("missing_previous_status");
        return "unknown";
    }

    if (!storedStatus) {
        warnings.push("missing_status");
    }
    return normalizeLifecycleStatus(storedStatus);
}

function getAnalyticsDate(order, warnings) {
    var source = order || {};
    var millis = getMillis(source.orderDate) || getMillis(source.createdAt);

    if (!millis) {
        warnings.push("missing_sales_date");
        return null;
    }
    return new Date(millis);
}

function getGrossAmount(order, warnings) {
    var source = order || {};
    if (source.totalAmount === undefined || source.totalAmount === null || source.totalAmount === "") {
        warnings.push("invalid_total_amount");
        return 0;
    }
    var amount = Number(source.totalAmount);

    if (!Number.isFinite(amount)) {
        warnings.push("invalid_total_amount");
        return 0;
    }
    if (amount < 0) {
        warnings.push("negative_total_amount");
        return 0;
    }
    return amount;
}

function getItemReturnedAmount(item) {
    var source = item || {};
    if (source.returnedAmount !== undefined && source.returnedAmount !== null && source.returnedAmount !== "") {
        return Math.max(0, safeNumber(source.returnedAmount, 0));
    }

    var returnedQuantity = safeNumber(
        source.returnedQuantity !== undefined ? source.returnedQuantity : source.returnQuantity,
        0
    );
    var unitPrice = safeNumber(
        source.unitPrice !== undefined ? source.unitPrice : source.price,
        0
    );
    return Math.max(0, returnedQuantity * unitPrice);
}

function getReturnedAmount(order, grossAmount, warnings) {
    var source = order || {};
    var summary = source.returnSummary || {};
    var adjustedAmount = Number(summary.adjustedTotalAmount);
    var returnedAmount = 0;

    if (summary.adjustedTotalAmount !== undefined && summary.adjustedTotalAmount !== null && summary.adjustedTotalAmount !== "" && Number.isFinite(adjustedAmount)) {
        returnedAmount = Math.max(0, grossAmount - adjustedAmount);
    } else if (summary.totalReturnedAmount !== undefined && summary.totalReturnedAmount !== null && summary.totalReturnedAmount !== "") {
        returnedAmount = Math.max(0, safeNumber(summary.totalReturnedAmount, 0));
    } else {
        returnedAmount = (Array.isArray(source.items) ? source.items : []).reduce(function(total, item) {
            return total + getItemReturnedAmount(item);
        }, 0);
    }

    var returnState = getReturnState(source);
    if (returnState === "full" && returnedAmount <= 0 && grossAmount > 0) {
        returnedAmount = grossAmount;
    } else if (returnState !== "none" && returnedAmount <= 0 && grossAmount > 0) {
        warnings.push("missing_return_amount");
    }

    return Math.min(grossAmount, returnedAmount);
}

function getExclusionReason(lifecycleStatus, analyticsDate) {
    if (!analyticsDate) {
        return "missing_sales_date";
    }
    if (lifecycleStatus === "draft") {
        return "draft";
    }
    if (lifecycleStatus === "pending") {
        return "pending";
    }
    if (lifecycleStatus === "cancelled") {
        return "cancelled";
    }
    if (REVENUE_STATUSES.indexOf(lifecycleStatus) === -1) {
        return "unknown_status";
    }
    return "";
}

function buildOrderAnalyticsProjection(order) {
    var source = order || {};
    var warnings = [];
    var lifecycleStatus = getLifecycleStatus(source, warnings);
    var analyticsDate = getAnalyticsDate(source, warnings);
    var grossAmount = getGrossAmount(source, warnings);
    var returnedAmount = getReturnedAmount(source, grossAmount, warnings);
    var netAmount = Math.max(0, grossAmount - returnedAmount);
    var exclusionReason = getExclusionReason(lifecycleStatus, analyticsDate);

    return {
        recordId: source.id || source.orderId || "",
        isArchived: isArchivedRecord(source),
        lifecycleStatus: lifecycleStatus,
        analyticsDate: analyticsDate,
        analyticsMillis: analyticsDate ? analyticsDate.getTime() : 0,
        grossAmount: grossAmount,
        returnedAmount: returnedAmount,
        netAmount: netAmount,
        revenueEligible: exclusionReason === "",
        outstandingEligible: exclusionReason === "" && OUTSTANDING_STATUSES.indexOf(lifecycleStatus) !== -1,
        exclusionReason: exclusionReason,
        dataWarnings: warnings,
        source: source
    };
}

function buildOrderAnalyticsProjections(orders) {
    return (Array.isArray(orders) ? orders : []).map(function(order) {
        return buildOrderAnalyticsProjection(order);
    });
}

export {
    buildOrderAnalyticsProjection,
    buildOrderAnalyticsProjections,
    normalizeLifecycleStatus
};
