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
import Toybox.Math;
import Toybox.Position;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

(:background)
module Radio {
    const URL = "__URL__";     // gravado pelo compilador (appbuilder.py)
    const TOKEN = "__TOKEN__"; // gravado pelo compilador (appbuilder.py)
    const VERSAO = "2.3.2";    // versão deste app (comparada com config.versao_app do servidor)

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
        var ult = Application.Storage.getValue("vistoGlobal");
        if (ult == null) { ult = Application.Storage.getValue("ultimo"); }
        Radio.pedir({ "acao" => "receber", "desde" => (ult == null ? 0 : ult), "fundo" => 1 }, method(:resposta));
    }
    function resposta(code, data) {
        if (code == 200 && data != null && data["novas"] != null && data["novas"] > 0) {
            var resumo = data["resumo"] == null ? "Nova mensagem" : data["resumo"];
            var avisou = false;
            // relógios com API 5.1+ (ex.: Forerunner 165): notificação nativa do sistema, com vibração do relógio
            if (Toybox has :Notifications) {
                try {
                    Toybox.Notifications.showNotification(data["atencao"] == 1 ? "Chamando sua atencao" : (data["sos"] == 1 ? "SOS" : "Walkie-Talkie"),
                        resumo, { :body => (data["canal"] == null ? "Toque para abrir" : "Canal " + data["canal"]), :dismissPrevious => true });
                    avisou = true;
                } catch (e) { avisou = false; }
            }
            // relógios antigos (ou se a notificação nativa falhar): pede para abrir o app
            if (!avisou && (Background has :requestApplicationWake)) { Background.requestApplicationWake(resumo); }
        }
        Background.exit(null);
    }
}

// ---------- estado ----------
const MAX_MSGS = 20;
var canalId = null;     // canal aberto (null = principal escolhido pelo servidor)
var canais = [];        // todos os canais da pessoa [{id, nome, ultimo_id, online}]
var mensagens = [];
var canal = "Walkie-Talkie";
var estado = "Conectando...";
var ultimoId = 0;
var aguardando = false;
var carregado = false;
var relogioTimer = null;
var linhaIni = 0;      // rolagem por linha quando a mensagem mais recente não cabe inteira
var maxLinhaIni = 0;
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
    var d = { "acao" => "receber", "desde" => $.ultimoId, "limite" => MAX_MSGS };
    if ($.canalId != null) { d["canal"] = $.canalId; }
    Radio.pedir(d, new Method($, :recebido));
}

