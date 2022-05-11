/* eslint-disable @typescript-eslint/no-this-alias */
import HtmlWebpackPlugin, { Hooks } from 'html-webpack-plugin'
import HtmlWebpackInlineSourcePlugin from 'html-webpack-inline-source-plugin'
import { Compilation, Compiler } from 'webpack'
import { AsyncSeriesWaterfallHook } from 'tapable'
import fs from 'fs'
import path from 'path'

type AsyncSeriesWaterfallHookData<T> = T extends AsyncSeriesWaterfallHook<infer R> ? R : never

HtmlWebpackInlineSourcePlugin.prototype.processTags = function (
  compilation: Compilation,
  pluginData: AsyncSeriesWaterfallHookData<Hooks['afterTemplateExecution']>,
) {
  const self = this

  const headTags = []
  const bodyTags = []

  pluginData.headTags.forEach((tag) => {
    headTags.push(self.processTag(compilation, self.assetsRegExp, tag))
  })

  pluginData.bodyTags.forEach((tag) => {
    bodyTags.push(self.processTag(compilation, self.assetsRegExp, tag))
  })

  return { ...pluginData, headTags, bodyTags }
}

HtmlWebpackInlineSourcePlugin.prototype.apply = function (compiler: Compiler) {
  const self = this
  self.assetsRegExp = undefined
  self.faviconPath = undefined

  compiler.hooks.compilation.tap('html-webpack-inline-source-plugin', (compilation) => {
    HtmlWebpackPlugin.getHooks(compilation).afterTemplateExecution.tapAsync(
      'html-webpack-inline-source-plugin',
      (htmlPluginData, callback) => {
        self.assetsRegExp = new RegExp('.(js|css)$')
        const result = self.processTags(compilation, htmlPluginData) as typeof htmlPluginData
        const favicon = htmlPluginData.plugin.options.favicon
        if (!favicon || !fs.existsSync(favicon)) {
          return callback(null, result)
        }
        const faviconTag = result.headTags.find((tag) => tag.tagName === 'link' && tag.attributes.rel === 'icon')
        if (faviconTag) {
          self.faviconPath = faviconTag.attributes.href as string
          faviconTag.attributes.href = `data:image/x-icon;base64, ${fs.readFileSync(favicon, 'base64')}`
        }
        callback(null, result)
      },
    )
  })

  compiler.hooks.emit.tap('html-webpack-inline-source-plugin', (compilation) => {
    if (self.assetsRegExp) {
      Object.keys(compilation.assets).forEach(function (file) {
        if (file.match(self.assetsRegExp) || file === self.faviconPath?.split(path.sep)?.pop()) {
          delete compilation.assets[file]
        }
      })
    }
  })
}

export = HtmlWebpackInlineSourcePlugin
