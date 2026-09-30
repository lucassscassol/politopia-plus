#!/usr/bin/env python3
"""Baixa os ícones de game-icons.net (repositório no GitHub) listados em tools/icons.json
e gera js/icons.js com os contornos vetoriais (atributo d dos paths, viewBox 512x512).

Ícones: https://game-icons.net — CC BY 3.0 (autores listados em PP.ICON_CREDITS)."""
import json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = 'https://raw.githubusercontent.com/game-icons/icons/master/{}.svg'

def fetch(name):
    out = subprocess.run(['curl', '-sSfL', '-m', '30', RAW.format(name)], capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(f'falha ao baixar {name}: {out.stderr.strip()}')
    return out.stdout

def paths(svg, name):
    if re.search(r'<(circle|rect|ellipse|polygon|g )', svg) or 'transform=' in svg:
        print(f'aviso: {name} tem elementos além de <path>', file=sys.stderr)
    ds = re.findall(r'<path[^>]*\sd="([^"]+)"', svg)
    ds = [d for d in ds if d.strip() != 'M0 0h512v512H0z']
    return ' '.join(ds)

def main():
    mapping = json.load(open(os.path.join(ROOT, 'tools', 'icons.json')))
    uniq = sorted(set(mapping.values()))
    with ThreadPoolExecutor(8) as ex:
        svgs = dict(zip(uniq, ex.map(fetch, uniq)))
    data = {k: paths(svgs[v], v) for k, v in mapping.items()}
    authors = sorted({v.split('/')[0] for v in mapping.values()})
    lines = ['/* Gerado por tools/build-icons.py — não edite à mão.',
             '   Ícones de https://game-icons.net, licença CC BY 3.0. Autores: ' + ', '.join(authors) + '. */',
             '(function (PP) {', "  'use strict';",
             '  PP.ICON_CREDITS = ' + json.dumps(authors, ensure_ascii=False) + ';',
             '  PP.ICON_SOURCES = ' + json.dumps(mapping, ensure_ascii=False) + ';',
             '  PP.ICONS = {']
    for k, d in data.items():
        lines.append(f'    {json.dumps(k)}: {json.dumps(d)},')
    lines += ['  };', "})(typeof globalThis !== 'undefined' ? (globalThis.PP = globalThis.PP || {}) : (window.PP = window.PP || {}));", '']
    open(os.path.join(ROOT, 'js', 'icons.js'), 'w').write('\n'.join(lines))
    print(f'{len(data)} ícones, {os.path.getsize(os.path.join(ROOT, "js", "icons.js")) // 1024} KB')

if __name__ == '__main__':
    main()
