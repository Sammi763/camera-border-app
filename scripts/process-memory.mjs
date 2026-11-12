import { execFileSync } from "node:child_process"

/** ps 的 RSS 单位为 KiB；保留空格路径，不把采样器自身算入应用。 */
export const parseProcessTable = (output) => output.split("\n").filter((line) => line.trim()).map((line) => {
  const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line)
  if (!match) throw new Error("进程内存快照格式无效")
  const [, pid, ppid, rss, command] = match
  const row = { pid: Number(pid), ppid: Number(ppid), rssBytes: Number(rss) * 1024, command }
  if (![row.pid, row.ppid, row.rssBytes].every(Number.isSafeInteger) || row.pid <= 0) {
    throw new Error("进程内存快照数值无效")
  }
  return row
})

export const processTree = (rows, rootPid) => {
  const ids = new Set([rootPid])
  let previous = 0
  while (ids.size !== previous) {
    previous = ids.size
    for (const row of rows) if (ids.has(row.ppid)) ids.add(row.pid)
  }
  return rows.filter((row) => ids.has(row.pid))
}

export const readProcesses = () => parseProcessTable(execFileSync("ps", ["-axo", "pid=,ppid=,rss=,command="], {
  encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 5000
}))

const roles = ["electron", "renderer", "java", "nativeHelper", "other"]
const roleOf = (row, rootPid) => {
  if (row.pid === rootPid) return "electron"
  if (row.command.includes("--type=renderer")) return "renderer"
  if (/film-raw-helper(?:\s|$)/.test(row.command)) return "nativeHelper"
  if (/\bjava\s.*camera-border-engine\.jar/.test(row.command)) return "java"
  return "other"
}

/** 记录同一时刻的角色 RSS 合计峰值；不能把多个时刻的独立峰值相加冒充整机峰值。 */
export class ProcessMemoryRecorder {
  constructor(rootPid) {
    this.rootPid = rootPid
    this.samples = 0
    this.peakTreeRssBytes = 0
    this.groups = Object.fromEntries(roles.map((role) => [role, { samples: 0, observedPeakRssBytes: null, pids: new Set() }]))
  }

  record(rows) {
    if (!rows.some((row) => row.pid === this.rootPid)) throw new Error("应用主进程已退出，无法继续采样")
    const tree = processTree(rows, this.rootPid)
    const current = Object.fromEntries(roles.map((role) => [role, 0]))
    const seen = new Set()
    for (const row of tree) {
      const role = roleOf(row, this.rootPid)
      current[role] += row.rssBytes
      this.groups[role].pids.add(row.pid)
      seen.add(role)
    }
    for (const role of seen) {
      const group = this.groups[role]
      group.samples++
      group.observedPeakRssBytes = Math.max(group.observedPeakRssBytes ?? 0, current[role])
    }
    this.samples++
    this.peakTreeRssBytes = Math.max(this.peakTreeRssBytes, Object.values(current).reduce((a, b) => a + b, 0))
  }

  snapshot() {
    return {
      samples: this.samples, observedPeakTreeRssBytes: this.peakTreeRssBytes,
      note: "定时采样的观测峰值，可能漏过短时尖峰；RSS 合计可能包含共享页，不等于唯一物理占用。",
      roles: Object.fromEntries(roles.map((role) => {
        const group = this.groups[role]
        return [role, { status: group.samples ? "MEASURED" : "NOT_OBSERVED", samples: group.samples,
          observedPeakRssBytes: group.observedPeakRssBytes, pids: [...group.pids] }]
      }))
    }
  }
}
