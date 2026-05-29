import { authController } from "../controllers/authController.js";
import { t, i18n } from "../core/i18n.js";

export const renderLogin = async () => {
    const app = document.getElementById('page-container');

    // Hide parts of layout if needed, though main.js hides sidebar/header for login usually
    // But layoutView might be responsible for that. 
    // For now we just render the page content.
    // The "layoutView" (not yet implemented) logic should ideally handle showing/hiding sidebar.
    // Or we handle it here by forcefully CSS.

    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('top-bar').classList.add('hidden');

    app.innerHTML = `
        <div style="
            display: flex; 
            align-items: center; 
            justify-content: center; 
            min-height: 80vh;
        ">
            <div class="card animate-slide-up" style="width: 100%; max-width: 400px;">
                <div style="text-align: center; margin-bottom: var(--space-6);">
                    <h1 style="color: var(--color-primary-600); margin-bottom: var(--space-2);">Kyrgyz Organics</h1>
                    <p style="color: var(--color-gray-500);">${t('login_title')}</p>
                </div>
                
                <div style="display: flex; justify-content: center; gap: 12px; margin-bottom: 24px; font-size: 11px;">
                    <button class="lang-switch-btn ${i18n.getLanguage() === 'en' ? 'active' : ''}" data-lang="en" style="background: none; border: none; cursor: pointer; opacity: ${i18n.getLanguage() === 'en' ? '1' : '0.5'}; font-weight: ${i18n.getLanguage() === 'en' ? '700' : '400'};">🇺🇸 EN</button>
                    <button class="lang-switch-btn ${i18n.getLanguage() === 'ru' ? 'active' : ''}" data-lang="ru" style="background: none; border: none; cursor: pointer; opacity: ${i18n.getLanguage() === 'ru' ? '1' : '0.5'}; font-weight: ${i18n.getLanguage() === 'ru' ? '700' : '400'};">🇷🇺 RU</button>
                    <button class="lang-switch-btn ${i18n.getLanguage() === 'kg' ? 'active' : ''}" data-lang="kg" style="background: none; border: none; cursor: pointer; opacity: ${i18n.getLanguage() === 'kg' ? '1' : '0.5'}; font-weight: ${i18n.getLanguage() === 'kg' ? '700' : '400'};">🇰🇬 KG</button>
                </div>
                
                <form id="login-form">
                    <div class="input-group">
                        <label for="email">${t('login_email')}</label>
                        <input type="email" id="email" required placeholder="admin@kyrgyzorganics.com">
                    </div>
                    
                    <div class="input-group">
                        <label for="password">${t('login_pass')}</label>
                        <input type="password" id="password" required placeholder="••••••••">
                    </div>

                    <div style="display: flex; justify-content: flex-end; margin: calc(var(--space-2) * -1) 0 var(--space-4);">
                        <button type="button" id="password-reset-btn" style="background: none; border: none; color: var(--color-primary-600); font-size: var(--text-sm); font-weight: 500; padding: 4px 0;">
                            ${t('password_reset_link')}
                        </button>
                    </div>

                    <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center; padding: 12px;">
                        ${t('login_btn')}
                    </button>
                </form>
            </div>
        </div>
    `;

    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        authController.handleLogin(email, password);
    });

    document.getElementById('password-reset-btn').addEventListener('click', (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        authController.handlePasswordReset(email);
    });

    document.querySelectorAll('.lang-switch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const lang = btn.dataset.lang;
            i18n.setLanguage(lang);
            renderLogin(); // Re-render this view
        });
    });
};
