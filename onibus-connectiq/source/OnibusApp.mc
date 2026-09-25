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
using Toybox.Math;
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

// ---- paleta premium (tokens): preto profundo, UMA cor de destaque (amarelo-ônibus) + azul frio;
//      cinzas em níveis (texto 2 / texto 3 / superfície / trilha). No MIP (FR55) só cores puras e alto contraste.
var cAm = 0xFFFF00;     // destaque: anel, minutos, item escolhido
var cAmE = 0x555500;    // destaque apagado: anel fora da janela de 15 min
var cAz = 0x55AAFF;     // azul frio: informação secundária, carregando, programado
var cTx = 0xFFFFFF;     // texto principal
var cC2 = 0xAAAAAA;     // texto secundário
var cC3 = 0xAAAAAA;     // texto terciário (no MIP = secundário, para não sumir)
var cC4 = 0x000055;     // superfície: cartões, chips, item do menu
var cTri = 0x555555;    // trilha do anel e linhas finas
var cOk = 0x55FF55;     // ao vivo
var cErr = 0xFF5555;
var cLin = [0xFFFF00, 0x55FFAA, 0x55AAFF, 0xFFAA55];   // selo da linha por grupo (centena do número % 4)
var gRit = 0;           // ritmo de redesenho pedido pela tela: 0 minuto · 1 segundo · 2 250 ms · 3 50 ms (animação)
var gSl = -9999;        // início do deslize entre favoritos (System.getTimer) e o lado (+1/-1)
var gSd = 1;

