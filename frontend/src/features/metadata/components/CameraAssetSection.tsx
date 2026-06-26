/**
 * 相机资产分组。
 */

import { useCallback, useState } from "react"
import { AssetRow } from "./AssetRow"
import type { CameraAsset, PhotoAssetController } from "../types"
import { createEmptyCamera } from "../types"

type CameraSectionProps = {
  readonly items: readonly CameraAsset[]
  readonly isAdding: boolean
  readonly controller: PhotoAssetController
  readonly onStartAdd: () => void
  readonly onCancelAdd: () => void
  readonly onSaved: () => void
}

export const CameraSection = ({
  items,
  isAdding,
  controller,
  onStartAdd,
  onCancelAdd,
  onSaved
}: CameraSectionProps): JSX.Element => {
  const [editing, setEditing] = useState<CameraAsset>(createEmptyCamera)

  const handleStartEdit = useCallback((asset: CameraAsset): void => {
    setEditing(asset)
    onStartAdd()
  }, [onStartAdd])

  const handleSave = useCallback((): void => {
    if (editing.brand.trim().length === 0 && editing.model.trim().length === 0) {
      return
    }
    const toSave = editing.id ? editing : { ...editing, id: crypto.randomUUID() }
    controller.saveCamera(toSave)
    setEditing(createEmptyCamera())
    onSaved()
  }, [editing, controller, onSaved])

  const handleDelete = useCallback((id: string): void => {
    controller.deleteCamera(id)
  }, [controller])

  if (isAdding) {
    return (
      <div className="assetEditor">
        <label className="settingFieldLabel">
          品牌
          <input className="settingTextInput" value={editing.brand}
            onChange={(e) => setEditing((p) => ({ ...p, brand: e.target.value }))}
            placeholder="例如：Leica" />
        </label>
        <label className="settingFieldLabel">
          型号
          <input className="settingTextInput" value={editing.model}
            onChange={(e) => setEditing((p) => ({ ...p, model: e.target.value }))}
            placeholder="例如：M6" />
        </label>
        <label className="settingFieldLabel">
          别名
          <input className="settingTextInput" value={editing.alias}
            onChange={(e) => setEditing((p) => ({ ...p, alias: e.target.value }))}
            placeholder="可选，用于显示" />
        </label>
        <label className="settingFieldLabel">
          备注
          <input className="settingTextInput" value={editing.notes}
            onChange={(e) => setEditing((p) => ({ ...p, notes: e.target.value }))} />
        </label>
        <div className="assetEditorActions">
          <button type="button" className="ghostButton" onClick={handleSave}>保存</button>
          <button type="button" className="ghostButton" onClick={() => { setEditing(createEmptyCamera()); onCancelAdd() }}>取消</button>
        </div>
      </div>
    )
  }

  return (
    <>
      {items.length === 0 && <p className="settingsCapabilityHint">暂无相机资产。</p>}
      {items.map((item) => (
        <AssetRow
          key={item.id}
          label={item.alias || `${item.brand} ${item.model}`}
          detail={item.notes}
          onEdit={() => handleStartEdit(item)}
          onDelete={() => handleDelete(item.id)}
        />
      ))}
    </>
  )
}
