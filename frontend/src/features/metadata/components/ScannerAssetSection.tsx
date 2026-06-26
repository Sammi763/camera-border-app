/**
 * 扫描仪资产分组。
 */

import { useCallback, useState } from "react"
import { AssetRow } from "./AssetRow"
import type { PhotoAssetController, ScannerAsset } from "../types"
import { createEmptyScanner } from "../types"

type ScannerSectionProps = {
  readonly items: readonly ScannerAsset[]
  readonly isAdding: boolean
  readonly controller: PhotoAssetController
  readonly onStartAdd: () => void
  readonly onCancelAdd: () => void
  readonly onSaved: () => void
}

export const ScannerSection = ({
  items,
  isAdding,
  controller,
  onStartAdd,
  onCancelAdd,
  onSaved
}: ScannerSectionProps): JSX.Element => {
  const [editing, setEditing] = useState<ScannerAsset>(createEmptyScanner)

  const handleStartEdit = useCallback((asset: ScannerAsset): void => {
    setEditing(asset)
    onStartAdd()
  }, [onStartAdd])

  const handleSave = useCallback((): void => {
    if (editing.brand.trim().length === 0 && editing.model.trim().length === 0) {
      return
    }
    const toSave = editing.id ? editing : { ...editing, id: crypto.randomUUID() }
    controller.saveScanner(toSave)
    setEditing(createEmptyScanner())
    onSaved()
  }, [editing, controller, onSaved])

  const handleDelete = useCallback((id: string): void => {
    controller.deleteScanner(id)
  }, [controller])

  if (isAdding) {
    return (
      <div className="assetEditor">
        <label className="settingFieldLabel">
          品牌
          <input className="settingTextInput" value={editing.brand}
            onChange={(e) => setEditing((p) => ({ ...p, brand: e.target.value }))}
            placeholder="例如：Noritsu" />
        </label>
        <label className="settingFieldLabel">
          型号
          <input className="settingTextInput" value={editing.model}
            onChange={(e) => setEditing((p) => ({ ...p, model: e.target.value }))}
            placeholder="例如：HS-1800" />
        </label>
        <label className="settingFieldLabel">
          扫描软件
          <input className="settingTextInput" value={editing.software}
            onChange={(e) => setEditing((p) => ({ ...p, software: e.target.value }))}
            placeholder="例如：EZ Controller" />
        </label>
        <label className="settingFieldLabel">
          备注
          <input className="settingTextInput" value={editing.notes}
            onChange={(e) => setEditing((p) => ({ ...p, notes: e.target.value }))} />
        </label>
        <div className="assetEditorActions">
          <button type="button" className="ghostButton" onClick={handleSave}>保存</button>
          <button type="button" className="ghostButton" onClick={() => { setEditing(createEmptyScanner()); onCancelAdd() }}>取消</button>
        </div>
      </div>
    )
  }

  return (
    <>
      {items.length === 0 && <p className="settingsCapabilityHint">暂无扫描仪资产。</p>}
      {items.map((item) => (
        <AssetRow
          key={item.id}
          label={`${item.brand} ${item.model}`}
          detail={item.software}
          onEdit={() => handleStartEdit(item)}
          onDelete={() => handleDelete(item.id)}
        />
      ))}
    </>
  )
}
