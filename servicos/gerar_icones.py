#!/opt/garmin-sync/venv/bin/python3
"""Gera ícones 3D (estilo Microsoft Fluent Emoji) para lanches sem emoji, com a chave da OpenAI do agendamentos.
Uso: gerar_icones.py slug "descrição em inglês" [slug "descrição"...]"""
import sys, os, base64, io, re, requests
from PIL import Image
env = open('' + __import__('os').environ.get('OPENAI_ENV', '/etc/garmin-openai.env') + '').read()
KEY = re.search(r'^OPENAI_API_KEY\s*=\s*"?([^"\n]+)"?', env, re.M).group(1).strip()
DEST = '/www/wwwroot/alequizao.com/garmin/app/mimei/biblioteca'; os.makedirs(DEST, exist_ok=True)
ESTILO = ("A single {0}, rendered as a glossy 3D emoji icon in the Microsoft Fluent Emoji 3D style: soft rounded shapes, "
          "smooth matte-plastic shading, warm soft studio lighting, slight top-left highlight, subtle ambient occlusion, vibrant appetizing colors, "
          "centered, three-quarter front view, fills 85% of the frame, no text, no plate unless part of the food, no shadow on the ground, transparent background.")
args = sys.argv[1:]
for slug, desc in zip(args[0::2], args[1::2]):
    r = requests.post('https://api.openai.com/v1/images/generations', headers={'Authorization': f'Bearer {KEY}'}, timeout=240,
                      json={'model': 'gpt-image-1', 'prompt': ESTILO.format(desc), 'size': '1024x1024', 'background': 'transparent', 'quality': 'medium', 'n': 1})
    j = r.json()
    if r.status_code != 200: print(slug, 'ERRO', r.status_code, str(j.get('error', j))[:200]); continue
    im = Image.open(io.BytesIO(base64.b64decode(j['data'][0]['b64_json']))).convert('RGBA')
    bb = im.getbbox(); im = im.crop(bb) if bb else im
    lado = max(im.size); quad = Image.new('RGBA', (lado, lado), (0, 0, 0, 0)); quad.paste(im, ((lado - im.width) // 2, (lado - im.height) // 2))
    quad.resize((256, 256), Image.LANCZOS).save(f'{DEST}/{slug}.png'); print(slug, 'OK')
