/*
 * ME MIMEI (Connect IQ) · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * Mostra quantos lanches "cabem" nas calorias ativas do dia (inspirado no CheersCore).
 * A lista de lanches, porções, calorias e ícones vem do site (alequizao.com/garmin → Apps → Me Mimei):
 * mudou lá, o relógio atualiza ao abrir, sem reinstalar.
 */
import Toybox.ActivityMonitor;
import Toybox.Application;
import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.Timer;
import Toybox.UserProfile;
import Toybox.WatchUi;

module Mimei {
    const URL = "__URL__";     // gravado pelo compilador (appbuilder.py)
    const TOKEN = "__TOKEN__"; // gravado pelo compilador (appbuilder.py)
    const VERSAO = "1.8.0";

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

class MeMimeiApp extends Application.AppBase {
    function initialize() { AppBase.initialize(); }
    function onStart(state) { }
    function onStop(state) { }
    function getInitialView() { return [new MimeiView(), new MimeiDelegate()]; }
}

// ---------- estado ----------
var lanches = [];          // [{id, nome, porcao, kcal, pode, icone}]
var icones = {};           // id -> bitmap baixado
var filaIcones = [];
var baixandoIcone = false;
var saldo = null;          // kcal disponíveis (ativas - já comidas)
var queimado = null;
var comido = 0;
var ultimoComido = null; // texto do último registro de hoje (para desfazer)
var sel = 0;
var tamIcone = null;   // calculado pela tela; os ícones são pedidos nesse tamanho
var estado = "Atualizando...";
var aguardando = false;
var timerAtualiza = null;

/* calorias ativas calculadas no próprio relógio: total do dia - metabolismo basal proporcional à hora */
function kcalAtivasRelogio() {
    try {
        var info = ActivityMonitor.getInfo();
        if (info == null || info.calories == null) { return null; }
        var p = UserProfile.getProfile();
        if (p == null || p.weight == null || p.height == null || p.birthYear == null) { return null; }
        var agora = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        var idade = agora.year - p.birthYear;
        var tmb = 10.0 * (p.weight / 1000.0) + 6.25 * p.height - 5.0 * idade + (p.gender == UserProfile.GENDER_MALE ? 5 : -161);
        var fracao = (agora.hour * 60 + agora.min) / 1440.0;
        var ativas = info.calories - tmb * fracao;
        return ativas > 0 ? ativas.toNumber() : 0;
    } catch (e) { return null; }
}

function atualizar(dados) {
    if ($.aguardando) { return; }
    $.aguardando = true;
    var k = kcalAtivasRelogio();
    if (k != null) { dados["kcal"] = k; }
    Mimei.pedir(dados, new Method($, :recebido));
}

function recebido(code, data) {
    $.aguardando = false;
    if (code != 200 || data == null || data["lanches"] == null) {
        $.estado = "Sem conexao (" + code + ")";
        WatchUi.requestUpdate(); return;
    }
    var r = data["resumo"];
    if (r != null) { $.saldo = r["saldo"]; $.queimado = r["queimado"]; $.comido = r["comido"]; $.ultimoComido = r["ultimo"]; }
    $.lanches = data["lanches"];
    Application.Storage.setValue("lanches", $.lanches);
    Application.Storage.setValue("resumo", r);
    if ($.sel >= $.lanches.size()) { $.sel = 0; }
    $.estado = "";
    $.filaIcones = [];
    for (var i = 0; i < $.lanches.size(); i++) {
        var l = $.lanches[i];
        var chave = l["id"] + ":" + l["icone"];
        if (l["icone"] != null && !$.icones.hasKey(chave)) { $.filaIcones.add(l); }
    }
    baixarProximoIcone();
    WatchUi.requestUpdate();
}

/* ícones um de cada vez (o relógio limita pedidos simultâneos) */
function baixarProximoIcone() {
    if ($.baixandoIcone || $.filaIcones.size() == 0) { return; }
    $.baixandoIcone = true;
    var l = $.filaIcones[0];
    var tam = $.tamIcone != null ? $.tamIcone : (System.getDeviceSettings().screenWidth * 0.24).toNumber();
    Communications.makeImageRequest(l["icone"], null, { :maxWidth => tam, :maxHeight => tam }, new Method($, :iconeRecebido));
}

function iconeRecebido(code, img) {
    $.baixandoIcone = false;
    if ($.filaIcones.size() == 0) { return; }
    var l = $.filaIcones[0];
    $.filaIcones = $.filaIcones.slice(1, null);
    if (code == 200 && img != null) { $.icones.put(l["id"] + ":" + l["icone"], img); WatchUi.requestUpdate(); }
    baixarProximoIcone();
}

function formatar(n) {
    if (n == null) { return "--"; }
    var v = n.toFloat();
    var inteiro = v.toNumber();
    var s = (v - inteiro < 0.05) ? inteiro.format("%d") : v.format("%.1f");
    var i = s.find(".");
    return i == null ? s : s.substring(0, i) + "," + s.substring(i + 1, s.length());
}

class MimeiView extends WatchUi.View {
    function initialize() { View.initialize(); }
    function onShow() {
        if ($.lanches.size() == 0) {
            var guardados = Application.Storage.getValue("lanches");
            if (guardados != null) { $.lanches = guardados; }
            var r = Application.Storage.getValue("resumo");
            if (r != null) { $.saldo = r["saldo"]; $.queimado = r["queimado"]; $.comido = r["comido"]; }
        }
        atualizar({ "acao" => "lanches" });
        if ($.timerAtualiza == null) { $.timerAtualiza = new Timer.Timer(); }
        $.timerAtualiza.stop();
        $.timerAtualiza.start(new Method($, :atualizarTimer), 60000, true);
    }
    function onHide() { if ($.timerAtualiza != null) { $.timerAtualiza.stop(); } }

