import { layoutView } from "./layoutView.js";
import { settingsController } from "../controllers/settingsController.js";
import { createCard } from "../components/card.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";

export const renderSettings = async () => {
    layoutView.render();
    layoutView.updateTitle("Invoice Settings");

    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    const settings = await settingsController.loadSettings() || {};

    container.innerHTML = `
        <div class="animate-slide-up" style="max-width: 800px; margin: 0 auto;">
            <form id="settings-form">
                ${createCard({
        title: 'Business Information',
        content: `
                        <div class="input-group" style="display: flex; gap: var(--space-6); align-items: start;">
                            <div style="flex: 1;">
                                <label>Business Logo</label>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    <input type="file" id="logo-upload" accept="image/*" style="display: none;">
                                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('logo-upload').click()">
                                        📤 Choose New Logo
                                    </button>
                                    <input type="hidden" name="logoUrl" id="logo-url-input" value="${settings.logoUrl || ''}">
                                    <small style="color: var(--color-gray-500);">Max 5MB. Recommended: 800x400 transparent PNG.</small>
                                </div>
                            </div>
                            <div id="logo-preview-container" style="width: 200px; height: 100px; border: 2px dashed var(--color-gray-200); border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff;">
                                ${settings.logoUrl ? `<img src="${settings.logoUrl}" style="max-width: 100%; max-height: 100%;">` : '<span style="color: var(--color-gray-400); font-size: 12px;">No Logo</span>'}
                            </div>
                        </div>

                        <div class="input-group">
                            <label>Company Display Name</label>
                            <input type="text" name="companyName" value="${settings.companyName || 'Kyrgyz Organics'}" required>
                        </div>
                        <div class="input-group">
                            <label>Business Address</label>
                            <textarea name="address" rows="2">${settings.address || ''}</textarea>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
                            <div class="input-group">
                                <label>Phone Number</label>
                                <input type="tel" name="phone" value="${settings.phone || ''}">
                            </div>
                            <div class="input-group">
                                <label>Website</label>
                                <input type="text" name="website" value="${settings.website || ''}">
                            </div>
                        </div>
                    `
    })}

                ${createCard({
        title: 'Financial & Payment Settings',
        content: `
                        <div class="input-group">
                            <label>Default Tax Rate (%)</label>
                            <input type="number" name="defaultTaxRate" value="${settings.defaultTaxRate || 10}" step="0.1" style="width: 120px;">
                        </div>
                        <div class="input-group">
                            <label>Bank Account / Payment Terms</label>
                            <textarea name="bankInfo" rows="4" placeholder="Bank name, Account #, SWIFT...">${settings.bankInfo || ''}</textarea>
                        </div>
                        <div class="input-group">
                            <label>QR Code Content (URL or Payment ID)</label>
                            <input type="text" name="qrText" value="${settings.qrText || ''}" placeholder="Scan to pay link...">
                            <small style="color: var(--color-gray-500);">This will be encoded into the QR code on the invoice.</small>
                        </div>
                        <div class="input-group">
                            <label>Invoice Footer Text</label>
                            <input type="text" name="footerText" value="${settings.footerText || 'Thanks for supporting sustainable agriculture!'}" placeholder="Message at the bottom...">
                        </div>
                    `
    })}

                <div style="display: flex; justify-content: flex-end; margin-top: var(--space-6); gap: var(--space-4); align-items: center;">
                    <div id="save-status" style="font-size: 14px; color: var(--color-gray-500);"></div>
                    <button type="submit" class="btn btn-primary">Save All Settings</button>
                </div>
            </form>
        </div>
    `;

    // Handle Logo Upload
    const logoInput = document.getElementById('logo-upload');
    const logoUrlInput = document.getElementById('logo-url-input');
    const previewContainer = document.getElementById('logo-preview-container');

    logoInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const saveStatus = document.getElementById('save-status');

        try {
            previewContainer.innerHTML = '<div class="loader-sm"></div>';
            saveStatus.textContent = "Uploading logo...";

            const url = await settingsController.handleUploadLogo(file);
            logoUrlInput.value = url;
            previewContainer.innerHTML = `<img src="${url}" style="max-width: 100%; max-height: 100%; animation: fade-in 0.3s ease;">`;

            // Auto-save the logo URL to settings immediately
            saveStatus.textContent = "Saving updated logo...";
            const formData = new FormData(document.getElementById('settings-form'));
            const data = Object.fromEntries(formData.entries());
            data.defaultTaxRate = parseFloat(data.defaultTaxRate) || 0;

            await settingsController.updateSettings(data);
            saveStatus.textContent = "Logo saved!";
            setTimeout(() => { if (saveStatus) saveStatus.textContent = ""; }, 3000);

        } catch (error) {
            previewContainer.innerHTML = '<span style="color: var(--color-danger-500); font-size: 12px;">Failed</span>';
            saveStatus.textContent = "Upload failed";
        }
    });

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveStatus = document.getElementById('save-status');
        saveStatus.textContent = "Saving...";

        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.defaultTaxRate = parseFloat(data.defaultTaxRate) || 0;

        const success = await settingsController.updateSettings(data);
        saveStatus.textContent = success ? "Saved Successfully" : "Error Saving";
        setTimeout(() => { if (saveStatus) saveStatus.textContent = ""; }, 3000);
    });
};
