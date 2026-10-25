import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { machOArchitectures, validateBundle } from "./validate-package.mjs"

const sha256 = (content) => createHash("sha256").update(content).digest("hex")

const makeMachO = (cpuType) => {
  const content = Buffer.alloc(32)
  content.writeUInt32BE(0xfeedfacf, 0)
  content.writeUInt32BE(cpuType, 4)
  return content
}

const makeLittleEndianMachO = (cpuType) => {
  const content = Buffer.alloc(32)
  content.writeUInt32LE(0xfeedfacf, 0)
  content.writeUInt32LE(cpuType, 4)
  return content
}

const makePe = () => {
  const content = Buffer.alloc(128)
  content.write("MZ", 0, "ascii")
  content.writeUInt32LE(0x40, 0x3c)
  content.write("PE\0\0", 0x40, "ascii")
  content.writeUInt16LE(0x8664, 0x44)
  return content
}

const makeJarWithManifest = (manifest) => {
  const name = Buffer.from("META-INF/MANIFEST.MF", "utf8")
  const data = Buffer.from(manifest, "latin1")
  const local = Buffer.alloc(30 + name.length + data.length)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0, 6)
  local.writeUInt16LE(0, 8)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(name.length, 26)
  name.copy(local, 30)
  data.copy(local, 30 + name.length)

  const central = Buffer.alloc(46 + name.length)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(0, 10)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(name.length, 28)
  name.copy(central, 46)

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(local.length, 16)
  return Buffer.concat([local, central, end])
}

const makeBundle = async (root, platform, arch) => {
  const javaPath = platform === "win32"
    ? path.join(root, "java-runtime", "bin", "java.exe")
    : path.join(root, "java-runtime", "Contents", "Home", "bin", "java")
  const javaReleasePath = platform === "win32"
    ? path.join(root, "java-runtime", "release")
    : path.join(root, "java-runtime", "Contents", "Home", "release")
  const javaNoticePath = platform === "win32"
    ? path.join(root, "java-runtime", "NOTICE")
    : path.join(root, "java-runtime", "Contents", "Home", "NOTICE")
  const legalPath = platform === "win32"
    ? path.join(root, "java-runtime", "legal")
    : path.join(root, "java-runtime", "Contents", "Home", "legal")
  const exifPath = platform === "win32"
    ? path.join(root, "professional-tools", "exiftool", "win-x64", "exiftool.exe")
    : path.join(root, "professional-tools", "exiftool", "macos", "exiftool")
  const fontPath = path.join(root, "professional-tools", "fonts", "LXGWWenKai-Regular.ttf")
  const fontLicensePath = path.join(root, "professional-tools", "licenses", "fonts", "LXGW-WenKai-OFL.txt")
  await mkdir(path.dirname(javaPath), { recursive: true })
  await mkdir(path.dirname(javaReleasePath), { recursive: true })
  await mkdir(legalPath, { recursive: true })
  await mkdir(path.join(root, "frontend"), { recursive: true })
  await mkdir(path.dirname(exifPath), { recursive: true })
  await mkdir(path.dirname(fontPath), { recursive: true })
  await mkdir(path.dirname(fontLicensePath), { recursive: true })
  await writeFile(path.join(root, "frontend", "index.html"), "<!doctype html>")
  await writeFile(
    path.join(root, "java-engine.jar"),
    makeJarWithManifest("Manifest-Version: 1.0\nImplementation-Version: 0.1.0-test\n")
  )
  await writeFile(javaPath, platform === "win32" ? makePe() : makeMachO(arch === "arm64" ? 0x0100000c : 0x01000007))
  await writeFile(javaReleasePath, `IMPLEMENTOR="Eclipse Adoptium"\nJAVA_RUNTIME_VERSION="11.0.25+9"\nOS_ARCH="${arch === "arm64" ? "aarch64" : "x86_64"}"\n`)
  await writeFile(javaNoticePath, "Temurin notice")
  await writeFile(exifPath, platform === "win32" ? makePe() : "#!/usr/bin/perl\n")
  await writeFile(path.join(root, "professional-tools", "components.json"), JSON.stringify({
    components: {
      exiftool: { version: "13.59", license: "GPL-1.0-or-later" },
      "twelvemonkeys-imageio": { version: "3.14.0", license: "BSD-3-Clause" }
    }
  }))
  await writeFile(path.join(root, "professional-tools", "heic-components.json"), JSON.stringify({ packages: [] }))
  await writeFile(fontPath, "font")
  await writeFile(fontLicensePath, "SIL Open Font License 1.1")
  await writeFile(path.join(root, "professional-tools", "fonts", "fonts.json"), JSON.stringify({
    fonts: [{
      id: "lxgw-wenkai",
      family: "LXGW WenKai",
      file: "LXGWWenKai-Regular.ttf",
      licenseFile: "licenses/fonts/LXGW-WenKai-OFL.txt",
      sha256: sha256("font")
    }]
  }))
  await writeFile(path.join(root, "professional-tools", "licenses", "THIRD-PARTY-NOTICES.md"), "notices")
  await writeFile(path.join(root, "professional-tools", "licenses", "ExifTool-LICENSE.txt"), "ExifTool license")
  await writeFile(path.join(root, "professional-tools", "licenses", "TwelveMonkeys-LICENSE.txt"), "TwelveMonkeys license")
  await writeFile(path.join(legalPath, "LICENSE"), "JRE license")
}

test("macOS bundle 校验真实 arm64 Mach-O、字体、HEIC 清单和许可证", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "camborder-package-validator-"))
  try {
    await makeBundle(temp, "darwin", "arm64")
    assert.deepEqual(machOArchitectures(makeMachO(0x0100000c)), ["arm64"])
    const result = await validateBundle({ bundleDir: temp, platform: "darwin", arch: "arm64" })
    assert.equal(result.components.components.exiftool.version, "13.59")
    assert.equal(result.javaEngineVersion, "0.1.0-test")
    assert.deepEqual(result.javaRuntime, { vendor: "Eclipse Adoptium", version: "11.0.25+9", arch: "arm64" })
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test("Windows bundle 校验 x64 PE", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "camborder-package-validator-"))
  try {
    await makeBundle(temp, "win32", "x64")
    await assert.doesNotReject(validateBundle({ bundleDir: temp, platform: "win32", arch: "x64" }))
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test("包校验拒绝缺少 JRE release/NOTICE 或 Java Engine 版本的资源", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "camborder-package-validator-"))
  try {
    await makeBundle(temp, "win32", "x64")
    await rm(path.join(temp, "java-runtime", "NOTICE"))
    await assert.rejects(
      validateBundle({ bundleDir: temp, platform: "win32", arch: "x64" }),
      /JRE NOTICE/
    )
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test("macOS bundle 拒绝错误架构的随包 Java", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "camborder-package-validator-"))
  try {
    await makeBundle(temp, "darwin", "x64")
    await assert.rejects(
      validateBundle({ bundleDir: temp, platform: "darwin", arch: "arm64" }),
      /目标 macOS arm64 架构|JRE release 架构不匹配/
    )
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test("macOS 校验器识别真实 little-endian Mach-O 头", () => {
  assert.deepEqual(machOArchitectures(makeLittleEndianMachO(0x0100000c)), ["arm64"])
  assert.deepEqual(machOArchitectures(makeLittleEndianMachO(0x01000007)), ["x64"])
})
