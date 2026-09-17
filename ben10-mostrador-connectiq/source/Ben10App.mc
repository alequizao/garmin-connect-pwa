/*
 * Omnitrix Ben 10 (mostrador Connect IQ) · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * Mostrador inspirado no Omnitrix: aro cinza com 4 travas, ampulheta verde,
 * hora na metade de cima, minutos na de baixo, data/bateria/passos nas laterais,
 * FC embaixo e o "alien da hora" em cima. Bateria ≤ 20% = Omnitrix em recarga (vermelho).
 */
import Toybox.Activity;
import Toybox.ActivityMonitor;
import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

class Ben10App extends Application.AppBase {
    var view;
    function initialize() { AppBase.initialize(); }
    function onStart(state) { }
    function onStop(state) { }
    function getInitialView() { view = new Ben10View(); return [view]; }
    function onSettingsChanged() { if (view != null) { view.lerConfig(); } WatchUi.requestUpdate(); }
}

class Ben10View extends WatchUi.WatchFace {
    // <aliens>
    const NOMES = ["CHAMA", "BESTA", "DIAMANTE", "XLR8", "MASSA CINZENTA", "QUATRO BRAÇOS", "INSECTÓIDE", "AQUÁTICO", "ULTRA-T", "FANTASMÁTICO", "BALA DE CANHÃO", "CIPÓ SELVAGEM", "BLITZWOLFER", "SNARE-OH", "FRANKENSTRIKE", "GLUTÃO", "DITTO", "EYE GUY", "GIGANTE", "FOGO-FÁTUO", "ECO ECO", "HUMUNGOSSAURO", "ARRAIA-A-JATO", "FRIAGEM", "CROMASTONE", "BRAINSTORM", "MACACO-ARANHA", "GOSMA", "ALIEN X", "LODESTAR", "RATH", "NANOMECH", "WATER HAZARD", "AMPFIBIAN", "ARMODRILLO", "TERRASPIN", "NRG", "FASTTRACK", "CHAMALIEN", "CLOCKWORK", "EATLE", "JURYRIGG", "FEEDBACK", "BLOXX", "GRAVATTACK", "CRASHHOPPER", "BALL WEEVIL", "WALKATROUT", "PESKY DUST", "MOLE-STACHE", "THE WORST", "KICKIN HAWK", "TOEPICK", "ASTRODACTYL", "BULLFRAG", "ATOMIX", "GUTROT", "WHAMPIRE", "SHOCKSQUATCH"];
    const CORES = [0xFF5500, 0xFF8800, 0x00DDFF, 0x2288FF, 0xAAAAAA, 0xFF2222, 0xAAFF00, 0x00AAAA, 0x00FF55, 0xDDDDFF, 0xFFCC00, 0x33CC33, 0x8899AA, 0xCC9966, 0x66CC99, 0x66AA33, 0xFFFFFF, 0xFFDD55, 0xFF3333, 0x44BB22, 0xEEEEEE, 0xAA7744, 0xDD2222, 0x3399FF, 0xCC66FF, 0xFF8877, 0x3355DD, 0x77FF33, 0x222244, 0xAA3333, 0xFF9900, 0x88FF88, 0x3366AA, 0x66CCFF, 0xDDAA22, 0x99AA66, 0xFF4400, 0x3344AA, 0x9966CC, 0xCC9933, 0x664422, 0xFF3366, 0x2255FF, 0xFF5533, 0x886644, 0x77AA22, 0xDDBB33, 0x88BBAA, 0xFF99CC, 0xAA7755, 0xCCCC99, 0xCC5522, 0x553366, 0x33AA88, 0x44AA44, 0x99FF33, 0xAA8844, 0x6633AA, 0xEEEEFF];
    // </aliens>
    const DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

    var tema = 0;
    var mostrarAlien = true;
    var escolhido = 0;
    var dormindo = false;
    var queimaTela = false;
    var fonteNum = Graphics.FONT_NUMBER_MEDIUM;

    function initialize() {
        WatchFace.initialize();
        var ds = System.getDeviceSettings();
        if (ds has :requiresBurnInProtection) { queimaTela = ds.requiresBurnInProtection; }
        lerConfig();
    }

    function lerConfig() {
        try {
            var t = Application.Properties.getValue("tema"); if (t != null) { tema = t; }
            var a = Application.Properties.getValue("alien"); if (a != null) { mostrarAlien = a; }
            var esc = Application.Properties.getValue("escolhido"); if (esc != null) { escolhido = esc; }
        } catch (e) { }
    }

    function onLayout(dc) {
        // maior fonte numérica cuja altura útil cabe na metade da ampulheta
        var r = (dc.getWidth() < dc.getHeight() ? dc.getWidth() : dc.getHeight()) / 2;
        var fontes = [Graphics.FONT_NUMBER_THAI_HOT, Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD];
        fonteNum = Graphics.FONT_NUMBER_MILD;
        for (var i = 0; i < fontes.size(); i++) {
            var alt = Graphics.getFontAscent(fontes[i]) - Graphics.getFontDescent(fontes[i]) / 2;
            var larg = dc.getTextWidthInPixels("88", fontes[i]);
            if (alt <= r * 0.36 && larg <= r * 0.62) { fonteNum = fontes[i]; break; }
        }
    }

    function onEnterSleep() { dormindo = true; WatchUi.requestUpdate(); }
    function onExitSleep() { dormindo = false; WatchUi.requestUpdate(); }

    function idxAlien(hora) { return (escolhido > 0 && escolhido <= NOMES.size()) ? escolhido - 1 : (hora * NOMES.size()) / 24; }

