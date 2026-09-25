//
// Próximo Ônibus · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
// https://github.com/alequizao · © 2026 Alequizao. Todos os direitos reservados.
//
// Uma tela só, com três modos (economiza memória no FR55):
//   0 principal  — linha, destino, ponto, "chega em X min" grande e os próximos horários
//   1 menu       — atualizar, perto de mim, alerta 2 min, principal, remover, sincronizar
//   2 perto      — GPS → pontos próximos → linhas; START salva o favorito
//
using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.System;
using Toybox.Timer;
using Toybox.Application;
using Toybox.Attention;
using Toybox.Time;
using Toybox.Lang;

const CJ = 5;   // Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER
const LJ = 6;   // Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER

// itens do menu: [código, texto]
function itensMenu() {
    var m = [[0, "Atualizar agora"], [1, "Perto de mim"], [2, gAl ? "Alerta 2 min: SIM" : "Alerta 2 min: NÃO"]];
    if (gF.size() > 0 && gSel > 0) { m.add([3, "Tornar principal"]); }
    if (gF.size() > 0) { m.add([4, "Remover favorito"]); }
    if (!TOKEN.equals("")) { m.add([5, "Sincronizar painel"]); }
    return m;
}

class Tela extends WatchUi.View {
    hidden var mTimer = null;
    hidden var mT = 0;
    hidden var mMin = -1;

    function initialize() { View.initialize(); }

    function onShow() {
        mTimer = new Timer.Timer();
        mTimer.start(method(:tique), 250, true);
        if (gPrim) { gR.atualizar(); }
    }

    function onHide() {
        if (mTimer != null) { mTimer.stop(); mTimer = null; }
    }

    // anima só quando precisa; parado, redesenha quando o minuto vira (contagem local, sem rede)
    function tique() {
        mT++;
        var anima = gBusca > 0 || gAviso != null || System.getTimer() < gFaixa;
        if (mT % 4 == 0) {
            gR.tique();
            alerta();
            auto();
            var m = Time.now().value() / 60;
            if (m != mMin) { mMin = m; anima = true; }
        }
        if (anima) { WatchUi.requestUpdate(); }
    }

    // vibra 2 min antes da próxima chegada do favorito na tela
    hidden function alerta() {
        if (!gAl || gD == null || gSel >= gD.size()) { return; }
        var ch = futuras(gD[gSel][4]);
        if (ch.size() == 0) { return; }
        var d = ch[0] - Time.now().value();
        if (d <= 120 && d > -30 && gAlOk != ch[0]) {
            gAlOk = ch[0];
            gFaixa = System.getTimer() + 8000;
            vibrar(true);
            if (Attention has :playTone) { try { Attention.playTone(Attention.TONE_ALERT_HI); } catch (e) { } }
            WatchUi.requestUpdate();
        }
    }

    // atualiza sozinho: dados com mais de 5 min, ou o ônibus da tela já passou
    hidden function auto() {
        if (gModo != 0 || gBusca > 0 || gErr != null || gD == null || gF.size() == 0 || gSel >= gD.size()) { return; }
        var idade = Time.now().value() - gT;
        if (idade > 300 || (idade > 60 && gD[gSel][3] > 0 && futuras(gD[gSel][4]).size() == 0)) { gR.atualizar(); }
    }

    function onUpdate(dc) {
        var W = dc.getWidth(), H = dc.getHeight();
        dc.setColor(cTx, Graphics.COLOR_BLACK);
        dc.clear();
        if (gModo == 1) { desenharMenu(dc, W, H); }
        else if (gModo == 2) { desenharPerto(dc, W, H); }
        else {
            cabecalho(dc, W, H, W > 260 ? "Próximo Ônibus" : "Próx. Ônibus", gBusca > 0 && gD != null);
            if (gF.size() == 0) { desenharVazio(dc, W, H); }
            else if (gD != null && gSel < gD.size()) { desenharFavorito(dc, W, H); }
            else if (gErr != null && gBusca == 0) { desenharErro(dc, W, H); }
            else { desenharCarregando(dc, W, H, "Consultando horários...", "pelo celular"); }
        }
        desenharAviso(dc, W, H);
    }

