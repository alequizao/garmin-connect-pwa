/*
 * Sobre o desenvolvedor · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * Tela rolável (UP/DOWN/deslizar), responsiva à tela redonda, sem abreviar: quebra em linhas.
 */
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.WatchUi;

function abrirSobre(app, versao) {
    var v = new SobreView(app, versao);
    WatchUi.pushView(v, new SobreDelegate(v), WatchUi.SLIDE_LEFT);
}

function sCorda(y1, y2, w, h, redondo) {
    if (!redondo) { return w * 0.92; }
    var r = w / 2.0, cy = h / 2.0;
    var d = (y1 - cy).abs() > (y2 - cy).abs() ? (y1 - cy).abs() : (y2 - cy).abs();
    if (d >= r) { return 1; }
    return 2 * Math.sqrt(r * r - d * d) * 0.92;
}
function sQuebrar(dc, t, fonte, larg) {
    var linhas = [], atual = "", palavras = [], p = "";
    for (var i = 0; i < t.length(); i++) {
        var ch = t.substring(i, i + 1);
        if (ch.equals(" ")) { if (p.length() > 0) { palavras.add(p); } p = ""; } else { p += ch; }
    }
    if (p.length() > 0) { palavras.add(p); }
    for (var k = 0; k < palavras.size(); k++) {
        var pal = palavras[k];
        var teste = atual.length() > 0 ? atual + " " + pal : pal;
        if (dc.getTextWidthInPixels(teste, fonte) <= larg) { atual = teste; continue; }
        if (atual.length() > 0) { linhas.add(atual); atual = ""; }
        while (dc.getTextWidthInPixels(pal, fonte) > larg && pal.length() > 1) {
            var n = pal.length() - 1;
            while (n > 1 && dc.getTextWidthInPixels(pal.substring(0, n), fonte) > larg) { n--; }
            linhas.add(pal.substring(0, n)); pal = pal.substring(n, pal.length());
        }
        atual = pal;
    }
    if (atual.length() > 0 || linhas.size() == 0) { linhas.add(atual); }
    return linhas;
}
/* [fonte, linhas] com topo em y: primeira fonte inteira que cabe; senão a menor quebrada na corda da altura final */
function sMedir(dc, t, fontes, y, redondo) {
    var w = dc.getWidth(), h = dc.getHeight();
    for (var i = 0; i < fontes.size(); i++) {
        if (dc.getTextWidthInPixels(t, fontes[i]) <= sCorda(y, y + dc.getFontHeight(fontes[i]), w, h, redondo)) { return [fontes[i], [t]]; }
    }
    var f = fontes[fontes.size() - 1], fh = dc.getFontHeight(f), linhas = [t];
    for (var it = 0; it < 6; it++) {
        var novas = sQuebrar(dc, t, f, sCorda(y, y + fh * linhas.size(), w, h, redondo));
        if (novas.size() == linhas.size()) { return [f, novas]; }
        linhas = novas;
    }
    return [f, sQuebrar(dc, t, f, sCorda(y, y + fh * linhas.size(), w, h, redondo))];
}

class SobreView extends WatchUi.View {
    var app, versao, desl = 0, total = 0;
    function initialize(a, v) { View.initialize(); app = a; versao = v; }
    function itens() {
        var x = [Graphics.FONT_XTINY], s = [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY];
        var cinza = 0x9A9AA0, azul = 0x1FA3E3, branco = Graphics.COLOR_WHITE;
        var l = [[app, s, 0xF5C23B]];
        if (versao != null && versao.length() > 0) { l.add(["versao " + versao, x, cinza]); }
        l.add(["Desenvolvido por", x, cinza]); l.add(["Alequizao", s, branco]);
        l.add(["Instagram", x, cinza]); l.add(["@alequizao", x, azul]);
        l.add(["WhatsApp", x, cinza]); l.add(["+55 82 98871-7072", x, azul]);
        l.add(["E-mail", x, cinza]); l.add(["alequizao.dev@gmail.com", x, azul]);
        l.add(["Site", x, cinza]); l.add(["alequizao.com", x, azul]);
        l.add(["GitHub", x, cinza]); l.add(["github.com/alequizao", x, azul]);
        return l;
    }
    /* mostra os itens a partir de "desl" empilhados; o que não cabe inteiro fica para a rolagem */
    function onUpdate(dc) {
        var w = dc.getWidth(), h = dc.getHeight(), cx = w / 2;
        var redondo = System.getDeviceSettings().screenShape == System.SCREEN_SHAPE_ROUND;
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK); dc.clear();
        var l = itens(); total = l.size();
        if (desl > total - 1) { desl = total - 1; }
        if (desl < 0) { desl = 0; }
        var fh = dc.getFontHeight(Graphics.FONT_XTINY);
        var yIni = h * (redondo ? 0.1 : 0.04), yFim = h * (redondo ? 0.9 : 0.96), esp = fh * 0.2;
        var y = yIni;
        if (desl > 0) { dc.setColor(0x6A6A70, Graphics.COLOR_TRANSPARENT); dc.drawText(cx, y, Graphics.FONT_XTINY, "^", Graphics.TEXT_JUSTIFY_CENTER); y += fh; }
        var i = desl;
        for (; i < l.size(); i++) {
            var m = sMedir(dc, l[i][0], l[i][1], y, redondo);
            var alt = dc.getFontHeight(m[0]) * m[1].size();
            var reserva = (i < l.size() - 1) ? fh : 0;          // espaço para o indicador "v"
            if (y + alt + reserva > yFim && i > desl) { break; }
            dc.setColor(l[i][2], Graphics.COLOR_TRANSPARENT);
            for (var k = 0; k < m[1].size(); k++) { dc.drawText(cx, y + k * dc.getFontHeight(m[0]), m[0], m[1][k], Graphics.TEXT_JUSTIFY_CENTER); }
            y += alt + esp;
        }
        if (i < l.size()) { dc.setColor(0x6A6A70, Graphics.COLOR_TRANSPARENT); dc.drawText(cx, yFim - fh, Graphics.FONT_XTINY, "v", Graphics.TEXT_JUSTIFY_CENTER); }
    }
    function rolar(d) { desl += d; if (desl < 0) { desl = 0; } if (desl > total - 1) { desl = total - 1; } WatchUi.requestUpdate(); }
}

class SobreDelegate extends WatchUi.BehaviorDelegate {
    var v;
    function initialize(view) { BehaviorDelegate.initialize(); v = view; }
    function onNextPage() { v.rolar(1); return true; }
    function onPreviousPage() { v.rolar(-1); return true; }
    function onSwipe(ev) {
        var d = ev.getDirection();
        if (d == WatchUi.SWIPE_UP) { v.rolar(1); return true; }
        if (d == WatchUi.SWIPE_DOWN) { v.rolar(-1); return true; }
        if (d == WatchUi.SWIPE_RIGHT) { WatchUi.popView(WatchUi.SLIDE_RIGHT); return true; }
        return false;
    }
    function onSelect() { return true; }
    function onBack() { WatchUi.popView(WatchUi.SLIDE_RIGHT); return true; }
}
