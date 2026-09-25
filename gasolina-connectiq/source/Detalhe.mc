//
// Gasolina Perto · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
// https://github.com/alequizao · © 2026 Alequizao. Todos os direitos reservados.
//
// Um posto: nome, rosa-dos-ventos com a seta até o posto, anel de aproximação (quanto
// da distância inicial já foi percorrida), preço, distância ao vivo e idade do preço.
// A seta usa a bússola (se o relógio tiver) ou o rumo do GPS andando; parado e sem
// bússola ela fica "norte para cima" (triângulo branco = norte) e mostra "fica a NE".
// A menos de 50 m: "Você chegou" + vibração (uma vez por posto).
//
using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Math;

class Detalhe extends WatchUi.View {
    function initialize() { View.initialize(); }

    function onShow() { gDet = true; }
    function onHide() { gDet = false; }

    function onUpdate(dc) {
        var W = dc.getWidth(), H = dc.getHeight(), g = W > 260, xt = Graphics.FONT_XTINY;
        dc.setColor(cTx, Graphics.COLOR_BLACK);
        dc.clear();
        if (gP == null || gP.size() == 0) { WatchUi.popView(WatchUi.SLIDE_RIGHT); return; }
        if (gSel >= gP.size()) { gSel = 0; }
        var p = gP[gSel], o = desl(g ? 30 : 14);
        anel(dc, W, gSel, gP.size());
        cab(dc, W, COMB[gC - 1]);
        txt(dc, W, H * 26 / 100 + o, p[0], g ? Graphics.FONT_SMALL : Graphics.FONT_TINY, g ? Graphics.FONT_TINY : xt, cTx);

        // rosa-dos-ventos: trilho fino + 12 marcas giradas para o norte de verdade
        var cx = W / 2, cy = H * 47 / 100, r = H * 15 / 100;
        var km = p[2].toFloat(), t = "sem GPS", h = rumoAtual(), n0 = (h == null) ? 0 : h;
        dc.setPenWidth(g ? 2 : 1);
        dc.setColor(cLn, TR);
        dc.drawCircle(cx, cy, r);
        dc.setColor(cT3, TR);
        for (var k = 1; k < 12; k++) {
            var a = Math.toRadians(k * 30 - n0), s = Math.sin(a), c = Math.cos(a), l = r - 3 - ((k % 3 == 0) ? r / 6 : r / 12);
            dc.drawLine(cx + s * l, cy - c * l, cx + s * (r - 3), cy - c * (r - 3));
        }
        dc.setPenWidth(1);
        var an = Math.toRadians(-n0), sn = Math.sin(an), cn = Math.cos(an), q = r / 7 + 1;   // norte: triângulo branco
        dc.setColor(cTx, TR);
        dc.fillPolygon([[cx + sn * (r - 2), cy - cn * (r - 2)],
                        [cx + sn * (r - 3 * q) - cn * q, cy - cn * (r - 3 * q) - sn * q],
                        [cx + sn * (r - 3 * q) + cn * q, cy - cn * (r - 3 * q) + sn * q]]);

        if (gLat != null) {
            km = distKm(gLat, gLon, p[3], p[4]);
            // anel de aproximação: fração da distância (da consulta) já percorrida
            var f = p[2].toFloat();
            f = (f > 0.05) ? 1 - km / f : 0;
            if (f > 0.02) {
                dc.setPenWidth(g ? 4 : 3);
                dc.setColor(cAc, TR);
                dc.drawArc(cx, cy, r, Graphics.ARC_CLOCKWISE, 90, (450 - f * 360).toNumber() % 360);
                dc.setPenWidth(1);
            }
            if (km < 0.05) {
                dc.setColor(cAc, TR);
                dc.fillCircle(cx, cy, r * 45 / 100);
                dc.setColor(Graphics.COLOR_BLACK, TR);
                dc.setPenWidth(g ? 5 : 3);
                dc.drawLine(cx - r / 5, cy, cx - r / 16, cy + r / 7);
                dc.drawLine(cx - r / 16, cy + r / 7, cx + r / 5, cy - r / 7);
                dc.setPenWidth(1);
                t = "Você chegou";
                if (gCheg != gSel) { gCheg = gSel; vibrar(100); }
            } else {
                if (km > 0.1 && gCheg == gSel) { gCheg = -1; }
                t = (h == null) ? "fica a " + cardeal(rumo(gLat, gLon, p[3], p[4])) : "siga a seta";
                seta(dc, cx, cy, r * 58 / 100, rumo(gLat, gLon, p[3], p[4]) - n0);
            }
        } else {
            dc.setColor(cT3, TR);
            dc.drawText(cx, cy, Graphics.FONT_MEDIUM, "?", CJ);
        }

        preco(dc, cx, H * 685 / 1000 + o, p[1], g ? Graphics.FONT_LARGE : Graphics.FONT_NUMBER_MILD, g ? Graphics.FONT_TINY : xt, corPreco(p[1]));
        txt(dc, W, H * 805 / 1000, fmtKm(km) + " · " + t, xt, xt, (km < 0.05 && gLat != null) ? cAc : cTx);
        txt(dc, W, H * 885 / 1000, "preço " + fmtHa(p[5]), xt, xt, cT3);
    }

    // agulha fina apontando para "ang" graus (0 = para cima), girada em volta de (cx, cy)
    hidden function seta(dc, cx, cy, r, ang) {
        var a = Math.toRadians(ang), s = Math.sin(a), c = Math.cos(a);
        var pts = [[0, -r], [r * 45 / 100, r * 65 / 100], [0, r * 35 / 100], [-r * 45 / 100, r * 65 / 100]];
        for (var i = 0; i < 4; i++) {
            var x = pts[i][0], y = pts[i][1];
            pts[i] = [cx + x * c - y * s, cy + x * s + y * c];
        }
        dc.setColor(cAc, TR);
        dc.fillPolygon(pts);
    }
}

class DetalheDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }

    // ▲▼ (ou deslizar) trocam de posto sem voltar à lista
    function onNextPage() { andar(1); return true; }
    function onPreviousPage() { andar(-1); return true; }
    hidden function andar(d) {
        if (gP != null && gP.size() > 0) { gSel = (gSel + d + gP.size()) % gP.size(); trans(d); }
        WatchUi.requestUpdate();
    }
    function onSelect() { return true; }
    function onBack() { WatchUi.popView(WatchUi.SLIDE_RIGHT); return true; }
}
