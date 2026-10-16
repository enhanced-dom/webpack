import HtmlWebpackPlugin, { type Hooks, type HtmlTagObject } from 'html-webpack-plugin'
import { type AsyncSeriesWaterfallHook } from 'tapable'
import { type Chunk, type Compilation, type Compiler, type WebpackPluginInstance } from 'webpack'
import path from 'path'

type AsyncSeriesWaterfallHookDataType<T> = T extends AsyncSeriesWaterfallHook<infer R> ? R : never
type TemplateExecutionDataType = AsyncSeriesWaterfallHookDataType<Hooks['afterTemplateExecution']>

// The compiler's inputFileSystem is only officially typed with async (callback) methods, but in
// practice it's either Node's real `fs` or a MemoryFS - both also expose these Sync equivalents.
// Same compromise WebcomponentStyleLoader.ts and @enhanced-dom/intl's webpack.plugin.ts make for
// the same reason.
interface ISyncFileSystem {
  existsSync: (pathOfItem: string) => boolean
  readFileSync: (pathOfItem: string, encoding: string) => string
}

// Ported from `escape-string-regexp` (inlined rather than taken as a dependency, since newer
// majors of these tiny sindresorhus utils are ESM-only).
// ATTRIBUTION: COPY | escape-string-regexp | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com). MIT Licensed.
const escapeRegExp = (value: string) => value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')

// Ported from `slash` (same reasoning as escapeRegExp above).
// ATTRIBUTION: COPY | slash | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com). MIT Licensed.
// eslint-disable-next-line no-control-regex
const toPosixPath = (value: string) => (/[^\x00-\x80]+/.test(value) ? value : value.replace(/\\/g, '/'))

// Ported from `source-map-url` (same reasoning as escapeRegExp above); only the lookup this
// plugin actually uses (`getFrom`) is kept.
// ATTRIBUTION: COPY | source-map-url | Copyright 2014 Simon Lydell. X11 ("MIT") Licensed.
const sourceMappingUrlRegExp = (() => {
  const inner = `[#@] sourceMappingURL=([^\\s'"]*)`
  return new RegExp(`(?:/\\*(?:\\s*\r?\n(?://)?)?(?:${inner})\\s*\\*/|//(?:${inner}))\\s*`)
})()
const getSourceMappingUrl = (code: string) => {
  const match = code.match(sourceMappingUrlRegExp)
  return match ? match[1] || match[2] || '' : null
}

// Inserts immediately before the real closing tag - found by taking the LAST match of
// `</tagName>` in the document, not the first. An inlined <script>'s own source can legitimately
// contain that same substring as plain text (e.g. an embedded HTML template string inside a
// Worker's source, unrelated to actual document structure) well before the document's real
// closing tag; matching the first occurrence would splice the insertion into the middle of that
// script's text instead of after it, corrupting the script the browser was supposed to run.
const insertBeforeClosingTag = (html: string, tagName: 'head' | 'body', insertion: string) => {
  const closingTagRegExp = new RegExp(`</${tagName}\\s*>`, 'gi')
  let lastMatch: RegExpExecArray | null = null
  let match: RegExpExecArray | null
  while ((match = closingTagRegExp.exec(html))) {
    lastMatch = match
  }
  return lastMatch ? `${html.slice(0, lastMatch.index)}${insertion}${html.slice(lastMatch.index)}` : `${html}${insertion}`
}

const buildAdditionalAssetMarkup = (wrapper: 'comment' | 'script', assetName: string, encoded: string) => {
  if (wrapper === 'comment') {
    return `<!--data-asset-name="${assetName}" data-encoding="base64" ${encoded}-->`
  }
  return `<script type="application/octet-stream" data-asset-name="${assetName}" data-encoding="base64">${encoded}</script>`
}

class HtmlInlineSourcePlugin implements WebpackPluginInstance {
  assetsRegExp?: RegExp
  faviconPath?: string
  htmlAssetName?: string
  inlinedChunks?: Set<Chunk | string>
  additionalAssets?: { pattern: RegExp; wrapper: 'comment' | 'script'; container: 'head' | 'body' | 'footer' }[]

  // Rewrites a `//# sourceMappingURL=...`/`/*# sourceMappingURL=... */` comment (if any) in an
  // asset's source to be relative to the site root instead of the asset's own directory, since
  // inlining moves the asset's content into the html document rather than serving it from
  // alongside its sourcemap.
  // Adapted from `html-webpack-inline-source-plugin`'s method of the same name.
  // ATTRIBUTION: ADAPTATION | html-webpack-inline-source-plugin | Copyright (c) 2016 Jan Nicklas. MIT Licensed.
  resolveSourceMaps(compilation: Compilation, assetName: string, asset: Compilation['assets'][string]): string {
    const source = asset.source()
    const out = compilation.outputOptions
    const assetPath = path.join(out.path, assetName)
    const sourceText = typeof source === 'string' ? source : source.toString()
    const mapUrlOriginal = getSourceMappingUrl(sourceText)
    if (!mapUrlOriginal || mapUrlOriginal.indexOf('data:') === 0 || mapUrlOriginal.indexOf('/') === 0) {
      return sourceText
    }
    const assetDir = path.dirname(assetPath)
    const mapPath = path.join(assetDir, mapUrlOriginal)
    const mapPathRelative = path.relative(out.path, mapPath)
    const publicPath = typeof out.publicPath === 'string' ? out.publicPath : ''
    const mapUrlCorrected = toPosixPath(path.join(publicPath, mapPathRelative))
    const regex = new RegExp(`${escapeRegExp(mapUrlOriginal)}(\\s*(?:\\*/)?\\s*$)`)
    return sourceText.replace(regex, (_match, group) => `${mapUrlCorrected}${group}`)
  }

