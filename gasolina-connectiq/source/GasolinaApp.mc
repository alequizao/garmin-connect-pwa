//
// Gasolina Perto · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
// https://github.com/alequizao · © 2026 Alequizao. Todos os direitos reservados.
//
// Os postos de combustível mais baratos perto de você (Maceió/AL), com seta até o posto.
// Preços: https://alequizao.com/gasolina/api/perto (dados públicos da SEFAZ-AL).
//
// Memória: o FR55 dá 128 KB ao app. Por isso a resposta do servidor já chega enxuta
// (cada posto é uma lista curta, não um dicionário), só a lista "p" é guardada e o resto
// da resposta é descartado; nenhum bitmap além do ícone; tudo desenhado com dc.
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
using Toybox.Sensor;

const API = "https://alequizao.com/gasolina/api/perto";
const COMB = ["Gasolina comum", "Gas. aditivada", "Álcool", "Diesel comum", "Diesel aditiv.", "GNV"];

// ---- estado global (poucas variáveis, nada de dicionário grande) ----
var gM = null;          // Motor (GPS + rede)
var gC = 1;             // combustível: código SEFAZ 1..6
var gP = null;          // postos: [[nome, preço, km, lat, lon, data_unix, bairro], ...]
var gT = 0;             // quando a lista foi consultada (unix)
var gR = 5;             // raio usado pelo servidor (km)
var gSel = 0;           // posto selecionado
var gMenu = -1;         // menu de combustível aberto (índice) ou -1
var gBusca = 0;         // 0 parado · 1 buscando GPS · 2 consultando preços
var gErr = null;        // [título, texto] do último erro
var gLat = null;        // posição atual (graus)
var gLon = null;
var gHead = null;       // rumo do GPS (graus), só andando
var gFix = 0;           // System.getTimer() do último fix bom
var gIni = 0;           // início da busca de GPS
var gAviso = null;      // aviso rápido ("Álcool ✓")
var gAvisoAte = 0;
var gPrimeira = true;

// ---- paleta: verde-combustível + âmbar sobre preto; no MIP (FR55) só cores puras ----
var cAc = 0x00FF00;     // destaque (verde)
var cAm = 0xFFFF00;     // preço (âmbar/amarelo)
var cTx = 0xFFFFFF;     // texto
var cCz = 0x00FFFF;     // secundário
var cCard = 0x000000;   // fundo do cartão selecionado
var cErr = 0xFF0000;    // erro

function cores() {
    var s = System.getDeviceSettings();
    if ((s has :requiresBurnInProtection) && s.requiresBurnInProtection) {   // AMOLED (FR165)
        cAc = 0x00E676; cAm = 0xFFB300; cTx = 0xFFFFFF; cCz = 0x9E9E9E; cCard = 0x0E2A1A; cErr = 0xFF5252;
    }
}

(:glance)
class GasolinaApp extends Application.AppBase {
    var motor = null;

    function initialize() { AppBase.initialize(); }

    function onStart(state) { }

    function onStop(state) {
        if (motor != null) { motor.desligar(); }
    }

    function getInitialView() {
        cores();
        var c = Application.Storage.getValue("c");
        if (c instanceof Lang.Number && c >= 1 && c <= 6) { gC = c; }
        // última lista do mesmo combustível: aparece na hora, enquanto atualiza
        var u = Application.Storage.getValue("u");
        if (u instanceof Lang.Array && u.size() == 3 && u[0] == gC) { gT = u[1]; gP = u[2]; }
        motor = new Motor();
        gM = motor;
        var v = new Tela();
        return [v, new TelaDelegate()];
    }

    function getGlanceView() { return [new Glance()]; }
}

// ---------------------------------------------------------------------------------
// GPS + consulta ao servidor
// ---------------------------------------------------------------------------------
class Motor {
    hidden var mLigado = false;
    hidden var mPedido = 0;     // combustível do pedido em andamento

    function initialize() { }

