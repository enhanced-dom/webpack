import IgnoreEmitWebpackPlugin from 'ignore-emit-webpack-plugin'
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
    plugins: [new IgnoreEmitWebpackPlugin(fileRegexes)],
  }
}
