import HtmlWebpackPlugin from 'html-webpack-plugin'
import { type Compilation, type Compiler, type Configuration } from 'webpack'
import path from 'path'

import { getInMemoryCompiler } from '../src/compiler.helpers'
import HtmlInlineSourcePlugin from '../src/plugins/HtmlInlineSourcePlugin'

class EmitExtraAssetPlugin {
  constructor(
    private _assetName: string,
    private _content: string,
  ) {}

  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap('EmitExtraAssetPlugin', (compilation: Compilation) => {
      // Real "untagged" assets (e.g. a Worker chunk) get added via the normal chunk-asset
      // pipeline during sealing, well before compilation.assets is frozen - PROCESS_ASSETS_STAGE_ADDITIONAL
      // mimics that timing, rather than the deprecated post-seal compiler.hooks.emit. It also
      // needs to happen before html-webpack-plugin's own afterTemplateExecution hook fires, so
      // the asset already exists in compilation.assets by the time additionalAssets is matched
      // against it.
      compilation.hooks.processAssets.tap(
        { name: 'EmitExtraAssetPlugin', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL },
        () => {
          compilation.emitAsset(this._assetName, new compiler.webpack.sources.RawSource(this._content))
        },
      )
    })
  }
}

class EmitExtraAssetLatePlugin {
  constructor(
    private _assetName: string,
    private _content: string,
  ) {}

  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap('EmitExtraAssetLatePlugin', (compilation: Compilation) => {
      // Mirrors webpack-license-plugin, which writes its notices file at
      // PROCESS_ASSETS_STAGE_ANALYSE - long after html-webpack-plugin's own afterTemplateExecution
      // hook (and therefore HtmlInlineSourcePlugin's asset-matching) has already run.
      compilation.hooks.processAssets.tap(
        { name: 'EmitExtraAssetLatePlugin', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ANALYSE },
        () => {
          compilation.emitAsset(this._assetName, new compiler.webpack.sources.RawSource(this._content))
        },
      )
    })
  }
}

