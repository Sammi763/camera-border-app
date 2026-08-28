import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  findWindowsInstaller,
  validateWindowsBundle,
  validateWindowsUnpacked,
  createWindowsManifest
} from "./validate-windows-package.mjs"

const makePeExecutable = (machine = 0x8664) => {
  const executable = Buffer.alloc(0x80)
  executable.write("MZ", 0, "ascii")
  executable.writeUInt32LE(0x40, 0x3c)
  executable.write("PE\0\0", 0x40, "ascii")
  executable.writeUInt16LE(machine, 0x44)
  return executable
}

const makeBundle = async (root) => {
  await mkdir(path.join(root, "frontend"), { recursive: true })
  await mkdir(path.join(root, "java-runtime", "bin"), { recursive: true })
  await writeFile(path.join(root, "frontend", "index.html"), "<!doctype html>")
  await writeFile(path.join(root, "java-engine.jar"), "jar")
  await writeFile(path.join(root, "java-runtime", "bin", "java.exe"), makePeExecutable())
}

const makeUnpacked = async (root) => {
  await mkdir(path.join(root, "resources", "frontend"), { recursive: true })
  await mkdir(path.join(root, "resources", "java-engine"), { recursive: true })
  await mkdir(path.join(root, "resources", "java-runtime", "bin"), { recursive: true })
  await writeFile(path.join(root, "resources", "frontend", "index.html"), "<!doctype html>")
  await writeFile(path.join(root, "resources", "java-engine", "camera-border-engine.jar"), "jar")
  await writeFile(path.join(root, "resources", "java-runtime", "bin", "java.exe"), makePeExecutable())
  await writeFile(path.join(root, "Camera Border.exe"), makePeExecutable())
}

test("Windows bundle 具备前端、引擎 JAR 和 x64 JRE 必需布局时通过", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "camborder-package-test-"))
  try {
    await makeBundle(temp)
    assert.deepEqual(await validateWindowsBundle(temp), {
      frontend: path.join(temp, "frontend", "index.html"),
      engineJar: path.join(temp, "java-engine.jar"),
      javaExecutable: path.join(temp, "java-runtime", "bin", "java.exe")
    })
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test("Windows bundle 缺少 java.exe 时拒绝打包", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "camborder-package-test-"))
  try {
    await makeBundle(temp)
    await rm(path.join(temp, "java-runtime", "bin", "java.exe"))
    await assert.rejects(validateWindowsBundle(temp), /java\.exe/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test("Windows bundle 拒绝非 x64 或损坏的 java.exe", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "camborder-package-test-"))
  try {
    await makeBundle(temp)
    await writeFile(
      path.join(temp, "java-runtime", "bin", "java.exe"),
      makePeExecutable(0x014c)
    )
    await assert.rejects(validateWindowsBundle(temp), /x64 PE/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test("安装包输出必须是唯一的 Camera-Border-Setup 版本文件", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "camborder-package-test-"))
  try {
    const expected = path.join(temp, "Camera-Border-Setup-0.1.0-x64.exe")
    await writeFile(expected, "MZ")
    assert.equal(await findWindowsInstaller(temp, "0.1.0"), expected)
    await writeFile(path.join(temp, "Camera-Border-0.1.0-x64.exe"), "MZ")
    await assert.rejects(findWindowsInstaller(temp, "0.1.0"), /唯一/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test("解包目录必须包含最终安装包实际使用的 resources", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "camborder-package-test-"))
  try {
    await makeUnpacked(temp)
    assert.equal(await validateWindowsUnpacked(temp), true)
    await rm(path.join(temp, "resources", "java-engine", "camera-border-engine.jar"))
    await assert.rejects(validateWindowsUnpacked(temp), /camera-border-engine\.jar/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test("构建清单记录安装包与目标平台", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "camborder-package-test-"))
  try {
    const installer = path.join(temp, "Camera-Border-Setup-0.1.0-x64.exe")
    await writeFile(installer, "MZ-test")
    const manifest = await createWindowsManifest({
      installerPath: installer,
      version: "0.1.0",
      commit: "abc123",
      outputDir: temp
    })
    assert.equal(manifest.platform, "win32")
    assert.equal(manifest.arch, "x64")
    assert.equal(manifest.version, "0.1.0")
    assert.equal(manifest.installer.file, path.basename(installer))
    assert.match(manifest.installer.sha256, /^[0-9a-f]{64}$/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test("FORCE_UNSIGNED=1 时 manifest 标记 signed=false（未签名测试包明确标记）", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "camborder-package-test-"))
  const prevForce = process.env.FORCE_UNSIGNED
  const prevLink = process.env.CSC_LINK
  const prevKey = process.env.CSC_KEY_PASSWORD
  try {
    const installer = path.join(temp, "Camera-Border-Setup-0.1.0-x64.exe")
    await writeFile(installer, "MZ-test")
    process.env.FORCE_UNSIGNED = "1"
    delete process.env.CSC_LINK
    delete process.env.CSC_KEY_PASSWORD
    const manifest = await createWindowsManifest({
      installerPath: installer,
      version: "0.1.0",
      commit: "abc123",
      outputDir: temp
    })
    assert.equal(manifest.signed, false)
  } finally {
    if (prevForce === undefined) delete process.env.FORCE_UNSIGNED; else process.env.FORCE_UNSIGNED = prevForce
    if (prevLink === undefined) delete process.env.CSC_LINK; else process.env.CSC_LINK = prevLink
    if (prevKey === undefined) delete process.env.CSC_KEY_PASSWORD; else process.env.CSC_KEY_PASSWORD = prevKey
    await rm(temp, { recursive: true, force: true })
  }
})

test("提供 CSC_LINK + CSC_KEY_PASSWORD 且未强制未签名时 manifest 标记 signed=true", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "camborder-package-test-"))
  const prevForce = process.env.FORCE_UNSIGNED
  const prevLink = process.env.CSC_LINK
  const prevKey = process.env.CSC_KEY_PASSWORD
  try {
    const installer = path.join(temp, "Camera-Border-Setup-0.1.0-x64.exe")
    await writeFile(installer, "MZ-test")
    delete process.env.FORCE_UNSIGNED
    process.env.CSC_LINK = "/tmp/fake-cert.p12"
    process.env.CSC_KEY_PASSWORD = "secret"
    const manifest = await createWindowsManifest({
      installerPath: installer,
      version: "0.1.0",
      commit: "abc123",
      outputDir: temp
    })
    assert.equal(manifest.signed, true)
  } finally {
    if (prevForce === undefined) delete process.env.FORCE_UNSIGNED; else process.env.FORCE_UNSIGNED = prevForce
    if (prevLink === undefined) delete process.env.CSC_LINK; else process.env.CSC_LINK = prevLink
    if (prevKey === undefined) delete process.env.CSC_KEY_PASSWORD; else process.env.CSC_KEY_PASSWORD = prevKey
    await rm(temp, { recursive: true, force: true })
  }
})
