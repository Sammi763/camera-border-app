/**
 * 通用资产列表行组件。
 *
 * 用于 AssetLibraryPanel 各分组中展示单条资产记录。
 */

type AssetRowProps = {
  readonly label: string
  readonly detail: string
  readonly onEdit: () => void
  readonly onDelete: () => void
}

export const AssetRow = ({ label, detail, onEdit, onDelete }: AssetRowProps): JSX.Element => (
  <div className="assetItem">
    <div className="assetItemInfo">
      <span className="assetItemLabel">{label}</span>
      {detail.length > 0 && <span className="assetItemDetail">{detail}</span>}
    </div>
    <div className="assetItemActions">
      <button type="button" className="ghostButton" onClick={onEdit}>编辑</button>
      <button type="button" className="ghostButton" onClick={onDelete}>删除</button>
    </div>
  </div>
)
