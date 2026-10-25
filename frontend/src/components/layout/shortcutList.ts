/**
 * 快捷键速查数据的单一来源。
 *
 * ShortcutOverlay 与帮助面板共用这里的数据；新增或调整快捷键时同步修改
 * WorkspacePage 的全局 keydown 处理，并保持文案与实际行为一致。
 */

/** 单条快捷键说明。keys 按按下顺序排列；组合键拆成多段展示。 */
export type ShortcutEntry = {
  readonly keys: readonly string[]
  readonly description: string
}

/** 按功能分组的快捷键列表。 */
export type ShortcutGroup = {
  readonly title: string
  readonly entries: readonly ShortcutEntry[]
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: "队列与选择",
    entries: [
      { keys: ["↑", "↓"], description: "切换当前预览图" },
      { keys: ["空格"], description: "勾选 / 取消勾选当前图片" },
      { keys: ["Delete"], description: "删除当前图片" }
    ]
  },
  {
    title: "预览",
    entries: [
      { keys: ["F"], description: "预览适应窗口" },
      { keys: ["1"], description: "预览 100% 原始尺寸" },
      { keys: ["\\"], description: "按住查看无边框原图，松开恢复" }
    ]
  },
  {
    title: "编辑与导出",
    entries: [
      { keys: ["⌘/Ctrl", "Z"], description: "撤销队列与每图修改" },
      { keys: ["⌘/Ctrl", "⇧", "Z"], description: "重做" },
      { keys: ["E"], description: "导出当前范围" },
      { keys: ["⌘/Ctrl", "Enter"], description: "导出当前范围" }
    ]
  },
  {
    title: "帮助",
    entries: [
      { keys: ["?"], description: "打开 / 关闭快捷键速查面板" },
      { keys: ["Esc"], description: "关闭面板与对话框" }
    ]
  }
]
