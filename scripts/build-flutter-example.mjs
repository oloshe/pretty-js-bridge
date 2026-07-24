import { resolve } from 'node:path';
import { build } from 'vite';

const exampleRoot = resolve('examples/08-flutter-app');

await build({
  configFile: false,
  build: {
    emptyOutDir: false,
    minify: false,
    sourcemap: true,
    outDir: resolve(exampleRoot, 'flutter_app/assets'),
    lib: {
      entry: resolve(exampleRoot, 'example.ts'),
      name: 'PrettyJsBridgeFlutterExample',
      formats: ['iife'],
      fileName: () => 'example.js',
    },
  },
});
