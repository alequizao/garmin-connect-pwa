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
    const VERSAO = "1.4.0";

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

        // altura total e ícone o maior possível; sobra dividida em espaços iguais entre as 6 linhas
        var linhasTexto = hT + hT + hNome + hT + hT;          // título, kcal livres, nome, detalhe, rodapé
        var disponivel = yFim - yIni;
        var tam = (w * 0.36).toNumber();
        if (tam > disponivel - linhasTexto - 7 * 3) { tam = (disponivel - linhasTexto - 21).toNumber(); }
        if (tam < 24) { tam = 24; }
        var altBloco = tam > hNum ? tam : hNum;
        var espaco = (disponivel - linhasTexto - altBloco) / 7.0;
        var y = yIni + espaco;

        dc.setColor(0xF5C23B, Graphics.COLOR_TRANSPARENT);
        texto(dc, cx, y, fT, "ME MIMEI", redondo); y += hT + espaco;
        dc.setColor(0x9A9AA0, Graphics.COLOR_TRANSPARENT);
        texto(dc, cx, y, fT, ($.saldo == null ? "--" : $.saldo.format("%d")) + " kcal livres", redondo); y += hT + espaco;

        // bloco [ícone][número]: encolhe o ícone se não couber na largura da tela nessa altura
        var txt = formatar(l["pode"]) + "x";
        var largNum = dc.getTextWidthInPixels(txt, fNum);
        var gap = (w * 0.03).toNumber();
        var larg = corda(y, y + altBloco, w, h, redondo);
        if (tam + gap + largNum > larg) { tam = (larg - gap - largNum).toNumber(); if (tam < 20) { tam = 20; } }
        $.tamIcone = tam;
        var x0 = cx - (tam + gap + largNum) / 2;
        var img = $.icones.get(l["id"] + ":" + l["icone"]);
        if (img != null) {
            dc.drawBitmap(x0 + (tam - img.getWidth()) / 2, y + (altBloco - img.getHeight()) / 2, img);
        } else {
            dc.setColor(0x2A2A2C, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(x0 + tam / 2, y + altBloco / 2, tam / 2);
        }
        dc.setColor(0xF5C23B, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x0 + tam + gap, y + (altBloco - hNum) / 2, fNum, txt, Graphics.TEXT_JUSTIFY_LEFT);
        y += altBloco + espaco;

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        textoAjustado(dc, cx, y, [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY], hNome, l["nome"], redondo); y += hNome + espaco;
        dc.setColor(0x9A9AA0, Graphics.COLOR_TRANSPARENT);
        var det = l["kcal"] + " kcal" + (l["porcao"] != null ? " · " + l["porcao"] : "");
        if (dc.getTextWidthInPixels(det, fT) > corda(y, y + hT, w, h, redondo)) { det = l["kcal"] + " kcal"; }
        texto(dc, cx, y, fT, det, redondo); y += hT + espaco;

        if ($.estado != "") {
            dc.setColor(0x9A9AA0, Graphics.COLOR_TRANSPARENT);
            texto(dc, cx, y, fT, $.estado, redondo);
        } else if (n <= 9) {
            var passo = (w * 0.035).toNumber(), xp = cx - (n - 1) * passo / 2, yp = y + hT / 2;
            for (var p = 0; p < n; p++) {
                dc.setColor(p == $.sel ? 0xF5C23B : 0x4A4A50, Graphics.COLOR_TRANSPARENT);
                dc.fillCircle(xp + p * passo, yp, p == $.sel ? 3 : 2);
            }
        } else {
            dc.setColor(0x6A6A70, Graphics.COLOR_TRANSPARENT);
            texto(dc, cx, y, fT, ($.sel + 1) + " / " + n, redondo);
        }
    }
}

/* largura útil da tela entre as alturas y1 e y2 (em tela redonda é a corda do círculo), com margem de 8% */
function corda(y1, y2, w, h, redondo) {
    if (!redondo) { return w * 0.92; }
    var r = w / 2.0, cy = h / 2.0;
    var d = (y1 - cy).abs() > (y2 - cy).abs() ? (y1 - cy).abs() : (y2 - cy).abs();
    if (d >= r) { return 0; }
    return 2 * Math.sqrt(r * r - d * d) * 0.92;
}

/* texto centralizado que nunca ultrapassa a borda: encurta com reticências se precisar */
function texto(dc, cx, y, fonte, t, redondo) {
    var larg = corda(y, y + dc.getFontHeight(fonte), dc.getWidth(), dc.getHeight(), redondo);
    if (Graphics has :fitTextToArea) { t = Graphics.fitTextToArea(t, fonte, larg, dc.getFontHeight(fonte), true); }
    else { while (t.length() > 2 && dc.getTextWidthInPixels(t, fonte) > larg) { t = t.substring(0, t.length() - 2) + "."; } }
    dc.drawText(cx, y, fonte, t, Graphics.TEXT_JUSTIFY_CENTER);
}

/* tenta fontes cada vez menores até caber; só corta com reticências na menor. Centraliza na altura reservada. */
function textoAjustado(dc, cx, y, fontes, altura, t, redondo) {
    var larg = corda(y, y + altura, dc.getWidth(), dc.getHeight(), redondo);
    for (var i = 0; i < fontes.size(); i++) {
        if (dc.getTextWidthInPixels(t, fontes[i]) <= larg || i == fontes.size() - 1) {
            var yy = y + (altura - dc.getFontHeight(fontes[i])) / 2;
            texto(dc, cx, yy, fontes[i], t, redondo);
            return;
        }
    }
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
        WatchUi.pushView(m, new MimeiMenuDelegate(), WatchUi.SLIDE_UP);
    }
}

class MimeiMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() { Menu2InputDelegate.initialize(); }
    function onSelect(item) {
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id instanceof Lang.String && id.equals("desfazer")) { $.estado = "Desfazendo..."; atualizar({ "acao" => "desfazer" }); WatchUi.requestUpdate(); return; }
        if (id instanceof Lang.String) { $.estado = "Atualizando..."; atualizar({ "acao" => "lanches" }); return; }
        $.estado = "Registrando...";
        atualizar({ "acao" => "comi", "lanche" => $.lanches[$.sel]["id"], "qtd" => id });
        WatchUi.requestUpdate();
    }
}
