// `postcss-loader`'s `loadPlugin()` either uses this value directly (no options given - PostCSS then
// calls it itself, since `.postcss = true` marks it as a plugin creator) or calls it with options
// (must return a valid plugin object). The generic ESM_STUB returns `undefined` either way, which
// PostCSS then fails on ("Cannot read properties of undefined (reading 'postcss')").
function postcssPluginStub() {
  return { postcssPlugin: 'postcss-plugin-stub' }
}
postcssPluginStub.postcss = true
module.exports = postcssPluginStub
module.exports.default = postcssPluginStub
