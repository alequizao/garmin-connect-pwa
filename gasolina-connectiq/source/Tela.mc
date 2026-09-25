//
// Gasolina Perto · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
// https://github.com/alequizao · © 2026 Alequizao. Todos os direitos reservados.
//
// Tela principal: carregando (anel da borda enchendo: GPS → preços), lista dos mais
// baratos em carrossel (cartão sem borda + barra verde, preço grande com cor semântica,
// vizinhos com a diferença de preço), erro/vazio com "tentar de novo" e o menu de
// combustível. Sem timer próprio: o Motor bate o ritmo (GasolinaApp.mc).
//
using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.System;
using Toybox.Application;
using Toybox.Lang;

class Tela extends WatchUi.View {
    function initialize() { View.initialize(); }

    function onShow() {
        if (gPrimeira) { gPrimeira = false; gM.buscar(); }
    }

    function onUpdate(dc) {
        var W = dc.getWidth(), H = dc.getHeight();
        dc.setColor(cTx, Graphics.COLOR_BLACK);
        dc.clear();
        if (gMenu >= 0) {
            desenharMenu(dc, W, H);
        } else {
            var n = (gP != null) ? gP.size() : 0;
            anel(dc, W, gSel, n);
            cab(dc, W, COMB[gC - 1]);
            if (n > 0) { desenharLista(dc, W, H, n); }
            else if (gErr != null && gBusca == 0) { desenharErro(dc, W, H); }
            else { desenharCarregando(dc, W, H); }
        }
        desenharAviso(dc, W, H);
    }

    // ---- carregando: bomba no centro, o anel da borda mostra o progresso ----
    hidden function desenharCarregando(dc, W, H) {
        var g = W > 260, s = g ? 54 : 28;
        bomba(dc, W / 2 - s * 45 / 100, H * 40 / 100 - s / 2, s, cAc, (gBusca == 2) ? cAm : Graphics.COLOR_BLACK);
        txt(dc, W, H * 60 / 100, (gBusca == 2) ? "Consultando preços" : "Buscando GPS",
            g ? Graphics.FONT_SMALL : Graphics.FONT_TINY, g ? Graphics.FONT_TINY : Graphics.FONT_XTINY, cTx);
        var sub = "pelo celular";
        if (gBusca == 1) { sub = ((System.getTimer() - gIni) / 1000) + " s · céu aberto ajuda"; }
        txt(dc, W, H * 69 / 100, sub, Graphics.FONT_XTINY, Graphics.FONT_XTINY, cT3);
    }

    // ---- erro (ícone vermelho) ou vazio (ícone cinza) + como tentar de novo ----
    hidden function desenharErro(dc, W, H) {
        var g = W > 260, cx = W / 2, cy = H * 34 / 100, r = g ? 30 : 15, c = (gErr.size() > 2) ? cT2 : cRd;
        dc.setPenWidth(g ? 4 : 2);
        dc.setColor(c, TR);
        dc.drawCircle(cx, cy, r);
        dc.setPenWidth(1);
        if (gErr.size() > 2) {
            bomba(dc, cx - r * 4 / 10, cy - r / 2, r, c, Graphics.COLOR_BLACK);
        } else {
            dc.fillRoundedRectangle(cx - r / 10, cy - r * 55 / 100, r / 5 + 1, r * 65 / 100, 2);
            dc.fillCircle(cx, cy + r * 45 / 100, r / 10 + 1);
        }
        txt(dc, W, H * 535 / 1000, gErr[0], g ? Graphics.FONT_MEDIUM : Graphics.FONT_SMALL, g ? Graphics.FONT_SMALL : Graphics.FONT_TINY, cTx);
        dc.setColor(cT2, TR);
        dc.drawText(cx, H * 675 / 1000, Graphics.FONT_XTINY, gErr[1], CJ);
        // ação: bolinha verde (o botão START) + "Tentar de novo"
        var t = "Tentar de novo", e = g ? 18 : 10, x = (W - dc.getTextWidthInPixels(t, Graphics.FONT_XTINY) - e) / 2, y = H * 845 / 1000;
        dc.setColor(cAc, TR);
        dc.fillCircle(x + e / 3, y, e / 3);
        dc.drawText(x + e, y, Graphics.FONT_XTINY, t, LJ);
    }

