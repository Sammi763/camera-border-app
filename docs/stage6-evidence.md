# 阶段 6 证据格式

阶段 6 的最终报告只接受安装包证据，不接受源码运行、交叉构建或应用自身的口头状态。所有
证据中的 `packageCommit` 必须与对应安装包 manifest 的完整 40 位 `commit` 相同。发布范围
以 [`docs/release-scope.json`](release-scope.json) 为准：`darwin-arm64` 是唯一正式目标，
`darwin-x64` 与 `win32-x64` 是候选目标，Windows 的报告状态固定为 `SIMULATED`。

## 收集和汇总

每个需要登记的目标的 packaged E2E 必须连续执行两次，并把每次结果放在独立目录中。只有从 DMG/NSIS
安装后的应用启动，并设置 `CAMBORDER_E2E_INSTALLED_FROM_PACKAGE=1`，结果才可计入阶段 6；
直接启动 `mac-*/Camera Border.app` 或 `win-unpacked` 只能作为开发诊断：

```bash
CAMBORDER_E2E_ARTIFACT_DIR="$ROOT/evidence/darwin-arm64/run-1" pnpm e2e:packaged
CAMBORDER_E2E_ARTIFACT_DIR="$ROOT/evidence/darwin-arm64/run-2" pnpm e2e:packaged
```

下载正式目标和候选 runner 的安装包 manifest 与证据后，放到同一个 release root，使用重复
参数生成报告；候选证据可以缺失且不阻塞正式门，`--user-study` 指向匿名用户测试结果：

```bash
node scripts/generate-release-report.mjs \
  --release-root ./release \
  --e2e-artifact-root ./evidence/darwin-arm64 \
  --e2e-artifact-root ./evidence/darwin-x64 \
  --e2e-artifact-root ./evidence/win32-x64 \
  --acceptance-root ./evidence/darwin-arm64 \
  --acceptance-root ./evidence/darwin-x64 \
  --acceptance-root ./evidence/win32-x64 \
  --user-study ./evidence/photographer-study.json \
  --output ./release/release-report.json
```

报告生成器会重新读取每个 manifest 指向的安装包，核对实际字节数、SHA-256 和同目录
`.sha256` sidecar；缺失、过期、重复或未知目标的 manifest 会直接失败，不能进入最终报告。

正式目标的两次 E2E 必须包含 `packaged-e2e-result.json` 中的 `bundledRuntime`、
`independentExifTool`、`sourceShaUnchanged`、`offlineCspBoundary` 和 `restartRecovery`。
报告器会按目标平台、架构和 package commit 匹配，不会把其它包或其它平台的结果拼成通过；
候选平台的记录仍会保留，但不参与 `finalGate`，Windows 不会被写成平台验收 `PASS`。
`install-lifecycle-result.json` 还必须证明程序目录和应用/Java Engine 进程均已清理，并且约定的
用户数据目录仍存在。

## 清洁系统证据

`clean-system-result.json` 的 `status` 只有在以下事实都已由干净系统记录后才能写为 `PASS`：

```json
{
  "schemaVersion": 1,
  "kind": "clean-system",
  "status": "PASS",
  "platform": "darwin",
  "arch": "arm64",
  "packageCommit": "<manifest.commit>",
  "installedFromPackage": true,
  "systemDependencies": {
    "java": false,
    "exiftool": false,
    "node": false,
    "pnpm": false,
    "maven": false,
    "python": false,
    "heicExtension": false
  },
  "steps": {
    "install": true,
    "firstLaunch": true,
    "import": true,
    "preview": true,
    "export": true,
    "restartRecovery": true,
    "engineRecovery": true,
    "uninstall": true
  },
  "independentExifTool": true,
  "sourceShaUnchanged": true,
  "completedAt": "<ISO-8601>"
}
```

`heicExtension=false` 表示目标系统没有预装系统 HEIC 扩展或其它额外解码器；HEIC 成功必须
来自安装包内助手。Windows 额外使用 `scripts/smoke-test-windows.ps1 -RequireNoSystemDependencies`，
该检查失败时不得继续记录清洁系统通过。

## 断网证据

`offline-result.json` 必须在系统网络已阻断时生成，且全流程重新执行；不能只把应用内 CSP
探测当作操作系统断网证明：

```json
{
  "schemaVersion": 1,
  "kind": "offline",
  "status": "PASS",
  "platform": "darwin",
  "arch": "arm64",
  "packageCommit": "<manifest.commit>",
  "networkBlocked": true,
  "externalRequests": 0,
  "steps": {
    "install": true,
    "firstLaunch": true,
    "import": true,
    "preview": true,
    "export": true,
    "restartRecovery": true,
    "engineRecovery": true,
    "uninstall": true
  },
  "independentExifTool": true,
  "sourceShaUnchanged": true,
  "completedAt": "<ISO-8601>"
}
```

网络请求计数应来自系统抓包/防火墙日志和应用 E2E 的请求记录；安装、重启、引擎恢复和卸载
任一步失败，都必须将 `status` 记为 `FAIL` 或 `NOT_RUN`，不能改成部分通过。

## 摄影用户结果

`--user-study` 使用 [首次使用测试记录](user-study-stage6.md) 的匿名结果，可从
[JSON 模板](user-study-stage6-result.template.json) 开始，至少包括：
`participants >= 5`、`firstUseCompletionRate >= 0.8`、`medianFirstOutputSeconds <= 180`、
`rawMisunderstandings = 0`、`scopeMisunderstandings = 0`、`defects.P0 = defects.P1 = defects.P2 = 0`
和空的 `blockers`。`defects.P3` 可以大于零，但只能对应不影响理解和使用的纯视觉问题。模板
中的 `NOT_RUN` 不是通过值。
