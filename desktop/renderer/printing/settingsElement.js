import { runDesktopPrintAction } from './actions.js';

function escapeAttribute(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

class DesktopPrintSettings extends HTMLElement {
    connectedCallback() {
        this.className = 'card desktop-print-settings';
        this.innerHTML = '<h2>Windows printing and PDF filing</h2><p role="status">Loading device settings…</p>';
        this.load().catch(this.showError.bind(this));
    }

    showError(error) {
        var status = this.querySelector('[role="status"]');
        if (status) status.textContent = error.message;
    }

    async load() {
        var results = await Promise.all([window.desktopApp.getPrintSettings(), window.desktopApp.getPrinters(), window.desktopApp.getWorkflowSettings()]);
        if (!this.isConnected) return;
        var profile = results[0];
        var printers = results[1];
        var workflow = results[2];
        function companionChoices(selected) {
            var missingChoice = '';
            if (selected && !printers.some(function match(printer) { return printer.name === selected; })) {
                missingChoice = '<option selected value="' + escapeAttribute(selected) + '">' + escapeAttribute(selected) + ' (unavailable)</option>';
            }
            return '<option value="">Use invoice printer</option>' + missingChoice + printers.map(function choice(printer) {
                return '<option value="' + escapeAttribute(printer.name) + '"' + (printer.name === selected ? ' selected' : '') + '>' + escapeAttribute(printer.displayName || printer.name) + '</option>';
            }).join('');
        }
        var choices = '<option value="">Use the Windows print dialog</option>';
        if (profile.deviceName && !printers.some(function match(printer) { return printer.name === profile.deviceName; })) {
            choices += '<option selected value="' + escapeAttribute(profile.deviceName) + '">' + escapeAttribute(profile.deviceName) + ' (unavailable)</option>';
        }
        printers.forEach(function addPrinter(printer) {
            choices += '<option value="' + escapeAttribute(printer.name) + '"' + (printer.name === profile.deviceName ? ' selected' : '') + '>' + escapeAttribute(printer.displayName || printer.name) + '</option>';
        });
        this.innerHTML = '<h2>Windows printing and PDF filing</h2><p>These settings apply to this computer. Check the preview before sending invoices to paper.</p>' +
            '<form><label>Invoice printer<select name="deviceName">' + choices + '</select></label>' +
            '<label>Copies<input name="copies" type="number" min="1" max="20" value="' + profile.copies + '"></label>' +
            '<label>Paper size<select name="paperSize">' + ['A4', 'Letter', 'Legal', 'A3', 'A5'].map(function paper(size) { return '<option' + (size === profile.paperSize ? ' selected' : '') + '>' + size + '</option>'; }).join('') + '</select></label>' +
            '<label><input name="directPrint" type="checkbox"' + (profile.directPrint ? ' checked' : '') + '> Print directly to the saved printer</label>' +
            '<label><input name="autoFile" type="checkbox"' + (profile.autoFile ? ' checked' : '') + '> Save a PDF automatically when printing</label>' +
            '<p>Automatic PDF saving is off by default. Turn it on only if you want copies saved on this computer.</p>' +
            '<h3>Delivery-run printing</h3><label>Packing-list printer<select name="packingDeviceName">' + companionChoices(profile.packingDeviceName) + '</select></label>' +
            '<label>Delivery-label printer<select name="labelDeviceName">' + companionChoices(profile.labelDeviceName) + '</select></label>' +
            '<label>Label width (mm)<input name="labelWidth" type="number" min="50" max="210" value="' + profile.labelWidth + '"></label>' +
            '<label>Label height (mm)<input name="labelHeight" type="number" min="25" max="210" value="' + profile.labelHeight + '"></label>' +
            '<h3>Windows workflow</h3><label><input name="background" type="checkbox"' + (workflow.background ? ' checked' : '') + '> Keep syncing in the tray when the window closes</label>' +
            '<label><input name="startAtLogin" type="checkbox"' + (workflow.startAtLogin ? ' checked' : '') + '> Start in the tray when Windows starts</label>' +
            '<label><input name="shortcut" type="checkbox"' + (workflow.shortcut ? ' checked' : '') + '> Ctrl+Alt+O opens a separate order-entry window</label>' +
            '<p>Use Exit in the tray menu to stop the app. ' + (workflow.shortcut && !workflow.shortcutAvailable ? 'The shortcut is unavailable; another app may be using it. New order is still available in the tray.' : '') + '</p>' +
            '<p>PDFs are filed in date folders, with the customer and invoice in the filename.</p><p data-folder></p>' +
            '<div><button type="button" data-folder-button class="btn btn-secondary">Choose PDF folder</button> <button type="submit" class="btn btn-primary">Save Windows settings</button></div><p role="status" aria-live="polite"></p></form>';
        this.querySelector('[data-folder]').textContent = profile.folder || 'No PDF folder selected';
        this.querySelector('form').addEventListener('submit', this.save.bind(this));
        this.querySelector('[data-folder-button]').addEventListener('click', this.chooseFolder.bind(this));
    }

    async chooseFolder() {
        var button = this.querySelector('[data-folder-button]');
        button.disabled = true;
        try {
            var profile = await runDesktopPrintAction('chooseFolder', {});
            this.querySelector('[data-folder]').textContent = profile.folder || 'No PDF folder selected';
        } catch (error) { this.showError(error); }
        finally { button.disabled = false; }
    }

    async save(event) {
        event.preventDefault();
        var form = this.querySelector('form');
        var button = form.querySelector('[type="submit"]');
        button.disabled = true;
        try {
            await runDesktopPrintAction('saveSettings', {
                deviceName: form.elements.deviceName.value,
                copies: Number(form.elements.copies.value),
                paperSize: form.elements.paperSize.value,
                directPrint: form.elements.directPrint.checked,
                autoFile: form.elements.autoFile.checked,
                packingDeviceName: form.elements.packingDeviceName.value,
                labelDeviceName: form.elements.labelDeviceName.value,
                labelWidth: Number(form.elements.labelWidth.value),
                labelHeight: Number(form.elements.labelHeight.value)
            });
            await runDesktopPrintAction('saveWorkflow', { background: form.elements.background.checked, startAtLogin: form.elements.startAtLogin.checked, shortcut: form.elements.shortcut.checked });
            this.querySelector('[role="status"]').textContent = 'Windows settings saved.';
        } catch (error) { this.showError(error); }
        finally { button.disabled = false; }
    }
}

customElements.define('desktop-print-settings', DesktopPrintSettings);
