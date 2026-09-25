//
// Próximo Ônibus · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
// https://github.com/alequizao · © 2026 Alequizao. Todos os direitos reservados.
//
// Uma tela só, com três modos (economiza memória no FR55):
//   0 principal  — anel do bezel que esvazia até a chegada, selo da linha + destino, ponto,
//                  minutos enormes, próximos horários em chips e rodapé ao vivo/programado
//   1 menu       — lista centrada com ícones vetoriais e chave liga/desliga do alerta
//   2 perto      — GPS → pontos próximos → linhas; START salva o favorito
// Visual "premium escuro": preto, um amarelo de destaque, azul frio, cinzas em níveis.
// O ritmo de redesenho segue a tela (gRit): parado = 1 por minuto; anel na janela = 1 por
// segundo; pulsos = 4 por segundo; deslize/confirmação/carregando = 20 por segundo.
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
const JAN = 900; // janela do anel: 15 min

// itens do menu: [código do ícone, texto]
function itensMenu() {
    var m = [[0, "Atualizar"], [1, "Perto de mim"], [2, "Alerta 2 min"]];
    if (gF.size() > 0 && gSel > 0) { m.add([3, "Tornar principal"]); }
    if (gF.size() > 0) { m.add([4, "Remover"]); }
    if (!TOKEN.equals("")) { m.add([5, "Sincronizar"]); }
    return m;
}

// janela visível do menu: até 4 itens (cabem sem cortar na tela redonda), bloco centrado → [quantos, primeiro]
function janelaMenu(n) {
    var k = n < 4 ? n : 4, tp = gMenu - 1;
    if (tp > n - k) { tp = n - k; }
    if (tp < 0) { tp = 0; }
    return [k, tp];
}

class Tela extends WatchUi.View {
    hidden var mTimer = null;
    hidden var mP = 0;
    hidden var mSeg = 0;
    hidden var mMin = -1;

    function initialize() { View.initialize(); }

    function onShow() {
        mTimer = new Timer.Timer();
        mP = 0;
        ritmo();
        if (gPrim) { gR.atualizar(); }
    }

    function onHide() {
        if (mTimer != null) { mTimer.stop(); mTimer = null; }
    }

    // período do timer conforme o que a tela pediu no último desenho
    hidden function ritmo() {
        var p = gRit >= 3 ? 50 : (gRit == 2 ? 250 : 1000);
        if (p != mP && mTimer != null) { mP = p; mTimer.stop(); mTimer.start(method(:tique), p, true); }
    }

    function tique() {
        var t = System.getTimer(), pede = gRit >= 2;
        if (t - mSeg >= 900) {
            mSeg = t;
            gR.tique();
            alerta();
            auto();
            var m = Time.now().value() / 60;
            if (m != mMin || gRit == 1) { mMin = m; pede = true; }
        }
        if (pede) { WatchUi.requestUpdate(); }
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
        var W = dc.getWidth(), H = dc.getHeight(), P = W > 260 ? 8 : 5;
        gRit = 0;
        dc.setColor(cTx, Graphics.COLOR_BLACK);
        dc.clear();
        if (gModo == 1) { anel(dc, W, 0, 0, P); desenharMenu(dc, W, H); }
        else if (gModo == 2) { desenharPerto(dc, W, H, P); }
        else if (gF.size() > 0 && gD != null && gSel < gD.size()) { desenharFavorito(dc, W, H, P); }
        else {
            anel(dc, W, 0, 0, P);
            titulo(dc, W, H, W > 260 ? "Próximo Ônibus" : "Próx. Ônibus", -1);
            if (gF.size() == 0) { desenharVazio(dc, W, H); }
            else if (gErr != null && gBusca == 0) { desenharErro(dc, W, H); }
            else { desenharCarregando(dc, W, H, P, "Consultando horários", "pelo celular"); }
        }
        desenharAviso(dc, W, H);
        ritmo();
    }

