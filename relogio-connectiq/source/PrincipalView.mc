import Toybox.Activity;
import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.Timer;
import Toybox.WatchUi;
import Toybox.Position;
import Toybox.Application;

// Com o app ABERTO: GPS contínuo + envio a cada 30 s (rastreamento ao vivo).
// Com o app FECHADO: o sistema da Garmin só permite o envio em segundo plano a cada 5 min.
const INTERVALO_MS = 30000;
var estado = "Iniciando GPS...";
var gpsInfo = null;
var enviando = false;
var enviados = 0;
var ultimoEnvio = null;
var ultimoCodigo = null;
var ativo = true;
var timer = null;

function enviarAgora() {
    if (!$.ativo || $.enviando) { return; }
    var d = Coletor.dados($.gpsInfo);
    d["origem"] = "ao_vivo";
    try {
        var ai = Activity.getActivityInfo();
        if (ai != null && ai.currentHeartRate != null) { d["fc"] = ai.currentHeartRate; }
    } catch (e) { }
    $.enviando = true;
    Coletor.enviar(d, new Method($, :respostaEnvio));
}

function respostaEnvio(code, data) {
    $.enviando = false;
    $.ultimoCodigo = code;
    $.ultimoEnvio = Time.now();
    if (code == 200) { $.enviados += 1; $.estado = "Ao vivo · a cada 30 s"; }
    else { $.estado = "Falha no envio (" + code + ")"; }
    Application.Storage.setValue("ultimo", { "code" => code, "t" => Time.now().value() });
    WatchUi.requestUpdate();
}

function aoGps(info) {
    $.gpsInfo = info;
    WatchUi.requestUpdate();
}

function ligar() {
    $.ativo = true;
    $.estado = "Buscando GPS...";
    Position.enableLocationEvents({ :acquisitionType => Position.LOCATION_CONTINUOUS }, new Method($, :aoGps));
    if ($.timer == null) { $.timer = new Timer.Timer(); } else { $.timer.stop(); }
    $.timer.start(new Method($, :enviarAgora), INTERVALO_MS, true);
    enviarAgora();
}

function desligar() {
    $.ativo = false;
    if ($.timer != null) { $.timer.stop(); }
    Position.enableLocationEvents({ :acquisitionType => Position.LOCATION_DISABLE }, null);
    $.estado = "Pausado · START retoma";
}

class PrincipalView extends WatchUi.View {
    function initialize() { View.initialize(); }
    function onShow() { if ($.ativo) { ligar(); } }
    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK); dc.clear();
        var w = dc.getWidth(), h = dc.getHeight();
        var st = System.getSystemStats();
        dc.setColor($.ativo ? 0x3DDC84 : 0x00A0DF, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.12, Graphics.FONT_XTINY, $.ativo ? "● AO VIVO" : "RASTREADOR", Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.22, Graphics.FONT_NUMBER_MEDIUM, st.battery.format("%d") + "%", Graphics.TEXT_JUSTIFY_CENTER);
        var gps = "GPS: sem sinal";
        if ($.gpsInfo != null && $.gpsInfo.accuracy != null) {
            gps = $.gpsInfo.accuracy >= Position.QUALITY_GOOD ? "GPS: bom" : ($.gpsInfo.accuracy >= Position.QUALITY_USABLE ? "GPS: fraco" : "GPS: procurando");
        }
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.50, Graphics.FONT_XTINY, gps, Graphics.TEXT_JUSTIFY_CENTER);
        var txt = "Enviados: " + $.enviados;
        if ($.ultimoEnvio != null) {
            var i = Gregorian.info($.ultimoEnvio, Time.FORMAT_SHORT);
            txt += " · " + i.hour.format("%02d") + ":" + i.min.format("%02d") + ":" + i.sec.format("%02d") + ($.ultimoCodigo == 200 ? " ✓" : " ✗");
        }
        dc.drawText(w / 2, h * 0.61, Graphics.FONT_XTINY, txt, Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w / 2, h * 0.72, Graphics.FONT_XTINY, $.estado, Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w / 2, h * 0.83, Graphics.FONT_XTINY, "fechado: envia a cada 5 min", Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class PrincipalDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }
    // START liga/pausa o rastreamento ao vivo
    function onSelect() {
        if ($.ativo) { desligar(); } else { ligar(); }
        WatchUi.requestUpdate();
        return true;
    }
}
