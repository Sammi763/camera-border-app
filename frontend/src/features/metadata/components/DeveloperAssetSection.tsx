/**
 * 冲洗工艺资产分组。
 */

import { useCallback, useState } from "react"
import { AssetRow } from "./AssetRow"
import type { DeveloperAsset, PhotoAssetController } from "../types"
import { createEmptyDeveloper } from "../types"

type DeveloperSectionProps = {
  readonly items: readonly DeveloperAsset[]
  readonly isAdding: boolean
  readonly controller: PhotoAssetController
  readonly onStartAdd: () => void
  readonly onCancelAdd: () => void
  readonly onSaved: () => void
}

export const DeveloperSection = ({
  items,
  isAdding,
  controller,
  onStartAdd,
  onCancelAdd,
  onSaved
}: DeveloperSectionProps): JSX.Element => {
  const [editing, setEditing] = useState<DeveloperAsset>(createEmptyDeveloper)

  const handleStartEdit = useCallback((asset: DeveloperAsset): void => {
    setEditing(asset)
    onStartAdd()
  }, [onStartAdd])

  const handleSave = useCallback((): void => {
    if (editing.name.trim().length === 0) {
      return
    }
    const toSave = editing.id ? editing : { ...editing, id: crypto.randomUUID() }
    controller.saveDeveloper(toSave)
    setEditing(createEmptyDeveloper())
    onSaved()
  }, [editing, controller, onSaved])

  const handleDelete = useCallback((id: string): void => {
    controller.deleteDeveloper(id)
  }, [controller])

  if (isAdding) {
    return (
      <div className="assetEditor">
        <label className="settingFieldLabel">
          名称
          <input className="settingTextInput" value={editing.name}
            onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
            placeholder="例如：C-41 / HC-110" />
        </label>
        <label className="settingFieldLabel">
          类型
          <input className="settingTextInput" value={editing.type}
            onChange={(e) => setEditing((p) => ({ ...p, type: e.target.value }))}
            placeholder="例如：彩色 / 黑白" />
        </label>
        <label className="settingFieldLabel">
          备注
          <input className="settingTextInput" value={editing.notes}
            onChange={(e) => setEditing((p) => ({ ...p, notes: e.target.value }))} />
        </label>
        <div className="assetEditorActions">
          <button type="button" className="ghostButton" onClick={handleSave}>保存</button>
          <button type="button" className="ghostButton" onClick={() => { setEditing(createEmptyDeveloper()); onCancelAdd() }}>取消</button>
        </div>
      </div>
    )
  }

  return (
    <>
      {items.length === 0 && <p className="settingsCapabilityHint">暂无冲洗工艺资产。</p>}
      {items.map((item) => (
        <AssetRow
          key={item.id}
          label={item.name}
          detail={item.type}
          onEdit={() => handleStartEdit(item)}
          onDelete={() => handleDelete(item.id)}
        />
      ))}
    </>
  )
}
