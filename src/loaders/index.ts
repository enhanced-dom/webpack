import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import path from 'path'
import createResolver from 'postcss-import-webpack-resolver'
const ExposeCssSourceLoader = require.resolve('./ExposeCssSourceLoader')
// @ts-ignore
import codeImport from 'remark-code-import'
// @ts-ignore
import imageUnwrap from 'remark-unwrap-images'
// @ts-ignore
import imageImport from 'remark-embed-images'

export const styleConfigFactory = ({
  raw = false as boolean,
  extract = false,
  sourceMap = false,
  typedStyles = false,
  modules = undefined as { localIdentName: string; mappings: { filter: string; transform: (p: string) => string }[] },
  parser = undefined as 'postcss' | 'postcss-scss',
  aliases = {} as Record<string, string>,
} = {}) => {
  const loaders = []

  if (raw) {
    loaders.push({
      loader: ExposeCssSourceLoader,
    })
  }

  const finalStyleLoader = extract
    ? {
        loader: MiniCssExtractPlugin.loader,
        options: {
          publicPath: './',
        },
      }
    : { loader: 'style-loader' }

  loaders.push(finalStyleLoader)

  if (typedStyles) {
    loaders.push({
      loader: 'dts-css-modules-loader',
      options: {
        namedExport: true,
        banner: raw ? 'export const _source: string;' : undefined,
      },
    })
  }

  const cssLoader = {
    loader: 'css-loader',
    options: {
      sourceMap,
      ...(modules || typedStyles
        ? {
            esModule: true,
            modules: {
              localIdentName: modules?.localIdentName ?? '[local]_[hash:base64:5]',
              getLocalIdent: (loaderContext: { resourcePath: string }, _: any, localName: string) => {
                const { resourcePath } = loaderContext
                const { mappings = [] } = modules ?? {}
                const mapping = mappings.find(({ filter }) => resourcePath.includes(filter))
                if (!mapping) {
                  return undefined // this will trigger the default css-loader getLocalIdent function
                }
                return mapping.transform(localName)
              },
              exportLocalsConvention: 'camelCaseOnly',
              namedExport: true,
            },
            sourceMap,
          }
        : { modules: false }),
    },
  }

  loaders.push(cssLoader)

  const resolveUrlLoader = {
    loader: 'resolve-url-loader',
  }

  loaders.push(resolveUrlLoader)

  const postcssLoader = {
    loader: 'postcss-loader',
    options: {
      sourceMap: true,
      postcssOptions: {
        parser,
        plugins: [
          [
            'postcss-import',
            {
              resolve: createResolver({
                alias: aliases,
              }),
              modules: ['./node_modules', 'node_modules'],
            },
          ],
          'postcss-advanced-variables',
          'postcss-nested',
          'autoprefixer',
          // ['postcss-preset-env', {
          //   browsers: ['last 2 versions']
          // }]
        ],
      },
    },
  }

  loaders.push(postcssLoader)

  return loaders
}

export const nullConfigFactory = ({ rules = [] as RegExp[] } = {}) => {
  return rules.map((rule) => ({
    test: rule,
    use: 'null-loader',
    enforce: 'post',
  }))
}

export const assetsConfigFactory = ({ embed = false, extraConfig = {}, pathPrefix = 'static' } = {}) => {
  return embed
    ? [{ loader: 'url-loader', options: { esModule: false, ...extraConfig } }]
    : [{ loader: 'file-loader', options: { esModule: false, name: path.join(pathPrefix, '[name].[ext]'), ...extraConfig } }]
}

assetsConfigFactory.fontExtensions = ['ttf', 'eot', 'woff', 'woff2']
assetsConfigFactory.imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg']
assetsConfigFactory.extensions = (
  extensions = [...assetsConfigFactory.imageExtensions, ...assetsConfigFactory.fontExtensions] as string[],
) => new RegExp(`\\.(${extensions.join('|')})(\\?.*$|$)?$`)

export const babelConfigFactory = ({ babel = undefined as any, cache = false as boolean | Record<string, any> } = {}) => {
  const loaders = [{ loader: 'babel-loader', options: babel }]
  if (cache) {
    loaders.unshift({ loader: 'cache-loader', options: { cacheDirectory: '.babelcache', ...(cache as Record<string, any>) } })
  }
  return loaders
}

export const markdownConfigFactory = ({
  babel,
  cache,
  remark = [],
}: { babel?: any; cache?: boolean | Record<string, any>; remark?: any[] } = {}) => {
  const loaders = []

  if (babel) {
    loaders.push(...babelConfigFactory({ babel, cache }))
    loaders.push({
      loader: '@mdx-js/loader',
      options: {
        remarkPlugins: [codeImport, imageImport, imageUnwrap, ...remark],
      },
    })
  } else {
    if (cache) {
      loaders.push({ loader: 'cache-loader', options: { cacheDirectory: '.markdowncache', ...(cache as Record<string, any>) } })
    }
    loaders.push(
      {
        loader: 'html-loader',
      },
      {
        loader: 'markdown-loader',
      },
    )
  }
  return loaders
}
