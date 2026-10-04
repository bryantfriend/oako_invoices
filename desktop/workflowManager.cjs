const fs = require('node:fs/promises');
const path = require('node:path');

function createWorkflowManager(options) {
    var settings;
    var filename = path.join(options.userData, 'desktop-workflow-settings.json');
    async function getSettings() {
        if (!settings) {
            try { settings = JSON.parse(await fs.readFile(filename, 'utf8')); }
            catch (error) { settings = { background: true, startAtLogin: true, shortcut: true, initialized: false }; }
        }
        return Object.assign({}, settings, { shortcutAvailable: options.shortcutAvailable() });
    }
    async function saveSettings(input) {
        if (!input || typeof input.background !== 'boolean' || typeof input.startAtLogin !== 'boolean' || typeof input.shortcut !== 'boolean') throw new Error('Choose valid Windows workflow settings.');
        var next = { background: input.background, startAtLogin: input.startAtLogin, shortcut: input.shortcut, initialized: true };
        await fs.mkdir(options.userData, { recursive: true });
        await fs.writeFile(filename + '.tmp', JSON.stringify(next, null, 2), 'utf8');
        await fs.rename(filename + '.tmp', filename);
        settings = next;
        options.apply(next);
        return getSettings();
    }
    return { getSettings: getSettings, saveSettings: saveSettings };
}
module.exports = { createWorkflowManager: createWorkflowManager };
