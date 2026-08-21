"""
Wzbogacenie danych meczów NBA o cechy potrzebne do modułu Zależności,
Analizy drużyny, H2H i Wyszukiwarki schematów.
"""
import json
from datetime import datetime
from collections import defaultdict

DAYS_PL = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela']
MONTHS_PL = ['', 'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
             'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']


def classify(g):
    half_home = g['q1_home'] + g['q2_home']
    half_away = g['q1_away'] + g['q2_away']
    reg_home = half_home + g['q3_home'] + g['q4_home']
    reg_away = half_away + g['q3_away'] + g['q4_away']

    if reg_home == reg_away:
        return 'X', None, None
    if half_home == half_away:
        half_leader = None
    else:
        half_leader = 'home' if half_home > half_away else 'away'
    winner = 'home' if reg_home > reg_away else 'away'

    if half_leader is None:
        return 'remis_do_przerwy_bez_OT', half_leader, winner
    if half_leader == 'home' and winner == 'away':
        return '1/2', half_leader, winner
    elif half_leader == 'away' and winner == 'home':
        return '2/1', half_leader, winner
    else:
        return 'brak_lamaka', half_leader, winner


def load_all():
    games = json.load(open('data/games_all.json', encoding='utf-8'))
    for g in games:
        g['date_obj'] = datetime.strptime(g['date'], '%d.%m.%Y')
        g['date_iso'] = g['date_obj'].strftime('%Y-%m-%d')
        cls, half_leader, winner = classify(g)
        g['classification'] = cls
        g['half_leader'] = half_leader
        g['winner'] = winner
        g['half_home'] = g['q1_home'] + g['q2_home']
        g['half_away'] = g['q1_away'] + g['q2_away']
        g['reg_home'] = g['half_home'] + g['q3_home'] + g['q4_home']
        g['reg_away'] = g['half_away'] + g['q3_away'] + g['q4_away']
        g['margin_final'] = abs(g['final_home'] - g['final_away'])
        g['day_of_week'] = DAYS_PL[g['date_obj'].weekday()]
        g['month'] = MONTHS_PL[g['date_obj'].month]
    games.sort(key=lambda g: (g['date_obj'], g['game_id']))
    return games


