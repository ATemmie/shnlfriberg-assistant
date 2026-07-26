// ==UserScript==
// @name         shnlfriberg.online 猜人辅助助手
// @namespace    http://tampermonkey.net/
// @version      2.8
// @description  自动读取猜题反馈，连接到本地助手服务器，推荐最优猜测
// @match        https://shnlfriberg.online/*
// @icon         https://shnlfriberg.online/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      localhost
// @connect      127.0.0.1
// @connect      0.0.0.0
// @run-at       document-end
// ==/UserScript==

(function () {
    "use strict";

    var SERVERS = ["http://127.0.0.1:5000", "http://localhost:5000"];
    var DEFAULT_FIELDS = ["team", "nationality", "age", "role", "majorChampionships", "majorAppearances", "status"];
    var DEFAULT_COL_KEYS = [null, "team", "nationality", "age", "role", "majorChampionships", "majorAppearances", "status"];

    var _shnl_serverUrl = SERVERS[0];
    var _shnl_guessCount = 0;
    var _shnl_recommendation = "";
    var _shnl_eliminatedPool = [];
    var _shnl_matchHistory = {};
    var _shnl_autoFill = true;
    var _shnl_autoSubmit = true;
    var _shnl_confuse = false;
    var _shnl_confuseProb = 0;
    var _shnl_responseDelay = 1500;
    var _shnl_confusedGuesses = [];
    var _shnl_gameOver = false;
    var _shnl_firstGuessDone = false;
    var _shnl_resetCooldown = 0;
    var _shnl_panelPos = null;
    var _shnl_tabPos = null;
    var _shnl_gameActive = false;
    var _shnl_colKeys = null;
    var _shnl_colDetected = false;
    var _shnl_lastRowSent = -1;
    var _shnl_inputSelector = "input[placeholder*='昵称'], input[placeholder*='nickname'], input[placeholder*='输入'], input[placeholder*='search'], input[placeholder*='Search'], input[placeholder*='玩家'], input[type='text'], input[type='search'], input:not([type='checkbox']):not([type='radio']):not([type='submit']):not([type='button'])";
    var _shnl_submitBtnSelector = "form button[type='submit'], button:not(.confuse-btn):not(.retry-btn):not(.close-btn), button.btn-primary, button[class*='submit']";

    // ---- CSS class → level detection ----
    function detectLevel(cell) {
        var cls = (cell.className || "").toLowerCase();
        if (cls.indexOf("correct") !== -1) return "correct";
        if (cls.indexOf("close") !== -1) return "close";
        if (cls.indexOf("wrong") !== -1 || cls.indexOf("miss") !== -1) return "miss";
        return "";
    }

    // ---- Arrow detection from SVG paths ----
    function detectArrow(cell) {
        var svg = cell.querySelector("svg");
        if (!svg) return "";
        var paths = svg.querySelectorAll("path");
        var d = "";
        for (var i = 0; i < paths.length; i++) {
            d += paths[i].getAttribute("d") + "|";
        }
        if (d.indexOf("m5 12 7-7 7 7") !== -1 || d.indexOf("M12 19V5") !== -1) return "up";
        if (d.indexOf("M12 5v14") !== -1 || d.indexOf("m19 12-7 7-7-7") !== -1) return "down";
        return "";
    }

    // ---- Field keyword matching for header detection ----
    function fieldMatchesHeader(field, text) {
        switch (field) {
            case "team": return text === "team" || text.indexOf("team") !== -1;
            case "nationality": return text === "nationality" || text.indexOf("nation") !== -1 || text.indexOf("country") !== -1;
            case "age": return text === "age";
            case "role": return text === "role";
            case "majorChampionships": return (text.indexOf("championship") !== -1) || (text.indexOf("major") !== -1 && text.indexOf("appear") === -1);
            case "majorAppearances": return text.indexOf("appear") !== -1;
            case "status": return text === "status";
        }
        return false;
    }

    // ---- Detect column mapping from table headers ----
    function detectColKeys(table) {
        if (_shnl_colKeys) return _shnl_colKeys;

        var thead = table.querySelector("thead");
        if (!thead) { _shnl_colKeys = DEFAULT_COL_KEYS; _shnl_colDetected = false; return _shnl_colKeys; }

        var ths = thead.querySelectorAll("th");
        if (ths.length < 3) { _shnl_colKeys = DEFAULT_COL_KEYS; _shnl_colDetected = false; return _shnl_colKeys; }

        var fieldToCol = {};
        var ambiguous = [];

        for (var i = 0; i < ths.length; i++) {
            var t = ths[i].textContent.trim().toLowerCase();
            if (!t) continue;

            for (var f = 0; f < DEFAULT_FIELDS.length; f++) {
                var field = DEFAULT_FIELDS[f];
                if (fieldToCol[field] !== undefined) continue;
                if (fieldMatchesHeader(field, t)) {
                    fieldToCol[field] = i;
                    break;
                }
            }
        }

        var matchedCount = 0;
        for (var f = 0; f < DEFAULT_FIELDS.length; f++) {
            if (fieldToCol[DEFAULT_FIELDS[f]] !== undefined) matchedCount++;
        }

        if (matchedCount >= 5) {
            var maxCol = 0;
            for (var f in fieldToCol) {
                if (fieldToCol[f] > maxCol) maxCol = fieldToCol[f];
            }
            var colKeys = new Array(maxCol + 1).fill(null);
            for (var f in fieldToCol) {
                colKeys[fieldToCol[f]] = f;
            }
            _shnl_colKeys = colKeys;
            _shnl_colDetected = true;
            console.log("CS Helper: detected columns", JSON.stringify(colKeys));
        } else {
            _shnl_colKeys = DEFAULT_COL_KEYS;
            _shnl_colDetected = false;
            console.log("CS Helper: using default column order (matched " + matchedCount + ")");
        }

        return _shnl_colKeys;
    }

    function resetColKeys() {
        _shnl_colKeys = null;
        _shnl_colDetected = false;
    }

    // ---- Check if a guess is an all-correct win ----
    function checkGameWon(guess) {
        if (!guess || !guess.attributes) return false;
        for (var i = 0; i < DEFAULT_FIELDS.length; i++) {
            var attr = guess.attributes[DEFAULT_FIELDS[i]];
            if (!attr || attr.level !== "correct") return false;
        }
        return true;
    }

    // ---- Read guesses from DOM table ----
    function extractGuesses() {
        var table = document.querySelector("table.game-table, table[class*='game-table']");
        if (!table) return null;
        var tbody = table.querySelector("tbody");
        if (!tbody) return null;
        var rows = tbody.querySelectorAll("tr");
        if (rows.length === 0) return null;

        var colKeys = detectColKeys(table);
        var guesses = [];

        for (var ri = 0; ri < rows.length; ri++) {
            var cells = rows[ri].querySelectorAll("td");
            if (cells.length < 2) continue;

            var nickname = cells[0].textContent.trim().replace(/^混的入/, "").trim();
            if (!nickname) continue;
            if (_shnl_confusedGuesses.indexOf(nickname) !== -1) continue;

            var guess = { nickname: nickname, attributes: {} };
            var arrow = detectArrow(cells[0]);
            if (arrow) guess.nicknameArrow = arrow;

            for (var ci = 1; ci < cells.length; ci++) {
                var cell = cells[ci];
                var level = detectLevel(cell);
                if (!level) continue;

                var key = (ci < colKeys.length) ? colKeys[ci] : null;
                if (!key) continue;

                var attr = { level: level };
                var arrow2 = detectArrow(cell);
                if (arrow2) attr.hint = arrow2 === "up" ? "higher" : "lower";
                guess.attributes[key] = attr;
            }

            guesses.push(guess);
        }
        return guesses.length > 0 ? guesses : null;
    }

    // ---- Send feedback to server ----
    function sendFeedback(guesses) {
        var payload = { guesses: guesses };
        if (_shnl_eliminatedPool.length > 0) {
            payload.eliminatedPreview = true;
        }
        GM_xmlhttpRequest({
            method: "POST",
            url: _shnl_serverUrl + "/api/feedback",
            data: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
            timeout: 10000,
            onload: function (r) {
                try {
                    var resp = JSON.parse(r.responseText);
                    var recsDiv = document.getElementById("shnl-recommendations");
                    var remainingSpan = document.querySelector("#shnl-remaining span:last-child");
                    var roundSpan = document.querySelector("#shnl-round span:last-child");
                    if (!recsDiv) return;

                    if (resp.error) {
                        recsDiv.innerHTML = "<div style='color:#f87171'>" + resp.error + "</div>";
                        return;
                    }

                    // Check if the LAST guess has all fields correct
                    var lastGuess = guesses && guesses.length > 0 ? guesses[guesses.length - 1] : null;
                    var won = checkGameWon(lastGuess);

                    if (won) {
                        _shnl_gameOver = true;
                        var answerName = lastGuess.nickname;
                        _shnl_recommendation = answerName;
                        setTimeout(function () { autoFillRecommendation(); }, 500);
                        var opp = getOpponentName();
                        var hist = opp && _shnl_matchHistory[opp] ? _shnl_matchHistory[opp].length : 0;
                        recsDiv.innerHTML = "<div style='color:#4ade80'>已确定答案！" + (answerName ? " " + answerName : "") + (hist > 1 ? "（击败 " + opp + " " + hist + " 次）" : "") + "</div>";
                        if (opp && hist <= 1) recordMatch();
                    } else if (resp.recommendations && resp.recommendations.length > 0) {
                        var topRec = resp.recommendations[0];
                        _shnl_recommendation = topRec.name;
                        setTimeout(function () {
                            fillGameInput(topRec.name);
                            setTimeout(function () {
                                var items = document.querySelectorAll("ul.autocomplete-list li");
                                if (items.length > 0) {
                                    var match = null;
                                    for (var i = 0; i < items.length; i++) {
                                        if (items[i].textContent.trim().toLowerCase().indexOf(topRec.name.toLowerCase()) !== -1) {
                                            match = items[i]; break;
                                        }
                                    }
                                    if (!match) match = items[0];
                                    match.click();
                                    setTimeout(function () {
                                        var btn = document.querySelector("form.input-bar button");
                                        if (btn && !btn.disabled) { btn.click(); }
                                        else {
                                            var inp = document.querySelector("form.input-bar input");
                                            if (inp) inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
                                        }
                                    }, 400);
                                }
                            }, 600);
                        }, 300);

                        var html = "";
                        for (var i = 0; i < resp.recommendations.length; i++) {
                            var rec = resp.recommendations[i];
                            html += '<div class="rec-item' + (i === 0 ? " rec-top" : "") + '">';
                            html += '<span class="rec-name">' + rec.name + "</span>";
                            if (rec.team) html += ' <span class="rec-team">(' + rec.team + ")</span>";
                            if (rec.score !== undefined) html += ' <span class="rec-score">' + rec.score.toFixed(2) + "</span>";
                            if (rec.reasons) html += ' <div class="rec-reasons">' + rec.reasons.join("；") + "</div>";
                            html += "</div>";
                        }
                        recsDiv.innerHTML = html;
                        var topEl = recsDiv.querySelector(".rec-top .rec-name");
                        if (topEl) {
                            _shnl_recommendation = topEl.textContent.trim();
                            autoFillRecommendation();
                        }
                    } else {
                        recsDiv.innerHTML = "<div style='color:#888'>无推荐</div>";
                    }

                    if (remainingSpan) remainingSpan.textContent = resp.remaining !== undefined ? resp.remaining + " 人" : "-";
                    if (roundSpan) roundSpan.textContent = resp.round !== undefined ? resp.round : "0";
                    if (resp.eliminated_preview) _shnl_eliminatedPool = resp.eliminated_preview;

                    var previewDiv = document.getElementById("shnl-preview");
                    if (previewDiv && resp.candidates_preview) {
                        var ph = "";
                        for (var pi = 0; pi < resp.candidates_preview.length; pi++) {
                            var cp = resp.candidates_preview[pi];
                            ph += '<div class="preview-item">' + cp.name + (cp.team ? " (" + cp.team + ")" : "") + "</div>";
                        }
                        previewDiv.innerHTML = ph || "<div style='font-size:11px;color:#666'>无候选</div>";
                    }
                } catch (e) {
                    console.log("CS Helper: parse feedback failed", e);
                }
            },
            onerror: function () {
                var s = document.querySelector("#shnl-status span:last-child");
                if (s) { s.textContent = "连接失败"; s.className = "status-err"; }
            }
        });
    }

    // ---- Opponent name ----
    function getOpponentName() {
        var el = document.querySelector(".score-bar-player-right .player-id-text, [class*='score-bar'] [class*='player-right'] [class*='player-id']");
        return el ? el.textContent.trim() : null;
    }

    // ---- Match history ----
    function recordMatch() {
        var name = getOpponentName();
        if (!name) return;
        if (!_shnl_matchHistory[name]) _shnl_matchHistory[name] = [];
        _shnl_matchHistory[name].push(new Date().toISOString().slice(0, 19).replace("T", " "));
        saveSetting("matchHistory", _shnl_matchHistory);
        renderMatchHistory();
    }

    function renderMatchHistory() {
        var body = document.getElementById("shnl-history-body");
        var count = document.getElementById("shnl-history-count");
        if (!body) return;
        var names = Object.keys(_shnl_matchHistory);
        var total = 0;
        var html = "";
        for (var i = 0; i < names.length; i++) {
            var dates = _shnl_matchHistory[names[i]];
            total += dates.length;
            html += '<div class="history-item"><span class="h-name">' + names[i] + "</span> <span class='h-count'>\u00d7" + dates.length + "</span></div>";
        }
        body.innerHTML = html || '<div style="font-size:11px;color:#666">暂无记录</div>';
        if (count) count.textContent = "(" + total + ")";
        var clearBtn = document.getElementById("shnl-clear-history");
        if (clearBtn) clearBtn.style.display = total > 0 ? "block" : "none";
    }

    // ---- Confuse ----
    function maybeConfuse(name) {
        if (!_shnl_confuse || _shnl_confuseProb <= 0) return name;
        if (Math.random() * 100 >= _shnl_confuseProb) return name;
        if (_shnl_eliminatedPool.length === 0) return name;
        var pool = _shnl_eliminatedPool.filter(function (n) { return n !== name; });
        if (pool.length === 0) return name;
        var confused = pool[Math.floor(Math.random() * pool.length)];
        if (_shnl_confusedGuesses.indexOf(confused) === -1) _shnl_confusedGuesses.push(confused);
        return confused;
    }

    // ---- React-compatible input filling ----
    function getInputValue() {
        var input = document.querySelector(_shnl_inputSelector);
        return input ? input.value : null;
    }

    function setInputValue(input, value) {
        var proto = window.HTMLInputElement.prototype;
        var nativeSetter = Object.getOwnPropertyDescriptor(proto, "value").set;
        if (nativeSetter) {
            nativeSetter.call(input, value);
        } else {
            input.value = value;
        }
    }

    function notifyReactInput(input, value) {
        if (input._valueTracker) {
            input._valueTracker.setValue("");
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function findReactFiber(input) {
        var fiberKey = Object.keys(input).find(function (k) {
            return k.indexOf("__reactFiber") !== -1 || k.indexOf("__reactInternalInstance") !== -1;
        });
        if (!fiberKey) return null;
        return input[fiberKey];
    }

    function triggerReactOnChange(input, value) {
        var fiber = findReactFiber(input);
        if (!fiber) return false;
        var depth = 0;
        while (fiber && depth < 30) {
            var props = fiber.memoizedProps || {};
            if (typeof props.onChange === "function") {
                try {
                    props.onChange({ target: { value: value, name: input.name }, currentTarget: { value: value } });
                    return true;
                } catch (e) {}
            }
            fiber = fiber.return;
            depth++;
        }
        return false;
    }

    function attemptSetViaNative(input, value) {
        setInputValue(input, value);
        notifyReactInput(input, value);
        return input.value === value;
    }

    function attemptSetViaFiber(input, value) {
        var used = triggerReactOnChange(input, value);
        setInputValue(input, value);
        notifyReactInput(input, value);
        return used;
    }

    function attemptSetViaKeyEvents(input, value) {
        input.focus();
        input.select();
        for (var i = 0; i < value.length; i++) {
            var ch = value[i];
            input.dispatchEvent(new KeyboardEvent("keydown", { key: ch, code: "Key" + ch.toUpperCase(), bubbles: true }));
            input.dispatchEvent(new KeyboardEvent("keypress", { key: ch, code: "Key" + ch.toUpperCase(), bubbles: true }));
            var inputEvt = new InputEvent("beforeinput", { data: ch, inputType: "insertText", bubbles: true, cancelable: true });
            input.dispatchEvent(inputEvt);
            setInputValue(input, value.substring(0, i + 1));
            input.dispatchEvent(new InputEvent("input", { data: ch, inputType: "insertText", bubbles: true, composed: true }));
            input.dispatchEvent(new KeyboardEvent("keyup", { key: ch, code: "Key" + ch.toUpperCase(), bubbles: true }));
        }
        notifyReactInput(input, value);
        return input.value === value;
    }

    function attemptSetViaClipboard(input, value) {
        input.focus();
        input.select();
        var copied = false;
        function onCopy(e) { e.clipboardData.setData("text/plain", value); e.preventDefault(); copied = true; }
        document.addEventListener("copy", onCopy);
        document.execCommand("copy");
        document.removeEventListener("copy", onCopy);
        if (copied) {
            input.select();
            document.execCommand("paste");
        }
        notifyReactInput(input, value);
        return input.value === value;
    }

    function fillGameInput(name) {
        if (!name) return;
        var input = document.querySelector(_shnl_inputSelector);
        if (!input || input.type === "checkbox") return;
        input.focus();
        if (attemptSetViaFiber(input, name)) {
            console.log("CS Helper: fillGameInput -> fiber onChange succeeded");
            return;
        }
        if (attemptSetViaNative(input, name)) {
            console.log("CS Helper: fillGameInput -> native setter succeeded");
            return;
        }
        if (attemptSetViaKeyEvents(input, name)) {
            console.log("CS Helper: fillGameInput -> key events succeeded");
            return;
        }
        attemptSetViaClipboard(input, name);
    }

    function autoSubmitGuess() {
        if (_shnl_gameOver || Date.now() < _shnl_resetCooldown) return;
        var input = document.querySelector(_shnl_inputSelector);
        if (!input) return;
        function isSubmitBtn(b) {
            if (b.disabled) return false;
            var t = b.textContent.trim().toLowerCase();
            if (t.indexOf("再") !== -1 || t.indexOf("restart") !== -1 || t.indexOf("back") !== -1 || t.indexOf("返回") !== -1 || t.indexOf("主菜单") !== -1) return false;
            return t.indexOf("提") !== -1 || t.indexOf("submit") !== -1 || t.indexOf("guess") !== -1;
        }
        var btn = null, el = input.parentElement;
        while (el && !btn) {
            var kids = el.querySelectorAll("button");
            for (var i = 0; i < kids.length; i++) { if (isSubmitBtn(kids[i])) { btn = kids[i]; break; } }
            el = el.parentElement;
        }
        if (!btn) {
            var all = document.querySelectorAll("button");
            for (var i = 0; i < all.length; i++) { if (isSubmitBtn(all[i])) { btn = all[i]; break; } }
        }
        if (btn) { btn.click(); console.log("CS Helper: submit clicked"); }
    }

    // ---- First guess ----
    function doFirstGuess() {
        if (_shnl_firstGuessDone) return;
        var input = document.querySelector("input[placeholder*='昵称'], form.input-bar input");
        if (!input) { setTimeout(doFirstGuess, 600); return; }
        _shnl_firstGuessDone = true;
        var name = "friberg";
        fillGameInput(name);
        console.log("CS Helper: doFirstGuess -> " + name);
        setTimeout(function () {
            var list = document.querySelector("ul.autocomplete-list");
            if (list) {
                var items = list.querySelectorAll("li");
                for (var i = 0; i < items.length; i++) {
                    var t = items[i].textContent.trim().toLowerCase();
                    if (t.indexOf("friberg") !== -1) { items[i].click(); break; }
                }
            }
            setTimeout(function () {
                var submitBtn = null;
                var form = input.closest ? input.closest("form") : null;
                if (form) {
                    var btns = form.querySelectorAll("button");
                    for (var j = 0; j < btns.length; j++) {
                        if (!btns[j].disabled) { submitBtn = btns[j]; break; }
                    }
                }
                if (!submitBtn) {
                    var all = document.querySelectorAll(_shnl_submitBtnSelector);
                    for (var k = 0; k < all.length; k++) {
                        var txt = all[k].textContent.trim().toLowerCase();
                        if (txt.indexOf("提") !== -1 || txt.indexOf("submit") !== -1 || txt.indexOf("guess") !== -1) {
                            submitBtn = all[k]; break;
                        }
                    }
                }
                if (submitBtn) { submitBtn.click(); console.log("CS Helper: first guess submitted via button"); }
                else {
                    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13, which: 13 }));
                    input.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, key: "Enter", keyCode: 13, which: 13 }));
                    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", keyCode: 13, which: 13 }));
                    console.log("CS Helper: first guess submitted via Enter key");
                }
                _shnl_guessCount = 1;
            }, 300);
        }, 600);
    }

    // ---- Auto-fill recommendation ----
    function autoFillRecommendation() {
        if (!_shnl_autoFill) return;
        var name = (_shnl_guessCount === 0 && !_shnl_recommendation) ? "friberg" : _shnl_recommendation;
        if (!name) return;
        name = maybeConfuse(name);
        if (_shnl_guessCount > 0) {
            var table = document.querySelector("table.game-table, table[class*='game-table']");
            if (!table) { setTimeout(autoFillRecommendation, 800); return; }
        }
        var input = document.querySelector(_shnl_inputSelector);
        if (!input) { setTimeout(autoFillRecommendation, 800); return; }
        console.log("CS Helper: auto-fill -> " + name);
        var delay = _shnl_guessCount === 0 ? 1000 : _shnl_responseDelay;
        setTimeout(function () {
            fillGameInput(name);
            // Auto-submit on ALL guesses (including first), not just after first
            if (_shnl_autoSubmit) setTimeout(function () {
                autoSubmitGuess();
                // first guess: retry a few times since button might be disabled initially
                if (_shnl_guessCount === 0) {
                    for (var retry_i = 1; retry_i <= 5; retry_i++) {
                        (function(r) { setTimeout(function() { autoSubmitGuess(); }, 600 + r * 400); })(retry_i);
                    }
                }
            }, 600);
        }, delay);
    }

    // ---- Create UI ----
    function createUI() {
        var panel = document.createElement("div");
        panel.id = "shnl-helper-panel";
        panel.innerHTML =
            '<div class="panel-header"><h3>CS 猜人助手 v2.7</h3><span class="close-btn" id="shnl-minimize-btn">&times;</span></div>' +
            '<div id="shnl-status" class="stat"><span>状态：</span><span class="status-warn">等待连接...</span></div>' +
            '<div id="shnl-round" class="stat"><span>回合：</span><span>0</span></div>' +
            '<div id="shnl-remaining" class="stat"><span>剩余候选：</span><span>-</span></div>' +
            '<label class="toggle"><input type="checkbox" id="shnl-autofill-cb" checked> 自动填入</label>' +
            '<label class="toggle"><input type="checkbox" id="shnl-autosubmit-cb"> 全自动（填入后提交）</label>' +
            '<label class="slider-label">回答延迟：<span class="slider-val" id="shnl-response-delay-val">1.5</span>s <input type="range" id="shnl-response-delay" min="0" max="5000" step="100" value="1500"></label>' +
            '<div class="confuse-box"><button class="confuse-btn" id="shnl-confuse-btn">混淆视听</button>' +
            '<label class="slider-label" style="margin-top:4px">混淆概率：<span class="slider-val" id="shnl-confuse-prob-val">0</span>% <input type="range" id="shnl-confuse-prob" min="0" max="100" step="5" value="0"></label></div>' +
            '<div class="section-title">推荐下一猜</div>' +
            '<div id="shnl-recommendations">等待反馈...</div>' +
            '<div class="section-title">候选列表</div>' +
            '<div id="shnl-preview">加载中...</div>' +
            '<button class="retry-btn" id="shnl-reconnect-btn">重新连接服务器</button>' +
            '<div class="section-title history-toggle" id="shnl-history-toggle"><span id="shnl-history-arrow">\u25b6</span> 匹配记录 <span id="shnl-history-count">(0)</span></div>' +
            '<div id="shnl-history-body" style="display:none"></div>' +
            '<button class="retry-btn" id="shnl-clear-history" style="display:none">清空记录</button>';

        var css = document.createElement("style");
        css.textContent =
            "#shnl-helper-panel{position:fixed;top:80px;right:10px;width:320px;max-height:85vh;overflow-y:auto;background:#1a1a2e;border:1px solid #444;border-radius:8px;padding:12px;z-index:99999;font-family:'Microsoft YaHei','Segoe UI',sans-serif;font-size:13px;color:#e0e0e0;box-shadow:0 4px 20px rgba(0,0,0,.6);user-select:none}" +
            "#shnl-helper-panel.minimized{display:none}" +
            "#shnl-helper-panel.dragging{transition:none!important;opacity:.9}" +
            ".panel-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;cursor:move}" +
            ".panel-header h3{margin:0;font-size:14px;color:#ffd700}" +
            ".close-btn{cursor:pointer;font-size:20px;color:#888;line-height:1}" +
            ".close-btn:hover{color:#ffd700}" +
            ".stat{margin:4px 0;display:flex;justify-content:space-between}" +
            ".section-title{margin-top:10px;font-weight:700;color:#ffd700;border-bottom:1px solid #333;padding-bottom:2px}" +
            ".history-toggle{cursor:pointer;user-select:none}" +
            ".history-toggle:hover{color:#ffd700}" +
            ".toggle{display:block;margin:6px 0;font-size:12px;color:#ccc;cursor:pointer}" +
            ".toggle input{vertical-align:middle;margin-right:4px;cursor:pointer}" +
            ".slider-label{display:block;font-size:11px;color:#ccc;margin:4px 0}" +
            ".slider-label input[type=range]{width:100%;margin:2px 0;height:4px;cursor:pointer;accent-color:#ffd700}" +
            ".slider-val{color:#ffd700;font-weight:700}" +
            ".confuse-box{margin:6px 0;padding:6px;border:1px solid #500;border-radius:4px;background:rgba(180,0,0,.08)}" +
            ".confuse-btn{width:100%;padding:4px 0;background:#6b0000;border:1px solid #a00;border-radius:4px;color:#ff6666;cursor:pointer;font-size:12px;text-align:center}" +
            ".confuse-btn:hover{background:#8b0000;color:#fff}" +
            ".confuse-btn.active{background:#8b0000;color:#fff;border-color:#f44}" +
            ".rec-item{padding:4px 6px;margin:2px 0;background:#16213e;border-radius:4px;cursor:pointer;font-size:12px}" +
            ".rec-item:hover{background:#0f3460}" +
            ".rec-top{border-left:3px solid #ffd700}" +
            ".rec-name{color:#00d2ff;font-weight:600}" +
            ".rec-team{color:#aaa;font-size:11px}" +
            ".rec-score{float:right;color:#ffd700}" +
            ".rec-reasons{font-size:10px;color:#7ecfff;margin-top:2px}" +
            ".status-ok{color:#4ade80}.status-warn{color:#fbbf24}.status-err{color:#f87171}" +
            ".history-item{display:flex;justify-content:space-between;font-size:11px;padding:2px 4px;border-bottom:1px solid #222}" +
            ".history-item .h-name{color:#00d2ff}.history-item .h-count{color:#ffd700}" +
            ".preview-item{font-size:11px;padding:3px 4px;color:#aaa;border-bottom:1px solid #1a1a2e;cursor:pointer;user-select:text}" +
            ".preview-item:hover{color:#ffd700;background:#16213e}" +
            ".retry-btn{width:100%;padding:6px;margin-top:8px;background:#333;border:1px solid #555;border-radius:4px;color:#ccc;cursor:pointer;font-size:12px}" +
            ".retry-btn:hover{background:#444;color:#fff}" +
            "#shnl-tab{position:fixed;top:80px;right:0;padding:8px 14px;background:#1a1a2e;border:1px solid #444;border-right:none;border-radius:6px 0 0 6px;color:#ffd700;font-size:13px;font-weight:700;cursor:pointer;z-index:99999;display:none;user-select:none;box-shadow:-2px 2px 8px rgba(0,0,0,.4)}" +
            "#shnl-tab:hover{background:#2a2a4e}#shnl-tab.dragging{transition:none!important}";

        document.head.appendChild(css);
        document.body.appendChild(panel);

        var tab = document.createElement("div");
        tab.id = "shnl-tab";
        tab.textContent = "CS 助手";
        document.body.appendChild(tab);
        var header = panel.querySelector(".panel-header");
        makeDraggable(panel, header, "panelPos");
        makeDraggable(tab, tab, "tabPos");

        document.getElementById("shnl-minimize-btn").addEventListener("click", function () {
            panel.classList.add("minimized");
            var pr = panel.getBoundingClientRect();
            tab.style.left = (pr.right - tab.offsetWidth) + "px";
            tab.style.top = pr.top + "px";
            tab.style.right = "auto";
            tab.style.display = "flex";
        });
        tab.addEventListener("click", function () {
            panel.classList.remove("minimized");
            var tr = tab.getBoundingClientRect();
            panel.style.left = (tr.right - panel.offsetWidth) + "px";
            panel.style.top = tr.top + "px";
            panel.style.right = "auto";
            tab.style.display = "none";
        });

        document.getElementById("shnl-autofill-cb").addEventListener("change", function () {
            _shnl_autoFill = this.checked;
            saveSetting("autoFill", _shnl_autoFill);
        });
        document.getElementById("shnl-autosubmit-cb").addEventListener("change", function () {
            _shnl_autoSubmit = this.checked;
            saveSetting("autoSubmit", _shnl_autoSubmit);
            if (this.checked) {
                var inp = document.querySelector("input[placeholder*='输入']");
                if (inp && inp.value.trim()) setTimeout(autoSubmitGuess, 200);
            }
        });

        document.getElementById("shnl-response-delay").addEventListener("input", function () {
            _shnl_responseDelay = parseInt(this.value);
            document.getElementById("shnl-response-delay-val").textContent = (_shnl_responseDelay / 1000).toFixed(1);
            saveSetting("responseDelay", _shnl_responseDelay);
        });
        document.getElementById("shnl-confuse-btn").addEventListener("click", function () {
            _shnl_confuse = !_shnl_confuse;
            this.classList.toggle("active");
            this.textContent = _shnl_confuse ? "混淆中" : "混淆视听";
            saveSetting("confuse", _shnl_confuse);
        });
        document.getElementById("shnl-confuse-prob").addEventListener("input", function () {
            _shnl_confuseProb = parseInt(this.value);
            document.getElementById("shnl-confuse-prob-val").textContent = _shnl_confuseProb;
            saveSetting("confuseProb", _shnl_confuseProb);
        });
        document.getElementById("shnl-reconnect-btn").addEventListener("click", function () {
            _shnl_serverUrl = SERVERS[0];
            startConnectionWatch();
        });
        document.getElementById("shnl-history-toggle").addEventListener("click", function () {
            var body = document.getElementById("shnl-history-body");
            var arrow = document.getElementById("shnl-history-arrow");
            var clearBtn = document.getElementById("shnl-clear-history");
            var show = body.style.display !== "block";
            body.style.display = show ? "block" : "none";
            if (clearBtn) clearBtn.style.display = show && Object.keys(_shnl_matchHistory).length > 0 ? "block" : "none";
            if (arrow) arrow.textContent = show ? "\u25bc" : "\u25b6";
        });

        document.getElementById("shnl-helper-panel").addEventListener("click", function (e) {
            if (e.target && e.target.id === "shnl-clear-history") {
                _shnl_matchHistory = {};
                saveSetting("matchHistory", _shnl_matchHistory);
                renderMatchHistory();
            }
        });
        var recsDiv = document.getElementById("shnl-recommendations");
        recsDiv.addEventListener("click", function (e) {
            var item = e.target.closest ? e.target.closest(".rec-item") : null;
            if (!item) {
                for (var el = e.target; el && el !== recsDiv; el = el.parentNode) {
                    if (el.classList && el.classList.contains("rec-item")) { item = el; break; }
                }
            }
            if (item) {
                var nameEl = item.querySelector(".rec-name");
                if (nameEl) {
                    _shnl_recommendation = nameEl.textContent.trim();
                    autoFillRecommendation();
                }
            }
        });
        var previewDiv = document.getElementById("shnl-preview");
        previewDiv.addEventListener("click", function (e) {
            var item = e.target.closest ? e.target.closest(".preview-item") : null;
            if (!item) {
                for (var el = e.target; el && el !== previewDiv; el = el.parentNode) {
                    if (el.classList && el.classList.contains("preview-item")) { item = el; break; }
                }
            }
            if (item) {
                var name = item.textContent.replace(/\(.*\)/, "").trim();
                _shnl_recommendation = name;
                autoFillRecommendation();
            }
        });
    }

    // ---- Draggable ----
    function makeDraggable(el, handle, key) {
        var down = false, ox, oy;
        handle.addEventListener("touchstart", function (e) { var r = el.getBoundingClientRect(); ox = (e.touches[0].clientX || 0) - r.left; oy = (e.touches[0].clientY || 0) - r.top; down = true; el.classList.add("dragging"); e.preventDefault(); }, { passive: false });
        handle.addEventListener("mousedown", function (e) {
            down = true;
            el.classList.add("dragging");
            var r = el.getBoundingClientRect();
            ox = e.clientX - r.left;
            oy = e.clientY - r.top;
            e.preventDefault();
        });
        document.addEventListener("mousemove", function (e) {
            if (!down) return;
            var x = e.clientX - ox, y = e.clientY - oy;
            var snap = 30, w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
            if (x < snap) x = 0;
            else if (x + w > vw - snap) x = vw - w;
            if (y < snap) y = 0;
            else if (y + h > vh - snap) y = vh - h;
            el.style.left = x + "px";
            el.style.top = y + "px";
            el.style.right = "auto";
            e.preventDefault();
        });
        document.addEventListener("mouseup", function () {
            if (!down) return;
            down = false;
            el.classList.remove("dragging");
            if (key) saveSetting(key, { left: el.style.left, top: el.style.top });
        });
    }

    // ---- Storage (GM storage + localStorage fallback) ----
    function saveSetting(k, v) {
        try { GM_setValue(k, v); } catch (e) { console.log("CS Helper: GM_setValue failed", e); }
        try { localStorage.setItem("shnl_" + k, JSON.stringify(v)); } catch (e) {}
    }

    function loadSettings() {
        // Try GM storage first, fall back to localStorage
        function getVal(k, fallback) {
            try {
                var v = GM_getValue(k);
                if (v !== undefined && v !== null) return v;
            } catch (e) {}
            try {
                var raw = localStorage.getItem("shnl_" + k);
                if (raw) return JSON.parse(raw);
            } catch (e) {}
            return fallback;
        }

        _shnl_autoFill = getVal("autoFill", true);
        _shnl_autoSubmit = getVal("autoSubmit", true);
        _shnl_responseDelay = getVal("responseDelay", 1500);
        _shnl_confuse = getVal("confuse", false);
        _shnl_confuseProb = getVal("confuseProb", 0);
        var hist = getVal("matchHistory", null);
        if (hist) _shnl_matchHistory = hist;
        var pp = getVal("panelPos", null);
        if (pp) _shnl_panelPos = pp;
        var tp = getVal("tabPos", null);
        if (tp) _shnl_tabPos = tp;

        var c = function (id) { return document.getElementById(id); };
        if (c("shnl-autofill-cb")) c("shnl-autofill-cb").checked = _shnl_autoFill;
        if (c("shnl-autosubmit-cb")) c("shnl-autosubmit-cb").checked = _shnl_autoSubmit;
        if (c("shnl-response-delay")) {
            c("shnl-response-delay").value = _shnl_responseDelay;
            if (c("shnl-response-delay-val")) c("shnl-response-delay-val").textContent = (_shnl_responseDelay / 1000).toFixed(1);
        }
        if (_shnl_confuse && c("shnl-confuse-btn")) { c("shnl-confuse-btn").classList.add("active"); c("shnl-confuse-btn").textContent = "混淆中"; }
        if (c("shnl-confuse-prob")) {
            c("shnl-confuse-prob").value = _shnl_confuseProb;
            if (c("shnl-confuse-prob-val")) c("shnl-confuse-prob-val").textContent = _shnl_confuseProb;
        }
        if (_shnl_panelPos && c("shnl-helper-panel")) {
            c("shnl-helper-panel").style.left = _shnl_panelPos.left;
            c("shnl-helper-panel").style.top = _shnl_panelPos.top;
            c("shnl-helper-panel").style.right = "auto";
        }
        if (_shnl_tabPos && c("shnl-tab")) {
            c("shnl-tab").style.left = _shnl_tabPos.left;
            c("shnl-tab").style.top = _shnl_tabPos.top;
            c("shnl-tab").style.right = "auto";
        }
        renderMatchHistory();
    }

    // ---- Game state watcher ----
    function watchGame() {
        var resetTimer = null;
        setInterval(function () {
            var table = document.querySelector("table.game-table tbody, table[class*='game-table'] tbody");
            var tableExists = !!table;
            var rows = table ? table.querySelectorAll("tr") : [];
            var rowCount = rows ? rows.length : 0;

            var resetWords = ["新游戏", "重置", "开始游戏", "play again", "restart", "next", "重来", "新一局", "返回主界面", "主菜单"];
            var hasReset = false;
            for (var i = 0; i < resetWords.length; i++) {
                if ((document.body.textContent || "").indexOf(resetWords[i]) !== -1) { hasReset = true; break; }
            }
            var btns = document.querySelectorAll("button");
            for (var bi = 0; bi < btns.length; bi++) {
                var t = btns[bi].textContent.toLowerCase();
                for (var j = 0; j < resetWords.length; j++) {
                    if (t.indexOf(resetWords[j]) !== -1) { hasReset = true; break; }
                }
            }

            var shouldReset = false;
            if (_shnl_gameActive && (!tableExists || (hasReset && rowCount === 0))) {
                shouldReset = true;
            }
            if (!_shnl_gameActive && tableExists && rowCount > 0) {
                _shnl_gameActive = true;
            }

            if (shouldReset) {
                console.log("CS Helper: game reset detected");
                _shnl_gameActive = false;
                _shnl_gameOver = false;
                _shnl_guessCount = 0;
                _shnl_recommendation = "";
                _shnl_eliminatedPool = [];
                _shnl_confusedGuesses = [];
                _shnl_lastRowSent = -1;
                _shnl_resetCooldown = Date.now() + 3000;
                resetColKeys();
                var rd = document.getElementById("shnl-recommendations");
                if (rd) rd.innerHTML = "等待反馈...";
                var pv = document.getElementById("shnl-preview");
                if (pv) pv.innerHTML = "";
                var rs = document.querySelector("#shnl-remaining span:last-child");
                if (rs) rs.textContent = "-";
                var rds = document.querySelector("#shnl-round span:last-child");
                if (rds) rds.textContent = "0";
                if (resetTimer) clearTimeout(resetTimer);
                resetTimer = setTimeout(function () {
                    _shnl_gameActive = true;
                    if (_shnl_autoFill) autoFillRecommendation();
                }, 1500);
                return;
            }

            if (tableExists && rowCount > _shnl_guessCount) {
                _shnl_guessCount = rowCount;
                var guesses = extractGuesses();
                if (guesses && guesses.length > 0) {
                    sendFeedback(guesses);
                }
            }
            tagConfusedRows();
        }, 600);
    }

    // ---- Connection ----
    function startConnectionWatch() {
        var statusSpan = document.querySelector("#shnl-status span:last-child");
        if (statusSpan) { statusSpan.textContent = "连接中..."; statusSpan.className = "status-warn"; }
        var tried = 0;
        function tryConnect() {
            if (tried >= SERVERS.length) {
                if (statusSpan) { statusSpan.textContent = "连接失败"; statusSpan.className = "status-err"; }
                return;
            }
            _shnl_serverUrl = SERVERS[tried];
            GM_xmlhttpRequest({
                method: "GET",
                url: _shnl_serverUrl + "/api/status",
                timeout: 3000,
                onload: function (r) {
                    if (r.status === 200) {
                        if (statusSpan) { statusSpan.textContent = "已连接"; statusSpan.className = "status-ok"; }
                        var gc = _shnl_guessCount;
                        var g = extractGuesses();
                        if (g && g.length > 0 && g.length > gc) sendFeedback(g);
                        else autoFillRecommendation();
                    } else { tried++; setTimeout(tryConnect, 500); }
                },
                onerror: function () { tried++; setTimeout(tryConnect, 500); },
                ontimeout: function () { tried++; setTimeout(tryConnect, 500); }
            });
        }
        tryConnect();
    }

    // ---- Input watcher ----
    function watchInput() {
        var observed = false;
        var obs = new MutationObserver(function () {
            var input = document.querySelector(_shnl_inputSelector);
            var tbl = document.querySelector("table.game-table, table[class*='game-table']");
            if (input && tbl && !observed) {
                observed = true;
                console.log("CS Helper: input + table found via MutationObserver");
                if (_shnl_autoFill && _shnl_guessCount === 0 && !_shnl_recommendation) {
                    autoFillRecommendation();
                }
            }
            if (!input || !tbl) observed = false;
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    // ---- Confused row tags ----
    function tagConfusedRows() {
        var table = document.querySelector("table.game-table tbody, table[class*='game-table'] tbody");
        if (!table) return;
        var rows = table.querySelectorAll("tr");
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].hasAttribute("data-shnl-tagged")) continue;
            var cells = rows[i].querySelectorAll("td");
            if (cells.length < 1) continue;
            var text = cells[0].textContent.trim();
            var clean = text.replace(/^混的入/, "").trim();
            if (_shnl_confusedGuesses.indexOf(clean) !== -1 && text.indexOf("混的入") === -1) {
                var span = document.createElement("span");
                span.textContent = "混的入";
                span.style.cssText = "color:#ff4444;font-size:10px;margin-left:4px;font-weight:700";
                cells[0].appendChild(span);
                rows[i].setAttribute("data-shnl-tagged", "1");
            }
        }
    }

    // ---- Init ----
    function init() {
        console.log("CS Helper v2.7: initializing");
        createUI();
        loadSettings();
        watchGame();
        watchInput();
        startConnectionWatch();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