function cores() {
    var s = System.getDeviceSettings();
    if ((s has :requiresBurnInProtection) && s.requiresBurnInProtection) {   // AMOLED (FR165)
        cAm = 0xF2C14E; cAmE = 0x4A3B17; cAz = 0x8DB3E2; cC2 = 0xA3A9B2; cC3 = 0x5F666F; cC4 = 0x1B1E23;
        cTri = 0x2A2E35; cOk = 0x5BD68A; cErr = 0xFF6B5E; cLin = [0xF2C14E, 0x6CCFA8, 0x9AA8F5, 0xF09A7A];
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

    (:gl) function getGlanceView() { return [new Glance()]; }

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
// Desenho comum (identidade premium: preto, um amarelo, anéis e linhas finas — tudo vetorial)
// ---------------------------------------------------------------------------------
const TR = -1;          // Graphics.COLOR_TRANSPARENT

function rit(v) { if (v > gRit) { gRit = v; } }

// cor do selo: grupo = algarismo das centenas do número da linha % 4 ("0601" → 6 → 2); sem número → 0
function corLinha(cod) {
    var n = cod.length(), d = 0;
    if (n >= 3) { d = cod.toCharArray()[n - 3].toNumber() - 48; }
    return cLin[(d >= 0 && d <= 9) ? d % 4 : 0];
}

// corta com "." até caber em max px (a tela é redonda)
function cabe(dc, s, f, max) {
    while (dc.getTextWidthInPixels(s, f) > max && s.length() > 4) {
        s = s.substring(0, s.length() - 2);
        while (s.length() > 1 && " .-".find(s.substring(s.length() - 1, s.length())) != null) { s = s.substring(0, s.length() - 1); }
        s = s + ".";
    }
    return s;
}

// ônibus de frente, vetorial: s = altura
function onibus(dc, x, y, s, cor, vidro) {
    var w = s * 8 / 10, r = s / 6 + 1;
    dc.setColor(cor, TR);
    dc.fillRoundedRectangle(x, y, w, s * 9 / 10, r);
    dc.fillRectangle(x - s / 12, y + s / 5, s / 12 + 1, s / 6);            // retrovisores
    dc.fillRectangle(x + w, y + s / 5, s / 12 + 1, s / 6);
    dc.setColor(vidro, TR);
    dc.fillRoundedRectangle(x + s / 10, y + s / 5, w - s / 5, s * 3 / 10, r / 2 + 1);   // para-brisa
    dc.fillRectangle(x + s / 6, y + s / 14, w - s / 3, s / 12 + 1);                   // letreiro
    dc.fillCircle(x + s / 5, y + s * 65 / 100, s / 14 + 1);                        // faróis
    dc.fillCircle(x + w - s / 5, y + s * 65 / 100, s / 14 + 1);
    dc.fillRectangle(x + s / 10, y + s * 9 / 10 - 1, s / 6, s / 10 + 1);          // rodas
    dc.fillRectangle(x + w - s / 10 - s / 6, y + s * 9 / 10 - 1, s / 6, s / 10 + 1);
}

// título discreto no topo: ícone + texto cinza (telas de apoio; a principal não tem título)
function titulo(dc, W, H, t, ic) {
    var g = W > 260, f = Graphics.FONT_XTINY, s = g ? 11 : 6, y = H * 13 / 100, e = g ? 8 : 4;
    var x = (W - dc.getTextWidthInPixels(t, f) - 2 * s - e) / 2;
    if (ic < 0) { onibus(dc, x + s / 5, y - s, 2 * s, cAm, 0); } else { icone(dc, ic, x + s, y, s, cAz); }
    tx(dc, x + 2 * s + e, y, f, t, 6, cC2);
}

// anel do bezel: trilha + arco a partir do topo (f = 0..1000 do anel cheio) com pontas redondas
function anel(dc, W, f, cor, pen) {
    var c = W / 2, r = c - pen / 2 - 1;
    dc.setPenWidth(pen);
    dc.setColor(cTri, TR);
    dc.drawCircle(c, c, r);
    if (f > 0) {
        dc.setColor(cor, TR);
        if (f >= 1000) { dc.drawCircle(c, c, r); }
        else {
            var a = 90 - f * 360 / 1000;
            dc.drawArc(c, c, r, Graphics.ARC_COUNTER_CLOCKWISE, a, 90);
            var ra = Math.toRadians(a);
            dc.fillCircle(c, c - r, pen / 2);
            dc.fillCircle(c + (r * Math.cos(ra)).toNumber(), c - (r * Math.sin(ra)).toNumber(), pen / 2);
        }
    }
    dc.setPenWidth(1);
}

// carregando: um trecho azul gira no anel
function giro(dc, W, pen) {
    var c = W / 2, a = 90 - (System.getTimer() / 3) % 360;
    rit(3);
    dc.setPenWidth(pen);
    dc.setColor(cAz, TR);
    dc.drawArc(c, c, c - pen / 2 - 1, Graphics.ARC_COUNTER_CLOCKWISE, a - 60, a);
    dc.setPenWidth(1);
}

// ícones vetoriais (s = meio lado): 0 atualizar · 1 local · 2 sino · 3 estrela · 4 lixeira · 5 sincronizar
function icone(dc, c, x, y, s, cor) {
    var p = s > 8 ? 3 : 2, t = s * 4 / 10 + 1, r = s * 7 / 10;
    dc.setColor(cor, TR);
    dc.setPenWidth(p);
    if (c == 0) {
        dc.drawArc(x, y, r, Graphics.ARC_COUNTER_CLOCKWISE, 90, 0);
        dc.fillPolygon([[x, y - r - t], [x + t + t / 2, y - r], [x, y - r + t]]);
    } else if (c == 1) {
        dc.fillCircle(x, y - s / 4, s * 6 / 10);
        dc.fillPolygon([[x - s / 2, y - s / 8], [x + s / 2, y - s / 8], [x, y + s]]);
        dc.setColor(0, TR);
        dc.fillCircle(x, y - s / 4, s / 4);
    } else if (c == 2) {
        dc.fillCircle(x, y - s / 5, s * 6 / 10);
        dc.fillRectangle(x - s * 6 / 10, y - s / 5, s * 12 / 10 + 1, s * 6 / 10);
        dc.fillRectangle(x - s * 9 / 10, y + s * 4 / 10, s * 18 / 10 + 1, p);
        dc.fillCircle(x, y + s * 8 / 10, p);
    } else if (c == 3) {
        var v = [0, -10, 2, -3, 10, -3, 4, 1, 6, 8, 0, 4, -6, 8, -4, 1, -10, -3, -2, -3], q = [];
        for (var i = 0; i < 20; i += 2) { q.add([x + v[i] * s / 10, y + v[i + 1] * s / 10]); }
        dc.fillPolygon(q);
    } else if (c == 4) {
        dc.fillRectangle(x - s * 8 / 10, y - s * 6 / 10, s * 16 / 10 + 1, p);
        dc.fillRectangle(x - s / 4, y - s * 6 / 10 - p, s / 2 + 1, p);
        dc.fillRectangle(x - s * 6 / 10, y - s * 3 / 10, s * 12 / 10 + 1, s * 12 / 10);
        dc.setColor(0, TR);
        dc.fillRectangle(x - s / 4, y - s / 10, p - 1, s * 7 / 10);
        dc.fillRectangle(x + s / 4 - 1, y - s / 10, p - 1, s * 7 / 10);
    } else {
        dc.drawArc(x, y, r, Graphics.ARC_COUNTER_CLOCKWISE, 20, 160);
        dc.drawArc(x, y, r, Graphics.ARC_COUNTER_CLOCKWISE, 200, 340);
        var xl = x - r * 94 / 100, yl = y - r * 34 / 100, xr = x + r * 94 / 100, yr = y + r * 34 / 100;
        dc.fillPolygon([[xl - t, yl], [xl + t, yl], [xl, yl + t + t / 2]]);
        dc.fillPolygon([[xr - t, yr], [xr + t, yr], [xr, yr - t - t / 2]]);
    }
    dc.setPenWidth(1);
}

// chave liga/desliga (x = borda direita)
function chave(dc, x, y, s, on) {
    var w = s * 4, r = s + 1;
    if (on) {
        dc.setColor(cAm, TR);
        dc.fillRoundedRectangle(x - w, y - r, w, 2 * r, r);
        dc.setColor(0, TR);
        dc.fillCircle(x - r, y, r - 3);
    } else {
        dc.setColor(cC3, TR);
        dc.setPenWidth(2);
        dc.drawRoundedRectangle(x - w, y - r, w, 2 * r, r);
        dc.setPenWidth(1);
        dc.fillCircle(x - w + r, y, r - 4);
    }
}

// botão em pílula: cheio (texto preto) ou vazado (borda e texto na cor)
function pilula(dc, cx, y, t, f, cor, cheio) {
    var h = dc.getFontHeight(f) + 4, w = dc.getTextWidthInPixels(t, f) + h;
    dc.setColor(cor, TR);
    if (cheio) { dc.fillRoundedRectangle(cx - w / 2, y - h / 2, w, h, h / 2); dc.setColor(0, TR); }
    else { dc.setPenWidth(2); dc.drawRoundedRectangle(cx - w / 2, y - h / 2, w, h, h / 2); dc.setPenWidth(1); }
    dc.drawText(cx, y, f, t, 5);
}

// confirmação rápida (salvou, ligou alerta...): pílula com ✓ que cresce, fica e encolhe
function desenharAviso(dc, W, H) {
    if (gAviso == null) { return; }
    var t = System.getTimer(), r = gAvisoAte - t, e = 1600 - r, k = 100;
    if (r <= 0) { gAviso = null; return; }
    rit(3);
    if (e < 160) { k = 60 + e / 4; } else if (r < 160) { k = 60 + r / 4; }
    var g = W > 260, f = g ? Graphics.FONT_TINY : Graphics.FONT_XTINY, b = g ? 8 : 4;
    var h = dc.getFontHeight(f) + (g ? 14 : 8), w = dc.getTextWidthInPixels(gAviso, f) + h + (g ? 14 : 6);
    var hk = h * k / 100, wk = w * k / 100, x = (W - wk) / 2, y = H / 2 - hk / 2;
    dc.setColor(0, TR);                                   // faixa preta dentro do anel: esconde o número atrás
    dc.fillRectangle(b + 8, H * 39 / 100, W - 2 * b - 16, H * 28 / 100);
    dc.setColor(cC4, TR);
    dc.fillRoundedRectangle(x, y, wk, hk, hk / 2);
    dc.setColor(cAm, TR);
    dc.setPenWidth(2);
    dc.drawRoundedRectangle(x, y, wk, hk, hk / 2);
    if (k >= 100) {
        var cx = x + h / 2 + (g ? 4 : 2), cy = y + h / 2;
        dc.setPenWidth(g ? 4 : 2);
        dc.drawLine(cx - h / 5, cy, cx - h / 14, cy + h / 6);
        dc.drawLine(cx - h / 14, cy + h / 6, cx + h / 4, cy - h / 5);
        tx(dc, x + h + (g ? 4 : 2), cy, f, gAviso, 6, cTx);
    }
    dc.setPenWidth(1);
}

// texto numa cor (junta setColor + drawText: economiza código)
function tx(dc, x, y, f, s, j, c) { dc.setColor(c, TR); dc.drawText(x, y, f, s, j); }
