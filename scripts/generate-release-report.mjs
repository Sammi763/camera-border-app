import { createHash } from "node:crypto"
import { readdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_SCOPE_PATH = path.join(ROOT, "docs", "release-scope.json")
const REQUIRED_E2E_RUNS = 2
const REQUIRED_E2E_CHECKS = [
  "bundledRuntime",
  "independentExifTool",
  "sourceShaUnchanged",
  "offlineCspBoundary",
  "restartRecovery"
]
const REQUIRED_ENVIRONMENT_STEPS = [
  "install",
  "firstLaunch",
  "import",
  "preview",
  "export",
  "restartRecovery",
  "engineRecovery",
  "uninstall"
]
const REQUIRED_CLEAN_SYSTEM_DEPENDENCIES = [
  "java",
  "exiftool",
  "node",
  "pnpm",
  "maven",
  "python",
  "heicExtension"
]

const readArg = (args, name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const readArgs = (args, name) => args.flatMap((value, index) => value === name ? [args[index + 1]] : [])
  .filter((value) => typeof value === "string" && value.length > 0)

const sha256File = async (filePath) => createHash("sha256").update(await readFile(filePath)).digest("hex")

const targetPolicy = (scope, target) => scope.targetPolicies[target]

/** 发布范围是正式配置，不允许报告器自行补平台或改变 Windows 的模拟语义。 */
export const validateReleaseScope = (scope) => {
  if (scope?.schemaVersion !== 1) throw new Error("release scope schemaVersion 必须为 1")
  if (!Array.isArray(scope.formalTargets) || scope.formalTargets.length === 0) {
    throw new Error("release scope formalTargets 不能为空")
  }
  if (!Array.isArray(scope.candidateTargets)) throw new Error("release scope candidateTargets 必须是数组")
  const allTargets = [...scope.formalTargets, ...scope.candidateTargets]
  if (new Set(allTargets).size !== allTargets.length) throw new Error("release scope 目标不能重复")
  if (scope.targetPolicies === null || typeof scope.targetPolicies !== "object") {
    throw new Error("release scope targetPolicies 缺失")
  }
  for (const target of allTargets) {
    const policy = targetPolicy(scope, target)
    if (policy === null || typeof policy !== "object") throw new Error(`release scope 缺少目标策略：${target}`)
    if (!["FORMAL", "CANDIDATE"].includes(policy.role)) throw new Error(`release scope 目标角色无效：${target}`)
    if (typeof policy.releaseBlocking !== "boolean") throw new Error(`release scope 缺少 releaseBlocking：${target}`)
    if (typeof policy.acceptanceMode !== "string") throw new Error(`release scope 缺少 acceptanceMode：${target}`)
    if (scope.formalTargets.includes(target) && (policy.role !== "FORMAL" || policy.releaseBlocking !== true)) {
      throw new Error(`正式目标必须是 FORMAL 且 releaseBlocking=true：${target}`)
    }
    if (scope.candidateTargets.includes(target) && (policy.role !== "CANDIDATE" || policy.releaseBlocking !== false)) {
      throw new Error(`候选目标必须是 CANDIDATE 且 releaseBlocking=false：${target}`)
    }
  }
  const windowsPolicy = targetPolicy(scope, "win32-x64")
  if (windowsPolicy !== undefined
      && (windowsPolicy.acceptanceMode !== "SIMULATED" || windowsPolicy.releaseStatus !== "SIMULATED")) {
    throw new Error("Windows 目标必须固定为 acceptanceMode=SIMULATED、releaseStatus=SIMULATED")
  }
  return scope
}

export const loadReleaseScope = async (scopePath = DEFAULT_SCOPE_PATH) => {
  const resolvedPath = path.resolve(scopePath)
  let scope
  try {
    scope = JSON.parse(await readFile(resolvedPath, "utf8"))
  } catch (error) {
    throw new Error(`无法读取发布范围配置 ${resolvedPath}：${error instanceof Error ? error.message : String(error)}`)
  }
  validateReleaseScope(scope)
  return { scope, scopePath: resolvedPath }
}

export const releaseTargets = (scope) => [...scope.formalTargets, ...scope.candidateTargets]

const validateInstallerManifest = async (manifestPath, manifest) => {
  const installer = manifest?.installer
  if (installer === null || typeof installer !== "object"
      || typeof installer.file !== "string"
      || installer.file.length === 0
      || installer.file !== path.basename(installer.file)
      || !/^[0-9a-f]{64}$/i.test(installer.sha256 ?? "")
      || !Number.isInteger(installer.bytes)
      || installer.bytes <= 0) {
    throw new Error(`安装包 manifest 缺少有效 installer 证据：${manifestPath}`)
  }
  const installerPath = path.join(path.dirname(manifestPath), installer.file)
  const fileInfo = await stat(installerPath).catch(() => null)
  if (fileInfo === null || !fileInfo.isFile()) throw new Error(`manifest 指向的安装包不存在：${installerPath}`)
  if (fileInfo.size !== installer.bytes) throw new Error(`安装包字节数与 manifest 不一致：${installerPath}`)
  const actualSha256 = await sha256File(installerPath)
  if (actualSha256.toLowerCase() !== installer.sha256.toLowerCase()) {
    throw new Error(`安装包 SHA-256 与 manifest 不一致：${installerPath}`)
  }
  const sidecarPath = `${installerPath}.sha256`
  const sidecar = await readFile(sidecarPath, "utf8").catch(() => null)
  const expectedSidecar = `${actualSha256}  ${path.basename(installerPath)}`
  if (sidecar === null || sidecar.trim() !== expectedSidecar) {
    throw new Error(`安装包 SHA-256 sidecar 缺失或无效：${sidecarPath}`)
  }
  return { ...installer, sha256: actualSha256 }
}

export const findManifests = async (root) => {
  const results = []
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(candidate)
      } else if ((entry.name.startsWith("Camera-Border-Setup-") || entry.name.startsWith("Camera-Border-"))
          && entry.name.endsWith(".manifest.json")) {
        results.push(candidate)
      }
    }
  }
  await walk(root)
  return results.sort()
}

