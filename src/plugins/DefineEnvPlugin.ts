import { type Compiler, type WebpackPluginInstance } from 'webpack'

// Delegates to the host compiler's own webpack.DefinePlugin (via compiler.webpack, not a direct
// `import { DefinePlugin } from 'webpack'`) - DefinePlugin hooks deep into the compiler's own
// Parser/ConstDependency internals, so constructing it from this package's own bundled webpack
// dependency could silently mismatch a different webpack instance/version the host project
// actually resolves. Same reasoning as HtmlInlineSourcePlugin's compiler.webpack.Compilation use.
class DefineEnvPlugin implements WebpackPluginInstance {
  envVarNames: string[]

  constructor(envVarNames: string[]) {
    this.envVarNames = envVarNames
  }

  apply(compiler: Compiler) {
    const defines = this.envVarNames.reduce(
      (acc, name) => ({ ...acc, [`process.env.${name}`]: JSON.stringify(process.env[name]) }),
      {} as Record<string, string>,
    )
    new compiler.webpack.DefinePlugin(defines).apply(compiler)
  }
}

export default DefineEnvPlugin
