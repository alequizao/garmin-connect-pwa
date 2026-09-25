//
// Próximo Ônibus · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
// https://github.com/alequizao · © 2026 Alequizao. Todos os direitos reservados.
//
// Quando chega o próximo ônibus no seu ponto favorito (Maceió / Rio Largo).
// Dados: https://alequizao.com/agendamentos/relogio_onibus.php — previsão AO VIVO pelo GPS dos
// ônibus (CittaMobi) e, sem ônibus rastreado, a tabela PROGRAMADA de hoje daquela parada.
// Nada inventado: sem dado, a tela diz que não tem.
//
// Memória: o FR55 dá 128 KB ao app. A resposta chega como listas curtas (textos já cortados no
// servidor), no máximo 4 favoritos × 3 horários; a contagem "chega em X min" é feita aqui a cada
// minuto a partir dos horários recebidos (sem nova requisição). Nenhum bitmap além do ícone.
//
using Toybox.Application;
using Toybox.WatchUi;
using Toybox.Position;
using Toybox.Communications;
using Toybox.System;
using Toybox.Time;
using Toybox.Attention;
using Toybox.Graphics;
using Toybox.Lang;
using Toybox.Background;

const API = "https://alequizao.com/agendamentos/relogio_onibus.php";
const SYNC = "https://alequizao.com/garmin/api.php";
const TOKEN = "";          // preenchido pelo painel ao gerar o app: sincroniza os favoritos de lá
const MAXF = 4;

// ---- estado global (poucas variáveis) ----
var gR = null;          // Rede (GPS + requisições)
var gF = [];            // favoritos: [[idLinha, "stopId", "cód", "destino", "ponto", origem 0=relógio 1=painel], ...]
var gD = null;          // dados alinhados a gF: [[cód, destino, ponto, fonte, [chegadas unix], info], ...]
var gT = 0;             // quando gD foi consultado (unix)
var gSel = 0;           // favorito na tela
var gModo = 0;          // 0 principal · 1 menu · 2 perto de mim
var gMenu = 0;          // item do menu
var gBusca = 0;         // 0 parado · 1 buscando GPS · 2 consultando
var gErr = null;        // [título, texto]
var gP = null;          // perto de mim: [[idLinha, "stopId", "cód", "destino", "ponto", metros], ...]
var gPSel = 0;
var gAl = false;        // alerta 2 min ligado
var gAlOk = 0;          // chegada (unix) que já avisou
var gFaixa = 0;         // até quando mostrar a faixa "chegando" (System.getTimer)
var gAviso = null;
var gAvisoAte = 0;
var gLat = null;
var gLon = null;
var gFix = 0;
var gIni = 0;
var gPrim = true;

// ---- paleta de transporte: amarelo-ônibus + azul sobre preto; no MIP (FR55) só cores puras ----
var cAm = 0xFFFF00;     // amarelo-ônibus (destaque, minutos)
var cAz = 0x00AAFF;     // azul (linha/ponto, trilhas)
var cTx = 0xFFFFFF;     // texto
var cCz = 0xAAAAAA;     // secundário
var cCard = 0x000055;   // fundo do item selecionado
var cOk = 0x00FF00;     // ao vivo
var cErr = 0xFF0000;
var cTri = 0x0000AA;    // trilha do anel/estrada

function cores() {
    var s = System.getDeviceSettings();
    if ((s has :requiresBurnInProtection) && s.requiresBurnInProtection) {   // AMOLED (FR165)
        cAm = 0xFFC400; cAz = 0x448AFF; cTx = 0xFFFFFF; cCz = 0x90A4AE; cCard = 0x0D1B3A;
        cOk = 0x00E676; cErr = 0xFF5252; cTri = 0x1A2A4F;
    }
}

(:background, :glance)
class OnibusApp extends Application.AppBase {
    hidden var mFrente = false;

    function initialize() { AppBase.initialize(); }

    function onStart(state) { }

    // também roda ao fim do processo de fundo: só mexe no agendamento se a tela foi aberta
    function onStop(state) {
        if (mFrente) { aoFechar(); }
    }

