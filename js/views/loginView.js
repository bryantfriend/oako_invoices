import { authController } from "../controllers/authController.js";

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
                    <p style="color: var(--color-gray-500);">Sign in to your account</p>
                </div>
                
                <form id="login-form">
                    <div class="input-group">
                        <label for="email">Email Address</label>
                        <input type="email" id="email" required placeholder="admin@kyrgyzorganics.com">
                    </div>
                    
                    <div class="input-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" required placeholder="••••••••">
                    </div>

                    <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center; padding: 12px;">
                        Login
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
};