    function ligar() {
        if (mLigado) { return; }
        try {
            Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:aoGps));
            mLigado = true;
        } catch (e) { mLigado = false; }
    }

    function desligar() {
        if (!mLigado) { return; }
        try { Position.enableLocationEvents(Position.LOCATION_DISABLE, method(:aoGps)); } catch (e) { }
        mLigado = false;
    }

    function aoGps(info) {
        if (info == null || info.position == null || info.accuracy == null) { return; }
        if (info.accuracy < Position.QUALITY_POOR) { return; }
        var d = info.position.toDegrees();
        if (d[0] == 0 && d[1] == 0) { return; }
        gLat = d[0]; gLon = d[1]; gFix = System.getTimer();
        gHead = null;
        if (info.heading != null && info.speed != null && info.speed > 1.0) {
            gHead = Math.toDegrees(info.heading);
        }
        if (gBusca == 1) { consultar(); }
        WatchUi.requestUpdate();
    }

    // começa uma busca: com posição recente (2 min) vai direto à rede, senão espera o GPS
    function buscar() {
        ligar();
        gErr = null;
        if (gBusca == 2) { return; }
        try { aoGps(Position.getInfo()); } catch (e) { }   // GPS já ligado (ex.: atividade): usa na hora
        if (gLat != null && System.getTimer() - gFix < 120000) { consultar(); return; }
        gBusca = 1; gIni = System.getTimer();
        WatchUi.requestUpdate();
    }

    // chamado pelas telas a cada ~200 ms
    function tique() {
        if (gBusca != 1 || System.getTimer() - gIni < 45000) { return; }
        // 45 s sem fix: usa a última posição conhecida, se houver
        var info = Position.getInfo();
        if (info != null && info.position != null && info.accuracy != null && info.accuracy >= Position.QUALITY_LAST_KNOWN) {
            var d = info.position.toDegrees();
            if (d[0] != 0 || d[1] != 0) { gLat = d[0]; gLon = d[1]; consultar(); return; }
        }
        gBusca = 0;
        gErr = ["Sem GPS", "Vá para um lugar\naberto e tente de novo"];
        WatchUi.requestUpdate();
    }

    function consultar() {
        var s = System.getDeviceSettings();
        if ((s has :phoneConnected) && !s.phoneConnected) {
            gBusca = 0;
            gErr = ["Sem celular", "Ligue o Bluetooth e\nabra o Garmin Connect"];
            WatchUi.requestUpdate();
            return;
        }
        gBusca = 2; mPedido = gC;
        Communications.makeWebRequest(API,
            { "lat" => gLat.format("%.5f"), "lon" => gLon.format("%.5f"), "c" => gC, "n" => 5 },
            { :method => Communications.HTTP_REQUEST_METHOD_GET,
              :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON },
            method(:aoResp));
        WatchUi.requestUpdate();
    }

    function aoResp(code, data) {
        gBusca = 0;
        if (mPedido != gC) { data = null; consultar(); return; }   // trocou de combustível no meio
        if (code == 200 && data instanceof Lang.Dictionary) {
            var p = data["p"];
            if (p instanceof Lang.Array) {
                var r = data["r"];
                gR = (r != null) ? r.toNumber() : 5;
                data = null;                 // libera o resto da resposta
                gP = p; gT = Time.now().value(); gSel = 0; gErr = null;
                if (p.size() == 0) {
                    gErr = ["Sem postos", "Nenhum preço num raio\nde " + gR + " km"];
                } else {
                    Application.Storage.setValue("u", [gC, gT, p]);
                    var a = p[0];
                    Application.Storage.setValue("g", [COMB[gC - 1], a[0], a[1], a[2], gT]);
                    vibrar();
                }
                WatchUi.requestUpdate();
                return;
            }
        }
        data = null;
        gErr = erroRede(code);
        WatchUi.requestUpdate();
    }
}

function erroRede(code) {
    if (code == -104 || code == -2 || code == -3) { return ["Sem celular", "Abra o Garmin Connect\nno celular"]; }
    if (code == -300 || code == -1) { return ["Sem internet", "O celular não\nrespondeu a tempo"]; }
    if (code == -403 || code == -402) { return ["Pouca memória", "Resposta grande\ndemais"]; }
    if (code == 400) { return ["Posição inválida", "Espere o GPS e\ntente de novo"]; }
    if (code >= 500) { return ["Servidor fora", "Tente daqui a\npouco (" + code + ")"]; }
    return ["Falhou (" + code + ")", "Tente de novo"];
}

function vibrar() {
    if (!(Attention has :vibrate)) { return; }
    var s = System.getDeviceSettings();
    if ((s has :vibrateOn) && !s.vibrateOn) { return; }
    Attention.vibrate([new Attention.VibeProfile(40, 60)]);
}

function aviso(t) {
    gAviso = t; gAvisoAte = System.getTimer() + 1600;
    WatchUi.requestUpdate();
}

// ---------------------------------------------------------------------------------
// Formatação (também usada pela glance)
// ---------------------------------------------------------------------------------
(:glance)
function virgula(s) {
    var i = s.find(".");
    return (i == null) ? s : s.substring(0, i) + "," + s.substring(i + 1, s.length());
}

(:glance)
function fmtPreco(v) { return virgula(v.toFloat().format("%.3f")); }

(:glance)
function fmtKm(k) {
    k = k.toFloat();
    if (k < 1.0) { return ((k * 100).toNumber() * 10) + " m"; }
    return virgula(k.format(k < 10 ? "%.1f" : "%.0f")) + " km";
}

(:glance)
function fmtHa(t) {
    var d = Time.now().value() - t.toNumber();
    if (d < 60) { return "agora"; }
    if (d < 3600) { return "há " + (d / 60) + " min"; }
    if (d < 86400) { return "há " + (d / 3600) + " h"; }
    return "há " + (d / 86400) + " d";
}