    // ---- carregando: ônibus andando numa estrada + trecho azul girando no anel ----
    hidden function desenharCarregando(dc, W, H, P, t1, t2) {
        var g = W > 260, cx = W / 2, s = W * 20 / 100, yE = H * 50 / 100, x0 = W * 22 / 100, x1 = W - x0, pas = g ? 28 : 14;
        giro(dc, W, P);
        dc.setColor(cTri, TR);
        dc.fillRectangle(x0, yE, x1 - x0, g ? 3 : 2);
        dc.setColor(cC3, TR);
        var off = (System.getTimer() / 20) % pas;
        for (var x = x0 - off; x < x1; x += pas) {
            var a = (x < x0) ? x0 : x, b = (x + pas / 2 > x1) ? x1 : x + pas / 2;
            if (b > a) { dc.fillRectangle(a, yE + (g ? 8 : 5), b - a, g ? 2 : 1); }
        }
        var pulo = ((System.getTimer() / 150) % 2 == 0) ? 0 : (g ? 2 : 1);
        onibus(dc, cx - s * 4 / 10, yE - s - pulo, s, cAm, 0);
        tx(dc, cx, H * 66 / 100, g ? Graphics.FONT_TINY : Graphics.FONT_XTINY, t1, CJ, cTx);
        if (gBusca == 1) { t2 = ((System.getTimer() - gIni) / 1000) + " s · céu aberto ajuda"; }
        tx(dc, cx, H * 76 / 100, Graphics.FONT_XTINY, t2, CJ, cC2);
    }

    // ---- erro claro + como tentar de novo ----
    hidden function desenharErro(dc, W, H) {
        var g = W > 260, cx = W / 2, cy = H * 34 / 100, r = g ? 28 : 14;
        dc.setPenWidth(g ? 4 : 2);
        dc.setColor(cErr, TR);
        dc.drawCircle(cx, cy, r);
        dc.setPenWidth(1);
        dc.fillRoundedRectangle(cx - (g ? 3 : 1), cy - r / 2, g ? 6 : 3, r * 6 / 10, g ? 3 : 1);
        dc.fillCircle(cx, cy + r * 45 / 100, g ? 4 : 2);
        tx(dc, cx, H * 52 / 100, g ? Graphics.FONT_SMALL : Graphics.FONT_TINY, gErr[0], CJ, cTx);
        tx(dc, cx, H * 65 / 100, Graphics.FONT_XTINY, gErr[1], CJ, cC2);
        pilula(dc, cx, H * 80 / 100, "Tentar de novo", Graphics.FONT_XTINY, cAm, false);
    }

    // ---- sem favoritos ainda: convite claro ----
    hidden function desenharVazio(dc, W, H) {
        var g = W > 260, s = W * 13 / 100, cy = H * 34 / 100;
        dc.setColor(cTri, TR);
        dc.setPenWidth(2);
        dc.drawCircle(W / 2, cy, s);
        dc.setPenWidth(1);
        onibus(dc, W / 2 - s * 4 / 10, cy - s / 2, s, cAz, 0);
        tx(dc, W / 2, H * 55 / 100, g ? Graphics.FONT_SMALL : Graphics.FONT_TINY, "Nenhum favorito", CJ, cTx);
        pilula(dc, W / 2, H * 68 / 100, "START · perto de mim", Graphics.FONT_XTINY, cAm, true);
        tx(dc, W / 2, H * 80 / 100, Graphics.FONT_XTINY, "ou escolha no painel", CJ, cC3);
    }

    // selo com o código da linha (cor do grupo) + destino, centralizados em cx
    hidden function selo(dc, W, cx, y, cod, dest, f, max) {
        var g = W > 260, pad = g ? 9 : 4, hS = dc.getFontHeight(f) + (g ? 0 : 1), e = g ? 10 : 5;
        var wc = dc.getTextWidthInPixels(cod, f) + 2 * pad;
        dest = cabe(dc, dest, f, max - wc - e);
        var x = cx - (wc + e + dc.getTextWidthInPixels(dest, f)) / 2;
        dc.setColor(corLinha(cod), TR);
        dc.fillRoundedRectangle(x, y - hS / 2, wc, hS, g ? 8 : 4);
        tx(dc, x + wc / 2, y, f, cod, CJ, 0);
        tx(dc, x + wc + e, y, f, dest, LJ, cTx);
    }