    // cor do anel: verde -> amarelo -> laranja -> vermelho conforme o quanto já foi comido
    function corDoAnel(t) {
        if (t < 0.33) { return 0x5EE08A; }
        if (t < 0.6) { return 0xF5C23B; }
        if (t < 0.85) { return 0xFB8C1E; }
        return 0xEF4B5B;
    }

    function onUpdate(dc) {
        var w = dc.getWidth(), h = dc.getHeight(), cx = w / 2, cy = h / 2;
        var redondo = System.getDeviceSettings().screenShape == System.SCREEN_SHAPE_ROUND;
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK); dc.clear();
        // telas grandes (ex.: Forerunner 165 AMOLED 390x390, Connect IQ 5.2): bordas suaves e elementos maiores
        if (dc has :setAntiAlias) { dc.setAntiAlias(true); }
        var telaGrande = w >= 360;

        // anel discreto: trilho cinza fino + arco âmbar só do que já foi comido
        var pct = 0.0;
        if ($.queimado != null && $.queimado > 0 && $.comido != null) { pct = $.comido.toFloat() / $.queimado; }
        if (pct > 1.0) { pct = 1.0; }
        if (redondo && (dc has :setPenWidth)) {
            var esp = (w * 0.012).toNumber(); if (esp < 2) { esp = 2; }
            var raio = w / 2 - esp - 1;
            dc.setPenWidth(esp);
            dc.setColor(0x26262A, Graphics.COLOR_TRANSPARENT);
            dc.drawCircle(cx, cy, raio);
            if (pct > 0.01) {
                dc.setColor(0xF5A623, Graphics.COLOR_TRANSPARENT);
                dc.drawArc(cx, cy, raio, Graphics.ARC_CLOCKWISE, 90, 90 - 360 * pct);
            }
            dc.setPenWidth(1);
        }

        var fT = Graphics.FONT_XTINY, hT = dc.getFontHeight(fT);
        var fNum = Graphics.FONT_LARGE, hNum = dc.getFontHeight(fNum);
        var fNome = Graphics.FONT_SMALL, hNome = dc.getFontHeight(fNome);
        var n = $.lanches.size();
        var yIni = h * (redondo ? 0.07 : 0.03), yFim = h * (redondo ? 0.94 : 0.97);

