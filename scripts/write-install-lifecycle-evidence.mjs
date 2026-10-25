import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"
import process from "node:process"

const PROCESS_QUERY_FAILED = "__CAMBORDER_PROCESS_QUERY_FAILED__"

const readArg = (args, name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const requiredArg = (args, name) => {
  const value = readArg(args, name)
  if (value === undefined || value.length === 0) throw new Error(`缺少参数：${name}`)
  return value
}

const listProcessText = (platform) => {
  try {
    if (platform === "win32") {
      // tasklist 只返回映像名，无法区分应用自己的随包 Java 与其它 Java。
      // 使用 Windows 自带 CIM 查询命令行，才能在卸载后确认 engine JAR 没有残留。
      return execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process | ForEach-Object { '{0} {1}' -f $_.Name, $_.CommandLine }"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
      )
    }
    return execFileSync("ps", ["-axo", "command="], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  } catch {
    return PROCESS_QUERY_FAILED
  }
}

const sleepForProcessExit = (platform) => {
  try {
    if (platform === "win32") {
      execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", "Start-Sleep -Milliseconds 500"],
        { stdio: "ignore" }
      )
      return
    }
    execFileSync("sleep", ["0.5"], { stdio: "ignore" })
  } catch {
    // 轮询仍会继续；进程查询失败本身由 listProcessText 返回哨兵并判定为失败。
  }
}

const hasNoBackgroundProcess = (platform, processText) => processText !== PROCESS_QUERY_FAILED
  && processText.split(/\r?\n/).every((line) => {
    const processMarkers = platform === "win32"
      ? ["Camera Border.exe", "camera-border-engine.jar"]
      : ["Camera Border.app/Contents/MacOS/Camera Border", "camera-border-engine.jar"]
    return processMarkers.every((marker) => !line.includes(marker))
  })

const waitForBackgroundProcessExit = (platform, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs
  let processText = PROCESS_QUERY_FAILED
  while (Date.now() <= deadline) {
    processText = listProcessText(platform)
    if (hasNoBackgroundProcess(platform, processText)) return true
    sleepForProcessExit(platform)
  }
  return hasNoBackgroundProcess(platform, processText)
}

const main = () => {
  const args = process.argv.slice(2)
  const output = path.resolve(requiredArg(args, "--output"))
  const platform = requiredArg(args, "--platform")
  const arch = requiredArg(args, "--arch")
  const packageCommit = requiredArg(args, "--package-commit")
  const installedPath = path.resolve(requiredArg(args, "--installed-path"))
  const userDataPath = path.resolve(requiredArg(args, "--user-data-path"))
  const installedPathRemoved = !existsSync(installedPath)
  const backgroundProcessAbsent = waitForBackgroundProcessExit(platform)
  const userDataPreserved = userDataPath === null ? null : existsSync(userDataPath)
  const status = installedPathRemoved && backgroundProcessAbsent && userDataPreserved === true ? "PASS" : "FAIL"
  const evidence = {
    schemaVersion: 1,
    kind: "install-lifecycle",
    status,
    platform,
    arch,
    packageCommit,
    installedPath,
    installedPathRemoved,
    backgroundProcessAbsent,
    userDataPath,
    userDataPreserved,
    completedAt: new Date().toISOString()
  }
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8")
  console.log(`[install-lifecycle] ${status}: ${output}`)
  if (status !== "PASS") process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch (error) {
    console.error(`[install-lifecycle] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

export { listProcessText }
