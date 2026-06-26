/**
 * 胶片资产分组，包含内置胶片库一键导入。
 */

import { useCallback, useState } from "react"
import { AssetRow } from "./AssetRow"
import type { FilmAsset, FilmStock, PhotoAssetController } from "../types"
import { createEmptyFilm } from "../types"

type FilmSectionProps = {
  readonly items: readonly FilmAsset[]
  readonly isAdding: boolean
  readonly controller: PhotoAssetController
  readonly filmStocks: readonly FilmStock[]
  readonly onStartAdd: () => void
  readonly onCancelAdd: () => void
  readonly onSaved: () => void
}

export const FilmSection = ({
  items,
  isAdding,
  controller,
  filmStocks,
  onStartAdd,
  onCancelAdd,
  onSaved
}: FilmSectionProps): JSX.Element => {
  const [editing, setEditing] = useState<FilmAsset>(createEmptyFilm)

  const handleStartEdit = useCallback((asset: FilmAsset): void => {
    setEditing(asset)
    onStartAdd()
  }, [onStartAdd])

  const handleSave = useCallback((): void => {
    if (editing.brand.trim().length === 0 && editing.name.trim().length === 0) {
      return
    }
    const toSave = editing.id ? editing : { ...editing, id: crypto.randomUUID() }
    controller.saveFilm(toSave)
    setEditing(createEmptyFilm())
    onSaved()
  }, [editing, controller, onSaved])

  const handleDelete = useCallback((id: string): void => {
    controller.deleteFilm(id)
  }, [controller])

  /** 从内置胶片库一键加入用户资产。 */
  const handleImportStock = useCallback((stock: FilmStock): void => {
    const existing = items.find((f) => f.name === stock.name && f.brand === stock.brand)
    if (existing) {
      return
    }
    controller.saveFilm({
      id: crypto.randomUUID(),
      brand: stock.brand,
      name: stock.name,
      iso: String(stock.iso),
      type: stock.type,
      colorProfile: stock.colorProfile,
      discontinued: stock.discontinued,
      notes: ""
    })
  }, [items, controller])

  /** 判断内置胶片是否已在用户资产中。 */
  const isStockImported = useCallback((stock: FilmStock): boolean => {
    return items.some((f) => f.name === stock.name && f.brand === stock.brand)
  }, [items])

  if (isAdding) {
    return (
      <div className="assetEditor">
        <label className="settingFieldLabel">
          品牌
          <input className="settingTextInput" value={editing.brand}
            onChange={(e) => setEditing((p) => ({ ...p, brand: e.target.value }))}
            placeholder="例如：Kodak" />
        </label>
        <label className="settingFieldLabel">
          名称
          <input className="settingTextInput" value={editing.name}
            onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
            placeholder="例如：Portra 400" />
        </label>
        <label className="settingFieldLabel">
          ISO
          <input className="settingTextInput" value={editing.iso}
            onChange={(e) => setEditing((p) => ({ ...p, iso: e.target.value }))}
            placeholder="例如：400" />
        </label>
        <label className="settingFieldLabel">
          类型
          <input className="settingTextInput" value={editing.type}
            onChange={(e) => setEditing((p) => ({ ...p, type: e.target.value }))}
            placeholder="例如：Color Negative" />
        </label>
        <label className="settingFieldLabel">
          色彩倾向
          <input className="settingTextInput" value={editing.colorProfile}
            onChange={(e) => setEditing((p) => ({ ...p, colorProfile: e.target.value }))}
            placeholder="例如：warm / neutral" />
        </label>
        <label className="settingCheckboxLabel">
          <input type="checkbox" checked={editing.discontinued}
            onChange={(e) => setEditing((p) => ({ ...p, discontinued: e.target.checked }))} />
          <span>已停产</span>
        </label>
        <label className="settingFieldLabel">
          备注
          <input className="settingTextInput" value={editing.notes}
            onChange={(e) => setEditing((p) => ({ ...p, notes: e.target.value }))} />
        </label>
        <div className="assetEditorActions">
          <button type="button" className="ghostButton" onClick={handleSave}>保存</button>
          <button type="button" className="ghostButton" onClick={() => { setEditing(createEmptyFilm()); onCancelAdd() }}>取消</button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* 内置胶片库快捷导入 */}
      {filmStocks.length > 0 && (
        <fieldset className="settingGroup">
          <legend className="settingLabel">内置胶片（点击加入资产库）</legend>
          <div className="assetStockGrid">
            {filmStocks.map((stock) => {
              const imported = isStockImported(stock)
              return (
                <button
                  key={stock.id}
                  type="button"
                  className={`ghostButton assetStockChip ${imported ? "assetStockChipImported" : ""}`}
                  disabled={imported}
                  onClick={() => handleImportStock(stock)}
                  title={imported ? "已在资产库中" : `加入 ${stock.brand} ${stock.name}`}
                >
                  {stock.name}
                  {stock.discontinued && <span className="assetStockDiscontinued"> (停产)</span>}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {items.length === 0 && <p className="settingsCapabilityHint">暂无胶片资产。可从上方内置胶片库一键导入。</p>}
      {items.map((item) => (
        <AssetRow
          key={item.id}
          label={`${item.brand} ${item.name}`}
          detail={[item.iso && `ISO ${item.iso}`, item.discontinued ? "停产" : ""].filter(Boolean).join(" · ")}
          onEdit={() => handleStartEdit(item)}
          onDelete={() => handleDelete(item.id)}
        />
      ))}
    </>
  )
}