    // ---- favorito: anel de contagem + minutos enormes ----
    hidden function desenharFavorito(dc, W, H, P) {
        var g = W > 260, n = gD.size(), fx = Graphics.FONT_XTINY, t = System.getTimer();
        var it = gD[gSel], ch = futuras(it[4]), fonte = it[3], pu = (t / 500) % 2 == 0;
        var cheg = t < gFaixa, rem = -1, f = 0, cor = cAm, pen = P;

        // anel: esvazia nos últimos 15 min; antes disso fica cheio e apagado; nos 2 últimos pulsa
        if (fonte > 0 && ch.size() > 0) {
            rem = ch[0] - Time.now().value();
            if (rem < 60) { cheg = true; }
            if (rem > JAN) { f = 1000; cor = cAmE; } else { f = rem * 1000 / JAN; rit(1); }
        }
        if (cheg || (rem >= 0 && rem <= 120)) { rit(2); if (pu) { pen = P + (g ? 4 : 2); } }
        if (cheg) { f = 1000; cor = cAm; }
        anel(dc, W, f, cor, pen);
        if (gBusca > 0) { giro(dc, W, P); }

        // deslize curto ao trocar de favorito (o anel fica parado)
        var e = t - gSl, cx = W / 2;
        if (e < 240) { var k = 240 - e; cx += gSd * (W / 3) * k / 240 * k / 240; rit(3); }

        selo(dc, W, cx, H * 19 / 100, it[0].toString(), it[1], g ? Graphics.FONT_TINY : fx, W * 72 / 100);
        tx(dc, cx, H * 28 / 100, fx, cabe(dc, it[2], fx, W * 74 / 100), CJ, cC2);

        if (cheg) {
            tx(dc, cx, H * 49 / 100, g ? Graphics.FONT_MEDIUM : Graphics.FONT_SMALL, "CHEGANDO", CJ, cAm);
            tx(dc, cx, H * 59 / 100, fx, "vá para o ponto", CJ, cC2);
        } else if (fonte <= 0 || ch.size() == 0) {
            tx(dc, cx, H * 49 / 100, g ? Graphics.FONT_SMALL : Graphics.FONT_TINY, fonte < 0 ? "Sem linha/ponto" : "Sem previsão", CJ, fonte < 0 ? cErr : cTx);
            tx(dc, cx, H * 59 / 100, fx, fonte > 0 ? "os previstos já passaram" : it[5], CJ, cC3);
        } else {
            // até 59 min: "12 min" enorme; mais longe: "14:32" (mais claro que "285 min")
            var m = rem / 60, y = H * 55 / 100;
            tx(dc, cx, H * 35 / 100, fx, m < 60 ? "chega em" : "chega às", CJ, cC3);
            var fn = m < 60 ? Graphics.FONT_NUMBER_HOT : Graphics.FONT_NUMBER_MEDIUM, fm = g ? Graphics.FONT_SMALL : Graphics.FONT_TINY;
            var sn = m < 60 ? m.toString() : hora(ch[0]), wn = dc.getTextWidthInPixels(sn, fn);
            var wm = m < 60 ? dc.getTextWidthInPixels(" min", fm) : 0, x = cx - (wn + wm) / 2;
            tx(dc, x, y, fn, sn, LJ, cAm);
            if (m < 60) { tx(dc, x + wn, y + dc.getFontHeight(fn) / 5, fm, " min", LJ, cC2); }
        }
        // próximos horários em chips (o 1º em branco)
        if (fonte > 0 && ch.size() > 0) {
            var nc = ch.size() < 3 ? ch.size() : 3, hc = dc.getFontHeight(fx) + (g ? 4 : 2), pc = g ? 12 : 5, ec = g ? 8 : 4;
            var sc = [], wt = -ec;
            for (var k = 0; k < nc; k++) { sc.add(hora(ch[k])); wt += dc.getTextWidthInPixels(sc[k], fx) + 2 * pc + ec; }
            var xc = cx - wt / 2, yc = H * 73 / 100;
            for (var k = 0; k < nc; k++) {
                var wc = dc.getTextWidthInPixels(sc[k], fx) + 2 * pc;
                dc.setColor(cC4, TR);
                dc.fillRoundedRectangle(xc, yc - hc / 2, wc, hc, hc / 2);
                tx(dc, xc + wc / 2, yc, fx, sc[k], CJ, k == 0 ? cTx : cC2);
                xc += wc + ec;
            }
        }

        // rodapé: ponto (verde pulsante = GPS dos ônibus, azul vazado = tabela) + idade do dado
        var rod = "atualizado " + fmtHa(gT), cp = -1, rp = g ? 5 : 3;
        if (fonte == 1) { rod = "ao vivo · " + fmtHa(gT); cp = cOk; }
        else if (fonte == 2) { rod = "programado · " + fmtHa(gT); cp = cAz; }
        if (gBusca == 2) { rod = "atualizando"; cp = cAz; }
        else if (gErr != null) { rod = gErr[0] + " · " + fmtHa(gT); cp = cErr; }
        var yr = H * 83 / 100, wr = dc.getTextWidthInPixels(rod, fx), xr = W / 2 - (wr + 2 * rp + (g ? 8 : 4)) / 2;
        if (cp == -1) { xr = W / 2 - wr / 2; }
        else {
            dc.setColor(cp, TR);
            if (fonte == 2 && gBusca == 0 && gErr == null) { dc.setPenWidth(2); dc.drawCircle(xr + rp, yr, rp - 1); dc.setPenWidth(1); }
            else { dc.fillCircle(xr + rp, yr, rp); }
            if (fonte == 1 && gBusca == 0 && gErr == null) { rit(1); if ((t / 1000) % 2 == 0) { dc.drawCircle(xr + rp, yr, rp + (g ? 4 : 2)); } }
            xr += 2 * rp + (g ? 8 : 4);
        }
        tx(dc, xr, yr, fx, rod, LJ, cC2);

        // alerta ligado: sininho + "2 min"
        var yb = H * 91 / 100;
        if (gAl) {
            var b = g ? 9 : 5, xb = W / 2 - (dc.getTextWidthInPixels("2 min", fx) + 2 * b + 4) / 2 + b;
            icone(dc, 2, xb, yb, b, cAm);
            tx(dc, xb + b + 4, yb, fx, "2 min", LJ, cC2);
        } else if (n == 1) {
            tx(dc, W / 2, yb, fx, "START · opções", CJ, cC3);
        }

        // posição entre os favoritos (direita, dentro do anel): o atual vira uma pílula amarela
        if (n > 1) {
            var r = g ? 4 : 2, ps = g ? 16 : 9, xd = W - P - (g ? 18 : 10);
            for (var k = 0; k < n; k++) {
                var yd = H / 2 + (k * 2 - (n - 1)) * ps / 2;
                if (k == gSel) { dc.setColor(cAm, TR); dc.fillRoundedRectangle(xd - r, yd - 2 * r, 2 * r, 4 * r, r); }
                else { dc.setColor(cC3, TR); dc.fillCircle(xd, yd, r - 1); }
            }
        }
    }

