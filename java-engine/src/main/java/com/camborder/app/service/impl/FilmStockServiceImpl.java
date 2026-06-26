package com.camborder.app.service.impl;

import com.camborder.app.dto.FilmStockResponse;
import com.camborder.app.service.FilmStockService;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 内置胶片库服务实现（service.impl 层）。
 * 返回首版 15 款常见胶片，按品牌名称、ISO 升序排序。
 */
@Service
public final class FilmStockServiceImpl implements FilmStockService {

    private static final List<FilmStockResponse> FILM_STOCKS = List.of(
            new FilmStockResponse("kodak-gold-200", "Kodak", "Gold 200", 200,
                    "Color Negative", "warm", false),
            new FilmStockResponse("kodak-portra-160", "Kodak", "Portra 160", 160,
                    "Color Negative", "neutral", false),
            new FilmStockResponse("kodak-portra-400", "Kodak", "Portra 400", 400,
                    "Color Negative", "neutral", false),
            new FilmStockResponse("kodak-portra-800", "Kodak", "Portra 800", 800,
                    "Color Negative", "warm", false),
            new FilmStockResponse("kodak-ektar-100", "Kodak", "Ektar 100", 100,
                    "Color Negative", "vivid", false),
            new FilmStockResponse("kodak-tri-x-400", "Kodak", "Tri-X 400", 400,
                    "Black & White", "classic", false),
            new FilmStockResponse("fujifilm-c200", "Fujifilm", "C200", 200,
                    "Color Negative", "cool", false),
            new FilmStockResponse("fujifilm-superia-100", "Fujifilm", "Superia 100", 100,
                    "Color Negative", "cool", false),
            new FilmStockResponse("fujifilm-pro-400h", "Fujifilm", "Pro 400H", 400,
                    "Color Negative", "pastel", true),
            new FilmStockResponse("fujifilm-acros-100", "Fujifilm", "Neopan Acros 100", 100,
                    "Black & White", "fine-grain", false),
            new FilmStockResponse("cinestill-400d", "CineStill", "400D", 400,
                    "Color Negative", "cinematic", false),
            new FilmStockResponse("cinestill-800t", "CineStill", "800T", 800,
                    "Color Negative", "tungsten", false),
            new FilmStockResponse("ilford-hp5-plus", "Ilford", "HP5 Plus", 400,
                    "Black & White", "classic", false),
            new FilmStockResponse("ilford-fp4-plus", "Ilford", "FP4 Plus", 125,
                    "Black & White", "fine-grain", false),
            new FilmStockResponse("ilford-delta-400", "Ilford", "Delta 400", 400,
                    "Black & White", "modern", false)
    );

    @Override
    public List<FilmStockResponse> listFilmStocks() {
        return FILM_STOCKS.stream()
                .sorted(Comparator.comparing(FilmStockResponse::getBrand)
                        .thenComparing(FilmStockResponse::getIso))
                .collect(Collectors.toList());
    }
}
