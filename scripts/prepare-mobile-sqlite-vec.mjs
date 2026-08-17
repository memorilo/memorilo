import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sqliteVecVersion = '0.1.9'
const releaseRoot = `https://github.com/asg017/sqlite-vec/releases/download/v${sqliteVecVersion}`
const targetFramework = resolve(
  repositoryRoot,
  'apps/mobile/modules/memorilo-sqlite-vec/ios/vec.xcframework',
)

const artifacts = {
  deviceArm64: {
    fileName: `sqlite-vec-${sqliteVecVersion}-loadable-ios-aarch64.tar.gz`,
    sha256: '3cb77b829cc42fe0544608790e19d87efd61076639bd8b78d68f4fefb8fb8561',
  },
  simulatorArm64: {
    fileName: `sqlite-vec-${sqliteVecVersion}-loadable-iossimulator-aarch64.tar.gz`,
    sha256: '7db1a8077ac496b79bb0a386ab6bfa5bd507cb45c9431ab644c69bf17f597070',
  },
  simulatorX64: {
    fileName: `sqlite-vec-${sqliteVecVersion}-loadable-iossimulator-x86_64.tar.gz`,
    sha256: 'eb49248e616b0cedfd59d60d79bfa579c877b14118265d699a53dd0716b8ac48',
  },
}

function frameworkInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>vec</string>
  <key>CFBundleIdentifier</key>
  <string>sqlite-vec</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundlePackageType</key>
  <string>FMWK</string>
  <key>CFBundleShortVersionString</key>
  <string>${sqliteVecVersion}</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>MinimumOSVersion</key>
  <string>16.4</string>
</dict>
</plist>
`
}

function xcframeworkInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>AvailableLibraries</key>
  <array>
    <dict>
      <key>BinaryPath</key>
      <string>vec.framework/vec</string>
      <key>LibraryIdentifier</key>
      <string>ios-arm64</string>
      <key>LibraryPath</key>
      <string>vec.framework</string>
      <key>SupportedArchitectures</key>
      <array>
        <string>arm64</string>
      </array>
      <key>SupportedPlatform</key>
      <string>ios</string>
    </dict>
    <dict>
      <key>BinaryPath</key>
      <string>vec.framework/vec</string>
      <key>LibraryIdentifier</key>
      <string>ios-arm64_x86_64-simulator</string>
      <key>LibraryPath</key>
      <string>vec.framework</string>
      <key>SupportedArchitectures</key>
      <array>
        <string>arm64</string>
        <string>x86_64</string>
      </array>
      <key>SupportedPlatform</key>
      <string>ios</string>
      <key>SupportedPlatformVariant</key>
      <string>simulator</string>
    </dict>
  </array>
  <key>CFBundlePackageType</key>
  <string>XFWK</string>
  <key>MemoriloSQLiteVecVersion</key>
  <string>${sqliteVecVersion}</string>
  <key>XCFrameworkFormatVersion</key>
  <string>1.0</string>
</dict>
</plist>
`
}

async function exists(path) {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

async function downloadArtifact(cacheDirectory, artifact) {
  const archivePath = join(cacheDirectory, artifact.fileName)
  if (await exists(archivePath)) {
    const cached = await readFile(archivePath)
    if (createHash('sha256').update(cached).digest('hex') === artifact.sha256)
      return archivePath
    await rm(archivePath, { force: true })
  }

  const response = await fetch(`${releaseRoot}/${artifact.fileName}`)
  if (!response.ok)
    throw new Error(`Failed to download ${artifact.fileName}: HTTP ${response.status}`)
  const archive = Buffer.from(await response.arrayBuffer())
  const actualHash = createHash('sha256').update(archive).digest('hex')
  if (actualHash !== artifact.sha256)
    throw new Error(`Checksum mismatch for ${artifact.fileName}: ${actualHash}`)
  await writeFile(archivePath, archive)
  return archivePath
}

async function extractBinary(archivePath, destination) {
  await mkdir(destination, { recursive: true })
  await execFileAsync('tar', ['-xzf', archivePath, '-C', destination])
  const binary = join(destination, 'vec0.dylib')
  if (!await exists(binary))
    throw new Error(`sqlite-vec archive did not contain vec0.dylib: ${archivePath}`)
  return binary
}

async function prepareFramework(frameworkDirectory, binarySource) {
  await mkdir(frameworkDirectory, { recursive: true })
  const binaryTarget = join(frameworkDirectory, 'vec')
  await cp(binarySource, binaryTarget)
  await chmod(binaryTarget, 0o755)
  await execFileAsync('install_name_tool', ['-id', '@rpath/vec.framework/vec', binaryTarget])
  await writeFile(join(frameworkDirectory, 'Info.plist'), frameworkInfoPlist())
  return binaryTarget
}

if (process.platform !== 'darwin') {
  process.stdout.write('Skipping iOS sqlite-vec framework preparation outside macOS\n')
  process.exit(0)
}

if (await exists(join(targetFramework, 'Info.plist'))) {
  const currentInfo = await readFile(join(targetFramework, 'Info.plist'), 'utf8')
  if (currentInfo.includes(`<string>${sqliteVecVersion}</string>`)) {
    process.stdout.write(`Mobile sqlite-vec ${sqliteVecVersion} is ready in ${targetFramework}\n`)
    process.exit(0)
  }
}

const cacheDirectory = resolve(repositoryRoot, '.cache/sqlite-vec', sqliteVecVersion)
await mkdir(cacheDirectory, { recursive: true })
const workDirectory = await mkdtemp(join(tmpdir(), 'memorilo-sqlite-vec-'))

try {
  const [deviceArchive, simulatorArmArchive, simulatorX64Archive] = await Promise.all([
    downloadArtifact(cacheDirectory, artifacts.deviceArm64),
    downloadArtifact(cacheDirectory, artifacts.simulatorArm64),
    downloadArtifact(cacheDirectory, artifacts.simulatorX64),
  ])
  const [deviceBinary, simulatorArmBinary, simulatorX64Binary] = await Promise.all([
    extractBinary(deviceArchive, join(workDirectory, 'device-source')),
    extractBinary(simulatorArmArchive, join(workDirectory, 'simulator-arm-source')),
    extractBinary(simulatorX64Archive, join(workDirectory, 'simulator-x64-source')),
  ])

  const stagingFramework = join(workDirectory, 'vec.xcframework')
  const deviceFramework = join(stagingFramework, 'ios-arm64/vec.framework')
  const simulatorFramework = join(stagingFramework, 'ios-arm64_x86_64-simulator/vec.framework')
  await prepareFramework(deviceFramework, deviceBinary)

  await mkdir(simulatorFramework, { recursive: true })
  const simulatorBinary = join(simulatorFramework, 'vec')
  await execFileAsync('lipo', [
    '-create',
    simulatorArmBinary,
    simulatorX64Binary,
    '-output',
    simulatorBinary,
  ])
  await chmod(simulatorBinary, 0o755)
  await execFileAsync('install_name_tool', ['-id', '@rpath/vec.framework/vec', simulatorBinary])
  await writeFile(join(simulatorFramework, 'Info.plist'), frameworkInfoPlist())
  await writeFile(join(stagingFramework, 'Info.plist'), xcframeworkInfoPlist())

  await mkdir(dirname(targetFramework), { recursive: true })
  await rm(targetFramework, { force: true, recursive: true })
  await cp(stagingFramework, targetFramework, { recursive: true })
  process.stdout.write(`Mobile sqlite-vec ${sqliteVecVersion} is ready in ${targetFramework}\n`)
}
finally {
  await rm(workDirectory, { force: true, recursive: true })
}
