#!/usr/bin/env python3
"""真实 FFF/TIFF 配准候选与留出实验。只读源文件，原生域不假定 gamma/ICC。"""
import argparse, hashlib, json, plistlib
from pathlib import Path
import numpy as np
from PIL import Image


def raw_map(path):
    image = Image.open(path)
    tags = image.tag_v2
    if tags.get(259, 1) != 1 or tags[277] != 3 or tuple(tags[258]) != (16, 16, 16) or len(tags[273]) != 1:
        raise ValueError('只接受已核验的单条带未压缩 RGB16')
    with path.open('rb') as stream:
        endian = '>' if stream.read(2) == b'MM' else '<'
    pixels = np.memmap(path, dtype=endian+'u2', mode='r', offset=tags[273][0], shape=(image.height, image.width, 3))
    return image, pixels


def history(image):
    data = image.tag_v2[50457]
    # plistlib 不访问 DTD 或展开外部实体；只接受有界本地私有字段。
    if len(data) > 4_000_000 or b'<!ENTITY' in data: raise ValueError('私有 XML 超出限制')
    return plistlib.loads(data[data.index(b'<?xml'):data.index(b'</plist>')+8])['ImageSettings']


def sample(fff, settings, tif):
    image, source = raw_map(fff)
    target_image, target = raw_map(tif)
    description = settings['ImageDescription']
    u, v = np.meshgrid(np.linspace(.03, .97, 80), np.linspace(.03, .97, 80))
    # 主图原生采样率候选来自历史裁切与目标尺寸；几何独立用通道秩相关检查。
    rotation = description.get('Rotation', 0)
    tx = (u * (target_image.width-1)).astype(int); ty = (v * (target_image.height-1)).astype(int)
    if rotation == 180: u, v = 1-u, 1-v
    elif rotation != 0: raise ValueError('旋转尚未核验')
    scale_x = target_image.width/(description['CropRight']-description['CropLeft'])
    scale_y = target_image.height/(description['CropBottom']-description['CropTop'])
    # 已存在目标数据不能提供扫描器物理线性真值，只用于对齐候选。
    x = np.rint((description['CropLeft'] + u*(description['CropRight']-description['CropLeft']))*scale_x).astype(int)
    y = np.rint((description['CropTop'] + v*(description['CropBottom']-description['CropTop']))*scale_y).astype(int)
    if x.max() >= image.width or y.max() >= image.height or x.min() < 0 or y.min() < 0: raise ValueError('裁切越界')
    a, b = np.array(source[y, x], dtype=float).reshape(-1, 3)/65535, np.array(target[ty, tx], dtype=float).reshape(-1, 3)/65535
    rank = lambda z: np.argsort(np.argsort(z))
    correlations = [float(np.corrcoef(rank(a[:,c]), rank(b[:,c]))[0,1]) for c in range(3)]
    return a, b, correlations


def fit(x, y):
    curves = []
    for c in range(3):
        order = np.argsort(x[:,c]); groups = np.array_split(order, 64)
        knots = np.array([x[g,c].mean() for g in groups]); values = np.array([y[g,c].mean() for g in groups])
        # PAVA：约束原始负片通道到正片为单调下降，不依赖未知输入 gamma。
        blocks = []
        for i, value in enumerate(values):
            blocks.append([value, 1, i, i+1])
            while len(blocks)>1 and blocks[-2][0] < blocks[-1][0]:
                b=blocks.pop(); a=blocks.pop(); n=a[1]+b[1]
                blocks.append([(a[0]*a[1]+b[0]*b[1])/n,n,a[2],b[3]])
        for value, _, start, end in blocks: values[start:end]=value
        curves.append([knots.tolist(), values.tolist()])
    return curves


def run(root):
    rolls = {}; rejected = []; fingerprints = {}
    def fingerprint(path):
        key = str(path.relative_to(root))
        if key not in fingerprints:
            digest = hashlib.sha256()
            with path.open('rb') as stream:
                for block in iter(lambda: stream.read(1024*1024), b''): digest.update(block)
            fingerprints[key] = {'sha256': digest.hexdigest(), 'bytes': path.stat().st_size}
    for fff in sorted(root.rglob('*.fff')):
        image, _ = raw_map(fff)
        candidates = list(fff.parent.rglob('*.tif')) + list(fff.parent.rglob('*.TIF'))
        seen = set()
        for setting in reversed(history(image)):
            name = setting.get('Name', '').split(' #')[0]
            matches = [p for p in candidates if p.stem == name]
            if not matches and fff.parent.name == '酱油 补充': matches = candidates
            if not matches or name in seen or name == 'RGB standard': continue
            seen.add(name)
            path = matches[0]
            try:
                x,y,corr=sample(fff,setting,path)
                if max(corr) > -.97: raise ValueError('配准秩相关未达门槛 '+str(corr))
                group = str(fff.parent.relative_to(root))
                fingerprint(fff); fingerprint(path)
                rolls.setdefault(group,[]).append((str(fff.relative_to(root)),str(path.relative_to(root)),x,y,corr))
            except Exception as error: rejected.append({'fff':str(fff.relative_to(root)),'name':name,'reason':str(error)})
    results=[]
    for roll, frames in rolls.items():
        # 同一 FFF 的所有裁切必须同属训练/留出，避免同扫描数据泄漏。
        sources=sorted(set(f[0] for f in frames)); held=set(sources[::3]); train=[f for f in frames if f[0] not in held]; test=[f for f in frames if f[0] in held]
        result={'roll':roll,'acceptedFrames':len(frames),'trainingSources':[s for s in sources if s not in held],'holdoutSources':sorted(held),
                'minimumRankCorrelation':min(c for f in frames for c in f[4]),
                'worstRankCorrelation':max(c for f in frames for c in f[4]),
                'pairs':[{'fff':f[0],'tiff':f[1],'rankCorrelations':f[4],'split':'holdout' if f[0] in held else 'training'} for f in frames],
                'status':'INSUFFICIENT_INDEPENDENT_SOURCES'}
        if train and test:
            curves=fit(np.concatenate([f[2] for f in train]),np.concatenate([f[3] for f in train]))
            errors=[]
            for f in test:
                prediction=np.column_stack([np.interp(f[2][:,c],*curves[c]) for c in range(3)])
                errors.append(np.abs(prediction-f[3]))
            error=np.concatenate(errors)
            result.update(maeEncodedRgb=float(error.mean()),p95AbsoluteEncodedRgb=float(np.quantile(error,.95)),
                          status='REFERENCE_LOOK_PASS' if error.mean()<=.03 and np.quantile(error,.95)<=.08 else 'REFERENCE_LOOK_FAIL',curves=curves)
        results.append(result)
    return {'schemaVersion':1,'experiment':'FFF 原生 RGB → 既有 AdobeRGB 扫描输出的单调经验映射',
            'thresholdsFrozenBeforeFit':{'rankCorrelationAtMost':-.97,'meanAbsoluteEncodedRgbAtMost':.03,'p95AbsoluteEncodedRgbAtMost':.08},
            'limitations':['不推断原始传递函数或扫描输入ICC','不是场景真值，不作为厂家胶片模型','同源扫描的不同裁切不跨训练与留出'],
            'modelReady':False,'sourceFingerprints':fingerprints,'results':results,'rejectedCandidates':rejected}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();data=run(args.root);args.output.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps([{k:v for k,v in r.items() if k!='curves'} for r in data['results']],ensure_ascii=False,indent=2))
    print('拒绝候选',len(data['rejectedCandidates']))
