export class FormRepeater {
    constructor({ containerId, itemTemplate, onAdd, onRemove, maxItems = 50 }) {
        this.container = document.getElementById(containerId);
        this.itemTemplate = itemTemplate; // (index, data) => string
        this.onAdd = onAdd;
        this.onRemove = onRemove;
        this.maxItems = maxItems;
        this.items = [];
        this.counter = 0;
    }

    init(initialData = []) {
        if (!this.container) return;
        this.container.innerHTML = '';
        this.items = [];

        initialData.forEach(data => this.addItem(data));

        // If empty, add one empty item
        if (initialData.length === 0) {
            this.addItem();
        }
    }

    addItem(data = null) {
        if (this.items.length >= this.maxItems) return;

        const id = this.counter++;
        const itemHtml = this.itemTemplate(id, data);

        const wrapper = document.createElement('div');
        wrapper.className = 'repeater-item animate-fade-in';
        wrapper.dataset.id = id;
        wrapper.innerHTML = itemHtml;

        // Add remove button logic if provided in template or injected
        // Here we assume the template includes a button with class 'remove-item-btn'
        const removeBtn = wrapper.querySelector('.remove-item-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => this.removeItem(id));
        }

        this.container.appendChild(wrapper);
        this.items.push({ id, data });

        if (this.onAdd) this.onAdd(id, wrapper);
    }

    removeItem(id) {
        // Don't remove the last item if we want to enforce at least one
        // if (this.items.length <= 1) return;

        const index = this.items.findIndex(i => i.id === id);
        if (index > -1) {
            const wrapper = this.container.querySelector(`.repeater-item[data-id="${id}"]`);
            if (wrapper) {
                wrapper.classList.add('removing');
                wrapper.addEventListener('transitionend', () => {
                    wrapper.remove();
                    this.items.splice(index, 1);
                    if (this.onRemove) this.onRemove(id);
                });
            }
        }
    }

    getData() {
        // This relies on the inputs having name attributes like "items[ID][field]"
        // Or we can query the DOM
        const result = [];
        this.items.forEach(item => {
            const wrapper = this.container.querySelector(`.repeater-item[data-id="${item.id}"]`);
            if (wrapper) {
                const inputs = wrapper.querySelectorAll('input, select, textarea');
                const rowData = {};
                inputs.forEach(input => {
                    const name = input.name.split('.').pop(); // Simple extraction
                    if (name) rowData[name] = input.value;
                });
                result.push(rowData);
            }
        });
        return result;
    }
}
