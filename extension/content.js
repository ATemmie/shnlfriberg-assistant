(function () {
    "use strict";

    var GREEN = "green", YELLOW = "yellow", GRAY = "gray", UP = "up", DOWN = "down";
    var FIELDS = ["team", "nationality", "age", "role", "majorChampionships", "majorAppearances", "status"];
    var COL_KEYS = [null, "team", "nationality", "age", "role", "majorChampionships", "majorAppearances", "status"];

    var _players = [], _candidates = [], _round = 0;
    var _guessCount = 0, _colKeys = null, _gameActive = false, _lastRowCount = 0, _lastRoundNum = 0;

    // ===== Load data =====
    function loadPlayers(cb) {
        fetch(chrome.runtime.getURL("players.json"))
            .then(function (r) { return r.json(); })
            .then(function (data) {
                _players = data;
                _players.forEach(function (p) {
                    if (typeof p.isActive === "string")
                        p.isActive = (p.isActive === "是" || p.isActive === "true" || p.isActive === "active");
                });
                _candidates = _players.slice();
                setStatus("就绪（离线）", "ok");
                if (cb) cb();
            })
            .catch(function () { setStatus("数据加载失败", "err"); });
    }

    function setStatus(text, cls) {
        var s = document.querySelector("#shnl-status span:last-child");
        if (s) { s.textContent = text; s.className = "status-" + cls; }
    }

    // ===== Engine =====
    function filterCandidates(fb, guessName) {
        var guess = null;
        for (var i = 0; i < _players.length; i++)
            if (_players[i].name.toLowerCase() === guessName.toLowerCase()) { guess = _players[i]; break; }
        if (!guess) return;
        var result = [];
        for (var ci = 0; ci < _candidates.length; ci++) {
            var p = _candidates[ci];
            if (p.id === guess.id) continue;
            var ok = true;
            function ac(cv, gv, a) { if (!a) return true; return a === UP ? cv > gv : cv < gv; }
            if (fb.nationality) {
                if (fb.nationality === GREEN) ok = ok && (p.country === guess.country);
                else if (fb.nationality === YELLOW) ok = ok && (p.region === guess.region && p.country !== guess.country);
                else ok = ok && (p.region !== guess.region);
            }
            if (fb.team) { if (fb.team === GREEN) ok = ok && (p.team === guess.team); else ok = ok && (p.team !== guess.team); }
            if (fb.role) { if (fb.role === GREEN) ok = ok && (p.role === guess.role); else ok = ok && (p.role !== guess.role); }
            if (fb.isActive) { if (fb.isActive === GREEN) ok = ok && (p.isActive === guess.isActive); else ok = ok && (p.isActive !== guess.isActive); }
            if (fb.age) { var d = Math.abs(p.age - guess.age); if (fb.age === GREEN) ok = ok && (d === 0); else if (fb.age === YELLOW) ok = ok && (d <= 3 && ac(p.age, guess.age, fb.ageHint)); else ok = ok && (d > 3 || !ac(p.age, guess.age, fb.ageHint)); }
            if (fb.majorChampionships) { var dm = Math.abs(p.majorWins - guess.majorWins); if (fb.majorChampionships === GREEN) ok = ok && (dm === 0); else if (fb.majorChampionships === YELLOW) ok = ok && (dm <= 1 && ac(p.majorWins, guess.majorWins, fb.majorChampionshipsHint)); else ok = ok && (dm > 1 || !ac(p.majorWins, guess.majorWins, fb.majorChampionshipsHint)); }
            if (fb.majorAppearances) { var da = Math.abs(p.majorApps - guess.majorApps); if (fb.majorAppearances === GREEN) ok = ok && (da === 0); else if (fb.majorAppearances === YELLOW) ok = ok && (da <= 1 && ac(p.majorApps, guess.majorApps, fb.majorAppearancesHint)); else ok = ok && (da > 1 || !ac(p.majorApps, guess.majorApps, fb.majorAppearancesHint)); }
            if (ok) result.push(p);
        }
        _candidates = result;
    }

    function entropy(groups) {
        var total = 0; for (var i = 0; i < groups.length; i++) total += groups[i].length;
        if (total === 0) return 0;
        var e = 0;
        for (var i = 0; i < groups.length; i++) { var len = groups[i].length; if (len > 0) { var p = len / total; e -= p * Math.log2(p); } }
        return e;
    }

    function makeGroups(candidates, keyFn) {
        var g = {}; for (var i = 0; i < candidates.length; i++) { var k = keyFn(candidates[i]); if (!g[k]) g[k] = []; g[k].push(candidates[i]); }
        var r = []; for (var k in g) r.push(g[k]); return r;
    }

    function buildDiv(candidates) {
        var s = { countries: {}, regions: {}, teams: {}, roles: {}, ages: {}, actives: {}, mws: {}, mas: {} };
        for (var i = 0; i < candidates.length; i++) {
            var p = candidates[i]; s.countries[p.country] = 1; s.regions[p.region] = 1; s.teams[p.team] = 1;
            s.roles[p.role] = 1; s.ages[p.age] = 1; s.actives[p.isActive] = 1; s.mws[p.majorWins] = 1; s.mas[p.majorApps] = 1;
        }
        var d = {}; for (var k in s) d[k] = Object.keys(s[k]).length > 1; return d;
    }

    function scoreOne(candidates, player, div) {
        var n = candidates.length; if (n <= 1) return 0;
        var total = 0, count = 0;
        if (div.countries) { total += entropy(makeGroups(candidates, function (p) { return (p.country === player.country) + "|" + (p.region === player.region); })); count++; }
        if (div.regions) { total += entropy(makeGroups(candidates, function (p) { return p.region === player.region; })); count++; }
        if (div.teams) { total += entropy(makeGroups(candidates, function (p) { return p.team === player.team; })); count++; }
        if (div.roles) { total += entropy(makeGroups(candidates, function (p) { return p.role === player.role; })); count++; }
        if (div.ages) { total += entropy(makeGroups(candidates, function (p) { var d = Math.abs(p.age - player.age); return d === 0 ? "same" : (d <= 3 ? "close" : "far"); })); count++; }
        if (div.actives) { total += entropy(makeGroups(candidates, function (p) { return p.isActive === player.isActive; })); count++; }
        if (div.mws) { total += entropy(makeGroups(candidates, function (p) { var d = Math.abs(p.majorWins - player.majorWins); return d === 0 ? "same" : (d <= 1 ? "close" : "far"); })); count++; }
        if (div.mas) { total += entropy(makeGroups(candidates, function (p) { var d = Math.abs(p.majorApps - player.majorApps); return d === 0 ? "same" : (d <= 1 ? "close" : "far"); })); count++; }
        return count === 0 ? 0 : total / count;
    }

    function recommend() {
        var div = buildDiv(_candidates);
        var scored = [];
        for (var i = 0; i < _candidates.length; i++)
            scored.push({ score: scoreOne(_candidates, _candidates[i], div), player: _candidates[i] });
        scored.sort(function (a, b) { return b.score - a.score; });
        return scored.slice(0, 5);
    }

    function processGuess(guessData) {
        if (_candidates.length === 0) _candidates = _players.slice();
        _round++;
        var fb = {};
        for (var key in guessData.attributes) {
            var attr = guessData.attributes[key], level = attr.level, hint = attr.hint;
            if (key === "nationality" || key === "country") fb.nationality = level === "correct" ? GREEN : (level === "close" ? YELLOW : GRAY);
            else if (key === "team") fb.team = level === "correct" ? GREEN : GRAY;
            else if (key === "role") fb.role = level === "correct" ? GREEN : GRAY;
            else if (key === "age") { if (level === "correct") fb.age = GREEN; else { fb.age = level === "close" ? YELLOW : GRAY; if (hint) fb.ageHint = hint === "higher" ? UP : DOWN; } }
            else if (key === "majorChampionships") { if (level === "correct") fb.majorChampionships = GREEN; else { fb.majorChampionships = level === "close" ? YELLOW : GRAY; if (hint) fb.majorChampionshipsHint = hint === "higher" ? UP : DOWN; } }
            else if (key === "majorAppearances") { if (level === "correct") fb.majorAppearances = GREEN; else { fb.majorAppearances = level === "close" ? YELLOW : GRAY; if (hint) fb.majorAppearancesHint = hint === "higher" ? UP : DOWN; } }
            else if (key === "status" || key === "isActive") fb.isActive = level === "correct" ? GREEN : GRAY;
        }
        filterCandidates(fb, guessData.nickname);
        return { recommendations: recommend(), remaining: _candidates.length, round: _round, won: _candidates.length <= 1 };
    }

    // ===== DOM parsing =====
    function detectLevel(cell) {
        var cls = (cell.className || "").toLowerCase();
        if (cls.indexOf("correct") !== -1) return "correct";
        if (cls.indexOf("close") !== -1) return "close";
        if (cls.indexOf("wrong") !== -1 || cls.indexOf("miss") !== -1) return "miss";
        return "";
    }

    function detectArrow(cell) {
        var svg = cell.querySelector("svg"); if (!svg) return "";
        var paths = svg.querySelectorAll("path"), d = "";
        for (var i = 0; i < paths.length; i++) d += paths[i].getAttribute("d") + "|";
        if (d.indexOf("m5 12 7-7 7 7") !== -1 || d.indexOf("M12 19V5") !== -1) return "up";
        if (d.indexOf("M12 5v14") !== -1 || d.indexOf("m19 12-7 7-7-7") !== -1) return "down";
        return "";
    }

    function detectColKeys(table) {
        if (_colKeys) return _colKeys;
        var thead = table.querySelector("thead");
        if (!thead) { _colKeys = COL_KEYS; return _colKeys; }
        var ths = thead.querySelectorAll("th");
        if (ths.length < 3) { _colKeys = COL_KEYS; return _colKeys; }
        var map = {};
        for (var i = 0; i < ths.length; i++) {
            var t = ths[i].textContent.trim().toLowerCase();
            if (!t) continue;
            for (var f = 0; f < FIELDS.length; f++) {
                if (map[FIELDS[f]] !== undefined) continue;
                var match = false;
                switch (FIELDS[f]) {
                    case "team": match = t.indexOf("team") !== -1; break;
                    case "nationality": match = t.indexOf("nation") !== -1 || t.indexOf("country") !== -1; break;
                    case "age": match = t === "age"; break;
                    case "role": match = t === "role"; break;
                    case "majorChampionships": match = (t.indexOf("championship") !== -1) || (t.indexOf("major") !== -1 && t.indexOf("appear") === -1); break;
                    case "majorAppearances": match = t.indexOf("appear") !== -1; break;
                    case "status": match = t === "status"; break;
                }
                if (match) { map[FIELDS[f]] = i; break; }
            }
        }
        var matched = 0;
        for (var f = 0; f < FIELDS.length; f++) if (map[FIELDS[f]] !== undefined) matched++;
        if (matched >= 5) {
            var maxCol = 0; for (var f2 in map) if (map[f2] > maxCol) maxCol = map[f2];
            _colKeys = new Array(maxCol + 1); for (var i = 0; i < _colKeys.length; i++) _colKeys[i] = null;
            for (var f2 in map) _colKeys[map[f2]] = f2;
        } else { _colKeys = COL_KEYS; }
        return _colKeys;
    }

    function extractGuesses() {
        var table = document.querySelector("table.game-table, table[class*='game-table']");
        if (!table) return null;
        var tbody = table.querySelector("tbody");
        if (!tbody) return null;
        var rows = tbody.querySelectorAll("tr");
        if (rows.length === 0) return null;
        var colKeys = detectColKeys(table), guesses = [];
        for (var ri = 0; ri < rows.length; ri++) {
            var cells = rows[ri].querySelectorAll("td");
            if (cells.length < 2) continue;
            var nickname = cells[0].textContent.trim();
            if (!nickname) continue;
            var guess = { nickname: nickname, attributes: {} };
            for (var ci = 1; ci < cells.length; ci++) {
                var level = detectLevel(cells[ci]);
                if (!level) continue;
                var key = (ci < colKeys.length) ? colKeys[ci] : null;
                if (!key) continue;
                var attr = { level: level };
                var arrow = detectArrow(cells[ci]);
                if (arrow) attr.hint = arrow === "up" ? "higher" : "lower";
                guess.attributes[key] = attr;
            }
            guesses.push(guess);
        }
        return guesses.length > 0 ? guesses : null;
    }

    // ===== Handle guess =====
    function onNewGuesses(guesses) {
        var last = guesses[guesses.length - 1];
        if (!last) return;
        // Check if won
        var won = true;
        for (var i = 0; i < FIELDS.length; i++) {
            var attr = last.attributes[FIELDS[i]];
            if (!attr || attr.level !== "correct") { won = false; break; }
        }
        if (won) {
            var rd = document.getElementById("shnl-recommendations");
            rd.innerHTML = "<div style='color:#4ade80'><strong>已确定答案！</strong> <span class='rec-name'>" + last.nickname + "</span></div>";
            return;
        }
        var result = processGuess(last);
        updateUI(result);
    }

    function updateUI(result) {
        var rd = document.getElementById("shnl-recommendations");
        var rs = document.querySelector("#shnl-remaining span:last-child");
        var rds = document.querySelector("#shnl-round span:last-child");
        if (rd) {
            if (result.won) {
                var an = _candidates.length === 1 ? _candidates[0] : null;
                if (an) {
                    rd.innerHTML = '<div class="rec-item rec-top" style="border-left-color:#4ade80"><span class="rec-name">' + an.name + "</span>" +
                        (an.team ? ' <span class="rec-team">(' + an.team + ")</span>" : "") +
                        ' <span class="rec-score" style="color:#4ade80">✓</span></div>' +
                        "<div style='font-size:11px;color:#4ade80;margin-top:4px'>已确定答案！点击名字填入</div>";
                } else {
                    rd.innerHTML = "<div style='color:#4ade80'>已确定答案！</div>";
                }
                return;
            }
            if (result.recommendations && result.recommendations.length > 0) {
                var html = "";
                for (var i = 0; i < result.recommendations.length; i++) {
                    var r = result.recommendations[i];
                    html += '<div class="rec-item' + (i === 0 ? " rec-top" : "") + '"><span class="rec-name">' + r.player.name + "</span>" +
                        (r.player.team ? ' <span class="rec-team">(' + r.player.team + ")</span>" : "") +
                        ' <span class="rec-score">' + r.score.toFixed(2) + "</span></div>";
                }
                rd.innerHTML = html;
            } else {
                rd.innerHTML = "<div style='color:#888'>无推荐</div>";
            }
        }
        if (rs) rs.textContent = result.remaining + " 人";
        if (rds) rds.textContent = result.round;
    }

    // ===== Show best first guess (with retry for async load) =====
    function showBestFirstGuess() {
        if (!_players || _players.length === 0) {
            // Players not loaded yet, retry later
            setTimeout(showBestFirstGuess, 500);
            return;
        }
        var div = buildDiv(_candidates);
        var best = null, bestScore = -1;
        for (var i = 0; i < _players.length; i++) {
            var s = scoreOne(_candidates, _players[i], div);
            if (s > bestScore) { bestScore = s; best = _players[i]; }
        }
        var rd = document.getElementById("shnl-recommendations");
        if (rd && best) {
            rd.innerHTML = '<div class="rec-item rec-top"><span class="rec-name">' + best.name + '</span>' +
                (best.team ? ' <span class="rec-team">(' + best.team + ")</span>" : "") +
                ' <span class="rec-score">' + bestScore.toFixed(2) + "</span></div>";
        }
    }

    // ===== UI (simple: show recommendations, click to fill) =====
    function createUI() {
        var panel = document.createElement("div");
        panel.id = "shnl-helper-panel";
        panel.innerHTML =
            '<div class="panel-header"><h3>CS 猜人助手 v3.0</h3></div>' +
            '<div id="shnl-status" class="stat"><span>状态：</span><span class="status-warn">加载数据中...</span></div>' +
            '<div id="shnl-round" class="stat"><span>回合：</span><span>0</span></div>' +
            '<div id="shnl-remaining" class="stat"><span>剩余候选：</span><span>645</span></div>' +
            '<div class="section-title">推荐（点击填入）</div>' +
            '<div id="shnl-recommendations">等待反馈...</div>';

        var css = document.createElement("style");
        css.textContent =
            "#shnl-helper-panel{position:fixed;top:80px;right:10px;width:300px;max-height:85vh;overflow-y:auto;background:#1a1a2e;border:1px solid #444;border-radius:8px;padding:12px;z-index:99999;font-family:'Microsoft YaHei','Segoe UI',sans-serif;font-size:13px;color:#e0e0e0;box-shadow:0 4px 20px rgba(0,0,0,.6)}" +
            ".panel-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;cursor:move}" +
            ".panel-header h3{margin:0;font-size:14px;color:#ffd700}" +
            ".stat{margin:4px 0;display:flex;justify-content:space-between}" +
            ".section-title{margin-top:10px;font-weight:700;color:#ffd700;border-bottom:1px solid #333;padding-bottom:2px}" +
            ".rec-item{padding:6px 8px;margin:3px 0;background:#16213e;border-radius:4px;cursor:pointer;font-size:12px;transition:background .15s}" +
            ".rec-item:hover{background:#0f3460}" +
            ".rec-top{border-left:3px solid #ffd700}" +
            ".rec-name{color:#00d2ff;font-weight:600}" +
            ".rec-team{color:#aaa;font-size:11px}" +
            ".rec-score{float:right;color:#ffd700}" +
            ".status-ok{color:#4ade80}.status-warn{color:#fbbf24}.status-err{color:#f87171}";
        document.head.appendChild(css);
        document.body.appendChild(panel);

        // Click handler for recommendations - fill input with clicked name
        var recsDiv = document.getElementById("shnl-recommendations");
        recsDiv.addEventListener("click", function (e) {
            // Find the nearest element containing a player name
            var nameEl = e.target.closest ? e.target.closest("[class*='rec-name'], [class*='rec-item']") : null;
            if (!nameEl || nameEl === recsDiv) {
                // Manual traversal fallback
                for (var el = e.target; el && el !== recsDiv; el = el.parentNode) {
                    if (el.classList && (el.classList.contains("rec-item") || el.querySelector(".rec-name"))) { nameEl = el; break; }
                }
            }
            if (!nameEl || nameEl === recsDiv) return;
            var name = (nameEl.querySelector ? nameEl.querySelector(".rec-name") : null);
            if (!name) name = nameEl.classList.contains("rec-name") ? nameEl : null;
            if (!name) return;
            var playerName = name.textContent.trim();
            if (!playerName) return;
            // Fill input
            var input = document.querySelector("input[placeholder*='昵称'], input[placeholder*='nickname'], input[placeholder*='输入'], input[type='text'], input[type='search']");
            if (!input) return;
            input.focus();
            var proto = window.HTMLInputElement.prototype;
            var nativeSetter = Object.getOwnPropertyDescriptor(proto, "value").set;
            if (nativeSetter) nativeSetter.call(input, playerName); else input.value = playerName;
            if (input._valueTracker) input._valueTracker.setValue("");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
    }

    // ===== Game watcher =====
    function watchGame() {
        setInterval(function () {
            var table = document.querySelector("table.game-table tbody, table[class*='game-table'] tbody");
            var exists = !!table;
            var rows = table ? table.querySelectorAll("tr") : [];
            var rowCount = rows.length;

            // Detect game restart: table disappeared + has a play-again button
            if (exists === false) {
                var btns = document.querySelectorAll("button");
                var hasReset = false;
                var resetWords = ["再来一把", "play again", "重新开始", "新游戏", "主菜单"];
                for (var bi = 0; bi < btns.length; bi++) {
                    var b = btns[bi];
                    if (b.offsetParent === null) continue;
                    var t = b.textContent.trim().toLowerCase();
                    for (var wi = 0; wi < resetWords.length; wi++)
                        if (t.indexOf(resetWords[wi]) !== -1) { hasReset = true; break; }
                    if (hasReset && b.offsetParent !== null) break;
                }
                if (hasReset) {
                    _candidates = _players.slice();
                    _round = 0;
                    _guessCount = 0;
                    _colKeys = null;
                    var rs = document.querySelector("#shnl-remaining span:last-child");
                    if (rs) rs.textContent = _players.length + " 人";
                    var rds = document.querySelector("#shnl-round span:last-child");
                    if (rds) rds.textContent = "0";
                    setStatus("就绪（离线）", "ok");
                    // Show best first guess
                    showBestFirstGuess();
                    return;
                }
            }

            // Track last row count to detect table clearing (multi-round)
            if (exists && rowCount === 0 && _lastRowCount > 0 && _round > 0) {
                // Table was cleared for a new round
                _candidates = _players.slice();
                _round = 0;
                _guessCount = 0;
                _colKeys = null;
                _lastRowCount = 0;
                var rs = document.querySelector("#shnl-remaining span:last-child");
                if (rs) rs.textContent = _players.length + " 人";
                var rds = document.querySelector("#shnl-round span:last-child");
                if (rds) rds.textContent = "0";
                showBestFirstGuess();
                return;
            }
            _lastRowCount = rowCount;

            // Detect round number from UI (multiplayer: "第 X 局进行中")
            var roundMatch = document.body.textContent.match(/第\s*(\d+)\s*局/);
            var currentRound = roundMatch ? parseInt(roundMatch[1], 10) : 0;
            if (currentRound > 0 && _lastRoundNum > 0 && currentRound !== _lastRoundNum) {
                // Round changed → new game round started
                _candidates = _players.slice();
                _round = 0;
                _guessCount = 0;
                _colKeys = null;
                _lastRowCount = 0;
                var rs = document.querySelector("#shnl-remaining span:last-child");
                if (rs) rs.textContent = _players.length + " 人";
                var rds = document.querySelector("#shnl-round span:last-child");
                if (rds) rds.textContent = "0";
                showBestFirstGuess();
            }
            _lastRoundNum = currentRound;

            if (exists && rowCount > _guessCount) {
                var guesses = extractGuesses();
                if (guesses && guesses.length > 0) {
                    _guessCount = rowCount;
                    onNewGuesses(guesses);
                }
            }
        }, 600);
    }

    // ===== Init =====
    function init() {
        createUI();
        loadPlayers(function () {
            setStatus("就绪（离线）", "ok");
            var r = document.querySelector("#shnl-remaining span:last-child");
            if (r) r.textContent = _players.length + " 人";
            showBestFirstGuess();
        });
    }

    // Start watcher
    watchGame();

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
