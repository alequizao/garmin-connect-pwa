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
// Visual premium (v2): preto profundo, um verde de destaque, preço com cor semântica
// (verde → âmbar → vermelho suave), cinzas em 3 níveis, anel de progresso na borda e
// transições curtas com um único timer leve (40 ms só enquanto anima; 200 ms parado).
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
using Toybox.Timer;

const API = "https://alequizao.com/gasolina/api/perto";
const COMB = ["Gasolina comum", "Gas. aditivada", "Álcool", "Diesel comum", "Diesel aditiv.", "GNV"];
const TR = -1;          // Graphics.COLOR_TRANSPARENT
const CJ = 5;           // TEXT_JUSTIFY_CENTER | TEXT_JUSTIFY_VCENTER
const LJ = 6;           // TEXT_JUSTIFY_LEFT | TEXT_JUSTIFY_VCENTER

// ---- estado global (poucas variáveis, nada de dicionário grande) ----
var gM = null;          // Motor (GPS + rede + timer)
var gC = 1;             // combustível: código SEFAZ 1..6
var gP = null;          // postos: [[nome, preço, km, lat, lon, data_unix, bairro], ...]
var gT = 0;             // quando a lista foi consultada (unix)
var gR = 5;             // raio usado pelo servidor (km)
var gSel = 0;           // posto selecionado
var gMenu = -1;         // menu de combustível aberto (índice) ou -1
var gBusca = 0;         // 0 parado · 1 buscando GPS · 2 consultando preços
var gErr = null;        // [título, texto(, 0 = vazio, não é erro)] do último erro
var gLat = null;        // posição atual (graus)
var gLon = null;
var gHead = null;       // rumo do GPS (graus), só andando
var gFix = 0;           // System.getTimer() do último fix bom
var gIni = 0;           // início da fase atual da busca (GPS ou rede)
var gAviso = null;      // confirmação rápida ("✓ Álcool")
var gAvisoAte = 0;
var gPrimeira = true;
var gTrAte = 0;         // fim da transição (slide) em andamento
var gTrDir = 0;         // direção da transição: 1 vem de baixo/direita, -1 de cima/esquerda
var gDet = false;       // tela de detalhe aberta (redesenha mais vezes: seta ao vivo)
var gCheg = -1;         // posto em que já vibrou "Você chegou"

// ---- tokens de cor · AMOLED: verde-combustível + escala de preço + 3 cinzas ----
// ---- MIP (FR55, 8 cores): só cores puras; texto secundário branco (alto contraste) ----
var cAc = 0x00FF00;     // destaque único (e preço mais barato)
var cAm = 0xFFFF00;     // preço intermediário (âmbar)
var cRd = 0xFF0000;     // preço mais caro / erro (vermelho suave no AMOLED)
var cTx = 0xFFFFFF;     // texto principal
var cT2 = 0xFFFFFF;     // texto secundário
var cT3 = 0xFFFFFF;     // texto terciário (rótulos, rodapé)
var cLn = 0x0000FF;     // trilho dos anéis e marcas
var cCard = 0x000000;   // fundo do cartão selecionado
var gRedondo = true;

function cores() {
    var s = System.getDeviceSettings();
    gRedondo = s.screenShape == System.SCREEN_SHAPE_ROUND;
    if ((s has :requiresBurnInProtection) && s.requiresBurnInProtection) {   // AMOLED (FR165)
        cAc = 0x2ED18A; cAm = 0xFFB547; cRd = 0xFF6F61;
        cT2 = 0xAEB4B0; cT3 = 0x6B726E; cLn = 0x232826; cCard = 0x131816;
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
        motor.pulso();
        return [new Tela(), new TelaDelegate()];
    }

    function getGlanceView() { return [new Glance()]; }
}

// ---------------------------------------------------------------------------------
// GPS + consulta ao servidor + o único timer do app
// ---------------------------------------------------------------------------------
class Motor {
    hidden var mLigado = false;
    hidden var mPedido = 0;     // combustível do pedido em andamento
    hidden var mT = null;       // timer único (as telas não têm timer próprio)
    hidden var mRap = false;    // timer rápido (animação) ligado
    hidden var mN = 0;

    function initialize() { }

    // batida do timer: 40 ms só durante transição/confirmação; 200 ms no resto
    function pulso() {
        tique();
        mN++;
        var a = animando();
        if (mT == null || a != mRap) {
            if (mT != null) { mT.stop(); }
            mT = new Timer.Timer();
            mT.start(method(:pulso), a ? 40 : 200, true);
            mRap = a;
        }
        if (a || gBusca > 0 || (gDet && mN % 3 == 0) || mN % 50 == 0) { WatchUi.requestUpdate(); }
    }