    function getInitialView() {
        mFrente = true;
        cores();
        try { Background.deleteTemporalEvent(); } catch (e) { }
        var f = Application.Storage.getValue("f");
        if (f instanceof Lang.Array) { gF = f; }
        var a = Application.Storage.getValue("al");
        gAl = (a == true);
        // última consulta aparece na hora, enquanto atualiza
        var u = Application.Storage.getValue("u");
        if (u instanceof Lang.Array && u.size() == 2 && u[1] instanceof Lang.Array && u[1].size() == gF.size()) { gT = u[0]; gD = u[1]; }
        u = null;
        gR = new Rede();
        return [new Tela(), new TelaDelegate()];
    }

    function getGlanceView() { return [new Glance()]; }

    function getServiceDelegate() { return [new Fundo()]; }
}

// processo de fundo: o evento agendado para "2 min antes" só pede para abrir o app (sem rede, ~1 KB)
(:background)
class Fundo extends System.ServiceDelegate {
    function initialize() { ServiceDelegate.initialize(); }

    function onTemporalEvent() {
        var m = Application.Storage.getValue("bg");
        Background.requestApplicationWake((m instanceof Lang.String) ? m : "Seu ônibus chega em 2 min");
        Background.exit(null);
    }
}

// ao fechar: se o alerta estiver ligado, agenda o aviso 2 min antes da próxima chegada do favorito na tela
function aoFechar() {
    if (gR != null) { gR.desligar(); }
    if (!gAl || gD == null || gSel >= gD.size()) { return; }
    var it = gD[gSel], ch = it[4], agora = Time.now().value();
    for (var i = 0; i < ch.size(); i++) {
        var q = ch[i] - 120;
        if (q > agora + 60) {
            Application.Storage.setValue("bg", "Linha " + it[0] + " chega em 2 min");
            try { Background.registerForTemporalEvent(new Time.Moment(q)); } catch (e) { }
            return;
        }
    }
}

// ---------------------------------------------------------------------------------
// GPS + consultas
// ---------------------------------------------------------------------------------
class Rede {
    hidden var mGps = false;
    hidden var mPedido = "";

    function initialize() { }

