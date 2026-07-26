import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify
from flask_cors import CORS
from database import Database, Player
from engine import filter_candidates, Feedback, GREEN, YELLOW, GRAY, UP, DOWN, build_team_region_map
from recommender import recommend, explain_recommendation

XLSX_PATH = r"players_database.xlsx"

app = Flask(__name__)
CORS(app)

db = Database(XLSX_PATH)
all_players = db.players
candidates = list(all_players)
round_num = 0
TEAM_REGION_MAP = build_team_region_map(all_players)


def _reset():
    global candidates, round_num
    candidates = list(all_players)
    round_num = 0


CSS_MAP = {
    "correct": GREEN,
    "close": YELLOW,
    "miss": GRAY,
    "wrong": GRAY,
}

HINT_MAP = {
    "higher": UP,
    "lower": DOWN,
}


@app.route("/api/reset", methods=["POST"])
def reset():
    _reset()
    return jsonify({"ok": True, "total": len(all_players)})


@app.route("/api/status", methods=["GET"])
def status():
    return jsonify({
        "total": len(all_players),
        "remaining": len(candidates),
        "round": round_num,
    })


@app.route("/api/feedback", methods=["POST"])
def feedback():
    global round_num
    data = request.get_json()
    if not data or "guesses" not in data:
        return jsonify({"error": "缺少猜题数据"}), 400

    _reset()

    print(f"收到 {len(data['guesses'])} 个猜题:")
    for gd in data["guesses"]:
        nick = gd.get("nickname", "?")
        attrs = gd.get("attributes", {})
        parts = [f"{k}={v.get('level','?')}" + (f"+{v.get('hint','')}" if v.get('hint') else "") for k, v in attrs.items()]
        print(f"  {nick}: {', '.join(parts)}")

    for guess_data in data["guesses"]:
        round_num += 1
        attrs = guess_data.get("attributes", {})
        nickname = guess_data.get("nickname", "")

        guess = db.by_name(nickname)
        if guess is None:
            continue

        fb = Feedback()

        for col_name, col_info in attrs.items():
            level = col_info.get("level")
            hint = col_info.get("hint")
            color = CSS_MAP.get(level)
            arrow = HINT_MAP.get(hint)

            if col_name in ("nickname", "name"):
                fb.name = color
            elif col_name in ("team",):
                fb.team = color
            elif col_name in ("role",):
                fb.role = color
            elif col_name in ("nationality", "country"):
                fb.country = color
            elif col_name in ("age",):
                fb.age = color
                fb.age_arrow = arrow
            elif col_name in ("majorChampionships", "majorchampionships", "major_wins", "major_championships"):
                fb.major_wins = color
                fb.major_wins_arrow = arrow
            elif col_name in ("majorAppearances", "majorappearances", "major_apps", "major_appearances"):
                fb.major_apps = color
                fb.major_apps_arrow = arrow
            elif col_name in ("status", "isActive", "is_active", "active"):
                fb.is_active = color

        global candidates
        if fb.name == GREEN:
            candidates = [guess]
            break
        candidates = filter_candidates(candidates, guess, fb, TEAM_REGION_MAP)

    recs = recommend(candidates)
    rec_list = []
    for score, p in recs[:5]:
        reasons = explain_recommendation(candidates, p)
        rec_list.append({
            "name": p.name,
            "score": round(score, 3),
            "reasons": reasons,
            "country": p.country,
            "region": p.region,
            "team": p.team,
            "age": p.age,
            "role": p.role,
            "majorWins": p.major_wins,
            "majorApps": p.major_apps,
            "isActive": p.is_active,
        })
    # 熵推荐为空但有候选时，直接拿前几个候选作为推荐
    if not rec_list and candidates:
        for p in sorted(candidates, key=lambda x: (x.major_wins, x.name))[:5]:
            rec_list.append({
                "name": p.name,
                "score": 0,
                "reasons": [],
                "country": p.country,
                "region": p.region,
                "team": p.team,
                "age": p.age,
                "role": p.role,
                "majorWins": p.major_wins,
                "majorApps": p.major_apps,
                "isActive": p.is_active,
            })

    preview = []
    pool = candidates if candidates else [guess]
    for p in sorted(pool, key=lambda x: (x.major_wins, x.name))[:30]:
        preview.append({
            "name": p.name,
            "country": p.country,
            "region": p.region,
            "team": p.team,
            "age": p.age,
            "role": p.role,
            "majorWins": p.major_wins,
            "majorApps": p.major_apps,
            "isActive": p.is_active,
        })

    import random
    candidate_names = set(p.name for p in candidates)
    eliminated = [p.name for p in all_players if p.name not in candidate_names]
    random.shuffle(eliminated)
    eliminated = eliminated[:30]

    return jsonify({
        "round": round_num,
        "remaining": len(candidates),
        "recommendations": rec_list,
        "candidates_preview": preview,
        "eliminated_preview": eliminated,
    })


if __name__ == "__main__":
    print(f"服务器启动中。已加载 {len(all_players)} 名选手。")
    print("用户脚本应将数据发送至 http://localhost:5000/api/feedback")
    app.run(host="0.0.0.0", port=5000, debug=False)
