/*
 * Walkie-Talkie Alequizão (Connect IQ) · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * "Walkie-talkie" de mensagens para relógios Garmin: canal compartilhado, conversa rolável (UP/DOWN),
 * mensagens rápidas e texto livre (teclado do relógio, quando o aparelho tem), SOS com localização e
 * "chamar atenção" (vibra/apita 10 s). Intervalo, frases e aviso de nova versão vêm do servidor, então
 * a maioria das mudanças não exige reinstalar. Aberto: consulta no intervalo do servidor (padrão 8 s).
 * Fechado: a cada 5 min (limite da Garmin) e pede para abrir o app quando chega mensagem.
 * Voz não é possível: a Garmin não dá acesso a microfone/alto-falante para apps de terceiros.
 */
import Toybox.Application;
import Toybox.Attention;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Position;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

(:background)
module Radio {
    const URL = "__URL__";     // gravado pelo compilador (appbuilder.py)
    const TOKEN = "__TOKEN__"; // gravado pelo compilador (appbuilder.py)
    const VERSAO = "2.0.0";    // versão deste app (comparada com config.versao_app do servidor)

    function pedir(dados, cb) {
        dados["token"] = TOKEN;
        dados["versao"] = VERSAO;
        Communications.makeWebRequest(URL, dados, {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, cb);
    }
}

(:background)
class RadioApp extends Application.AppBase {
    function initialize() { AppBase.initialize(); }
    function onStart(state) { }
    function onStop(state) { }
    function getInitialView() {
        if (Toybox.System has :ServiceDelegate) { Background.registerForTemporalEvent(new Time.Duration(5 * 60)); }
        return [new RadioView(), new RadioDelegate()];
    }
    function getServiceDelegate() { return [new RadioFundo()]; }
    function onBackgroundData(data) { WatchUi.requestUpdate(); }
}

// segundo plano: procura mensagens novas e pede para abrir o app
(:background)
class RadioFundo extends System.ServiceDelegate {
    function initialize() { ServiceDelegate.initialize(); }
    function onTemporalEvent() {
        var ult = Application.Storage.getValue("ultimo");
        Radio.pedir({ "acao" => "receber", "desde" => (ult == null ? 0 : ult), "fundo" => 1 }, method(:resposta));
    }
    function resposta(code, data) {
        if (code == 200 && data != null && data["novas"] != null && data["novas"] > 0 && (Background has :requestApplicationWake)) {
            Background.requestApplicationWake(data["resumo"] == null ? "Nova mensagem no Walkie-Talkie" : data["resumo"]);
        }
        Background.exit(null);
    }
}

// ---------- estado ----------
const MAX_MSGS = 20;
var mensagens = [];
var canal = "Walkie-Talkie";
var estado = "Conectando...";
var ultimoId = 0;
var aguardando = false;
var carregado = false;
var relogioTimer = null;
var intervaloMs = 8000;
var frases = null;
var deslocamento = 0;      // 0 = mostra as mais recentes; >0 = rolou para mensagens antigas
var avisoServidor = null;
var atualizacao = false;

function versaoMaior(a, b) {
    if (a == null || b == null) { return false; }
    var pa = partes(a), pb = partes(b);
    for (var i = 0; i < 3; i++) {
        if (pa[i] > pb[i]) { return true; }
        if (pa[i] < pb[i]) { return false; }
    }
    return false;
}
function partes(v) {
    var r = [0, 0, 0], s = v.toString(), i = 0;
    while (i < 3) {
        var p = s.find(".");
        var t = p == null ? s : s.substring(0, p);
        var n = t.toNumber();
        r[i] = n == null ? 0 : n;
        if (p == null) { break; }
        s = s.substring(p + 1, s.length());
        i++;
    }
    return r;
}

function iniciarTimer() {
    if ($.relogioTimer == null) { $.relogioTimer = new Timer.Timer(); }
    $.relogioTimer.stop();
    $.relogioTimer.start(new Method($, :buscar), $.intervaloMs, true);
}

function buscar() {
    if ($.aguardando) { return; }
    $.aguardando = true;
    Radio.pedir({ "acao" => "receber", "desde" => $.ultimoId, "limite" => MAX_MSGS }, new Method($, :recebido));
}

function recebido(code, data) {
    $.aguardando = false;
    if (code != 200 || data == null) { $.estado = "Sem conexao (" + code + ")"; WatchUi.requestUpdate(); return; }
    if (data["canal"] != null) { $.canal = data["canal"]; }
    if (data["frases"] != null && data["frases"].size() > 0) { $.frases = data["frases"]; Application.Storage.setValue("frases", data["frases"]); }
    var cfg = data["config"];
    if (cfg != null) {
        if (cfg["intervalo_s"] != null) {
            var ms = cfg["intervalo_s"].toNumber() * 1000;
            if (ms < 3000) { ms = 3000; }
            if (ms != $.intervaloMs) { $.intervaloMs = ms; iniciarTimer(); }
        }
        $.avisoServidor = cfg["aviso"];
        $.atualizacao = versaoMaior(cfg["versao_app"], Radio.VERSAO);
    }
    $.estado = (data["online"] != null ? data["online"] + " no canal" : "Online");
    var l = data["mensagens"];
    var novas = false;
    var ultNova = null;
    if (l != null) {
        for (var i = 0; i < l.size(); i++) {
            $.mensagens.add(l[i]);
            if (l[i]["id"] > $.ultimoId) { $.ultimoId = l[i]["id"]; }
            if (l[i]["meu"] != 1) { novas = true; ultNova = l[i]; }
        }
        while ($.mensagens.size() > MAX_MSGS) { $.mensagens = $.mensagens.slice(1, null); }
        Application.Storage.setValue("ultimo", $.ultimoId);
        if (l.size() > 0) { $.deslocamento = 0; }
    }
    if (novas && $.carregado && ultNova != null) {
        if (ultNova["atencao"] == 1 || ultNova["sos"] == 1) { chamarAtencao(); } else { alertar(); }
    }
    $.carregado = true;
    WatchUi.requestUpdate();
}

// "Chamar atenção" e SOS: vibra e apita por 10 segundos (pulsos de 1 s)
var atencaoTimer = null;
var atencaoPulsos = 0;
function chamarAtencao() {
    $.atencaoPulsos = 0;
    if ($.atencaoTimer == null) { $.atencaoTimer = new Timer.Timer(); }
    $.atencaoTimer.stop();
    pulsoAtencao();
    $.atencaoTimer.start(new Method($, :pulsoAtencao), 1000, true);
}
function pulsoAtencao() {
    $.atencaoPulsos += 1;
    if ($.atencaoPulsos > 10) { $.atencaoTimer.stop(); return; }
    if (Attention has :vibrate) { Attention.vibrate([new Attention.VibeProfile(100, 700)]); }
    if (Attention has :playTone) { Attention.playTone(Attention.TONE_ALARM); }
    if (Attention has :backlight) { try { Attention.backlight(true); } catch (e) { } }
}
function alertar() {
    if (Attention has :vibrate) { Attention.vibrate([new Attention.VibeProfile(80, 250), new Attention.VibeProfile(0, 120), new Attention.VibeProfile(80, 250)]); }
    if (Attention has :playTone) { Attention.playTone(Attention.TONE_ALERT_HI); }
    if (Attention has :backlight) { try { Attention.backlight(true); } catch (e) { } }
}

function enviar(texto, sos) { enviarTipo(texto, sos, false); }

function enviarTipo(texto, sos, atencao) {
    if (texto == null || texto.length() == 0) { return; }
    $.estado = "Enviando...";
    var d = { "acao" => "enviar", "texto" => texto, "sos" => (sos ? 1 : 0), "tipo" => (atencao ? "atencao" : "texto") };
    try {
        var pi = Position.getInfo();
        if (pi != null && pi.position != null && pi.accuracy != null && pi.accuracy != Position.QUALITY_NOT_AVAILABLE) {
            var ll = pi.position.toDegrees();
            if (ll[0] != 0 || ll[1] != 0) { d["lat"] = ll[0]; d["lon"] = ll[1]; d["precisao"] = pi.accuracy; }
        }
    } catch (e) { }
    if (Attention has :vibrate) { Attention.vibrate([new Attention.VibeProfile(50, 80)]); }
    Radio.pedir(d, new Method($, :enviado));
    WatchUi.requestUpdate();
}

function enviado(code, data) {
    $.estado = code == 200 ? "Enviado" : "Falha no envio (" + code + ")";
    buscar();
}

function podeEscrever() { return WatchUi has :TextPicker; }

class RadioView extends WatchUi.View {
    function initialize() { View.initialize(); }
    function onShow() {
        if ($.frases == null) { $.frases = Application.Storage.getValue("frases"); }
        iniciarTimer();
        buscar();
    }
    function onHide() { if ($.relogioTimer != null) { $.relogioTimer.stop(); } }
    function onUpdate(dc) {
        var w = dc.getWidth(), h = dc.getHeight();
        var f = Graphics.FONT_XTINY, fh = dc.getFontHeight(f);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK); dc.clear();
        dc.setColor(0xFB8C1E, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.07, f, "WALKIE-TALKIE", Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.07 + fh - 2, f, $.canal, Graphics.TEXT_JUSTIFY_CENTER);
        var topo = h * 0.07 + fh * 2 + 2;
        dc.setColor(0x1FA3E3, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(w * 0.2, topo, w * 0.6, 2);

        var y = topo + 6, base = h * 0.80, larg = w * 0.76;
        var n = $.mensagens.size();
        if (n == 0) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.42, f, "Nenhuma mensagem", Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            // monta de baixo para cima a partir da mensagem (n - 1 - deslocamento)
            var fim = n - 1 - $.deslocamento;
            if (fim < 0) { fim = 0; }
            var blocos = [];
            var altura = 0;
            for (var i = fim; i >= 0; i--) {
                var m = $.mensagens[i];
                var t = m["texto"] == null ? "" : m["texto"];
                if (m["sos"] == 1) { t = "SOS: " + t; } else if (m["atencao"] == 1) { t = "(!) " + t; }
                if (Graphics has :fitTextToArea) { t = Graphics.fitTextToArea(t, f, larg, fh * 3, true); }
                var hb = fh - 2 + dc.getTextDimensions(t, f)[1] + 4;
                if (altura + hb > base - y && blocos.size() > 0) { break; }
                blocos.add([m, t, hb]);
                altura += hb;
            }
            var yy = base - altura;
            if (yy < y) { yy = y; }
            for (var k = blocos.size() - 1; k >= 0; k--) {
                var b = blocos[k], m2 = b[0];
                var cor = m2["sos"] == 1 ? 0xEF4B5B : (m2["atencao"] == 1 ? 0xFB8C1E : (m2["meu"] == 1 ? 0x1FA3E3 : 0xF5C23B));
                dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, yy, f, m2["autor"] + " " + m2["hora"], Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, yy + fh - 2, f, b[1], Graphics.TEXT_JUSTIFY_CENTER);
                yy += b[2];
            }
            if ($.deslocamento > 0) {
                dc.setColor(0x1FA3E3, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, base, f, "v mais recentes (" + $.deslocamento + ")", Graphics.TEXT_JUSTIFY_CENTER);
            }
        }
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        var rodape = $.atualizacao ? "Atualizacao disponivel" : ($.avisoServidor != null && $.avisoServidor.length() > 0 ? $.avisoServidor : $.estado);
        if ($.atualizacao) { dc.setColor(0x5EE08A, Graphics.COLOR_TRANSPARENT); }
        dc.drawText(w / 2, h * 0.855, f, rodape, Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(0xFB8C1E, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.855 + fh - 2, f, $.atualizacao ? "alequizao.com/garmin > Apps" : "START: responder", Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class RadioDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }
    function onSelect() { abrirMenu(); return true; }
    function onMenu() { abrirMenu(); return true; }
    // UP / swipe para baixo: mensagens antigas · DOWN / swipe para cima: mais recentes
    function onPreviousPage() { rolar(1); return true; }
    function onNextPage() { rolar(-1); return true; }
    function rolar(d) {
        var max = $.mensagens.size() - 1;
        $.deslocamento += d;
        if ($.deslocamento < 0) { $.deslocamento = 0; }
        if (max < 0) { max = 0; }
        if ($.deslocamento > max) { $.deslocamento = max; }
        WatchUi.requestUpdate();
    }
    function abrirMenu() {
        var n = $.mensagens.size();
        var titulo = "Enviar";
        if (n > 0) {
            var idx = n - 1 - $.deslocamento;
            if (idx < 0) { idx = 0; }
            var m = $.mensagens[idx];
            if (m["meu"] != 1) { titulo = "Responder " + m["autor"]; }
        }
        var menu = new WatchUi.Menu2({ :title => titulo });
        if (podeEscrever()) { menu.addItem(new WatchUi.MenuItem("Escrever", "teclado do relogio", "__ESCREVER__", null)); }
        var fr = $.frases;
        if (fr == null) { fr = Application.Storage.getValue("frases"); }
        if (fr == null) { fr = ["OK", "Chegando", "Me espera", "Estou bem", "Ja estou indo", "Onde voce esta?", "Me liga", "Terminei o treino", "Preciso de ajuda"]; }
        for (var i = 0; i < fr.size(); i++) { menu.addItem(new WatchUi.MenuItem(fr[i], null, fr[i], null)); }
        menu.addItem(new WatchUi.MenuItem("Chamar atencao", "vibra 10 s nos outros", "__ATENCAO__", null));
        menu.addItem(new WatchUi.MenuItem("SOS", "envia sua localizacao", "__SOS__", null));
        menu.addItem(new WatchUi.MenuItem("Atualizar", "v" + Radio.VERSAO, "__ATUALIZAR__", null));
        WatchUi.pushView(menu, new RadioMenuDelegate(), WatchUi.SLIDE_UP);
    }
}

class RadioMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() { Menu2InputDelegate.initialize(); }
    function onSelect(item) {
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id.equals("__ATUALIZAR__")) { buscar(); return; }
        if (id.equals("__SOS__")) { enviar("SOS! Preciso de ajuda", true); return; }
        if (id.equals("__ATENCAO__")) { enviarTipo("Atencao!", false, true); return; }
        if (id.equals("__ESCREVER__")) {
            if (podeEscrever()) { WatchUi.pushView(new WatchUi.TextPicker(""), new RadioTextoDelegate(), WatchUi.SLIDE_LEFT); }
            return;
        }
        enviar(id, false);
    }
}

class RadioTextoDelegate extends WatchUi.TextPickerDelegate {
    function initialize() { TextPickerDelegate.initialize(); }
    function onTextEntered(texto, mudou) {
        if (texto != null && texto.length() > 0) {
            enviar(texto.length() > 120 ? texto.substring(0, 120) : texto, false);
        }
        return true;
    }
    function onCancel() { return true; }
}
