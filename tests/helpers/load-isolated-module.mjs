import vm from 'node:vm';
import path from 'node:path';
import { build } from 'esbuild';
export async function loadModule(file, modules, globals = {}, keepIcf = false) {
    var bundle = await build({
        entryPoints: [file],
        bundle: true,
        write: false,
        platform: 'node',
        format: 'cjs',
        supported: { 'dynamic-import': false },
        plugins: [
            {
                name: 'isolated-boundaries',
                setup(api) {
                    api.onResolve({ filter: /.*/ }, function (args) {
                        if (args.kind === 'entry-point') return;
                        if (
                            keepIcf &&
                            !/\/services\/|\/core\/(authService|store|firebase|firestoreRead|i18n)\.js$|^https:/.test(
                                args.path,
                            )
                        )
                            return;
                        return { path: args.path, external: true };
                    });
                },
            },
        ],
    });
    var module = { exports: {} };
    vm.runInNewContext(
        bundle.outputFiles[0].text,
        Object.assign(
            {
                module,
                exports: module.exports,
                console: { info() {}, warn() {}, error() {} },
                Date,
                setTimeout,
                clearTimeout,
                require(specifier) {
                    var name = path.basename(specifier, '.js');
                    if (name === 'ovenLoading') return { withOvenLoading: function(handler) { return handler; }, startOvenLoading: function() { return { finish: function() {}, fail: function() {}, update: function() {} }; }, startPrintWindowLoading: function() { return { finish: function() {}, fail: function() {}, update: function() {} }; } };
                    return modules[specifier] || modules[name] || {};
                },
            },
            globals,
        ),
    );
    return module.exports;
}
