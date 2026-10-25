import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const root = path.resolve(new URL("..", import.meta.url).pathname)
const toolsRoot = path.join(root, "professional-tools")
const licensesRoot = path.join(toolsRoot, "licenses")
const require = createRequire(import.meta.url)

const HEIC_PACKAGES = ["heic-convert", "heic-decode", "libheif-js", "jpeg-js", "pngjs"]

const sha256 = async (filePath) => createHash("sha256").update(await readFile(filePath)).digest("hex")

const exists = async (filePath) => {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

const findPackageJson = (packageName) => {
  try {
    return require.resolve(`${packageName}/package.json`, { paths: [path.join(root, "electron")] })
  } catch {
    const pnpmRoots = [
      path.join(root, "node_modules", ".pnpm"),
      path.join(root, "electron", "node_modules", ".pnpm")
    ]
    for (const pnpmRoot of pnpmRoots) {
      if (!existsSync(pnpmRoot)) continue
      for (const entry of readdirSync(pnpmRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const candidate = path.join(pnpmRoot, entry.name, "node_modules", packageName, "package.json")
        if (existsSync(candidate)) return candidate
      }
    }
    const directCandidates = [
      path.join(root, "node_modules", packageName, "package.json"),
      path.join(root, "electron", "node_modules", packageName, "package.json")
    ]
    for (const candidate of directCandidates) {
      if (existsSync(candidate)) return candidate
    }
    throw new Error(`无法定位 ${packageName} 的 package.json`)
  }
}

const copyLicenseFiles = async (packageName, packageJsonPath, packageInfo) => {
  const packageDir = path.dirname(packageJsonPath)
  const candidates = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "COPYING.md"]
  const copied = []
  for (const candidate of candidates) {
    const source = path.join(packageDir, candidate)
    if (!await exists(source)) continue
    const targetName = `HEIC-${packageName}-${candidate}`.replaceAll("/", "-")
    await copyFile(source, path.join(licensesRoot, targetName))
    copied.push(`licenses/${targetName}`)
  }
  if (copied.length === 0) {
    const noticeName = `HEIC-${packageName}-LICENSE-NOTICE.txt`
    await writeFile(
      path.join(licensesRoot, noticeName),
      `${packageName} ${packageInfo.version}\nLicense: ${packageInfo.license ?? "see package metadata"}\nSource: ${packageInfo.homepage ?? packageInfo.repository?.url ?? "package metadata"}\n`,
      "utf8"
    )
    copied.push(`licenses/${noticeName}`)
  }
  return copied
}

const main = async () => {
  if (!await exists(toolsRoot)) throw new Error(`缺少专业组件目录：${toolsRoot}`)
  if (!await exists(path.join(toolsRoot, "fonts", "fonts.json"))) {
    throw new Error("缺少 fonts/fonts.json，请先运行 scripts/fetch-fonts.sh")
  }
  await mkdir(licensesRoot, { recursive: true })

  const packages = []
  for (const packageName of HEIC_PACKAGES) {
    const packageJsonPath = findPackageJson(packageName)
    const packageInfo = JSON.parse(await readFile(packageJsonPath, "utf8"))
    const licenseFiles = await copyLicenseFiles(packageName, packageJsonPath, packageInfo)
    packages.push({
      name: packageName,
      version: packageInfo.version,
      license: packageInfo.license ?? null,
      packageJsonSha256: await sha256(packageJsonPath),
      licenseFiles
    })
  }

  await writeFile(
    path.join(toolsRoot, "heic-components.json"),
    `${JSON.stringify({ schemaVersion: 1, packages }, null, 2)}\n`,
    "utf8"
  )

  const bundledLicenseRoot = path.join(root, "third-party", "licenses")
  if (await exists(bundledLicenseRoot)) {
    for (const entry of await readdir(bundledLicenseRoot, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      await copyFile(path.join(bundledLicenseRoot, entry.name), path.join(licensesRoot, entry.name))
    }
  }
  const entries = (await readdir(licensesRoot)).sort()
  if (entries.length === 0) throw new Error("专业组件许可证目录为空")
  console.log(JSON.stringify({ toolsRoot, heicPackages: packages.length, licenseFiles: entries }, null, 2))
}

main().catch((error) => {
  console.error(`[package-resources] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
