import { type Configuration } from 'webpack'
import path from 'path'

import { getInMemoryCompiler } from '../src/compiler.helpers'
import { styleConfigFactory } from '../src/loaders'

// This package is built as real ESM (`package.json`'s `"type": "module"`), and webpack decides how
// to load a loader module (`require()` vs. dynamic `import()`) from that. Running this test against
// `src/loaders/WebcomponentStyleLoader.ts` would go through ts-jest's CommonJS transform, which Node's
// own CJS/ESM interop then double-wraps on `import()` - an artifact of the test environment, not of
// real usage. Pointing it at the already-built `dist/` output instead exercises the loader exactly as
// a real consumer would load it (requires `npm run build` to have run first - see `pretest`).
const builtWebcomponentStyleLoaderPath = path.join(__dirname, '..', 'dist', 'loaders', 'WebcomponentStyleLoader.js')

describe('WebcomponentStyleLoader', () => {
  test(
    'writes a typings file next to the source css, describing its named exports',
    (done) => {
      const testFolder = path.join(__dirname, 'style_typings_test')
      const cssPath = path.join(testFolder, 'style.css')
      const dtsPath = `${cssPath}.d.ts`
      const use = styleConfigFactory({ typedStyles: true }).map((loaderItem) =>
        typeof loaderItem === 'object' && loaderItem.loader?.includes('WebcomponentStyleLoader')
          ? { ...loaderItem, loader: builtWebcomponentStyleLoaderPath }
          : loaderItem,
      )
      const config: Configuration = {
        mode: 'development',
        target: 'web',
        entry: path.join(testFolder, 'index.js'),
        output: {
          filename: 'bundle.js',
          publicPath: '',
          path: testFolder,
        },
        module: {
          rules: [
            {
              test: /\.css$/,
              use,
            },
          ],
        },
      }
      const testCompiler = getInMemoryCompiler(config)
      if (!testCompiler.inputFileSystem.existsSync(testFolder)) {
        testCompiler.inputFileSystem.mkdirpSync(testFolder)
      }
      testCompiler.inputFileSystem.writeFileSync(cssPath, '.foo { color: red; }')
      testCompiler.inputFileSystem.writeFileSync(path.join(testFolder, 'index.js'), "import './style.css'")

      testCompiler.outputFileSystem.mkdirpSync(testFolder)

      testCompiler.run((error, stats) => {
        if (error || stats?.hasErrors()) {
          done(error || stats?.toJson('errors-only').errors?.[0])
          return
        }
        try {
          expect(testCompiler.outputFileSystem.existsSync(dtsPath)).toEqual(true)
          expect(testCompiler.outputFileSystem.readFileSync(dtsPath, 'utf-8')).toContain('export const foo: string;')
          done()
        } catch (e) {
          done(e)
        }
      })
    },
    60 * 1000,
  )
})