    // ---- carregando: ônibus andando numa estrada (faixas correm para trás) ----
    hidden function desenharCarregando(dc, W, H, t1, t2) {
        var g = W > 260, cx = W / 2, cy = H * 45 / 100, s = W * 22 / 100;
        var yE = cy + s * 62 / 100, x0 = W * 18 / 100, x1 = W - x0, pas = g ? 30 : 16;
        dc.setColor(cTri, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(x0, yE, x1 - x0, g ? 8 : 4);
        dc.setColor(gBusca == 1 ? cAz : cAm, Graphics.COLOR_TRANSPARENT);
        var off = (System.getTimer() / 20) % pas;
        for (var x = x0 - off; x < x1; x += pas) {
            var a = (x < x0) ? x0 : x, b = (x + pas / 2 > x1) ? x1 : x + pas / 2;
            if (b > a) { dc.fillRectangle(a, yE + (g ? 2 : 1), b - a, g ? 4 : 2); }
        }
        var pulo = ((System.getTimer() / 150) % 2 == 0) ? 0 : (g ? 2 : 1);
        onibus(dc, cx - s * 4 / 10, cy - s / 2 - pulo, s, cAm, Graphics.COLOR_BLACK);
        dc.setColor(cTx, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 71 / 100, g ? Graphics.FONT_TINY : Graphics.FONT_XTINY, t1, CJ);
        if (gBusca == 1) { t2 = ((System.getTimer() - gIni) / 1000) + " s · céu aberto ajuda"; }
        dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 81 / 100, Graphics.FONT_XTINY, t2, CJ);
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
        dc.drawText(cx, H * 55 / 100, g ? Graphics.FONT_MEDIUM : Graphics.FONT_SMALL, gErr[0], CJ);
        dc.setColor(cTx, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 69 / 100, Graphics.FONT_XTINY, gErr[1], CJ);
        dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 86 / 100, Graphics.FONT_XTINY, "START: tentar de novo", CJ);
    }

    // ---- sem favoritos ainda ----
    hidden function desenharVazio(dc, W, H) {
        var g = W > 260, s = W * 20 / 100;
        onibus(dc, W / 2 - s * 4 / 10, H * 34 / 100 - s / 2, s, cAz, Graphics.COLOR_BLACK);
        dc.setColor(cTx, Graphics.COLOR_TRANSPARENT);
        dc.drawText(W / 2, H * 56 / 100, g ? Graphics.FONT_SMALL : Graphics.FONT_TINY, "Nenhum favorito", CJ);
        dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
        dc.drawText(W / 2, H * 69 / 100, Graphics.FONT_XTINY, "START: pontos perto\nde mim", CJ);
        dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
        dc.drawText(W / 2, H * 84 / 100, Graphics.FONT_XTINY, "ou escolha no painel", CJ);
    }

    // selo amarelo com o código da linha + seta + destino, centralizados
    hidden function selo(dc, W, y, cod, dest, fs, fd) {
        var g = W > 260, pad = g ? 10 : 5, hS = dc.getFontHeight(fs) + (g ? 2 : 0);
        var wc = dc.getTextWidthInPixels(cod, fs) + 2 * pad, ws = g ? 14 : 8;
        var wd = dc.getTextWidthInPixels(dest, fd), max = W * 84 / 100 - wc - ws - (g ? 12 : 6);
        // cabe na curva da tela redonda: primeiro fonte menor, depois corta o destino com "."
        if (wd > max && fd != Graphics.FONT_XTINY) { fd = Graphics.FONT_XTINY; wd = dc.getTextWidthInPixels(dest, fd); }
        while (wd > max && dest.length() > 4) {
            dest = dest.substring(0, dest.length() - 2);
            while (dest.length() > 1 && (dest.substring(dest.length() - 1, dest.length()).equals(" ") || dest.substring(dest.length() - 1, dest.length()).equals("-") || dest.substring(dest.length() - 1, dest.length()).equals("."))) { dest = dest.substring(0, dest.length() - 1); }
            dest = dest + ".";
            wd = dc.getTextWidthInPixels(dest, fd);
        }
        var x = (W - wc - ws - wd - (g ? 12 : 6)) / 2;
        if (x < W / 12) { x = W / 12; }
        dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, y - hS / 2, wc, hS, g ? 8 : 4);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x + wc / 2, y, fs, cod, CJ);
        var xs = x + wc + (g ? 6 : 3), t = ws / 2;
        dc.setColor(cAz, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon([[xs, y - t], [xs + ws - 2, y], [xs, y + t]]);
        dc.setColor(cTx, Graphics.COLOR_TRANSPARENT);
        dc.drawText(xs + ws + (g ? 6 : 3), y, fd, dest, LJ);
    }

    // ---- favorito: "chega em X min" em destaque ----
    hidden function desenharFavorito(dc, W, H) {
        var g = W > 260, n = gD.size();
        var it = gD[gSel], ch = futuras(it[4]), fonte = it[3];
        selo(dc, W, H * 27 / 100, it[0].toString(), it[1], g ? Graphics.FONT_TINY : Graphics.FONT_XTINY, g ? Graphics.FONT_TINY : Graphics.FONT_XTINY);
        dc.setColor(cAz, Graphics.COLOR_TRANSPARENT);
        dc.drawText(W / 2, H * 36 / 100, Graphics.FONT_XTINY, it[2], CJ);

        if (System.getTimer() < gFaixa) {          // alerta disparado: faixa amarela
            dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(0, H * 43 / 100, W, H * 22 / 100);
            dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
            dc.drawText(W / 2, H * 50 / 100, g ? Graphics.FONT_MEDIUM : Graphics.FONT_SMALL, "CHEGANDO!", CJ);
            dc.drawText(W / 2, H * 59 / 100, Graphics.FONT_XTINY, "vá para o ponto", CJ);
        } else if (fonte <= 0 || ch.size() == 0) {
            dc.setColor(fonte < 0 ? cErr : cCz, Graphics.COLOR_TRANSPARENT);
            dc.drawText(W / 2, H * 50 / 100, g ? Graphics.FONT_MEDIUM : Graphics.FONT_SMALL, fonte < 0 ? "Sem linha/ponto" : "Sem previsão", CJ);
            dc.setColor(cTx, Graphics.COLOR_TRANSPARENT);
            dc.drawText(W / 2, H * 61 / 100, Graphics.FONT_XTINY, fonte > 0 ? "os previstos já passaram" : it[5], CJ);
        } else {
            var m = minutos(ch[0]);
            if (m == 0) {
                dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
                dc.drawText(W / 2, H * 55 / 100, Graphics.FONT_LARGE, "chegando", CJ);
            } else {
                // até 59 min: "chega em 12 min"; mais longe: "chega às 14:32" (fica mais claro que "285 min")
                dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
                dc.drawText(W / 2, H * 42 / 100, Graphics.FONT_XTINY, m < 60 ? "chega em" : "chega às", CJ);
                var fn = Graphics.FONT_NUMBER_MEDIUM, fm = g ? Graphics.FONT_SMALL : Graphics.FONT_TINY;
                var sn = (m < 60) ? m.toString() : hora(ch[0]), wn = dc.getTextWidthInPixels(sn, fn);
                var wm = (m < 60) ? dc.getTextWidthInPixels(" min", fm) : 0;
                var x = (W - wn - wm) / 2, y = H * 57 / 100;
                dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
                dc.drawText(x, y, fn, sn, LJ);
                if (m < 60) { dc.drawText(x + wn, y + dc.getFontHeight(fn) / 5, fm, " min", LJ); }
            }
            // próximos horários (relógio)
            var s = hora(ch[0]);
            for (var k = 1; k < ch.size() && k < 3; k++) { s += "  " + hora(ch[k]); }
            dc.setColor(cTx, Graphics.COLOR_TRANSPARENT);
            dc.drawText(W / 2, H * 70 / 100, g ? Graphics.FONT_TINY : Graphics.FONT_XTINY, s, CJ);
        }

        // fonte do dado + idade (ou o que está acontecendo agora)
        var rod = (fonte == 1 ? "ao vivo" : (fonte == 2 ? "programado" : "")) + " · " + fmtHa(gT), cr = (fonte == 1) ? cOk : cAm;
        if (fonte <= 0) { rod = "atualizado " + fmtHa(gT); cr = cCz; }
        if (gBusca == 2) { rod = "Atualizando..."; cr = cAz; }
        else if (gErr != null) { rod = gErr[0] + " · " + fmtHa(gT); cr = cErr; }
        var fr = Graphics.FONT_XTINY, yr = H * 80 / 100, wr = dc.getTextWidthInPixels(rod, fr), rp = g ? 5 : 3;
        dc.setColor(cr, Graphics.COLOR_TRANSPARENT);
        if (fonte > 0 && gBusca == 0 && gErr == null) {      // bolinha: verde = GPS dos ônibus, amarela = tabela
            dc.fillCircle((W - wr) / 2 - rp - 4, yr, rp);
            dc.drawText((W - wr) / 2 + rp, yr, fr, rod, LJ);
        } else {
            dc.drawText(W / 2, yr, fr, rod, CJ);
        }

        // alerta ligado: sininho + "2 min"
        var yb = H * 89 / 100;
        if (gAl) {
            var b = g ? 10 : 5, xb = W / 2 - dc.getTextWidthInPixels("2 min", fr) / 2 - b - 2;
            dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(xb, yb - b / 3, b * 6 / 10);
            dc.fillRectangle(xb - b * 6 / 10, yb - b / 3, b * 12 / 10 + 1, b * 6 / 10);
            dc.fillRectangle(xb - b * 9 / 10, yb + b / 4, b * 18 / 10 + 1, g ? 3 : 2);
            dc.fillCircle(xb, yb + b / 2 + 1, g ? 3 : 1);
            dc.drawText(xb + b + 2, yb, fr, "2 min", LJ);
        } else if (n == 1) {
            dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
            dc.drawText(W / 2, yb, fr, "START: opções", CJ);
        }

        // bolinhas de posição (direita) quando há mais de um favorito
        if (n > 1 && System.getTimer() >= gFaixa) {
            var r = g ? 5 : 3, passo = g ? 16 : 9, xd = W - (g ? 16 : 9);
            for (var k = 0; k < n; k++) {
                var yd = H / 2 + (k * 2 - (n - 1)) * passo / 2;
                if (k == gSel) { dc.setColor(cAm, Graphics.COLOR_TRANSPARENT); dc.fillCircle(xd, yd, r); }
                else { dc.setColor(cCz, Graphics.COLOR_TRANSPARENT); dc.drawCircle(xd, yd, r - 1); }
            }
        }
    }

    // ---- menu (lista com o item selecionado em cartão azul-escuro) ----
    hidden function desenharMenu(dc, W, H) {
        var g = W > 260, m = itensMenu(), n = m.size();
        if (gMenu >= n) { gMenu = 0; }
        cabecalho(dc, W, H, "Opções", false);
        var hR = H * 15 / 100;
        for (var j = gMenu - 2; j <= gMenu + 2; j++) {
            if (j < 0 || j >= n) { continue; }
            var y = H / 2 + (j - gMenu) * hR + H * 3 / 100, t = m[j][1];
            if (j == gMenu) {
                var x0 = W * 10 / 100;
                dc.setColor(cCard, Graphics.COLOR_TRANSPARENT);
                dc.fillRoundedRectangle(x0, y - hR / 2 + 2, W - 2 * x0, hR - 4, g ? 14 : 7);
                dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(2);
                dc.drawRoundedRectangle(x0, y - hR / 2 + 2, W - 2 * x0, hR - 4, g ? 14 : 7);
                dc.setPenWidth(1);
                dc.setColor(cTx, Graphics.COLOR_TRANSPARENT);
                dc.drawText(W / 2, y, g ? Graphics.FONT_SMALL : Graphics.FONT_TINY, t, CJ);
            } else {
                dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
                dc.drawText(W / 2, y, Graphics.FONT_XTINY, t, CJ);
            }
        }
    }

    // ---- perto de mim: cartão com a linha selecionada, vizinhos acima/abaixo ----
    hidden function desenharPerto(dc, W, H) {
        var g = W > 260;
        cabecalho(dc, W, H, "Perto de mim", gBusca > 0 && gP != null);
        if (gP == null || gP.size() == 0) {
            if (gErr != null && gBusca == 0) { desenharErro(dc, W, H); }
            else { desenharCarregando(dc, W, H, gBusca == 1 ? "Buscando GPS..." : "Procurando pontos...", "pelo celular"); }
            return;
        }
        var n = gP.size();
        if (gPSel >= n) { gPSel = 0; }
        if (gPSel > 0) { vizinho(dc, W / 2, H * 22 / 100, gP[gPSel - 1]); }
        if (gPSel < n - 1) { vizinho(dc, W / 2, H * 80 / 100, gP[gPSel + 1]); }
        var x0 = W * 7 / 100, yC = H * 29 / 100, wC = W - 2 * x0, hC = H * 43 / 100, rr = g ? 18 : 9;
        dc.setColor(cCard, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x0, yC, wC, hC, rr);
        dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(g ? 3 : 2);
        dc.drawRoundedRectangle(x0, yC, wC, hC, rr);
        dc.setPenWidth(1);
        var p = gP[gPSel], ja = indice(gF, p[0], p[1]) >= 0;
        selo(dc, W, yC + hC * 20 / 100, p[2].toString(), p[3], g ? Graphics.FONT_TINY : Graphics.FONT_XTINY, g ? Graphics.FONT_TINY : Graphics.FONT_XTINY);
        dc.setColor(cAz, Graphics.COLOR_TRANSPARENT);
        dc.drawText(W / 2, yC + hC * 44 / 100, Graphics.FONT_XTINY, p[4], CJ);
        dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
        dc.drawText(W / 2, yC + hC * 63 / 100, Graphics.FONT_XTINY, fmtM(p[5]) + " de você", CJ);
        dc.setColor(ja ? cOk : cAm, Graphics.COLOR_TRANSPARENT);
        dc.drawText(W / 2, yC + hC * 85 / 100, Graphics.FONT_XTINY, ja ? "já é favorito" : "START: salvar", CJ);
        dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
        dc.drawText(W / 2, H * 90 / 100, Graphics.FONT_XTINY, (gPSel + 1) + " de " + n, CJ);
    }

    hidden function vizinho(dc, cx, y, p) {
        var d = p[3];
        if (d.length() > 11) {
            d = d.substring(0, 10);
            while (d.length() > 1 && (d.substring(d.length() - 1, d.length()).equals(" ") || d.substring(d.length() - 1, d.length()).equals("-"))) { d = d.substring(0, d.length() - 1); }
            if (!d.substring(d.length() - 1, d.length()).equals(".")) { d = d + "."; }
        }
        dc.setColor(cCz, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, y, Graphics.FONT_XTINY, p[2] + "  " + d, CJ);
    }
}

