import { auth } from "../core/firebase.js";
import { notificationService } from "../core/notificationService.js";
import { invoiceApprovalService } from "../services/invoiceApprovalService.js";
import icfPipeline from "../ICF/engine/pipeline.js";
import generateInvoiceApprovalLinkIntentModule from "../ICF/Intents/GenerateInvoiceApprovalLinkIntent.js";
import submitInvoiceApprovalResponseIntentModule from "../ICF/Intents/SubmitInvoiceApprovalResponseIntent.js";

function getActorId(user) {
    if (!user) {
        return 'anonymous';
    }
    return user.email || user.uid || 'anonymous';
}

function getCurrentAdminActor() {
    const user = auth.currentUser;
    return {
        id: getActorId(user),
        role: user ? 'admin' : 'anonymous'
    };
}

function getIntentErrorMessage(result, fallbackMessage) {
    if (!result) {
        return fallbackMessage;
    }
    if (result.errors && result.errors.length > 0) {
        return result.errors[0];
    }
    if (result.reason) {
        return result.reason;
    }
    if (result.message) {
        return result.message;
    }
    return fallbackMessage;
}

export const invoiceApprovalController = {
    async loadLatestApprovalLink(invoiceId) {
        try {
            return await invoiceApprovalService.getLatestApprovalLinkForInvoice(invoiceId);
        } catch (error) {
            console.warn('Could not load invoice approval link.', error);
            return null;
        }
    },

    async generateApprovalLink(invoiceId) {
        const token = invoiceApprovalService.generateSecureApprovalToken();
        const intent = generateInvoiceApprovalLinkIntentModule.createGenerateInvoiceApprovalLinkIntent(
            getCurrentAdminActor(),
            {
                invoiceId: invoiceId,
                token: token
            },
            {
                source: 'ui'
            }
        );
        const result = await icfPipeline.run(intent);

        if (!result || !result.ok) {
            const message = getIntentErrorMessage(result, 'Failed to generate approval link.');
            notificationService.error(message);
            return null;
        }

        notificationService.success('Approval link generated.');
        return result.data.approvalLink || null;
    },

    async loadCustomerReview(token) {
        return invoiceApprovalService.loadCustomerReview(token);
    },

    async submitCustomerResponse(token, responseType, customerChanges) {
        const payload = {
            token: token,
            responseType: responseType,
            notes: customerChanges && customerChanges.notes ? customerChanges.notes : '',
            modifiedItems: customerChanges && customerChanges.modifiedItems ? customerChanges.modifiedItems : []
        };
        const intent = submitInvoiceApprovalResponseIntentModule.createSubmitInvoiceApprovalResponseIntent(
            {
                id: 'customer',
                role: 'customer'
            },
            payload,
            {
                source: 'customer-review'
            }
        );
        const result = await icfPipeline.run(intent);

        if (!result || !result.ok) {
            throw new Error(getIntentErrorMessage(result, 'Could not submit approval response.'));
        }

        return result.data;
    },

    buildApprovalUrl(token) {
        return invoiceApprovalService.buildApprovalUrl(token);
    },

    getDisplayStatus(approvalLink) {
        return invoiceApprovalService.getDisplayStatus(approvalLink);
    },

    isApprovalLinkExpired(approvalLink) {
        return invoiceApprovalService.isApprovalLinkExpired(approvalLink);
    }
};
