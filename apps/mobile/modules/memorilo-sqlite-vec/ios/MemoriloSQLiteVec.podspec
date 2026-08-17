require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |spec|
  spec.name = 'MemoriloSQLiteVec'
  spec.version = package['version']
  spec.summary = 'Embeds sqlite-vec for the Memorilo Expo application.'
  spec.description = 'Provides the signed sqlite-vec framework bundle consumed by Expo SQLite on iOS.'
  spec.license = { type: 'MIT OR Apache-2.0' }
  spec.author = 'Memorilo contributors'
  spec.homepage = 'https://github.com/memorilo/memorilo'
  spec.platforms = { ios: '16.4' }
  spec.source = { git: 'https://github.com/memorilo/memorilo.git' }
  spec.static_framework = true
  spec.dependency 'ExpoModulesCore'
  spec.source_files = '*.swift'
  spec.vendored_frameworks = 'vec.xcframework'
end
