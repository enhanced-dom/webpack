import { stringifyRequest } from 'loader-utils'

const loader = function () {}

loader.pitch = function pitch(remainingRequest: string) {
  if (this.cacheable) {
    this.cacheable()
  }

  return `
    var content = require(${stringifyRequest(this, `!!${remainingRequest}`)});
    module.exports = content.locals || {};
    module.exports._source = content.toString();
  `
}

export = loader