    function ligar() {
        if (mGps) { return; }
        try { Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:aoGps)); mGps = true; } catch (e) { mGps = false; }
    }

    function desligar() {
        if (!mGps) { return; }
        try { Position.enableLocationEvents(Position.LOCATION_DISABLE, method(:aoGps)); } catch (e) { }
        mGps = false;
    }

    function aoGps(info) {
        if (info == null || info.position == null || info.accuracy == null) { return; }
        if (info.accuracy < Position.QUALITY_POOR) { return; }
        var d = info.position.toDegrees();
        if (d[0] == 0 && d[1] == 0) { return; }
        gLat = d[0]; gLon = d[1]; gFix = System.getTimer();
        if (gBusca == 1) { desligar(); perto(); }
        WatchUi.requestUpdate();
    }

    hidden function semCelular() {
        var s = System.getDeviceSettings();
        if ((s has :phoneConnected) && !s.phoneConnected) {
            gBusca = 0;
            gErr = ["Sem celular", "Ligue o Bluetooth e\nabra o Garmin Connect"];
            WatchUi.requestUpdate();
            return true;
        }
        return false;
    }

    // ---- favoritos → próximos horários ----
    function atualizar() {
        gErr = null;
        var sync = gPrim && !TOKEN.equals("");
        if (!sync) { gPrim = false; }
        if (gF.size() == 0 && !sync) { gBusca = 0; WatchUi.requestUpdate(); return; }
        if (gBusca == 2 || semCelular()) { return; }
        gBusca = 2;
        if (sync) {       // app gerado pelo painel: traz os favoritos de lá primeiro
            Communications.makeWebRequest(SYNC, { "acao" => "onibus_favs", "t" => TOKEN },
                { :method => Communications.HTTP_REQUEST_METHOD_GET, :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON },
                method(:aoSync));
        } else {
            pedir();
        }
        WatchUi.requestUpdate();
    }

    function sincronizar() { gPrim = true; gBusca = 0; atualizar(); }

    function aoSync(code, data) {
        gPrim = false;
        if (code == 200 && data instanceof Lang.Dictionary && data["f"] instanceof Lang.Array) {
            // painel primeiro; os que você salvou no relógio continuam depois (até 4)
            // (os do painel que você removeu no relógio ficam ocultos: lista "x")
            var n = [], p = data["f"], ox = Application.Storage.getValue("x");
            data = null;
            if (!(ox instanceof Lang.Array)) { ox = []; }
            for (var i = 0; i < p.size() && n.size() < MAXF; i++) {
                var x = p[i];
                if (x instanceof Lang.Array && x.size() >= 5 && ox.indexOf(x[0] + "." + x[1]) < 0) { n.add([x[0], x[1], x[2], x[3], x[4], 1]); }
            }
            for (var i = 0; i < gF.size() && n.size() < MAXF; i++) { if (gF[i][5] != 1 && indice(n, gF[i][0], gF[i][1]) < 0) { n.add(gF[i]); } }
            if (!mesmos(n)) { gF = n; gD = null; gSel = 0; Application.Storage.setValue("f", gF); }
        }
        data = null;
        if (gF.size() == 0) { gBusca = 0; WatchUi.requestUpdate(); return; }
        pedir();
    }

    // mesma lista (em qualquer ordem): mantém a ordem do relógio ("Tornar principal" não é desfeito)
    hidden function mesmos(n) {
        if (n.size() != gF.size()) { return false; }
        for (var i = 0; i < n.size(); i++) { if (indice(gF, n[i][0], n[i][1]) < 0) { return false; } }
        return true;
    }

    hidden function pedir() {
        var s = "";
        for (var i = 0; i < gF.size(); i++) { s += (i > 0 ? "," : "") + gF[i][0] + "." + gF[i][1]; }
        mPedido = s;
        gBusca = 2;
        Communications.makeWebRequest(API, { "a" => "prox", "f" => s },
            { :method => Communications.HTTP_REQUEST_METHOD_GET, :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON },
            method(:aoProx));
    }

    function aoProx(code, data) {
        gBusca = 0;
        var s = "";
        for (var i = 0; i < gF.size(); i++) { s += (i > 0 ? "," : "") + gF[i][0] + "." + gF[i][1]; }
        if (!s.equals(mPedido)) { data = null; if (gF.size() > 0) { pedir(); } return; }   // favoritos mudaram no meio
        if (code == 200 && data instanceof Lang.Dictionary && data["f"] instanceof Lang.Array && data["f"].size() == gF.size()) {
            var f = data["f"], agora = Time.now().value();
            data = null;                          // libera o resto da resposta
            for (var i = 0; i < f.size(); i++) {  // segundos → horário de chegada (a contagem fica local)
                var sg = f[i][4];
                for (var k = 0; k < sg.size(); k++) { sg[k] = agora + sg[k].toNumber(); }
                if (f[i][3] >= 0) { gF[i][2] = f[i][0]; gF[i][3] = f[i][1]; gF[i][4] = f[i][2]; }
            }
            gD = f; gT = agora; gErr = null;
            Application.Storage.setValue("u", [gT, gD]);
            Application.Storage.setValue("f", gF);
            salvarGlance();
            vibrar(false);
        } else {
            data = null;
            gErr = erroRede(code);
        }
        WatchUi.requestUpdate();
    }

    // ---- pontos perto de mim ----
    function buscarPerto() {
        gErr = null; gP = null; gPSel = 0;
        if (gBusca == 2) { return; }
        ligar();
        try { aoGpsSemBusca(Position.getInfo()); } catch (e) { }
        if (gLat != null && System.getTimer() - gFix < 120000) { desligar(); perto(); return; }
        gBusca = 1; gIni = System.getTimer();
        WatchUi.requestUpdate();
    }

    hidden function aoGpsSemBusca(info) {
        if (info == null || info.position == null || info.accuracy == null || info.accuracy < Position.QUALITY_POOR) { return; }
        var d = info.position.toDegrees();
        if (d[0] != 0 || d[1] != 0) { gLat = d[0]; gLon = d[1]; gFix = System.getTimer(); }
    }

    // chamado pela tela a cada segundo: 45 s sem GPS usa a última posição conhecida ou desiste
    function tique() {
        if (gBusca != 1 || System.getTimer() - gIni < 45000) { return; }
        var info = Position.getInfo();
        if (info != null && info.position != null && info.accuracy != null && info.accuracy >= Position.QUALITY_LAST_KNOWN) {
            var d = info.position.toDegrees();
            if (d[0] != 0 || d[1] != 0) { gLat = d[0]; gLon = d[1]; desligar(); perto(); return; }
        }
        desligar();
        gBusca = 0;
        gErr = ["Sem GPS", "Vá para um lugar\naberto e tente de novo"];
        WatchUi.requestUpdate();
    }

    function perto() {
        if (semCelular()) { return; }
        gBusca = 2;
        Communications.makeWebRequest(API, { "a" => "perto", "lat" => gLat.format("%.5f"), "lon" => gLon.format("%.5f") },
            { :method => Communications.HTTP_REQUEST_METHOD_GET, :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON },
            method(:aoPerto));
        WatchUi.requestUpdate();
    }

    function aoPerto(code, data) {
        gBusca = 0;
        if (code == 200 && data instanceof Lang.Dictionary && data["p"] instanceof Lang.Array) {
            var p = data["p"], l = [];
            data = null;
            // achata: cada linha de cada ponto vira um item da lista (máx. 16)
            for (var i = 0; i < p.size(); i++) {
                var ls = p[i][2];
                for (var k = 0; k < ls.size() && l.size() < 16; k++) { l.add([ls[k][0], ls[k][1], ls[k][2], ls[k][3], p[i][0], p[i][1]]); }
            }
            p = null;
            gP = l; gPSel = 0; gErr = null;
            if (l.size() == 0) { gErr = ["Nada perto", "Nenhum ponto a 1,5 km\ncom local conhecido"]; }
            else { vibrar(false); }
        } else {
            data = null;
            gErr = erroRede(code);
        }
        WatchUi.requestUpdate();
    }
}

