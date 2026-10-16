import HtmlWebpackPlugin from 'html-webpack-plugin'
import { type Configuration } from 'webpack'
import path from 'path'
import zlib from 'zlib'

import { getInMemoryCompiler } from '../src/compiler.helpers'
import SelfDecompressingHtmlPlugin from '../src/plugins/SelfDecompressingHtmlPlugin'

describe('SelfDecompressingHtmlPlugin', () => {
  test(
    'replaces a large body with a loading placeholder and a script that reinstates the original body, leaving head untouched',
    (done) => {
      const testFolder = path.join(__dirname, 'self_decompressing_html_test')
      const bigMarker = 'x'.repeat(20000)
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
          new HtmlWebpackPlugin({
            inject: 'body',
            templateContent: `<html><head><title>Test</title></head><body class="app"><div id="marker">${bigMarker}</div><script id="inline">window.__ran = true</script></body></html>`,
          }),
          new SelfDecompressingHtmlPlugin(),
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
          const html = testCompiler.outputFileSystem.readFileSync(path.join(testFolder, 'index.html'), 'utf-8') as string

          expect(html).toContain('<title>Test</title>')
          expect(html).toContain('<body class="app">')
          expect(html).not.toContain(bigMarker)
          expect(html).toContain('class="spinner"')

          const match = html.match(/atob\("([^"]+)"\)/)
          expect(match).not.toBeNull()
          const decompressed = zlib.gunzipSync(Buffer.from(match![1]!, 'base64')).toString('utf-8')
          expect(decompressed).toContain(bigMarker)
          expect(decompressed).toContain('window.__ran = true')

          done()
        } catch (e) {
          done(e)
        }
      })
    },
    60 * 1000,
  )

  test(
    'leaves a small body untouched when wrapping it would not save space',
    (done) => {
      const testFolder = path.join(__dirname, 'self_decompressing_html_small_test')
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
          new HtmlWebpackPlugin({ inject: false, templateContent: '<html><head></head><body>hi</body></html>' }),
          new SelfDecompressingHtmlPlugin(),
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
          const html = testCompiler.outputFileSystem.readFileSync(path.join(testFolder, 'index.html'), 'utf-8') as string
          expect(html).toContain('<body>hi</body>')
          done()
        } catch (e) {
          done(e)
        }
      })
    },
    60 * 1000,
  )
})
