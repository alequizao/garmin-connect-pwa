/*
 * Força Alequizão (Connect IQ) · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * Treino de força para relógios que não têm o perfil de musculação de fábrica
 * (Forerunner 55). Conta as repetições sozinho pelo acelerômetro, separa as
 * séries, controla o descanso, grava a atividade em FIT (vai para o Garmin
 * Connect como Treino de força) e guarda o histórico no próprio relógio.
 */
import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.Application;
import Toybox.Attention;
import Toybox.FitContributor;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

module Forca {
    const VERSAO = "1.0.0";
    const MAX_HIST = 20;          // treinos guardados no relógio

    // estados do treino
    const PARADO = 0;
    const SERIE = 1;
    const DESCANSO = 2;
    const PAUSADO = 3;
    const FIM = 4;

    // exercícios que já vêm no app (nome, peso inicial em kg)
    const EXERCICIOS = [
        "Supino reto", "Supino inclinado", "Crucifixo", "Desenvolvimento",
        "Elevação lateral", "Remada", "Puxada alta", "Barra fixa",
        "Rosca bíceps", "Tríceps", "Agachamento", "Leg press",
        "Afundo", "Levantamento terra", "Panturrilha", "Abdominal",
        "Flexão de braço", "Prancha", "Livre"
    ];

    var estado = PARADO;
    var sessao = null;            // ActivityRecording.Session
    var campoReps = null;         // campos FIT (por série)
    var campoPeso = null;
    var campoTotReps = null;      // campos FIT (resumo do treino)
    var campoVolume = null;

    var exercicio = 0;            // índice em EXERCICIOS
    var peso = 20;                // kg da série atual
    var reps = 0;                 // repetições contadas na série atual
    var serieNum = 0;             // quantas séries já fechadas
    var totalReps = 0;
    var volume = 0;               // soma de reps × peso (kg)
    var inicio = null;            // Time.Moment do começo do treino
    var inicioSerie = null;
    var descansoSeg = 90;         // descanso configurado
    var descansoResta = 0;
    var series = [];              // [{ex, reps, peso, seg}]
    var autoSerie = true;         // detectar fim da série sozinho
    var vibrar = true;
    var hist = [];

    // ---------- armazenamento ----------
    function carregar() {
        var h = Application.Storage.getValue("hist");
        hist = (h != null && h instanceof Lang.Array) ? h : [];
        var p = Application.Storage.getValue("peso");
        if (p != null) { peso = p; }
        var d = Application.Storage.getValue("descanso");
        if (d != null) { descansoSeg = d; }
        var a = Application.Storage.getValue("auto");
        if (a != null) { autoSerie = a; }
        var v = Application.Storage.getValue("vibrar");
        if (v != null) { vibrar = v; }
        var s = Application.Storage.getValue("sens");
        if (s != null) { Contador.sensivel = s; Contador.limiar = Contador.limiarAtual(); }
        var e = Application.Storage.getValue("exercicio");
        if (e != null && e < EXERCICIOS.size()) { exercicio = e; }
    }

    function salvarAjustes() {
        Application.Storage.setValue("peso", peso);
        Application.Storage.setValue("descanso", descansoSeg);
        Application.Storage.setValue("auto", autoSerie);
        Application.Storage.setValue("vibrar", vibrar);
        Application.Storage.setValue("exercicio", exercicio);
    }

    function guardarTreino() {
        if (series.size() == 0) { return; }
        var r = {
            "dia" => hoje(),
            "seg" => duracao(),
            "series" => series.size(),
            "reps" => totalReps,
            "vol" => volume,
            "ex" => resumoExercicios()
        };
        var nova = [r];
        for (var i = 0; i < hist.size() && nova.size() < MAX_HIST; i++) { nova.add(hist[i]); }
        hist = nova;
        Application.Storage.setValue("hist", hist);
    }

    // quantas séries por exercício, para o resumo do histórico
    function resumoExercicios() {
        var m = {};
        for (var i = 0; i < series.size(); i++) {
            var n = series[i]["ex"];
            var q = m.get(n);
            m.put(n, q == null ? 1 : q + 1);
        }
        return m;
    }

    function hoje() {
        var i = Time.Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        return i.year * 10000 + i.month * 100 + i.day;
    }

    function duracao() {
        if (inicio == null) { return 0; }
        return Time.now().value() - inicio.value();
    }

    // ---------- treino ----------
    function iniciar() {
        reps = 0; serieNum = 0; totalReps = 0; volume = 0; series = [];
        inicio = Time.now();
        inicioSerie = Time.now();
        estado = SERIE;
        abrirSessao();
        Contador.iniciar();
        aviso(1);
    }

