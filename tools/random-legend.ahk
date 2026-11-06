; Random legend picker for Brawlhalla (Windows, AutoHotkey v2: https://www.autohotkey.com)
; Picks a legend with Windows' cryptographic random generator and clicks it on the character
; select screen. The game remembers each legend's stance, so set each one's best stance once
; (the tracker tells you which) and every random pick starts with the right stance.
;
; Setup, once per screen resolution (play in windowed or borderless mode):
;   1. Open character select.
;   2. Hover Bödvar (the first legend) and press F8.
;   3. Hover the legend to the right of Bödvar and press F8.
;   4. Hover the legend under Bödvar and press F8, then type how many legends are in a row.
; Then on character select press F9 to pick. Esc cancels setup.
; Legends you don't own: add them to Exclude= in random-legend.ini, separated by commas.
#Requires AutoHotkey v2.0
#SingleInstance Force
CoordMode "Mouse", "Client"

; Champ select order, from the tracker's legends.js: [name, best stance]
LEGENDS := [
    ["Bödvar", "Strength or Super Speed"],
    ["Cassidy", "Super Defense or Dexterity"],
    ["Orion", "Strength"],
    ["Lord Vraxx", "Super Strength"],
    ["Gnash", "Strength"],
    ["Queen Nai", "Super Speed"],
    ["Hattori", "Defense"],
    ["Sir Roland", "Super Speed"],
    ["Scarlet", "Speed"],
    ["Thatch", "Super Defense"],
    ["Ada", "Super Defense"],
    ["Sentinel", "Super Strength"],
    ["Lucien", "Super Strength"],
    ["Teros", "Super Speed or Super Strength"],
    ["Brynn", "Super Strength (2v2) / Dex (1v1)"],
    ["Asuri", "Super Strength"],
    ["Barraza", "Super Strength or Speed"],
    ["Ember", "Super Defense"],
    ["Azoth", "Super Speed or Super Strength"],
    ["Koji", "Defense"],
    ["Ulgrim", "Strength"],
    ["Diana", "Super Strength or Speed"],
    ["Jhala", "Super Defense"],
    ["Kor", "Strength or Speed"],
    ["Wu Shang", "Strength"],
    ["Val", "Super Strength"],
    ["Ragnir", "Super Strength"],
    ["Cross", "Base"],
    ["Mirage", "Super Defense"],
    ["Nix", "Super Strength or Super Defense"],
    ["Mordex", "Super Strength"],
    ["Yumiko", "Super Strength"],
    ["Artemis", "Super Defense"],
    ["Caspian", "Defense"],
    ["Sidra", "Base or Super Strength"],
    ["Xull", "Speed or Super Defense"],
    ["Kaya", "Super Strength"],
    ["Isaiah", "Super Strength or Super Speed"],
    ["Jiro", "Super Defense"],
    ["Lin Fei", "Super Strength"],
    ["Zariel", "Speed"],
    ["Rayman", "Strength"],
    ["Dusk", "Super Defense"],
    ["Fait", "Super Strength (1v1) / Super Defense (2v2)"],
    ["Thor", "Speed"],
    ["Petra", "Super Defense or Defense"],
    ["Vector", "Super Strength or Speed"],
    ["Volkov", "Super Strength"],
    ["Onyx", "Super Strength"],
    ["Jaeyun", "Super Strength or Super Defense"],
    ["Mako", "Super Defense"],
    ["Magyar", "Super Strength or Speed"],
    ["Reno", "Super Defense"],
    ["Munin", "Super Defense"],
    ["Arcadia", "Super Defense"],
    ["Ezio", "Super Defense"],
    ["Tezca", "Super Strength"],
    ["Thea", "Super Defense, Super Speed, or Base"],
    ["Red Raptor", "Super Defense"],
    ["Loki", "Strength"],
    ["Seven", "Super Strength or Super Speed"],
    ["Vivi", "Strength or Defense"],
    ["Imugi", "Super Speed"],
    ["King Zuva", "Super Speed"],
    ["Priya", "Super Strength"],
    ["Ransom", "Super Defense"],
    ["Lady Vera", "Super Strength"],
    ["Rupture", "Super Defense"],
    ["Aurus", "Super Speed or Super Strength"],
    ["Qinghua & Baobao", "Super Dexterity or Super Defense"]
]
INI := A_ScriptDir "\random-legend.ini"
RECENT_MAX := 5 ; don't repeat any of the last few picks
recent := []
calib := []

CryptoRandom(n) {
    ; Uniform 0..n-1 from RtlGenRandom; values past the last full multiple of n are redrawn
    buf := Buffer(4)
    limit := 0x100000000 - Mod(0x100000000, n)
    loop {
        DllCall("advapi32\SystemFunction036", "Ptr", buf, "UInt", 4)
        v := NumGet(buf, 0, "UInt")
        if (v < limit)
            return Mod(v, n)
    }
}

Excluded() {
    out := Map()
    for name in StrSplit(IniRead(INI, "Picker", "Exclude", ""), ",")
        if (Trim(name) != "")
            out[Trim(name)] := true
    return out
}

Say(text, ms := 2500) {
    ToolTip text
    SetTimer () => ToolTip(), -ms
}

#HotIf WinActive("ahk_exe Brawlhalla.exe")

F8:: {
    global calib
    MouseGetPos &x, &y
    calib.Push([x, y])
    if (calib.Length = 1)
        return Say("Got Bödvar. Now hover the legend to his right and press F8.", 6000)
    if (calib.Length = 2)
        return Say("Now hover the legend under Bödvar and press F8.", 6000)
    cols := InputBox("How many legends are in one row of the grid?", "Random legend", "w300 h120")
    if (cols.Result != "OK" || !IsInteger(cols.Value) || cols.Value < 2) {
        calib := []
        return Say("Setup cancelled. Start again with F8 on Bödvar.")
    }
    IniWrite calib[1][1], INI, "Grid", "X"
    IniWrite calib[1][2], INI, "Grid", "Y"
    IniWrite calib[2][1] - calib[1][1], INI, "Grid", "StepX"
    IniWrite calib[3][2] - calib[1][2], INI, "Grid", "StepY"
    IniWrite cols.Value, INI, "Grid", "Columns"
    if (IniRead(INI, "Picker", "Exclude", "?") = "?")
        IniWrite "", INI, "Picker", "Exclude"
    calib := []
    Say("Saved. Press F9 on character select to pick a random legend.")
}


F9:: {
    global recent
    cols := IniRead(INI, "Grid", "Columns", 0)
    if (!cols)
        return Say("Set up the grid first: hover Bödvar on character select and press F8.", 4000)
    skip := Excluded()
    pool := []
    for i, l in LEGENDS {
        seen := false
        for r in recent
            seen := seen || r = i
        if (!skip.Has(l[1]) && !seen)
            pool.Push(i)
    }
    if (!pool.Length) ; everything excluded or recent: ignore the recent list
        for i, l in LEGENDS
            if (!skip.Has(l[1]))
                pool.Push(i)
    if (!pool.Length)
        return Say("Every legend is excluded in random-legend.ini.")
    i := pool[CryptoRandom(pool.Length) + 1]
    recent.Push(i)
    if (recent.Length > RECENT_MAX)
        recent.RemoveAt(1)
    x := IniRead(INI, "Grid", "X") + Mod(i - 1, cols) * IniRead(INI, "Grid", "StepX")
    y := IniRead(INI, "Grid", "Y") + ((i - 1) // cols) * IniRead(INI, "Grid", "StepY")
    MouseMove x, y
    Sleep 80
    Click
    Say("🎲 " LEGENDS[i][1] " · best stance: " LEGENDS[i][2], 4000)
}

; Esc only belongs to the script while setup is in progress; otherwise it goes to the game
#HotIf WinActive("ahk_exe Brawlhalla.exe") && calib.Length
Esc:: {
    global calib
    calib := []
    Say("Setup cancelled.")
}

#HotIf
