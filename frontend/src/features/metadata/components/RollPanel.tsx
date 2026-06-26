import { useCallback, useEffect, useState } from "react"
import { fetchFilmStocks } from "../../../services/engine/filmStocksApi"
import type { FilmStock, PhotoAssetStore, Roll } from "../types"
import { createEmptyRoll } from "../types"

type RollPanelProps = {
  readonly rolls: readonly Roll[]
  readonly lastError: string | null
  readonly onSaveRoll: (roll: Roll) => void
  readonly onDeleteRoll: (id: string) => void
  readonly onClearError: () => void
  /** 应用 Roll 到当前选中图片。 */
  readonly onApplyToSelected: (rollId: string | null) => void
  /** 应用 Roll 到队列全部图片。 */
  readonly onApplyToAll: (rollId: string | null) => void
  /** 清除全部图片的 Roll 绑定。 */
  readonly onClearAllRollBindings: () => void
  /** 当前是否有选中图片。 */
  readonly hasSelectedImage: boolean
  /** 当前队列图片数量。 */
  readonly queueCount: number
  /** 资产库数据（用于候选选择）。 */
  readonly assetStore: PhotoAssetStore
}

/**
 * Roll 胶卷面板：创建、编辑、删除 Roll，以及应用到图片。
 *
 * 使用 React state 管理 Roll 选择，不依赖 DOM querySelector。
 */
