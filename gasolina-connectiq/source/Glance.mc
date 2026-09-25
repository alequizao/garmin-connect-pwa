//
// Gasolina Perto · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
// https://github.com/alequizao · © 2026 Alequizao. Todos os direitos reservados.
//
// Glance "menor preço agora": mostra o mais barato da ÚLTIMA consulta feita no app,
// com a idade do dado. Não consulta nada sozinha (a glance tem pouca memória);
// sem consulta anterior, pede para abrir o app — nada de preço inventado.
//
using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Application;
using Toybox.System;
using Toybox.Lang;

(:glance)
class Glance extends WatchUi.GlanceView {
    function initialize() { GlanceView.initialize(); }

    function onUpdate(dc) {
        var s = System.getDeviceSettings();
        var amoled = (s has :requiresBurnInProtection) && s.requiresBurnInProtection;
        var ac = amoled ? 0x00E676 : 0x00FF00, am = amoled ? 0xFFB300 : 0xFFFF00;
        var h = dc.getHeight(), j = Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER;
        var g = Application.Storage.getValue("g");
        dc.setColor(ac, Graphics.COLOR_TRANSPARENT);
        if (!(g instanceof Lang.Array) || g.size() < 5) {
            dc.drawText(0, h * 30 / 100, Graphics.FONT_XTINY, "GASOLINA PERTO", j);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(0, h * 65 / 100, Graphics.FONT_XTINY, "Abra para ver preços", j);
            return;
        }
        dc.drawText(0, h * 20 / 100, Graphics.FONT_XTINY, g[0] + " · " + fmtHa(g[4]), j);
        dc.setColor(am, Graphics.COLOR_TRANSPARENT);
        dc.drawText(0, h * 50 / 100, Graphics.FONT_TINY, "R$ " + fmtPreco(g[2]) + " · " + fmtKm(g[3]), j);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(0, h * 80 / 100, Graphics.FONT_XTINY, g[1], j);
    }
}
