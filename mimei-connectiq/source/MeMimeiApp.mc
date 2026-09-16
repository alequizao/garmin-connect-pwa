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
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.Timer;
import Toybox.UserProfile;
import Toybox.WatchUi;

module Mimei {
    const URL = "__URL__";     // gravado pelo compilador (appbuilder.py)
    const TOKEN = "__TOKEN__"; // gravado pelo compilador (appbuilder.py)
    const VERSAO = "1.1.0";

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
var sel = 0;
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
    if (r != null) { $.saldo = r["saldo"]; $.queimado = r["queimado"]; $.comido = r["comido"]; }
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
    var tam = (System.getDeviceSettings().screenWidth * 0.26).toNumber();
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
        var f = Graphics.FONT_XTINY, fh = dc.getFontHeight(f);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK); dc.clear();

        // anel: fundo cinza + progresso (comido / queimado), com ponta arredondada
        var esp = (w * 0.035).toNumber(); if (esp < 5) { esp = 5; }
        var raio = (w < h ? w : h) / 2 - esp / 2 - 2;
        var pct = 0.0;
        if ($.queimado != null && $.queimado > 0 && $.comido != null) { pct = $.comido.toFloat() / $.queimado; }
        if (pct > 1.0) { pct = 1.0; }
        if (dc has :setPenWidth) {
            dc.setPenWidth(esp);
            dc.setColor(0x2A2A2C, Graphics.COLOR_TRANSPARENT);
            dc.drawArc(cx, cy, raio, Graphics.ARC_CLOCKWISE, 90, 90.01);
            // restante (livre) em verde-azulado para o anel ficar bonito mesmo sem nada comido
            var livre = 1.0 - pct;
            if (livre > 0.002) {
                dc.setColor(0x1FA3E3, Graphics.COLOR_TRANSPARENT);
                dc.drawArc(cx, cy, raio, Graphics.ARC_CLOCKWISE, 90 - 360 * pct, 90 - 360 * pct - 360 * livre + 0.5);
            }
            if (pct > 0.002) {
                var passos = (pct * 40).toNumber() + 1;
                for (var k = 0; k < passos; k++) {
                    var a0 = 90 - 360 * pct * k / passos, a1 = 90 - 360 * pct * (k + 1) / passos;
                    dc.setColor(corDoAnel(pct * (k + 1) / passos), Graphics.COLOR_TRANSPARENT);
                    dc.drawArc(cx, cy, raio, Graphics.ARC_CLOCKWISE, a0, a1 - 0.5);
                }
            }
            dc.setPenWidth(1);
        }

        // topo: nome do app e calorias livres
        var yTopo = h * (redondo ? 0.12 : 0.06);
        dc.setColor(0xF5C23B, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, yTopo, f, "ME MIMEI", Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, yTopo + fh - 2, f, ($.saldo == null ? "--" : $.saldo.format("%d")) + " kcal livres", Graphics.TEXT_JUSTIFY_CENTER);

        var n = $.lanches.size();
        if (n == 0) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, cy - fh / 2, Graphics.FONT_SMALL, $.estado == "" ? "Nenhum lanche" : $.estado, Graphics.TEXT_JUSTIFY_CENTER);
            return;
        }
        if ($.sel >= n) { $.sel = 0; }
        var l = $.lanches[$.sel];

        // ícone grande
        var tamIcone = (w * 0.26).toNumber();
        var yIcone = yTopo + fh * 2 + 2;
        var img = $.icones.get(l["id"] + ":" + l["icone"]);
        if (img != null) {
            dc.drawBitmap(cx - img.getWidth() / 2, yIcone, img);
        } else {
            dc.setColor(0x2A2A2C, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(cx, yIcone + tamIcone / 2, tamIcone / 2);
        }

        // número em destaque
        var fNum = Graphics.FONT_NUMBER_MEDIUM;
        var yNum = yIcone + tamIcone - 2;
        var txt = formatar(l["pode"]);
        dc.setColor(0xF5C23B, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, yNum, fNum, txt, Graphics.TEXT_JUSTIFY_CENTER);
        var yNome = yNum + dc.getFontHeight(fNum) - 6;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, yNome, Graphics.FONT_SMALL, l["nome"], Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        var detalhe = l["kcal"] + " kcal" + (l["porcao"] != null ? " · " + l["porcao"] : "");
        if (Graphics has :fitTextToArea) { detalhe = Graphics.fitTextToArea(detalhe, f, w * 0.7, fh, true); }
        dc.drawText(cx, yNome + dc.getFontHeight(Graphics.FONT_SMALL) - 2, f, detalhe, Graphics.TEXT_JUSTIFY_CENTER);

        // pontinhos de página (até 9) ou "3/15"
        var yPts = h * (redondo ? 0.9 : 0.94);
        if (n <= 9) {
            var gap = (w * 0.04).toNumber(), x0 = cx - (n - 1) * gap / 2;
            for (var p = 0; p < n; p++) {
                dc.setColor(p == $.sel ? 0xF5C23B : 0x55555A, Graphics.COLOR_TRANSPARENT);
                dc.fillCircle(x0 + p * gap, yPts, p == $.sel ? 3 : 2);
            }
        } else {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, yPts - fh / 2, f, ($.sel + 1) + "/" + n, Graphics.TEXT_JUSTIFY_CENTER);
        }
        if ($.estado != "") {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, yPts - fh * 1.4, f, $.estado, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }
}

function atualizarTimer() { atualizar({ "acao" => "lanches" }); }

class MimeiDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }
    function onNextPage() { if ($.lanches.size() > 0) { $.sel = ($.sel + 1) % $.lanches.size(); WatchUi.requestUpdate(); } return true; }
    function onPreviousPage() { if ($.lanches.size() > 0) { $.sel = ($.sel - 1 + $.lanches.size()) % $.lanches.size(); WatchUi.requestUpdate(); } return true; }
    function onSelect() { menu(); return true; }
    function onMenu() { menu(); return true; }
    function menu() {
        if ($.lanches.size() == 0) { atualizar({ "acao" => "lanches" }); return; }
        var l = $.lanches[$.sel];
        var m = new WatchUi.Menu2({ :title => l["nome"] });
        m.addItem(new WatchUi.MenuItem("Comi 1", l["porcao"] == null ? (l["kcal"] + " kcal") : l["porcao"], 1.0, null));
        m.addItem(new WatchUi.MenuItem("Comi meia", (l["kcal"] / 2) + " kcal", 0.5, null));
        m.addItem(new WatchUi.MenuItem("Comi 2", (l["kcal"] * 2) + " kcal", 2.0, null));
        m.addItem(new WatchUi.MenuItem("Atualizar", "v" + Mimei.VERSAO, "atualizar", null));
        WatchUi.pushView(m, new MimeiMenuDelegate(), WatchUi.SLIDE_UP);
    }
}

class MimeiMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() { Menu2InputDelegate.initialize(); }
    function onSelect(item) {
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id instanceof Lang.String) { $.estado = "Atualizando..."; atualizar({ "acao" => "lanches" }); return; }
        $.estado = "Registrando...";
        atualizar({ "acao" => "comi", "lanche" => $.lanches[$.sel]["id"], "qtd" => id });
        WatchUi.requestUpdate();
    }
}