    function corTema(hora) {
        if (tema == 1) { return 0xAAFF00; }
        if (tema == 2) { return 0x00AA22; }
        if (tema == 3) { return CORES[idxAlien(hora)]; }
        return 0x22FF44;
    }

    function onUpdate(dc) {
        var w = dc.getWidth(), h = dc.getHeight();
        var cx = w / 2, cy = h / 2;
        var r = (w < h ? w : h) / 2;
        if (dc has :setAntiAlias) { dc.setAntiAlias(true); }
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK); dc.clear();

        var agora = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        var bat = System.getSystemStats().battery;
        var recarga = bat <= 20;
        var verde = recarga ? 0xFF2200 : corTema(agora.hour);
        var aoCarregado = dormindo && queimaTela;

        // aro do Omnitrix
        if (!aoCarregado) {
            dc.setColor(0x555555, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, cy, r);
            dc.setColor(0x222222, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, cy, r * 0.86);
            // 4 travas nas diagonais
            dc.setColor(0x999999, Graphics.COLOR_TRANSPARENT);
            for (var k = 0; k < 4; k++) {
                var ang = Math.PI / 4 + k * Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang);
                var tx = -sa, ty = ca, rin = r * 0.87, rout = r * 0.99, lw = r * 0.07;
                dc.fillPolygon([[cx + ca * rin + tx * lw, cy + sa * rin + ty * lw], [cx + ca * rout + tx * lw, cy + sa * rout + ty * lw],
                                [cx + ca * rout - tx * lw, cy + sa * rout - ty * lw], [cx + ca * rin - tx * lw, cy + sa * rin - ty * lw]]);
            }
            dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, cy, r * 0.82);
        }
        dc.setColor(verde, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(r > 180 ? 3 : 2); dc.drawCircle(cx, cy, r * 0.82); dc.setPenWidth(1);

        // ampulheta
        var a = r * 0.50, b = r * 0.58, cin = r * 0.07;
        var pts = [[cx - a, cy - b], [cx + a, cy - b], [cx + cin, cy], [cx + a, cy + b], [cx - a, cy + b], [cx - cin, cy]];
        if (aoCarregado) {
            dc.setPenWidth(2);
            for (var i = 0; i < 6; i++) { var p = pts[i], q = pts[(i + 1) % 6]; dc.drawLine(p[0], p[1], q[0], q[1]); }
            dc.setPenWidth(1);
        } else {
            dc.fillPolygon(pts);
            // brilho
            dc.setColor(0xFFFFFF, Graphics.COLOR_TRANSPARENT);
            dc.fillPolygon([[cx - a * 0.78, cy - b * 0.9], [cx - a * 0.55, cy - b * 0.9], [cx - a * 0.72, cy - b * 0.72]]);
        }

        // hora (metade de cima) e minutos (de baixo)
        var hh = agora.hour;
        if (!System.getDeviceSettings().is24Hour) { hh = hh % 12; if (hh == 0) { hh = 12; } }
        var corNum = aoCarregado ? verde : Graphics.COLOR_BLACK;
        dc.setColor(corNum, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy - b * 0.58, fonteNum, hh.format("%02d"), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText(cx, cy + b * 0.58, fonteNum, agora.min.format("%02d"), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        if (aoCarregado) { return; }

        // laterais
        var fp = Graphics.FONT_TINY, fx = Graphics.FONT_XTINY;
        var lx = cx - r * 0.47, rx = cx + r * 0.47;
        var dias = DIAS[agora.day_of_week - 1];
        dc.setColor(0xBBBBBB, Graphics.COLOR_TRANSPARENT);
        dc.drawText(lx, cy - r * 0.02, fx, dias, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(lx, cy - r * 0.02 - Graphics.getFontHeight(fx) * 0.5 - Graphics.getFontHeight(fp) * 0.45, fp, agora.day.format("%d"), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.setColor(recarga ? 0xFF2200 : verde, Graphics.COLOR_TRANSPARENT);
        dc.drawText(rx, cy - r * 0.02 - Graphics.getFontHeight(fx) * 0.5 - Graphics.getFontHeight(fp) * 0.45, fp, bat.toNumber() + "%", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        var passos = ActivityMonitor.getInfo().steps;
        dc.setColor(0xBBBBBB, Graphics.COLOR_TRANSPARENT);
        var tp = passos == null ? "--" : (passos >= 10000 ? (passos / 1000).format("%d") + "K" : passos.format("%d"));
        dc.drawText(rx, cy - r * 0.02, fx, tp, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // FC embaixo
        var ai = Activity.getActivityInfo();
        var fc = (ai != null && ai.currentHeartRate != null) ? ai.currentHeartRate.format("%d") : "--";
        dc.setColor(0xFF3344, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + r * 0.70, fx, "FC " + fc, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // alien da hora (ou recarga) em cima — reduz a fonte se não couber na corda
        var txt = recarga ? "RECARREGANDO" : (mostrarAlien ? NOMES[idxAlien(agora.hour)] : "OMNITRIX");
        var cor = recarga ? 0xFF2200 : (mostrarAlien ? CORES[idxAlien(agora.hour)] : verde);
        var yt = cy - r * 0.70, meia = Math.sqrt(r * 0.82 * r * 0.82 - r * 0.66 * r * 0.66) * 0.95 * 2;
        var ft = dc.getTextWidthInPixels(txt, Graphics.FONT_TINY) <= meia ? Graphics.FONT_TINY : Graphics.FONT_XTINY;
        dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, yt, ft, txt, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }
}
