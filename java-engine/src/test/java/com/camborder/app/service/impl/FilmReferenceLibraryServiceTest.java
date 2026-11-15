package com.camborder.app.service.impl;

import com.camborder.app.dto.FilmReferenceDto;
import com.camborder.app.dto.FilmReferenceLibraryRequest;
import com.camborder.app.dto.FilmReferenceLibraryResponse;
import com.camborder.app.dto.FilmReferenceQueryResponse;
import com.camborder.app.exception.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** FilmArchive 索引：来源、SHA 合并、修订、别名、差异、路径与缺失文件。 */
final class FilmReferenceLibraryServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final FilmReferenceLibraryServiceImpl service = new FilmReferenceLibraryServiceImpl(
            mapper, new FilmStockServiceImpl());

    @Test
    void githubCatalogUsesRootRelativePathsAndDeclaredMetadata(@TempDir final Path temp) throws Exception {
        final Path docs = Files.createDirectories(temp.resolve("Docs/Kodak"));
        Files.writeString(docs.resolve("gold.pdf"), "pdf-fixture");
        final com.fasterxml.jackson.databind.node.ObjectNode doc = mapper.createObjectNode();
        doc.put("relativePath", "Docs/Kodak/gold.pdf");
        doc.put("manufacturer", "Kodak"); doc.put("product", "Gold 200");
        doc.put("docTitle", "Gold June 2023"); doc.put("docType", "Technical Data");
        doc.put("pageCount", 4); doc.put("revision", "E7022"); doc.put("date", "June 2023");
        doc.put("sourceKind", "reprint"); doc.put("sourceUrl", "https://125px.com/gold.pdf");
        doc.putArray("productAliases").add("GOLD120");
        final com.fasterxml.jackson.databind.node.ObjectNode catalog = mapper.createObjectNode();
        catalog.put("schemaVersion", 1); catalog.putArray("documents").add(doc);
        Files.writeString(temp.resolve("catalog.json"), mapper.writeValueAsString(catalog));
        FilmReferenceDto result = service.register(request(temp)).getReferences().get(0);
        assertThat(result.getFileStatus()).isEqualTo("present");
        assertThat(result.getFilePath()).isEqualTo(docs.resolve("gold.pdf").toRealPath().toString());
        assertThat(result.getPages()).isEqualTo(4);
        assertThat(result.getPublicationNumber()).isEqualTo("E7022");
        assertThat(result.getDateSource()).isEqualTo("catalog-declared");
        assertThat(result.getAuthority()).isEqualTo("manufacturer-reprint");
        assertThat(service.query("GOLD120", null, null, null, true, 0, 10).getTotal()).isEqualTo(1);
        doc.put("sha256", "0".repeat(64)); doc.remove("sourceKind");
        Files.writeString(temp.resolve("catalog.json"), mapper.writeValueAsString(catalog));
        result = service.register(request(temp)).getReferences().get(0);
        assertThat(result.getFileStatus()).isEqualTo("checksum-mismatch");
        assertThat(result.getFilePath()).isNull();
        assertThat(result.getAuthority()).isEqualTo("unknown-source");
    }

    @Test
    void indexesCatalogWithShaMergeRevisionsAliasesAndMissingFiles(@TempDir final Path temp)
            throws Exception {
        final Path docs = Files.createDirectories(temp.resolve("Docs"));
        Files.createDirectories(docs.resolve("Kodak/CN"));
        Files.writeString(docs.resolve("Kodak/CN/a.pdf"), "same-content");
        Files.writeString(docs.resolve("Kodak/CN/b.pdf"), "same-content");
        Files.writeString(docs.resolve("Kodak/CN/c.pdf"), "revision-two");
        Files.writeString(docs.resolve("Kodak/CN/portra.pdf"), "portra");
        Files.writeString(docs.resolve("Kodak/CN/e.pdf"), "portra-content");
        Files.writeString(temp.resolve("catalog.json"), catalog(
                doc("Kodak", "Color Negative", "Gold 200", "E7022 Gold", "Technical Data",
                        "Kodak/CN/a.pdf", "https://www.kodakprofessional.com/a", false),
                doc("Kodak", "Color Negative", "Gold 200", "E7022 Gold duplicate", "Technical Data",
                        "Kodak/CN/b.pdf", "https://www.kodakprofessional.com/a", true),
                doc("Kodak", "Color Negative", "Gold 200", "E7022 Gold revision", "Technical Data",
                        "Kodak/CN/c.pdf", "https://www.kodakprofessional.com/a", false),
                doc("Kodak", "Color Negative", "Gold 200", "Missing scan", "Technical Data",
                        "Kodak/CN/missing.pdf", "https://www.kodakprofessional.com/missing", false),
                doc("Kodak", "Color Negative", "Portra 160", "Portra data", "Technical Data",
                        "Kodak/CN/portra.pdf", "https://www.kodakprofessional.com/portra", false),
                doc("Kodak", "Color Negative", "炮塔160", "Portra alias data", "Technical Data",
                        "Kodak/CN/e.pdf", "https://www.kodakprofessional.com/alias", false)));

        final FilmReferenceLibraryResponse response = service.register(request(temp));

        assertThat(response.getStatus()).isEqualTo("ok");
        assertThat(response.getCatalog().getDocuments()).isEqualTo(6);
        assertThat(response.getCatalog().getHidden()).isEqualTo(1);
        assertThat(response.getReferences()).hasSize(5);
        assertThat(response.getIndex().getMergedBySha256()).isEqualTo(1);
        assertThat(response.getIndex().getFilesMissing()).isEqualTo(1);
        assertThat(response.getIndex().getRevisionGroups()).isEqualTo(1);
        assertThat(response.getIndex().getFilmLinks()).isGreaterThanOrEqualTo(2);
        assertThat(response.getUpstream().getCommit()).isEqualTo("3001b382");

        final FilmReferenceDto merged = response.getReferences().stream()
                .filter(reference -> !reference.getMergedSources().isEmpty())
                .findFirst().orElseThrow();
        assertThat(merged.getMergedSources()).hasSize(1);
        assertThat(merged.getRevisionCount()).isEqualTo(2);
        assertThat(merged.getRevisionHashes()).hasSize(2);
        assertThat(merged.getPublicationNumber()).isEqualTo("E7022");
        assertThat(merged.getPublicationNumberSource()).isEqualTo("filename-or-url-heuristic");
        assertThat(merged.getSourceType()).isEqualTo("technical-data");
        assertThat(merged.getAuthority()).isEqualTo("manufacturer-document");
        assertThat(merged.getAvailability()).isEqualTo("unknown");
        assertThat(merged.getId()).startsWith("ref-sha-").doesNotContain("Kodak/CN/a.pdf");

        final FilmReferenceDto alias = response.getReferences().stream()
                .filter(reference -> "炮塔160".equals(reference.getProduct()))
                .findFirst().orElseThrow();
        assertThat(alias.getFilmLinks()).anyMatch(link ->
                "kodak-portra-160".equals(link.getFilmId()));

        final FilmReferenceQueryResponse query = service.query("炮塔160", null, null,
                null, true, 0, 10);
        assertThat(query.getTotal()).isGreaterThanOrEqualTo(1);
        final FilmReferenceQueryResponse film = service.query(null, null, null,
                "kodak-portra-160", true, 0, 10);
        assertThat(film.getTotal()).isGreaterThanOrEqualTo(2);
    }

    @Test
    void refreshReportsCatalogAndDocumentChangesWithoutMutatingOldIndex(@TempDir final Path temp)
            throws Exception {
        final Path docs = Files.createDirectories(temp.resolve("Docs"));
        Files.writeString(docs.resolve("a.pdf"), "a");
        Files.writeString(temp.resolve("catalog.json"), catalog(
                doc("Kodak", "Color Negative", "Gold 200", "Gold data", "Technical Data",
                        "a.pdf", "https://www.kodakprofessional.com/gold", false)));
        final FilmReferenceLibraryResponse first = service.register(request(temp));
        assertThat(first.getReferences()).hasSize(1);

        final FilmReferenceLibraryResponse second = service.register(request(temp));
        assertThat(second.getChanges().isCatalogChanged()).isFalse();
        assertThat(second.getChanges().getUnchanged()).isEqualTo(1);

        Files.writeString(docs.resolve("b.pdf"), "b");
        Files.writeString(temp.resolve("catalog.json"), catalog(
                doc("Kodak", "Color Negative", "Gold 200", "Gold data", "Technical Data",
                        "a.pdf", "https://www.kodakprofessional.com/gold", false),
                doc("Fujifilm", "Color Negative", "C200", "C200 data", "Technical Data",
                        "b.pdf", "https://www.fujifilm.com/c200", false)));
        final FilmReferenceLibraryResponse third = service.register(request(temp));
        assertThat(third.getChanges().isCatalogChanged()).isTrue();
        assertThat(third.getChanges().getAdded()).hasSize(1);
        assertThat(third.getChanges().getAdded().get(0)).startsWith("ref-sha-");
        assertThat(first.getReferences()).hasSize(1);
    }

    @Test
    void unsafePathsAndMissingDocumentsAreReportedNotOpened(@TempDir final Path temp)
            throws Exception {
        Files.writeString(temp.resolve("catalog.json"), catalog(
                doc("Kodak", "Color Negative", "Gold 200", "escape", "Technical Data",
                        "../../outside.pdf", "https://www.kodakprofessional.com/x", false)));
        final FilmReferenceLibraryResponse response = service.register(request(temp));
        assertThat(response.getReferences().get(0).getFileStatus()).isEqualTo("unsafe-path");
        assertThat(response.getReferences().get(0).getFilePath()).isNull();
    }

    @Test
    void missingCorruptAndUnknownCatalogFail(@TempDir final Path temp) throws Exception {
        assertThatThrownBy(() -> service.register(request(temp)))
                .isInstanceOfSatisfying(ApiException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(FilmReferenceLibraryServiceImpl.CODE_CATALOG_MISSING));

        Files.writeString(temp.resolve("catalog.json"), "{broken");
        assertThatThrownBy(() -> service.register(request(temp)))
                .isInstanceOfSatisfying(ApiException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(FilmReferenceLibraryServiceImpl.CODE_CATALOG_INVALID));

        Files.writeString(temp.resolve("catalog.json"), "{\"schemaVersion\":2,\"documents\":[]}");
        assertThatThrownBy(() -> service.register(request(temp)))
                .isInstanceOfSatisfying(ApiException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(FilmReferenceLibraryServiceImpl.CODE_CATALOG_SCHEMA));
    }

    @Test
    void queryBeforeRegistrationIsExplicitlyEmpty(@TempDir final Path temp) {
        final FilmReferenceLibraryServiceImpl fresh = new FilmReferenceLibraryServiceImpl(
                mapper, new FilmStockServiceImpl());
        final FilmReferenceQueryResponse response = fresh.query(null, null, null,
                null, true, 0, 50);
        assertThat(response.getStatus()).isEqualTo("not-registered");
        assertThat(response.getReferences()).isEmpty();
    }

    private static FilmReferenceLibraryRequest request(final Path path) {
        final FilmReferenceLibraryRequest request = new FilmReferenceLibraryRequest();
        request.setLibraryPath(path.toString());
        request.setRefresh(true);
        return request;
    }

    private static String doc(final String manufacturer, final String category,
                              final String product, final String title, final String type,
                              final String path, final String sourceUrl, final boolean hidden) {
        return "{\"manufacturer\":\"" + manufacturer + "\",\"category\":\"" + category
                + "\",\"product\":\"" + product + "\",\"title\":\"" + title
                + "\",\"type\":\"" + type + "\",\"pages\":4,\"sizeBytes\":100,"
                + "\"sourceUrl\":\"" + sourceUrl + "\",\"path\":\"" + path + "\""
                + (hidden ? ",\"hidden\":true" : "") + "}";
    }

    private static String catalog(final String... docs) {
        return "{\"schemaVersion\":1,\"generatedAt\":\"2026-10-27T17:18:49Z\","
                + "\"manufacturers\":[],\"documents\":[" + String.join(",", docs) + "]}";
    }
}
