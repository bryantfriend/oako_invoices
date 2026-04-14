import { layoutView } from "./layoutView.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { gamificationService } from "../services/gamificationService.js";

export const renderProfile = async () => {
    layoutView.render();
    layoutView.updateTitle("Profile");

    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    const [profile, badges] = await Promise.all([
        gamificationService.getProfile(),
        Promise.resolve(gamificationService.getBadgeDefinitions())
    ]);

    if (!profile) {
        container.innerHTML = `<div style="padding: 32px; text-align: center;">Please log in to view your profile.</div>`;
        return;
    }

    const unlocked = new Set(profile.badges || []);
    const level = Math.floor((profile.xp || 0) / 100) + 1;
    const levelProgress = (profile.xp || 0) % 100;

    container.innerHTML = `
        <div class="animate-fade-in" style="display: flex; flex-direction: column; gap: 18px; max-width: 1180px; margin: 0 auto; width: 100%;">
            <div style="
                background: linear-gradient(135deg, #1e3318 0%, #0f766e 52%, #f59e0b 140%);
                color: white;
                border-radius: 24px;
                padding: 26px;
                display: grid;
                grid-template-columns: auto 1fr auto;
                gap: 22px;
                align-items: center;
                box-shadow: 0 24px 70px rgba(15, 23, 42, 0.18);
            ">
                <div style="width: 104px; height: 104px; border-radius: 28px; overflow: hidden; background: rgba(255,255,255,0.16); border: 3px solid rgba(255,255,255,0.28); display: flex; align-items: center; justify-content: center; font-size: 42px;">
                    ${profile.photoDataUrl ? `<img src="${profile.photoDataUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : (profile.email || 'A').charAt(0).toUpperCase()}
                </div>

                <div>
                    <div style="font-size: 13px; opacity: 0.75; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;">Team Profile</div>
                    <h2 style="font-size: 30px; margin: 3px 0 4px 0; font-weight: 900;">${profile.displayName || profile.email}</h2>
                    <div style="font-size: 13px; opacity: 0.8;">${profile.email}</div>
                    <div style="margin-top: 14px; max-width: 420px;">
                        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 800; margin-bottom: 6px;">
                            <span>Level ${level}</span>
                            <span>${profile.xp || 0} XP</span>
                        </div>
                        <div style="height: 10px; background: rgba(255,255,255,0.18); border-radius: 999px; overflow: hidden;">
                            <div style="width: ${levelProgress}%; height: 100%; background: linear-gradient(90deg, #fef3c7, #f59e0b); border-radius: 999px;"></div>
                        </div>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 8px; min-width: 180px;">
                    <div style="background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.18); padding: 12px; border-radius: 16px;">
                        <div style="font-size: 11px; opacity: 0.72; text-transform: uppercase; font-weight: 800;">Badges</div>
                        <div style="font-size: 26px; font-weight: 900;">${unlocked.size} / ${badges.length}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.18); padding: 12px; border-radius: 16px;">
                        <div style="font-size: 11px; opacity: 0.72; text-transform: uppercase; font-weight: 800;">Invoices</div>
                        <div style="font-size: 26px; font-weight: 900;">${profile.actions?.invoicesCreated || 0}</div>
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: 18px; align-items: start;">
                <form id="profile-form" class="card" style="padding: 18px; display: flex; flex-direction: column; gap: 14px;">
                    <h3 style="font-size: 15px; font-weight: 800; margin: 0;">Profile Settings</h3>
                    <div class="input-group">
                        <label>Display Name</label>
                        <input type="text" id="profile-display-name" value="${profile.displayName || ''}" placeholder="Your name">
                    </div>
                    <div class="input-group">
                        <label>Profile Picture</label>
                        <input type="file" id="profile-photo-input" accept="image/*">
                        <small style="color: var(--color-gray-500);">Images are resized and saved to your user profile.</small>
                    </div>
                    <button class="btn btn-primary" type="submit">Save Profile</button>
                    <div id="profile-save-status" style="font-size: 12px; color: var(--color-gray-500);"></div>
                </form>

                <div style="display: flex; flex-direction: column; gap: 18px;">
                    <div class="card" style="padding: 18px;">
                        <h3 style="font-size: 15px; font-weight: 800; margin: 0 0 14px 0;">Activity</h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
                            ${renderStat("Orders Created", profile.actions?.ordersCreated || 0)}
                            ${renderStat("Invoices Created", profile.actions?.invoicesCreated || 0)}
                            ${renderStat("Invoices Printed", profile.actions?.invoicesPrinted || 0)}
                            ${renderStat("Orders Fulfilled", profile.actions?.ordersFulfilled || 0)}
                            ${renderStat("Orders Paid", profile.actions?.ordersPaid || 0)}
                            ${renderStat("Customers Added", profile.actions?.customersCreated || 0)}
                            ${renderStat("Orders Archived", profile.actions?.ordersArchived || 0)}
                        </div>
                    </div>

                    <div class="card" style="padding: 18px;">
                        <h3 style="font-size: 15px; font-weight: 800; margin: 0 0 14px 0;">Badges</h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px;">
                            ${badges.map(badge => renderBadge(badge, unlocked.has(badge.id))).join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('profile-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const status = document.getElementById('profile-save-status');
        status.textContent = "Saving...";

        const file = document.getElementById('profile-photo-input').files[0];
        const updates = {
            displayName: document.getElementById('profile-display-name').value.trim() || profile.email
        };

        if (file) {
            updates.photoDataUrl = await resizeImageToDataUrl(file);
        }

        await gamificationService.updateProfile(updates);
        await gamificationService.awardAction('profileUpdated');
        status.textContent = "Profile saved.";
        setTimeout(() => renderProfile(), 700);
    });
};

const renderStat = (label, value) => `
    <div style="background: var(--color-gray-50); border: 1px solid var(--color-gray-100); border-radius: 14px; padding: 12px;">
        <div style="font-size: 11px; color: var(--color-gray-500); font-weight: 800; text-transform: uppercase;">${label}</div>
        <div style="font-size: 24px; color: var(--color-gray-900); font-weight: 900; margin-top: 4px;">${value}</div>
    </div>
`;

const renderBadge = (badge, isUnlocked) => `
    <div style="
        border: 1px solid ${isUnlocked ? '#bbf7d0' : 'var(--color-gray-200)'};
        background: ${isUnlocked ? '#f0fdf4' : '#f8fafc'};
        opacity: ${isUnlocked ? '1' : '0.48'};
        border-radius: 16px;
        padding: 14px;
        display: flex;
        gap: 10px;
        align-items: flex-start;
    ">
        <div style="width: 42px; height: 42px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: white; font-size: 24px; flex-shrink: 0;">
            ${badge.icon}
        </div>
        <div>
            <div style="font-size: 13px; font-weight: 900; color: var(--color-gray-900);">${badge.name}</div>
            <div style="font-size: 11px; color: var(--color-gray-500); line-height: 1.4; margin-top: 3px;">${badge.description}</div>
            <div style="font-size: 10px; font-weight: 900; color: ${isUnlocked ? '#16a34a' : 'var(--color-gray-400)'}; margin-top: 7px; text-transform: uppercase;">
                ${isUnlocked ? 'Unlocked' : 'Locked'}
            </div>
        </div>
    </div>
`;

const resizeImageToDataUrl = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            const size = 256;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const scale = Math.max(size / image.width, size / image.height);
            const width = image.width * scale;
            const height = image.height * scale;
            const x = (size - width) / 2;
            const y = (size - height) / 2;
            ctx.drawImage(image, x, y, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        image.onerror = reject;
        image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
});