export const RollPanel = ({
  rolls,
  lastError,
  onSaveRoll,
  onDeleteRoll,
  onClearError,
  onApplyToSelected,
  onApplyToAll,
  onClearAllRollBindings,
  hasSelectedImage,
  queueCount,
  assetStore
}: RollPanelProps): JSX.Element => {
  const [editingRoll, setEditingRoll] = useState<Roll>(createEmptyRoll)
  const [isCreating, setIsCreating] = useState(false)
  const [filmStocks, setFilmStocks] = useState<readonly FilmStock[]>([])
  /** 当前选中的 Roll ID（用于"应用到图片"操作）。 */
  const [selectedRollId, setSelectedRollId] = useState<string>("")

  // 加载内置胶片库
  useEffect(() => {
    let active = true
    void fetchFilmStocks()
      .then((stocks) => {
        if (active) {
          setFilmStocks(stocks)
        }
      })
      .catch(() => {
        // 引擎不可用时不影响手动输入
      })
    return () => { active = false }
  }, [])

  const handleStartCreate = useCallback((): void => {
    setEditingRoll({ ...createEmptyRoll(), id: crypto.randomUUID() })
    setIsCreating(true)
  }, [])

  const handleStartEdit = useCallback((roll: Roll): void => {
    setEditingRoll(roll)
    setIsCreating(true)
  }, [])

  const handleSave = useCallback((): void => {
    if (editingRoll.name.trim().length === 0) {
      return
    }
    onSaveRoll(editingRoll)
    setIsCreating(false)
    setEditingRoll(createEmptyRoll())
  }, [editingRoll, onSaveRoll])

  const handleCancel = useCallback((): void => {
    setIsCreating(false)
    setEditingRoll(createEmptyRoll())
  }, [])

  const handleFieldChange = useCallback((field: keyof Roll, value: string): void => {
    setEditingRoll((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleFilmSelect = useCallback((filmName: string): void => {
    setEditingRoll((prev) => ({ ...prev, film: filmName }))
  }, [])

  const handleApplyToSelected = useCallback((): void => {
    if (selectedRollId) {
      onApplyToSelected(selectedRollId)
    }
  }, [selectedRollId, onApplyToSelected])

  const handleApplyToAll = useCallback((): void => {
    if (selectedRollId) {
      onApplyToAll(selectedRollId)
    }
  }, [selectedRollId, onApplyToAll])

  /** 内置胶片名称列表（去重）。 */
  const filmStockNames = filmStocks.map((s) => s.name)
  /** 用户资产库胶片名称列表。 */
  const userFilmNames = assetStore.films.map((f) => `${f.brand} ${f.name}`)

  return (
    <div className="rollPanelInner">
      {lastError !== null && (
        <div className="templateErrorRow">
          <span className="templateErrorText">{lastError}</span>
          <button type="button" className="ghostButton" onClick={onClearError}>关闭</button>
        </div>
      )}

      {/* Roll 列表 */}
      {!isCreating && (
        <>
          <div className="rollList">
            {rolls.length === 0 && (
              <p className="settingsCapabilityHint">暂无 Roll，点击下方按钮创建。</p>
            )}
            {rolls.map((roll) => (
              <div key={roll.id} className="rollItem">
                <div className="rollItemInfo">
                  <span className="rollItemName">{roll.name || "未命名 Roll"}</span>
                  <span className="rollItemDetail">
                    {[roll.camera, roll.film, roll.location].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <div className="rollItemActions">
                  <button type="button" className="ghostButton" onClick={() => handleStartEdit(roll)}>编辑</button>
                  <button type="button" className="ghostButton" onClick={() => onDeleteRoll(roll.id)}>删除</button>
                </div>
              </div>
            ))}
          </div>

          <div className="rollActions">
            <button type="button" className="ghostButton" onClick={handleStartCreate}>
              新建 Roll
            </button>
          </div>

          {/* 应用 Roll 到图片 */}
          {rolls.length > 0 && (
            <fieldset className="settingGroup">
              <legend className="settingLabel">应用到图片</legend>
              <div className="rollApplyRow">
                <select
                  className="settingSelect rollApplySelect"
                  value={selectedRollId}
                  onChange={(e) => setSelectedRollId(e.target.value)}
                >
                  <option value="" disabled>选择 Roll…</option>
                  {rolls.map((roll) => (
                    <option key={roll.id} value={roll.id}>
                      {roll.name || "未命名 Roll"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="ghostButton"
                  disabled={!hasSelectedImage || !selectedRollId}
                  onClick={handleApplyToSelected}
                >
                  应用到当前图片
                </button>
                <button
                  type="button"
                  className="ghostButton"
                  disabled={queueCount === 0 || !selectedRollId}
                  onClick={handleApplyToAll}
                >
                  应用到全部图片
                </button>
              </div>
              <div className="rollApplyRow">
                <button
                  type="button"
                  className="ghostButton"
                  disabled={!hasSelectedImage}
                  onClick={() => onApplyToSelected(null)}
                >
                  清除当前图片 Roll
                </button>
                <button
                  type="button"
                  className="ghostButton"
                  disabled={queueCount === 0}
                  onClick={onClearAllRollBindings}
                >
                  清除全部图片 Roll
                </button>
              </div>
            </fieldset>
          )}
        </>
      )}

      {/* 编辑/创建 Roll */}
      {isCreating && (
        <div className="rollEditor">
          <div className="settingRow">
            <label className="settingFieldLabel">
              Roll 名称
              <input
                type="text"
                className="settingTextInput"
                placeholder="例如：2025-03 Kyoto"
                value={editingRoll.name}
                onChange={(e) => handleFieldChange("name", e.target.value)}
              />
            </label>
          </div>

          <div className="settingRow">
            <label className="settingFieldLabel">
              相机
              <input
                type="text"
                className="settingTextInput"
                placeholder="例如：Leica M6"
                value={editingRoll.camera}
                onChange={(e) => handleFieldChange("camera", e.target.value)}
                list="roll-camera-suggestions"
              />
              <datalist id="roll-camera-suggestions">
                {assetStore.cameras.map((c) => (
                  <option key={c.id} value={c.alias || `${c.brand} ${c.model}`} />
                ))}
              </datalist>
            </label>
          </div>

          <div className="settingRow">
            <label className="settingFieldLabel">
              镜头
              <input
                type="text"
                className="settingTextInput"
                placeholder="例如：Voigtlander 35mm F1.4"
                value={editingRoll.lens}
                onChange={(e) => handleFieldChange("lens", e.target.value)}
                list="roll-lens-suggestions"
              />
              <datalist id="roll-lens-suggestions">
                {assetStore.lenses.map((l) => (
                  <option key={l.id} value={`${l.brand} ${l.model}`} />
                ))}
              </datalist>
            </label>
          </div>

          <div className="settingRow">
            <label className="settingFieldLabel">
              胶片
              <input
                type="text"
                className="settingTextInput"
                placeholder="例如：Kodak Portra 400"
                value={editingRoll.film}
                onChange={(e) => handleFieldChange("film", e.target.value)}
                list="roll-film-suggestions"
              />
              <datalist id="roll-film-suggestions">
                {/* 内置胶片 */}
                {filmStockNames.map((name) => (
                  <option key={`stock-${name}`} value={name} />
                ))}
                {/* 用户资产胶片 */}
                {userFilmNames.map((name) => (
                  <option key={`user-${name}`} value={name} />
                ))}
              </datalist>
            </label>
            {filmStocks.length > 0 && (
              <div className="rollFilmQuickPick">
                {filmStocks.slice(0, 6).map((stock) => (
                  <button
                    key={stock.id}
                    type="button"
                    className={`ghostButton rollFilmChip ${editingRoll.film === stock.name ? "rollFilmChipActive" : ""}`}
                    onClick={() => handleFilmSelect(stock.name)}
                  >
                    {stock.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="settingRow">
            <label className="settingFieldLabel">
              冲洗工艺
              <input
                type="text"
                className="settingTextInput"
                placeholder="例如：C-41"
                value={editingRoll.developer}
                onChange={(e) => handleFieldChange("developer", e.target.value)}
                list="roll-developer-suggestions"
              />
              <datalist id="roll-developer-suggestions">
                {assetStore.developers.map((d) => (
                  <option key={d.id} value={d.name} />
                ))}
              </datalist>
            </label>
          </div>

          <div className="settingRow">
            <label className="settingFieldLabel">
              扫描仪
              <input
                type="text"
                className="settingTextInput"
                placeholder="例如：Noritsu HS-1800"
                value={editingRoll.scanner}
                onChange={(e) => handleFieldChange("scanner", e.target.value)}
                list="roll-scanner-suggestions"
              />
              <datalist id="roll-scanner-suggestions">
                {assetStore.scanners.map((s) => (
                  <option key={s.id} value={`${s.brand} ${s.model}`} />
                ))}
              </datalist>
            </label>
          </div>

          <div className="settingRow">
            <label className="settingFieldLabel">
              冲扫店/实验室
              <input
                type="text"
                className="settingTextInput"
                placeholder="例如：Local Lab"
                value={editingRoll.lab}
                onChange={(e) => handleFieldChange("lab", e.target.value)}
                list="roll-lab-suggestions"
              />
              <datalist id="roll-lab-suggestions">
                {assetStore.labs.map((l) => (
                  <option key={l.id} value={l.name} />
                ))}
              </datalist>
            </label>
          </div>

          <div className="settingRow">
            <label className="settingFieldLabel">
              拍摄地点
              <input
                type="text"
                className="settingTextInput"
                placeholder="例如：Kyoto"
                value={editingRoll.location}
                onChange={(e) => handleFieldChange("location", e.target.value)}
              />
            </label>
          </div>

          <div className="settingRow">
            <label className="settingFieldLabel">
              备注
              <input
                type="text"
                className="settingTextInput"
                placeholder="可选备注"
                value={editingRoll.notes}
                onChange={(e) => handleFieldChange("notes", e.target.value)}
              />
            </label>
          </div>

          <div className="rollEditorActions">
            <button type="button" className="ghostButton" onClick={handleSave}>保存</button>
            <button type="button" className="ghostButton" onClick={handleCancel}>取消</button>
          </div>
        </div>
      )}
    </div>
  )
}