function fmtM(m) {
    m = m.toNumber();
    if (m < 1000) { return m + " m"; }
    var s = (m / 100).toString();
    return s.substring(0, s.length() - 1) + "," + s.substring(s.length() - 1, s.length()) + " km";
}

class TelaDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }

    function onNextPage() { mover(1); return true; }
    function onPreviousPage() { mover(-1); return true; }

    hidden function mover(d) {
        if (gModo == 1) { var n = itensMenu().size(); gMenu = (gMenu + d + n) % n; }
        else if (gModo == 2) { if (gP != null && gP.size() > 0) { gPSel = (gPSel + d + gP.size()) % gP.size(); } }
        else if (gF.size() > 1) { gSel = (gSel + d + gF.size()) % gF.size(); gAlOk = 0; }
        WatchUi.requestUpdate();
    }

    function onSelect() {
        if (gModo == 1) { escolher(); return true; }
        if (gModo == 2) {
            if (gP != null && gP.size() > 0) { salvar(); }
            else if (gBusca == 0) { gR.buscarPerto(); }
            return true;
        }
        if (gF.size() == 0) { gModo = 2; gR.buscarPerto(); return true; }
        if (gD == null && gErr != null && gBusca == 0) { gR.atualizar(); return true; }
        if (gErr != null && gBusca == 0) { gErr = null; gR.atualizar(); return true; }
        gModo = 1; gMenu = 0;
        WatchUi.requestUpdate();
        return true;
    }

    function onMenu() {
        if (gModo == 0) { gModo = 1; gMenu = 0; WatchUi.requestUpdate(); }
        return true;
    }

    function onBack() {
        if (gModo != 0) { gModo = 0; gP = null; if (gBusca == 1) { gBusca = 0; gR.desligar(); } gErr = null; WatchUi.requestUpdate(); return true; }
        return false;
    }

    // toque (FR165): no menu escolhe a linha tocada; nas listas, acima/abaixo do meio anda
    function onTap(evt) {
        var y = evt.getCoordinates()[1], H = System.getDeviceSettings().screenHeight;
        if (gModo == 1) {
            var n = itensMenu().size(), hR = H * 15 / 100, dy = y - (H / 2 + H * 3 / 100);
            var j = gMenu + ((dy >= 0) ? (dy + hR / 2) / hR : -((hR / 2 - dy) / hR));
            if (j < 0 || j >= n) { return true; }
            gMenu = j; escolher(); return true;
        }
        if ((gModo == 2 && gP != null && gP.size() > 1) || (gModo == 0 && gF.size() > 1 && gD != null)) {
            if (y < H * 30 / 100) { mover(-1); return true; }
            if (y > H * 70 / 100) { mover(1); return true; }
        }
        return onSelect();
    }

    hidden function escolher() {
        var m = itensMenu();
        if (gMenu >= m.size()) { gMenu = 0; }
        var c = m[gMenu][0];
        gModo = 0;
        if (c == 0) { aviso("Atualizando"); vibrar(false); gErr = null; gR.atualizar(); }
        else if (c == 1) { gModo = 2; gR.buscarPerto(); }
        else if (c == 2) {
            gAl = !gAl; gAlOk = 0;
            Application.Storage.setValue("al", gAl);
            aviso(gAl ? "Alerta ligado" : "Alerta desligado"); vibrar(false);
        } else if (c == 3) {
            gF = [gF[gSel]].addAll(gF.slice(0, gSel)).addAll(gF.slice(gSel + 1, null));
            if (gD != null && gSel < gD.size()) { gD = [gD[gSel]].addAll(gD.slice(0, gSel)).addAll(gD.slice(gSel + 1, null)); }
            gSel = 0;
            Application.Storage.setValue("f", gF);
            if (gD != null) { Application.Storage.setValue("u", [gT, gD]); salvarGlance(); }
            aviso("Principal"); vibrar(false);
        } else if (c == 4) {
            if (gF[gSel][5] == 1) {      // veio do painel: some daqui e não volta na próxima sincronização
                var ox = Application.Storage.getValue("x");
                if (!(ox instanceof Lang.Array)) { ox = []; }
                ox.add(gF[gSel][0] + "." + gF[gSel][1]);
                if (ox.size() > 8) { ox = ox.slice(ox.size() - 8, null); }
                Application.Storage.setValue("x", ox);
            }
            gF = gF.slice(0, gSel).addAll(gF.slice(gSel + 1, null));
            if (gD != null && gSel < gD.size()) { gD = gD.slice(0, gSel).addAll(gD.slice(gSel + 1, null)); }
            if (gSel >= gF.size()) { gSel = 0; }
            Application.Storage.setValue("f", gF);
            if (gD != null) { Application.Storage.setValue("u", [gT, gD]); salvarGlance(); }
            aviso("Removido"); vibrar(false);
        } else if (c == 5) { aviso("Sincronizando"); gR.sincronizar(); }
        WatchUi.requestUpdate();
    }

    hidden function salvar() {
        var p = gP[gPSel];
        var i = indice(gF, p[0], p[1]);
        if (i >= 0) { gSel = i; gModo = 0; gP = null; aviso("Já é favorito"); return; }
        if (gF.size() >= MAXF) { aviso("Máx. 4: remova um"); vibrar(false); return; }
        gF.add([p[0], p[1], p[2], p[3], p[4], 0]);
        if (gD != null) { gD.add([p[2], p[3], p[4], 0, [], "consultando..."]); }
        gSel = gF.size() - 1;
        Application.Storage.setValue("f", gF);
        gModo = 0; gP = null;
        aviso("Favorito salvo"); vibrar(false);
        gR.atualizar();
    }
}
