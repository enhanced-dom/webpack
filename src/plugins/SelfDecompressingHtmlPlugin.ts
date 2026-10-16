import HtmlWebpackPlugin from 'html-webpack-plugin'
import { type Compilation, type Compiler, type WebpackPluginInstance } from 'webpack'
import zlib from 'zlib'

const gzip = (text: string): Promise<Buffer> =>
  new Promise((resolve, reject) => zlib.gzip(text, (err, buf) => (err ? reject(err) : resolve(buf))))

const bodyRegExp = /<body([^>]*)>([\s\S]*)<\/body>/i

// Shown in place of the real body while it decompresses - a body this size can take a visible
// moment to inflate, so leaving it blank would look broken. Overridable via the plugin's
// `loadingMarkup` option; this default covers both the transient styling and the spinner markup
// in one block, since neither has any meaning outside the other.
const defaultLoadingMarkup = `<style>
  :root { color-scheme: light dark; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    color: #111;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #111; color: #eee; }
  }
  .spinner {
    width: 2.5rem;
    height: 2.5rem;
    border: 3px solid rgba(128, 128, 128, 0.3);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
<div class="spinner"></div>`

// Inflates the gzipped, base64-encoded original body back into the page once it's ready, then
// swaps it in for the loading markup above. Rebuilds any <script> nodes via createElement/
// appendChild rather than assigning innerHTML/appendChild-ing template.content's parsed nodes
// directly - browsers deliberately don't execute a <script> that arrives either way, only one
// actually inserted via the DOM API, and the real body's inlined app bundle <script> has to run.
const bootstrapScript = (base64: string) => `<script>
(async () => {
  try {
    const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0))
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    const bodyHtml = await new Response(stream).text()
    const template = document.createElement('template')
    template.innerHTML = bodyHtml
    document.body.textContent = ''
    Array.from(template.content.childNodes).forEach((node) => {
      if (node.nodeName === 'SCRIPT') {
        const script = document.createElement('script')
        for (const attr of node.attributes) script.setAttribute(attr.name, attr.value)
        script.textContent = node.textContent
        document.body.appendChild(script)
      } else {
        document.body.appendChild(node)
      }
    })
  } catch (err) {
    document.body.textContent = 'Failed to decompress this page: ' + err.message
  }
})()
</script>`

// Gzips an HTML asset's <body> content and replaces it with a small loading placeholder plus a
// script that inflates and reinstates the original body client-side, via the browser's native
// DecompressionStream - <head> (title, meta tags, favicon, any inlined <style>/<link>) is left
// completely untouched, since html-webpack-plugin/htmlConfigFactory already built that correctly
// and there's no reason to reconstruct it. Unlike a build-time-only gzip step (e.g. a .gz sidecar
// file), this needs no server/Content-Encoding support to pay off - decompression happens
// entirely client-side in the loaded page - so it works for content served statically or opened
// directly from disk. Only replaces the body when the wrapped version actually comes out
// smaller, since gzip + base64's ~33% overhead can lose against a small/already-dense body.
class SelfDecompressingHtmlPlugin implements WebpackPluginInstance {
  htmlAssetName?: string
  loadingMarkup: string

  constructor({ loadingMarkup = defaultLoadingMarkup }: { loadingMarkup?: string } = {}) {
    this.loadingMarkup = loadingMarkup
  }

  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap('self-decompressing-html-plugin', (compilation: Compilation) => {
      // Capture the exact asset this plugin should act on - the one page the paired
      // HtmlWebpackPlugin instance in this same htmlConfigFactory() call produced - the same way
      // HtmlInlineSourcePlugin does. A pattern matched against all of compilation.assets (as an
      // earlier version of this plugin did) would misfire in a multi-page build with several
      // HtmlWebpackPlugin instances, touching pages this plugin instance has nothing to do with.
      HtmlWebpackPlugin.getHooks(compilation).afterTemplateExecution.tap('self-decompressing-html-plugin', (htmlPluginData) => {
        this.htmlAssetName = htmlPluginData.outputName
        return htmlPluginData
      })

      // PROCESS_ASSETS_STAGE_REPORT is the last named processAssets stage - tapping a further
      // 1000 past it, rather than at that same stage, guarantees this always runs after any
      // other plugin's REPORT-stage work (e.g. an html-inlining plugin still rewriting the html
      // asset at that same stage) regardless of plugin registration order, since this asset must
      // be genuinely final before its body is gzipped.
      compilation.hooks.processAssets.tapPromise(
        { name: 'self-decompressing-html-plugin', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT + 1000 },
        async () => {
          if (!this.htmlAssetName) return
          const htmlAsset = compilation.assets[this.htmlAssetName]
          if (!htmlAsset) return

          const html = htmlAsset.source().toString()
          const match = html.match(bodyRegExp)
          if (!match) return

          const [fullMatch, bodyAttrs, bodyContent] = match
          if (bodyContent === undefined) return
          const gzipped = await gzip(bodyContent)
          const newBody = `<body${bodyAttrs}>${this.loadingMarkup}${bootstrapScript(gzipped.toString('base64'))}</body>`
          const wrapped = html.slice(0, match.index) + newBody + html.slice(match.index! + fullMatch.length)
          if (wrapped.length >= html.length) return

          compilation.updateAsset(this.htmlAssetName, new compiler.webpack.sources.RawSource(wrapped))
        },
      )
    })
  }
}

export default SelfDecompressingHtmlPlugin