    // ---- lista em carrossel: cartão do selecionado + vizinhos com a diferença ----
    hidden function desenharLista(dc, W, H, n) {
        var g = W > 260, cx = W / 2, xt = Graphics.FONT_XTINY;
        if (gSel >= n) { gSel = 0; }
        var p = gP[gSel];
        if (gSel == 0) { txt(dc, W, H * 27 / 100, "MAIS BARATO", xt, xt, cAc); }
        else { vizinho(dc, W, H * 27 / 100, gP[gSel - 1], p); }
        if (gSel < n - 1) { vizinho(dc, W, H * 785 / 1000, gP[gSel + 1], p); }

        // cartão: fundo sutil (sem borda) + barra verde de destaque
        var x0 = W * 9 / 100, yC = H * 33 / 100, wC = W - 2 * x0, hC = H * 40 / 100;
        dc.setColor(cCard, TR);
        dc.fillRoundedRectangle(x0, yC, wC, hC, g ? 22 : 11);
        dc.setColor(cAc, TR);
        dc.fillRoundedRectangle(x0 + (g ? 12 : 6), yC + hC * 28 / 100, g ? 5 : 3, hC * 44 / 100, 2);

        var y = yC + desl(g ? 34 : 16);     // o conteúdo desliza ao trocar de posto
        var f = g ? Graphics.FONT_SMALL : Graphics.FONT_TINY;
        if (dc.getTextWidthInPixels(p[0], f) > wC - (g ? 56 : 28)) { f = g ? Graphics.FONT_TINY : xt; }
        dc.setColor(cTx, TR);
        dc.drawText(cx, y + hC * 19 / 100, f, p[0], CJ);
        preco(dc, cx, y + hC * 50 / 100, p[1], Graphics.FONT_NUMBER_MILD, g ? Graphics.FONT_TINY : xt, corPreco(p[1]));
        dc.setColor(cT2, TR);    // bairro: o servidor já manda com no máximo 16 letras
        dc.drawText(cx, y + hC * 87 / 100, xt, fmtKm(p[2]) + " · " + p[6], CJ);

        // rodapé: idade dos dados (e o raio, se ampliou) ou o que está acontecendo agora
        var rod = fmtHa(gT), cr = cT3;
        if (gR > 5) { rod = rod + " · raio " + gR + " km"; }
        if (gBusca == 1) { rod = "Buscando GPS"; cr = cT2; }
        else if (gBusca == 2) { rod = "Atualizando"; cr = cT2; }
        else if (gErr != null) { rod = gErr[0]; cr = cRd; }
        txt(dc, W, H * 885 / 1000, rod, xt, xt, cr);
    }

    // vizinho: nome apagado + diferença para o selecionado ("+R$ 0,02")
    hidden function vizinho(dc, W, y, q, p) {
        var nome = q[0], f = Graphics.FONT_XTINY;
        if (nome.length() > 11) {
            nome = nome.substring(0, 10);
            if (nome.substring(9, 10).equals(" ")) { nome = nome.substring(0, 9); }
            nome = nome + ".";
        }
        nome = nome + "  ";
        var d = dif(q[1], p[1]), w = dc.getTextWidthInPixels(nome, f);
        var x = (W - w - dc.getTextWidthInPixels(d, f)) / 2;
        dc.setColor(cT3, TR);
        dc.drawText(x, y, f, nome, LJ);
        dc.setColor(cT2, TR);
        dc.drawText(x + w, y, f, d, LJ);
    }

    // ---- menu de combustível (0 = atualizar agora) ----
    hidden function desenharMenu(dc, W, H) {
        var g = W > 260, hR = H * 14 / 100, o = desl(hR / 2);
        anel(dc, W, gMenu, 7);
        cab(dc, W, "Combustível");
        for (var j = gMenu - 2; j <= gMenu + 2; j++) {
            if (j < 0 || j > 6) { continue; }
            var y = H / 2 + (j - gMenu) * hR + H * 3 / 100 + o;
            var t = (j == 0) ? "Atualizar agora" : COMB[j - 1];
            var f = Graphics.FONT_XTINY, cor = (j == gC) ? cAc : ((j - gMenu) * (j - gMenu) > 1 ? cT3 : cT2);
            if (j == gMenu) {
                var x0 = W * 12 / 100;
                dc.setColor(cCard, TR);
                dc.fillRoundedRectangle(x0, y - hR / 2 + 3, W - 2 * x0, hR - 6, (hR - 6) / 2);
                dc.setColor(cAc, TR);
                dc.fillRoundedRectangle(x0 + (g ? 14 : 7), y - hR / 5, g ? 5 : 3, hR * 2 / 5, 2);
                f = Graphics.FONT_TINY; cor = cTx;
            }
            dc.setColor(cor, TR);
            dc.drawText(W / 2, y, f, t, CJ);
            if (j == gC) {   // ✓ à direita do combustível atual
                var s = g ? 7 : 4, xk = (W + dc.getTextWidthInPixels(t, f)) / 2 + s + (g ? 8 : 4);
                dc.setColor(cAc, TR);
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
        trans(d);
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
            var hR = H * 14 / 100, dy = y - (H / 2 + H * 3 / 100);
            var j = gMenu + ((dy >= 0) ? (dy + hR / 2) / hR : -((hR / 2 - dy) / hR));
            if (j < 0 || j > 6) { return true; }
            gMenu = j; escolher(); return true;
        }
        if (gP != null && gP.size() > 0) {
            if (y < H * 30 / 100) { mover(-1); return true; }
            if (y > H * 75 / 100) { mover(1); return true; }
        }
        return onSelect();
    }

    function onMenu() {
        gMenu = gC;
        trans(1);
        WatchUi.requestUpdate();
        return true;
    }

    function onBack() {
        if (gMenu >= 0) { gMenu = -1; trans(-1); WatchUi.requestUpdate(); return true; }
        return false;
    }

    hidden function escolher() {
        var m = gMenu;
        gMenu = -1;
        vibrar(40);
        if (m == 0) { aviso("Atualizando"); gM.buscar(); return; }
        if (m != gC) {
            gC = m; gSel = 0; gP = null; gErr = null;
            Application.Storage.setValue("c", gC);
            var u = Application.Storage.getValue("u");    // sem cache deste combustível: tela de carregando
            if (u instanceof Lang.Array && u.size() == 3 && u[0] == gC) { gT = u[1]; gP = u[2]; }
            u = null;
        }
        aviso(COMB[m - 1]);
        gM.buscar();
    }
}