    // ---- menu: lista centrada, ícones vetoriais, item escolhido em cartão ----
    hidden function desenharMenu(dc, W, H) {
        var g = W > 260, m = itensMenu(), n = m.size();
        if (gMenu >= n) { gMenu = 0; }
        var jm = janelaMenu(n), k = jm[0], tp = jm[1], hR = H * 14 / 100, yT = H / 2 - k * hR / 2;
        var f = g ? Graphics.FONT_TINY : Graphics.FONT_XTINY, s = g ? 11 : 6, x0 = W * 12 / 100, xi = x0 + (g ? 30 : 15), xt = xi + s + (g ? 14 : 7);
        if (yT >= H * 20 / 100) { tx(dc, W / 2, yT - hR / 2, Graphics.FONT_XTINY, "Opções", CJ, cC3); }
        for (var i = 0; i < k; i++) {
            var q = tp + i, y = yT + i * hR + hR / 2, sel = q == gMenu, c = m[q][0];
            if (sel) { dc.setColor(cC4, TR); dc.fillRoundedRectangle(x0, y - hR / 2 + 3, W - 2 * x0, hR - 6, (hR - 6) / 2); }
            icone(dc, c, xi, y, s, sel ? cAm : cC3);
            tx(dc, xt, y, f, m[q][1], LJ, sel ? cTx : cC2);
            if (c == 2) { chave(dc, W - x0 - (g ? 12 : 6), y, s, gAl); }
        }
        // mais itens acima/abaixo: tracinho discreto
        dc.setColor(cC3, TR);
        if (tp > 0) { dc.fillRoundedRectangle(W / 2 - 8, yT - 4, 16, 3, 1); }
        if (tp + k < n) { dc.fillRoundedRectangle(W / 2 - 8, yT + k * hR + 2, 16, 3, 1); }
    }

