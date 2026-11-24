import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { CurveEditor } from "./CurveEditor"

describe("CurveEditor（T09 曲线拖动）", () => {
  it("拖动中间点保持单调并携带 historyTag", () => {
    const onChange = vi.fn()
    const curve = {
      interpolation: "linear" as const,
      points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }]
    }
    render(<CurveEditor label="总曲线" curve={curve} onChange={onChange} />)
    const svg = screen.getByRole("application")
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 120, height: 120,
      right: 120, bottom: 120, x: 0, y: 0, toJSON: () => ({})
    } as DOMRect)

    const middle = screen.getByTestId("总曲线-curve-point-1")
    fireEvent.pointerDown(middle, { pointerId: 1 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 92.4, clientY: 27.6 })
    fireEvent.pointerUp(svg, { pointerId: 1 })

    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls.at(-1)![0]
    expect(next.points[1].x).toBeCloseTo(0.8, 5)
    expect(next.points[1].y).toBeCloseTo(0.8, 5)
    expect(next.points[0]).toEqual({ x: 0, y: 0 })
    expect(next.points[2]).toEqual({ x: 1, y: 1 })
    expect(onChange.mock.calls.at(-1)![1]).toMatch(/^curve:总曲线:.*:drag:/)
  })

  it("端点不可拖动", () => {
    const onChange = vi.fn()
    render(<CurveEditor label="R" curve={null} onChange={onChange} />)
    const svg = screen.getByRole("application")
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 120, height: 120,
      right: 120, bottom: 120, x: 0, y: 0, toJSON: () => ({})
    } as DOMRect)

    fireEvent.pointerDown(screen.getByTestId("R-curve-point-0"), { pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(svg, { pointerId: 1 })

    expect(onChange).not.toHaveBeenCalled()
  })
  it("支持增加、删除、键盘调整，两个拖动不会合并历史", () => {
    const onChange = vi.fn()
    const curve = { interpolation: "linear" as const, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }] }
    render(<CurveEditor label="R" curve={curve} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "R添加控制点" }))
    expect(onChange.mock.calls.at(-1)![0].points).toHaveLength(4)
    fireEvent.keyDown(screen.getByRole("slider", { name: "R控制点1" }), { key: "ArrowUp" })
    expect(onChange.mock.calls.at(-1)![0].points[1].y).toBeCloseTo(.51)
    fireEvent.keyDown(screen.getByRole("slider", { name: "R控制点1" }), { key: "Delete" })
    expect(onChange.mock.calls.at(-1)![0].points).toHaveLength(2)
    const svg = screen.getByRole("application")
    vi.spyOn(svg,"getBoundingClientRect").mockReturnValue({ left:0,top:0,width:120,height:120 } as DOMRect)
    const point = screen.getByTestId("R-curve-point-1")
    fireEvent.pointerDown(point, { pointerId: 1 })
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 80, clientY: 40 })
    expect(onChange.mock.calls.at(-1)![1]).toContain(":delete:")
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 70, clientY: 50 })
    const first = onChange.mock.calls.at(-1)![1]
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 73, clientY: 45 })
    expect(onChange.mock.calls.at(-1)![1]).toBe(first)
    fireEvent.pointerUp(svg, { pointerId: 1 })
    fireEvent.pointerDown(point, { pointerId: 2 })
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 80, clientY: 40 })
    fireEvent.pointerUp(svg, { pointerId: 2 })
    expect(onChange.mock.calls.at(-1)![1]).not.toBe(first)
  })

  it("满 17 点时拒绝再次添加，组件禁用后也拒绝键盘修改", () => {
    const onChange = vi.fn()
    const curve = {
      interpolation: "linear" as const,
      points: Array.from({ length: 17 }, (_, index) => ({ x: index / 16, y: index / 16 }))
    }
    const { rerender } = render(<CurveEditor label="R" curve={curve} onChange={onChange} />)
    const add = screen.getByRole<HTMLButtonElement>("button", { name: "R添加控制点" })
    expect(add.disabled).toBe(true)
    const svg = screen.getByRole("application")
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 120, height: 120 } as DOMRect)
    fireEvent.doubleClick(svg, { clientX: 63.375, clientY: 56.625 })
    expect(onChange).not.toHaveBeenCalled()

    rerender(<CurveEditor label="R" curve={curve} onChange={onChange} disabled />)
    fireEvent.keyDown(screen.getByRole("slider", { name: "R控制点8" }), { key: "ArrowUp" })
    expect(onChange).not.toHaveBeenCalled()
  })
})
