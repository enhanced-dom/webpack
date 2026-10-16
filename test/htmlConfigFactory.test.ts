import { type Configuration } from 'webpack'
import path from 'path'

import { getInMemoryCompiler } from '../src/compiler.helpers'
import { htmlConfigFactory } from '../src/plugins'

describe('htmlConfigFactory', () => {
  test(
    'incorporates title and favicon into the html when no template.html file exists',
    (done) => {
      const testFolder = path.join(__dirname, 'html_config_factory_test')
      const config: Configuration = {
        mode: 'development',
        target: 'web',
        entry: path.join(testFolder, 'index.js'),
        output: {
          filename: 'bundle.js',
          publicPath: '',
          path: testFolder,
        },
        plugins: htmlConfigFactory({
          html: { title: 'My Test App', favicon: path.join(testFolder, 'favicon.ico') },
        }),
      }
      const testCompiler = getInMemoryCompiler(config)
      if (!testCompiler.inputFileSystem.existsSync(testFolder)) {
        testCompiler.inputFileSystem.mkdirpSync(testFolder)
      }
      testCompiler.inputFileSystem.writeFileSync(path.join(testFolder, 'index.js'), "console.log('hello from bundle')")
      testCompiler.inputFileSystem.writeFileSync(path.join(testFolder, 'favicon.ico'), Buffer.from([0, 1, 2, 3]))

      testCompiler.run((error, stats) => {
        if (error || stats?.hasErrors()) {
          done(error || stats?.toJson('errors-only').errors?.[0])
          return
        }
        try {
          const html = testCompiler.outputFileSystem.readFileSync(path.join(testFolder, 'index.html'), 'utf-8') as string
          expect(html).toContain('<title>My Test App</title>')
          expect(html).toContain('<link rel="icon" href="favicon.ico">')
          done()
        } catch (e) {
          done(e)
        }
      })
    },
    60 * 1000,
  )

  test(
    'omits the title tag entirely when no title is given',
    (done) => {
      const testFolder = path.join(__dirname, 'html_config_factory_no_title_test')
      const config: Configuration = {
        mode: 'development',
        target: 'web',
        entry: path.join(testFolder, 'index.js'),
        output: {
          filename: 'bundle.js',
          publicPath: '',
          path: testFolder,
        },
        plugins: htmlConfigFactory(),
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
          expect(html).not.toContain('<title>')
          done()
        } catch (e) {
          done(e)
        }
      })
    },
    60 * 1000,
  )
})
