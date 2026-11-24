import { NumberInput } from "../../../components/form/NumberInput"
import { useMemo, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import type { CurvePoint, MonotonicCurve } from "../../../types/imageProcessing"

type CurveEditorProps = {
  readonly label: string
  readonly curve: MonotonicCurve | null | undefined
  readonly onChange: (curve: MonotonicCurve | null, historyTag: string) => void
  readonly disabled?: boolean
  readonly histogram?: readonly number[] | undefined
  readonly sampledTones?: readonly number[] | undefined
  readonly pickingTone?: boolean | undefined
  readonly onPickTone?: (() => void) | undefined
  readonly channel?: CurveChannel
  readonly onChannelChange?: (channel: CurveChannel) => void
}

const CHANNELS = [
  { id: "master", label: "总", name: "总曲线" },
  { id: "red", label: "R", name: "红色通道" },
  { id: "green", label: "G", name: "绿色通道" },
  { id: "blue", label: "B", name: "蓝色通道" }
] as const

export type CurveChannel = typeof CHANNELS[number]["id"]

const IDENTITY_POINTS: readonly CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0.5 },
  { x: 1, y: 1 }
]

const SIZE = 120
const PADDING = 6
const PLOT = SIZE - PADDING * 2
const MIN_GAP = 0.02

const toPixel = (value: number): number => PADDING + value * PLOT
const toNormalized = (pixel: number): number => (pixel - PADDING) / PLOT

/**
 * 单调曲线编辑器：端点固定 (0,0)/(1,1)，中间点可拖动；x 严格递增、y 单调不减。
 * 拖动期间使用同一 historyTag，由队列历史合并为一次撤销动作。
 */
