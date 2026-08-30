package com.camborder.app.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 本地开发 CORS 配置。
 * 仅放行 Vite 本地开发服务器的两个 origin，方便浏览器开发页直接调用本地 Java 引擎。
 * 生产 Electron 页走 app:// 安全代理，不在这里放行 app:// 或任意外部 origin。
 */
@Configuration
public class DevCorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(final CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(
                        "http://localhost:5174",
                        "http://127.0.0.1:5174"
                )
                .allowedMethods("GET", "POST", "DELETE", "OPTIONS")
                .allowedHeaders("Content-Type", "Accept")
                .allowCredentials(false);
        registry.addMapping("/previews/**")
                .allowedOrigins(
                        "http://localhost:5174",
                        "http://127.0.0.1:5174"
                )
                .allowedMethods("GET", "POST", "DELETE", "OPTIONS")
                .allowedHeaders("Content-Type", "Accept")
                .allowCredentials(false);
    }
}
