# Camera Border App Design System

## 1. Atmosphere & Identity

一个安静、专业、偏摄影暗房工具感的桌面应用。界面不追求营销感，而强调秩序、可信度和长时间使用时的耐看度。视觉签名是浅暖灰底上的深色信息层级，用克制的边框和排版来承接照片本身，而不是抢照片的注意力。

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface/primary | --surface-primary | #f6f1e8 | #171411 | Main background |
| Surface/secondary | --surface-secondary | #efe8dc | #201c18 | Panels |
| Surface/elevated | --surface-elevated | #fffaf1 | #2a241f | Cards, dialogs |
| Text/primary | --text-primary | #221d18 | #f6efe4 | Headlines, body |
| Text/secondary | --text-secondary | #62574c | #c3b6a8 | Secondary copy |
| Text/tertiary | --text-tertiary | #8b7d6f | #9a8d80 | Hints |
| Border/default | --border-default | #d8cfc1 | #3a322b | Standard borders |
| Border/subtle | --border-subtle | #e8dfd2 | #2d2620 | Soft dividers |
| Accent/primary | --accent-primary | #6c4b2c | #c58a53 | Primary action |
| Accent/hover | --accent-hover | #8a5e36 | #d89b61 | Hover state |
| Status/success | --status-success | #2f6a47 | #6db388 | Success |
| Status/warning | --status-warning | #aa6a1f | #d79b45 | Warning |
| Status/error | --status-error | #9e3f34 | #de7d73 | Error |
| Status/info | --status-info | #6c4b2c | #c58a53 | Info |

### Rules

- 主背景保持柔和，不用纯白。
- 强调色只用于交互和焦点，不用于大面积装饰。
- 除 DESIGN.md 外，不直接引入新的原始颜色值。

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| Display | 44px / 2.75rem | 700 | 1.1 | -0.02em | App hero |
| H1 | 32px / 2rem | 700 | 1.15 | -0.015em | Main headings |
| H2 | 26px / 1.625rem | 600 | 1.25 | -0.01em | Section headings |
| H3 | 20px / 1.25rem | 600 | 1.35 | 0 | Panel titles |
| Body/lg | 18px / 1.125rem | 400 | 1.6 | 0 | Lead text |
| Body | 16px / 1rem | 400 | 1.6 | 0 | Default text |
| Body/sm | 14px / 0.875rem | 400 | 1.5 | 0 | Secondary text |
| Caption | 12px / 0.75rem | 500 | 1.4 | 0.02em | Metadata |
| Overline | 11px / 0.6875rem | 600 | 1.3 | 0.08em | Labels |

### Font Stack

- Primary: `"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif`
- Mono: `"SFMono-Regular", "JetBrains Mono", Consolas, monospace`

### Rules

- 标题和说明以衬线字体建立摄影出版感。
- 参数类文本和代码类文本使用等宽字体。
- 正文不低于 14px。

## 4. Spacing & Layout

### Base Unit

所有间距基于 4px。

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Tight |
| --space-2 | 8px | Compact |
| --space-3 | 12px | Input padding |
| --space-4 | 16px | Standard |
| --space-5 | 20px | Comfortable |
| --space-6 | 24px | Card padding |
| --space-8 | 32px | Group spacing |
| --space-10 | 40px | Section spacing |
| --space-12 | 48px | Major split |
| --space-16 | 64px | Page rhythm |

### Grid

- Max content width: 1440px
- Column system: 12-column
- Breakpoints: sm 640px, md 768px, lg 1024px, xl 1280px

### Rules

- 桌面优先采用工作台式三栏布局。
- 不使用随意的 magic number。

## 5. Components

### Workspace Shell

- **Structure**: 顶部标题栏 + 左侧队列 + 中间预览 + 右侧设置
- **Variants**: desktop, narrow
- **Spacing**: `--space-4`, `--space-6`, `--space-8`
- **States**: default
- **Accessibility**: landmark clear, readable contrast
- **Motion**: none at MVP

### Status Card

- **Structure**: title + body + mono meta row
- **Variants**: neutral, success, warning
- **Spacing**: `--space-4`
- **States**: default
- **Accessibility**: semantic heading structure
- **Motion**: subtle fade-in only if needed later

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 120ms | ease-out | Hover |
| Standard | 220ms | ease-in-out | Panel state |
| Emphasis | 420ms | cubic-bezier(0.16, 1, 0.3, 1) | Major reveal |

### Rules

- MVP 阶段动画尽量克制。
- 只允许 `transform` 和 `opacity` 动画。
- 后续如加入预览切换动画，必须支持 `prefers-reduced-motion`。

## 7. Depth & Surface

### Strategy

选择 `borders-only`。

| Type | Value | Usage |
|------|-------|-------|
| Default | 1px solid var(--border-default) | Cards, panels |
| Subtle | 1px solid var(--border-subtle) | Internal separators |
