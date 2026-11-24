import { useCallback, useEffect, useState } from "react"

/**
 * 数字输入组件：使用 draft string 模式，避免即时 clamp 问题。
 *
 * 设计要点：
 * - 用户输入过程中保持自由编辑（可清空、可输入中间值）
 * - onBlur 或 Enter 键时提交，此时才校验范围
 * - 提交时如果值为空或无效，回退到上一个合法值
 * - 如果外部值变化（如重置），同步更新 draft
 */

type NumberInputProps = {
  readonly value: number
  readonly min: number
  readonly max: number
  readonly className?: string
  readonly precision?: number
  readonly onCommit: (value: number) => void
}

const clamp = (value: number, min: number, max: number, precision: number): number => {
  return Math.min(max, Math.max(min, Number(value.toFixed(precision))))
}

export const NumberInput = ({
  value,
  min,
  max,
  className,
  precision = 0,
  onCommit
}: NumberInputProps): JSX.Element => {
  const [draft, setDraft] = useState(String(value))
  const [committedValue, setCommittedValue] = useState(value)

  useEffect(() => {
    if (value !== committedValue) {
      setDraft(String(value))
      setCommittedValue(value)
    }
  }, [value, committedValue])

  const commit = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed === "") {
      setDraft(String(committedValue))
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      setDraft(String(committedValue))
      return
    }
    const clamped = clamp(parsed, min, max, precision)
    setDraft(String(clamped))
    setCommittedValue(clamped)
    if (clamped !== value) onCommit(clamped)
  }, [draft, committedValue, min, max, onCommit, precision, value])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      commit()
    }
  }, [commit])

  return (
    <input
      type="text"
      inputMode={precision === 0 ? "numeric" : "decimal"}
      pattern={precision === 0 ? "[0-9]*" : undefined}
      className={className}
      value={draft}
      onChange={handleChange}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  )
}
