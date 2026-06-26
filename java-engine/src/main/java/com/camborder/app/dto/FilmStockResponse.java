package com.camborder.app.dto;

/**
 * 内置胶片库响应 DTO。
 * 用于 GET /api/assets/film-stocks，返回胶片的基本信息。
 */
public final class FilmStockResponse {

    private final String id;
    private final String brand;
    private final String name;
    private final int iso;
    private final String type;
    private final String colorProfile;
    private final boolean discontinued;

    public FilmStockResponse(final String id, final String brand, final String name,
                             final int iso, final String type,
                             final String colorProfile, final boolean discontinued) {
        this.id = id;
        this.brand = brand;
        this.name = name;
        this.iso = iso;
        this.type = type;
        this.colorProfile = colorProfile;
        this.discontinued = discontinued;
    }

    public String getId() {
        return id;
    }

    public String getBrand() {
        return brand;
    }

    public String getName() {
        return name;
    }

    public int getIso() {
        return iso;
    }

    public String getType() {
        return type;
    }

    public String getColorProfile() {
        return colorProfile;
    }

    public boolean isDiscontinued() {
        return discontinued;
    }
}
