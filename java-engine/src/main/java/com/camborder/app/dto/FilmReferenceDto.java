package com.camborder.app.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * 单条文献记录。它不是项目胶片 ID，也不是已验证校色配置。
 *
 * id 由内容 SHA-256 或目录指纹派生；upstreamDocumentKey 只保留上游目录定位，
 * 不参与胶片身份、曲线数据或用户配方的标识。
 */
public final class FilmReferenceDto {

    private String id;
    private String title;
    private String manufacturer;
    private String category;
    private String product;
    private String type;
    private String sourceType;
    private String authority;
    private String availability = "unknown";
    private int pages;
    private long sizeBytes;
    private boolean hidden;
    private String sourceUrl;
    private String sourceHost;
    private String upstreamCommit;
    private String upstreamPath;
    private String upstreamDocumentKey;
    private String publicationNumber;
    private String publicationNumberSource;
    private String publicationDate;
    private String dateSource;
    private String sha256;
    private String fileStatus;
    private String filePath;
    private long fileSizeBytes;
    private String revisionGroup;
    private int revisionCount;
    private List<String> revisionHashes = new ArrayList<>();
    private List<MergedSource> mergedSources = new ArrayList<>();
    private List<FilmLink> filmLinks = new ArrayList<>();
    private List<String> evidenceGaps = new ArrayList<>();
    private String note;

    public String getId() { return id; }
    public void setId(final String id) { this.id = id; }
    public String getTitle() { return title; }
    public void setTitle(final String title) { this.title = title; }
    public String getManufacturer() { return manufacturer; }
    public void setManufacturer(final String manufacturer) { this.manufacturer = manufacturer; }
    public String getCategory() { return category; }
    public void setCategory(final String category) { this.category = category; }
    public String getProduct() { return product; }
    public void setProduct(final String product) { this.product = product; }
    public String getType() { return type; }
    public void setType(final String type) { this.type = type; }
    public String getSourceType() { return sourceType; }
    public void setSourceType(final String sourceType) { this.sourceType = sourceType; }
    public String getAuthority() { return authority; }
    public void setAuthority(final String authority) { this.authority = authority; }
    public String getAvailability() { return availability; }
    public void setAvailability(final String availability) { this.availability = availability; }
    public int getPages() { return pages; }
    public void setPages(final int pages) { this.pages = pages; }
    public long getSizeBytes() { return sizeBytes; }
    public void setSizeBytes(final long sizeBytes) { this.sizeBytes = sizeBytes; }
    public boolean isHidden() { return hidden; }
    public void setHidden(final boolean hidden) { this.hidden = hidden; }
    public String getSourceUrl() { return sourceUrl; }
    public void setSourceUrl(final String sourceUrl) { this.sourceUrl = sourceUrl; }
    public String getSourceHost() { return sourceHost; }
    public void setSourceHost(final String sourceHost) { this.sourceHost = sourceHost; }
    public String getUpstreamCommit() { return upstreamCommit; }
    public void setUpstreamCommit(final String upstreamCommit) { this.upstreamCommit = upstreamCommit; }
    public String getUpstreamPath() { return upstreamPath; }
    public void setUpstreamPath(final String upstreamPath) { this.upstreamPath = upstreamPath; }
    public String getUpstreamDocumentKey() { return upstreamDocumentKey; }
    public void setUpstreamDocumentKey(final String upstreamDocumentKey) {
        this.upstreamDocumentKey = upstreamDocumentKey;
    }
    public String getPublicationNumber() { return publicationNumber; }
    public void setPublicationNumber(final String publicationNumber) {
        this.publicationNumber = publicationNumber;
    }
    public String getPublicationNumberSource() { return publicationNumberSource; }
    public void setPublicationNumberSource(final String publicationNumberSource) {
        this.publicationNumberSource = publicationNumberSource;
    }
    public String getPublicationDate() { return publicationDate; }
    public void setPublicationDate(final String publicationDate) { this.publicationDate = publicationDate; }
    public String getDateSource() { return dateSource; }
    public void setDateSource(final String dateSource) { this.dateSource = dateSource; }
    public String getSha256() { return sha256; }
    public void setSha256(final String sha256) { this.sha256 = sha256; }
    public String getFileStatus() { return fileStatus; }
    public void setFileStatus(final String fileStatus) { this.fileStatus = fileStatus; }
    public String getFilePath() { return filePath; }
    public void setFilePath(final String filePath) { this.filePath = filePath; }
    public long getFileSizeBytes() { return fileSizeBytes; }
    public void setFileSizeBytes(final long fileSizeBytes) { this.fileSizeBytes = fileSizeBytes; }
    public String getRevisionGroup() { return revisionGroup; }
    public void setRevisionGroup(final String revisionGroup) { this.revisionGroup = revisionGroup; }
    public int getRevisionCount() { return revisionCount; }
    public void setRevisionCount(final int revisionCount) { this.revisionCount = revisionCount; }
    public List<String> getRevisionHashes() { return revisionHashes; }
    public void setRevisionHashes(final List<String> revisionHashes) { this.revisionHashes = revisionHashes; }
    public List<MergedSource> getMergedSources() { return mergedSources; }
    public void setMergedSources(final List<MergedSource> mergedSources) {
        this.mergedSources = mergedSources;
    }
    public List<FilmLink> getFilmLinks() { return filmLinks; }
    public void setFilmLinks(final List<FilmLink> filmLinks) { this.filmLinks = filmLinks; }
    public List<String> getEvidenceGaps() { return evidenceGaps; }
    public void setEvidenceGaps(final List<String> evidenceGaps) { this.evidenceGaps = evidenceGaps; }
    public String getNote() { return note; }
    public void setNote(final String note) { this.note = note; }

    /** SHA 相同文件的来源合并项；每个来源仍保留自己的原始 URL/路径。 */
    public static final class MergedSource {
        private String sourceUrl;
        private String upstreamPath;

        public MergedSource() { }
        public MergedSource(final String sourceUrl, final String upstreamPath) {
            this.sourceUrl = sourceUrl;
            this.upstreamPath = upstreamPath;
        }

        public String getSourceUrl() { return sourceUrl; }
        public void setSourceUrl(final String sourceUrl) { this.sourceUrl = sourceUrl; }
        public String getUpstreamPath() { return upstreamPath; }
        public void setUpstreamPath(final String upstreamPath) { this.upstreamPath = upstreamPath; }
    }

    /** 文献与胶片的多对多关联；关联只帮助检索，不代表已验证校色。 */
    public static final class FilmLink {
        private String filmId;
        private String filmName;
        private String match;
        private String confidence;
        private String alias;

        public FilmLink() { }
        public FilmLink(final String filmId, final String filmName, final String match,
                        final String confidence, final String alias) {
            this.filmId = filmId;
            this.filmName = filmName;
            this.match = match;
            this.confidence = confidence;
            this.alias = alias;
        }

        public String getFilmId() { return filmId; }
        public void setFilmId(final String filmId) { this.filmId = filmId; }
        public String getFilmName() { return filmName; }
        public void setFilmName(final String filmName) { this.filmName = filmName; }
        public String getMatch() { return match; }
        public void setMatch(final String match) { this.match = match; }
        public String getConfidence() { return confidence; }
        public void setConfidence(final String confidence) { this.confidence = confidence; }
        public String getAlias() { return alias; }
        public void setAlias(final String alias) { this.alias = alias; }
    }
}
