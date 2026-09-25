//
// Próximo Ônibus · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
// https://github.com/alequizao · © 2026 Alequizao. Todos os direitos reservados.
//
// Glance (FR165/165 Music): próxima chegada do favorito PRINCIPAL, recontada a partir dos
// horários da última consulta (a glance não consulta nada: tem pouca memória). Se os
// horários guardados já passaram, pede para abrir o app — nada de horário inventado.
//
using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Application;
using Toybox.System;
using Toybox.Time;
using Toybox.Lang;

(:glance)
class Glance extends WatchUi.GlanceView {
    function initialize() { GlanceView.initialize(); }

    function onUpdate(dc) {
        var s = System.getDeviceSettings();
        var amoled = (s has :requiresBurnInProtection) && s.requiresBurnInProtection;
        var am = amoled ? 0xFFC400 : 0xFFFF00, az = amoled ? 0x448AFF : 0x00AAFF, ok = amoled ? 0x00E676 : 0x00FF00;
        var h = dc.getHeight(), j = Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER;
        var g = Application.Storage.getValue("g");
        dc.setColor(am, Graphics.COLOR_TRANSPARENT);
        if (!(g instanceof Lang.Array) || g.size() < 5) {
            dc.drawText(0, h * 30 / 100, Graphics.FONT_XTINY, "PRÓXIMO ÔNIBUS", j);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(0, h * 65 / 100, Graphics.FONT_XTINY, "Abra e salve um favorito", j);
            return;
        }
        dc.drawText(0, h * 20 / 100, Graphics.FONT_XTINY, g[0] + " > " + g[1], j);
        var ch = g[2], agora = Time.now().value(), e = null, e2 = null;
        for (var i = 0; i < ch.size(); i++) {
            if (ch[i] > agora - 30) { if (e == null) { e = ch[i]; } else if (e2 == null) { e2 = ch[i]; } }
        }
        if (e == null || g[3] <= 0) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(0, h * 52 / 100, Graphics.FONT_TINY, "Sem previsão", j);
            dc.setColor(az, Graphics.COLOR_TRANSPARENT);
            dc.drawText(0, h * 82 / 100, Graphics.FONT_XTINY, "abra para atualizar", j);
            return;
        }
        var m = minutos(e);
        dc.setColor(am, Graphics.COLOR_TRANSPARENT);
        dc.drawText(0, h * 52 / 100, Graphics.FONT_TINY, m == 0 ? "chegando" : "chega em " + m + " min", j);
        dc.setColor(g[3] == 1 ? ok : az, Graphics.COLOR_TRANSPARENT);
        dc.drawText(0, h * 82 / 100, Graphics.FONT_XTINY, (g[3] == 1 ? "ao vivo" : "programado") + " · " + hora(e) + (e2 != null ? " e " + hora(e2) : ""), j);
    }
}