    // ---- perto de mim: cartão com a linha selecionada, vizinhos acima/abaixo ----
    hidden function desenharPerto(dc, W, H, P) {
        var g = W > 260, fx = Graphics.FONT_XTINY;
        anel(dc, W, 0, 0, P);
        if (gBusca > 0) { giro(dc, W, P); }
        titulo(dc, W, H, "Perto de mim", 1);
        if (gP == null || gP.size() == 0) {
            if (gErr != null && gBusca == 0) { desenharErro(dc, W, H); }
            else { desenharCarregando(dc, W, H, P, gBusca == 1 ? "Buscando GPS" : "Procurando pontos", "pelo celular"); }
            return;
        }
        var n = gP.size();
        if (gPSel >= n) { gPSel = 0; }
        dc.setColor(cC3, TR);
        if (gPSel > 0) { var v = gP[gPSel - 1]; dc.drawText(W / 2, H * 23 / 100, fx, cabe(dc, v[2] + "  " + v[3], fx, W * 60 / 100), CJ); }
        if (gPSel < n - 1) { var v = gP[gPSel + 1]; dc.drawText(W / 2, H * 79 / 100, fx, cabe(dc, v[2] + "  " + v[3], fx, W * 66 / 100), CJ); }
        var x0 = W * 8 / 100, yC = H * 30 / 100, wC = W - 2 * x0, hC = H * 41 / 100;
        dc.setColor(cC4, TR);
        dc.fillRoundedRectangle(x0, yC, wC, hC, g ? 22 : 11);
        var p = gP[gPSel], ja = indice(gF, p[0], p[1]) >= 0;
        selo(dc, W, W / 2, yC + hC * 20 / 100, p[2].toString(), p[3], g ? Graphics.FONT_TINY : fx, W * 74 / 100);
        tx(dc, W / 2, yC + hC * 42 / 100, fx, cabe(dc, p[4], fx, W * 76 / 100), CJ, cC2);
        tx(dc, W / 2, yC + hC * 61 / 100, fx, fmtM(p[5]) + " de você", CJ, cAz);
        pilula(dc, W / 2, yC + hC * 82 / 100, ja ? "já é favorito" : "START · salvar", fx, ja ? cOk : cAm, !ja);
        tx(dc, W / 2, H * 89 / 100, fx, (gPSel + 1) + " de " + n, CJ, cC3);
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
        else if (gF.size() > 1) { gSel = (gSel + d + gF.size()) % gF.size(); gAlOk = 0; gSl = System.getTimer(); gSd = d; }
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
            var n = itensMenu().size(), jm = janelaMenu(n), hR = H * 14 / 100, yT = H / 2 - jm[0] * hR / 2;
            if (y < yT) { return true; }
            var i = (y - yT) / hR;
            if (i >= jm[0]) { return true; }
            gMenu = jm[1] + i; escolher(); return true;
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
            gModo = 1;       // fica no menu: a própria chave confirma (sem pílula por cima da lista)
            vibrar(false);
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