function recebido(code, data) {
    $.aguardando = false;
    if (code != 200 || data == null) { $.estado = "Sem conexao (" + code + ")"; WatchUi.requestUpdate(); return; }
    if (data["canal"] != null) { $.canal = data["canal"]; }
    if (data["canais"] != null) {
        $.canais = data["canais"];
        var maior = 0;
        for (var c = 0; c < $.canais.size(); c++) { if ($.canais[c]["ultimo_id"] != null && $.canais[c]["ultimo_id"] > maior) { maior = $.canais[c]["ultimo_id"]; } }
        Application.Storage.setValue("vistoGlobal", maior);
    }
    if (data["canal_id"] != null && $.canalId == null) { $.canalId = data["canal_id"]; Application.Storage.setValue("canal", $.canalId); }
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
    if ($.canalId != null) { d["canal"] = $.canalId; }
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

function trocarCanal(id) {
    if (id == $.canalId) { return; }
    $.canalId = id; Application.Storage.setValue("canal", id);
    $.mensagens = []; $.ultimoId = 0; $.carregado = false; $.deslocamento = 0; $.frases = null;
    for (var c = 0; c < $.canais.size(); c++) { if ($.canais[c]["id"] == id) { $.canal = $.canais[c]["nome"]; } }
    $.estado = "Abrindo canal...";
    WatchUi.requestUpdate();
    buscar();
}

function podeEscrever() { return WatchUi has :TextPicker; }

class RadioView extends WatchUi.View {
    function initialize() { View.initialize(); }
    function onShow() {
        if ($.frases == null) { $.frases = Application.Storage.getValue("frases"); }
        if ($.canalId == null) { $.canalId = Application.Storage.getValue("canal"); }
        iniciarTimer();
        buscar();
    }
    function onHide() { if ($.relogioTimer != null) { $.relogioTimer.stop(); } }
    function onUpdate(dc) {
        var w = dc.getWidth(), h = dc.getHeight(), cx = w / 2;
        var redondo = System.getDeviceSettings().screenShape == System.SCREEN_SHAPE_ROUND;
        var fx = [Graphics.FONT_XTINY], fh = dc.getFontHeight(Graphics.FONT_XTINY);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK); dc.clear();
        var yIni = h * (redondo ? 0.07 : 0.03), yFim = h * (redondo ? 0.94 : 0.97), esp = fh * 0.25;

        // cabeçalho (sem cortes)
        var y = yIni;
        var mT = lMedir(dc, "WALKIE-TALKIE", fx, y, redondo);
        dc.setColor(0xFB8C1E, Graphics.COLOR_TRANSPARENT); lDesenhar(dc, cx, y, mT, 0, mT[1].size()); y += lAltura(dc, mT);
        var nomeCanal = $.canal;
        if ($.canais.size() > 1) {
            for (var c = 0; c < $.canais.size(); c++) { if ($.canais[c]["id"] == $.canalId) { nomeCanal = $.canal + " (" + (c + 1) + "/" + $.canais.size() + ")"; } }
        }
        var mC = lMedir(dc, nomeCanal, [Graphics.FONT_TINY, Graphics.FONT_XTINY], y, redondo);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT); lDesenhar(dc, cx, y, mC, 0, mC[1].size()); y += lAltura(dc, mC) + 2;
        var lsep = lCorda(y, y + 2, w, h, redondo) * 0.7;
        dc.setColor(0x1FA3E3, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(cx - lsep / 2, y, lsep, 2);
        y += 2 + esp;

        // rodapé: mede de baixo para cima (quebra se precisar)
        var rodape = $.atualizacao ? "Atualizacao disponivel" : ($.avisoServidor != null && $.avisoServidor.length() > 0 ? $.avisoServidor : $.estado);
        if (rodape == null) { rodape = ""; }
        var dica = $.atualizacao ? "alequizao.com/garmin > Apps" : "START: responder";
        var mD = lMedirAcima(dc, dica, Graphics.FONT_XTINY, yFim, redondo); var aD = lAltura(dc, mD);
        var mR = lMedirAcima(dc, rodape, Graphics.FONT_XTINY, yFim - aD, redondo); var aR = lAltura(dc, mR);
        var yRod = yFim - aD - aR;
        dc.setColor($.atualizacao ? 0x5EE08A : Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT); lDesenhar(dc, cx, yRod, mR, 0, mR[1].size());
        dc.setColor(0xFB8C1E, Graphics.COLOR_TRANSPARENT); lDesenhar(dc, cx, yRod + aR, mD, 0, mD[1].size());

        var base = yRod - esp;
        var n = $.mensagens.size();
        $.maxLinhaIni = 0;
        if (n == 0) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            var mV = lMedir(dc, "Nenhuma mensagem", fx, (y + base - fh) / 2, redondo); lDesenhar(dc, cx, (y + base - lAltura(dc, mV)) / 2, mV, 0, mV[1].size());
            return;
        }
        var aviso = $.deslocamento > 0;
        var limite = aviso ? base - fh : base;
        var fim = n - 1 - $.deslocamento;
        if (fim < 0) { fim = 0; }
        // cada mensagem inteira: autor/hora + texto, medidos na largura mais estreita da área (nunca passa da borda)
        var blocos = [], altura = 0;
        for (var i = fim; i >= 0; i--) {
            var m = $.mensagens[i];
            var t = m["texto"] == null ? "" : m["texto"];
            if (m["sos"] == 1) { t = "SOS: " + t; } else if (m["atencao"] == 1) { t = "(!) " + t; }
            var mA = lMedirArea(dc, m["autor"] + " " + m["hora"], y, limite, redondo);
            var mX = lMedirArea(dc, t, y, limite, redondo);
            var hb = lAltura(dc, mA) + lAltura(dc, mX) + esp;
            if (altura + hb > limite - y) {
                if (blocos.size() == 0) {
                    // a mais recente sozinha não cabe: mostra as linhas que cabem e rola o resto com UP/DOWN
                    var todas = [], cores = [];
                    var corM = m["sos"] == 1 ? 0xEF4B5B : (m["atencao"] == 1 ? 0xFB8C1E : (m["meu"] == 1 ? 0x1FA3E3 : 0xF5C23B));
                    for (var a = 0; a < mA[1].size(); a++) { todas.add(mA[1][a]); cores.add(corM); }
                    for (var b = 0; b < mX[1].size(); b++) { todas.add(mX[1][b]); cores.add(Graphics.COLOR_WHITE); }
                    var cabem = ((limite - y) / fh).toNumber(); if (cabem < 1) { cabem = 1; }
                    var temMais = todas.size() > cabem;
                    if (temMais) { cabem -= 1; if (cabem < 1) { cabem = 1; } }
                    $.maxLinhaIni = todas.size() - cabem; if ($.maxLinhaIni < 0) { $.maxLinhaIni = 0; }
                    if ($.linhaIni > $.maxLinhaIni) { $.linhaIni = $.maxLinhaIni; }
                    for (var L = 0; L < cabem && $.linhaIni + L < todas.size(); L++) {
                        dc.setColor(cores[$.linhaIni + L], Graphics.COLOR_TRANSPARENT);
                        dc.drawText(cx, y + L * fh, Graphics.FONT_XTINY, todas[$.linhaIni + L], Graphics.TEXT_JUSTIFY_CENTER);
                    }
                    if (temMais) {
                        dc.setColor(0x1FA3E3, Graphics.COLOR_TRANSPARENT);
                        var mS = lMedir(dc, "DOWN: continua (" + ($.linhaIni + cabem) + "/" + todas.size() + ")", fx, y + cabem * fh, redondo);
                        dc.drawText(cx, y + cabem * fh, Graphics.FONT_XTINY, mS[1][0], Graphics.TEXT_JUSTIFY_CENTER);
                    }
                }
                break;
            }
            blocos.add([m, mA, mX, hb]);
            altura += hb;
        }
        var yy = limite - altura;
        for (var k2 = blocos.size() - 1; k2 >= 0; k2--) {
            var bl = blocos[k2], m2 = bl[0];
            var cor = m2["sos"] == 1 ? 0xEF4B5B : (m2["atencao"] == 1 ? 0xFB8C1E : (m2["meu"] == 1 ? 0x1FA3E3 : 0xF5C23B));
            dc.setColor(cor, Graphics.COLOR_TRANSPARENT); lDesenhar(dc, cx, yy, bl[1], 0, bl[1][1].size());
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT); lDesenhar(dc, cx, yy + lAltura(dc, bl[1]), bl[2], 0, bl[2][1].size());
            yy += bl[3];
        }
        if (aviso && blocos.size() > 0) {
            dc.setColor(0x1FA3E3, Graphics.COLOR_TRANSPARENT);
            var mAv = lMedir(dc, "v mais recentes (" + $.deslocamento + ")", fx, limite, redondo);
            dc.drawText(cx, limite, Graphics.FONT_XTINY, mAv[1][0], Graphics.TEXT_JUSTIFY_CENTER);
        }
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
/* bloco que termina em yBase: quebra na corda da sua altura final, iterando até estabilizar */
function lMedirAcima(dc, t, f, yBase, redondo) {
    var w = dc.getWidth(), h = dc.getHeight(), fh = dc.getFontHeight(f);
    if (t == null) { t = ""; }
    var linhas = [t];
    for (var it = 0; it < 6; it++) {
        var novas = lQuebrar(dc, t, f, lCorda(yBase - fh * linhas.size(), yBase, w, h, redondo));
        if (novas.size() == linhas.size()) { return [f, novas]; }
        linhas = novas;
    }
    return [f, lQuebrar(dc, t, f, lCorda(yBase - fh * linhas.size(), yBase, w, h, redondo))];
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

function lMedirArea(dc, t, y1, y2, redondo) {
    var w = dc.getWidth(), h = dc.getHeight(), larg = lCorda(y1, y2, w, h, redondo), f = Graphics.FONT_XTINY;
    if (t == null) { t = ""; }
    return [f, lQuebrar(dc, t, f, larg)];
}

class RadioDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }
    function onSelect() { abrirMenu(); return true; }
    function onMenu() { abrirMenu(); return true; }
    // UP / swipe para baixo: mensagens antigas · DOWN / swipe para cima: mais recentes
    function onPreviousPage() { rolar(1); return true; }
    function onNextPage() { rolar(-1); return true; }
    function rolar(d) {
        if ($.maxLinhaIni > 0) {
            if (d < 0 && $.linhaIni < $.maxLinhaIni) { $.linhaIni += 1; WatchUi.requestUpdate(); return; }
            if (d > 0 && $.linhaIni > 0) { $.linhaIni -= 1; WatchUi.requestUpdate(); return; }
        }
        $.linhaIni = 0;
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
        if ($.canais.size() > 1) { menu.addItem(new WatchUi.MenuItem("Canais (" + $.canais.size() + ")", "atual: " + $.canal, "__CANAIS__", null)); }
        if (podeEscrever()) { menu.addItem(new WatchUi.MenuItem("Escrever", "teclado do relogio", "__ESCREVER__", null)); }
        var fr = $.frases;
        if (fr == null) { fr = Application.Storage.getValue("frases"); }
        if (fr == null) { fr = ["OK", "Chegando", "Me espera", "Estou bem", "Ja estou indo", "Onde voce esta?", "Me liga", "Terminei o treino", "Preciso de ajuda"]; }
        for (var i = 0; i < fr.size(); i++) { menu.addItem(new WatchUi.MenuItem(fr[i], null, fr[i], null)); }
        menu.addItem(new WatchUi.MenuItem("Chamar atencao", "vibra 10 s nos outros", "__ATENCAO__", null));
        menu.addItem(new WatchUi.MenuItem("SOS", "envia sua localizacao", "__SOS__", null));
        menu.addItem(new WatchUi.MenuItem("Atualizar", "v" + Radio.VERSAO, "__ATUALIZAR__", null));
        menu.addItem(new WatchUi.MenuItem("Sobre", "desenvolvedor", "__SOBRE__", null));
        WatchUi.pushView(menu, new RadioMenuDelegate(), WatchUi.SLIDE_UP);
    }
}

class RadioMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() { Menu2InputDelegate.initialize(); }
    function onSelect(item) {
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id.equals("__ATUALIZAR__")) { buscar(); return; }
        if (id.equals("__CANAIS__")) { abrirCanais(); return; }
        if (id.equals("__SOBRE__")) { abrirSobre("Walkie-Talkie Alequizao", Radio.VERSAO); return; }
        if (id instanceof Lang.Number) { trocarCanal(id); return; }
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

// lista de todos os canais da pessoa (o principal vem primeiro)
function abrirCanais() {
    var menu = new WatchUi.Menu2({ :title => "Canais" });
    for (var c = 0; c < $.canais.size(); c++) {
        var k = $.canais[c];
        var sub = (k["online"] != null ? k["online"] + " on-line" : "") + (c == 0 ? " · principal" : "") + (k["id"] == $.canalId ? " · aberto" : "");
        menu.addItem(new WatchUi.MenuItem(k["nome"], sub, k["id"], null));
    }
    WatchUi.pushView(menu, new RadioMenuDelegate(), WatchUi.SLIDE_UP);
}
