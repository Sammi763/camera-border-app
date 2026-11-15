package com.camborder.app.dto;

/**
 * 只读 FilmArchive 资料库注册请求。
 *
 * libraryPath 必须是包含 catalog.json 的本地目录；引擎只读解析，不复制、不改写，
 * 也不把资料库文件路径转换成远程 URL。
 */
public final class FilmReferenceLibraryRequest {

    private String libraryPath;
    private Boolean refresh;
    /** 可选：上一轮目录指纹；用于计算目录差异，不改变已编辑图片或已冻结导出。 */
    private String previousCatalogSha256;

    public String getLibraryPath() { return libraryPath; }
    public void setLibraryPath(final String libraryPath) { this.libraryPath = libraryPath; }
    public Boolean getRefresh() { return refresh; }
    public void setRefresh(final Boolean refresh) { this.refresh = refresh; }
    public String getPreviousCatalogSha256() { return previousCatalogSha256; }
    public void setPreviousCatalogSha256(final String previousCatalogSha256) {
        this.previousCatalogSha256 = previousCatalogSha256;
    }
}
