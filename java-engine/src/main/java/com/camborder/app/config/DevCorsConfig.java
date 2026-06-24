package com.camborder.app.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 本地开发 CORS 配置。
 * 仅放行前端本地开发服务器常用的两个 origin，方便浏览器页面直接调用本地 Java 引擎。
 * 不开放成任意 origin，避免被当作公网策略。
 */
@Configuration
public class DevCorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(final CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(
                        "http://localhost:5173",
                        "http://127.0.0.1:5173"
                )
                .allowedMethods("GET", "POST");
    }
}
