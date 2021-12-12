import { stringifyRequest } from 'loader-utils'

const loader = function () { }
const styleLoader = require('style-loader')
const uniqueId = require('lodash').uniqueId

loader.pitch = function pitch(remainingRequest: string) {
  if (this.cacheable) {
    this.cacheable()
  }
  const result: string = styleLoader.pitch.call(this, remainingRequest)
  const index = result.indexOf('var update = API(content, options)')
  if (index <= -1) return result
  const insertIndex = index - 1
  const stylesheetName = uniqueId('stylesheet-')
  const insertAttr = `
    options.attributes = options.attributes || {}
    options.attributes.title = "${stylesheetName}";
  `
  return result.slice(0, insertIndex) + insertAttr + result.slice(insertIndex) + `export const _stylesheetName = "${stylesheetName}";`
}

export = loader
