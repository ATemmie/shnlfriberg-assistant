from database import Player


GREEN = "green"
YELLOW = "yellow"
GRAY = "gray"
UP = "up"
DOWN = "down"


class Feedback:
    def __init__(self):
        self.name = None
        self.country = None
        self.region = None
        self.team = None
        self.age = None
        self.age_arrow = None
        self.role = None
        self.major_wins = None
        self.major_wins_arrow = None
        self.major_apps = None
        self.major_apps_arrow = None
        self.is_active = None


def _arrow_ok(candidate_val: int, guess_val: int, arrow: str) -> bool:
    if arrow is None:
        return True
    if arrow == UP:
        return candidate_val > guess_val
    if arrow == DOWN:
        return candidate_val < guess_val
    return True


def build_team_region_map(players: list) -> dict:
    """For each team, derive its region as the majority nationality-region of its players."""
    from collections import Counter
    team_regions = {}
    teams = {}
    for p in players:
        if p.team not in teams:
            teams[p.team] = Counter()
        teams[p.team][p.region] += 1
    for team, counter in teams.items():
        team_regions[team] = counter.most_common(1)[0][0]
    return team_regions


_NO_TEAM = {"退役", "未签约/已下放", "自由人", "无"}


def _team_region(team: str, player: Player, team_region_map: dict) -> str:
    if team in _NO_TEAM:
        return team
    if team in team_region_map:
        return team_region_map[team]
    return player.region if team == player.team else ""


def filter_candidates(candidates: list, guess: Player, fb: Feedback,
                      team_region_map: dict = None) -> list:
    if team_region_map is None:
        team_region_map = {}
    result = []
    for p in candidates:
        if p.id == guess.id:
            continue
        ok = True

        if fb.name == GREEN:
            ok = ok and (p.name == guess.name)

        # ---- 队伍 ----
        if fb.team is not None:
            if fb.team == GREEN:
                ok = ok and (p.team == guess.team)
            elif fb.team == YELLOW:
                ok = ok and (p.team != guess.team)
            elif fb.team == GRAY:
                # 如果国籍显示同区域（GREEN/YELLOW），说明答案是该区域的人但队伍不在该区域
                if fb.country in (GREEN, YELLOW):
                    ok = ok and (p.region == guess.region and p.team != guess.team)
                else:
                    ok = ok and (_team_region(p.team, p, team_region_map) != _team_region(guess.team, guess, team_region_map))

        # ---- 角色 ----
        if fb.role is not None:
            if fb.role == GREEN:
                ok = ok and (p.role == guess.role)
            elif fb.role == YELLOW:
                ok = ok and (p.role != guess.role)
            elif fb.role == GRAY:
                ok = ok and (p.role != guess.role)

        # ---- 是否活跃 ----
        if fb.is_active is not None:
            if fb.is_active == GREEN:
                ok = ok and (p.is_active == guess.is_active)
            elif fb.is_active == YELLOW:
                ok = ok and (p.is_active != guess.is_active)
            elif fb.is_active == GRAY:
                ok = ok and (p.is_active != guess.is_active)

        # ---- 国籍/地区 ----
        if fb.country is not None:
            if fb.country == GREEN:
                ok = ok and (p.country == guess.country)
            elif fb.country == YELLOW:
                ok = ok and (p.country != guess.country and p.region == guess.region)
            elif fb.country == GRAY:
                ok = ok and (p.region != guess.region)

        # ---- 年龄 ----
        if fb.age is not None:
            if fb.age == GREEN:
                ok = ok and (p.age == guess.age)
            elif fb.age == YELLOW:
                ok = ok and (p.age != guess.age)
            elif fb.age == GRAY:
                ok = ok and (p.age != guess.age)
            if ok and fb.age_arrow is not None:
                ok = ok and _arrow_ok(p.age, guess.age, fb.age_arrow)

        # ---- Major冠军 ----
        if fb.major_wins is not None:
            if fb.major_wins == GREEN:
                ok = ok and (p.major_wins == guess.major_wins)
            elif fb.major_wins == YELLOW:
                ok = ok and (p.major_wins != guess.major_wins)
            elif fb.major_wins == GRAY:
                ok = ok and (p.major_wins != guess.major_wins)
            if ok and fb.major_wins_arrow is not None:
                ok = ok and _arrow_ok(p.major_wins, guess.major_wins, fb.major_wins_arrow)

        # ---- Major出场 ----
        if fb.major_apps is not None:
            if fb.major_apps == GREEN:
                ok = ok and (p.major_apps == guess.major_apps)
            elif fb.major_apps == YELLOW:
                ok = ok and (p.major_apps != guess.major_apps)
            elif fb.major_apps == GRAY:
                ok = ok and (p.major_apps != guess.major_apps)
            if ok and fb.major_apps_arrow is not None:
                ok = ok and _arrow_ok(p.major_apps, guess.major_apps, fb.major_apps_arrow)

        if ok:
            result.append(p)
    return result
