package com.camborder.app.service.impl;

import com.camborder.app.service.MetadataFormatService;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 文本变量格式化服务实现（service.impl 层）。
 * 将 {Camera}、{Lens} 等变量占位符替换为实际值，
 * 然后清理因缺失值导致的多余分隔符（如 " ·  · "）。
 *
 * 变量替换规则：
 * - 已知变量（如 {Camera}）：metadata 中有值则替换，无值则替换为空字符串
 * - 未知变量（如 {FooBar}）：保留原样，避免误删用户文本
 * - 模板为空或空白时返回空字符串
 */
@Service
public final class MetadataFormatServiceImpl implements MetadataFormatService {

    /** 匹配 {VariableName} 变量占位符。 */
    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\{([A-Za-z]+)}");

    /** 已知变量名集合（小写），与 PhotoIdentity 契约一致。 */
    private static final Set<String> KNOWN_VARIABLES = Set.of(
            "camera", "lens", "film", "developer", "scanner",
            "lab", "location", "rollname", "framenumber",
            "filmbrand", "filmiso", "filmtype", "make", "model",
            "focallength", "fnumber", "exposuretime", "iso",
            "datetimeoriginal", "filmname"
    );

    /** 清理因缺失变量导致的连续分隔符，例如 " ·  · " → " · "。按行处理，不跨行匹配。 */
    private static final Pattern CONSECUTIVE_SEPARATORS = Pattern.compile(
            "([ \\t]*[·|][ \\t]*){2,}"
    );

    /** 清理开头或结尾的分隔符。 */
    private static final Pattern LEADING_SEPARATOR = Pattern.compile("^([ \\t]*[·|][ \\t]*)+", Pattern.MULTILINE);
    private static final Pattern TRAILING_SEPARATOR = Pattern.compile("([ \\t]*[·|][ \\t]*)+$", Pattern.MULTILINE);

    @Override
    public String format(final String template, final Map<String, String> metadata) {
        if (template == null || template.isBlank()) {
            return "";
        }

        final Map<String, String> safeMetadata = metadata == null ? Map.of() : metadata;

        // 第一步：替换变量占位符
        // 规则：已知变量 → 替换为值或空字符串；未知变量 → 保留原样
        final Matcher matcher = VARIABLE_PATTERN.matcher(template);
        final StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            final String varName = matcher.group(1);
            final boolean isKnown = KNOWN_VARIABLES.contains(varName.toLowerCase());
            if (isKnown) {
                // 已知变量：从 metadata 中取值，缺失则为空字符串
                final String value = safeMetadata.entrySet().stream()
                        .filter(e -> e.getKey().equalsIgnoreCase(varName))
                        .findFirst()
                        .map(Map.Entry::getValue)
                        .orElse("");
                // Matcher.quoteReplacement 防止值中的 $ 或 \ 被当作替换特殊字符
                matcher.appendReplacement(result, Matcher.quoteReplacement(value));
            }
            // 未知变量不调用 appendReplacement，保留原样
        }
        matcher.appendTail(result);

        // 第二步：清理多余分隔符
        String cleaned = result.toString();
        // 连续分隔符折叠为单个 " · "（保留一个分隔符）
        cleaned = CONSECUTIVE_SEPARATORS.matcher(cleaned).replaceAll(" · ");
        // 去掉开头和结尾的分隔符
        cleaned = LEADING_SEPARATOR.matcher(cleaned).replaceAll("");
        cleaned = TRAILING_SEPARATOR.matcher(cleaned).replaceAll("");
        // 清理多余空格（不处理换行符，保留换行结构）
        cleaned = cleaned.replaceAll("[ \\t]{2,}", " ").trim();

        // 如果原始模板包含换行符，说明用户想要多行布局，
        // 清理因缺失变量导致的空行
        if (template.contains("\n")) {
            // 按行拆分，过滤空行，重新拼接
            String[] lines = cleaned.split("\n", -1);
            StringBuilder multiline = new StringBuilder();
            boolean first = true;
            for (String line : lines) {
                String trimmed = line.trim();
                if (trimmed.isEmpty()) {
                    continue;
                }
                if (!first) {
                    multiline.append("\n");
                }
                multiline.append(trimmed);
                first = false;
            }
            return multiline.toString();
        }

        return cleaned;
    }
}
