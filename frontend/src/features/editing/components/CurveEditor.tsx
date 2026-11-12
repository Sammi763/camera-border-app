import { useMemo, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import type { CurvePoint, MonotonicCurve } from "../../../types/imageProcessing"

type CurveEditorProps = {
  readonly label: string
  readonly curve: MonotonicCurve | null | undefined
  readonly onChange: (curve: MonotonicCurve | null, historyTag: string) => void
  readonly disabled?: boolean
}

const IDENTITY_POINTS: readonly CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0.5 },
  { x: 1, y: 1 }
]

const SIZE = 120
const PADDING = 10
const PLOT = SIZE - PADDING * 2
const MIN_GAP = 0.02

const toPixel = (value: number): number => PADDING + value * PLOT
const toNormalized = (pixel: number): number => (pixel - PADDING) / PLOT

/**
 * 单调曲线编辑器：端点固定 (0,0)/(1,1)，中间点可拖动；x 严格递增、y 单调不减。
 * 拖动期间使用同一 historyTag，由队列历史合并为一次撤销动作。
 */
export const CurveEditor = ({ label, curve, onChange, disabled = false }: CurveEditorProps): JSX.Element => {
  const points = useMemo<readonly CurvePoint[]>(
    () => (curve?.points && curve.points.length >= 2 ? curve.points : IDENTITY_POINTS),
    [curve]
  )
  const draggingIndex = useRef<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const gesture = useRef(0)
  const instance = useRef(Math.random().toString(36).slice(2))
  const prefix = `curve:${label}:${instance.current}`
  const historyTag = useRef(`${prefix}:0`)

  const updatePoint = (index: number, x: number, y: number): void => {
    if (index <= 0 || index >= points.length - 1) return
    const previous = points[index - 1]!
    const next = points[index + 1]!
    const clampedX = Math.min(next.x - MIN_GAP, Math.max(previous.x + MIN_GAP, x))
    const clampedY = Math.min(next.y, Math.max(previous.y, y))
    const nextPoints = points.map((point, pointIndex) =>
      pointIndex === index ? { x: clampedX, y: clampedY } : point
    )
    onChange({ interpolation: "linear", points: nextPoints }, historyTag.current)
  }

  const addPoint = (x?: number, y?: number): void => {
    if (disabled || points.length >= 17) return
    if (x === undefined) {
      let widest = 0; let gap = 0
      for (let i = 0; i < points.length - 1; i++) if (points[i + 1]!.x - points[i]!.x > gap) {
        gap = points[i + 1]!.x - points[i]!.x; widest = i
      }
      x = (points[widest]!.x + points[widest + 1]!.x) / 2
      y = (points[widest]!.y + points[widest + 1]!.y) / 2
    }
    const index = points.findIndex((point) => point.x > x!)
    if (index <= 0 || x - points[index - 1]!.x < MIN_GAP || points[index]!.x - x < MIN_GAP) return
    const point = { x, y: Math.max(points[index - 1]!.y, Math.min(points[index]!.y, y ?? x)) }
    onChange({ interpolation: "linear", points: [...points.slice(0, index), point, ...points.slice(index)] }, `${prefix}:add:${++gesture.current}`)
    setSelected(index)
  }
  const removePoint = (index: number | null): void => {
    if (disabled || index === null || index <= 0 || index >= points.length - 1) return
    onChange({ interpolation: "linear", points: points.filter((_, i) => i !== index) }, `${prefix}:delete:${++gesture.current}`)
    setSelected(null)
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const index = draggingIndex.current
    if (index === null || disabled) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = toNormalized(((event.clientX - rect.left) / rect.width) * SIZE)
    const y = 1 - toNormalized(((event.clientY - rect.top) / rect.height) * SIZE)
    updatePoint(index, x, y)
  }

  return (
    <div className="filmCurveEditor">
      <div className="filmCurveHeader">
        <span className="settingLabel">{label}</span>
        <button
          type="button"
          className="ghostButton filmCurveReset"
          disabled={disabled}
          onClick={() => onChange(null, `${prefix}:reset:${++gesture.current}`)}
        >
          重置曲线
        </button>
      </div>
      <div className="filmPreviewTools">
        <button type="button" disabled={disabled || points.length >= 17} onClick={() => addPoint()} aria-label={`${label}添加控制点`}>添加控制点</button>
        <button type="button" disabled={disabled || selected === null || selected <= 0 || selected >= points.length - 1} onClick={() => removePoint(selected)}>删除控制点</button>
      </div>
      <svg
        className="filmCurveSvg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="application"
        aria-label={`${label}曲线编辑器`}
        onPointerMove={handlePointerMove}
        onPointerUp={() => { draggingIndex.current = null }}
        onPointerCancel={() => { draggingIndex.current = null }}
        onDoubleClick={(event) => {
          if (event.target instanceof SVGElement && event.target.tagName.toLowerCase() === "circle") return
          const rect = event.currentTarget.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return
          addPoint(toNormalized((event.clientX - rect.left) / rect.width * SIZE), 1 - toNormalized((event.clientY - rect.top) / rect.height * SIZE))
        }}
      >
        <rect x={PADDING} y={PADDING} width={PLOT} height={PLOT} className="filmCurveFrame" />
        <line x1={PADDING} y1={SIZE - PADDING} x2={SIZE - PADDING} y2={PADDING} className="filmCurveIdentity" />
        <polyline
          className="filmCurveLine"
          points={points.map((point) => `${toPixel(point.x)},${SIZE - toPixel(point.y)}`).join(" ")}
        />
        {points.map((point, index) => (
          <circle
            key={index}
            cx={toPixel(point.x)}
            cy={SIZE - toPixel(point.y)}
            r={index === 0 || index === points.length - 1 ? 3 : 5}
            className={`filmCurvePoint${index === 0 || index === points.length - 1 ? " filmCurvePointFixed" : ""}`}
            data-testid={`${label}-curve-point-${index}`}
            tabIndex={disabled || index === 0 || index === points.length - 1 ? -1 : 0}
            role="slider"
            aria-label={`${label}控制点${index}`}
            aria-valuemin={0} aria-valuemax={1} aria-valuenow={point.y}
            onFocus={() => setSelected(index)}
            onKeyDown={(event) => {
              if (disabled || index === 0 || index === points.length - 1) return
              if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removePoint(index); return }
              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return
              event.preventDefault()
              historyTag.current = `${prefix}:key:${++gesture.current}`
              const step = event.shiftKey ? .05 : .01
              updatePoint(index, point.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
                point.y + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0))
            }}
            onPointerDown={(event) => {
              if (disabled) return
              const svg = event.currentTarget.ownerSVGElement
              if (typeof svg?.setPointerCapture === "function") svg.setPointerCapture(event.pointerId)
              historyTag.current = `${prefix}:drag:${++gesture.current}`
              setSelected(index)
              draggingIndex.current = index
            }}
          />
        ))}
      </svg>
    </div>
  )
}