// ---------------------------------------------------------------------------------
// Navegação: rumo e distância
// ---------------------------------------------------------------------------------
function rumo(la1, lo1, la2, lo2) {
    var f1 = Math.toRadians(la1), f2 = Math.toRadians(la2), dl = Math.toRadians(lo2 - lo1);
    var y = Math.sin(dl) * Math.cos(f2);
    var x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
    var b = Math.toDegrees(Math.atan2(y, x));
    return (b < 0) ? b + 360 : b;
}

function distKm(la1, lo1, la2, lo2) {
    var dLa = Math.toRadians(la2 - la1), dLo = Math.toRadians(lo2 - lo1);
    var a = Math.sin(dLa / 2) * Math.sin(dLa / 2)
          + Math.cos(Math.toRadians(la1)) * Math.cos(Math.toRadians(la2)) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 6371.0 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cardeal(b) {
    return ["N", "NE", "L", "SE", "S", "SO", "O", "NO"][((b + 22.5) / 45).toNumber() % 8];
}

// rumo para onde o relógio aponta: bússola (se houver) ou GPS andando; senão null
function rumoAtual() {
    try {
        var si = Sensor.getInfo();
        if (si != null && (si has :heading) && si.heading != null) { return Math.toDegrees(si.heading); }
    } catch (e) { }
    return gHead;
}

// ---------------------------------------------------------------------------------
// Desenho comum (identidade visual)
// ---------------------------------------------------------------------------------
// bomba de combustível vetorial: s = altura
function bomba(dc, x, y, s, cor, corVisor) {
    var w = s * 6 / 10, t = s / 8 + 1;
    dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
    dc.fillRoundedRectangle(x, y, w, s, t);
    dc.fillRectangle(x + w, y + s * 6 / 10, s / 4, t);                 // braço da mangueira
    dc.fillRectangle(x + w + s / 4 - t, y + s / 4, t, s * 4 / 10);     // mangueira subindo
    dc.fillRectangle(x + w + s / 10, y + s / 10, s / 4, s / 5);        // bico
    dc.setColor(corVisor, Graphics.COLOR_TRANSPARENT);
    dc.fillRectangle(x + s / 10, y + s / 7, w - s / 5, s / 4);         // visor
}

// cabeçalho igual em todas as telas: arco verde no topo + bomba + título
function cabecalho(dc, W, H, titulo, ocupado) {
    var g = W > 260;
    dc.setPenWidth(g ? 6 : 4);
    dc.setColor(cAc, Graphics.COLOR_TRANSPARENT);
    dc.drawArc(W / 2, H / 2, W / 2 - (g ? 4 : 2), Graphics.ARC_COUNTER_CLOCKWISE, 58, 122);
    if (ocupado) {   // um trecho âmbar corre pelo arco enquanto busca
        var a = 58 + (System.getTimer() / 25) % 52;
        dc.setColor(cAm, Graphics.COLOR_TRANSPARENT);
        dc.drawArc(W / 2, H / 2, W / 2 - (g ? 4 : 2), Graphics.ARC_COUNTER_CLOCKWISE, a, a + 12);
    }
    dc.setPenWidth(1);
    var f = g ? Graphics.FONT_TINY : Graphics.FONT_XTINY;
    var s = g ? 26 : 13;
    var tw = dc.getTextWidthInPixels(titulo, f);
    var x = (W - tw - s - 6) / 2;
    var y = g ? H * 15 / 100 : H * 12 / 100;
    bomba(dc, x, y - s / 2, s, cAc, Graphics.COLOR_BLACK);
    dc.setColor(cAc, Graphics.COLOR_TRANSPARENT);
    dc.drawText(x + s + 6, y, f, titulo, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
}

// aviso rápido em pílula verde (troca de combustível, atualizar)
function desenharAviso(dc, W, H) {
    if (gAviso == null) { return; }
    if (System.getTimer() > gAvisoAte) { gAviso = null; return; }
    var f = (W > 260) ? Graphics.FONT_SMALL : Graphics.FONT_TINY;
    var h = dc.getFontHeight(f) + 8, w = dc.getTextWidthInPixels(gAviso, f) + h + 16;
    var x = (W - w) / 2, y = H * 80 / 100 - h / 2;
    dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);   // faixa preta: nada vaza em volta da pílula
    dc.fillRectangle(0, y - 4, W, h + 8);
    dc.setColor(cAc, Graphics.COLOR_TRANSPARENT);
    dc.fillRoundedRectangle(x, y, w, h, h / 2);
    dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
    dc.setPenWidth(h > 30 ? 4 : 2);
    var cx = x + h / 2 + 4, cy = y + h / 2;          // ✓ desenhado
    dc.drawLine(cx - h / 5, cy, cx - h / 14, cy + h / 6);
    dc.drawLine(cx - h / 14, cy + h / 6, cx + h / 4, cy - h / 5);
    dc.setPenWidth(1);
    dc.drawText(x + h + 8, cy, f, gAviso, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
}
