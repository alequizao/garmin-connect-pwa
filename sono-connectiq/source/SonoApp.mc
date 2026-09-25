/*
 * Sono Alequizão (Connect IQ) · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * App de sono para relógios que não têm a tela de sono de fábrica (Forerunner 55).
 * Funciona 100% offline: tudo é lido e calculado no relógio, sem internet e sem celular.
 * O histórico fica guardado no próprio aparelho (últimas 30 noites).
 */
import Toybox.Application;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

module Sono {
    const VERSAO = "1.0.0";
    const MAX_HIST = 30;

    var noite = null;      // noite mais recente analisada (com "fases")
    var hist = [];         // [{dia, nota, tot, pro, lev, rem, aco}] do mais novo para o mais antigo
    var erro = null;       // texto quando não deu para analisar

    function carregarHist() {
        var h = Application.Storage.getValue("hist");
        hist = (h != null && h instanceof Lang.Array) ? h : [];
    }

    // Guarda a noite no histórico do relógio (substitui se já existir a do mesmo dia).
    function guardar(n) {
        var r = {
            "dia" => n["dia"], "nota" => n["nota"], "tot" => n["tot"], "pro" => n["pro"],
            "lev" => n["lev"], "rem" => n["rem"], "aco" => n["aco"],
            "ini" => n["ini"], "fim" => n["fim"], "fc" => n["fc"], "est" => n["est"]
        };
        var nova = [r];
        for (var i = 0; i < hist.size() && nova.size() < MAX_HIST; i++) {
            if (hist[i]["dia"] != r["dia"]) { nova.add(hist[i]); }
        }
        hist = nova;
        Application.Storage.setValue("hist", hist);
    }

    function analisar() {
        erro = null;
        try {
            noite = Analise.analisar();
        } catch (e) {
            noite = null;
            erro = "Erro ao ler os dados";
        }
        if (noite == null) {
            if (erro == null) { erro = "Sem dados de sono ainda.\nUse o relógio para dormir\ne abra o app de manhã."; }
        } else {
            guardar(noite);
        }
    }

    // média das notas do histórico
    function mediaNota() {
        if (hist.size() == 0) { return null; }
        var s = 0;
        for (var i = 0; i < hist.size(); i++) { s += hist[i]["nota"]; }
        return s / hist.size();
    }

    function mediaTotal() {
        if (hist.size() == 0) { return null; }
        var s = 0;
        for (var i = 0; i < hist.size(); i++) { s += hist[i]["tot"]; }
        return s / hist.size();
    }

    // Série da noite (fcs = frequência cardíaca, ess = estresse) já recortada na janela de sono.
    function serieNoite(chave) {
        if (noite == null) { return null; }
        return noite[chave];
    }

    // ---------- formatação ----------
    function hm(seg) {
        if (seg == null) { return "--"; }
        var h = seg / 3600;
        var m = (seg % 3600) / 60;
        return h.format("%d") + "h" + m.format("%02d");
    }

    function hora(t) {
        if (t == null) { return "--:--"; }
        var i = Time.Gregorian.info(new Time.Moment(t), Time.FORMAT_SHORT);
        return i.hour.format("%02d") + ":" + i.min.format("%02d");
    }

    function dataCurta(dia) {
        if (dia == null) { return "--"; }
        return ((dia % 100)).format("%02d") + "/" + ((dia / 100) % 100).format("%02d");
    }

    function pct(parte, tot) {
        if (tot == null || tot <= 0) { return 0; }
        return parte * 100 / tot;
    }
}

class SonoApp extends Application.AppBase {
    function initialize() { AppBase.initialize(); }

    function onStart(state) {
        Sono.carregarHist();
        Sono.analisar();
    }

    function onStop(state) { }

    function getInitialView() {
        return [new TelaView(), new TelaDelegate()];
    }
}
