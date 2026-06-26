/**
 * 摄影资产库面板。
 *
 * 负责 tab 切换、错误提示、组装各资产分组。
 * 各分组组件已拆分到独立文件。
 */

import { useCallback, useState } from "react"
import type { FilmStock, PhotoAssetController } from "../types"
import { CameraSection } from "./CameraAssetSection"
import { LensSection } from "./LensAssetSection"
import { FilmSection } from "./FilmAssetSection"
import { ScannerSection } from "./ScannerAssetSection"
import { LabSection } from "./LabAssetSection"
import { DeveloperSection } from "./DeveloperAssetSection"

type AssetLibraryPanelProps = {
  readonly assetController: PhotoAssetController
  /** 内置胶片库（来自后端，可能为空）。 */
  readonly filmStocks: readonly FilmStock[]
}

/** 资产类型分组标识。 */
type AssetTab = "cameras" | "lenses" | "films" | "scanners" | "labs" | "developers"

/** 分组标签（中文）。 */
const TAB_LABELS: Record<AssetTab, string> = {
  cameras: "相机",
  lenses: "镜头",
  films: "胶片",
  scanners: "扫描仪",
  labs: "实验室",
  developers: "冲洗工艺"
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
    setIsAdding(false)
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
        删除资产不会删除已保存到 Roll 的文字信息。
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
        {activeTab === "cameras" && (
          <CameraSection
            items={store.cameras}
            isAdding={isAdding}
            controller={assetController}
            onStartAdd={handleStartAdd}
            onCancelAdd={handleCancelAdd}
            onSaved={handleSaved}
          />
        )}
        {activeTab === "lenses" && (
          <LensSection
            items={store.lenses}
            isAdding={isAdding}
            controller={assetController}
            onStartAdd={handleStartAdd}
            onCancelAdd={handleCancelAdd}
            onSaved={handleSaved}
          />
        )}
        {activeTab === "films" && (
          <FilmSection
            items={store.films}
            isAdding={isAdding}
            controller={assetController}
            filmStocks={filmStocks}
            onStartAdd={handleStartAdd}
            onCancelAdd={handleCancelAdd}
            onSaved={handleSaved}
          />
        )}
        {activeTab === "scanners" && (
          <ScannerSection
            items={store.scanners}
            isAdding={isAdding}
            controller={assetController}
            onStartAdd={handleStartAdd}
            onCancelAdd={handleCancelAdd}
            onSaved={handleSaved}
          />
        )}
        {activeTab === "labs" && (
          <LabSection
            items={store.labs}
            isAdding={isAdding}
            controller={assetController}
            onStartAdd={handleStartAdd}
            onCancelAdd={handleCancelAdd}
            onSaved={handleSaved}
          />
        )}
        {activeTab === "developers" && (
          <DeveloperSection
            items={store.developers}
            isAdding={isAdding}
            controller={assetController}
            onStartAdd={handleStartAdd}
            onCancelAdd={handleCancelAdd}
            onSaved={handleSaved}
          />
        )}
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
