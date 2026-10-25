# 阶段 6 摄影用户首次使用测试记录

本文件是记录模板，不是已完成的用户研究结论。当前未填写的项目必须保持 `NOT_RUN`，不能
用开发者自测代替目标摄影用户测试。

完成后将匿名汇总写入 [JSON 结果模板](user-study-stage6-result.template.json)，供阶段 6
发布报告的 `--user-study` 参数读取；Markdown 表格和 JSON 必须来自同一轮测试。

## 通过门槛

- 至少 5 名目标摄影用户；
- 至少 4/5 人不看帮助完成首次导入、选版式和导出；
- 中位首次出图时间不超过 3 分钟；
- 无人误认为 RAW 是真实显影；
- 所有人能理解“当前图片”和“批量已选”的区别；
- 阻断或高频问题修复后重新测试并记录回归结果。

## 参与者记录

只记录匿名编号和与任务相关的经验，不记录姓名、原片或位置数据。

| 编号 | 目标摄影经验 | 平台/版本 | 是否看帮助 | 首次出图时间 | 首次任务结果 | RAW 认知 | 当前/批量理解 | 问题编号 |
|---|---|---|---|---:|---|---|---|---|
| P01 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — |
| P02 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — |
| P03 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — |
| P04 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — |
| P05 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — |

## 统一任务脚本

1. 不看帮助，导入一张 JPEG；
2. 选择一个版式；
3. 修改一段文字或拍摄信息；
4. 导入第二张图，说明当前预览图和批量已选的区别；
5. 只导出指定范围；
6. 查看输出档位和实际结果；
7. 对 RAW 样片说明应用实际做了什么。

记录开始/结束时间、用户是否请求提示、每一步是否独立完成和中止原因。问题按 P0/P1/P2/P3
分类；修复后重新执行受影响任务，并在“问题编号”中关联回归记录。

## 汇总

| 指标 | 结果 |
|---|---|
| 完成首次导入、选版式、导出的参与者 | NOT_RUN / 5 |
| 不看帮助完成比例 | NOT_RUN |
| 首次出图时间中位数 | NOT_RUN |
| 误解 RAW 为真实显影人数 | NOT_RUN / 0 |
| 无法理解当前/批量范围人数 | NOT_RUN / 0 |
| 修复后 P0/P1/P2 | NOT_RUN / 0 |
| P3 纯视觉问题 | NOT_RUN |

用户研究完成前，最终发布门保持 `RELEASE_READY: no`。
