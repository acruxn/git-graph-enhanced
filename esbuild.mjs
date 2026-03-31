import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const shared = {
  bundle: true,
  sourcemap: true,
  minify: production,
};

const extensionHost = await esbuild.context({
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
});

const webview = await esbuild.context({
  ...shared,
  entryPoints: ['webview/src/main.ts'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
});

if (watch) {
  await Promise.all([extensionHost.watch(), webview.watch()]);
  console.log('Watching for changes...');
} else {
  const start = Date.now();
  await Promise.all([extensionHost.rebuild(), webview.rebuild()]);
  console.log(`Build complete in ${Date.now() - start}ms`);
  await Promise.all([extensionHost.dispose(), webview.dispose()]);
}
