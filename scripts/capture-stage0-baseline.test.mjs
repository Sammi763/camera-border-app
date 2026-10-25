import test from "node:test"
import assert from "node:assert/strict"
import { buildStage0VerificationReport } from "./capture-stage0-baseline.mjs"

const makeManifest = () => ({
  fileCount: 15,
  files: [
    ...Array.from({ length: 9 }, (_, index) => ({
      fileName: `photo-${index}.jpg`,
      format: "JPEG",
      sha256: "a".repeat(64)
    })),
    ...Array.from({ length: 6 }, (_, index) => ({
      fileName: `raw-${index}.ARW`,
      format: "ARW",
      orientation: 8,
      pixelSource: "embedded-jpeg",
      pixelBitDepth: 8,
      containerBitDepth: 14,
      embeddedJpeg: { present: true, selector: "JpgFromRaw", bytes: 100, bitDepth: 8 },
      sha256: "b".repeat(64)
    }))
  ]
})

const makeGeometry = (actualInvariant = true, modeLabel = "100%") => [
  { scene: "landscape-default", error: undefined },
  { scene: "arw-vertical", error: undefined, photoDisplay: { width: 400, height: 800 } },
  { scene: "polaroid", error: undefined },
  { scene: "preview-100-percent", error: undefined, mode: "actual", modeLabel, actualInvariant }
]

const makeRunInfo = () => ({
  sourceShaUnchanged: true,
  releaseScope: {
    formalTargets: ["darwin-arm64"],
    targetPolicies: {
      "darwin-x64": { releaseBlocking: false },
      "win32-x64": { releaseStatus: "SIMULATED" }
    }
  }
})

const artifacts = ["landscape-default", "arw-vertical", "polaroid", "preview-100-percent"]
  .map((name) => ({ path: `${name}.png`, exists: true, validPng: true, sha256: "c".repeat(64) }))

test("四张截图、manifest、scope 和 100% 实际几何齐全时通过阶段 0 验收", () => {
  const report = buildStage0VerificationReport({
    manifest: makeManifest(),
    runInfo: makeRunInfo(),
    geometry: makeGeometry(),
    artifactPaths: artifacts,
    network: { externalRequests: 0, uploadRequests: 0 }
  })
  assert.equal(report.status, "PASS")
  assert.equal(report.checks.sourceFileCount, true)
  assert.equal(report.checks.rawBitDepthSeparated, true)
  assert.equal(report.checks.actualMode, true)
  assert.equal(report.independentOfFinalReleaseStatus, true)
  assert.equal(report.artifacts[0].sha256.length, 64)
  assert.deepEqual(report.artifacts.map((artifact) => artifact.path), report.artifactPaths)
})

test("缺少截图或 100% 只有文案时不得通过", () => {
  const missingScreenshot = buildStage0VerificationReport({
    manifest: makeManifest(),
    runInfo: makeRunInfo(),
    geometry: makeGeometry(),
    artifactPaths: artifacts.map((artifact, index) => index === 2 ? { ...artifact, exists: false } : artifact),
    network: { externalRequests: 0, uploadRequests: 0 }
  })
  assert.equal(missingScreenshot.status, "FAIL")
  assert.equal(missingScreenshot.checks.screenshots, false)

  const labelOnly = buildStage0VerificationReport({
    manifest: makeManifest(),
    runInfo: makeRunInfo(),
    geometry: makeGeometry(false, "100%"),
    artifactPaths: artifacts,
    network: { externalRequests: 0, uploadRequests: 0 }
  })
  assert.equal(labelOnly.checks.actualMode, false)
})

test("外部请求、上传或源照片哈希变化时不得写成通过", () => {
  const report = buildStage0VerificationReport({
    manifest: makeManifest(),
    runInfo: { ...makeRunInfo(), sourceShaUnchanged: false },
    geometry: makeGeometry(),
    artifactPaths: artifacts,
    network: { externalRequests: 1, uploadRequests: 1 }
  })
  assert.equal(report.status, "FAIL")
  assert.equal(report.checks.sourceHashesUnchanged, false)
  assert.equal(report.checks.noExternalRequests, false)
  assert.equal(report.checks.noUploadRequests, false)
})