  // Adapted from `html-webpack-inline-source-plugin`'s method of the same name.
  // ATTRIBUTION: ADAPTATION | html-webpack-inline-source-plugin | Copyright (c) 2016 Jan Nicklas. MIT Licensed.
  processTag(compilation: Compilation, regex: RegExp, tag: HtmlTagObject): HtmlTagObject {
    let assetUrl: string | undefined
    let resultTag = tag

    if (tag.tagName === 'script' && regex.test(tag.attributes.src as string)) {
      assetUrl = tag.attributes.src as string
      resultTag = { tagName: 'script', voidTag: false, meta: {}, attributes: { type: 'text/javascript' } }
    } else if (tag.tagName === 'link' && regex.test(tag.attributes.href as string)) {
      assetUrl = tag.attributes.href as string
      resultTag = { tagName: 'style', voidTag: false, meta: {}, attributes: { type: 'text/css' } }
    }

    if (assetUrl) {
      const publicUrlPrefix = typeof compilation.outputOptions.publicPath === 'string' ? compilation.outputOptions.publicPath : ''
      const assetName = path.posix.relative(publicUrlPrefix, assetUrl)
      const asset = compilation.assets[assetName]
      if (!asset) {
        return resultTag
      }
      const updatedSource = this.resolveSourceMaps(compilation, assetName, asset)
      resultTag.innerHTML = resultTag.tagName === 'script' ? updatedSource.replace(/(<)(\/script>)/g, '\\x3C$2') : updatedSource
    }

    return resultTag
  }

  // Adapted from `html-webpack-inline-source-plugin`'s method of the same name.
  // ATTRIBUTION: ADAPTATION | html-webpack-inline-source-plugin | Copyright (c) 2016 Jan Nicklas. MIT Licensed.
  processTags(compilation: Compilation, pluginData: TemplateExecutionDataType): TemplateExecutionDataType {
    const assetsRegExp = this.assetsRegExp
    if (!assetsRegExp) {
      return pluginData
    }
    const headTags: typeof pluginData.headTags = []
    const bodyTags: typeof pluginData.headTags = []

    const { publicPath } = compilation.outputOptions
    const publicUrlPrefix = typeof publicPath === 'string' ? publicPath : ''

    // Mirrors processTag's own match condition (same regex, same tag-type checks) to record
    // exactly which asset this tag will cause to be inlined, if any - without this, the
    // processAssets hook below has no way to know which assets were actually touched. We record
    // the owning CHUNK rather than the asset name: a chunk's identity is stable even when its
    // contenthash (and therefore filename) is recomputed later by minification, so resolving
    // `chunk.files` when deleting - instead of replaying a filename captured now - survives that
    // timing gap.
    const trackInlinedAsset = (tag: (typeof pluginData.headTags)[number]) => {
      let assetUrl: string | undefined
      if (tag.tagName === 'script' && assetsRegExp.test(tag.attributes.src as string)) {
        assetUrl = tag.attributes.src as string
      } else if (tag.tagName === 'link' && assetsRegExp.test(tag.attributes.href as string)) {
        assetUrl = tag.attributes.href as string
      }
      if (!assetUrl) {
        return
      }
      const assetName = path.posix.relative(publicUrlPrefix, assetUrl)
      const owningChunk = Array.from(compilation.chunks).find((chunk) => chunk.files.has(assetName))
      this.inlinedChunks = this.inlinedChunks ?? new Set()
      this.inlinedChunks.add(owningChunk ?? assetName)
    }

    pluginData.headTags.forEach((tag) => {
      trackInlinedAsset(tag)
      headTags.push(this.processTag(compilation, assetsRegExp, tag))
    })

    pluginData.bodyTags.forEach((tag) => {
      trackInlinedAsset(tag)
      bodyTags.push(this.processTag(compilation, assetsRegExp, tag))
    })

    return { ...pluginData, headTags, bodyTags }
  }

