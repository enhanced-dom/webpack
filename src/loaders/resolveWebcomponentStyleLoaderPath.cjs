// Plain CommonJS on purpose: `require.resolve` here needs to resolve `./WebcomponentStyleLoader`
// extensionlessly in both environments this project runs in - against the `.ts` source (ts-jest
// registers a `.ts` require extension, and this file always runs as real CJS regardless of the
// enclosing package's `"type": "module"`) and, in the built output, against the compiled `.js`
// (Node's own default-extension lookup in `require.resolve`, no registration needed). A `.ts` file
// can't do this itself: this project's `module: "preserve"` setting means the ESM build output has
// no `require` at all, and the only ESM-native alternative (`import.meta.url`) is TS-restricted
// under "preserve".
module.exports = require.resolve('./WebcomponentStyleLoader')
