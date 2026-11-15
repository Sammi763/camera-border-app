package com.camborder.app.service.impl;

import com.camborder.app.dto.FilmReferenceDto;
import com.camborder.app.dto.FilmReferenceLibraryRequest;
import com.camborder.app.dto.FilmReferenceLibraryResponse;
import com.camborder.app.dto.FilmReferenceQueryResponse;
import com.camborder.app.dto.FilmStockResponse;
import com.camborder.app.exception.ApiException;
import com.camborder.app.service.FilmReferenceLibraryService;
import com.camborder.app.service.FilmStockService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * FilmArchive 索引实现。
 *
 * 只读 catalog.json 与本机 Docs 文件；不依赖上游 WPF 阅读器，不复制上游代码/PDF。
 * SHA-256 相同的文件合并来源，正文近似只提示复核，不同修订版保留。id 从不使用
 * 上游文档 ID；胶片关联只使用本项目胶片库存 ID。
 */
@Service
public final class FilmReferenceLibraryServiceImpl implements FilmReferenceLibraryService {

    public static final String CODE_CATALOG_MISSING = "FILM_REFERENCE_CATALOG_MISSING";
    public static final String CODE_CATALOG_INVALID = "FILM_REFERENCE_CATALOG_INVALID";
    public static final String CODE_CATALOG_SCHEMA = "FILM_REFERENCE_CATALOG_SCHEMA_UNSUPPORTED";
    public static final String CODE_LIBRARY_INVALID = "FILM_REFERENCE_LIBRARY_INVALID";
    private static final int MAX_DOCUMENTS = 5000;
    private static final Pattern PUBLICATION = Pattern.compile(
            "(?i)(?:^|[^a-z0-9])([a-z]\\d{3,4}|[a-z]{1,3}-\\d{2,4})(?:[^a-z0-9]|$)");
    private static final Pattern DATE = Pattern.compile(
            "(?i)((?:19|20)\\d{2}[-/](?:0?[1-9]|1[0-2])|"
                    + "(?:january|february|march|april|may|june|july|august|september|october|november|december)"
                    + "\\s+(?:19|20)\\d{2}|(?:19|20)\\d{2})");

    /** 玩家别称只用于检索与文献关联，不生成任何处理参数。 */
    private static final Map<String, String> ALIASES = new LinkedHashMap<>();
    static {
        ALIASES.put("炮塔160", "portra 160");
        ALIASES.put("炮塔400", "portra 400");
        ALIASES.put("炮塔800", "portra 800");
        ALIASES.put("金200", "gold 200");
        ALIASES.put("人像100", "pro image 100");
        ALIASES.put("易拍200", "colorplus 200");
        ALIASES.put("cp200", "colorplus 200");
        ALIASES.put("c200", "c200");
        ALIASES.put("c400", "superia x-tra 400");
    }

    private final ObjectMapper objectMapper;
    private final FilmStockService filmStockService;
    private volatile IndexedLibrary library;

    public FilmReferenceLibraryServiceImpl(final ObjectMapper objectMapper,
                                           final FilmStockService filmStockService) {
        this.objectMapper = objectMapper;
        this.filmStockService = filmStockService;
    }

