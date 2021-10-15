import path from 'path'
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer'
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import TerserPlugin, { TerserPluginOptions } from 'terser-webpack-plugin'
import { MinifyOptions } from 'terser'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import fs from 'fs'

import HtmlInlineSourcePlugin from './HtmlWebpackInlineSourcePlugin'

export const cssConfigFactory = ({
  filename = '[name]-[chunkhash].css',
  cssnanoOptions = {},
}: { filename?: string; cssnanoOptions?: any } = {}) => {
  return [
    new MiniCssExtractPlugin({
      filename,
    }),
    new CssMinimizerPlugin({
      test: /\.css$/g,
      minimizerOptions: {
        preset: ['advanced'],
        ...cssnanoOptions,
      },
      minify: CssMinimizerPlugin.cssnanoMinify,
    }),
  ]
}

export const bundleAnalyzerConfigFactory = (extraConfig: BundleAnalyzerPlugin.Options = {}) => {
  return [
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      reportFilename: './reports/bundle-analysis.html',
      openAnalyzer: false,
      ...extraConfig,
    }),
  ]
}

export const htmlConfigFactory = ({ html = {}, embed }: { embed?: boolean; html?: Partial<HtmlWebpackPlugin.Options> } = {}) => {
  const template = html.template ?? path.join(process.cwd(), 'template.html')
  const templateExists = fs.existsSync(template)
  const templateContent = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
  </head>
  <body>
    <div id="root"></div>
  </body>
  </html>`
  const favicon = html.favicon ? (path.isAbsolute(html.favicon) ? html.favicon : path.join(process.cwd(), html.favicon)) : undefined
  const plugins = [
    new HtmlWebpackPlugin({
      inject: true,
      inlineSource: embed ? '.(js|css)$' : undefined,
      lang: 'en-US',
      ...(templateExists ? { template } : { templateContent }),
      ...html,
      favicon: favicon && embed && fs.existsSync(favicon) ? `data:image/x-icon;base64, ${fs.readFileSync(favicon, 'base64')}` : favicon,
    }),
  ]

  if (embed) {
    plugins.push(new HtmlInlineSourcePlugin())
  }

  return plugins
}

export const terserConfigFactory = ({
  enableSourcemaps = true,
  cachePath = './.tersercache',
  terserOptions = {} as MinifyOptions,
} = {}) => [
  new TerserPlugin({
    parallel: true,
    cache: cachePath,
    sourceMap: enableSourcemaps,
    terserOptions: {
      ie8: false,
      compress: {
        evaluate: false,
      },
      keep_fnames: true,
      keep_classnames: true,
      mangle: {
        keep_fnames: true,
        keep_classnames: true,
      },
      ...terserOptions,
    },
  } as TerserPluginOptions),
]
