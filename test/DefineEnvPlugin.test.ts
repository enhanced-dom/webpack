import { type Configuration } from 'webpack'
import path from 'path'

import { getInMemoryCompiler } from '../src/compiler.helpers'
import { defineEnvConfigFactory } from '../src/plugins'

describe('defineEnvConfigFactory', () => {
  test(
    'replaces process.env.<name> references with the current env var value at build time',
    (done) => {
      const testFolder = path.join(__dirname, 'define_env_test')
      process.env.MY_TEST_VAR = 'hello-world'
      const config: Configuration = {
        mode: 'development',
        devtool: false,
        target: 'web',
        entry: path.join(testFolder, 'index.js'),
        output: {
          filename: 'bundle.js',
          publicPath: '',
          path: testFolder,
        },
        plugins: defineEnvConfigFactory(['MY_TEST_VAR']),
      }
      const testCompiler = getInMemoryCompiler(config)
      if (!testCompiler.inputFileSystem.existsSync(testFolder)) {
        testCompiler.inputFileSystem.mkdirpSync(testFolder)
      }
      testCompiler.inputFileSystem.writeFileSync(path.join(testFolder, 'index.js'), 'console.log(process.env.MY_TEST_VAR)')

      testCompiler.run((error, stats) => {
        delete process.env.MY_TEST_VAR
        if (error || stats?.hasErrors()) {
          done(error || stats?.toJson('errors-only').errors?.[0])
          return
        }
        try {
          const bundle = testCompiler.outputFileSystem.readFileSync(path.join(testFolder, 'bundle.js'), 'utf-8') as string
          expect(bundle).toContain('"hello-world"')
          expect(bundle).not.toContain('process.env.MY_TEST_VAR')
          done()
        } catch (e) {
          done(e)
        }
      })
    },
    60 * 1000,
  )
})
