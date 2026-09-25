//
// Gasolina Perto · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
// https://github.com/alequizao · © 2026 Alequizao. Todos os direitos reservados.
//
// Tela principal: carregando (GPS → preços), lista dos mais baratos em carrossel,
// erro com "tentar de novo" e o menu de combustível.
//
using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.System;
using Toybox.Timer;
using Toybox.Application;
using Toybox.Lang;

class Tela extends WatchUi.View {
    hidden var mTimer = null;
    hidden var mTiques = 0;

    function initialize() { View.initialize(); }

    function onShow() {
        mTimer = new Timer.Timer();
        mTimer.start(method(:tique), 200, true);
        if (gPrimeira) { gPrimeira = false; gM.buscar(); }
    }

    function onHide() {
        if (mTimer != null) { mTimer.stop(); mTimer = null; }
    }

    // anima só enquanto há o que animar; parado, redesenha a cada 10 s ("há X min")
    function tique() {
        gM.tique();
        mTiques++;
        if (gBusca > 0 || gAviso != null || mTiques % 50 == 0) { WatchUi.requestUpdate(); }
    }

    function onUpdate(dc) {
        var W = dc.getWidth(), H = dc.getHeight();
        dc.setColor(cTx, Graphics.COLOR_BLACK);
        dc.clear();
        if (gMenu >= 0) {
            desenharMenu(dc, W, H);
        } else {
            cabecalho(dc, W, H, COMB[gC - 1], gBusca > 0 && gP != null);
            if (gP != null && gP.size() > 0) { desenharLista(dc, W, H); }
            else if (gErr != null && gBusca == 0) { desenharErro(dc, W, H); }
            else { desenharCarregando(dc, W, H); }
        }
        desenharAviso(dc, W, H);
    }

