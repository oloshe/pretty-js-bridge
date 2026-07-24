import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const isUmdBuild = mode === 'umd';

  return {
    build: {
      emptyOutDir: false,
      minify: false,
      sourcemap: true,
      lib: isUmdBuild
        ? {
            entry: 'src/umd.ts',
            name: 'PrettyJsBridge',
            formats: ['umd'],
            fileName: () => 'index.umd.js',
          }
        : {
            entry: 'src/public.ts',
            formats: ['es', 'cjs'],
            fileName: (format) =>
              format === 'es' ? 'index.js' : 'index.cjs',
          },
      rollupOptions: {
        output: {
          exports: isUmdBuild ? 'default' : 'named',
        },
      },
    },
    test: {
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: ['src/schema.ts'],
        reporter: ['text', 'json', 'html'],
        thresholds: {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  };
});