function indice(lista, id, stop) {
    for (var i = 0; i < lista.size(); i++) { if (lista[i][0] == id && lista[i][1].equals(stop)) { return i; } }
    return -1;
}

// glance: próxima chegada do favorito principal (o 1º)
function salvarGlance() {
    if (gD == null || gD.size() == 0) { Application.Storage.deleteValue("g"); return; }
    var it = gD[0];
    Application.Storage.setValue("g", [it[0], it[1], it[4], it[3], gT]);
}

function erroRede(code) {
    if (code == -104 || code == -2 || code == -3) { return ["Sem celular", "Abra o Garmin Connect\nno celular"]; }
    if (code == -300 || code == -1 || code == -400) { return ["Sem internet", "O celular não\nrespondeu a tempo"]; }
    if (code == -403 || code == -402) { return ["Pouca memória", "Resposta grande\ndemais"]; }
    if (code == 400) { return ["Sem linha/ponto", "Favorito inválido:\nremova no MENU"]; }
    if (code >= 500) { return ["Fonte fora", "Horários indisponíveis\nagora (" + code + ")"]; }
    return ["Falhou (" + code + ")", "Tente de novo"];
}

function vibrar(forte) {
    if (!(Attention has :vibrate)) { return; }
    var s = System.getDeviceSettings();
    if ((s has :vibrateOn) && !s.vibrateOn) { return; }
    if (forte) {
        Attention.vibrate([new Attention.VibeProfile(100, 500), new Attention.VibeProfile(0, 250),
                           new Attention.VibeProfile(100, 500), new Attention.VibeProfile(0, 250), new Attention.VibeProfile(100, 700)]);
    } else {
        Attention.vibrate([new Attention.VibeProfile(40, 60)]);
    }
}

function aviso(t) {
    gAviso = t; gAvisoAte = System.getTimer() + 1600;
    WatchUi.requestUpdate();
}

// ---------------------------------------------------------------------------------
// Formatação (também usada pela glance)
// ---------------------------------------------------------------------------------
(:glance)
function fmtHa(t) {
    var d = Time.now().value() - t.toNumber();
    if (d < 60) { return "agora"; }
    if (d < 3600) { return "há " + (d / 60) + " min"; }
    if (d < 86400) { return "há " + (d / 3600) + " h"; }
    return "há " + (d / 86400) + " d";
}

// minutos inteiros até a chegada (arredonda para baixo, como os painéis de ponto)
(:glance)
function minutos(e) { var d = e.toNumber() - Time.now().value(); return (d <= 0) ? 0 : d / 60; }

// "14:05" da chegada
(:glance)
function hora(e) {
    var i = Time.Gregorian.info(new Time.Moment(e.toNumber()), Time.FORMAT_SHORT);
    return i.hour.format("%02d") + ":" + i.min.format("%02d");
}

