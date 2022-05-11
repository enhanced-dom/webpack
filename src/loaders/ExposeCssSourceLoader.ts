import styleLoader from 'style-loader'
import { uniqueId } from 'lodash'

// eslint-disable-next-line @typescript-eslint/no-empty-function
const loader = function () {}

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
