#!/usr/bin/env python3
"""Extrai dos arquivos de dispositivo do Connect IQ SDK o necessário para o simulador web (app/sim/<id>.json + foto)."""
import json, os, re, shutil
DEV = '/root/.Garmin/ConnectIQ/Devices'; OUT = '/www/wwwroot/alequizao.com/garmin/app/sim'
os.makedirs(OUT, exist_ok=True)
modelos = json.load(open('/www/wwwroot/alequizao.com/garmin/app/modelos.json')); ok = 0
for m in modelos:
    d = m['id']; p = f'{DEV}/{d}'
    try:
        s = json.load(open(f'{p}/simulator.json')); c = json.load(open(f'{p}/compiler.json'))
        disp = s['display']; ppi = s.get('ppi')
        fontes = {}
        for f in s['fonts'][0]['fonts']:
            nome = f['name']
            if f.get('size') and ppi: px = f['size'] * ppi / 72; peso = 400
            else:
                h = disp['location']['height']
                rel = {'xtiny': .065, 'tiny': .075, 'small': .09, 'medium': .105, 'large': .12, 'numberMild': .17, 'numberMedium': .22, 'numberHot': .28, 'numberThaiHot': .3}
                m2 = re.search(r'_(\d{1,3})B?$', f['filename'])   # ex.: ROBOTO_13B, NUMBER_FONT_44
                px = float(m2.group(1)) if m2 else round(h * rel.get(nome, .09), 1)
                peso = 900 if 'BLACK' in f['filename'] else (700 if re.search(r'\d+B$', f['filename']) or 'BOLD' in f['filename'] else 400)
            fontes[nome] = {'px': round(px, 1), 'peso': peso}
        teclas = {k['id']: k['location'] for k in s.get('keys', []) if k.get('location')}
        info = {'id': d, 'nome': m['nome'], 'imagem': f'{d}.png', 'tela': disp['location'], 'forma': disp.get('shape', 'round'), 'toque': disp.get('isTouch', False),
                'tipo': c.get('displayType'), 'bits': c.get('bitsPerPixel'), 'fontes': fontes, 'teclas': teclas}
        json.dump(info, open(f'{OUT}/{d}.json', 'w'), ensure_ascii=False)
        if os.path.exists(f'{p}/{s["image"]}'): shutil.copy(f'{p}/{s["image"]}', f'{OUT}/{d}.png')
        ok += 1
    except Exception as e: print(d, 'erro', e)
print('dispositivos exportados:', ok)
