"""
Codzienne pobieranie nowych meczów NBA (preseason/regular/playoff/play-in)
przez oficjalne stats.nba.com (via nba_api) i dogrywanie ich do data/games_all.json.

Uruchamiane przez GitHub Actions co rano (patrz .github/workflows/daily-update.yml).
WYMAGA zwykłego dostępu do internetu - stats.nba.com bywa blokowany w niektórych
środowiskach (np. w piaskownicy Claude), ale w GitHub Actions działa normalnie.

Użycie:
    python scripts/fetch_new_games.py --days-back 4
"""
import argparse
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path

from nba_api.stats.endpoints import scoreboardv2

sys.path.insert(0, str(Path(__file__).parent))
from team_mapping import map_team, season_id_to_stage_and_season, NBA_ABBR_TO_NAME

DATA_PATH = Path(__file__).parent.parent / 'data' / 'games_all.json'
FLAG_PATH = Path(__file__).parent.parent / 'data' / '.last_update_had_changes'


def qtr(row, n):
    v = row.get(f'PTS_QTR{n}')
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def ot_periods_for(home_row, away_row):
    periods = []
    for i in range(1, 11):
        hv, av = home_row.get(f'PTS_OT{i}'), away_row.get(f'PTS_OT{i}')
        try:
            hv, av = int(hv), int(av)
        except (TypeError, ValueError):
            break
        if hv == 0 and av == 0:
            break
        periods.append([hv, av])
    return periods


def fetch_date(d: date):
    """Pobiera wszystkie ZAKOŃCZONE mecze z danego dnia wraz z wynikami po kwartach."""
    date_str = d.strftime('%m/%d/%Y')
    try:
        sb = scoreboardv2.ScoreboardV2(game_date=date_str, day_offset=0, timeout=30)
    except Exception as e:
        print(f'  BŁĄD pobierania {d}: {e}')
        return []

    try:
        headers = sb.game_header.get_data_frame()
        line_scores = sb.line_score.get_data_frame()
    except Exception as e:
        print(f'  BŁĄD parsowania odpowiedzi dla {d}: {e}')
        return []

    games = []
    for _, gh in headers.iterrows():
        if gh.get('GAME_STATUS_ID') != 3:  # tylko mecze zakończone (Final)
            continue
        game_id = gh['GAME_ID']
        rows = line_scores[line_scores['GAME_ID'] == game_id]
        if len(rows) != 2:
            continue
        home_rows = rows[rows['TEAM_ID'] == gh['HOME_TEAM_ID']]
        away_rows = rows[rows['TEAM_ID'] == gh['VISITOR_TEAM_ID']]
        if home_rows.empty or away_rows.empty:
            continue
        home_row, away_row = home_rows.iloc[0], away_rows.iloc[0]

        stage, season = season_id_to_stage_and_season(gh.get('SEASON', ''), d)

        home_abbr, away_abbr = home_row['TEAM_ABBREVIATION'], away_row['TEAM_ABBREVIATION']
        if home_abbr not in NBA_ABBR_TO_NAME or away_abbr not in NBA_ABBR_TO_NAME:
            print(f'  OSTRZEŻENIE: nieznany skrót drużyny ({home_abbr} / {away_abbr}) - pomijam mecz {game_id}, sprawdź team_mapping.py')
            continue

        ot = ot_periods_for(home_row, away_row)
        games.append({
            'game_id': f'nbaapi_{game_id}',
            'date': d.strftime('%d.%m.%Y'),
            'season': season,
            'stage': stage,
            'home_team': map_team(home_abbr),
            'away_team': map_team(away_abbr),
            'q1_home': qtr(home_row, 1), 'q1_away': qtr(away_row, 1),
            'q2_home': qtr(home_row, 2), 'q2_away': qtr(away_row, 2),
            'q3_home': qtr(home_row, 3), 'q3_away': qtr(away_row, 3),
            'q4_home': qtr(home_row, 4), 'q4_away': qtr(away_row, 4),
            'ot_periods': ot,
            'final_home': int(home_row['PTS']),
            'final_away': int(away_row['PTS']),
            'overtime': len(ot) > 0,
            'num_ot': len(ot),
        })
    return games


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--days-back', type=int, default=4,
                     help='Ile dni wstecz sprawdzić (zabezpieczenie na wypadek przerwy w działaniu Action)')
    args = ap.parse_args()

    with open(DATA_PATH, encoding='utf-8') as f:
        existing = json.load(f)
    existing_keys = {(g['date'], g['home_team'], g['away_team']) for g in existing}

    today = date.today()
    new_games = []
    for i in range(args.days_back, -1, -1):
        d = today - timedelta(days=i)
        print(f'Sprawdzam {d}...')
        for g in fetch_date(d):
            key = (g['date'], g['home_team'], g['away_team'])
            if key in existing_keys:
                continue
            new_games.append(g)
            existing_keys.add(key)
        time.sleep(0.6)  # uprzejmy rate-limit wobec stats.nba.com

    print(f'\nNowych meczów: {len(new_games)}')
    for g in new_games:
        print(f"  + {g['date']} {g['home_team']} {g['final_home']}:{g['final_away']} {g['away_team']} [{g['stage']}]")

    if new_games:
        existing.extend(new_games)
        with open(DATA_PATH, 'w', encoding='utf-8') as f:
            json.dump(existing, f, ensure_ascii=False, indent=1)

    FLAG_PATH.write_text('1' if new_games else '0')


if __name__ == '__main__':
    main()