    function abrirSessao() {
        try {
            sessao = ActivityRecording.createSession({
                :name => "Força",
                :sport => Activity.SPORT_TRAINING,
                :subSport => Activity.SUB_SPORT_STRENGTH_TRAINING
            });
            campoReps = sessao.createField("Repeticoes", 0, FitContributor.DATA_TYPE_UINT16,
                { :mesgType => FitContributor.MESG_TYPE_LAP, :units => "reps" });
            campoPeso = sessao.createField("Peso", 1, FitContributor.DATA_TYPE_UINT16,
                { :mesgType => FitContributor.MESG_TYPE_LAP, :units => "kg" });
            campoTotReps = sessao.createField("RepeticoesTotal", 2, FitContributor.DATA_TYPE_UINT16,
                { :mesgType => FitContributor.MESG_TYPE_SESSION, :units => "reps" });
            campoVolume = sessao.createField("Volume", 3, FitContributor.DATA_TYPE_UINT32,
                { :mesgType => FitContributor.MESG_TYPE_SESSION, :units => "kg" });
            sessao.start();
        } catch (e) {
            sessao = null;
        }
    }

    // Fecha a série atual: grava a volta (lap) no FIT e começa o descanso.
    function fecharSerie() {
        var seg = inicioSerie == null ? 0 : Time.now().value() - inicioSerie.value();
        if (reps > 0) {
            series.add({ "ex" => EXERCICIOS[exercicio], "reps" => reps, "peso" => peso, "seg" => seg });
            serieNum++;
            totalReps += reps;
            volume += reps * peso;
            if (sessao != null) {
                try {
                    if (campoReps != null) { campoReps.setData(reps); }
                    if (campoPeso != null) { campoPeso.setData(peso); }
                    sessao.addLap();
                } catch (e) { }
            }
        }
        reps = 0;
        descansoResta = descansoSeg;
        estado = DESCANSO;
        Contador.pausar();
        aviso(2);
    }

    function proximaSerie(avisar) {
        reps = 0;
        inicioSerie = Time.now();
        estado = SERIE;
        Contador.iniciar();
        if (avisar) { aviso(1); }
    }

    function pausar() {
        estado = PAUSADO;
        Contador.pausar();
        if (sessao != null) { try { sessao.stop(); } catch (e) { } }
    }

    function retomar() {
        estado = SERIE;
        inicioSerie = Time.now();
        Contador.iniciar();
        if (sessao != null) { try { sessao.start(); } catch (e) { } }
    }

    // Encerra o treino. salvar=true manda a atividade para o Garmin Connect.
    function encerrar(salvar) {
        if (estado == SERIE && reps > 0) { fecharSerie(); }
        Contador.parar();
        if (sessao != null) {
            try {
                if (sessao.isRecording()) { sessao.stop(); }
                if (salvar) {
                    if (campoTotReps != null) { campoTotReps.setData(totalReps); }
                    if (campoVolume != null) { campoVolume.setData(volume); }
                    sessao.save();
                } else {
                    sessao.discard();
                }
            } catch (e) { }
            sessao = null;
        }
        if (salvar) { guardarTreino(); }
        estado = FIM;
        salvarAjustes();
        aviso(3);
    }

    // ---------- avisos (vibração) ----------
    // 1 = começou a série, 2 = série fechada, 3 = fim do treino, 4 = descanso acabou
    function aviso(tipo) {
        if (!vibrar) { return; }
        if (!(Attention has :vibrate)) { return; }
        var v = [new Attention.VibeProfile(50, 250)];
        if (tipo == 2) { v = [new Attention.VibeProfile(75, 200), new Attention.VibeProfile(0, 150), new Attention.VibeProfile(75, 200)]; }
        if (tipo == 3) { v = [new Attention.VibeProfile(100, 600)]; }
        if (tipo == 4) { v = [new Attention.VibeProfile(100, 350), new Attention.VibeProfile(0, 150), new Attention.VibeProfile(100, 350), new Attention.VibeProfile(0, 150), new Attention.VibeProfile(100, 350)]; }
        try { Attention.vibrate(v); } catch (e) { }
    }

    // ---------- formatação ----------
    function tempo(seg) {
        if (seg == null) { return "--:--"; }
        if (seg < 0) { seg = 0; }
        var h = seg / 3600;
        var m = (seg % 3600) / 60;
        var s = seg % 60;
        if (h > 0) { return h.format("%d") + ":" + m.format("%02d") + ":" + s.format("%02d"); }
        return m.format("%d") + ":" + s.format("%02d");
    }

    function dataCurta(dia) {
        if (dia == null) { return "--"; }
        return (dia % 100).format("%02d") + "/" + ((dia / 100) % 100).format("%02d");
    }

    function fc() {
        var i = Activity.getActivityInfo();
        if (i != null && i.currentHeartRate != null) { return i.currentHeartRate; }
        return null;
    }

    function calorias() {
        var i = Activity.getActivityInfo();
        if (i != null && i.calories != null) { return i.calories; }
        return null;
    }

    function nomeEx() { return EXERCICIOS[exercicio]; }
}

class ForcaApp extends Application.AppBase {
    function initialize() { AppBase.initialize(); }

    function onStart(state) { Forca.carregar(); }

    function onStop(state) {
        // se o app for fechado no meio, não perde o treino: salva o que deu
        if (Forca.estado == Forca.SERIE || Forca.estado == Forca.DESCANSO || Forca.estado == Forca.PAUSADO) {
            Forca.encerrar(true);
        }
        Forca.salvarAjustes();
    }

    function getInitialView() {
        return [new InicioView(), new InicioDelegate()];
    }
}
