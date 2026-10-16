import path from 'path'
import { validate } from 'schema-utils'
import { type JSONSchema7 } from 'json-schema'
import { type LoaderDefinitionFunction, type PitchLoaderDefinitionFunction } from 'webpack'

interface IWebcomponentStyleLoaderOptions {
  pathPrefix?: string
  emit?: boolean
  typings?: boolean
  raw?: boolean
  named?: boolean
}

// The compiler's outputFileSystem is only officially typed with async (callback) methods, but in
// practice it's either Node's real `fs` or a MemoryFS - both also expose these Sync equivalents.
// Same compromise @enhanced-dom/intl's webpack.plugin.ts makes for the same reason.
interface ISyncFileSystem {
  existsSync: (pathOfItem: string) => boolean
  readFileSync: (pathOfItem: string) => Buffer
  writeFileSync: (pathOfItem: string, contents: string) => void
  mkdirSync: (pathOfItem: string, options?: { recursive?: boolean }) => void
}

type LoaderContextType = ThisParameterType<LoaderDefinitionFunction<IWebcomponentStyleLoaderOptions>>

const schema: JSONSchema7 = {
  type: 'object',
  properties: {
    pathPrefix: {
      type: 'string',
    },
    emit: {
      type: 'boolean',
    },
    typings: {
      type: 'boolean',
    },
    raw: {
      type: 'boolean',
    },
    named: {
      type: 'boolean',
    },
  },
  additionalProperties: false,
}

class WebcomponentStyleLoaderHandler {
  private _context: LoaderContextType
  private _options: IWebcomponentStyleLoaderOptions

  constructor(context: LoaderContextType) {
    this._context = context
    this._options = context.getOptions()
    validate(schema, this._options, { name: 'webcomponent-styles' })
  }

  private get _typingsCode(): string {
    return Object.keys(this._context.data)
      .map((exportName) => `export const ${exportName}: string;`)
      .join('\n')
  }

  private get _transformedAssetPath(): string {
    const pathPrefix = this._options.pathPrefix ?? path.join(process.cwd(), 'src')
    return path.join(path.dirname(this._context.resourcePath), `${path.basename(this._context.resourcePath)}.js`).replace(pathPrefix, '')
  }

  private get _transformedDtsPath(): string {
    const pathPrefix = this._options.pathPrefix ?? path.join(process.cwd(), 'src')
    return path.join(path.dirname(this._context.resourcePath), `${path.basename(this._context.resourcePath)}.d.ts`).replace(pathPrefix, '')
  }

  private _emitTransformedAssets() {
    const transformedCode = Object.entries(this._context.data)
      .map(([exportName, exportValue]) => `export const ${exportName} = ${exportValue}`)
      .join('\n')
    this._context.emitFile(this._transformedAssetPath, transformedCode)
    if (this._options.typings) {
      this._context.emitFile(this._transformedDtsPath, this._typingsCode)
    }
  }

  private _writeTypingsFile() {
    const dtsDir = path.dirname(this._context.resourcePath)
    const dtsPath = path.join(dtsDir, `${path.basename(this._context.resourcePath)}.d.ts`)
    const typingsCode = this._typingsCode
    const outputFs = this._context._compiler!.outputFileSystem as unknown as ISyncFileSystem
    if (!outputFs.existsSync(dtsDir)) {
      outputFs.mkdirSync(dtsDir, { recursive: true })
    }
    if (!outputFs.existsSync(dtsPath) || outputFs.readFileSync(dtsPath).toString() !== typingsCode) {
      outputFs.writeFileSync(dtsPath, typingsCode)
    }
  }

  run(content: string): string {
    if (this._options.emit) {
      this._emitTransformedAssets()
    }
    if (this._options.typings) {
      this._writeTypingsFile()
    }
    return this._options.raw ? content + `export var css = ${this._context.data.css};\n` : content
  }

  async pitch(request: string): Promise<void> {
    // `this.data` is only shared between the pitch and normal phases once something writes to it -
    // it isn't pre-initialized to an object, so the normal phase would see `undefined` if there are
    // no named exports to forward below (e.g. no CSS-module class names in this stylesheet). webpack
    // types `data` as `readonly`; the cast below is only to assign through that annotation.
    const context = this._context as { data: Record<string, unknown> }
    context.data ??= {}
    const result = await this._context.importModule(this._context.resourcePath + '.webpack[javascript/auto]' + '!=!' + request)
    const { default: defaultExport, ...otherExports } = result
    if (this._options.raw) {
      this._context.data.css = `\`${defaultExport.toString()}\``
    }
    Object.entries(otherExports).forEach(
      ([exportName, exportValue]) => (this._context.data[exportName] = `'${(exportValue as string).replace(/^["|'](.+)["|']$/, '$1')}'`),
    )
  }
}

// Exported as a plain `default` function plus a top-level named `pitch` export (webpack's own
// `LoaderModule` shape: `{ default?, pitch?, raw? }`) rather than `loader.pitch = pitch` - this
// package's dist build is real ESM (`"type": "module"`), and loader-runner's ES-module loading path
// reads `module.pitch` off the import's top level, never `module.default.pitch`.
const loader: LoaderDefinitionFunction<IWebcomponentStyleLoaderOptions> = function (content) {
  return new WebcomponentStyleLoaderHandler(this).run(content)
}

// PitchLoaderDefinitionFunction's return type doesn't include Promise<void>, only
// Promise<string | Buffer> - but a pitch loader that only stashes data on `this.data` for the
// normal phase (rather than short-circuiting it) is expected to resolve to nothing. The cast
// below is only about that return-type gap; `this` is still fully typed inside the function body.
async function pitch(this: ThisParameterType<PitchLoaderDefinitionFunction<IWebcomponentStyleLoaderOptions>>, request: string) {
  await new WebcomponentStyleLoaderHandler(this).pitch(request)
}

export default loader
export { pitch }
