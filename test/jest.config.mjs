import path from 'path'
import { fileURLToPath } from 'url'
import { jestConfigFactory } from '@enhanced-dom/jest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ESM_STUB = path.join(__dirname, '__mocks__', 'esm-stub.cjs')
const POSTCSS_PLUGIN_STUB = path.join(__dirname, '__mocks__', 'postcss-plugin-stub.cjs')

export default {
  ...jestConfigFactory({
    ts: true,
    processorConfigPath: path.join(__dirname, 'tsconfig.json'),
    testEnvironment: 'node',
    // Loaders under `dist/` are already-built, real ESM - they're loaded directly by webpack (via
    // `require()`/`import()`, not through a test), never meant to be re-transformed by ts-jest.
    transformIgnorePatterns: ['node_modules/(?!@enhanced-dom/)', 'dist/'],
  }),
  moduleNameMapper: {
    '^remark-code-import$': ESM_STUB,
    '^rehype-unwrap-images$': ESM_STUB,
    '^remark-embed-images$': ESM_STUB,
    // `postcss-loader` loads string-named plugins with a plain synchronous `require()` (no ESM
    // fallback - see its `loadPlugin()`), and Jest's own module loader refuses to `require()` real
    // ESM packages outright (unlike plain Node 22+, which handles it) - these four postcss plugins
    // are ESM-only. Real builds load them fine; only this Jest run needs the stub.
    '^postcss-normalize-whitespace$': POSTCSS_PLUGIN_STUB,
    '^postcss-discard-comments$': POSTCSS_PLUGIN_STUB,
    '^postcss-nested$': POSTCSS_PLUGIN_STUB,
    '^postcss-preset-env$': POSTCSS_PLUGIN_STUB,
  },
}