// próximas chegadas ainda no futuro (descarta as que já passaram há mais de 1 min)
function futuras(ch) {
    var r = [], agora = Time.now().value();
    for (var i = 0; i < ch.size(); i++) { if (ch[i] > agora - 60) { r.add(ch[i]); } }
    return r;
}

// ---------------------------------------------------------------------------------
// Desenho comum (identidade visual)
// ---------------------------------------------------------------------------------
// ônibus de frente, vetorial: s = altura
function onibus(dc, x, y, s, cor, vidro) {
    var w = s * 8 / 10, r = s / 6 + 1;
    dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
    dc.fillRoundedRectangle(x, y, w, s * 9 / 10, r);
    dc.fillRectangle(x - s / 12, y + s / 5, s / 12 + 1, s / 6);            // retrovisores
    dc.fillRectangle(x + w, y + s / 5, s / 12 + 1, s / 6);
    dc.setColor(vidro, Graphics.COLOR_TRANSPARENT);
    dc.fillRoundedRectangle(x + s / 10, y + s / 5, w - s / 5, s * 3 / 10, r / 2 + 1);   // para-brisa
    dc.fillRectangle(x + s / 6, y + s / 14, w - s / 3, s / 12 + 1);                   // letreiro
    dc.fillCircle(x + s / 5, y + s * 65 / 100, s / 14 + 1);                        // faróis
    dc.fillCircle(x + w - s / 5, y + s * 65 / 100, s / 14 + 1);
    dc.fillRectangle(x + s / 10, y + s * 9 / 10 - 1, s / 6, s / 10 + 1);          // rodas
    dc.fillRectangle(x + w - s / 10 - s / 6, y + s * 9 / 10 - 1, s / 6, s / 10 + 1);
}

// cabeçalho igual em todas as telas: arco amarelo no topo + ônibus + título
function cabecalho(dc, W, H, titulo, ocupado) {
    var g = W > 260;
    dc.setPenWidth(g ? 6 : 4);
    dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
    dc.drawArc(W / 2, H / 2, W / 2 - (g ? 4 : 2), Graphics.ARC_COUNTER_CLOCKWISE, 58, 122);
    if (ocupado) {   // um trecho azul corre pelo arco enquanto consulta
        var a = 58 + (System.getTimer() / 25) % 52;
        dc.setColor(cAz, Graphics.COLOR_TRANSPARENT);
        dc.drawArc(W / 2, H / 2, W / 2 - (g ? 4 : 2), Graphics.ARC_COUNTER_CLOCKWISE, a, a + 12);
    }
    dc.setPenWidth(1);
    var f = g ? Graphics.FONT_TINY : Graphics.FONT_XTINY;
    var s = g ? 24 : 13;
    var tw = dc.getTextWidthInPixels(titulo, f);
    var x = (W - tw - s - 6) / 2;
    var y = g ? H * 13 / 100 : H * 12 / 100;
    onibus(dc, x + s / 10, y - s / 2, s, cAm, Graphics.COLOR_BLACK);
    dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
    dc.drawText(x + s + 6, y, f, titulo, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
}

// aviso rápido em pílula amarela com ✓ (salvou favorito, ligou alerta...)
function desenharAviso(dc, W, H) {
    if (gAviso == null) { return; }
    if (System.getTimer() > gAvisoAte) { gAviso = null; return; }
    var f = (W > 260) ? Graphics.FONT_SMALL : Graphics.FONT_TINY;
    var h = dc.getFontHeight(f) + 8, w = dc.getTextWidthInPixels(gAviso, f) + h + 16;
    var x = (W - w) / 2, y = H * 80 / 100 - h / 2;
    dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
    dc.fillRectangle(0, y - 4, W, h + 8);
    dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
    dc.fillRoundedRectangle(x, y, w, h, h / 2);
    dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
    dc.setPenWidth(h > 30 ? 4 : 2);
    var cx = x + h / 2 + 4, cy = y + h / 2;
    dc.drawLine(cx - h / 5, cy, cx - h / 14, cy + h / 6);
    dc.drawLine(cx - h / 14, cy + h / 6, cx + h / 4, cy - h / 5);
    dc.setPenWidth(1);
    dc.drawText(x + h + 8, cy, f, gAviso, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
}
