import path from 'path'
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer'
import LicensePlugin from 'webpack-license-plugin'
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import TerserPlugin from 'terser-webpack-plugin'
import { MinifyOptions } from 'terser'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import fs from 'fs'
import { type WebpackPluginInstance } from 'webpack'

import DefineEnvPlugin from './DefineEnvPlugin'
import HtmlInlineSourcePlugin from './HtmlInlineSourcePlugin'
import SelfDecompressingHtmlPlugin from './SelfDecompressingHtmlPlugin'
import formatThirdPartyNotices from './formatThirdPartyNotices'

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

type HtmlInlineSourceAdditionalAssetsType = NonNullable<InstanceType<typeof HtmlInlineSourcePlugin>['additionalAssets']>
type SelfDecompressingHtmlOptionsType = ConstructorParameters<typeof SelfDecompressingHtmlPlugin>[0]

export const htmlConfigFactory = ({
  html = {},
  embed,
  compress,
}: {
  embed?: boolean | { additionalAssets?: HtmlInlineSourceAdditionalAssetsType }
  compress?: boolean | SelfDecompressingHtmlOptionsType
  html?: Partial<HtmlWebpackPlugin.Options>
} = {}) => {
  const template = html.template ?? path.join(process.cwd(), 'template.html')
  const templateExists = fs.existsSync(template)
  // Interpolated directly here rather than left as an EJS placeholder (e.g.
  // `<%= htmlWebpackPlugin.options.title %>`, the mechanism a real `template` file can use) -
  // html-webpack-plugin only runs templateContent strings through its EJS child-compilation when
  // they came from a file; a plain string option like this one is used completely as-is.
  const templateContent = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    ${html.title ? `<title>${html.title}</title>` : ''}
  </head>
  <body>
    <div id="root"></div>
  </body>
  </html>`
  const favicon = html.favicon ? (path.isAbsolute(html.favicon) ? html.favicon : path.join(process.cwd(), html.favicon)) : undefined
  const plugins: WebpackPluginInstance[] = [
    new HtmlWebpackPlugin({
      inject: 'body',
      lang: 'en-US',
      ...(templateExists ? { template } : { templateContent }),
      ...html,
      favicon,
    }),
  ]

  if (embed) {
    const inlineSourcePlugin = new HtmlInlineSourcePlugin()
    if (typeof embed === 'object') {
      inlineSourcePlugin.additionalAssets = embed.additionalAssets
    }
    plugins.push(inlineSourcePlugin)
  }

  // Runs its own processAssets tap well after HtmlInlineSourcePlugin's (see that plugin's
  // comment on its stage choice), so it always gzips the fully embedded/finished body regardless
  // of push order here.
  if (compress) {
    plugins.push(new SelfDecompressingHtmlPlugin(typeof compress === 'object' ? compress : {}))
  }

  return plugins
}

export const terserConfigFactory = ({ enableSourcemaps = true, terserOptions = {} as MinifyOptions, embed = false } = {}) => [
  /* eslint-disable @typescript-eslint/naming-convention */
  new TerserPlugin({
    parallel: true,
    extractComments: !embed,
    terserOptions: {
      ie8: false,
      sourceMap: enableSourcemaps,
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
  }),
]

// Defines process.env.<name> for each listed env var as its (JSON-stringified) current value at
// build time - the DefinePlugin equivalent of dotenv-loading into the bundle. Values not set in
// the running process become the string "undefined" (JSON.stringify(undefined) === undefined,
// which DefinePlugin then coerces to that literal), same as an un-set process.env access already
// behaves at runtime.
export const defineEnvConfigFactory = (envVarNames: string[]) => {
  return [new DefineEnvPlugin(envVarNames)]
}

export const licenseConfigFactory = ({
  outputFilename = 'THIRD-PARTY-NOTICES.json',
  includeNoticeText = true,
  additionalFiles,
  ...extraConfig
}: Partial<ConstructorParameters<typeof LicensePlugin>[0]> = {}) => {
  return [
    new LicensePlugin({
      outputFilename,
      includeNoticeText,
      additionalFiles: {
        'THIRD-PARTY-NOTICES.txt': formatThirdPartyNotices,
        ...additionalFiles,
      },
      ...extraConfig,
    }),
  ]
}