    function ligar() {
        if (mLigado) { return; }
        try {
            Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:aoGps));
            mLigado = true;
        } catch (e) { mLigado = false; }
    }

    function desligar() {
        if (mT != null) { mT.stop(); mT = null; }
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
        gBusca = 2; mPedido = gC; gIni = System.getTimer();
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
                    gErr = ["Sem postos", "Nenhum preço num raio\nde " + gR + " km", 0];
                } else {
                    Application.Storage.setValue("u", [gC, gT, p]);
                    var a = p[0];
                    Application.Storage.setValue("g", [COMB[gC - 1], a[0], a[1], a[2], gT]);
                    vibrar(40);
                    trans(1);
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

function vibrar(forca) {
    if (!(Attention has :vibrate)) { return; }
    var s = System.getDeviceSettings();
    if ((s has :vibrateOn) && !s.vibrateOn) { return; }
    Attention.vibrate([new Attention.VibeProfile(forca, 60)]);
}

function animando() { return gAviso != null || System.getTimer() < gTrAte; }

// confirmação que cresce e some (1,6 s)
function aviso(t) {
    gAviso = t; gAvisoAte = System.getTimer() + 1600;
    if (gM != null) { gM.pulso(); }
}

// transição curta (220 ms) ao trocar de item/tela
function trans(d) {
    gTrDir = d; gTrAte = System.getTimer() + 220;
    if (gM != null) { gM.pulso(); }
}

// deslocamento da transição em px: começa em "amp" e desacelera até 0 (ease-out)
function desl(amp) {
    var k = gTrAte - System.getTimer();
    if (k <= 0) { return 0; }
    return gTrDir * amp * k * k / 48400;     // 220² = 48400
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

// diferença para o posto selecionado: "+R$ 0,02" / "-R$ 0,005" / "mesmo preço"
function dif(v, ref) {
    var d = v.toFloat() - ref.toFloat(), s = "+";
    if (d < 0) { d = -d; s = "-"; }
    if (d < 0.0005) { return "mesmo preço"; }
    return s + "R$ " + virgula(d.format(d < 0.0095 ? "%.3f" : "%.2f"));
}

// cor semântica do preço, relativa ao conjunto (escala de no mínimo R$ 0,10, para não
// pintar de vermelho um posto só 1 centavo mais caro)
function corPreco(v) {
    var lo = 99.0, hi = 0.0;
    for (var i = 0; i < gP.size(); i++) {
        var x = gP[i][1].toFloat();
        if (x < lo) { lo = x; }
        if (x > hi) { hi = x; }
    }
    var t = (v.toFloat() - lo) / ((hi - lo > 0.1) ? hi - lo : 0.1);
    return (t < 0.34) ? cAc : ((t < 0.67) ? cAm : cRd);
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
// largura útil (corda do círculo) na altura y; tela quadrada: a largura toda
function corda(W, y) {
    if (!gRedondo) { return W; }
    var r = W / 2, d = y - r;
    d = r * r - d * d;
    return (d > 0) ? 2 * Math.sqrt(d) : 0;
}

// texto centralizado que nunca encosta na borda redonda: usa f; se não couber, f2
function txt(dc, W, y, s, f, f2, cor) {
    var h = dc.getFontHeight(f) / 2;
    if (dc.getTextWidthInPixels(s, f) > corda(W, (y > W / 2) ? y + h : y - h) * 88 / 100) { f = f2; }
    dc.setColor(cor, TR);
    dc.drawText(W / 2, y, f, s, CJ);
}

// bomba de combustível vetorial: s = altura
function bomba(dc, x, y, s, cor, corVisor) {
    var w = s * 6 / 10, t = s / 8 + 1;
    dc.setColor(cor, TR);
    dc.fillRoundedRectangle(x, y, w, s, t);
    dc.fillRectangle(x + w, y + s * 6 / 10, s / 4, t);                 // braço da mangueira
    dc.fillRectangle(x + w + s / 4 - t, y + s / 4, t, s * 4 / 10);     // mangueira subindo
    dc.fillRectangle(x + w + s / 10, y + s / 10, s / 4, s / 5);        // bico
    dc.setColor(corVisor, TR);
    dc.fillRectangle(x + s / 10, y + s / 7, w - s / 5, s / 4);         // visor
}

// cabeçalho discreto igual em todas as telas: bomba verde + título em cinza
function cab(dc, W, t) {
    var g = W > 260, f = Graphics.FONT_XTINY, s = g ? 20 : 11, e = g ? 9 : 4;
    var x = (W - dc.getTextWidthInPixels(t, f) - s - e) / 2, y = W * 15 / 100;
    bomba(dc, x, y - s / 2, s, cAc, Graphics.COLOR_BLACK);
    dc.setColor(cT2, TR);
    dc.drawText(x + s + e, y, f, t, LJ);
}

// anel da borda (identidade): durante a busca enche (GPS até 45%, rede até 95%);
// fora dela vira indicador de posição (item i de n) no lado direito
function anel(dc, W, i, n) {
    var c = W / 2, r = c - (W > 260 ? 5 : 3);
    dc.setPenWidth(W > 260 ? 4 : 3);
    if (cCard != 0) { dc.setColor(cLn, TR); dc.drawCircle(c, c, r); }   // trilho só no AMOLED (no MIP o azul pesaria)
    dc.setColor(cAc, TR);
    if (gBusca > 0) {
        var e = (System.getTimer() - gIni).toFloat();
        var f = (gBusca == 1) ? 2 + 43 * e / (e + 6000) : 50 + 45 * e / (e + 2500);
        dc.drawArc(c, c, r, Graphics.ARC_CLOCKWISE, 90, (450 - f * 36 / 10).toNumber() % 360);
    } else if (n > 1) {
        var s = 64 / n, a = 32 - i * s;
        dc.drawArc(c, c, r, Graphics.ARC_CLOCKWISE, (a + 360) % 360, (a - s + 360) % 360);
    }
    dc.setPenWidth(1);
}

// preço: "R$" pequeno em cinza + número grande (f) na cor semântica; a vírgula é desenhada
// (as fontes numéricas do FR55 não têm vírgula) e tudo apoia na mesma linha de base
function preco(dc, cx, y, v, f, fr, cor) {
    var s = v.toFloat().format("%.3f"), k = s.find(".");
    var a = s.substring(0, k), b = s.substring(k + 1, s.length());
    var fh = dc.getFontHeight(f), yb = y - fh / 2 + Graphics.getFontAscent(f);
    var cw = fh / 7 + 2, wr = dc.getTextWidthInPixels("R$ ", fr), wa = dc.getTextWidthInPixels(a, f);
    var x = cx - (wr + wa + cw + dc.getTextWidthInPixels(b, f)) / 2;
    dc.setColor(cT3, TR);
    dc.drawText(x, yb - Graphics.getFontAscent(fr) + dc.getFontHeight(fr) / 2, fr, "R$ ", LJ);
    dc.setColor(cor, TR);
    dc.drawText(x + wr, y, f, a, LJ);
    var d = fh / 16 + 1, xc = x + wr + wa + cw / 2;
    dc.fillCircle(xc, yb - d, d);
    dc.fillPolygon([[xc + d, yb - d], [xc - d / 2, yb + d * 2], [xc - d, yb + d * 2], [xc, yb - d]]);
    dc.drawText(x + wr + wa + cw, y, f, b, LJ);
}

// confirmação em pílula verde: cresce (150 ms), fica e some encolhendo (200 ms)
function desenharAviso(dc, W, H) {
    if (gAviso == null) { return; }
    var t = System.getTimer();
    if (t > gAvisoAte) { gAviso = null; return; }
    var q = gAvisoAte - t, k = 1600 - q;
    k = (k < 150) ? k * 100 / 150 : 100;
    if (q < 200) { k = q / 2; }
    var f = (W > 260) ? Graphics.FONT_TINY : Graphics.FONT_XTINY;
    var h = dc.getFontHeight(f) + 6, w = dc.getTextWidthInPixels(gAviso, f) + h + 14, y = H * 80 / 100 - h / 2;
    var wk = h + (w - h) * k / 100, x = (W - wk) / 2;
    dc.setColor(Graphics.COLOR_BLACK, TR);    // margem preta: nada encosta na pílula
    dc.fillRoundedRectangle(x - 6, y - 3, wk + 12, h + 6, h / 2 + 3);
    dc.setColor(cAc, TR);
    dc.fillRoundedRectangle(x, y, wk, h, h / 2);
    if (k < 90) { return; }
    dc.setColor(Graphics.COLOR_BLACK, TR);
    dc.setPenWidth(h > 30 ? 4 : 2);
    var cx = x + h / 2 + 3, cy = y + h / 2;   // ✓ desenhado
    dc.drawLine(cx - h / 5, cy, cx - h / 14, cy + h / 6);
    dc.drawLine(cx - h / 14, cy + h / 6, cx + h / 4, cy - h / 5);
    dc.setPenWidth(1);
    dc.drawText(x + h + 4, cy, f, gAviso, LJ);
}
