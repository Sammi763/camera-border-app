/**
 * 工作台页面：三栏布局的主工作区。
 *
 * 组合队列、预览、设置三个面板，以及顶部栏和状态栏。
 * 所有业务状态在此组装，各面板只接收 props。
 */

import { useCallback, useMemo, useRef } from "react"
import { TopBar } from "../components/layout/TopBar"
import { StatusPanel } from "../components/layout/StatusPanel"
import { QueuePanel } from "../features/queue/components/QueuePanel"
import { PreviewPanel } from "../features/preview/components/PreviewPanel"
import { SettingsPanel } from "../features/settings/components/SettingsPanel"
import { useEngineHealth } from "../features/preview/hooks/useEngineHealth"
import { useQueue } from "../features/queue/hooks/useQueue"
import { usePreview } from "../features/preview/hooks/usePreview"
import { useSettings } from "../features/settings/hooks/useSettings"
import { useTemplates } from "../features/template/hooks/useTemplates"
import type { DesktopRuntime } from "../types/runtime"
import type { RenderSettings } from "../features/settings/types"

type WorkspacePageProps = {
  readonly runtime: DesktopRuntime
}

export const WorkspacePage = ({ runtime }: WorkspacePageProps): JSX.Element => {
  const health = useEngineHealth()
  const queue = useQueue()
  const settings = useSettings()
  const userModifiedRef = useRef(false)

  // 包装 update，标记用户已主动修改设置（阻止默认模板覆盖）
  const handleSettingsUpdate = useCallback((patch: Partial<RenderSettings>): void => {
    userModifiedRef.current = true
    settings.update(patch)
  }, [settings])

  // 包装 updateNumber，同样标记用户已主动修改设置
  const handleSettingsUpdateNumber = useCallback(
    (key: Parameters<typeof settings.updateNumber>[0], value: number, min: number, max: number): void => {
      userModifiedRef.current = true
      settings.updateNumber(key, value, min, max)
    },
    [settings]
  )

  // 加载模板时更新设置（用户主动操作，标记为已修改）
  const handleLoadTemplate = useCallback((templateSettings: RenderSettings): void => {
    userModifiedRef.current = true
    settings.update(templateSettings)
  }, [settings])

  // 默认模板自动应用回调：仅在用户未手动修改过设置时生效
  const handleDefaultLoaded = useCallback((templateSettings: RenderSettings): void => {
    if (userModifiedRef.current) {
      return
    }
    settings.update(templateSettings)
  }, [settings])

  // 模板管理（传入默认模板自动应用回调）
  const templates = useTemplates(handleDefaultLoaded)

  // 获取当前图片的文字覆盖（用于 usePreview 引擎预览同步）
  const selectedTextOverride = queue.items.find((item) => item.isSelected)?.textOverride ?? null

  // usePreview 内部合并 textOverride，确保引擎预览使用当前图片有效文字
  const preview = usePreview(queue.selectedFilePath, settings.settings, settings.settingsVersion, selectedTextOverride)

  // 构建队列文件路径和名称列表（用于批量导出）
  const queueFilePaths = useMemo(() => queue.items.map((item) => item.filePath), [queue.items])
  const queueFileNames = useMemo(() => queue.items.map((item) => item.fileName), [queue.items])
  // 每张图的文字覆盖列表，与 queueFilePaths 下标对齐
  const queueTextOverrides = useMemo(() => queue.items.map((item) => item.textOverride), [queue.items])

  // 获取当前图片的有效文字内容（每图覆盖或全局默认）
  const selectedId = queue.items.find((item) => item.isSelected)?.id
  const effectiveText = selectedId !== undefined
    ? queue.getEffectiveText(selectedId, settings.settings.textContent)
    : settings.settings.textContent

  return (
    <div className="workspaceShell">
      <TopBar runtime={runtime} health={health} />
      <main className="workspace">
        <QueuePanel queue={queue} />
        <PreviewPanel
          state={preview}
          settings={{
            ...settings.settings,
            textContent: effectiveText
          }}
          hasSelectedImage={queue.selectedFilePath !== null}
          queueFilePaths={queueFilePaths}
          queueFileNames={queueFileNames}
          queueTextOverrides={queueTextOverrides}
        />
        <SettingsPanel
          controller={{ ...settings, update: handleSettingsUpdate, updateNumber: handleSettingsUpdateNumber }}
          templateController={templates}
          hasSelectedImage={queue.selectedFilePath !== null}
          selectedFilePath={queue.selectedFilePath}
          textOverride={queue.selectedTextOverride}
          setTextOverride={queue.setSelectedTextOverride}
          onLoadTemplate={handleLoadTemplate}
        />
      </main>
      <StatusPanel
        runtime={runtime}
        health={health}
        preview={preview}
      />
    </div>
  )
}