export const findE2eResults = async (root) => {
  if (root === undefined) return []
  const results = []
  const walk = async (current) => {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const candidate = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(candidate)
      else if (entry.name === "packaged-e2e-result.json") results.push(candidate)
    }
  }
  await walk(path.resolve(root))
  return results.sort()
}

const findNamedFiles = async (root, fileName) => {
  if (root === undefined) return []
  const results = []
  const walk = async (current) => {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const candidate = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(candidate)
      else if (entry.name === fileName) results.push(candidate)
    }
  }
  await walk(path.resolve(root))
  return results.sort()
}

export const readE2eEvidence = async (root) => {
  const evidence = new Map()
  for (const resultPath of await findE2eResults(root)) {
    try {
      const result = JSON.parse(await readFile(resultPath, "utf8"))
      if (typeof result?.platform !== "string" || typeof result?.arch !== "string") continue
      const target = `${result.platform}-${result.arch}`
      evidence.set(target, [...(evidence.get(target) ?? []), { ...result, resultPath }])
    } catch {
      // 无效证据保持缺失，不能让发布门误判为通过。
    }
  }
  return evidence
}

const readNamedEvidence = async (root, fileName) => {
  const evidence = new Map()
  for (const resultPath of await findNamedFiles(root, fileName)) {
    try {
      const result = JSON.parse(await readFile(resultPath, "utf8"))
      if (typeof result?.platform !== "string" || typeof result?.arch !== "string") continue
      const target = `${result.platform}-${result.arch}`
      evidence.set(target, [...(evidence.get(target) ?? []), { ...result, resultPath }])
    } catch {
      // 无效证据只能保持缺失，不能让发布门误判为通过。
    }
  }
  return evidence
}

const hasRequiredE2eChecks = (result) => REQUIRED_E2E_CHECKS.every((key) => result?.checks?.[key] === true)

export const matchingE2eRuns = (runs, packageInfo) => (runs ?? []).filter((result) =>
  packageInfo !== undefined
  && result.packageCommit !== undefined
  && result.status === "PASS"
  && result.installed === true
  && result.installedFromPackage === true
  && result.packageCommit === packageInfo?.sourceCommit
  && hasRequiredE2eChecks(result)
)

export const matchingLifecycleEvidence = (records, packageInfo) => (records ?? []).find((record) =>
  packageInfo !== undefined
  && record.packageCommit !== undefined
  && record.status === "PASS"
  && record.packageCommit === packageInfo?.sourceCommit
  && record.installedPathRemoved === true
  && record.backgroundProcessAbsent === true
  && record.userDataPreserved === true
)

const allTrue = (record, keys) => keys.every((key) => record?.[key] === true)

