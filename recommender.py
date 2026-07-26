import math


def _entropy(groups: list) -> float:
    total = sum(len(g) for g in groups)
    if total == 0:
        return 0.0
    e = 0.0
    for g in groups:
        if len(g) > 0:
            p = len(g) / total
            e -= p * math.log2(p)
    return e


def _build_diversity(candidates: list) -> dict:
    """预计算候选人集合多样性，避免每个候选人重复计算"""
    sets = {
        'countries': set(),
        'regions': set(),
        'teams': set(),
        'roles': set(),
        'ages': set(),
        'actives': set(),
        'mws': set(),
        'mas': set(),
    }
    for p in candidates:
        sets['countries'].add(p.country)
        sets['regions'].add(p.region)
        sets['teams'].add(p.team)
        sets['roles'].add(p.role)
        sets['ages'].add(p.age)
        sets['actives'].add(p.is_active)
        sets['mws'].add(p.major_wins)
        sets['mas'].add(p.major_apps)
    return {k: len(v) > 1 for k, v in sets.items()}


def _make_groups(candidates: list, key_fn) -> list:
    groups = {}
    for p in candidates:
        k = key_fn(p)
        groups.setdefault(k, []).append(p)
    return list(groups.values())


def score_candidate(candidates: list, player, div: dict = None) -> float:
    n = len(candidates)
    if n <= 1:
        return 0.0
    if div is None:
        div = _build_diversity(candidates)

    total = 0.0
    count = 0

    if div.get('countries'):
        kf = lambda p: (p.country == player.country, p.region == player.region)
        total += _entropy(_make_groups(candidates, kf))
        count += 1

    if div.get('regions'):
        kf = lambda p: p.region == player.region
        total += _entropy(_make_groups(candidates, kf))
        count += 1

    if div.get('teams'):
        kf = lambda p: p.team == player.team
        total += _entropy(_make_groups(candidates, kf))
        count += 1

    if div.get('roles'):
        kf = lambda p: p.role == player.role
        total += _entropy(_make_groups(candidates, kf))
        count += 1

    if div.get('ages'):
        def age_fn(p):
            d = abs(p.age - player.age)
            return "same" if d == 0 else ("close" if d <= 3 else "far")
        total += _entropy(_make_groups(candidates, age_fn))
        count += 1

    if div.get('actives'):
        kf = lambda p: p.is_active == player.is_active
        total += _entropy(_make_groups(candidates, kf))
        count += 1

    if div.get('mws'):
        def mw_fn(p):
            d = abs(p.major_wins - player.major_wins)
            return "same" if d == 0 else ("close" if d <= 1 else "far")
        total += _entropy(_make_groups(candidates, mw_fn))
        count += 1

    if div.get('mas'):
        def ma_fn(p):
            d = abs(p.major_apps - player.major_apps)
            return "same" if d == 0 else ("close" if d <= 1 else "far")
        total += _entropy(_make_groups(candidates, ma_fn))
        count += 1

    if count == 0:
        return 0.0
    return total / count


def recommend(candidates: list, all_players: list = None) -> list:
    pool = all_players if all_players else candidates
    if not pool:
        return []
    # 预计算多样性，避免 score_candidate 中每个候选人重复遍历
    div = _build_diversity(candidates)
    scored = [(score_candidate(candidates, p, div), p) for p in pool]
    scored.sort(key=lambda x: -x[0])
    return scored[:5]


def explain_recommendation(candidates: list, player) -> list:
    if not candidates:
        return []
    reasons = []
    countries = set(p.country for p in candidates)
    if len(countries) > 1:
        reasons.append(f"distinguishes {len(countries)} countries")

    regions = set(p.region for p in candidates)
    if len(regions) > 1:
        reasons.append(f"covers {len(regions)} regions")

    roles = set(p.role for p in candidates)
    if len(roles) > 1:
        reasons.append(f"covers {len(roles)} roles")

    ages = [p.age for p in candidates]
    if ages and max(ages) - min(ages) >= 5:
        reasons.append(f"wide age range ({min(ages)}-{max(ages)})")

    mw = [p.major_wins for p in candidates]
    if mw and max(mw) >= 2:
        reasons.append(f"Major wins vary (0-{max(mw)})")

    return reasons