describe('HtmlInlineSourcePlugin', () => {
  test(
    'inlines the entry bundle into the html and removes the standalone asset',
    (done) => {
      const testFolder = path.join(__dirname, 'html_inline_test')
      const config: Configuration = {
        mode: 'development',
        target: 'web',
        entry: path.join(testFolder, 'index.js'),
        output: {
          filename: 'bundle.js',
          publicPath: '',
          path: testFolder,
        },
        plugins: [
          new HtmlWebpackPlugin({ inject: 'body', templateContent: '<html><head></head><body></body></html>' }),
          new HtmlInlineSourcePlugin(),
        ],
      }
      const testCompiler = getInMemoryCompiler(config)
      if (!testCompiler.inputFileSystem.existsSync(testFolder)) {
        testCompiler.inputFileSystem.mkdirpSync(testFolder)
      }
      testCompiler.inputFileSystem.writeFileSync(path.join(testFolder, 'index.js'), "console.log('hello from bundle')")

      testCompiler.run((error, stats) => {
        if (error || stats?.hasErrors()) {
          done(error || stats?.toJson('errors-only').errors?.[0])
          return
        }
        try {
          const outputFiles = testCompiler.outputFileSystem.readdirSync(testFolder)
          expect(outputFiles).toEqual(['index.html'])
          expect(testCompiler.outputFileSystem.existsSync(path.join(testFolder, 'bundle.js'))).toEqual(false)
          const html = testCompiler.outputFileSystem.readFileSync(path.join(testFolder, 'index.html'), 'utf-8')
          expect(html).toContain("console.log('hello from bundle')")
          done()
        } catch (e) {
          done(e)
        }
      })
    },
    60 * 1000,
  )

  test(
    'does not delete a .js asset that was never referenced by a <script>/<link> tag',
    (done) => {
      const testFolder = path.join(__dirname, 'html_inline_untagged_test')
      const config: Configuration = {
        mode: 'development',
        target: 'web',
        entry: path.join(testFolder, 'index.js'),
        output: {
          filename: 'bundle.js',
          publicPath: '',
          path: testFolder,
        },
        plugins: [
          new HtmlWebpackPlugin({ inject: 'body', templateContent: '<html><head></head><body></body></html>' }),
          new EmitExtraAssetPlugin('untagged-chunk.js', "console.log('untagged')"),
          new HtmlInlineSourcePlugin(),
        ],
      }
      const testCompiler = getInMemoryCompiler(config)
      if (!testCompiler.inputFileSystem.existsSync(testFolder)) {
        testCompiler.inputFileSystem.mkdirpSync(testFolder)
      }
      testCompiler.inputFileSystem.writeFileSync(path.join(testFolder, 'index.js'), "console.log('hello from bundle')")

      testCompiler.run((error, stats) => {
        if (error || stats?.hasErrors()) {
          done(error || stats?.toJson('errors-only').errors?.[0])
          return
        }
        try {
          const outputFiles = testCompiler.outputFileSystem.readdirSync(testFolder).sort()
          expect(outputFiles).toEqual(['index.html', 'untagged-chunk.js'])
          done()
        } catch (e) {
          done(e)
        }
      })
    },
    60 * 1000,
  )

  test(
    'embeds additionalAssets into the html and removes the standalone file',
    (done) => {
      const testFolder = path.join(__dirname, 'html_inline_additional_assets_test')
      const inlineSourcePlugin = new HtmlInlineSourcePlugin()
      inlineSourcePlugin.additionalAssets = [{ pattern: /notices\.json$/, wrapper: 'script', container: 'body' }]
      const config: Configuration = {
        mode: 'development',
        target: 'web',
        entry: path.join(testFolder, 'index.js'),
        output: {
          filename: 'bundle.js',
          publicPath: '',
          path: testFolder,
        },
        plugins: [
          new HtmlWebpackPlugin({ inject: 'body', templateContent: '<html><head></head><body></body></html>' }),
          new EmitExtraAssetPlugin('notices.json', '{"license":"MIT"}'),
          inlineSourcePlugin,
        ],
      }
      const testCompiler = getInMemoryCompiler(config)
      if (!testCompiler.inputFileSystem.existsSync(testFolder)) {
        testCompiler.inputFileSystem.mkdirpSync(testFolder)
      }
      testCompiler.inputFileSystem.writeFileSync(path.join(testFolder, 'index.js'), "console.log('hello from bundle')")

      testCompiler.run((error, stats) => {
        if (error || stats?.hasErrors()) {
          done(error || stats?.toJson('errors-only').errors?.[0])
          return
        }
        try {
          const outputFiles = testCompiler.outputFileSystem.readdirSync(testFolder)
          expect(outputFiles).toEqual(['index.html'])
          expect(testCompiler.outputFileSystem.existsSync(path.join(testFolder, 'notices.json'))).toEqual(false)
          const html = testCompiler.outputFileSystem.readFileSync(path.join(testFolder, 'index.html'), 'utf-8')
          const encoded = Buffer.from('{"license":"MIT"}').toString('base64')
          expect(html).toContain(
            `<script type="application/octet-stream" data-asset-name="notices.json" data-encoding="base64">${encoded}</script>`,
          )
          done()
        } catch (e) {
          done(e)
        }
      })
    },
    60 * 1000,
  )

  test(
    'embeds additionalAssets that are only emitted after afterTemplateExecution has already run',
    (done) => {
      const testFolder = path.join(__dirname, 'html_inline_additional_assets_late_test')
      const inlineSourcePlugin = new HtmlInlineSourcePlugin()
      inlineSourcePlugin.additionalAssets = [{ pattern: /notices\.json$/, wrapper: 'comment', container: 'body' }]
      const config: Configuration = {
        mode: 'development',
        target: 'web',
        entry: path.join(testFolder, 'index.js'),
        output: {
          filename: 'bundle.js',
          publicPath: '',
          path: testFolder,
        },
        plugins: [
          new HtmlWebpackPlugin({ inject: 'body', templateContent: '<html><head></head><body></body></html>' }),
          new EmitExtraAssetLatePlugin('notices.json', '{"license":"MIT"}'),
          inlineSourcePlugin,
        ],
      }
      const testCompiler = getInMemoryCompiler(config)
      if (!testCompiler.inputFileSystem.existsSync(testFolder)) {
        testCompiler.inputFileSystem.mkdirpSync(testFolder)
      }
      testCompiler.inputFileSystem.writeFileSync(path.join(testFolder, 'index.js'), "console.log('hello from bundle')")

      testCompiler.run((error, stats) => {
        if (error || stats?.hasErrors()) {
          done(error || stats?.toJson('errors-only').errors?.[0])
          return
        }
        try {
          const outputFiles = testCompiler.outputFileSystem.readdirSync(testFolder)
          expect(outputFiles).toEqual(['index.html'])
          expect(testCompiler.outputFileSystem.existsSync(path.join(testFolder, 'notices.json'))).toEqual(false)
          const html = testCompiler.outputFileSystem.readFileSync(path.join(testFolder, 'index.html'), 'utf-8')
          const encoded = Buffer.from('{"license":"MIT"}').toString('base64')
          expect(html).toContain(`<!--data-asset-name="notices.json" data-encoding="base64" ${encoded}-->`)
          done()
        } catch (e) {
          done(e)
        }
      })
    },
    60 * 1000,
  )

  test(
    'inserts additionalAssets after the real closing body tag, not a </body>-like substring inside the inlined bundle',
    (done) => {
      const testFolder = path.join(__dirname, 'html_inline_body_lookalike_test')
      const inlineSourcePlugin = new HtmlInlineSourcePlugin()
      inlineSourcePlugin.additionalAssets = [{ pattern: /notices\.json$/, wrapper: 'comment', container: 'body' }]
      const config: Configuration = {
        mode: 'development',
        target: 'web',
        entry: path.join(testFolder, 'index.js'),
        output: {
          filename: 'bundle.js',
          publicPath: '',
          path: testFolder,
        },
        plugins: [
          new HtmlWebpackPlugin({ inject: 'body', templateContent: '<html><head></head><body></body></html>' }),
          new EmitExtraAssetPlugin('notices.json', '{"license":"MIT"}'),
          inlineSourcePlugin,
        ],
      }
      const testCompiler = getInMemoryCompiler(config)
      if (!testCompiler.inputFileSystem.existsSync(testFolder)) {
        testCompiler.inputFileSystem.mkdirpSync(testFolder)
      }
      // Mimics packSnapshot.worker.ts's WORKER_SOURCE: a plain string constant embedding a full
      // HTML template - including a literal, harmless-as-JS-text `</body>` - that ends up inlined
      // into the page's real <script> tag well before the document's own closing body tag.
      testCompiler.inputFileSystem.writeFileSync(path.join(testFolder, 'index.js'), "console.log('<html><body>fake page</body></html>')")

      testCompiler.run((error, stats) => {
        if (error || stats?.hasErrors()) {
          done(error || stats?.toJson('errors-only').errors?.[0])
          return
        }
        try {
          const html = testCompiler.outputFileSystem.readFileSync(path.join(testFolder, 'index.html'), 'utf-8')
          const encoded = Buffer.from('{"license":"MIT"}').toString('base64')
          const marker = `<!--data-asset-name="notices.json" data-encoding="base64" ${encoded}-->`
          const markerIndex = html.indexOf(marker)
          const scriptCloseIndex = html.indexOf('</script>')
          const realBodyCloseIndex = html.lastIndexOf('</body>')
          expect(markerIndex).toBeGreaterThan(scriptCloseIndex)
          expect(markerIndex).toBeLessThan(realBodyCloseIndex)
          done()
        } catch (e) {
          done(e)
        }
      })
    },
    60 * 1000,
  )
})
