import Toybox.Application;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;
import Toybox.Position;
import Toybox.ActivityMonitor;
import Toybox.SensorHistory;

// Rastreador Alequizão — envia bateria, última posição GPS, FC, passos,
// Body Battery e estresse REAIS do relógio a cada 5 min para alequizao.com/garmin (-> Traccar garminalex)
(:background)
module Coletor {
    const URL = "__URL__"; // endereço do relogio.php, gravado pelo compilador
    const TOKEN = "__TOKEN__"; // o compilador (appbuilder.py) grava aqui o token do dispositivo

    function dados(pos) {
        var st = System.getSystemStats();
        var d = { "token" => TOKEN, "bateria" => st.battery, "t" => Time.now().value() };
        if (st has :charging) { d["carregando"] = st.charging; }
        if (st has :batteryInDays) { d["bateria_dias"] = st.batteryInDays; }
        var pi = pos;
        if (pi == null && (Toybox has :Position)) {
            try { pi = Position.getInfo(); } catch (e) { pi = null; }
        }
        if (pi != null && pi.position != null && pi.accuracy != null && pi.accuracy != Position.QUALITY_NOT_AVAILABLE) {
            var ll = pi.position.toDegrees();
            if (ll[0] != 0 || ll[1] != 0) {
                d["lat"] = ll[0]; d["lon"] = ll[1]; d["precisao"] = pi.accuracy;
                if (pi.when != null) { d["fix_t"] = pi.when.value(); }
                if (pi.altitude != null) { d["alt"] = pi.altitude; }
                if (pi.speed != null) { d["vel"] = pi.speed; }
                if (pi.heading != null) { d["rumo"] = pi.heading; }
            }
        }
        try {
            var am = ActivityMonitor.getInfo();
            if (am != null) {
                d["passos"] = am.steps; d["calorias"] = am.calories; d["distancia_cm"] = am.distance;
                if (am has :floorsClimbed) { d["andares"] = am.floorsClimbed; }
            }
            var h = ActivityMonitor.getHeartRateHistory(3, true);
            if (h != null) { var s = h.next(); while (s != null && d["fc"] == null) { if (s.heartRate != null && s.heartRate != ActivityMonitor.INVALID_HR_SAMPLE) { d["fc"] = s.heartRate; } s = h.next(); } }
        } catch (e) { }
        try {
            if (d["fc"] == null && (SensorHistory has :getHeartRateHistory)) { d["fc"] = Coletor.ultimo(SensorHistory.getHeartRateHistory({ :period => 5, :order => SensorHistory.ORDER_NEWEST_FIRST })); }
            if (SensorHistory has :getBodyBatteryHistory) { d["body_battery"] = Coletor.ultimo(SensorHistory.getBodyBatteryHistory({ :period => 5, :order => SensorHistory.ORDER_NEWEST_FIRST })); }
            if (SensorHistory has :getStressHistory) { d["estresse"] = Coletor.ultimo(SensorHistory.getStressHistory({ :period => 5, :order => SensorHistory.ORDER_NEWEST_FIRST })); }
            if (SensorHistory has :getOxygenSaturationHistory) { d["spo2"] = Coletor.ultimo(SensorHistory.getOxygenSaturationHistory({ :period => 5, :order => SensorHistory.ORDER_NEWEST_FIRST })); }
        } catch (e) { }
        return d;
    }

    function ultimo(it) {
        if (it == null) { return null; }
        var x = it.next();
        while (x != null) { if (x.data != null) { return x.data; } x = it.next(); }
        return null;
    }

    function enviar(d, cb) {
        Communications.makeWebRequest(URL, d, {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, cb);
    }
}

(:background)
class RastreadorApp extends Application.AppBase {
    function initialize() { AppBase.initialize(); }
    function onStart(state) { }
    function onStop(state) { }
    function getInitialView() {
        if (Toybox.System has :ServiceDelegate) { Background.registerForTemporalEvent(new Time.Duration(5 * 60)); }
        return [new PrincipalView(), new PrincipalDelegate()];
    }
    function getServiceDelegate() { return [new SegundoPlano()]; }
    function onBackgroundData(data) {
        Application.Storage.setValue("ultimo", data);
        WatchUi.requestUpdate();
    }
}

(:background)
class SegundoPlano extends System.ServiceDelegate {
    function initialize() { ServiceDelegate.initialize(); }
    function onTemporalEvent() {
        var d = Coletor.dados(null); d["origem"] = "segundo_plano";
        Coletor.enviar(d, method(:resposta));
    }
    function resposta(code, data) { Background.exit({ "code" => code, "t" => Time.now().value() }); }
}