        if (n == 0) {
            dc.setColor(0xF5C23B, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, cy - hT - hNome / 2, fT, "ME MIMEI", Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            texto(dc, cx, cy - hNome / 2, fNome, $.estado == "" ? "Nenhum lanche" : $.estado, redondo);
            return;
        }
        if ($.sel >= n) { $.sel = 0; }
        var l = $.lanches[$.sel];

        // itens empilhados; nada é abreviado: fonte diminui e, se preciso, o texto quebra em mais linhas
        var numTxt = formatar(l["pode"]) + "x";
        var kcalTxt = l["kcal"].format("%d");
        var porcao = l["porcao"];
        var itens = [
            { :t => "ME MIMEI", :f => [fT], :cor => 0xF5C23B },
            { :t => ($.saldo == null ? "--" : $.saldo.format("%d")) + " kcal livres", :f => [fT], :cor => 0x9A9AA0 },
            { :bloco => true },
            { :t => l["nome"], :f => telaGrande ? [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY, fT] : [Graphics.FONT_SMALL, Graphics.FONT_TINY, fT], :cor => 0xFFFFFF }
        ];
        if (porcao != null && porcao.length() > 0) { itens.add({ :t => porcao, :f => [fT], :cor => 0x9A9AA0 }); }
        itens.add({ :rodape => true, :t => n <= 9 ? "" : ($.sel + 1) + " / " + n, :f => [fT], :cor => 0x6A6A70 });

        var disponivel = yFim - yIni;
        var base = telaGrande ? 0.40 : 0.34;
        var tam = (w * base).toNumber();
        var larguras = new [itens.size()];
        for (var k = 0; k < itens.size(); k++) { larguras[k] = w * (redondo ? 0.78 : 0.92); }
        var medidas = new [itens.size()], alturas = new [itens.size()], ys = new [itens.size()];
        var espaco = 0.0;
        for (var passada = 0; passada < 2; passada++) {
            var somaTexto = 0;
            for (var k = 0; k < itens.size(); k++) {
                var it = itens[k];
                if (it[:bloco] == true) { continue; }
                if (it[:rodape] == true && n <= 9 && $.estado == "") { medidas[k] = null; alturas[k] = hT; somaTexto += hT; continue; }
                var txt = (it[:rodape] == true && $.estado != "") ? $.estado : it[:t];
                medidas[k] = medir(dc, txt, it[:f], larguras[k]);
                alturas[k] = dc.getFontHeight(medidas[k][0]) * medidas[k][1].size();
                somaTexto += alturas[k];
            }
            tam = (w * base).toNumber();
            if (tam > disponivel - somaTexto - 4 * (itens.size() + 1)) { tam = (disponivel - somaTexto - 4 * (itens.size() + 1)).toNumber(); }
            if (tam < 24) { tam = 24; }
            espaco = (disponivel - somaTexto - tam) / (itens.size() + 1).toFloat();
            if (espaco < 0) { espaco = 0; }
            var yy = yIni + espaco;
            for (var k = 0; k < itens.size(); k++) {
                var hk = itens[k][:bloco] == true ? tam : alturas[k];
                ys[k] = yy;
                larguras[k] = corda(yy, yy + hk, w, h, redondo);
                yy += hk + espaco;
            }
        }

        for (var k = 0; k < itens.size(); k++) {
            var it = itens[k], y = ys[k];
            if (it[:bloco] == true) {
                // [0,3x / cabem]  ÍCONE  [300 / kcal]: o ícone encolhe para os dois lados caberem inteiros
                var larg = corda(y, y + tam, w, h, redondo);
                var fontesLado = [Graphics.FONT_LARGE, Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY, fT];
                var fLado = fT, precisa = 0;
                for (var q = 0; q < fontesLado.size(); q++) {
                    var larguraLado = maior([dc.getTextWidthInPixels(numTxt, fontesLado[q]), dc.getTextWidthInPixels(kcalTxt, fontesLado[q]), dc.getTextWidthInPixels("cabem", fT), dc.getTextWidthInPixels("kcal", fT)]);
                    fLado = fontesLado[q]; precisa = larguraLado;
                    if (larguraLado <= (larg - tam) / 2 - 6) { break; }
                }
                var t2 = tam;
                if (precisa > (larg - t2) / 2 - 6) { t2 = (larg - 2 * precisa - 12).toNumber(); if (t2 < 16) { t2 = 16; } }
                $.tamIcone = t2;
                var img = $.icones.get(l["id"] + ":" + l["icone"]);
                if (img != null) {
                    dc.drawBitmap(cx - img.getWidth() / 2, y + (tam - img.getHeight()) / 2, img);
                } else {
                    dc.setColor(0x2A2A2C, Graphics.COLOR_TRANSPARENT);
                    dc.fillCircle(cx, y + tam / 2, t2 / 2);
                }
                var hL = dc.getFontHeight(fLado);
                var yL = y + (tam - hL - hT) / 2;
                var xE = cx - t2 / 2 - 6 - precisa / 2, xD = cx + t2 / 2 + 6 + precisa / 2;
                dc.setColor(0xF5C23B, Graphics.COLOR_TRANSPARENT);
                dc.drawText(xE, yL, fLado, numTxt, Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(0x9A9AA0, Graphics.COLOR_TRANSPARENT);
                dc.drawText(xE, yL + hL, fT, "cabem", Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(xD, yL, fLado, kcalTxt, Graphics.TEXT_JUSTIFY_CENTER);
                dc.setColor(0x9A9AA0, Graphics.COLOR_TRANSPARENT);
                dc.drawText(xD, yL + hL, fT, "kcal", Graphics.TEXT_JUSTIFY_CENTER);
            } else if (medidas[k] == null) {
                var passo = (w * 0.035).toNumber(), xp = cx - (n - 1) * passo / 2, yp = y + hT / 2;
                for (var p = 0; p < n; p++) {
                    dc.setColor(p == $.sel ? 0xF5C23B : 0x4A4A50, Graphics.COLOR_TRANSPARENT);
                    dc.fillCircle(xp + p * passo, yp, p == $.sel ? 3 : 2);
                }
            } else {
                dc.setColor(it[:rodape] == true && $.estado != "" ? 0x9A9AA0 : it[:cor], Graphics.COLOR_TRANSPARENT);
                var f = medidas[k][0], linhas = medidas[k][1], hf = dc.getFontHeight(f);
                for (var li = 0; li < linhas.size(); li++) { dc.drawText(cx, y + li * hf, f, linhas[li], Graphics.TEXT_JUSTIFY_CENTER); }
            }
        }
    }
}

/* maior valor de uma lista */
function maior(l) { var m = 0; for (var i = 0; i < l.size(); i++) { if (l[i] > m) { m = l[i]; } } return m; }

/* separa texto por um caractere */
function separar(t, sep) {
    var r = [];
    var i = t.find(sep);
    while (i != null) { r.add(t.substring(0, i)); t = t.substring(i + 1, t.length()); i = t.find(sep); }
    r.add(t);
    return r;
}

/* quebra o texto em linhas que caibam na largura (por palavra; palavra longa quebra por letra) — nunca abrevia */
function quebrar(dc, t, fonte, larg) {
    var palavras = separar(t, " ");
    var linhas = [], atual = "";
    for (var i = 0; i < palavras.size(); i++) {
        var p = palavras[i];
        var tentativa = atual.length() == 0 ? p : atual + " " + p;
        if (dc.getTextWidthInPixels(tentativa, fonte) <= larg) { atual = tentativa; continue; }
        if (atual.length() > 0) { linhas.add(atual); }
        while (p.length() > 1 && dc.getTextWidthInPixels(p, fonte) > larg) {
            var c = p.length() - 1;
            while (c > 1 && dc.getTextWidthInPixels(p.substring(0, c), fonte) > larg) { c -= 1; }
            linhas.add(p.substring(0, c));
            p = p.substring(c, p.length());
        }
        atual = p;
    }
    if (atual.length() > 0) { linhas.add(atual); }
    return linhas;
}

/* escolhe a maior fonte em que o texto cabe numa linha; se nenhuma, usa a menor e quebra em linhas */
function medir(dc, t, fontes, larg) {
    for (var i = 0; i < fontes.size(); i++) {
        if (dc.getTextWidthInPixels(t, fontes[i]) <= larg) { return [fontes[i], [t]]; }
    }
    var f = fontes[fontes.size() - 1];
    return [f, quebrar(dc, t, f, larg)];
}

/* largura útil da tela entre as alturas y1 e y2 (em tela redonda é a corda do círculo), com margem de 8% */
function corda(y1, y2, w, h, redondo) {
    if (!redondo) { return w * 0.92; }
    var r = w / 2.0, cy = h / 2.0;
    var d = (y1 - cy).abs() > (y2 - cy).abs() ? (y1 - cy).abs() : (y2 - cy).abs();
    if (d >= r) { return 0; }
    return 2 * Math.sqrt(r * r - d * d) * 0.92;
}

/* texto centralizado que nunca ultrapassa a borda nem é abreviado: quebra em linhas se precisar */
function texto(dc, cx, y, fonte, t, redondo) {
    var larg = corda(y, y + dc.getFontHeight(fonte), dc.getWidth(), dc.getHeight(), redondo);
    var linhas = quebrar(dc, t, fonte, larg), hf = dc.getFontHeight(fonte);
    for (var i = 0; i < linhas.size(); i++) { dc.drawText(cx, y + i * hf, fonte, linhas[i], Graphics.TEXT_JUSTIFY_CENTER); }
}



function atualizarTimer() { atualizar({ "acao" => "lanches" }); }

class MimeiDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }
    function onNextPage() { if ($.lanches.size() > 0) { $.sel = ($.sel + 1) % $.lanches.size(); WatchUi.requestUpdate(); } return true; }
    function onPreviousPage() { if ($.lanches.size() > 0) { $.sel = ($.sel - 1 + $.lanches.size()) % $.lanches.size(); WatchUi.requestUpdate(); } return true; }
    function onSwipe(ev) {
        var d = ev.getDirection();
        if (d == WatchUi.SWIPE_LEFT || d == WatchUi.SWIPE_UP) { return onNextPage(); }
        if (d == WatchUi.SWIPE_RIGHT || d == WatchUi.SWIPE_DOWN) { return onPreviousPage(); }
        return false;
    }
    function onSelect() { menu(); return true; }
    function onMenu() { menu(); return true; }
    function menu() {
        if ($.lanches.size() == 0) { atualizar({ "acao" => "lanches" }); return; }
        var l = $.lanches[$.sel];
        var m = new WatchUi.Menu2({ :title => l["nome"] });
        m.addItem(new WatchUi.MenuItem("Comi 1", l["porcao"] == null ? (l["kcal"] + " kcal") : l["porcao"], 1.0, null));
        m.addItem(new WatchUi.MenuItem("Comi meia", (l["kcal"] / 2) + " kcal", 0.5, null));
        m.addItem(new WatchUi.MenuItem("Comi 2", (l["kcal"] * 2) + " kcal", 2.0, null));
        if ($.ultimoComido != null) { m.addItem(new WatchUi.MenuItem("Desfazer ultimo", $.ultimoComido, "desfazer", null)); }
        m.addItem(new WatchUi.MenuItem("Atualizar", "v" + Mimei.VERSAO, "atualizar", null));
        m.addItem(new WatchUi.MenuItem("Sobre", "desenvolvedor", "sobre", null));
        WatchUi.pushView(m, new MimeiMenuDelegate(), WatchUi.SLIDE_UP);
    }
}

class MimeiMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() { Menu2InputDelegate.initialize(); }
    function onSelect(item) {
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id instanceof Lang.String && id.equals("sobre")) { abrirSobre("ME MIMEI", Mimei.VERSAO); return; }
        if (id instanceof Lang.String && id.equals("desfazer")) { $.estado = "Desfazendo..."; atualizar({ "acao" => "desfazer" }); WatchUi.requestUpdate(); return; }
        if (id instanceof Lang.String) { $.estado = "Atualizando..."; atualizar({ "acao" => "lanches" }); return; }
        $.estado = "Registrando...";
        atualizar({ "acao" => "comi", "lanche" => $.lanches[$.sel]["id"], "qtd" => id });
        WatchUi.requestUpdate();
    }
}