    @Override
    public synchronized FilmReferenceLibraryResponse register(
            final FilmReferenceLibraryRequest request) {
        if (request == null || request.getLibraryPath() == null
                || request.getLibraryPath().isBlank()) {
            throw new ApiException("libraryPath is required", HttpStatus.BAD_REQUEST,
                    CODE_LIBRARY_INVALID);
        }
        final Path root;
        try {
            root = Path.of(request.getLibraryPath()).toAbsolutePath().normalize();
        } catch (RuntimeException exception) {
            throw new ApiException("libraryPath is invalid", HttpStatus.BAD_REQUEST,
                    CODE_LIBRARY_INVALID);
        }
        if (!Files.isDirectory(root) || !Files.isReadable(root)) {
            throw new ApiException("FilmArchive 目录不存在或不可读", HttpStatus.BAD_REQUEST,
                    CODE_LIBRARY_INVALID);
        }
        final Path catalogPath = catalogPath(root);
        if (catalogPath == null) {
            throw new ApiException("目录中没有 catalog.json", HttpStatus.BAD_REQUEST,
                    CODE_CATALOG_MISSING);
        }
        final byte[] catalogBytes;
        try {
            catalogBytes = Files.readAllBytes(catalogPath);
        } catch (IOException exception) {
            throw new ApiException("catalog.json 无法读取", HttpStatus.BAD_REQUEST,
                    CODE_CATALOG_MISSING);
        }
        final String catalogSha = sha256(catalogBytes);
        final IndexedLibrary previous = library;
        if (Boolean.FALSE.equals(request.getRefresh()) && previous != null
                && previous.catalogSha256.equals(catalogSha)
                && previous.root.equals(root)) {
            return previous.response;
        }
        final JsonNode catalog;
        try {
            catalog = objectMapper.readTree(catalogBytes);
        } catch (IOException exception) {
            throw new ApiException("catalog.json 不是合法 JSON", HttpStatus.BAD_REQUEST,
                    CODE_CATALOG_INVALID);
        }
        if (catalog == null || !catalog.isObject()) {
            throw new ApiException("catalog.json 顶层结构非法", HttpStatus.BAD_REQUEST,
                    CODE_CATALOG_INVALID);
        }
        final int schemaVersion = catalog.path("schemaVersion").asInt(-1);
        if (schemaVersion != 1) {
            throw new ApiException("catalog.json schemaVersion 不受支持",
                    HttpStatus.BAD_REQUEST, CODE_CATALOG_SCHEMA);
        }
        final JsonNode documents = catalog.path("documents");
        if (!documents.isArray()) {
            throw new ApiException("catalog.json 缺少 documents 数组",
                    HttpStatus.BAD_REQUEST, CODE_CATALOG_INVALID);
        }
        if (documents.size() > MAX_DOCUMENTS) {
            throw new ApiException("catalog.json 文档数量超过只读索引上限",
                    HttpStatus.BAD_REQUEST, CODE_CATALOG_INVALID);
        }
        final Path docsRoot = chooseDocsRoot(root);
        final List<FilmReferenceDto> references = indexDocuments(
                documents, docsRoot, catalogSha, root);
        final FilmReferenceLibraryResponse response = buildResponse(
                root, catalogPath, catalog, catalogSha, references, previous,
                request.getPreviousCatalogSha256());
        library = new IndexedLibrary(root, catalogSha, docsRoot, response);
        return response;
    }

    @Override
    public synchronized FilmReferenceQueryResponse query(final String query,
                                                         final String manufacturer,
                                                         final String category,
                                                         final String filmId,
                                                         final boolean includeHidden,
                                                         final int offset,
                                                         final int limit) {
        final FilmReferenceQueryResponse response = new FilmReferenceQueryResponse();
        final IndexedLibrary current = library;
        if (current == null) {
            response.setStatus("not-registered");
            response.setMessage("尚未关联本机 FilmArchive 目录");
            response.setOffset(Math.max(0, offset));
            response.setLimit(clampLimit(limit));
            return response;
        }
        response.setStatus("ok");
        response.setLibraryPath(current.root.toString());
        response.setCatalogSha256(current.catalogSha256);
        final String needle = normalize(query);
        final String manufacturerNeedle = normalize(manufacturer);
        final String categoryNeedle = normalize(category);
        final List<FilmReferenceDto> matched = new ArrayList<>();
        for (FilmReferenceDto reference : current.response.getReferences()) {
            if (!includeHidden && reference.isHidden()) continue;
            if (manufacturerNeedle != null
                    && !normalize(reference.getManufacturer()).contains(manufacturerNeedle)) continue;
            if (categoryNeedle != null
                    && !normalize(reference.getCategory()).contains(categoryNeedle)) continue;
            if (filmId != null && !filmId.isBlank()
                    && reference.getFilmLinks().stream()
                    .noneMatch(link -> filmId.equals(link.getFilmId()))) continue;
            if (needle != null && !matches(reference, needle)) continue;
            matched.add(reference);
        }
        matched.sort(Comparator.comparing((FilmReferenceDto value) -> safe(value.getManufacturer()))
                .thenComparing(value -> safe(value.getProduct()))
                .thenComparing(value -> safe(value.getTitle())));
        final int safeOffset = Math.max(0, offset);
        final int safeLimit = clampLimit(limit);
        response.setTotal(matched.size());
        response.setOffset(safeOffset);
        response.setLimit(safeLimit);
        response.setReferences(safeOffset >= matched.size()
                ? Collections.emptyList()
                : new ArrayList<>(matched.subList(safeOffset,
                Math.min(matched.size(), safeOffset + safeLimit))));
        return response;
    }