  // Assets that exist in the compilation but were never referenced by a <script>/<link> tag (e.g.
  // a license-notices file written directly via compilation.emitAsset) have nothing for
  // processTags to match against - embed them explicitly instead, keyed by asset name so consuming
  // code can read them back out of the DOM at runtime. `wrapper` picks the markup (an opaque,
  // non-executing <script>, or a plain HTML comment - base64 never contains `--`, so it can't
  // prematurely close the comment); `container` picks where it lands.
  //
  // This runs against the already-emitted HTML asset (see the processAssets hook below), not
  // against pluginData inside afterTemplateExecution - some plugins that emit matchable assets
  // (e.g. webpack-license-plugin, which writes its notices file at PROCESS_ASSETS_STAGE_ANALYSE)
  // do so well after html-webpack-plugin has already rendered and emitted its HTML, so scanning
  // compilation.assets from inside afterTemplateExecution would silently miss them. Since there's
  // no headTags/bodyTags array to push a HtmlTagObject into at this point, 'script'-wrapped markup
  // is spliced into the html string the same way 'comment'-wrapped markup already was.
  processAdditionalAssets(compilation: Compilation, html: string): string {
    let result = html

    const additionalAssets = this.additionalAssets ?? []
    additionalAssets.forEach(({ pattern, wrapper, container }) => {
      Object.keys(compilation.assets)
        .filter((name) => name !== this.htmlAssetName && pattern.test(name))
        .forEach((name) => {
          const encoded = compilation.assets[name]!.buffer().toString('base64')
          this.inlinedChunks = this.inlinedChunks ?? new Set()
          this.inlinedChunks.add(name)

          const markup = buildAdditionalAssetMarkup(wrapper, name, encoded)
          result = container === 'head' || container === 'body' ? insertBeforeClosingTag(result, container, markup) : `${result}${markup}`
        })
    })

    return result
  }

  apply(compiler: Compiler) {
    this.assetsRegExp = undefined
    this.faviconPath = undefined
    this.inlinedChunks = new Set<Chunk | string>()

    compiler.hooks.compilation.tap('html-inline-source-plugin', (compilation) => {
      HtmlWebpackPlugin.getHooks(compilation).afterTemplateExecution.tapAsync('html-inline-source-plugin', (htmlPluginData, callback) => {
        this.assetsRegExp = new RegExp('.(js|css)$')
        this.htmlAssetName = htmlPluginData.outputName
        const result = this.processTags(compilation, htmlPluginData)

        const favicon = htmlPluginData.plugin.options?.favicon
        const inputFs = compiler.inputFileSystem as unknown as ISyncFileSystem
        if (!favicon || !inputFs.existsSync(favicon)) {
          return callback(null, result)
        }
        const faviconTag = result.headTags.find((tag) => tag.tagName === 'link' && tag.attributes.rel === 'icon')
        if (faviconTag) {
          this.faviconPath = faviconTag.attributes.href as string
          faviconTag.attributes.href = `data:image/x-icon;base64, ${inputFs.readFileSync(favicon, 'base64')}`
        }
        callback(null, result)
      })

      // Patches the already-emitted HTML asset directly (see processAdditionalAssets' own comment
      // for why this can't happen inside afterTemplateExecution above) and must run strictly
      // before the deletion pass below - same processAssets stage, but tapped first, so Tapable's
      // stable same-stage ordering runs this one first.
      compilation.hooks.processAssets.tap(
        { name: 'html-inline-source-plugin', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT },
        () => {
          if (!this.htmlAssetName) return
          const htmlAsset = compilation.assets[this.htmlAssetName]
          if (!htmlAsset) return
          const html = this.processAdditionalAssets(compilation, htmlAsset.source().toString())
          compilation.updateAsset(this.htmlAssetName, new compiler.webpack.sources.RawSource(html))
        },
      )

      // Only remove assets that were actually inlined into the HTML above. Blanket-matching by
      // extension would also delete unrelated .js/.css assets that were never inlining candidates
      // in the first place - e.g. a Worker chunk, which browsers load via the separate Worker API
      // rather than a <script> tag, so html-webpack-plugin never generates a tag for it.
      // PROCESS_ASSETS_STAGE_REPORT is the last processAssets stage - it still runs before
      // sealing freezes compilation.assets, so chunk.files here already reflects any earlier
      // stage's rename (e.g. Terser's contenthash recompute).
      compilation.hooks.processAssets.tap(
        // Read the stage constant off compiler.webpack rather than importing Compilation as a
        // value from 'webpack' directly - the plugin then keeps working correctly even if the
        // host project resolves a different webpack instance than the one in this package's own
        // node_modules (the standard reason webpack plugins avoid a direct `require('webpack')`).
        { name: 'html-inline-source-plugin', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT },
        () => {
          this.inlinedChunks?.forEach((chunkOrName) => {
            if (typeof chunkOrName === 'string') {
              compilation.deleteAsset(chunkOrName)
              return
            }
            chunkOrName.files.forEach((file) => {
              compilation.deleteAsset(file)
            })
          })
          const faviconFile = this.faviconPath?.split(path.sep)?.pop()
          if (faviconFile) {
            compilation.deleteAsset(faviconFile)
          }
        },
      )
    })
  }
}

export default HtmlInlineSourcePlugin
