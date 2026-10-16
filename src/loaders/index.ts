import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import enhancedResolve from 'enhanced-resolve'
import codeImport from 'remark-code-import'
import imageUnwrap from 'rehype-unwrap-images'
import imageImport from 'remark-embed-images'

// Resolving `./WebcomponentStyleLoader`'s absolute path needs `require.resolve` (extensionless, so it
// finds the `.ts` source under ts-jest and the compiled `.js` in the built output alike) - delegated
// to a plain `.cjs` sibling since this file's own build output has no `require` at all (see that
// file for why).
import WebcomponentStyleLoader from './resolveWebcomponentStyleLoaderPath.cjs'

// `enhanced-resolve`'s named exports aren't statically analyzable by Node's CJS/ESM interop
// (cjs-module-lexer) at runtime, so `import { create } from 'enhanced-resolve'` throws
// `SyntaxError: Named export 'create' not found` for real ESM consumers - destructuring off the
// default import is the Node-recommended workaround.
const { create: createEnhancedResolver } = enhancedResolve

export const styleConfigFactory = ({
  raw = false,
  extract = false,
  sourceMap = false,
  typedStyles = false,
  modules = undefined as
    | { localIdentName?: string; mappings?: { filter: string; transform: (p: string) => string }[] }
    | (boolean & { localIdentName?: never; mappings?: never })
    | undefined,
  parser = undefined as 'postcss' | 'postcss-scss' | undefined,
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

  const resolveCssImport = createEnhancedResolver.sync({
    extensions: ['.css'],
    modules: ['node_modules'],
    alias: aliases,
  })

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
              resolve: (id: string, basedir: string) => resolveCssImport(basedir, id),
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
