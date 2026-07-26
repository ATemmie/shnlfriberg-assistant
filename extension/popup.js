(function () {
    chrome.storage.local.get(null, function (items) {
        if (document.getElementById("autofill"))
            document.getElementById("autofill").checked = items.autoFill !== false;
        if (document.getElementById("autosubmit"))
            document.getElementById("autosubmit").checked = items.autoSubmit !== false;
    });

    document.getElementById("autofill").addEventListener("change", function () {
        chrome.storage.local.set({ autoFill: this.checked });
    });
    document.getElementById("autosubmit").addEventListener("change", function () {
        chrome.storage.local.set({ autoSubmit: this.checked });
    });
})();
