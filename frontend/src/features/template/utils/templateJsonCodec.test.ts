import { describe, expect, it } from "vitest"
import {
  encodeTemplateJson,
  decodeTemplateJson,
  deduplicateTemplateName,
} from "./templateJsonCodec"
import type { Template } from "../types"
import type { RenderSettings } from "../../settings/types"

const mockSettings: RenderSettings = {
  borderColor: "#ffffff",
  borderTop: 30,
  borderBottom: 80,
  borderLeft: 30,
  borderRight: 30,
  textContent: "{Camera} · {Lens} · {Film}",
  textFontSize: 20,
  textColor: "#222222",
  textPlacement: "bottom-center",
  textArea: "border",
  fontFamily: "serif",
  autoCrop: false,
  filmFormat: null,
  gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
  exportFormat: "png",
  jpegQuality: 95,
}

const mockTemplate: Template = {
  id: "test-id-123",
  name: "测试模板",
  settings: mockSettings,
  createdAt: 1700000000000,
}

describe("encodeTemplateJson", () => {
  it("导出 JSON 包含 kind / version / template", () => {
    const json = encodeTemplateJson(mockTemplate)
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed["kind"]).toBe("camera-border-template")
    expect(parsed["version"]).toBe(1)
    expect(typeof parsed["template"]).toBe("object")
  })

  it("导出 JSON 使用 2 空格缩进", () => {
    const json = encodeTemplateJson(mockTemplate)
    expect(json).toContain("  ")
    const lines = json.split("\n")
    const topLevelLine = lines.find((l) => l.startsWith("  ") && !l.startsWith("    "))
    expect(topLevelLine).toBeDefined()
  })

  it("导出的 template 包含原始 id / name / settings / createdAt", () => {
    const json = encodeTemplateJson(mockTemplate)
    const parsed = JSON.parse(json) as Record<string, unknown>
    const tpl = parsed["template"] as Record<string, unknown>
    expect(tpl["id"]).toBe("test-id-123")
    expect(tpl["name"]).toBe("测试模板")
    expect(tpl["createdAt"]).toBe(1700000000000)
    expect((tpl["settings"] as Record<string, unknown>)["borderColor"]).toBe("#ffffff")
  })
})

describe("decodeTemplateJson", () => {
  it("合法模板 JSON 解析成功", () => {
    const json = encodeTemplateJson(mockTemplate)
    const result = decodeTemplateJson(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.template.name).toBe("测试模板")
      expect(result.template.settings.borderColor).toBe("#ffffff")
    }
  })

  it("kind 错误失败", () => {
    const json = JSON.stringify({ kind: "wrong", version: 1, template: { name: "x", settings: mockSettings, createdAt: 0 } })
    const result = decodeTemplateJson(json)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("kind")
    }
  })

  it("version 不支持失败", () => {
    const json = JSON.stringify({ kind: "camera-border-template", version: 99, template: { name: "x", settings: mockSettings, createdAt: 0 } })
    const result = decodeTemplateJson(json)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("版本")
    }
  })

  it("缺少 template 失败", () => {
    const json = JSON.stringify({ kind: "camera-border-template", version: 1 })
    const result = decodeTemplateJson(json)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("template")
    }
  })

  it("settings 缺少必需字段失败", () => {
    const incompleteSettings = { borderColor: "#fff" }
    const json = JSON.stringify({ kind: "camera-border-template", version: 1, template: { name: "x", settings: incompleteSettings, createdAt: 0 } })
    const result = decodeTemplateJson(json)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("settings")
    }
  })

  it("导入时能生成新 id", () => {
    const json = encodeTemplateJson(mockTemplate)
    const result = decodeTemplateJson(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.template.id).not.toBe("test-id-123")
      expect(result.template.id).toMatch(/^[0-9a-f-]{36}$/)
    }
  })

  it("导入时 createdAt 被更新", () => {
    const json = encodeTemplateJson(mockTemplate)
    const before = Date.now()
    const result = decodeTemplateJson(json)
    const after = Date.now()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.template.createdAt).toBeGreaterThanOrEqual(before)
      expect(result.template.createdAt).toBeLessThanOrEqual(after)
    }
  })

  it("模板名称为空失败", () => {
    const json = JSON.stringify({ kind: "camera-border-template", version: 1, template: { name: "", settings: mockSettings, createdAt: 0 } })
    const result = decodeTemplateJson(json)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("名称")
    }
  })

  it("非法 JSON 失败", () => {
    const result = decodeTemplateJson("not json{{{")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("JSON")
    }
  })
})

describe("deduplicateTemplateName", () => {
  it("基础名不冲突时直接返回", () => {
    expect(deduplicateTemplateName("我的模板", [])).toBe("我的模板")
    expect(deduplicateTemplateName("我的模板", ["其他模板"])).toBe("我的模板")
  })

  it("同名模板追加 (导入)", () => {
    expect(deduplicateTemplateName("我的模板", ["我的模板"])).toBe("我的模板 (导入)")
  })

  it("同名模板追加递增序号", () => {
    const existing = ["我的模板", "我的模板 (导入)"]
    expect(deduplicateTemplateName("我的模板", existing)).toBe("我的模板 (导入 2)")
  })

  it("继续递增序号", () => {
    const existing = ["我的模板", "我的模板 (导入)", "我的模板 (导入 2)"]
    expect(deduplicateTemplateName("我的模板", existing)).toBe("我的模板 (导入 3)")
  })
})