    // ---- carregando: anel girando com a bomba no meio ----
    hidden function desenharCarregando(dc, W, H) {
        var g = W > 260, cx = W / 2, cy = H * 45 / 100, r = W * 17 / 100;
        dc.setPenWidth(g ? 8 : 4);
        dc.setColor(g ? 0x1E3A2A : Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, r);
        var a = (System.getTimer() / 3) % 360;          // ângulos sempre em 0..359
        dc.setColor(gBusca == 2 ? cAm : cAc, Graphics.COLOR_TRANSPARENT);
        dc.drawArc(cx, cy, r, Graphics.ARC_CLOCKWISE, (450 - a) % 360, (350 - a + 360) % 360);
        dc.setPenWidth(1);
        var s = r * 9 / 10;
        bomba(dc, cx - s * 45 / 100, cy - s / 2, s, cAc, cAm);
        var f1 = g ? Graphics.FONT_SMALL : Graphics.FONT_TINY;
        dc.setColor(cTx, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 71 / 100, f1, gBusca == 2 ? "Consultando preços..." : "Buscando GPS...",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        var sub = "pelo celular";
        if (gBusca != 2) { sub = ((System.getTimer() - gIni) / 1000) + " s · céu aberto ajuda"; }
        dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 81 / 100, Graphics.FONT_XTINY, sub, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // ---- erro claro + como tentar de novo ----
    hidden function desenharErro(dc, W, H) {
        var g = W > 260, cx = W / 2, cy = H * 35 / 100, r = g ? 34 : 17;
        dc.setPenWidth(g ? 5 : 3);
        dc.setColor(cErr, Graphics.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, r);
        dc.setPenWidth(1);
        dc.fillRectangle(cx - (g ? 3 : 1), cy - r * 55 / 100, g ? 7 : 4, r * 7 / 10);
        dc.fillCircle(cx, cy + r * 45 / 100, g ? 4 : 2);
        dc.drawText(cx, H * 55 / 100, g ? Graphics.FONT_MEDIUM : Graphics.FONT_SMALL, gErr[0],
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(cTx, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 69 / 100, Graphics.FONT_XTINY, gErr[1], Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(cAc, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 86 / 100, Graphics.FONT_XTINY, "START: tentar de novo", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // ---- lista em carrossel: o selecionado grande no cartão, vizinhos acima/abaixo ----
    hidden function desenharLista(dc, W, H) {
        var g = W > 260, n = gP.size();
        if (gSel >= n) { gSel = 0; }
        var cx = W / 2;
        if (gSel > 0) { vizinho(dc, cx, H * 23 / 100, gP[gSel - 1]); }
        if (gSel < n - 1) { vizinho(dc, cx, H * 76 / 100, gP[gSel + 1]); }

        var x0 = W * 8 / 100, yC = H * 31 / 100, wC = W - 2 * x0, hC = H * 38 / 100, rr = g ? 18 : 9;
        dc.setColor(cCard, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x0, yC, wC, hC, rr);
        dc.setColor(cAc, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(g ? 3 : 2);
        dc.drawRoundedRectangle(x0, yC, wC, hC, rr);
        dc.setPenWidth(1);

        var p = gP[gSel];
        var cj = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.drawText(cx, yC + hC * 13 / 100, Graphics.FONT_XTINY, (gSel == 0) ? "MAIS BARATO" : (gSel + 1) + "º mais barato", cj);
        dc.setColor(cTx, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, yC + hC * 33 / 100, g ? Graphics.FONT_SMALL : Graphics.FONT_TINY, p[0], cj);
        // preço em destaque: "R$" pequeno + número grande em âmbar
        var fp = Graphics.FONT_LARGE, fr = g ? Graphics.FONT_TINY : Graphics.FONT_XTINY;
        var sp = fmtPreco(p[1]);
        var wr = dc.getTextWidthInPixels("R$ ", fr), wp = dc.getTextWidthInPixels(sp, fp);
        var xp = cx - (wr + wp) / 2, yp = yC + hC * 60 / 100;
        dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
        dc.drawText(xp, yp, fr, "R$ ", Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText(xp + wr, yp, fp, sp, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, yC + hC * 86 / 100, Graphics.FONT_XTINY, fmtKm(p[2]) + " · " + p[6], cj);

        // bolinhas de posição (direita)
        var r = g ? 5 : 3, passo = g ? 16 : 9, xd = W - (g ? 16 : 9);
        for (var k = 0; k < n; k++) {
            var yd = H / 2 + (k * 2 - (n - 1)) * passo / 2;
            if (k == gSel) { dc.setColor(cAc, Graphics.COLOR_TRANSPARENT); dc.fillCircle(xd, yd, r); }
            else { dc.setColor(cCz, Graphics.COLOR_TRANSPARENT); dc.drawCircle(xd, yd, r - 1); }
        }

        // rodapé: idade dos dados e raio (ou o que está acontecendo agora)
        var rod = fmtHa(gT) + " · até " + gR + " km", cr = cCz;
        if (gBusca == 1) { rod = "Buscando GPS..."; cr = cAm; }
        else if (gBusca == 2) { rod = "Atualizando..."; cr = cAm; }
        else if (gErr != null) { rod = gErr[0] + " · " + fmtHa(gT); cr = cErr; }
        dc.setColor(cr, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 89 / 100, Graphics.FONT_XTINY, rod, cj);
    }

    hidden function vizinho(dc, cx, y, p) {
        var nome = p[0];
        if (nome.length() > 12) { nome = nome.substring(0, 11) + "."; }
        dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, y, Graphics.FONT_XTINY, nome + "  " + fmtPreco(p[1]), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // ---- menu de combustível (0 = atualizar agora) ----
    hidden function desenharMenu(dc, W, H) {
        var g = W > 260;
        cabecalho(dc, W, H, "Combustível", false);
        var hR = H * 15 / 100, cj = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        for (var j = gMenu - 2; j <= gMenu + 2; j++) {
            if (j < 0 || j > 6) { continue; }
            var y = H / 2 + (j - gMenu) * hR + H * 3 / 100;
            var t = (j == 0) ? "Atualizar agora" : COMB[j - 1];
            if (j == gMenu) {
                var x0 = W * 10 / 100;
                dc.setColor(cCard, Graphics.COLOR_TRANSPARENT);
                dc.fillRoundedRectangle(x0, y - hR / 2 + 2, W - 2 * x0, hR - 4, g ? 14 : 7);
                dc.setColor(cAc, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(2);
                dc.drawRoundedRectangle(x0, y - hR / 2 + 2, W - 2 * x0, hR - 4, g ? 14 : 7);
                dc.setPenWidth(1);
                dc.setColor(cTx, Graphics.COLOR_TRANSPARENT);
                dc.drawText(W / 2, y, g ? Graphics.FONT_SMALL : Graphics.FONT_TINY, t, cj);
            } else {
                dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
                dc.drawText(W / 2, y, Graphics.FONT_XTINY, t, cj);
            }
            if (j == gC) {   // ✓ no combustível atual
                var xk = W * 80 / 100, s = g ? 8 : 4;
                dc.setColor(cAc, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(g ? 3 : 2);
                dc.drawLine(xk - s, y, xk - s / 3, y + s * 2 / 3);
                dc.drawLine(xk - s / 3, y + s * 2 / 3, xk + s, y - s * 2 / 3);
                dc.setPenWidth(1);
            }
        }
    }
}

class TelaDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }

    function onNextPage() { mover(1); return true; }
    function onPreviousPage() { mover(-1); return true; }

    hidden function mover(d) {
        if (gMenu >= 0) { gMenu = (gMenu + d + 7) % 7; }
        else if (gP != null && gP.size() > 0) { gSel = (gSel + d + gP.size()) % gP.size(); }
        WatchUi.requestUpdate();
    }

    function onSelect() {
        if (gMenu >= 0) { escolher(); return true; }
        if (gP != null && gP.size() > 0) {
            WatchUi.pushView(new Detalhe(), new DetalheDelegate(), WatchUi.SLIDE_LEFT);
            return true;
        }
        if (gBusca == 0) { gM.buscar(); }
        return true;
    }

    // toque (FR165): no menu escolhe a linha tocada; na lista, acima/abaixo do cartão anda
    function onTap(evt) {
        var y = evt.getCoordinates()[1], H = System.getDeviceSettings().screenHeight;
        if (gMenu >= 0) {
            var hR = H * 15 / 100, dy = y - (H / 2 + H * 3 / 100);
            var j = gMenu + ((dy >= 0) ? (dy + hR / 2) / hR : -((hR / 2 - dy) / hR));
            if (j < 0 || j > 6) { return true; }
            gMenu = j; escolher(); return true;
        }
        if (gP != null && gP.size() > 0) {
            if (y < H * 30 / 100) { mover(-1); return true; }
            if (y > H * 70 / 100) { mover(1); return true; }
        }
        return onSelect();
    }

    function onMenu() {
        gMenu = gC;
        WatchUi.requestUpdate();
        return true;
    }

    function onBack() {
        if (gMenu >= 0) { gMenu = -1; WatchUi.requestUpdate(); return true; }
        return false;
    }

    hidden function escolher() {
        var m = gMenu;
        gMenu = -1;
        if (m == 0) { aviso("Atualizando"); vibrar(); gM.buscar(); return; }
        if (m != gC) {
            gC = m; gSel = 0; gP = null; gErr = null;
            Application.Storage.setValue("c", gC);
            var u = Application.Storage.getValue("u");    // sem cache deste combustível: tela de carregando
            if (u instanceof Lang.Array && u.size() == 3 && u[0] == gC) { gT = u[1]; gP = u[2]; }
            u = null;
        }
        aviso(COMB[m - 1]);
        vibrar();
        gM.buscar();
    }
}
