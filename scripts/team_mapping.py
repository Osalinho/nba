"""
Mapowanie oficjalnych skrótów drużyn NBA (z stats.nba.com / nba_api)
na nazwy używane w naszej bazie danych (odziedziczone z en.24score.com).
"""

NBA_ABBR_TO_NAME = {
    'ATL': 'Atlanta Hawks',
    'BOS': 'Boston Celtics',
    'BKN': 'Brooklyn Nets',
    'CHA': 'Charlotte Hornets',
    'CHI': 'Chicago Bulls',
    'CLE': 'Cleveland Cavaliers',
    'DAL': 'Dallas Mavericks',
    'DEN': 'Denver Nuggets',
    'DET': 'Detroit Pistons',
    'GSW': 'Golden State',
    'HOU': 'Houston Rockets',
    'IND': 'Indiana Pacers',
    'LAC': 'LA Clippers',
    'LAL': 'LA Lakers',
    'MEM': 'Memphis Grizzlies',
    'MIA': 'Miami Heat',
    'MIL': 'Milwaukee Bucks',
    'MIN': 'Minnesota Timb.',
    'NOP': 'New Orleans Pelicans',
    'NYK': 'NY Knicks',
    'OKC': 'Oklahoma City Thunder',
    'ORL': 'Orlando Magic',
    'PHI': 'Philadelphia',
    'PHX': 'Phoenix Suns',
    'POR': 'Portland Trail Blazers',
    'SAC': 'Sacramento Kings',
    'SAS': 'San Antonio Spurs',
    'TOR': 'Toronto Raptors',
    'UTA': 'Utah Jazz',
    'WAS': 'Washington Wizards',
}


def map_team(abbr_or_name):
    """Zwraca nazwę drużyny w formacie naszej bazy. Akceptuje skrót (np. 'GSW')
    lub już poprawną pełną nazwę (przechodzi bez zmian)."""
    if abbr_or_name in NBA_ABBR_TO_NAME:
        return NBA_ABBR_TO_NAME[abbr_or_name]
    if abbr_or_name in NBA_ABBR_TO_NAME.values():
        return abbr_or_name
    return abbr_or_name  # nieznana - zwracamy jak jest, zaloguje sie jako warning w fetch_new_games.py


def season_id_to_stage_and_season(season_id, game_date):
    """
    stats.nba.com SEASON_ID: pierwsza cyfra to typ sezonu:
      1 = Preseason, 2 = Regular Season, 3 = All-Star, 4 = Playoffs, 5 = Play-In
    Reszta cyfr (ostatnie 4) to rok startowy sezonu, np. '22026' -> sezon 2026-27.
    """
    season_id = str(season_id)
    type_digit = season_id[0]
    year_part = int(season_id[-4:])

    stage_map = {'1': 'preseason', '2': 'regular', '4': 'playoff', '5': 'playin'}
    stage = stage_map.get(type_digit, 'regular')

    season_label = f"{year_part}-{str(year_part + 1)[-2:]}"
    return stage, season_label
