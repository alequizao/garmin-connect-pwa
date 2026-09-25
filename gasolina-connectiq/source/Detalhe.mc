//
// Gasolina Perto · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
// https://github.com/alequizao · © 2026 Alequizao. Todos os direitos reservados.
//
// Um posto: nome, preço, distância ao vivo, idade do preço e a seta até o posto.
// A seta usa a bússola (se o relógio tiver) ou o rumo do GPS andando. Parado e sem
// bússola ela fica "norte para cima" e a tela mostra a direção cardeal (N, NE, L...).
//
using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Timer;
using Toybox.Math;

class Detalhe extends WatchUi.View {
    hidden var mTimer = null;

    function initialize() { View.initialize(); }

    function onShow() {
        mTimer = new Timer.Timer();
        mTimer.start(method(:tique), 500, true);
    }

    function onHide() {
        if (mTimer != null) { mTimer.stop(); mTimer = null; }
    }

    function tique() { WatchUi.requestUpdate(); }

    function onUpdate(dc) {
        var W = dc.getWidth(), H = dc.getHeight(), g = W > 260;
        dc.setColor(cTx, Graphics.COLOR_BLACK);
        dc.clear();
        if (gP == null || gP.size() == 0) { WatchUi.popView(WatchUi.SLIDE_RIGHT); return; }
        if (gSel >= gP.size()) { gSel = 0; }
        var p = gP[gSel];
        var cj = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        cabecalho(dc, W, H, COMB[gC - 1], false);
        dc.setColor(cTx, Graphics.COLOR_TRANSPARENT);
        dc.drawText(W / 2, H * 26 / 100, g ? Graphics.FONT_SMALL : Graphics.FONT_TINY, p[0], cj);

        // seta
        var cx = W / 2, cy = H * 49 / 100, r = H * 13 / 100;
        var km = p[2].toFloat(), txt = null;
        dc.setPenWidth(g ? 3 : 2);
        dc.setColor(g ? 0x1E3A2A : Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, r);
        dc.setPenWidth(1);
        if (gLat == null) {
            dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, cy, Graphics.FONT_MEDIUM, "?", cj);
            txt = "sem GPS";
        } else {
            km = distKm(gLat, gLon, p[3], p[4]);
            var b = rumo(gLat, gLon, p[3], p[4]);
            var h = rumoAtual();
            if (km < 0.04) {
                dc.setColor(cAc, Graphics.COLOR_TRANSPARENT);
                dc.fillCircle(cx, cy, r * 45 / 100);
                txt = "você chegou";
            } else {
                if (h == null) {   // norte para cima: marca o N dentro do aro e mostra a direção cardeal
                    dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
                    dc.drawText(cx, cy - r + (g ? 18 : 9), Graphics.FONT_XTINY, "N", cj);
                    txt = "fica a " + cardeal(b);
                } else {
                    txt = "siga a seta";
                }
                seta(dc, cx, cy, r * 72 / 100, (h != null) ? b - h : b);
            }
        }

        // preço
        var fp = Graphics.FONT_LARGE, fr = g ? Graphics.FONT_TINY : Graphics.FONT_XTINY;
        var sp = fmtPreco(p[1]);
        var wr = dc.getTextWidthInPixels("R$ ", fr), wp = dc.getTextWidthInPixels(sp, fp);
        var xp = W / 2 - (wr + wp) / 2, yp = H * 71 / 100;
        dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
        dc.drawText(xp, yp, fr, "R$ ", Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText(xp + wr, yp, fp, sp, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.setColor(cTx, Graphics.COLOR_TRANSPARENT);
        dc.drawText(W / 2, H * 81 / 100, Graphics.FONT_XTINY, fmtKm(km) + " · " + txt, cj);
        dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
        dc.drawText(W / 2, H * 88 / 100, Graphics.FONT_XTINY, "preço " + fmtHa(p[5]), cj);
    }

    // seta cheia apontando para "ang" graus (0 = para cima), girada em volta de (cx, cy)
    hidden function seta(dc, cx, cy, r, ang) {
        var a = Math.toRadians(ang), s = Math.sin(a), c = Math.cos(a);
        var pts = [[0, -r], [r * 6 / 10, r * 7 / 10], [0, r * 3 / 10], [-r * 6 / 10, r * 7 / 10]];
        var out = new [4];
        for (var i = 0; i < 4; i++) {
            var x = pts[i][0], y = pts[i][1];
            out[i] = [(cx + x * c - y * s).toNumber(), (cy + x * s + y * c).toNumber()];
        }
        dc.setColor(cAc, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon(out);
    }
}

class DetalheDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }

    // ▲▼ (ou deslizar) trocam de posto sem voltar à lista
    function onNextPage() { if (gP != null && gP.size() > 0) { gSel = (gSel + 1) % gP.size(); } WatchUi.requestUpdate(); return true; }
    function onPreviousPage() { if (gP != null && gP.size() > 0) { gSel = (gSel - 1 + gP.size()) % gP.size(); } WatchUi.requestUpdate(); return true; }
    function onSelect() { return true; }
    function onBack() { WatchUi.popView(WatchUi.SLIDE_RIGHT); return true; }
}
