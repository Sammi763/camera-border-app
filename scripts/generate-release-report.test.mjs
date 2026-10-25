import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import { promisify } from "node:util"
import { execFile } from "node:child_process"
import os from "node:os"
import path from "node:path"
import {
  buildTargetStatuses,
  cleanSystemEvidenceIsComplete,
  createReleaseReport,
  findE2eResults,
  findManifests,
  loadReleaseScope,
  matchingE2eRuns,
  matchingLifecycleEvidence,
  offlineEvidenceIsComplete,
  readE2eEvidence,
  userStudyPasses
} from "./generate-release-report.mjs"

const execFileAsync = promisify(execFile)

test("release report only discovers package sidecar manifests", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "camera-border-release-report-"))
  try {
    mkdirSync(path.join(root, "macos-arm64"), { recursive: true })
    writeFileSync(path.join(root, "macos-arm64", "Camera-Border-0.1.0-arm64.dmg.manifest.json"), "{}")
    writeFileSync(path.join(root, "macos-arm64", "package-manifest.json"), "{}")
    assert.deepEqual(await findManifests(root), [path.join(root, "macos-arm64", "Camera-Border-0.1.0-arm64.dmg.manifest.json")])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("release report only marks matching installed E2E evidence as available", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "camera-border-release-evidence-"))
  try {
    const evidenceDir = path.join(root, "nested")
    mkdirSync(evidenceDir, { recursive: true })
    writeFileSync(path.join(evidenceDir, "packaged-e2e-result.json"), JSON.stringify({
      status: "PASS",
      installed: true,
      installedFromPackage: true,
      platform: "darwin",
      arch: "arm64",
      packageCommit: "a".repeat(40)
    }))
    assert.deepEqual(await findE2eResults(root), [path.join(evidenceDir, "packaged-e2e-result.json")])
    const evidence = await readE2eEvidence(root)
    assert.equal(evidence.get("darwin-arm64")?.[0]?.packageCommit, "a".repeat(40))
    assert.equal(evidence.get("darwin-arm64")?.[0]?.status, "PASS")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("发布门只接受同一包提交的两次完整安装后 E2E", () => {
  const packageInfo = { sourceCommit: "a".repeat(40) }
  const complete = {
    status: "PASS",
    installed: true,
    installedFromPackage: true,
    packageCommit: packageInfo.sourceCommit,
    checks: {
      bundledRuntime: true,
      independentExifTool: true,
      sourceShaUnchanged: true,
      offlineCspBoundary: true,
      restartRecovery: true
    }
  }
  assert.equal(matchingE2eRuns([complete], packageInfo).length, 1)
  assert.equal(matchingE2eRuns([complete, { ...complete }], packageInfo).length, 2)
  assert.equal(matchingE2eRuns([{ ...complete, packageCommit: "b".repeat(40) }, complete], packageInfo).length, 1)
})

test("摄影用户研究必须同时满足人数、完成率、时间和理解门槛", () => {
  const passing = {
    status: "PASS",
    participants: 5,
    firstUseCompletionRate: 1,
    medianFirstOutputSeconds: 179,
    rawMisunderstandings: 0,
    scopeMisunderstandings: 0,
    defects: { P0: 0, P1: 0, P2: 0, P3: 0 },
    p3OnlyVisual: true,
    blockers: []
  }
  assert.equal(userStudyPasses(passing), true)
  assert.equal(userStudyPasses({ ...passing, participants: 4 }), false)
  assert.equal(userStudyPasses({ ...passing, medianFirstOutputSeconds: 181 }), false)
  assert.equal(userStudyPasses({ ...passing, rawMisunderstandings: 1 }), false)
  assert.equal(userStudyPasses({ ...passing, defects: { P0: 0, P1: 1, P2: 0, P3: 0 } }), false)
  assert.equal(userStudyPasses({ ...passing, defects: { P0: 0, P1: 0, P2: 0, P3: 1 }, p3OnlyVisual: false }), false)
  assert.equal(userStudyPasses({ ...passing, blockers: ["未完成"] }), false)
})

test("清洁系统和断网证据必须包含可核对的全流程事实", () => {
  const steps = {
    install: true,
    firstLaunch: true,
    import: true,
    preview: true,
    export: true,
    restartRecovery: true,
    engineRecovery: true,
    uninstall: true
  }
  const cleanSystem = {
    installedFromPackage: true,
    independentExifTool: true,
    sourceShaUnchanged: true,
    steps,
    systemDependencies: {
      java: false,
      exiftool: false,
      node: false,
      pnpm: false,
      maven: false,
      python: false,
      heicExtension: false
    }
  }
  assert.equal(cleanSystemEvidenceIsComplete(cleanSystem), true)
  assert.equal(cleanSystemEvidenceIsComplete({ ...cleanSystem, systemDependencies: { ...cleanSystem.systemDependencies, java: true } }), false)
  assert.equal(cleanSystemEvidenceIsComplete({ ...cleanSystem, steps: { ...steps, export: false } }), false)
  assert.equal(offlineEvidenceIsComplete({
    networkBlocked: true,
    externalRequests: 0,
    independentExifTool: true,
    sourceShaUnchanged: true,
    steps
  }), true)
  assert.equal(offlineEvidenceIsComplete({
    networkBlocked: true,
    externalRequests: 1,
    independentExifTool: true,
    sourceShaUnchanged: true,
    steps
  }), false)
})

test("卸载门拒绝缺少用户数据保留事实的生命周期记录", () => {
  const packageInfo = { sourceCommit: "a".repeat(40) }
  const record = {
    status: "PASS",
    packageCommit: packageInfo.sourceCommit,
    installedPathRemoved: true,
    backgroundProcessAbsent: true
  }
  assert.equal(matchingLifecycleEvidence([record], packageInfo), undefined)
  assert.notEqual(matchingLifecycleEvidence([{ ...record, userDataPreserved: true }], packageInfo), undefined)
})

test("发布报告在单次 E2E 证据下仍可生成并保持未就绪", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "camera-border-release-report-main-"))
  try {
    const releaseRoot = path.join(root, "release")
    const evidenceRoot = path.join(root, "evidence")
    mkdirSync(releaseRoot, { recursive: true })
    mkdirSync(evidenceRoot, { recursive: true })
    const installer = Buffer.from("test installer")
    const installerName = "Camera-Border-0.1.0-arm64.dmg"
    writeFileSync(path.join(releaseRoot, installerName), installer)
    const installerSha256 = createHash("sha256").update(installer).digest("hex")
    writeFileSync(path.join(releaseRoot, `${installerName}.sha256`), `${installerSha256}  ${installerName}\n`)
    writeFileSync(path.join(releaseRoot, "Camera-Border-0.1.0-arm64.dmg.manifest.json"), JSON.stringify({
      platform: "darwin",
      arch: "arm64",
      version: "0.1.0",
      installer: {
        file: installerName,
        bytes: installer.byteLength,
        sha256: installerSha256
      },
      components: {},
      commit: "a".repeat(40)
    }))
    writeFileSync(path.join(evidenceRoot, "packaged-e2e-result.json"), JSON.stringify({
      status: "PASS",
      installed: true,
      installedFromPackage: true,
      platform: "darwin",
      arch: "arm64",
      packageCommit: "a".repeat(40),
      checks: {
        bundledRuntime: true,
        independentExifTool: true,
        sourceShaUnchanged: true,
        offlineCspBoundary: true,
        restartRecovery: true
      }
    }))
    const output = path.join(root, "release-report.json")
    await execFileAsync(process.execPath, [
      path.join(process.cwd(), "scripts/generate-release-report.mjs"),
      "--release-root", releaseRoot,
      "--output", output,
      "--e2e-artifact-root", evidenceRoot
    ])
    const report = JSON.parse(readFileSync(output, "utf8"))
    assert.equal(report.acceptance.installedE2EDetails["darwin-arm64"].observedRuns, 1)
    assert.equal(report.acceptance.installedE2EDetails["darwin-arm64"].passingRuns, 1)
    assert.equal(report.finalGate.verdict, "NOT_READY")
    assert.equal(report.finalGate.releaseReady, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("发布报告拒绝过期安装包哈希和重复目标 manifest", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "camera-border-release-report-integrity-"))
  try {
    const releaseRoot = path.join(root, "release")
    mkdirSync(releaseRoot, { recursive: true })
    const installerName = "Camera-Border-0.1.0-arm64.dmg"
    const installer = Buffer.from("installer")
    writeFileSync(path.join(releaseRoot, installerName), installer)
    const installerSha256 = createHash("sha256").update(installer).digest("hex")
    writeFileSync(path.join(releaseRoot, `${installerName}.sha256`), `${installerSha256}  ${installerName}\n`)
    const manifest = {
      platform: "darwin",
      arch: "arm64",
      version: "0.1.0",
      installer: { file: installerName, bytes: installer.byteLength, sha256: installerSha256 },
      components: {},
      commit: "a".repeat(40)
    }
    const manifestPath = path.join(releaseRoot, `${installerName}.manifest.json`)
    writeFileSync(manifestPath, JSON.stringify(manifest))
    const duplicateManifestPath = path.join(releaseRoot, `Camera-Border-0.1.0-arm64-duplicate.manifest.json`)
    writeFileSync(duplicateManifestPath, JSON.stringify(manifest))
    await assert.rejects(
      execFileAsync(process.execPath, [
        path.join(process.cwd(), "scripts/generate-release-report.mjs"),
        "--release-root", releaseRoot,
        "--output", path.join(root, "report.json")
      ]),
      /重复发布目标/
    )
    rmSync(duplicateManifestPath)
    writeFileSync(path.join(releaseRoot, installerName), Buffer.from("changed installer"))
    await assert.rejects(
      execFileAsync(process.execPath, [
        path.join(process.cwd(), "scripts/generate-release-report.mjs"),
        "--release-root", releaseRoot,
        "--output", path.join(root, "report.json")
      ]),
      /字节数与 manifest 不一致|SHA-256 与 manifest 不一致/
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("默认发布范围只有 darwin-arm64 正式目标，Windows 固定为 SIMULATED", async () => {
  const { scope } = await loadReleaseScope()
  assert.deepEqual(scope.formalTargets, ["darwin-arm64"])
  assert.deepEqual(scope.candidateTargets, ["darwin-x64", "win32-x64"])
  const statuses = buildTargetStatuses(scope, false)
  assert.equal(statuses["darwin-arm64"].releaseBlocking, true)
  assert.equal(statuses["darwin-x64"].releaseBlocking, false)
  assert.equal(statuses["win32-x64"].releaseStatus, "SIMULATED")
})

const writePackageFixture = (releaseRoot, { platform, arch, installerName, commit }) => {
  const installer = Buffer.from(`${platform}-${arch}-installer`)
  mkdirSync(releaseRoot, { recursive: true })
  writeFileSync(path.join(releaseRoot, installerName), installer)
  const sha256 = createHash("sha256").update(installer).digest("hex")
  writeFileSync(path.join(releaseRoot, `${installerName}.sha256`), `${sha256}  ${installerName}\n`)
  writeFileSync(path.join(releaseRoot, `${installerName}.manifest.json`), JSON.stringify({
    platform,
    arch,
    version: "0.1.0",
    installer: { file: installerName, bytes: installer.length, sha256 },
    components: {},
    commit
  }))
}

const completeFormalEvidence = (root, commit) => {
  const steps = {
    install: true,
    firstLaunch: true,
    import: true,
    preview: true,
    export: true,
    restartRecovery: true,
    engineRecovery: true,
    uninstall: true
  }
  const e2e = {
    status: "PASS",
    installed: true,
    installedFromPackage: true,
    platform: "darwin",
    arch: "arm64",
    packageCommit: commit,
    checks: {
      bundledRuntime: true,
      independentExifTool: true,
      sourceShaUnchanged: true,
      offlineCspBoundary: true,
      restartRecovery: true
    }
  }
  mkdirSync(path.join(root, "run-1"), { recursive: true })
  mkdirSync(path.join(root, "run-2"), { recursive: true })
  writeFileSync(path.join(root, "run-1", "packaged-e2e-result.json"), JSON.stringify(e2e))
  writeFileSync(path.join(root, "run-2", "packaged-e2e-result.json"), JSON.stringify(e2e))
  writeFileSync(path.join(root, "install-lifecycle-result.json"), JSON.stringify({
    status: "PASS",
    platform: "darwin",
    arch: "arm64",
    packageCommit: commit,
    installedPathRemoved: true,
    backgroundProcessAbsent: true,
    userDataPreserved: true
  }))
  writeFileSync(path.join(root, "clean-system-result.json"), JSON.stringify({
    status: "PASS",
    kind: "clean-system",
    platform: "darwin",
    arch: "arm64",
    packageCommit: commit,
    installedFromPackage: true,
    independentExifTool: true,
    sourceShaUnchanged: true,
    steps,
    systemDependencies: {
      java: false,
      exiftool: false,
      node: false,
      pnpm: false,
      maven: false,
      python: false,
      heicExtension: false
    }
  }))
  writeFileSync(path.join(root, "offline-result.json"), JSON.stringify({
    status: "PASS",
    kind: "offline",
    platform: "darwin",
    arch: "arm64",
    packageCommit: commit,
    networkBlocked: true,
    externalRequests: 0,
    independentExifTool: true,
    sourceShaUnchanged: true,
    steps
  }))
}

const passingStudy = {
  status: "PASS",
  participants: 5,
  firstUseCompletionRate: 1,
  medianFirstOutputSeconds: 60,
  rawMisunderstandings: 0,
  scopeMisunderstandings: 0,
  defects: { P0: 0, P1: 0, P2: 0, P3: 0 },
  blockers: []
}

test("缺少候选平台包和证据不会阻塞正式 arm64 门", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "camera-border-release-scope-formal-"))
  try {
    const releaseRoot = path.join(root, "release")
    const evidenceRoot = path.join(root, "evidence")
    mkdirSync(evidenceRoot, { recursive: true })
    const commit = "c".repeat(40)
    writePackageFixture(releaseRoot, {
      platform: "darwin",
      arch: "arm64",
      installerName: "Camera-Border-0.1.0-arm64.dmg",
      commit
    })
    completeFormalEvidence(evidenceRoot, commit)
    const report = await createReleaseReport({
      releaseRoot,
      output: path.join(root, "report.json"),
      e2eRoots: [evidenceRoot],
      userStudyPath: path.join(root, "study.json")
    })
    writeFileSync(path.join(root, "study.json"), JSON.stringify(passingStudy))
    const rerun = await createReleaseReport({
      releaseRoot,
      output: path.join(root, "report-2.json"),
      e2eRoots: [evidenceRoot],
      userStudyPath: path.join(root, "study.json")
    })
    assert.equal(report.finalGate.verdict, "NOT_READY")
    assert.equal(rerun.finalGate.verdict, "PASS")
    assert.deepEqual(rerun.finalGate.formalTargets, ["darwin-arm64"])
    assert.equal(rerun.finalGate.blockers.some((blocker) => blocker.includes("darwin-x64") || blocker.includes("win32-x64")), false)
    assert.equal(rerun.targetStatuses["win32-x64"].releaseStatus, "SIMULATED")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("Windows 的安装包完整性 PASS 不会写成 Windows 平台验收 PASS", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "camera-border-release-scope-windows-"))
  try {
    const releaseRoot = path.join(root, "release")
    const evidenceRoot = path.join(root, "evidence")
    mkdirSync(evidenceRoot, { recursive: true })
    const commit = "d".repeat(40)
    writePackageFixture(releaseRoot, {
      platform: "darwin",
      arch: "arm64",
      installerName: "Camera-Border-0.1.0-arm64.dmg",
      commit
    })
    writePackageFixture(releaseRoot, {
      platform: "win32",
      arch: "x64",
      installerName: "Camera-Border-Setup-0.1.0-x64.exe",
      commit
    })
    const windowsEvidence = path.join(evidenceRoot, "windows")
    mkdirSync(windowsEvidence, { recursive: true })
    const windowsE2e = {
      status: "PASS",
      installed: true,
      installedFromPackage: true,
      platform: "win32",
      arch: "x64",
      packageCommit: commit,
      checks: {
        bundledRuntime: true,
        independentExifTool: true,
        sourceShaUnchanged: true,
        offlineCspBoundary: true,
        restartRecovery: true
      }
    }
    writeFileSync(path.join(windowsEvidence, "packaged-e2e-result.json"), JSON.stringify(windowsE2e))
    const report = await createReleaseReport({
      releaseRoot,
      output: path.join(root, "report.json"),
      e2eRoots: [windowsEvidence]
    })
    const windowsPackage = report.packages.find((item) => item.target === "win32-x64")
    assert.equal(windowsPackage.installerIntegrity, "PASS")
    assert.equal(windowsPackage.releaseStatus, "SIMULATED")
    assert.equal(report.acceptance.installedE2E["win32-x64"], "SIMULATED")
    assert.notEqual(report.acceptance.installedE2EDetails["win32-x64"].status, "PASS")
    assert.equal(report.targetStatuses["win32-x64"].releaseStatus, "SIMULATED")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
