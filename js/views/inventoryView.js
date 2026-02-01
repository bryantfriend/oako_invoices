import { layoutView } from "./layoutView.js";
import { inventoryController } from "../controllers/inventoryController.js";
import { createCard } from "../components/card.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { Modal } from "../components/modal.js";

export const renderInventory = async () => {
    layoutView.render();
    layoutView.updateTitle("Inventory Tracking");

    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    const today = new Date().toISOString().split('T')[0];
    const data = await inventoryController.loadInventoryData(today);

    // If no data is initialized (no total baked set for any item), show initialization modal
    const hasData = data.some(cat => cat.products.some(p => p.totalBaked > 0 || p.locked));

    if (!hasData && data.length > 0) {
        showInitializationModal(today, data);
        return;
    }

    renderMainView(container, today, data);
};

const renderMainView = (container, date, categories) => {
    container.innerHTML = `
        <div class="animate-fade-in" style="display: flex; flex-direction: column; gap: var(--space-6);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: var(--space-4);">
                    <div style="font-size: 14px; color: var(--color-gray-500);">
                        Showing inventory for <strong>${date}</strong>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button id="lock-all-btn" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 4px 10px;">🔒 Lock All</button>
                        <button id="unlock-all-btn" class="btn btn-ghost btn-sm" style="font-size: 11px; padding: 4px 10px; color: var(--color-gray-500);">🔓 Unlock All</button>
                    </div>
                </div>
                <button id="refresh-inventory" class="btn btn-ghost btn-sm">🔄 Refresh Data</button>
            </div>

            ${categories.map(cat => `
                <div class="inventory-category-group">
                    <h3 style="font-size: 14px; font-weight: 700; color: var(--color-primary-700); margin-bottom: 12px; padding-left: 4px; border-left: 4px solid var(--color-primary-500);">
                        ${cat.name.toUpperCase()}
                    </h3>
                    ${createCard({
        padding: '0',
        content: `
                            <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                                <table style="width: 100%; border-collapse: collapse; font-size: 13px; min-width: 500px;">
                                    <thead style="background: var(--color-gray-50); border-bottom: 1px solid var(--color-gray-200);">
                                        <tr>
                                            <th style="text-align: left; padding: 12px 16px;">Product Name</th>
                                            <th style="text-align: center; padding: 12px 16px; width: 80px;">Sold</th>
                                            <th style="text-align: center; padding: 12px 16px; width: 120px;">Total Baked</th>
                                            <th style="text-align: center; padding: 12px 16px; width: 80px;">Left</th>
                                            <th style="text-align: center; padding: 12px 16px; width: 60px;">Lock</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${cat.products.map(p => {
            const isOversold = p.left < 0;
            const rowStyle = isOversold ? 'background: var(--color-error-bg);' : '';
            return `
                                                <tr style="border-bottom: 1px solid var(--color-gray-100); ${rowStyle}">
                                                    <td style="padding: 12px 16px;">
                                                        <div style="display: flex; align-items: center; gap: var(--space-3);">
                                                            <div style="width: 40px; height: 40px; border-radius: 6px; overflow: hidden; background: var(--color-gray-100); flex-shrink: 0; border: 1px solid var(--color-gray-200);">
                                                                ${p.imageUrl ? `<img src="${p.imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-gray-400); font-size: 18px;">🥖</div>'}
                                                            </div>
                                                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                                                <strong style="color: var(--color-gray-900); white-space: nowrap;">${p.displayName || p.name}</strong>
                                                                ${isOversold ? `<span style="font-size: 11px; color: var(--color-error); font-weight: 600;">⚠️ Oversold</span>` : ''}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style="text-align: center; padding: 12px 16px;">
                                                        <span style="font-weight: 600; color: var(--color-gray-900);">${p.sold}</span>
                                                    </td>
                                                    <td style="text-align: center; padding: 12px 16px;">
                                                        <input type="number" 
                                                            class="baked-input" 
                                                            data-id="${p.id}" 
                                                            value="${p.totalBaked}" 
                                                            ${p.locked ? 'disabled' : ''}
                                                            style="width: 70px; text-align: center; padding: 4px; border: 1px solid ${p.locked ? 'transparent' : 'var(--color-gray-200)'}; border-radius: 4px; background: ${p.locked ? 'transparent' : 'white'}; font-weight: ${p.locked ? '700' : '400'};"
                                                        >
                                                    </td>
                                                    <td style="text-align: center; padding: 12px 16px;">
                                                        <span style="font-weight: 700; color: ${isOversold ? 'var(--color-error)' : 'var(--color-success)'};">
                                                            ${p.left}
                                                        </span>
                                                    </td>
                                                    <td style="text-align: center; padding: 12px 16px;">
                                                        <button class="lock-toggle btn-icon" data-id="${p.id}" data-locked="${p.locked}">
                                                            ${p.locked ? '🔒' : '🔓'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            `;
        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `
    })}
                </div>
            `).join('')}
        </div>
    `;

    // Attach Events
    container.querySelectorAll('.baked-input').forEach(input => {
        input.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            const val = parseInt(e.target.value) || 0;
            await inventoryController.saveProduction(date, id, val, false);
            renderInventory(); // Refresh
        });
    });

    container.querySelectorAll('.lock-toggle').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = btn.dataset.id;
            const isLocked = btn.dataset.locked === 'true';
            const input = container.querySelector(`.baked-input[data-id="${id}"]`);
            const val = parseInt(input.value) || 0;

            await inventoryController.saveProduction(date, id, val, !isLocked);
            renderInventory(); // Refresh
        });
    });

    document.getElementById('refresh-inventory')?.addEventListener('click', () => renderInventory());

    document.getElementById('lock-all-btn')?.addEventListener('click', async () => {
        await inventoryController.bulkUpdateLockStatus(date, categories, true);
        renderInventory();
    });

    document.getElementById('unlock-all-btn')?.addEventListener('click', async () => {
        await inventoryController.bulkUpdateLockStatus(date, categories, false);
        renderInventory();
    });
};

const showInitializationModal = (date, categories) => {
    const modal = new Modal({
        title: `Initialize Inventory: ${date}`,
        content: `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <p style="font-size: 14px; color: var(--color-gray-600);">
                    Today's inventory is empty. Please enter your baked totals or import from yesterday.
                </p>
                <div style="max-height: 400px; overflow: auto; border: 1px solid var(--color-gray-200); border-radius: 8px; -webkit-overflow-scrolling: touch;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px; min-width: 320px;">
                        <thead style="background: var(--color-gray-50); position: sticky; top: 0; z-index: 1;">
                            <tr>
                                <th style="text-align: left; padding: 8px 12px;">Product</th>
                                <th style="text-align: center; padding: 8px 12px; width: 100px;">Total Baked</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${categories.map(cat => `
                                <tr style="background: #f8fafc;"><td colspan="2" style="padding: 4px 12px; font-weight: 700; font-size: 11px; color: var(--color-gray-500);">${cat.name.toUpperCase()}</td></tr>
                                ${cat.products.map(p => `
                                    <tr style="border-bottom: 1px solid var(--color-gray-100);">
                                        <td style="padding: 8px 12px;">
                                            <div style="display: flex; align-items: center; gap: 12px;">
                                                <div style="width: 32px; height: 32px; border-radius: 4px; overflow: hidden; background: #f1f5f9; flex-shrink: 0;">
                                                    ${p.imageUrl ? `<img src="${p.imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : '<div style="display: flex; align-items: center; justify-content: center; height: 100%; font-size: 14px;">🥖</div>'}
                                                </div>
                                                <span style="font-weight: 600; white-space: nowrap;">${p.displayName || p.name}</span>
                                            </div>
                                        </td>
                                        <td style="padding: 8px 12px; text-align: center;">
                                            <input type="number" class="init-baked-input" data-id="${p.id}" value="0" style="width: 60px; text-align: center; border: 1px solid #ddd; border-radius: 4px; padding: 4px;">
                                        </td>
                                    </tr>
                                `).join('')}
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button id="confirm-init-btn" class="btn btn-primary" style="width: 100%;">Confirm & Show Table</button>
                    <button id="import-yesterday-btn" class="btn btn-secondary" style="width: 100%;">📥 Import Yesterday</button>
                </div>
            </div>
        `,
        footer: false
    });

    modal.open();

    document.getElementById('import-yesterday-btn').addEventListener('click', async () => {
        const success = await inventoryController.importYesterday(date);
        if (success) {
            modal.close();
            renderInventory();
        }
    });

    document.getElementById('confirm-init-btn').addEventListener('click', async () => {
        const inputs = document.querySelectorAll('.init-baked-input');
        const promises = Array.from(inputs).map(input => {
            const val = parseInt(input.value) || 0;
            if (val > 0) {
                return inventoryController.saveProduction(date, input.dataset.id, val, false);
            }
            return Promise.resolve();
        });

        await Promise.all(promises);
        modal.close();
        renderInventory();
    });
};