    private List<FilmReferenceDto> indexDocuments(final JsonNode documents, final Path docsRoot,
                                                   final String catalogSha, final Path root) {
        final List<FilmReferenceDto> result = new ArrayList<>();
        final Map<String, FilmReferenceDto> bySha = new HashMap<>();
        final List<FilmStockResponse> stocks = filmStockService.listFilmStocks();
        final Map<String, Set<String>> aliasesByNormalized = aliasIndex();
        for (int index = 0; index < documents.size(); index++) {
            final JsonNode node = documents.get(index);
            if (node == null || !node.isObject()) continue;
            final String upstreamPath = text(node, "relativePath") == null ? text(node, "path") : text(node, "relativePath");
            final String sourceUrl = text(node, "sourceUrl");
            final String title = text(node, "docTitle") == null ? text(node, "title") : text(node, "docTitle");
            final String manufacturer = text(node, "manufacturer");
            final String product = text(node, "product");
            final String category = text(node, "category");
            final String type = text(node, "docType") == null ? text(node, "type") : text(node, "docType");
            if (title == null && product == null && upstreamPath == null) continue;

            final FilmReferenceDto reference = new FilmReferenceDto();
            reference.setTitle(title == null ? fallbackTitle(upstreamPath, product) : title);
            reference.setManufacturer(manufacturer);
            reference.setCategory(category);
            reference.setProduct(product);
            reference.setType(type);
            reference.setSourceType(classifySource(type, title, upstreamPath));
            reference.setPages(node.path("pageCount").asInt(node.path("pages").asInt(0)));
            reference.setSizeBytes(node.path("sizeBytes").asLong(0));
            reference.setHidden(node.path("hidden").asBoolean(false));
            reference.setSourceUrl(sourceUrl);
            reference.setSourceHost(hostOf(sourceUrl));
            final String sourceKind = text(node, "sourceKind");
            reference.setAuthority("reprint".equals(sourceKind) ? "manufacturer-reprint"
                    : (node.has("relativePath") && !"official".equals(sourceKind)) ? "unknown-source"
                    : authority(manufacturer, sourceUrl));
            reference.setUpstreamCommit("3001b382");
            reference.setUpstreamPath(upstreamPath);
            reference.setUpstreamDocumentKey(sha256((catalogSha + "|" + String.valueOf(upstreamPath)
                    + "|" + String.valueOf(sourceUrl)).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            reference.setAvailability("unknown");

            final FileFacts file = resolveFile(docsRoot, root, upstreamPath);
            reference.setFileStatus(file.status);
            reference.setFilePath(file.path);
            reference.setFileSizeBytes(file.size);
            reference.setSha256(file.sha256);
            reference.setId(file.sha256 == null
                    ? "ref-cat-" + prefix(reference.getUpstreamDocumentKey())
                    : "ref-sha-" + prefix(file.sha256));
            findPublication(reference);
            if (text(node, "revision") != null) {
                reference.setPublicationNumber(text(node, "revision"));
                reference.setPublicationNumberSource("catalog-declared");
            }
            if (text(node, "date") != null) {
                reference.setPublicationDate(text(node, "date"));
                reference.setDateSource("catalog-declared");
            }
            final String declaredSha = text(node, "sha256");
            if (declaredSha != null && file.sha256 != null && !declaredSha.equalsIgnoreCase(file.sha256)) {
                reference.setFileStatus("checksum-mismatch");
                reference.setFilePath(null);
                reference.getEvidenceGaps().add("实际文件 SHA-256 与目录声明不一致，请核对资料版本");
            }
            if (node.path("productAliases").isArray()) {
                reference.setNote("上游别称：" + node.path("productAliases").toString());
            }
            linkFilms(reference, stocks, aliasesByNormalized);
            addGaps(reference);
            reference.setRevisionGroup("rev-" + prefix(sha256((normalize(sourceUrl) == null
                    ? normalize(reference.getManufacturer()) + "|" + normalize(reference.getTitle())
                    + "|" + normalize(reference.getType())
                    : normalize(sourceUrl)).getBytes(java.nio.charset.StandardCharsets.UTF_8))));
            reference.setRevisionCount(1);
            reference.getRevisionHashes().add(file.sha256 == null ? "missing" : file.sha256);

            final FilmReferenceDto existing = file.sha256 == null ? null : bySha.get(file.sha256);
            if (existing == null) {
                if (file.sha256 != null) bySha.put(file.sha256, reference);
                result.add(reference);
            } else {
                merge(existing, reference);
            }
        }
        decorateRevisions(result);
        return result;
    }

    private void merge(final FilmReferenceDto canonical, final FilmReferenceDto duplicate) {
        canonical.getMergedSources().add(new FilmReferenceDto.MergedSource(
                duplicate.getSourceUrl(), duplicate.getUpstreamPath()));
        final Set<String> existingFilms = new HashSet<>();
        for (FilmReferenceDto.FilmLink link : canonical.getFilmLinks()) existingFilms.add(link.getFilmId());
        for (FilmReferenceDto.FilmLink link : duplicate.getFilmLinks()) {
            if (existingFilms.add(link.getFilmId())) canonical.getFilmLinks().add(link);
        }
        for (String gap : duplicate.getEvidenceGaps()) {
            if (!canonical.getEvidenceGaps().contains(gap)) canonical.getEvidenceGaps().add(gap);
        }
        canonical.setNote((canonical.getNote() == null ? "" : canonical.getNote())
                + "已按 SHA-256 合并 " + safe(duplicate.getUpstreamPath()) + " 的来源；"
                + "正文近似仍需人工复核。");
    }

    private void decorateRevisions(final List<FilmReferenceDto> references) {
        final Map<String, List<FilmReferenceDto>> groups = new LinkedHashMap<>();
        for (FilmReferenceDto reference : references) {
            groups.computeIfAbsent(reference.getRevisionGroup(), key -> new ArrayList<>()).add(reference);
        }
        for (List<FilmReferenceDto> group : groups.values()) {
            if (group.size() <= 1) {
                group.get(0).setRevisionCount(1);
                continue;
            }
            final Set<String> hashes = new LinkedHashSet<>();
            for (FilmReferenceDto reference : group) hashes.add(reference.getSha256());
            for (FilmReferenceDto reference : group) {
                reference.setRevisionCount(group.size());
                reference.setRevisionHashes(new ArrayList<>(hashes));
                reference.getEvidenceGaps().add("同一来源存在 " + group.size()
                        + " 个修订/来源记录；保留全部，不覆盖旧版");
            }
        }
    }

    private FilmReferenceLibraryResponse buildResponse(final Path root, final Path catalogPath,
                                                       final JsonNode catalog, final String catalogSha,
                                                       final List<FilmReferenceDto> references,
                                                       final IndexedLibrary previous,
                                                       final String requestedPrevious) {
        final FilmReferenceLibraryResponse response = new FilmReferenceLibraryResponse();
        response.setStatus("ok");
        response.setLibraryPath(root.toString());
        final FilmReferenceLibraryResponse.Upstream upstream = new FilmReferenceLibraryResponse.Upstream();
        response.setUpstream(upstream);
        final FilmReferenceLibraryResponse.Catalog facts = new FilmReferenceLibraryResponse.Catalog();
        facts.setSchemaVersion(catalog.path("schemaVersion").asInt(1));
        facts.setGeneratedAt(text(catalog, "generatedAt"));
        facts.setSha256(catalogSha);
        facts.setDocuments(catalog.path("documents").size());
        int hidden = 0;
        for (JsonNode document : catalog.path("documents")) {
            if (document.path("hidden").asBoolean(false)) hidden++;
        }
        facts.setVisible(catalog.path("documents").size() - hidden);
        facts.setHidden(hidden);
        facts.setPath(catalogPath.toString());
        response.setCatalog(facts);
        response.setReferences(references);

        final FilmReferenceLibraryResponse.IndexStats stats = new FilmReferenceLibraryResponse.IndexStats();
        stats.setReferences(references.size());
        int present = 0;
        int missing = 0;
        int merged = 0;
        int links = 0;
        int unknownSource = 0;
        for (FilmReferenceDto reference : references) {
            if ("present".equals(reference.getFileStatus())) present++;
            else missing++;
            merged += reference.getMergedSources().size();
            links += reference.getFilmLinks().size();
            if ("unknown-source".equals(reference.getAuthority())) unknownSource++;
        }
        stats.setFilesPresent(present);
        stats.setFilesMissing(missing);
        stats.setMergedBySha256(merged);
        stats.setRevisionGroups((int) references.stream()
                .filter(reference -> reference.getRevisionCount() > 1)
                .map(FilmReferenceDto::getRevisionGroup).distinct().count());
        stats.setFilmLinks(links);
        stats.setUnknownSource(unknownSource);
        stats.setNotOnSaleInferred(0);
        stats.setIndexedAt(Instant.now().toString());
        response.setIndex(stats);
        response.setChanges(changes(catalogSha, references, previous, requestedPrevious));
        response.getWarnings().add("上游文档 ID/路径不作为胶片 ID；胶片关联只使用本项目胶片库");
        response.getWarnings().add("来源类型与 hidden 标记不代表胶片是否在售、是否已停产或曲线是否可用");
        response.getWarnings().add("未验证来源保持 unknown-source；PDF 使用本机关联，不随安装包分发");
        if (hidden > 0) {
            response.getWarnings().add(hidden + " 条记录在上游被标记 hidden；仍保留来源，不删除索引");
        }
        response.setGaps(gaps(references));
        return response;
    }

    private FilmReferenceLibraryResponse.Changes changes(
            final String catalogSha, final List<FilmReferenceDto> current,
            final IndexedLibrary previous, final String requestedPrevious) {
        final FilmReferenceLibraryResponse.Changes changes = new FilmReferenceLibraryResponse.Changes();
        changes.setCurrentCatalogSha256(catalogSha);
        final String previousSha = previous == null ? requestedPrevious : previous.catalogSha256;
        changes.setPreviousCatalogSha256(previousSha);
        changes.setCatalogChanged(previousSha != null && !previousSha.equals(catalogSha));
        if (previous == null) {
            changes.setUnchanged(0);
            return changes;
        }
        final Map<String, FilmReferenceDto> previousByKey = new HashMap<>();
        for (FilmReferenceDto reference : previous.response.getReferences()) {
            previousByKey.put(reference.getRevisionGroup() + "|" + reference.getSha256(), reference);
        }
        final Set<String> currentKeys = new HashSet<>();
        int unchanged = 0;
        for (FilmReferenceDto reference : current) {
            final String key = reference.getRevisionGroup() + "|" + reference.getSha256();
            currentKeys.add(key);
            final FilmReferenceDto before = previousByKey.get(key);
            if (before == null) {
                final FilmReferenceDto sameGroup = previous.response.getReferences().stream()
                        .filter(old -> old.getRevisionGroup().equals(reference.getRevisionGroup()))
                        .findFirst().orElse(null);
                if (sameGroup == null) changes.getAdded().add(reference.getId());
                else changes.getChanged().add(reference.getId());
            } else {
                unchanged++;
            }
        }
        for (FilmReferenceDto before : previous.response.getReferences()) {
            if (!currentKeys.contains(before.getRevisionGroup() + "|" + before.getSha256())) {
                final boolean stillPresent = current.stream().anyMatch(reference ->
                        reference.getRevisionGroup().equals(before.getRevisionGroup()));
                if (!stillPresent) changes.getRemoved().add(before.getId());
            }
        }
        for (FilmReferenceDto reference : current) {
            if (reference.getRevisionCount() > 1) changes.getNewRevisions().add(reference.getId());
        }
        changes.setUnchanged(unchanged);
        return changes;
    }

    private static List<String> gaps(final List<FilmReferenceDto> references) {
        int missing = 0;
        int noUrl = 0;
        int noPublication = 0;
        int noDate = 0;
        int noFilm = 0;
        for (FilmReferenceDto reference : references) {
            if (!"present".equals(reference.getFileStatus())) missing++;
            if (reference.getSourceUrl() == null) noUrl++;
            if (reference.getPublicationNumber() == null) noPublication++;
            if (reference.getPublicationDate() == null) noDate++;
            if (reference.getFilmLinks().isEmpty()) noFilm++;
        }
        final List<String> gaps = new ArrayList<>();
        if (missing > 0) gaps.add(missing + " 条文献缺少本机文件；保留索引与来源链接，不伪造正文");
        if (noUrl > 0) gaps.add(noUrl + " 条文献没有原始来源网址");
        if (noPublication > 0) gaps.add(noPublication + " 条文献未能从目录字段确认出版号");
        if (noDate > 0) gaps.add(noDate + " 条文献未能从目录字段确认出版日期");
        if (noFilm > 0) gaps.add(noFilm + " 条文献未建立胶片关联；目录分类不等于胶片身份");
        return gaps;
    }

    private static void addGaps(final FilmReferenceDto reference) {
        if (!"present".equals(reference.getFileStatus())) {
            reference.getEvidenceGaps().add("本机缺少可读取文件，只有目录/来源事实");
        }
        if (reference.getSourceUrl() == null) {
            reference.getEvidenceGaps().add("缺少原始来源网址");
        } else if ("unknown-source".equals(reference.getAuthority())) {
            reference.getEvidenceGaps().add("来源无法确认为厂家官方，按未知来源保留");
        }
        if (reference.getPublicationNumber() == null) {
            reference.getEvidenceGaps().add("出版号未确认");
        }
        if (reference.getPublicationDate() == null) {
            reference.getEvidenceGaps().add("出版日期未确认");
        }
        if ("technical-data".equals(reference.getSourceType())) {
            reference.getEvidenceGaps().add("技术资料存在不等于曲线已数字化或已通过校色验证");
        }
        if (reference.isHidden()) {
            reference.getEvidenceGaps().add("上游 hidden 只表示展示选择，不是删除来源的理由");
        }
    }

    private static void findPublication(final FilmReferenceDto reference) {
        final String haystack = safe(reference.getTitle()) + " " + safe(reference.getUpstreamPath())
                + " " + safe(reference.getSourceUrl());
        final Matcher matcher = PUBLICATION.matcher(haystack);
        if (matcher.find()) {
            reference.setPublicationNumber(matcher.group(1).toUpperCase(Locale.ROOT));
            reference.setPublicationNumberSource("filename-or-url-heuristic");
        }
        final Matcher date = DATE.matcher(haystack);
        if (date.find()) {
            reference.setPublicationDate(date.group(1));
            reference.setDateSource("filename-or-url-heuristic");
        }
    }

    private static void linkFilms(final FilmReferenceDto reference,
                                  final List<FilmStockResponse> stocks,
                                  final Map<String, Set<String>> aliasesByNormalized) {
        final String haystack = normalize(safe(reference.getProduct()) + " "
                + safe(reference.getTitle()) + " " + safe(reference.getUpstreamPath()));
        final Set<String> seen = new HashSet<>();
        for (FilmStockResponse stock : stocks) {
            final Set<String> names = new HashSet<>();
            names.add(stock.getName());
            names.add(stock.getName().replace(" ", ""));
            if (haystack.contains(normalize(stock.getName()))) {
                if (seen.add(stock.getId())) {
                    reference.getFilmLinks().add(new FilmReferenceDto.FilmLink(
                            stock.getId(), stock.getBrand() + " " + stock.getName(),
                            "product-name", "unverified", null));
                }
            }
        }
        // 玩家别称映射到已知胶片名称，再关联；别称只帮助检索。
        for (Map.Entry<String, Set<String>> alias : aliasesByNormalized.entrySet()) {
            if (!haystack.contains(alias.getKey())) continue;
            for (FilmStockResponse stock : stocks) {
                if (!alias.getValue().contains(normalize(stock.getName()))) continue;
                if (seen.add(stock.getId())) {
                    reference.getFilmLinks().add(new FilmReferenceDto.FilmLink(
                            stock.getId(), stock.getBrand() + " " + stock.getName(),
                            "player-alias", "unverified", alias.getKey()));
                }
            }
        }
    }

    private static Map<String, Set<String>> aliasIndex() {
        final Map<String, Set<String>> result = new HashMap<>();
        for (Map.Entry<String, String> entry : ALIASES.entrySet()) {
            result.computeIfAbsent(normalize(entry.getKey()), key -> new HashSet<>())
                    .add(normalize(entry.getValue()));
        }
        return result;
    }

    private static boolean matches(final FilmReferenceDto reference, final String needle) {
        final String haystack = normalize(safe(reference.getTitle()) + " "
                + safe(reference.getProduct()) + " " + safe(reference.getManufacturer()) + " "
                + safe(reference.getCategory()) + " " + safe(reference.getType()) + " "
                + safe(reference.getSourceUrl()) + " " + safe(reference.getNote()) + " "
                + safe(reference.getPublicationNumber()));
        if (haystack.contains(needle)) return true;
        for (Map.Entry<String, String> alias : ALIASES.entrySet()) {
            if (normalize(alias.getKey()).equals(needle)
                    && haystack.contains(normalize(alias.getValue()))) return true;
        }
        return false;
    }

    private static FileFacts resolveFile(final Path docsRoot, final Path root,
                                         final String upstreamPath) {
        if (upstreamPath == null || upstreamPath.isBlank()) {
            return new FileFacts("missing", null, 0, null);
        }
        final String normalized = upstreamPath.replace('\\', '/');
        // GitHub 目录相对根目录，旧网站目录相对 Docs；两者不能叠加 Docs/Docs。
        final Path resolved = normalized.startsWith("Docs/") || normalized.startsWith("docs/")
                ? root.resolve(normalized).normalize() : docsRoot.resolve(normalized).normalize();
        if (!resolved.startsWith(root) || !resolved.startsWith(docsRoot)) {
            return new FileFacts("unsafe-path", null, 0, null);
        }
        if (!Files.isRegularFile(resolved) || !Files.isReadable(resolved)) {
            return new FileFacts("missing", resolved.toString(), 0, null);
        }
        try {
            final Path realRoot = root.toRealPath();
            final Path realDocs = docsRoot.toRealPath();
            final Path real = resolved.toRealPath();
            if (!real.startsWith(realRoot) || !real.startsWith(realDocs)) {
                return new FileFacts("unsafe-path", null, 0, null);
            }
            final long size = Files.size(real);
            return new FileFacts("present", real.toString(), size, sha256File(real));
        } catch (IOException exception) {
            return new FileFacts("missing", resolved.toString(), 0, null);
        }
    }

    /** 文献 PDF 可能较大；按流计算 SHA-256，不读入整份文件。 */
    private static String sha256File(final Path file) throws IOException {
        try (InputStream input = Files.newInputStream(file)) {
            final MessageDigest digest = MessageDigest.getInstance("SHA-256");
            final byte[] buffer = new byte[1024 * 1024];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (read > 0) digest.update(buffer, 0, read);
            }
            final StringBuilder result = new StringBuilder(64);
            for (byte datum : digest.digest()) result.append(String.format(Locale.ROOT, "%02x", datum));
            return result.toString();
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }

    private static Path catalogPath(final Path root) {
        final Path direct = root.resolve("catalog.json");
        if (Files.isRegularFile(direct)) return direct;
        final Path docs = root.resolve("Docs").resolve("catalog.json");
        if (Files.isRegularFile(docs)) return docs;
        final Path data = root.resolve("docs").resolve("catalog.json");
        if (Files.isRegularFile(data)) return data;
        return null;
    }

    private static Path chooseDocsRoot(final Path root) {
        final Path docs = root.resolve("Docs");
        if (Files.isDirectory(docs)) return docs;
        final Path lower = root.resolve("docs");
        if (Files.isDirectory(lower)) return lower;
        return root;
    }

    private static String classifySource(final String type, final String title,
                                         final String path) {
        final String haystack = normalize(safe(type) + " " + safe(title) + " " + safe(path));
        if (haystack.contains("faq")) return "faq";
        if (haystack.contains("press") || haystack.contains("release")
                || haystack.contains("news")) return "press-release";
        if (haystack.contains("order") || haystack.contains("price")) return "order-form";
        if (haystack.contains("technical") || haystack.contains("tech sheet")
                || haystack.contains("datasheet") || haystack.contains("data sheet")
                || haystack.contains("characteristic")) return "technical-data";
        if (haystack.contains("processing") || haystack.contains("developer")
                || haystack.contains("chemistry")) return "processing";
        if (haystack.contains("paper")) return "paper";
        return "product-documentation";
    }

    private static String authority(final String manufacturer, final String sourceUrl) {
        if (sourceUrl == null || sourceUrl.isBlank()) return "unknown-source";
        final String host = hostOf(sourceUrl);
        if (host == null) return "unknown-source";
        final String normalizedHost = host.toLowerCase(Locale.ROOT);
        for (String domain : java.util.List.of("kodakprofessional.com", "kodak.com", "fujifilm.com",
                "ilfordphoto.com", "ilfordphoto.com.cn", "harmanphoto.co.uk", "foma.cz",
                "fotoimpex.com", "rolleianalog.com")) {
            if (normalizedHost.equals(domain) || normalizedHost.endsWith("." + domain)) {
                return "manufacturer-document";
            }
        }
        return "third-party-or-unknown";
    }

    private static String hostOf(final String sourceUrl) {
        if (sourceUrl == null || sourceUrl.isBlank()) return null;
        try {
            return URI.create(sourceUrl).getHost();
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private static String fallbackTitle(final String upstreamPath, final String product) {
        if (product != null && !product.isBlank()) return product;
        if (upstreamPath == null || upstreamPath.isBlank()) return "未命名文献";
        final int slash = upstreamPath.lastIndexOf('/');
        return slash < 0 ? upstreamPath : upstreamPath.substring(slash + 1);
    }

    private static String text(final JsonNode node, final String field) {
        final JsonNode value = node.get(field);
        if (value == null || value.isNull()) return null;
        final String text = value.asText();
        return text == null || text.isBlank() ? null : text;
    }

    private static String normalize(final String value) {
        if (value == null || value.isBlank()) return null;
        return value.toLowerCase(Locale.ROOT)
                .replace("炮塔", "portra")
                .replaceAll("[^a-z0-9\\u4e00-\\u9fff]+", "");
    }

    private static String safe(final String value) {
        return value == null ? "" : value;
    }

    private static int clampLimit(final int limit) {
        if (limit <= 0) return 50;
        return Math.min(200, limit);
    }

    private static String prefix(final String value) {
        return value == null || value.length() < 16 ? String.valueOf(value) : value.substring(0, 16);
    }

    private static String sha256(final byte[] value) {
        try {
            final byte[] digest = MessageDigest.getInstance("SHA-256").digest(value);
            final StringBuilder result = new StringBuilder(64);
            for (byte datum : digest) result.append(String.format(Locale.ROOT, "%02x", datum));
            return result.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }

    private static final class FileFacts {
        private final String status;
        private final String path;
        private final long size;
        private final String sha256;

        private FileFacts(final String status, final String path, final long size,
                          final String sha256) {
            this.status = status;
            this.path = path;
            this.size = size;
            this.sha256 = sha256;
        }
    }

    private static final class IndexedLibrary {
        private final Path root;
        private final String catalogSha256;
        private final Path docsRoot;
        private final FilmReferenceLibraryResponse response;

        private IndexedLibrary(final Path root, final String catalogSha256,
                               final Path docsRoot, final FilmReferenceLibraryResponse response) {
            this.root = root;
            this.catalogSha256 = catalogSha256;
            this.docsRoot = docsRoot;
            this.response = response;
        }
    }
}