export const CurveEditor = ({ label, curve, onChange, disabled = false, channel = "master", onChannelChange, histogram, sampledTones, pickingTone, onPickTone }: CurveEditorProps): JSX.Element => {
  const points = useMemo<readonly CurvePoint[]>(
    () => (curve?.points && curve.points.length >= 2 ? curve.points : IDENTITY_POINTS),
    [curve]
  )
  const drag = useRef<{ index: number; pointerId: number } | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const gesture = useRef(0)
  const instance = useRef(Math.random().toString(36).slice(2))
  const prefix = `curve:${label}:${instance.current}`
  const historyTag = useRef(`${prefix}:0`)
  const selectedPoint = selected !== null && selected > 0 && selected < points.length - 1
    ? points[selected]
    : undefined
  const canAdd = points.length < 17 && points.slice(1).some((point, index) => point.x - points[index]!.x >= 2 * MIN_GAP)

  const histogramPeak = Math.max(1, ...(histogram ?? []))
  const updateCoordinate = (axis: "x" | "y", value: number): void => {
    if (selected === null || selectedPoint === undefined) return
    historyTag.current = `${prefix}:number:${++gesture.current}`
    updatePoint(selected, axis === "x" ? value : selectedPoint.x, axis === "y" ? value : selectedPoint.y)
  }

  const updatePoint = (index: number, x: number, y: number): void => {
    if (index <= 0 || index >= points.length - 1) return
    const previous = points[index - 1]!
    const next = points[index + 1]!
    // 旧配方允许较近的相邻点，编辑时也必须保留严格递增。
    const current = points[index]!
    const gap = Math.min(MIN_GAP, current.x - previous.x, next.x - current.x)
    const clampedX = Math.min(next.x - gap, Math.max(previous.x + gap, x))
    const clampedY = Math.min(next.y, Math.max(previous.y, y))
    if (current.x === clampedX && current.y === clampedY) return
    const nextPoints = points.map((point, pointIndex) =>
      pointIndex === index ? { x: clampedX, y: clampedY } : point
    )
    onChange({ interpolation: "linear", points: nextPoints }, historyTag.current)
  }

  const addPoint = (x?: number, y?: number): void => {
    if (disabled || !canAdd) return
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
    if (drag.current === null || event.pointerId !== drag.current.pointerId || disabled) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = toNormalized(((event.clientX - rect.left) / rect.width) * SIZE)
    const y = 1 - toNormalized(((event.clientY - rect.top) / rect.height) * SIZE)
    updatePoint(drag.current.index, x, y)
  }

  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }

  return (
    <section className="filmCurveEditor" aria-label="曲线" data-channel={channel}>
      <div className="filmCurveHeader">
        <h3>曲线</h3>
        <button
          type="button"
          className="ghostButton filmCurveReset"
          disabled={disabled}
          onClick={() => {
            setSelected(null)
            drag.current = null
            onChange(null, `${prefix}:reset:${++gesture.current}`)
          }}
        >
          重置当前通道
        </button>
      </div>
      {onChannelChange !== undefined && <div className="filmCurveChannels" role="group" aria-label="曲线通道">
        {CHANNELS.map(({ id, label: channelLabel, name }) => (
          <button key={id} type="button" data-channel={id} aria-label={name} aria-pressed={channel === id} disabled={disabled}
            onClick={() => {
              if (channel === id) return
              setSelected(null)
              drag.current = null
              onChannelChange(id)
            }}>
            {channelLabel}
          </button>
        ))}
      </div>}
      <svg
        className="filmCurveSvg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="application"
        aria-label={`${label}编辑器`}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
        onDoubleClick={(event) => {
          if (event.target instanceof Element && event.target.closest("[data-curve-point]") !== null) return
          const rect = event.currentTarget.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return
          addPoint(toNormalized((event.clientX - rect.left) / rect.width * SIZE), 1 - toNormalized((event.clientY - rect.top) / rect.height * SIZE))
        }}
      >
        <rect x={PADDING} y={PADDING} width={PLOT} height={PLOT} rx="2" className="filmCurveFrame" />
        {histogram !== undefined && histogram.length > 1 && <polygon
          className="filmCurveHistogram" aria-hidden="true"
          points={`${PADDING},${SIZE - PADDING} ${histogram.map((count, index) =>
            `${toPixel(index / (histogram.length - 1))},${SIZE - PADDING - PLOT * count / histogramPeak}`).join(" ")} ${SIZE - PADDING},${SIZE - PADDING}`}
        />}
        {sampledTones?.map((tone, index) => <line key={index} className="filmCurveTone" aria-hidden="true"
          x1={toPixel(Math.max(0, Math.min(1, tone)))} x2={toPixel(Math.max(0, Math.min(1, tone)))}
          y1={PADDING} y2={SIZE - PADDING} />)}
        <g className="filmCurveGrid" aria-hidden="true">
          {[0.25, 0.5, 0.75].map((division) => {
            const position = toPixel(division)
            return <path key={division} d={`M ${position} ${PADDING} v ${PLOT} M ${PADDING} ${position} h ${PLOT}`} />
          })}
        </g>
        <line x1={PADDING} y1={SIZE - PADDING} x2={SIZE - PADDING} y2={PADDING} className="filmCurveIdentity" />
        <polyline
          className="filmCurveLine"
          points={points.map((point) => `${toPixel(point.x)},${SIZE - toPixel(point.y)}`).join(" ")}
        />
        {points.map((point, index) => {
          const fixed = index === 0 || index === points.length - 1
          const x = toPixel(point.x)
          const y = SIZE - toPixel(point.y)
          if (fixed) return <rect key={index} x={x - 1.2} y={y - 1.2} width={2.4} height={2.4}
            className="filmCurvePointFixed" data-curve-point="" data-testid={`${label}-curve-point-${index}`} aria-hidden="true" />
          return <g
            key={index}
            transform={`translate(${x} ${y})`}
            className="filmCurvePoint"
            data-curve-point=""
            data-selected={selected === index}
            data-testid={`${label}-curve-point-${index}`}
            tabIndex={disabled ? -1 : 0}
            role="slider"
            aria-label={`${label}控制点${index}`}
            aria-valuemin={0} aria-valuemax={1} aria-valuenow={point.y}
            aria-valuetext={`输入 ${point.x.toFixed(2)}，输出 ${point.y.toFixed(2)}`}
            aria-disabled={disabled}
            onFocus={() => setSelected(index)}
            onKeyDown={(event) => {
              if (disabled || event.metaKey || event.ctrlKey || event.altKey) return
              if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removePoint(index); return }
              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return
              event.preventDefault()
              historyTag.current = `${prefix}:key:${++gesture.current}`
              const step = event.shiftKey ? .05 : .01
              updatePoint(index, point.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
                point.y + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0))
            }}
            onPointerDown={(event) => {
              if (disabled || event.button > 0 || drag.current !== null) return
              const svg = event.currentTarget.ownerSVGElement
              if (typeof svg?.setPointerCapture === "function") svg.setPointerCapture(event.pointerId)
              historyTag.current = `${prefix}:drag:${++gesture.current}`
              setSelected(index)
              drag.current = { index, pointerId: event.pointerId }
            }}
          >
            <circle className="filmCurveHit" r="4.8" />
            <circle className="filmCurveFocus" r="2.8" />
            <circle className="filmCurveNode" r="1.25" />
          </g>
        })}
      </svg>
      <div className="filmCurveFooter">
        <div className="filmCurveReadout">
          {selectedPoint === undefined || disabled ? <span>输入 —　输出 —</span> : <>
            <label>输入 <NumberInput value={selectedPoint.x} min={0} max={1} precision={3} onCommit={(value) => updateCoordinate("x", value)} /></label>
            <label>输出 <NumberInput value={selectedPoint.y} min={0} max={1} precision={3} onCommit={(value) => updateCoordinate("y", value)} /></label>
          </>}
        </div>
        <div className="filmCurveActions">
          <button className="ghostButton" type="button" disabled={disabled || !canAdd} onClick={() => addPoint()}
            title="添加控制点" aria-label={`${label}添加控制点`}>+</button>
          <button className="ghostButton" type="button" disabled={disabled || selectedPoint === undefined} onClick={() => removePoint(selected)}
            title="删除控制点" aria-label="删除控制点">−</button>
        </div>
      </div>
      {onPickTone !== undefined && <button type="button" className="ghostButton filmToneButton"
        aria-pressed={pickingTone === true} disabled={disabled} onClick={onPickTone}>在照片上定位色调</button>}
    </section>
  )
}
