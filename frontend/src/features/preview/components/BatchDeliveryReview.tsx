import { useState } from "react"
import type { BatchReviewAction, BatchReviewRow } from "../hooks/useExportController"

type Props = {
  readonly rows: readonly BatchReviewRow[]
  readonly onConfirm: (actions: Readonly<Record<number, BatchReviewAction>>) => Promise<void>
  readonly onCancel: () => void
  readonly onRepair: (itemId: string) => void
}

const fileName = (path: string): string => path.split(/[\\/]/).at(-1) ?? path

export const BatchDeliveryReview = ({ rows, onConfirm, onCancel, onRepair }: Props): JSX.Element => {
  const [actions, setActions] = useState<Readonly<Record<number, BatchReviewAction>>>({})
  const unresolved = rows.some(row => row.reasons.length > 0 && actions[row.index] === undefined)
  const exportCount = rows.filter(row => actions[row.index] !== "skip").length
  return <div className="batchDeliveryReview">
    <ul className="batchDeliveryList">
      {rows.map(row => <li key={row.index} className="batchDeliveryRow">
        <div className="batchDeliveryNames">
          <span title={row.sourcePath}>{row.sourcePath}</span>
          <strong title={row.outputPath}>{fileName(row.outputPath)}</strong>
          <span>{row.format.toUpperCase()} · {row.dimensions ?? "待预检确认尺寸"}</span>
        </div>
        {row.reasons.length > 0 && <>
          <p className="previewExportError">{row.reasons.join("；")}</p>
          <label className="settingFieldLabel">
            处理 {fileName(row.sourcePath)}
            <select className="settingSelect" value={actions[row.index] ?? ""}
              onChange={event => {
                const value = event.target.value as BatchReviewAction | ""
                setActions(current => {
                  const next = { ...current }
                  if (value === "") delete next[row.index]
                  else next[row.index] = value
                  return next
                })
              }}>
              <option value="">选择处理方式</option>
              <option value="skip">跳过该照片</option>
              {row.canRename && <option value="rename">另存为新文件名</option>}
              {row.canExportPlain && <option value="plain">按普通照片导出</option>}
            </select>
          </label>
          {row.canRepair && <button type="button" className="ghostButton" onClick={() => onRepair(row.itemId)}>前往底片页处理</button>}
        </>}
      </li>)}
    </ul>
    <div className="batchDeliveryActions">
      <button type="button" className="ghostButton" onClick={onCancel}>返回工作台</button>
      <button type="button" className="primaryButton" disabled={unresolved || exportCount === 0} onClick={() => void onConfirm(actions)}>
        {Object.values(actions).some(action => action === "rename" || action === "plain") ? "重新预检" : `导出 ${exportCount} 张`}
      </button>
    </div>
  </div>
}
