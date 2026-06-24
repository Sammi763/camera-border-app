package com.camborder.app.service.impl;

import com.camborder.app.dto.FilmFormatBorder;
import com.camborder.app.dto.FilmFormatResponse;
import com.camborder.app.service.FilmFormatService;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 画幅默认值服务实现（service.impl 层）。
 * 返回固定画幅枚举，每个画幅附带宽高比与推荐边框。
 * 仅作为前端切换画幅时填充边框默认值的建议，后端不强制应用。
 *
 * 推荐边框为常用摄影排版经验值（像素），用户可手动覆盖。
 */
@Service
public final class FilmFormatServiceImpl implements FilmFormatService {

    /** 固定画幅枚举（顺序即返回顺序）。 */
    private static final List<FilmFormatResponse> FILM_FORMATS = List.of(
            new FilmFormatResponse("half-frame", "半格", "18:24",
                    new FilmFormatBorder(40, 120, 40, 40)),
            new FilmFormatResponse("135", "135", "36:24",
                    new FilmFormatBorder(40, 80, 40, 40)),
            new FilmFormatResponse("645", "645", "56:42",
                    new FilmFormatBorder(40, 80, 40, 40)),
            new FilmFormatResponse("6x6", "6×6", "56:56",
                    new FilmFormatBorder(60, 60, 60, 60)),
            new FilmFormatResponse("6x7", "6×7", "70:56",
                    new FilmFormatBorder(50, 70, 50, 50)),
            new FilmFormatResponse("6x8", "6×8", "80:56",
                    new FilmFormatBorder(50, 70, 50, 50)),
            new FilmFormatResponse("6x9", "6×9", "90:56",
                    new FilmFormatBorder(50, 80, 50, 50)),
            new FilmFormatResponse("6x12", "6×12", "120:56",
                    new FilmFormatBorder(50, 90, 50, 50))
    );

    @Override
    public List<FilmFormatResponse> listFilmFormats() {
        return FILM_FORMATS;
    }
}
