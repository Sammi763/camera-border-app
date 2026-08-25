package com.camborder.app.service;

import com.camborder.app.exception.PreviewGenerationException;

import java.awt.image.BufferedImage;

/**
 * RAW 真实显影服务接口。
 *
 * 第一版定义：读取真实 RAW 传感器数据，由外部 LibRaw 原生程序完成默认显影
 * （不提供曝光/白平衡/曲线等用户调节）。通过受控子进程调用：
 * - 超时：终止解码进程并抛受控异常；
 * - 失败：携带 stderr 摘要的受控异常（调用方降级为嵌入预览并说明原因）；
 * - 临时文件：解码输出写入临时文件，读取后无论成败一律清理；
 * - 缓存：按「路径 + 修改时间」缓存解码结果，避免重复显影。
 *
 * 实现类：{@code LibRawCliDevelopServiceImpl}。
 * Frontend 不直接调用 LibRaw——引擎是唯一入口（ARCHITECTURE.md §1）。
 */
public interface RawDevelopService {

    /**
     * 是否已配置可用的 LibRaw 原生程序。
     * 未配置时调用方应直接走嵌入预览降级路径，并在 sourceDecode.warning 说明原因。
     */
    boolean isConfigured();

    /**
     * 对指定 RAW 文件执行默认显影，返回解码图像。
     *
     * @param rawPath RAW 文件绝对路径
     * @return 解码后的图像
     * @throws PreviewGenerationException 显影超时、进程失败或输出不可解码时抛出（附中文原因）
     */
    BufferedImage develop(String rawPath);
}
