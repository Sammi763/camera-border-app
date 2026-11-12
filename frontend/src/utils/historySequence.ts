/**
 * 跨撤销历史的全局操作序号。
 *
 * 队列与设置各自维护撤销栈（结构快照），全局 ⌘Z 需要按「最近一次操作」的
 * 顺序在两套历史间选择。本模块只提供一个进程内单调递增序号：每次产生
 * 可撤销变更时压栈条目携带当时的序号，协调器比较栈顶序号即可还原最近
 * 操作顺序，不引入全局状态框架，也不改变两套历史的存储结构。
 */

/** 撤销/重做栈条目的协调元数据。 */
export type HistoryEntryMeta = {
  /** 全局递增序号；数值越大表示操作发生得越晚。 */
  readonly seq: number
  /** 面向用户的动作描述（如「删除图片」「修改边框」），用于按钮提示。 */
  readonly description: string
}

let sequence = 0

/** 取下一个全局历史序号。 */
export const nextHistorySeq = (): number => {
  sequence += 1
  return sequence
}
