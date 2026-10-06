"""
Parser plików HTML z en.24score.com do ustandaryzowanego formatu meczów NBA.
Obsługuje: regular season, qualifying round (play-in), playoff.
"""
import re
import json
from bs4 import BeautifulSoup


def parse_score_cell(score_text):
    """'149:128' -> (149, 128); '137:132OT' -> (137, 132)"""
    score_text = score_text.strip()
    m = re.match(r'(\d+):(\d+)', score_text)
    if not m:
        return None, None
    return int(m.group(1)), int(m.group(2))


def parse_sets_cell(sets_text):
    """'45:34, 35:22, 39:32, 30:40' lub '(23:13, 19:24, 30:28, 18:29)' -> lista (home,away) per okres"""
    sets_text = sets_text.strip().strip('()')
    periods = []
    for part in sets_text.split(','):
        part = part.strip()
        if not part:
            continue
        m = re.match(r'(\d+):(\d+)', part)
        if m:
            periods.append((int(m.group(1)), int(m.group(2))))
    return periods


def parse_file(filepath, season, stage):
    """Wczytuje zapisany plik HTML i parsuje go (patrz parse_html)."""
    with open(filepath, encoding='utf-8', errors='ignore') as f:
        content = f.read()
    return parse_html(content, season, stage)


def parse_html(content, season, stage):
    """
    content: tekst HTML strony z en.24score.com (tabela meczów)
    stage: 'regular' | 'playin' | 'playoff' | 'preseason'
    Zwraca listę słowników - jeden ROZEGRANY mecz na wpis.
    """
    soup = BeautifulSoup(content, 'html.parser')
    rows = soup.select('table.t1.matches tr.odd, table.t1.matches tr.even')

    games = []
    last_date = None
    for r in rows:
        date_cell = r.select_one('td.date')
        date_text = date_cell.get_text(strip=True) if date_cell else ''
        if date_text and date_text != '\xa0':
            last_date = date_text
        date = last_date

        teams_cell = r.select_one('td.teams') or r.select_one('td.left')
        if not teams_cell:
            continue
        teams_text = teams_cell.get_text(strip=True)
        # separator bywa zwykłym dashem lub en-dash
        teams_text = teams_text.replace('–', '-')
        if ' - ' in teams_text:
            home_team, away_team = teams_text.split(' - ', 1)
        else:
            # fallback: podziel na pierwszym dashu otoczonym spacjami
            parts = re.split(r'\s-\s', teams_text, maxsplit=1)
            if len(parts) != 2:
                continue
            home_team, away_team = parts
        home_team, away_team = home_team.strip(), away_team.strip()

        score_cell = r.select_one('td.score')
        score_text = score_cell.get_text(strip=True) if score_cell else ''
        final_home, final_away = parse_score_cell(score_text)
        if final_home is None:
            continue  # mecz jeszcze nierozegrany / brak wyniku

        sets_cell = r.select_one('td.sets')
        sets_text = sets_cell.get_text(strip=True) if sets_cell else ''
        periods = parse_sets_cell(sets_text)
        if len(periods) < 4:
            continue  # niekompletne dane

        q_scores = periods[:4]
        ot_scores = periods[4:]

        link = r.select_one('td.score a') or r.select_one('td.h2h a')
        href = link.get('href', '') if link else ''
        m = re.search(r'/match/(\d+)-', href)
        game_id = m.group(1) if m else f"{date}_{home_team}_{away_team}".replace(' ', '_')

        games.append({
            'game_id': game_id,
            'date': date,
            'season': season,
            'stage': stage,
            'home_team': home_team,
            'away_team': away_team,
            'q1_home': q_scores[0][0], 'q1_away': q_scores[0][1],
            'q2_home': q_scores[1][0], 'q2_away': q_scores[1][1],
            'q3_home': q_scores[2][0], 'q3_away': q_scores[2][1],
            'q4_home': q_scores[3][0], 'q4_away': q_scores[3][1],
            'ot_periods': ot_scores,  # lista (home,away) dla każdej dogrywki
            'final_home': final_home,
            'final_away': final_away,
            'overtime': len(ot_scores) > 0,
            'num_ot': len(ot_scores),
        })
    return games


if __name__ == '__main__':
    all_games = []
    all_games += parse_file('/mnt/user-data/uploads/2526_regular.html', '2025-26', 'regular')
    all_games += parse_file('/mnt/user-data/uploads/2526_qs.html', '2025-26', 'playin')
    all_games += parse_file('/mnt/user-data/uploads/2526_playof.html', '2025-26', 'playoff')

    print(f"Regular: {sum(1 for g in all_games if g['stage']=='regular')}")
    print(f"Play-in: {sum(1 for g in all_games if g['stage']=='playin')}")
    print(f"Playoff: {sum(1 for g in all_games if g['stage']=='playoff')}")
    print(f"RAZEM: {len(all_games)}")

    with open('/home/claude/nba_lamaki/games_2025_26.json', 'w', encoding='utf-8') as f:
        json.dump(all_games, f, ensure_ascii=False, indent=1)

    print("\nPrzykladowy mecz:")
    print(json.dumps(all_games[0], ensure_ascii=False, indent=2))
