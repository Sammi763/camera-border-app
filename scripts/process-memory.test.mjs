import test from "node:test"
import assert from "node:assert/strict"
import { parseProcessTable, ProcessMemoryRecorder } from "./process-memory.mjs"

test("按真实父子关系采样，包含重启的 Renderer 和短命 helper，排除其他 Java", () => {
  const recorder = new ProcessMemoryRecorder(10)
  recorder.record(parseProcessTable(`12 11 30 /app/film-raw-helper --probe
11 10 100 /app/java -jar /app/camera-border-engine.jar
10 1 40 /Applications/Camera Border.app/Camera Border
13 10 50 /app/Camera Border Helper --type=renderer
99 1 900 /other/java -jar /other/camera-border-engine.jar`))
  recorder.record(parseProcessTable(`10 1 60 /Applications/Camera Border.app/Camera Border
14 10 20 /app/Camera Border Helper --type=renderer`))
  const evidence = recorder.snapshot()
  assert.equal(evidence.roles.java.observedPeakRssBytes, 100 * 1024)
  assert.deepEqual(evidence.roles.renderer.pids, [13, 14])
  assert.equal(evidence.roles.nativeHelper.observedPeakRssBytes, 30 * 1024)
  assert.equal(evidence.observedPeakTreeRssBytes, 220 * 1024)
})

test("未观测角色不伪造为零，快照损坏或主进程退出明确失败", () => {
  const recorder = new ProcessMemoryRecorder(10)
  recorder.record(parseProcessTable("10 1 40 /app/Camera Border"))
  assert.equal(recorder.snapshot().roles.nativeHelper.status, "NOT_OBSERVED")
  assert.equal(recorder.snapshot().roles.nativeHelper.observedPeakRssBytes, null)
  assert.throws(() => parseProcessTable("broken"), /格式无效/)
  assert.throws(() => parseProcessTable("10 1 999999999999999999999 /app"), /数值无效/)
  assert.throws(() => recorder.record([]), /已退出/)
})
