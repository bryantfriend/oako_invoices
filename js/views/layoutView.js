import { Sidebar } from "../components/sidebar.js";
import { authService } from "../core/authService.js";

class LayoutView {
    constructor() {
        this.sidebar = new Sidebar();
    }

    render() {
    // Show layout elements
        document.getElementById('sidebar')?.classList.remove('hidden');
        document.getElementById('top-bar')?.classList.remove('hidden');

        // ALWAYS render sidebar (no conditional)
        this.sidebar.render();

        // Render header content
        const topBar = document.getElementById('top-bar');
        const user = authService.getCurrentUser();

        topBar.innerHTML = `
          <div class="top-bar-left">
              <button id="hamburger-btn" class="hamburger-btn">☰</button>
              <span id="page-title">Dashboard</span>
          </div>

          <div class="top-bar-right">
              <div style="display:flex;flex-direction:column;align-items:flex-end">
                  <span class="user-email">${user?.email || 'Admin'}</span>
                  <span class="user-role">Administrator</span>
              </div>
              <div class="avatar">
                  ${(user?.email || 'A').charAt(0).toUpperCase()}
              </div>
          </div>
        `;


        // Inject overlay if it doesn't exist
        if (!document.querySelector('.sidebar-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
            
            // Add click event to close sidebar
            overlay.addEventListener('click', () => {
                document.getElementById('sidebar')?.classList.remove('open');
                overlay.classList.remove('open');
            });
        }

        // Add hamburger click event
        document.getElementById('hamburger-btn')?.addEventListener('click', () => {
             document.getElementById('sidebar')?.classList.add('open');
             document.querySelector('.sidebar-overlay')?.classList.add('open');
        });
    }


    updateTitle(title) {
        const titleEl = document.getElementById('page-title');
        if (titleEl) titleEl.textContent = title;
    }
}

export const layoutView = new LayoutView();
