/**
 * 镜头资产分组。
 */

import { useCallback, useState } from "react"
import { AssetRow } from "./AssetRow"
import type { LensAsset, PhotoAssetController } from "../types"
import { createEmptyLens } from "../types"

type LensSectionProps = {
  readonly items: readonly LensAsset[]
  readonly isAdding: boolean
  readonly controller: PhotoAssetController
  readonly onStartAdd: () => void
  readonly onCancelAdd: () => void
  readonly onSaved: () => void
}

export const LensSection = ({
  items,
  isAdding,
  controller,
  onStartAdd,
  onCancelAdd,
  onSaved
}: LensSectionProps): JSX.Element => {
  const [editing, setEditing] = useState<LensAsset>(createEmptyLens)

  const handleStartEdit = useCallback((asset: LensAsset): void => {
    setEditing(asset)
    onStartAdd()
  }, [onStartAdd])

  const handleSave = useCallback((): void => {
    if (editing.brand.trim().length === 0 && editing.model.trim().length === 0) {
      return
    }
    const toSave = editing.id ? editing : { ...editing, id: crypto.randomUUID() }
    controller.saveLens(toSave)
    setEditing(createEmptyLens())
    onSaved()
  }, [editing, controller, onSaved])

  const handleDelete = useCallback((id: string): void => {
    controller.deleteLens(id)
  }, [controller])

  if (isAdding) {
    return (
      <div className="assetEditor">
        <label className="settingFieldLabel">
          品牌
          <input className="settingTextInput" value={editing.brand}
            onChange={(e) => setEditing((p) => ({ ...p, brand: e.target.value }))}
            placeholder="例如：Voigtlander" />
        </label>
        <label className="settingFieldLabel">
          型号
          <input className="settingTextInput" value={editing.model}
            onChange={(e) => setEditing((p) => ({ ...p, model: e.target.value }))}
            placeholder="例如：Nokton 35mm F1.4" />
        </label>
        <label className="settingFieldLabel">
          焦段
          <input className="settingTextInput" value={editing.focalLength}
            onChange={(e) => setEditing((p) => ({ ...p, focalLength: e.target.value }))}
            placeholder="例如：35mm" />
        </label>
        <label className="settingFieldLabel">
          最大光圈
          <input className="settingTextInput" value={editing.maxAperture}
            onChange={(e) => setEditing((p) => ({ ...p, maxAperture: e.target.value }))}
            placeholder="例如：F1.4" />
        </label>
        <label className="settingFieldLabel">
          卡口
          <input className="settingTextInput" value={editing.mount}
            onChange={(e) => setEditing((p) => ({ ...p, mount: e.target.value }))}
            placeholder="例如：M mount" />
        </label>
        <label className="settingFieldLabel">
          备注
          <input className="settingTextInput" value={editing.notes}
            onChange={(e) => setEditing((p) => ({ ...p, notes: e.target.value }))} />
        </label>
        <div className="assetEditorActions">
          <button type="button" className="ghostButton" onClick={handleSave}>保存</button>
          <button type="button" className="ghostButton" onClick={() => { setEditing(createEmptyLens()); onCancelAdd() }}>取消</button>
        </div>
      </div>
    )
  }

  return (
    <>
      {items.length === 0 && <p className="settingsCapabilityHint">暂无镜头资产。</p>}
      {items.map((item) => (
        <AssetRow
          key={item.id}
          label={`${item.brand} ${item.model}`}
          detail={[item.focalLength, item.maxAperture].filter(Boolean).join(" ")}
          onEdit={() => handleStartEdit(item)}
          onDelete={() => handleDelete(item.id)}
        />
      ))}
    </>
  )
}
