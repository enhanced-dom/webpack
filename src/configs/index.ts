import IgnoreEmitWebpackPlugin from 'ignore-emit-webpack-plugin'

import { styleConfigFactory } from '../loaders'

export const typedStylesConfigFactory = ({ raw, filesPaths }: { raw?: boolean; filesPaths: string[] }) => {
  return {
    mode: 'production',
    entry: { bundle: filesPaths },
    devtool: false,
    watch: true,
    module: {
      rules: [
        {
          test: /\.(pcss|css)$/,
          use: styleConfigFactory({ raw, typedStyles: true, parser: 'postcss', modules: true }),
        },
        {
          test: /\.(scss|sass)$/,
          use: styleConfigFactory({ raw, typedStyles: true, parser: 'postcss-scss', modules: true }),
        },
      ],
    },
    plugins: [new IgnoreEmitWebpackPlugin(/.+/)],
  }
}
