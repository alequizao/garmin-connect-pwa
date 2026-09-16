import Toybox.Activity;
import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
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
        var h = dc.getHeight();
        var redondo = System.getDeviceSettings().screenShape == System.SCREEN_SHAPE_ROUND;
        var st = System.getSystemStats();
        var gps = "GPS: sem sinal";
        if ($.gpsInfo != null && $.gpsInfo.accuracy != null) {
            gps = $.gpsInfo.accuracy >= Position.QUALITY_GOOD ? "GPS: bom" : ($.gpsInfo.accuracy >= Position.QUALITY_USABLE ? "GPS: fraco" : "GPS: procurando");
        }
        var txt = "Enviados: " + $.enviados;
        if ($.ultimoEnvio != null) {
            var i = Gregorian.info($.ultimoEnvio, Time.FORMAT_SHORT);
            txt += " · " + i.hour.format("%02d") + ":" + i.min.format("%02d") + ":" + i.sec.format("%02d") + ($.ultimoCodigo == 200 ? " ok" : " x");
        }
        var fx = [Graphics.FONT_XTINY];
        lPilha(dc, [
            [$.ativo ? "AO VIVO" : "RASTREADOR", fx, $.ativo ? 0x3DDC84 : 0x00A0DF],
            [st.battery.format("%d") + "%", [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_LARGE, Graphics.FONT_MEDIUM], Graphics.COLOR_WHITE],
            [gps, fx, Graphics.COLOR_LT_GRAY],
            [txt, fx, Graphics.COLOR_LT_GRAY],
            [$.estado == null ? "" : $.estado, fx, Graphics.COLOR_LT_GRAY],
            ["fechado: envia a cada 5 min", fx, 0x6A6A70]
        ], h * (redondo ? 0.07 : 0.03), h * (redondo ? 0.94 : 0.97), redondo);
    }
}



/* ---- layout responsivo SEM cortes: fonte menor e, se preciso, quebra em linhas ---- */
function lCorda(y1, y2, w, h, redondo) {
    if (!redondo) { return w * 0.92; }
    var r = w / 2.0, cy = h / 2.0;
    var d = (y1 - cy).abs() > (y2 - cy).abs() ? (y1 - cy).abs() : (y2 - cy).abs();
    if (d >= r) { return 1; }
    return 2 * Math.sqrt(r * r - d * d) * 0.92;
}
/* quebra por palavra; palavra maior que a linha quebra por caracteres */
function lQuebrar(dc, t, fonte, larg) {
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
/* devolve [fonte, linhas] na altura y: primeira fonte que cabe inteira; senão a menor, quebrada */
function lMedir(dc, t, fontes, y, redondo) {
    var w = dc.getWidth(), h = dc.getHeight();
    if (t == null) { t = ""; }
    for (var i = 0; i < fontes.size(); i++) {
        var fh = dc.getFontHeight(fontes[i]);
        if (dc.getTextWidthInPixels(t, fontes[i]) <= lCorda(y, y + fh, w, h, redondo)) { return [fontes[i], [t]]; }
    }
    var f = fontes[fontes.size() - 1], fh2 = dc.getFontHeight(f);
    var linhas = lQuebrar(dc, t, f, lCorda(y, y + fh2, w, h, redondo));
    for (var it = 0; it < 4; it++) {
        var novas = lQuebrar(dc, t, f, lCorda(y, y + fh2 * linhas.size(), w, h, redondo));
        if (novas.size() == linhas.size()) { return [f, novas]; }
        linhas = novas;
    }
    return [f, linhas];
}
function lAltura(dc, m) { return dc.getFontHeight(m[0]) * m[1].size(); }
/* desenha [fonte, linhas] a partir de y, linhas de ini até fim (exclusivo) */
function lDesenhar(dc, cx, y, m, ini, fim) {
    var fh = dc.getFontHeight(m[0]);
    for (var i = ini; i < fim && i < m[1].size(); i++) { dc.drawText(cx, y + (i - ini) * fh, m[0], m[1][i], Graphics.TEXT_JUSTIFY_CENTER); }
}
/* pilha vertical de blocos [texto, fontes, cor] distribuindo a sobra em espaços iguais */
function lPilha(dc, itens, yIni, yFim, redondo) {
    var n = itens.size(), alt = new [n], med = new [n];
    for (var i = 0; i < n; i++) { alt[i] = dc.getFontHeight(itens[i][1][0]); }
    var esp = 0;
    for (var it = 0; it < 4; it++) {
        var total = 0; for (var a = 0; a < n; a++) { total += alt[a]; }
        esp = (yFim - yIni - total) / (n + 1.0); if (esp < 0) { esp = 0; }
        var y = yIni + esp, mudou = false;
        for (var b = 0; b < n; b++) {
            med[b] = lMedir(dc, itens[b][0], itens[b][1], y, redondo);
            var novo = lAltura(dc, med[b]); if (novo != alt[b]) { mudou = true; alt[b] = novo; }
            y += alt[b] + esp;
        }
        if (!mudou) { break; }
    }
    var yy = yIni + esp;
    for (var d = 0; d < n; d++) {
        dc.setColor(itens[d][2], Graphics.COLOR_TRANSPARENT);
        lDesenhar(dc, dc.getWidth() / 2, yy, med[d], 0, med[d][1].size());
        yy += alt[d] + esp;
    }
}

class PrincipalDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }
    // segurar UP (menu) abre "Sobre o desenvolvedor"
    function onMenu() { abrirSobre("Rastreador Alequizao", ""); return true; }
    // START liga/pausa o rastreamento ao vivo
    function onSelect() {
        if ($.ativo) { desligar(); } else { ligar(); }
        WatchUi.requestUpdate();
        return true;
    }
}