def build_team_logs(games):
    """Dla kazdej druzyny buduje chronologiczny log jej meczow z cechami kontekstowymi."""
    by_team = defaultdict(list)
    for g in games:
        by_team[g['home_team']].append((g, 'home'))
        by_team[g['away_team']].append((g, 'away'))

    team_game_ctx = {}  # (game_id, team) -> dict cech

    for team, entries in by_team.items():
        entries.sort(key=lambda e: (e[0]['date_obj'], e[0]['game_id']))
        prev_date = None
        prev_was_away = None
        prev_season = None
        away_streak = 0
        home_streak = 0
        cur_result_streak = []  # lista 'W'/'L' od najstarszego, reset na starcie sezonu
        game_num_in_season = 0
        for g, side in entries:
            opp_side = 'away' if side == 'home' else 'home'
            opponent = g[f'{opp_side}_team']
            is_home = side == 'home'

            if g['season'] != prev_season:
                prev_date = None
                prev_was_away = None
                away_streak = 0
                home_streak = 0
                cur_result_streak = []
                game_num_in_season = 0
            prev_season = g['season']
            game_num_in_season += 1

            rest_days = (g['date_obj'] - prev_date).days - 1 if prev_date else None
            back_to_back = rest_days is not None and rest_days == 0

            if is_home:
                away_streak = 0
                home_streak += 1
            else:
                home_streak = 0
                away_streak += 1

            first_away_of_trip = (not is_home) and (prev_was_away is False or prev_was_away is None) if prev_was_away is not None else (not is_home)
            first_home_after_trip = is_home and prev_was_away is True

            won = g['winner'] == side
            half_led = g['half_leader'] == side
            half_trailed = g['half_leader'] == opp_side
            blew_lead = half_led and not won and g['classification'] in ('1/2', '2/1')
            comeback_win = half_trailed and won and g['classification'] == 'brak_lamaka'
            tied_at_half = g['half_leader'] is None and g['classification'] != 'X'

            # streak zwycięstw/porażek PRZED tym meczem
            win_streak_before = 0
            loss_streak_before = 0
            if cur_result_streak:
                last = cur_result_streak[-1]
                i = len(cur_result_streak) - 1
                if last == 'W':
                    while i >= 0 and cur_result_streak[i] == 'W':
                        win_streak_before += 1
                        i -= 1
                else:
                    while i >= 0 and cur_result_streak[i] == 'L':
                        loss_streak_before += 1
                        i -= 1

            prev_margin = None
            prev_result = None
            if cur_result_streak:
                prev_result = cur_result_streak[-1]

            three_in_four = False
            # policz mecze tej druzyny w oknie ostatnich 4 dni (wliczajac ten mecz)
            window_games = [e for e in entries if e[0]['date_obj'] <= g['date_obj'] and (g['date_obj'] - e[0]['date_obj']).days < 4]
            if len(window_games) >= 3:
                three_in_four = True

            ctx = {
                'team': team,
                'opponent': opponent,
                'is_home': is_home,
                'won': won,
                'classification': g['classification'],
                'half_led': half_led,
                'half_trailed': half_trailed,
                'tied_at_half': tied_at_half,
                'blew_lead': blew_lead,
                'comeback_win': comeback_win,
                'went_x': g['classification'] == 'X',
                'rest_days': rest_days,
                'back_to_back': back_to_back,
                'three_in_four_days': three_in_four,
                'first_away_of_trip': first_away_of_trip,
                'first_home_after_trip': first_home_after_trip,
                'away_trip_game_num': away_streak if not is_home else 0,
                'win_streak_before': win_streak_before,
                'loss_streak_before': loss_streak_before,
                'prev_result': prev_result,
                'day_of_week': g['day_of_week'],
                'month': g['month'],
                'date_iso': g['date_iso'],
                'season': g['season'],
                'stage': g['stage'],
                'margin_final': g['margin_final'],
                'team_won_by_20plus': won and g['margin_final'] >= 20,
                'team_lost_by_20plus': (not won) and g['margin_final'] >= 20,
                'overtime': g['overtime'],
                'game_id': g['game_id'],
                'game_num_in_season': game_num_in_season,
            }
            team_game_ctx[(g['game_id'], team)] = ctx

            prev_date = g['date_obj']
            prev_was_away = not is_home
            cur_result_streak.append('W' if won else 'L')

    return team_game_ctx


def main():
    games = load_all()
    team_ctx = build_team_logs(games)

    # dolacz konteksty obu druzyn do kazdego meczu
    out_games = []
    for g in games:
        gg = {k: v for k, v in g.items() if k != 'date_obj'}
        gg['home_ctx'] = team_ctx[(g['game_id'], g['home_team'])]
        gg['away_ctx'] = team_ctx[(g['game_id'], g['away_team'])]
        out_games.append(gg)

    teams = sorted(set([g['home_team'] for g in games] + [g['away_team'] for g in games]))

    result = {
        'generated': datetime.now().isoformat(),
        'teams': teams,
        'games': out_games,
    }

    with open('data/enriched_data.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)

    print(f"Zapisano {len(out_games)} meczow, {len(teams)} druzyn")
    print(f"Rozmiar pliku: {len(json.dumps(result, ensure_ascii=False)) / 1024:.1f} KB")

    # szybka walidacja
    from collections import Counter
    c = Counter(g['classification'] for g in out_games if g['stage'] == 'regular')
    print("Klasyfikacja (regular season):", dict(c))

    # sprawdz back-to-back count
    b2b = sum(1 for g in out_games for ctx in [g['home_ctx'], g['away_ctx']] if ctx['back_to_back'])
    print(f"Wystapienia back-to-back (obie strony razem): {b2b}")


if __name__ == '__main__':
    main()
