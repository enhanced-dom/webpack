import path from 'path'
import fs from 'fs'
import { validate } from 'schema-utils'
import { type JSONSchema7 } from 'json-schema' // eslint-disable-line import/no-unresolved

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

const loader = function (content: string) {
  const options = this.getOptions()
  validate(schema, options, { name: 'webcomponent-styles' })

  if (options.emit) {
    const pathPrefix = options.pathPrefix ?? path.join(process.cwd(), 'src')
    const transformedAssetPath = path
      .join(path.dirname(this.resourcePath), `${path.basename(this.resourcePath)}.js`)
      .replace(pathPrefix, '')
    const transformedCode = Object.entries(this.data)
      .map(([exportName, exportValue]: [string, string]) => `export const ${exportName} = ${exportValue}`)
      .join('\n')
    this.emitFile(transformedAssetPath, transformedCode)
    if (options.typings) {
      const transformedDtsPath = path
        .join(path.dirname(this.resourcePath), `${path.basename(this.resourcePath)}.d.ts`)
        .replace(pathPrefix, '')
      const typingsCode = [...Object.keys(this.data).map((exportName) => `export const ${exportName}: string;`)].join('\n')
      this.emitFile(transformedDtsPath, typingsCode)
    }
  }
  if (options.typings) {
    const dtsPath = path.join(path.dirname(this.resourcePath), `${path.basename(this.resourcePath)}.d.ts`)
    const typingsCode = [...Object.keys(this.data).map((exportName) => `export const ${exportName}: string;`)].join('\n')
    if (!fs.existsSync(dtsPath) || fs.readFileSync(dtsPath, 'utf-8') != typingsCode) {
      fs.writeFileSync(dtsPath, typingsCode, 'utf8')
    }
  }

  return options.raw ? content + `export var css = ${this.data.css};\n` : content
}

loader.pitch = async function (request: string) {
  const options = this.getOptions()
  validate(schema, options, { name: 'webcomponent-styles' })
  const result = await this.importModule(this.resourcePath + '.webpack[javascript/auto]' + '!=!' + request)
  const { default: defaultExport, ...otherExports } = result
  if (options.raw) {
    this.data.css = `\`${defaultExport.toString()}\``
  }
  Object.entries(otherExports).forEach(
    ([exportName, exportValue]: [string, string]) => (this.data[exportName] = `'${exportValue.replace(/^["|'](.+)["|']$/, '$1')}'`),
  )
}

export = loader
