import IgnoreEmitWebpackPlugin from 'ignore-emit-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import path from 'path'

import { styleConfigFactory } from '../loaders'

export const typedStylesConfigFactory = ({ raw, filePaths, outputPath }: { raw?: boolean; filePaths: string[]; outputPath?: string }) => {
  const fileRegexes = filePaths.map(
    (filePath) => new RegExp(`^((?!${path.basename(filePath).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}).)*$`),
  )
  return {
    mode: 'development',
    entry: { bundle: filePaths },
    devtool: false,
    output: outputPath ? { path: outputPath } : undefined,
    module: {
      rules: [
        {
          test: /\.(pcss|css)$/,
          use: styleConfigFactory({ raw, typedStyles: true, parser: 'postcss', extract: !!outputPath }),
        },
        {
          test: /\.(scss|sass)$/,
          use: styleConfigFactory({ raw, typedStyles: true, parser: 'postcss-scss', extract: !!outputPath }),
        },
      ],
    },
    // `styleConfigFactory({ extract: true })` (i.e. `!raw && outputPath`) wires in
    // `MiniCssExtractPlugin.loader` - the plugin itself still has to be registered here, or the
    // loader errors with "You forgot to add 'mini-css-extract-plugin' plugin". `raw: true` never
    // reaches that loader (see styleConfigFactory), so the plugin is only needed when `!raw`.
    plugins: [new IgnoreEmitWebpackPlugin(fileRegexes), ...(!raw && outputPath ? [new MiniCssExtractPlugin()] : [])],
  }
}
