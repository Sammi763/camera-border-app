import { describe, expect, it } from "vitest"
import { parsePort } from "./vitePort"

describe("Vite 开发端口解析", () => {
  it("接受有效端口", () => {
    expect(parsePort("5174", 4000)).toBe(5174)
    expect(parsePort("8099", 4000)).toBe(8099)
  })

  it("非法或越界端口回退默认值", () => {
    expect(parsePort(undefined, 5174)).toBe(5174)
    expect(parsePort("abc", 5174)).toBe(5174)
    expect(parsePort("0", 5174)).toBe(5174)
    expect(parsePort("65536", 5174)).toBe(5174)
  })
})
