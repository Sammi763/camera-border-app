import { afterEach, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { FilmResearchIndex } from "./FilmResearchIndex"
afterEach(() => vi.unstubAllGlobals())
it("内置资料离线索引支持玩家别称与数值曲线查阅，不依赖本机 PDF", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    films: [{ id: "portra", brand: "Kodak", name: "Portra 160", category: "color-negative", aliases: [], sourceIds: [] },
      { id: "paper", brand: "Washi", name: "Paper", category: "paper", materialKind: "paper", aliases: [], sourceIds: [] }],
    sources: [], aliases: [{ alias: "炮塔160", filmIds: ["portra"] }],
    characteristicCurveDatasets: [{ filmId: "portra", publication: "E-4051", method: "pdf-vector-bezier", densityReadingUncertainty: .02,
      modelReady: false, channels: { red: [[-3, .2], [0, 2]] } }]
  }), { headers: { "Content-Type": "application/json" } })))
  render(<FilmResearchIndex />)
  await screen.findByText(/1 条胶片记录/)
  fireEvent.change(screen.getByLabelText("内置资料检索"), { target: { value: "炮塔160" } })
  expect(screen.getByText(/匹配 1 条/)).toBeTruthy()
  expect(screen.queryByText(/Washi Paper/)).toBeNull()
  fireEvent.click(screen.getByText(/Kodak Portra 160/))
  expect(screen.getByRole("img", { name: "Portra 160 特性曲线" })).toBeTruthy()
  expect(screen.getByText(/模型未标定/)).toBeTruthy()
})
it("资料服务不可用只提示资料状态", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 500 })))
  render(<FilmResearchIndex />)
  expect(await screen.findByRole("status")).toHaveProperty("textContent", expect.stringContaining("不影响当前照片校色"))
})
