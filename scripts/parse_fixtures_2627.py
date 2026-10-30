"""
Parser terminarza sezonu zasadniczego NBA 2026/27 z zapisanej strony en.24score.com
(.../nba/2026-2027/regular_season/fixtures/).
Użycie: python scripts/parse_fixtures_2627.py sciezka/do/strony.html
Zapisuje data/fixtures_2026_27.json: [{d, h, a, q?, ot?}] - q i ot tylko dla rozegranych meczów.
Nazwy drużyn są mapowane na te z bazy (np. 'Los Angeles Lakers' -> 'LA Lakers').
"""
import json, re, sys
from pathlib import Path
from bs4 import BeautifulSoup

NAME_MAP = {
    'Golden State Warriors': 'Golden State', 'Los Angeles Lakers': 'LA Lakers', 'Los Angeles Clippers': 'LA Clippers',
    'Philadelphia 76ers': 'Philadelphia', 'Minnesota Timberwolves': 'Minnesota Timb.', 'New York Knicks': 'NY Knicks',
}


def parse(path):
    return parse_text(Path(path).read_text(encoding='utf-8', errors='ignore'))


def parse_text(html):
    soup = BeautifulSoup(html, 'html.parser')
    out, last = [], None
    for r in soup.select('table.t1.matches tr.odd, table.t1.matches tr.even'):
        t = r.select_one('td.date').get_text(strip=True)
        if t:
            last = t
        teams = r.select_one('td.teams').get_text(strip=True).replace('–', '-')
        if ' - ' not in teams:
            continue
        h, a = [x.strip() for x in teams.split(' - ', 1)]
        h, a = NAME_MAP.get(h, h), NAME_MAP.get(a, a)
        dd, mm, yy = last.split('.')
        g = {'d': f'{yy}-{mm}-{dd}', 'h': h, 'a': a}
        sc = r.select_one('td.score').get_text(strip=True)
        per = re.findall(r'(\d+):(\d+)', r.select_one('td.sets').get_text(' ', strip=True))
        if re.match(r'\d+:\d+', sc) and len(per) >= 4:
            g['q'] = [[int(x), int(y)] for x, y in per[:4]]
            g['ot'] = [[int(x), int(y)] for x, y in per[4:]]
        elif re.match(r'\d+:\d+', sc):
            # jest wynik końcowy, ale 24score nie podało jeszcze kwart - pokazujemy wynik, bez klasyfikacji łamaka
            a1, a2 = re.match(r'(\d+):(\d+)', sc).groups()
            g['fs'] = [int(a1), int(a2)]
        out.append(g)
    out.sort(key=lambda g: (g['d'], g['h']))
    return out


if __name__ == '__main__':
    src = sys.argv[1]
    games = parse(src)
    dst = Path(__file__).parent.parent / 'data' / 'fixtures_2026_27.json'
    dst.write_text(json.dumps(games, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(games)} meczów, rozegranych: {sum(1 for g in games if "q" in g)} -> {dst}')
