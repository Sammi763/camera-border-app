package com.camborder.app.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * FilmArchive 只读索引响应。
 *
 * 文献数量不是胶片数量，也不是可用校色配置数量；changes 只描述资料索引变化，
 * 不回写任何已编辑图片或已提交导出的参数。
 */
public final class FilmReferenceLibraryResponse {

    private String status;
    private String message;
    private String libraryPath;
    private Upstream upstream;
    private Catalog catalog;
    private IndexStats index;
    private Changes changes;
    private List<FilmReferenceDto> references = new ArrayList<>();
    private List<String> gaps = new ArrayList<>();
    private List<String> warnings = new ArrayList<>();

    public String getStatus() { return status; }
    public void setStatus(final String status) { this.status = status; }
    public String getMessage() { return message; }
    public void setMessage(final String message) { this.message = message; }
    public String getLibraryPath() { return libraryPath; }
    public void setLibraryPath(final String libraryPath) { this.libraryPath = libraryPath; }
    public Upstream getUpstream() { return upstream; }
    public void setUpstream(final Upstream upstream) { this.upstream = upstream; }
    public Catalog getCatalog() { return catalog; }
    public void setCatalog(final Catalog catalog) { this.catalog = catalog; }
    public IndexStats getIndex() { return index; }
    public void setIndex(final IndexStats index) { this.index = index; }
    public Changes getChanges() { return changes; }
    public void setChanges(final Changes changes) { this.changes = changes; }
    public List<FilmReferenceDto> getReferences() { return references; }
    public void setReferences(final List<FilmReferenceDto> references) { this.references = references; }
    public List<String> getGaps() { return gaps; }
    public void setGaps(final List<String> gaps) { this.gaps = gaps; }
    public List<String> getWarnings() { return warnings; }
    public void setWarnings(final List<String> warnings) { this.warnings = warnings; }

    public static final class Upstream {
        private String name = "noeltong/FilmArchive";
        private String commit = "3001b382";
        private String licenseNote = "只读关联本机资料库；不复制上游代码或打包 PDF";

        public String getName() { return name; }
        public void setName(final String name) { this.name = name; }
        public String getCommit() { return commit; }
        public void setCommit(final String commit) { this.commit = commit; }
        public String getLicenseNote() { return licenseNote; }
        public void setLicenseNote(final String licenseNote) { this.licenseNote = licenseNote; }
    }

    public static final class Catalog {
        private int schemaVersion;
        private String generatedAt;
        private String sha256;
        private int documents;
        private int visible;
        private int hidden;
        private String path;

        public int getSchemaVersion() { return schemaVersion; }
        public void setSchemaVersion(final int schemaVersion) { this.schemaVersion = schemaVersion; }
        public String getGeneratedAt() { return generatedAt; }
        public void setGeneratedAt(final String generatedAt) { this.generatedAt = generatedAt; }
        public String getSha256() { return sha256; }
        public void setSha256(final String sha256) { this.sha256 = sha256; }
        public int getDocuments() { return documents; }
        public void setDocuments(final int documents) { this.documents = documents; }
        public int getVisible() { return visible; }
        public void setVisible(final int visible) { this.visible = visible; }
        public int getHidden() { return hidden; }
        public void setHidden(final int hidden) { this.hidden = hidden; }
        public String getPath() { return path; }
        public void setPath(final String path) { this.path = path; }
    }

    public static final class IndexStats {
        private int references;
        private int filesPresent;
        private int filesMissing;
        private int mergedBySha256;
        private int revisionGroups;
        private int filmLinks;
        private int unknownSource;
        private int notOnSaleInferred;
        private String indexedAt;

        public int getReferences() { return references; }
        public void setReferences(final int references) { this.references = references; }
        public int getFilesPresent() { return filesPresent; }
        public void setFilesPresent(final int filesPresent) { this.filesPresent = filesPresent; }
        public int getFilesMissing() { return filesMissing; }
        public void setFilesMissing(final int filesMissing) { this.filesMissing = filesMissing; }
        public int getMergedBySha256() { return mergedBySha256; }
        public void setMergedBySha256(final int mergedBySha256) { this.mergedBySha256 = mergedBySha256; }
        public int getRevisionGroups() { return revisionGroups; }
        public void setRevisionGroups(final int revisionGroups) { this.revisionGroups = revisionGroups; }
        public int getFilmLinks() { return filmLinks; }
        public void setFilmLinks(final int filmLinks) { this.filmLinks = filmLinks; }
        public int getUnknownSource() { return unknownSource; }
        public void setUnknownSource(final int unknownSource) { this.unknownSource = unknownSource; }
        public int getNotOnSaleInferred() { return notOnSaleInferred; }
        public void setNotOnSaleInferred(final int notOnSaleInferred) {
            this.notOnSaleInferred = notOnSaleInferred;
        }
        public String getIndexedAt() { return indexedAt; }
        public void setIndexedAt(final String indexedAt) { this.indexedAt = indexedAt; }
    }

    public static final class Changes {
        private String previousCatalogSha256;
        private String currentCatalogSha256;
        private boolean catalogChanged;
        private int unchanged;
        private List<String> added = new ArrayList<>();
        private List<String> removed = new ArrayList<>();
        private List<String> changed = new ArrayList<>();
        private List<String> newRevisions = new ArrayList<>();

        public String getPreviousCatalogSha256() { return previousCatalogSha256; }
        public void setPreviousCatalogSha256(final String previousCatalogSha256) {
            this.previousCatalogSha256 = previousCatalogSha256;
        }
        public String getCurrentCatalogSha256() { return currentCatalogSha256; }
        public void setCurrentCatalogSha256(final String currentCatalogSha256) {
            this.currentCatalogSha256 = currentCatalogSha256;
        }
        public boolean isCatalogChanged() { return catalogChanged; }
        public void setCatalogChanged(final boolean catalogChanged) {
            this.catalogChanged = catalogChanged;
        }
        public int getUnchanged() { return unchanged; }
        public void setUnchanged(final int unchanged) { this.unchanged = unchanged; }
        public List<String> getAdded() { return added; }
        public void setAdded(final List<String> added) { this.added = added; }
        public List<String> getRemoved() { return removed; }
        public void setRemoved(final List<String> removed) { this.removed = removed; }
        public List<String> getChanged() { return changed; }
        public void setChanged(final List<String> changed) { this.changed = changed; }
        public List<String> getNewRevisions() { return newRevisions; }
        public void setNewRevisions(final List<String> newRevisions) {
            this.newRevisions = newRevisions;
        }
    }
}