export const cleanSystemEvidenceIsComplete = (record) =>
  record?.installedFromPackage === true
  && allTrue(record, ["independentExifTool", "sourceShaUnchanged"])
  && allTrue(record?.steps, REQUIRED_ENVIRONMENT_STEPS)
  && REQUIRED_CLEAN_SYSTEM_DEPENDENCIES.every((dependency) => record?.systemDependencies?.[dependency] === false)

export const offlineEvidenceIsComplete = (record) =>
  record?.networkBlocked === true
  && record?.externalRequests === 0
  && allTrue(record, ["independentExifTool", "sourceShaUnchanged"])
  && allTrue(record?.steps, REQUIRED_ENVIRONMENT_STEPS)

const matchingEnvironmentEvidence = (records, packageInfo, kind) => (records ?? []).find((record) =>
  packageInfo !== undefined
  && record.packageCommit !== undefined
  && record.status === "PASS"
  && record.kind === kind
  && record.packageCommit === packageInfo?.sourceCommit
  && (kind === "clean-system" ? cleanSystemEvidenceIsComplete(record) : offlineEvidenceIsComplete(record))
)

const readUserStudy = async (filePath) => {
  if (filePath === undefined) return null
  try {
    return JSON.parse(await readFile(path.resolve(filePath), "utf8"))
  } catch {
    return null
  }
}

export const userStudyPasses = (study) => study?.status === "PASS"
  && Number.isInteger(study.participants) && study.participants >= 5
  && Number.isFinite(study.firstUseCompletionRate) && study.firstUseCompletionRate >= 0.8
  && Number.isFinite(study.medianFirstOutputSeconds) && study.medianFirstOutputSeconds <= 180
  && study.rawMisunderstandings === 0
  && study.scopeMisunderstandings === 0
  && study.defects?.P0 === 0
  && study.defects?.P1 === 0
  && study.defects?.P2 === 0
  && Number.isInteger(study.defects?.P3) && study.defects.P3 >= 0
  && (study.defects?.P3 === 0 || study.p3OnlyVisual === true)
  && Array.isArray(study.blockers) && study.blockers.length === 0

const statusForPolicy = (policy, rawStatus) => policy?.acceptanceMode === "SIMULATED" ? "SIMULATED" : rawStatus

const detailsForPolicy = (policy, rawStatus, details) => ({
  ...details,
  status: statusForPolicy(policy, rawStatus)
})

export const buildTargetStatuses = (scope, finalReady) => Object.fromEntries(releaseTargets(scope).map((target) => {
  const policy = targetPolicy(scope, target)
  return [target, {
    role: policy.role,
    releaseBlocking: policy.releaseBlocking,
    acceptanceMode: policy.acceptanceMode,
    releaseStatus: policy.releaseStatus
      ?? (policy.role === "FORMAL" ? (finalReady ? "PASS" : "NOT_READY") : "CANDIDATE")
  }]
}))

