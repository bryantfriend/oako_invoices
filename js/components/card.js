export const createCard = ({ title, content, actions = '' }) => {
    return `
        <div class="card fade-in">
            ${title ? `
                <div class="card-header" style="
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    margin-bottom: var(--space-4);
                ">
                    <h3 style="font-size: var(--text-lg); font-weight: 600;">${title}</h3>
                    <div class="card-actions">${actions}</div>
                </div>
            ` : ''}
            <div class="card-content">
                ${content}
            </div>
        </div>
    `;
};
