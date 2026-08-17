const { withMainApplication, withProjectBuildGradle } = require('expo/config-plugins')

const VERSION_NUMBER_MARKER = 'subproject.dependencies.ext.VersionNumber = org.gradle.util.internal.VersionNumber'
const ROOT_PLUGIN_ANCHOR = 'apply plugin: "expo-root-project"'
const ONNXRUNTIME_IMPORT = 'import ai.onnxruntime.reactnative.OnnxruntimePackage'
const PACKAGE_LIST_ANCHOR = 'PackageList(this).packages.apply {'
const ONNXRUNTIME_PACKAGE = '          add(OnnxruntimePackage())'

function withGradleVersionNumberCompat(config) {
  return withProjectBuildGradle(config, (androidConfig) => {
    if (androidConfig.modResults.language !== 'groovy') {
      throw new Error('The ONNX Runtime Android compatibility plugin requires a Groovy project build file.')
    }

    const contents = androidConfig.modResults.contents
    if (contents.includes(VERSION_NUMBER_MARKER)) {
      return androidConfig
    }

    if (!contents.includes(ROOT_PLUGIN_ANCHOR)) {
      throw new Error('Unable to find the Expo root plugin anchor in android/build.gradle.')
    }

    const compatibilityBlock = [
      'subprojects { subproject ->',
      `  ${VERSION_NUMBER_MARKER}`,
      '}',
      '',
    ].join('\n')

    androidConfig.modResults.contents = contents.replace(
      ROOT_PLUGIN_ANCHOR,
      `${compatibilityBlock}${ROOT_PLUGIN_ANCHOR}`,
    )
    return androidConfig
  })
}

function withOnnxruntimePackage(config) {
  return withMainApplication(config, (androidConfig) => {
    if (androidConfig.modResults.language !== 'kt') {
      throw new Error('The ONNX Runtime Android compatibility plugin requires a Kotlin MainApplication.')
    }

    let contents = androidConfig.modResults.contents
    if (!contents.includes(ONNXRUNTIME_IMPORT)) {
      contents = contents.replace(
        /^package ([^\n]+)\n/m,
        `package $1\n\n${ONNXRUNTIME_IMPORT}\n`,
      )
    }

    if (!contents.includes(ONNXRUNTIME_PACKAGE)) {
      if (!contents.includes(PACKAGE_LIST_ANCHOR)) {
        throw new Error('Unable to find the React Native package list in MainApplication.kt.')
      }
      contents = contents.replace(
        PACKAGE_LIST_ANCHOR,
        `${PACKAGE_LIST_ANCHOR}\n${ONNXRUNTIME_PACKAGE}`,
      )
    }

    androidConfig.modResults.contents = contents
    return androidConfig
  })
}

module.exports = function withOnnxruntimeAndroidCompat(config) {
  return withOnnxruntimePackage(withGradleVersionNumberCompat(config))
}
