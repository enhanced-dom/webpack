import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import createResolver from 'postcss-import-webpack-resolver'
const WebcomponentStyleLoader = require.resolve('./WebcomponentStyleLoader')
import codeImport from 'remark-code-import'
import imageUnwrap from 'remark-unwrap-images'
import imageImport from 'remark-embed-images'

export const styleConfigFactory = ({
  raw = false,
  extract = false,
  sourceMap = false,
  typedStyles = false,
  modules = undefined as
    | { localIdentName?: string; mappings?: { filter: string; transform: (p: string) => string }[] }
    | (boolean & { localIdentName?: never; mappings?: never }),
  parser = undefined as 'postcss' | 'postcss-scss',
  aliases = {} as Record<string, string>,
} = {}) => {
  const loaders = []

  if (raw) {
    loaders.push({
      loader: WebcomponentStyleLoader,
      options: {
        raw: true,
        emit: extract,
        typings: typedStyles,
      },
    })
  } else {
    if (extract) {
      loaders.push({
        loader: MiniCssExtractPlugin.loader,
        options: {
          publicPath: './',
        },
      })
    } else {
      loaders.push({ loader: 'style-loader' })
    }

    if (typedStyles) {
      loaders.push({
        loader: WebcomponentStyleLoader,
        options: {
          raw: false,
          emit: false,
          typings: true,
        },
      })
    }
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
                const mappings = modules?.mappings ?? []
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
          'postcss-normalize-whitespace',
          'postcss-discard-comments',
          [
            'postcss-import',
            {
              resolve: createResolver({
                alias: aliases,
              }),
              modules: ['./node_modules', 'node_modules'],
            },
          ],
          'postcss-nested',
          // 'autoprefixer',
          [
            'postcss-preset-env',
            {
              stage: 3,
            },
          ],
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

export const fontExtensions = ['ttf', 'eot', 'woff', 'woff2']
export const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico']
export const assetExtensions = (extensions = [...imageExtensions, ...fontExtensions] as string[]) =>
  new RegExp(`\\.(${extensions.join('|')})(\\?.*$|$)?$`)

export const babelConfigFactory = ({ babel = undefined as any }) => {
  const loaders = [{ loader: 'babel-loader', options: babel }]
  return loaders
}

export const markdownConfigFactory = ({
  babel,
  remark = [],
  rehype = [],
  useProvider = false,
}: { babel?: any; remark?: any[]; rehype?: any[]; useProvider?: boolean } = {}) => {
  const loaders = []

  if (babel) {
    loaders.push(...babelConfigFactory({ babel }))
    loaders.push({
      loader: '@mdx-js/loader',
      options: {
        remarkPlugins: [codeImport, imageImport, imageUnwrap, ...remark],
        rehypePlugins: rehype,
        providerImportSource: useProvider ? '@mdx-js/react' : undefined,
      },
    })
  } else {
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
