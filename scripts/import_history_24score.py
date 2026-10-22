"""
Jednorazowy import starszych sezonów (sezon zasadniczy) z zapisanych stron en.24score.com
(Basketball__USA_NBA_2015_16_-_en_24score_com.html ... 2022_23).
Użycie:  python scripts/import_history_24score.py folder_z_plikami_html
Zapisuje data/history_2015_2023.json w tym samym formacie co data/games_all.json.
enrich.py dokłada ten plik do games_all.json przy każdym przeliczeniu.
"""
import glob, json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from parse_24score import parse_file
from team_mapping import from_24score_name


def main(folder):
    out, seen = [], set()
    for f in sorted(glob.glob(str(Path(folder) / 'Basketball__USA_NBA_20*_*-_en_24score_com.html'))):
        m = re.search(r'NBA_(\d{4})_(\d{2})_', f)
        if not m or int(m.group(1)) >= 2023:
            continue
        season = f'{m.group(1)}-{m.group(2)}'
        games = parse_file(f, season, 'regular')
        for g in games:
            g['home_team'] = from_24score_name(g['home_team'])
            g['away_team'] = from_24score_name(g['away_team'])
            key = (g['date'], g['home_team'], g['away_team'])
            if key in seen:
                continue
            seen.add(key)
            out.append(g)
        print(season, len(games))
    dst = Path(__file__).parent.parent / 'data' / 'history_2015_2023.json'
    dst.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'RAZEM {len(out)} meczów -> {dst}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
