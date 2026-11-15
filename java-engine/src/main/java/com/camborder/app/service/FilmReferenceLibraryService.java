package com.camborder.app.service;

import com.camborder.app.dto.FilmReferenceLibraryRequest;
import com.camborder.app.dto.FilmReferenceLibraryResponse;
import com.camborder.app.dto.FilmReferenceQueryResponse;

/** 本机 FilmArchive 只读目录索引与查询。 */
public interface FilmReferenceLibraryService {

    FilmReferenceLibraryResponse register(FilmReferenceLibraryRequest request);

    FilmReferenceQueryResponse query(String query, String manufacturer, String category,
                                     String filmId, boolean includeHidden,
                                     int offset, int limit);
}
