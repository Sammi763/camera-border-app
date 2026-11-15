package com.camborder.app.dto;

import java.util.ArrayList;
import java.util.List;

/** GET /api/film-references 的只读查询结果。 */
public final class FilmReferenceQueryResponse {

    private String status;
    private String message;
    private String libraryPath;
    private String catalogSha256;
    private int total;
    private int offset;
    private int limit;
    private List<FilmReferenceDto> references = new ArrayList<>();

    public String getStatus() { return status; }
    public void setStatus(final String status) { this.status = status; }
    public String getMessage() { return message; }
    public void setMessage(final String message) { this.message = message; }
    public String getLibraryPath() { return libraryPath; }
    public void setLibraryPath(final String libraryPath) { this.libraryPath = libraryPath; }
    public String getCatalogSha256() { return catalogSha256; }
    public void setCatalogSha256(final String catalogSha256) { this.catalogSha256 = catalogSha256; }
    public int getTotal() { return total; }
    public void setTotal(final int total) { this.total = total; }
    public int getOffset() { return offset; }
    public void setOffset(final int offset) { this.offset = offset; }
    public int getLimit() { return limit; }
    public void setLimit(final int limit) { this.limit = limit; }
    public List<FilmReferenceDto> getReferences() { return references; }
    public void setReferences(final List<FilmReferenceDto> references) {
        this.references = references;
    }
}
