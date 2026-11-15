#!/usr/bin/env python3
"""从已核验厂家 PDF 提取特性曲线；输出研究数据，不自动产生渲染参数。"""
import argparse
import hashlib
import json
from pathlib import Path
import fitz
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SPECS = [
    ('kodak-gold-200', 'kodak-gold-200-e7022-2022.pdf', [33, 34, 35], [81.676, 71.925, 266.184, 256.433], [-3, 1], 'E-7022 / March 2022'),
    ('kodak-portra-160', 'kodak-portra-160-e4051-2025.pdf', [31, 32, 33], [81.45, 102.119, 266.008, 286.599], [-4, 1], 'E-4051 / January 2025'),
    ('kodak-portra-400', 'kodak-portra-400-e4050-2025.pdf', [34, 35, 36], [81.163, 102.853, 265.612, 287.368], [-4, 1], 'E-4050 / January 2025'),
]

def extract(directory):
    datasets = []
    for film_id, filename, paths, frame, domain, revision in SPECS:
        source = directory / filename
        page = fitz.open(source)[3]
        drawings = page.get_drawings()
        channels = {}
        residuals = {}
        for channel, path_index in zip(['blue', 'green', 'red'], paths):
            samples = []
            for item in drawings[path_index]['items']:
                if item[0] == 'l':
                    samples.extend([tuple(item[1]), tuple(item[2])])
                elif item[0] == 'c':
                    p = np.array([tuple(v) for v in item[1:]])
                    for t in np.linspace(0, 1, 33):
                        samples.append((1-t)**3*p[0] + 3*(1-t)**2*t*p[1] + 3*(1-t)*t*t*p[2] + t**3*p[3])
                else:
                    raise ValueError('曲线路径含未支持的图元')
            p = np.array(samples)
            assert np.min(np.diff(p[:, 0])) > -0.01, '曝光轴路径回退，必须人工复核'
            x = domain[0] + (p[:, 0]-frame[0])/(frame[2]-frame[0])*(domain[1]-domain[0])
            y = (frame[3]-p[:, 1])/(frame[3]-frame[1])*4
            ux, indices = np.unique(x, return_index=True)
            uy = y[indices]
            knots = np.linspace(ux.min(), ux.max(), 65)
            values = np.interp(knots, ux, uy)
            residuals[channel] = float(np.max(np.abs(np.interp(ux, knots, values)-uy)))
            assert residuals[channel] < 0.02
            channels[channel] = [[round(float(a), 6), round(float(b), 6)] for a, b in zip(knots, values)]
        datasets.append(dict(filmId=film_id, publication=revision, sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
            sourceFile=filename, page=4, method='pdf-vector-bezier', plotFramePdfPoints=frame,
            axis={'x': 'log10 H (lux-seconds)', 'y': 'Status M optical density'}, process='C-41', exposure='Daylight',
            status='extracted-unvalidated', modelReady=False, densityReadingUncertainty=0.02,
            interpolationResidualDensity=residuals, channels=channels))
    source = directory / 'fujicolor-c200-af3-0249e.pdf'
    # 原表第 6 页栅格图的人工读数；包括栅格分辨率、线宽与读数误差，不能伪装成矢量精度。
    anchors = [-3.5, -3, -2.5, -2, -1.5, -1, -0.5, 0]
    datasets.append(dict(filmId='fujifilm-c200', publication='AF3-0249E / May 2017', page=6,
        sourceFile=source.name, sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), method='raster-manual-estimate',
        axis={'x': 'log10 H (lux-seconds)', 'y': 'Status M optical density'}, process='CN-16', exposure='Daylight, 1/125 second',
        status='estimated-awaiting-independent-review', modelReady=False, densityReadingUncertainty=0.08,
        channels={c: list(map(list, zip(anchors, ys))) for c, ys in {
            'red': [.10, .15, .28, .51, .77, 1.08, 1.39, 1.69],
            'green': [.41, .42, .56, .83, 1.13, 1.45, 1.77, 2.12],
            'blue': [.71, .74, .88, 1.16, 1.50, 1.83, 2.15, 2.49]}.items()},
        readingNotes='复核第6页2倍渲染，密度轴像素y=578(0D)、235(4D)，曝光轴x=165(-4)、512(0)；通道线与文字交叠处人工排除。'))
    return {'schemaVersion': 1, 'purpose': '特性曲线研究；Status M 不等于扫描 RGB，不直接作为校色 LUT', 'datasets': datasets}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'docs/film-characteristic-curves.json')
    args = parser.parse_args()
    data = extract(args.source_dir)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
    bundle = ROOT/'java-engine/src/main/resources/film-reference-index.json'
    index = json.loads(bundle.read_text())
    index['characteristicCurveDatasets'] = data['datasets']
    bundle.write_text(json.dumps(index, ensure_ascii=False, indent=2)+'\n')
    print('已提取', len(data['datasets']), '组曲线；模型尚未标定')
