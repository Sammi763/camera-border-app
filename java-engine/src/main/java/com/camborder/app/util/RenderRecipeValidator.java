package com.camborder.app.util;

import com.camborder.app.exception.ApiException;
import com.camborder.app.model.ImagePlacement;
import com.camborder.app.model.RenderRecipe;
import org.springframework.http.HttpStatus;

import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;

/**
 * RenderRecipe v2 的请求校验。
 *
 * 预览与导出必须使用同一套 imagePlacement 合法性规则，避免一条链路接受
 * 无效几何、另一条链路才在渲染阶段失败。
 */
public final class RenderRecipeValidator {

    private RenderRecipeValidator() {
    }

    /** 校验图片放置配置；旧请求缺失 imagePlacement 时使用模型默认值。 */
    public static void validateImagePlacement(final RenderRecipe recipe, final String prefix) {
        if (recipe == null) {
            throw new ApiException(prefix + "recipe is required", HttpStatus.BAD_REQUEST);
        }
        final ImagePlacement placement = recipe.getImagePlacement();
        final String mode = placement.getMode();
        if (!"fit".equals(mode) && !"fill".equals(mode)) {
            throw new ApiException(prefix + "imagePlacement.mode must be fit or fill", HttpStatus.BAD_REQUEST);
        }
        if (!Double.isFinite(placement.getFocalX())
                || placement.getFocalX() < 0 || placement.getFocalX() > 1) {
            throw new ApiException(prefix + "imagePlacement.focalX must be between 0 and 1", HttpStatus.BAD_REQUEST);
        }
        if (!Double.isFinite(placement.getFocalY())
                || placement.getFocalY() < 0 || placement.getFocalY() > 1) {
            throw new ApiException(prefix + "imagePlacement.focalY must be between 0 and 1", HttpStatus.BAD_REQUEST);
        }
        if (!Double.isFinite(placement.getRotation())) {
            throw new ApiException(prefix + "imagePlacement.rotation must be finite", HttpStatus.BAD_REQUEST);
        }
        final Double ratio = placement.getTargetAspectRatio();
        if (ratio != null && (!Double.isFinite(ratio) || ratio <= 0)) {
            throw new ApiException(prefix + "imagePlacement.targetAspectRatio must be positive", HttpStatus.BAD_REQUEST);
        }

        if (recipe.getLogo() != null && recipe.getLogo().getImagePath() != null
                && !recipe.getLogo().getImagePath().isBlank()) {
            final String logoPath = recipe.getLogo().getImagePath().trim();
            if (!logoPath.toLowerCase().endsWith(".png")) {
                throw new ApiException(prefix + "logo.imagePath must be a PNG file", HttpStatus.BAD_REQUEST);
            }
            try {
                final Path path = Path.of(logoPath);
                if (!Files.isRegularFile(path) || !Files.isReadable(path)) {
                    throw new ApiException(prefix + "logo.imagePath must point to a readable file", HttpStatus.BAD_REQUEST);
                }
            } catch (InvalidPathException exception) {
                throw new ApiException(prefix + "logo.imagePath is invalid", HttpStatus.BAD_REQUEST);
            }
        }
    }
}
