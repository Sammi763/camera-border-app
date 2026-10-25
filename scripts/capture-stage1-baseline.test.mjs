import test from "node:test"
import assert from "node:assert/strict"

import {
  buildStage1VerificationReport,
  orientedDimensions
} from "./capture-stage1-baseline.mjs"

const arwNames = [
  "DSC04875.ARW",
  "DSC04876.ARW",
  "DSC04877.ARW",
  "DSC04881.ARW",
  "DSC04882.ARW",
  "DSC04883.ARW"
]

const makeManifest = () => ({
  fileCount: 15,
  files: [
    ...Array.from({ length: 9 }, (_, index) => ({
      fileName: `photo-${index}.jpg`,
      format: "JPEG",
      sha256: "a".repeat(64)
    })),
    ...arwNames.map((fileName) => ({
      fileName,
      format: "ARW",
      relativePath: `photos/${fileName}`,
      orientation: 8,
      pixelDimensions: { width: 7008, height: 4672 },
      sha256: "b".repeat(64)
    }))
  ]
})

const baseCanvas = {
  logicalWidth: 900,
  logicalHeight: 600,
  backingWidth: 1800,
  backingHeight: 1200,
  css: { width: 900, height: 600 },
  cssLogicalScale: { x: 1, y: 1 }
}

const makeGeometry = () => [
  {
    scene: "landscape-default",
    error: undefined,
    photoDisplay: { width: 800, height: 500 },
    canvas: baseCanvas,
    fitInvariant: true,
    placement: { mode: "fit", cropAllowed: false, cropApplied: false },
    aspectError: 0,
    engineSyncLabel: "引擎预览已同步"
  },
  {
    scene: "arw-vertical",
    error: undefined,
    photoDisplay: { width: 400, height: 600 },
    canvas: baseCanvas,
    fitInvariant: true,
    placement: { mode: "fit", cropAllowed: false, cropApplied: false },
    orientationEvidence: { orientation: 8, applied: true, decodeMode: "embedded-jpeg" },
    aspectError: 0,
    engineSyncLabel: "引擎预览已同步"
  },
  {
    scene: "polaroid",
    error: undefined,
    photoDisplay: { width: 700, height: 500 },
    canvas: baseCanvas,
    fitInvariant: true,
    placement: { mode: "fit", cropAllowed: false, cropApplied: false },
    aspectError: 0,
    engineSyncLabel: "引擎预览已同步"
  },
  {
    scene: "preview-100-percent",
    error: undefined,
    mode: "actual",
    modeLabel: "100%",
    photoDisplay: { width: 800, height: 500 },
    canvas: { ...baseCanvas, logicalWidth: 900, logicalHeight: 600 },
    naturalCanvas: { width: 900, height: 600 },
    oneToOne: true,
    actualInvariant: true,
    placement: { mode: "fit", cropAllowed: false, cropApplied: false },
    aspectError: 0,
    engineSyncLabel: "引擎预览已同步"
  }
]

const makeArwEvidence = () => arwNames.map((fileName) => ({
  scene: `arw-validation-${fileName}`,
  error: undefined,
  source: { format: "ARW", fileName },
  photoDisplay: { width: 400, height: 600 },
  canvas: baseCanvas,
  fitInvariant: true,
  aspectError: 0,
  orientationEvidence: { orientation: 8, applied: true, decodeMode: "embedded-jpeg" },
  engineSyncLabel: "引擎预览已同步"
}))

const artifacts = ["landscape-default", "arw-vertical", "polaroid", "preview-100-percent"]
  .map((name) => ({ path: `${name}.png`, exists: true, validPng: true, sha256: "c".repeat(64) }))

const exportEvidence = {
  status: "PASS",
  records: arwNames.map((sourceFileName) => ({
    sourceFileName,
    exists: true,
    orientation: 1,
    width: 4672,
    height: 7008,
    bitDepth: 8,
    sha256: "d".repeat(64)
  }))
}

const runInfo = {
  sourceShaUnchanged: true,
  releaseScope: {
    formalTargets: ["darwin-arm64"],
    targetPolicies: {
      "darwin-x64": { releaseBlocking: false },
      "win32-x64": { releaseBlocking: false, releaseStatus: "SIMULATED" }
    }
  }
}

test("阶段 1 正常证据覆盖六张 ARW、四张截图和 1:1 实际模式", () => {
  const report = buildStage1VerificationReport({
    manifest: makeManifest(),
    runInfo,
    geometry: makeGeometry(),
    arwEvidence: makeArwEvidence(),
    artifactPaths: artifacts,
    network: { externalRequests: 0, uploadRequests: 0 },
    sourceSet: true,
    exportEvidence
  })

  assert.equal(report.status, "PASS")
  assert.equal(report.checks.arwDirection, true)
  assert.equal(report.checks.actualMode, true)
  assert.equal(report.independentOfFinalReleaseStatus, true)
})

test("任一 ARW 方向、比例或实际模式证据缺失时不得通过", () => {
  const horizontalArw = makeArwEvidence()
  horizontalArw[2] = {
    ...horizontalArw[2],
    photoDisplay: { width: 600, height: 400 },
    orientationEvidence: { orientation: 8, applied: false, decodeMode: "embedded-jpeg" }
  }
  const report = buildStage1VerificationReport({
    manifest: makeManifest(),
    runInfo,
    geometry: makeGeometry().map((item) => item.scene === "preview-100-percent"
      ? { ...item, oneToOne: false, actualInvariant: false }
      : item),
    arwEvidence: horizontalArw,
    artifactPaths: artifacts,
    network: { externalRequests: 0, uploadRequests: 0 },
    sourceSet: true,
    exportEvidence
  })

  assert.equal(report.status, "FAIL")
  assert.equal(report.checks.arwDirection, false)
  assert.equal(report.checks.actualMode, false)
})

test("Orientation 5–8 交换宽高，1–4 保持宽高", () => {
  const landscape = { format: "ARW", orientation: 8, pixelDimensions: { width: 7008, height: 4672 } }
  assert.deepEqual(orientedDimensions(landscape), { width: 4672, height: 7008 })
  assert.deepEqual(orientedDimensions({ ...landscape, orientation: 3 }), { width: 7008, height: 4672 })
})

test("独立导出证据缺失或仍带 Orientation=8 时不得通过", () => {
  const report = buildStage1VerificationReport({
    manifest: makeManifest(),
    runInfo,
    geometry: makeGeometry(),
    arwEvidence: makeArwEvidence(),
    artifactPaths: artifacts,
    network: { externalRequests: 0, uploadRequests: 0 },
    sourceSet: true,
    exportEvidence: {
      ...exportEvidence,
      status: "FAIL",
      records: exportEvidence.records.map((record, index) => index === 0 ? { ...record, orientation: 8 } : record)
    }
  })

  assert.equal(report.status, "FAIL")
  assert.equal(report.checks.exportIndependentExifTool, false)
})
