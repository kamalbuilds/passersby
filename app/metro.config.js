const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// The native module's package.json "main" pins index.ts, which hides index.web.ts from platform
// resolution. On web, point the module at its no-op counterpart explicitly.
const upstream = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && /(^|\/)modules\/passersby-ble$/.test(moduleName)) {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'modules/passersby-ble/index.web.ts') }
  }
  return (upstream ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = config
