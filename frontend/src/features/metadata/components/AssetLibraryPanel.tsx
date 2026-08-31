/**
 * 摄影资产库面板。
 *
 * 负责 tab 切换、错误提示、组装各资产分组。
 * 用户界面只保留相机、镜头、胶片三类（P0-04/P0-05 契约）；
 * 扫描仪/实验室/冲洗工艺仅保留旧数据兼容读取，不再提供用户入口。
 */

import { useCallback, useState } from "react"
import type { FilmStock, PhotoAssetController } from "../types"
import { CameraSection } from "./CameraAssetSection"
import { LensSection } from "./LensAssetSection"
import { FilmSection } from "./FilmAssetSection"

type AssetLibraryPanelProps = {
  readonly assetController: PhotoAssetController
  /** 内置胶片库（来自后端，可能为空）。 */
  readonly filmStocks: readonly FilmStock[]
}

/** 资产类型分组标识（用户界面仅保留三类）。 */
type AssetTab = "cameras" | "lenses" | "films"

/** 分组标签（中文）。 */
const TAB_LABELS: Record<AssetTab, string> = {
  cameras: "相机",
  lenses: "镜头",
  films: "胶片"
}

export const AssetLibraryPanel = ({
  assetController,
  filmStocks
}: AssetLibraryPanelProps): JSX.Element => {
  const [activeTab, setActiveTab] = useState<AssetTab>("cameras")
  const [isAdding, setIsAdding] = useState(false)

  const { store, lastError, clearError } = assetController

  const handleStartAdd = useCallback((): void => {
    setIsAdding(true)
  }, [])

  const handleCancelAdd = useCallback((): void => {
    setIsAdding(false)
  }, [])

  const handleSaved = useCallback((): void => {
    setIsAdding(false)
  }, [])

  const handleTabChange = useCallback((tab: AssetTab): void => {
    setActiveTab(tab)
  }, [])

  return (
    <div className="assetPanelInner">
      {lastError !== null && (
        <div className="templateErrorRow">
          <span className="panelErrorText">{lastError}</span>
          <button type="button" className="ghostButton" onClick={clearError}>关闭</button>
        </div>
      )}

      <p className="assetDeleteHint">
        删除资产不会删除已保存到摄影预设的引用文字（引用悬空时预设显示为空）。
      </p>

      {/* 分组标签 */}
      <div className="assetTabs">
        {(Object.keys(TAB_LABELS) as AssetTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`ghostButton assetTab ${activeTab === tab ? "assetTabActive" : ""}`}
            onClick={() => handleTabChange(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className="assetContent">
        {/* 三类资产分组始终挂载；标签切换只隐藏内容，避免未提交的表单草稿丢失。 */}
        <div hidden={activeTab !== "cameras"}>
          <CameraSection
            items={store.cameras}
            isAdding={isAdding && activeTab === "cameras"}
            controller={assetController}
            onStartAdd={handleStartAdd}
            onCancelAdd={handleCancelAdd}
            onSaved={handleSaved}
          />
        </div>
        <div hidden={activeTab !== "lenses"}>
          <LensSection
            items={store.lenses}
            isAdding={isAdding && activeTab === "lenses"}
            controller={assetController}
            onStartAdd={handleStartAdd}
            onCancelAdd={handleCancelAdd}
            onSaved={handleSaved}
          />
        </div>
        <div hidden={activeTab !== "films"}>
          <FilmSection
            items={store.films}
            isAdding={isAdding && activeTab === "films"}
            controller={assetController}
            filmStocks={filmStocks}
            onStartAdd={handleStartAdd}
            onCancelAdd={handleCancelAdd}
            onSaved={handleSaved}
          />
        </div>
      </div>

      {!isAdding && (
        <div className="assetActions">
          <button type="button" className="ghostButton" onClick={handleStartAdd}>
            新增{TAB_LABELS[activeTab]}
          </button>
        </div>
      )}
    </div>
  )
}
