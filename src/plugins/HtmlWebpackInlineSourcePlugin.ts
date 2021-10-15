import HtmlWebpackPlugin from 'html-webpack-plugin'
// @ts-ignore
import HtmlWebpackInlineSourcePlugin from 'html-webpack-inline-source-plugin'
import { Compilation, Compiler } from 'webpack'
import { Hooks } from 'html-webpack-plugin'
import { AsyncSeriesWaterfallHook } from 'tapable'

type AsyncSeriesWaterfallHookData<T> = T extends AsyncSeriesWaterfallHook<infer R> ? R : never

HtmlWebpackInlineSourcePlugin.prototype.processTags = function (
  compilation: Compilation,
  regexStr: string,
  pluginData: AsyncSeriesWaterfallHookData<Hooks['alterAssetTags']>,
) {
  const self = this

  const scripts = []
  const styles = []

  const regex = new RegExp(regexStr)
  pluginData.assetTags.scripts.forEach(function (tag) {
    scripts.push(self.processTag(compilation, regex, tag))
  })

  pluginData.assetTags.styles.forEach(function (tag) {
    styles.push(self.processTag(compilation, regex, tag))
  })

  return { ...pluginData, assetTags: { ...pluginData.assetTags, scripts, styles } }
}

HtmlWebpackInlineSourcePlugin.prototype.apply = function (compiler: Compiler) {
  const self = this
  self.assetsRegExp = undefined

  compiler.hooks.compilation.tap('html-webpack-inline-source-plugin', (compilation) => {
    HtmlWebpackPlugin.getHooks(compilation).alterAssetTags.tapAsync('html-webpack-inline-source-plugin', (htmlPluginData, callback) => {
      if (!htmlPluginData.plugin.options.inlineSource) {
        return callback(null, htmlPluginData)
      }

      const regexStr = htmlPluginData.plugin.options.inlineSource
      self.assetsRegExp = new RegExp(regexStr)

      const result = self.processTags(compilation, regexStr, htmlPluginData)

      callback(null, result)
    })
  })

  compiler.hooks.emit.tap('html-webpack-inline-source-plugin', (compilation) => {
    if (self.assetsRegExp) {
      Object.keys(compilation.assets).forEach(function (file) {
        if (file.match(self.assetsRegExp)) {
          delete compilation.assets[file]
        }
      })
    }
  })
}

export = HtmlWebpackInlineSourcePlugin
