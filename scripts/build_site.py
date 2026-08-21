"""
Składa finalny index.html z: site/dashboard_template.html + data/enriched_data.json + site/app.js.
Uruchamiać z katalogu głównego repo: python scripts/build_site.py
"""
from pathlib import Path

ROOT = Path(__file__).parent.parent

template = (ROOT / 'site' / 'dashboard_template.html').read_text(encoding='utf-8')
data_json = (ROOT / 'data' / 'enriched_data.json').read_text(encoding='utf-8')
app_js = (ROOT / 'site' / 'app.js').read_text(encoding='utf-8')

data_json_safe = data_json.replace('</script>', '<\\/script>')

out = template.replace('__DATA_JSON__', data_json_safe).replace('__APP_JS__', app_js)

out_path = ROOT / 'index.html'
out_path.write_text(out, encoding='utf-8')

print(f'Zbudowano {out_path} ({len(out) / 1024 / 1024:.2f} MB)')
