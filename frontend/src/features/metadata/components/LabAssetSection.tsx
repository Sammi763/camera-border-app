/**
 * 实验室资产分组。
 */

import { useCallback, useState } from "react"
import { AssetRow } from "./AssetRow"
import type { LabAsset, PhotoAssetController } from "../types"
import { createEmptyLab } from "../types"

type LabSectionProps = {
  readonly items: readonly LabAsset[]
  readonly isAdding: boolean
  readonly controller: PhotoAssetController
  readonly onStartAdd: () => void
  readonly onCancelAdd: () => void
  readonly onSaved: () => void
}

export const LabSection = ({
  items,
  isAdding,
  controller,
  onStartAdd,
  onCancelAdd,
  onSaved
}: LabSectionProps): JSX.Element => {
  const [editing, setEditing] = useState<LabAsset>(createEmptyLab)

  const handleStartEdit = useCallback((asset: LabAsset): void => {
    setEditing(asset)
    onStartAdd()
  }, [onStartAdd])

  const handleSave = useCallback((): void => {
    if (editing.name.trim().length === 0) {
      return
    }
    const toSave = editing.id ? editing : { ...editing, id: crypto.randomUUID() }
    controller.saveLab(toSave)
    setEditing(createEmptyLab())
    onSaved()
  }, [editing, controller, onSaved])

  const handleDelete = useCallback((id: string): void => {
    controller.deleteLab(id)
  }, [controller])

  if (isAdding) {
    return (
      <div className="assetEditor">
        <label className="settingFieldLabel">
          名称
          <input className="settingTextInput" value={editing.name}
            onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
            placeholder="例如：Local Lab" />
        </label>
        <label className="settingFieldLabel">
          城市
          <input className="settingTextInput" value={editing.city}
            onChange={(e) => setEditing((p) => ({ ...p, city: e.target.value }))}
            placeholder="例如：Tokyo" />
        </label>
        <label className="settingFieldLabel">
          联系方式
          <input className="settingTextInput" value={editing.contact}
            onChange={(e) => setEditing((p) => ({ ...p, contact: e.target.value }))} />
        </label>
        <label className="settingFieldLabel">
          备注
          <input className="settingTextInput" value={editing.notes}
            onChange={(e) => setEditing((p) => ({ ...p, notes: e.target.value }))} />
        </label>
        <div className="assetEditorActions">
          <button type="button" className="ghostButton" onClick={handleSave}>保存</button>
          <button type="button" className="ghostButton" onClick={() => { setEditing(createEmptyLab()); onCancelAdd() }}>取消</button>
        </div>
      </div>
    )
  }

  return (
    <>
      {items.length === 0 && <p className="settingsCapabilityHint">暂无实验室资产。</p>}
      {items.map((item) => (
        <AssetRow
          key={item.id}
          label={item.name}
          detail={item.city}
          onEdit={() => handleStartEdit(item)}
          onDelete={() => handleDelete(item.id)}
        />
      ))}
    </>
  )
}