/** 只以 formalTargets 计算正式发布门；候选包仍进入报告，但不产生 blocker。 */
export const createReleaseReport = async ({
  releaseRoot,
  output,
  e2eRoots = [],
  acceptanceRoots = [],
  userStudyPath,
  scopePath = DEFAULT_SCOPE_PATH
}) => {
  const { scope, scopePath: resolvedScopePath } = await loadReleaseScope(scopePath)
  const targets = releaseTargets(scope)
  const e2eEvidence = new Map()
  const lifecycleEvidence = new Map()
  const cleanSystemEvidence = new Map()
  const offlineEvidence = new Map()
  for (const root of e2eRoots) {
    for (const [target, results] of await readE2eEvidence(root)) {
      e2eEvidence.set(target, [...(e2eEvidence.get(target) ?? []), ...results])
    }
  }
  for (const root of acceptanceRoots.length > 0 ? acceptanceRoots : e2eRoots) {
    for (const [target, results] of await readNamedEvidence(root, "install-lifecycle-result.json")) {
      lifecycleEvidence.set(target, [...(lifecycleEvidence.get(target) ?? []), ...results])
    }
    for (const [target, results] of await readNamedEvidence(root, "clean-system-result.json")) {
      cleanSystemEvidence.set(target, [...(cleanSystemEvidence.get(target) ?? []), ...results])
    }
    for (const [target, results] of await readNamedEvidence(root, "offline-result.json")) {
      offlineEvidence.set(target, [...(offlineEvidence.get(target) ?? []), ...results])
    }
  }
  const photographerStudy = await readUserStudy(userStudyPath) ?? {
    participants: 0,
    firstUseCompletionRate: null,
    medianFirstOutputSeconds: null,
    rawMisunderstandings: null,
    scopeMisunderstandings: null,
    defects: null,
    blockers: []
  }
  const manifestPaths = await findManifests(releaseRoot)
  if (manifestPaths.length === 0) throw new Error(`未找到安装包 manifest：${releaseRoot}`)

  const packages = []
  const seenTargets = new Set()
  for (const manifestPath of manifestPaths) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    const target = `${manifest.platform}-${manifest.arch}`
    if (!targets.includes(target)) throw new Error(`安装包 manifest 含未知发布目标：${target}`)
    if (seenTargets.has(target)) throw new Error(`安装包 manifest 含重复发布目标：${target}`)
    seenTargets.add(target)
    if (!/^[0-9a-f]{40}$/i.test(manifest.commit ?? "")) {
      throw new Error(`安装包 manifest 缺少完整源码 commit：${manifestPath}`)
    }
    const installer = await validateInstallerManifest(manifestPath, manifest)
    const policy = targetPolicy(scope, target)
    packages.push({
      platform: manifest.platform,
      arch: manifest.arch,
      target,
      version: manifest.version,
      installer,
      // PASS 仅表示安装包文件完整性，不表示平台验收通过。
      installerIntegrity: "PASS",
      releaseRole: policy.role,
      releaseBlocking: policy.releaseBlocking,
      acceptanceMode: policy.acceptanceMode,
      releaseStatus: policy.releaseStatus ?? (policy.role === "FORMAL" ? "NOT_READY" : "CANDIDATE"),
      manifestPath: path.relative(ROOT, manifestPath),
      componentManifest: manifest.components,
      sourceCommit: manifest.commit
    })
  }

  const packageByTarget = new Map(packages.map((item) => [item.target, item]))
  const installedE2EDetails = Object.fromEntries(targets.map((target) => {
    const packageInfo = packageByTarget.get(target)
    const policy = targetPolicy(scope, target)
    const runs = matchingE2eRuns(e2eEvidence.get(target), packageInfo)
    const rawStatus = runs.length >= REQUIRED_E2E_RUNS ? "PASS" : "NOT_RUN"
    return [target, detailsForPolicy(policy, rawStatus, {
      observedRuns: e2eEvidence.get(target)?.length ?? 0,
      passingRuns: runs.length,
      requiredRuns: REQUIRED_E2E_RUNS,
      resultPaths: runs.map((result) => path.relative(ROOT, result.resultPath))
    })]
  }))
  const installedE2E = Object.fromEntries(Object.entries(installedE2EDetails).map(([target, details]) => [target, details.status]))

  const uninstallDetails = Object.fromEntries(targets.map((target) => {
    const packageInfo = packageByTarget.get(target)
    const policy = targetPolicy(scope, target)
    const evidence = matchingLifecycleEvidence(lifecycleEvidence.get(target), packageInfo)
    const rawStatus = evidence === undefined ? "NOT_RUN" : "PASS"
    return [target, detailsForPolicy(policy, rawStatus, {
      evidencePath: evidence === undefined ? null : path.relative(ROOT, evidence.resultPath)
    })]
  }))
  const uninstall = Object.fromEntries(Object.entries(uninstallDetails).map(([target, details]) => [target, details.status]))

  const cleanSystemDetails = Object.fromEntries(targets.map((target) => {
    const packageInfo = packageByTarget.get(target)
    const policy = targetPolicy(scope, target)
    const evidence = matchingEnvironmentEvidence(cleanSystemEvidence.get(target), packageInfo, "clean-system")
    const rawStatus = evidence === undefined ? "NOT_RUN" : "PASS"
    return [target, detailsForPolicy(policy, rawStatus, {
      evidencePath: evidence === undefined ? null : path.relative(ROOT, evidence.resultPath)
    })]
  }))
  const cleanSystemByTarget = Object.fromEntries(Object.entries(cleanSystemDetails).map(([target, details]) => [target, details.status]))

  const offlineDetails = Object.fromEntries(targets.map((target) => {
    const packageInfo = packageByTarget.get(target)
    const policy = targetPolicy(scope, target)
    const evidence = matchingEnvironmentEvidence(offlineEvidence.get(target), packageInfo, "offline")
    const rawStatus = evidence === undefined ? "NOT_RUN" : "PASS"
    return [target, detailsForPolicy(policy, rawStatus, {
      evidencePath: evidence === undefined ? null : path.relative(ROOT, evidence.resultPath)
    })]
  }))
  const offlineByTarget = Object.fromEntries(Object.entries(offlineDetails).map(([target, details]) => [target, details.status]))

  const formalStatuses = (statuses) => scope.formalTargets.every((target) => statuses[target] === "PASS")
  const cleanSystem = formalStatuses(cleanSystemByTarget) ? "PASS" : "NOT_RUN"
  const offline = formalStatuses(offlineByTarget) ? "PASS" : "NOT_RUN"
  const installedFormalMissing = scope.formalTargets.filter((target) => installedE2E[target] !== "PASS")
  const uninstallFormalMissing = scope.formalTargets.filter((target) => uninstall[target] !== "PASS")
  const studyPass = userStudyPasses(photographerStudy)
  const finalReady = installedFormalMissing.length === 0
    && uninstallFormalMissing.length === 0
    && cleanSystem === "PASS"
    && offline === "PASS"
    && studyPass
  const studyDefectsInvalid = photographerStudy?.status === "PASS"
    && (photographerStudy?.defects?.P0 !== 0
      || photographerStudy?.defects?.P1 !== 0
      || photographerStudy?.defects?.P2 !== 0
      || (photographerStudy?.defects?.P3 > 0 && photographerStudy?.p3OnlyVisual !== true))
  const blockers = [
    ...(installedFormalMissing.length > 0 ? [`正式目标安装后 E2E 证据不足（每个正式目标至少连续两次）：${installedFormalMissing.join("、")}`] : []),
    ...(uninstallFormalMissing.length > 0 ? [`正式目标卸载后进程/目录清理证据未登记：${uninstallFormalMissing.join("、")}`] : []),
    ...(cleanSystem !== "PASS" ? ["正式目标干净系统证据未登记或未完整覆盖"] : []),
    ...(offline !== "PASS" ? ["正式目标网络阻断后的核心流程证据未登记或未完整覆盖"] : []),
    ...(studyDefectsInvalid ? ["P0/P1/P2 必须为零；P3 只能是明确登记的不影响使用的纯视觉问题"] : []),
    ...(!studyPass ? ["5 名摄影用户首次使用测试未达到通过门槛"] : [])
  ]
  const targetStatuses = buildTargetStatuses(scope, finalReady)
  for (const packageInfo of packages) {
    packageInfo.releaseStatus = targetStatuses[packageInfo.target]?.releaseStatus ?? packageInfo.releaseStatus
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    stage: 6,
    releaseScope: {
      schemaVersion: scope.schemaVersion,
      formalTargets: scope.formalTargets,
      candidateTargets: scope.candidateTargets,
      targetPolicies: scope.targetPolicies,
      configPath: path.relative(ROOT, resolvedScopePath),
      signing: false,
      notarization: false,
      autoUpdate: false
    },
    targetStatuses,
    packages,
    acceptance: {
      formalTargets: scope.formalTargets,
      candidateTargets: scope.candidateTargets,
      installedE2E,
      installedE2EDetails,
      uninstall,
      uninstallDetails,
      cleanSystem,
      cleanSystemByTarget,
      cleanSystemDetails,
      offline,
      offlineByTarget,
      offlineDetails,
      photographerStudy
    },
    finalGate: {
      verdict: finalReady ? "PASS" : "NOT_READY",
      nextStageAllowed: finalReady,
      releaseReady: finalReady,
      formalTargets: scope.formalTargets,
      ignoredCandidateTargets: scope.candidateTargets,
      blockers
    }
  }
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

const main = async () => {
  const args = process.argv.slice(2)
  const releaseRoot = path.resolve(readArg(args, "--release-root") ?? path.join(ROOT, "electron", "release"))
  const output = path.resolve(readArg(args, "--output") ?? path.join(releaseRoot, "release-report.json"))
  const report = await createReleaseReport({
    releaseRoot,
    output,
    scopePath: readArg(args, "--scope") ?? DEFAULT_SCOPE_PATH,
    e2eRoots: readArgs(args, "--e2e-artifact-root"),
    acceptanceRoots: readArgs(args, "--acceptance-root"),
    userStudyPath: readArg(args, "--user-study")
  })
  console.log(`[release-report] 已生成：${output}；正式门=${report.finalGate.verdict}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[release-report] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}

export {
  DEFAULT_SCOPE_PATH,
  findNamedFiles
}
