/*
 * Sono Alequizão (Connect IQ) · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * Motor de análise do sono — 100% dentro do relógio, sem internet e sem celular.
 * Lê o que o próprio aparelho guarda (frequência cardíaca, estresse e Body Battery),
 * encontra a janela em que a pessoa dormiu, estima os estágios e dá a pontuação.
 * O Forerunner 55 não tem pontuação de sono de fábrica: aqui ela é calculada no relógio.
 */
import Toybox.ActivityMonitor;
import Toybox.Application;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.UserProfile;

module Analise {

    // estágios
    const PROFUNDO = 0;
    const LEVE = 1;
    const REM = 2;
    const ACORDADO = 3;

    const PASSO = 300;        // grade de 5 minutos
    const JANELA = 129600;    // olha 36 h para trás

    // ---------- leitura dos sensores ----------

    // Devolve [[epoch, valor], ...] do histórico de estresse (a espinha dorsal da análise:
    // é a série mais densa que o FR55 guarda).
    function lerEstresse(ini, fim) {
        var s = [];
        if (!(Toybox has :SensorHistory) || !(Toybox.SensorHistory has :getStressHistory)) { return s; }
        var it = Toybox.SensorHistory.getStressHistory({ :period => null, :order => Toybox.SensorHistory.ORDER_OLDEST_FIRST });
        if (it == null) { return s; }
        var a = it.next();
        while (a != null) {
            if (a.data != null && a.when != null) {
                var t = a.when.value();
                if (t >= ini && t <= fim) { s.add([t, a.data]); }
            }
            a = it.next();
        }
        return s;
    }

    function lerBodyBattery(ini, fim) {
        var s = [];
        if (!(Toybox has :SensorHistory) || !(Toybox.SensorHistory has :getBodyBatteryHistory)) { return s; }
        var it = Toybox.SensorHistory.getBodyBatteryHistory({ :period => null, :order => Toybox.SensorHistory.ORDER_OLDEST_FIRST });
        if (it == null) { return s; }
        var a = it.next();
        while (a != null) {
            if (a.data != null && a.when != null) {
                var t = a.when.value();
                if (t >= ini && t <= fim) { s.add([t, a.data]); }
            }
            a = it.next();
        }
        return s;
    }

    function lerFC(ini, fim) {
        var s = [];
        if (!(ActivityMonitor has :getHeartRateHistory)) { return s; }
        var it = ActivityMonitor.getHeartRateHistory(null, false);   // do mais antigo para o mais novo
        if (it == null) { return s; }
        var a = it.next();
        while (a != null) {
            if (a.heartRate != null && a.heartRate != ActivityMonitor.INVALID_HR_SAMPLE && a.heartRate > 20 && a.when != null) {
                var t = a.when.value();
                if (t >= ini && t <= fim) { s.add([t, a.heartRate]); }
            }
            a = it.next();
        }
        return s;
    }

    // Valor da série no instante t (mais próximo, até 20 min de distância). null se não houver.
    function em(serie, t) {
        if (serie.size() == 0) { return null; }
        var melhor = null;
        var dist = 1200;
        for (var i = 0; i < serie.size(); i++) {
            var d = serie[i][0] - t;
            if (d < 0) { d = -d; }
            if (d <= dist) { dist = d; melhor = serie[i][1]; }
            else if (serie[i][0] > t && melhor != null) { break; }
        }
        return melhor;
    }

    // ---------- janela de sono ----------

    // Horário de dormir/acordar configurado no relógio (Garmin Connect), em segundos após a meia-noite.
    function janelaPrevista() {
        var dormir = 79200;   // 22:00
        var acordar = 21600;  // 06:00
        var p = UserProfile.getProfile();
        if (p != null) {
            if (p has :sleepTime && p.sleepTime != null) { dormir = p.sleepTime.value(); }
            if (p has :wakeTime && p.wakeTime != null) { acordar = p.wakeTime.value(); }
        }
        return [dormir, acordar];
    }

    function meiaNoiteDeHoje() {
        var agora = Time.now();
        var h = Gregorian.info(agora, Time.FORMAT_SHORT);
        return agora.value() - (h.hour * 3600 + h.min * 60 + h.sec);
    }

    // ---------- análise ----------

    // Constrói a noite mais recente a partir do que o relógio guardou.
    // Devolve null quando não há dados suficientes.
    function analisar() {
        var agora = Time.now().value();
        var mn = meiaNoiteDeHoje();
        var jp = janelaPrevista();
        // janela esperada da última noite: deitou ontem (ou hoje cedo), levantou hoje
        var bed = mn - 86400 + jp[0];
        if (jp[0] < 43200) { bed = mn + jp[0]; }   // quem deita depois da meia-noite
        var wake = mn + jp[1];
        if (wake < bed) { wake += 86400; }
        if (bed > agora) { bed -= 86400; wake -= 86400; }
        // procura com folga de 3 h dos dois lados
        var ini = bed - 10800;
        var fim = wake + 10800;
        if (fim > agora) { fim = agora; }
        if (agora - ini > JANELA) { ini = agora - JANELA; }
        if (fim - ini < 3600) { return null; }

        // só agora lê os sensores, e só dentro da janela: a memória do FR55 é curta
        var est = lerEstresse(ini, fim);
        var fc = lerFC(ini, fim);
        var bb = lerBodyBattery(ini, fim);
        if (est.size() < 12 && fc.size() < 6) { return null; }

        // FC de repouso = menor FC estável da janela (10º percentil)
        var hrJan = [];
        for (var i = 0; i < fc.size(); i++) {
            if (fc[i][0] >= ini && fc[i][0] <= fim) { hrJan.add(fc[i][1]); }
        }
        var rest = null;
        var p = UserProfile.getProfile();
        if (p != null && p has :restingHeartRate && p.restingHeartRate != null && p.restingHeartRate > 25) {
            rest = p.restingHeartRate;
        }
        if (hrJan.size() >= 6) {
            hrJan = ordenar(hrJan);
            var pc = hrJan[hrJan.size() / 10];
            if (rest == null || pc < rest) { rest = pc; }
        }
        if (rest == null) { rest = 60; }

        // grade de 5 min: marca dormindo/acordado
        var n = (fim - ini) / PASSO;
        if (n < 12) { return null; }
        var dorm = new [n];
        var hrG = new [n];
        var esG = new [n];
        for (var i = 0; i < n; i++) {
            var t = ini + i * PASSO + PASSO / 2;
            var e = em(est, t);
            var h = em(fc, t);
            hrG[i] = h;
            esG[i] = e;
            var d = true;
            if (e != null && (e < 0 || e > 55)) { d = false; }   // -1 = muito movimento
            if (h != null && h > rest + 16) { d = false; }
            if (e == null && h == null) { d = false; }
            dorm[i] = d;
        }
        // maior trecho contínuo dormindo (tolera até 20 min acordado no meio)
        var mIni = -1; var mFim = -1; var cIni = -1; var folga = 0;
        for (var i = 0; i < n; i++) {
            if (dorm[i]) {
                if (cIni < 0) { cIni = i; }
                folga = 0;
            } else if (cIni >= 0) {
                folga++;
                if (folga > 4) {
                    if (mIni < 0 || (i - folga - cIni) > (mFim - mIni)) { mIni = cIni; mFim = i - folga; }
                    cIni = -1; folga = 0;
                }
            }
        }
        if (cIni >= 0 && (mIni < 0 || (n - cIni) > (mFim - mIni))) { mIni = cIni; mFim = n; }
        if (mIni < 0 || (mFim - mIni) < 12) { return null; }   // menos de 1 h: não conta como noite

        var tIni = ini + mIni * PASSO;
        var tFim = ini + mFim * PASSO;

        // ---------- estágios ----------
        // Sem acesso aos estágios oficiais da Garmin, o app estima pelo conjunto
        // FC x estresse x variação da FC, respeitando a física do sono:
        // profundo concentrado no começo da noite, REM no fim.
        var total = mFim - mIni;
        // Sem acesso aos estágios oficiais da Garmin, o app ordena os minutos da própria noite
        // por um "índice de profundidade" (FC acima do repouso + estresse + variação da FC) e
        // corta nas proporções típicas do sono humano, favorecendo profundo no início e REM no fim.
        var fases = new [total];
        var idx = new [total];
        for (var i = 0; i < total; i++) {
            var k = mIni + i;
            var h = hrG[k];
            var e = esG[k];
            var frac = i * 100 / total;
            fases[i] = LEVE;
            idx[i] = null;
            if (!dorm[k] || (e != null && e < 0) || (h != null && h > rest + 16)) {
                fases[i] = ACORDADO;
            } else if (h != null) {
                var var5 = 0;
                if (i > 0 && hrG[k - 1] != null) { var5 = h - hrG[k - 1]; if (var5 < 0) { var5 = -var5; } }
                var v = (h - rest) * 1.0 + ((e != null && e >= 0) ? e / 3.0 : 5.0) + 1.5 * var5;
                if (frac < 35) { v -= 2.0; }        // profundo se concentra no começo
                if (frac > 60) { v += 1.5; }        // REM se concentra no fim
                idx[i] = v;
            }
        }
        // Despertar curto (um bloco de 5 min) não conta: a Garmin só registra os mais longos.
        var i2 = 0;
        while (i2 < total) {
            if (fases[i2] == ACORDADO) {
                var f2 = i2;
                while (f2 < total && fases[f2] == ACORDADO) { f2++; }
                if (f2 - i2 < 2) { for (var k2 = i2; k2 < f2; k2++) { fases[k2] = LEVE; } }
                i2 = f2;
            } else { i2++; }
        }

        var validos = [];
        for (var i = 0; i < total; i++) { if (idx[i] != null) { validos.add(idx[i]); } }
        if (validos.size() >= 8) {
            validos = ordenar(validos);
            var corteP = validos[validos.size() * 18 / 100];
            var corteR = validos[validos.size() * 80 / 100];
            for (var i = 0; i < total; i++) {
                if (fases[i] == ACORDADO || idx[i] == null) { continue; }
                if (idx[i] <= corteP) { fases[i] = PROFUNDO; }
                else if (idx[i] >= corteR) { fases[i] = REM; }
                else { fases[i] = LEVE; }
            }
        }
        fases = suavizar(fases);

        var sProf = 0; var sLeve = 0; var sRem = 0; var sAco = 0; var acordadas = 0; var antes = LEVE;
        for (var i = 0; i < total; i++) {
            var f = fases[i];
            if (f == PROFUNDO) { sProf += PASSO; }
            else if (f == REM) { sRem += PASSO; }
            else if (f == ACORDADO) { sAco += PASSO; if (antes != ACORDADO) { acordadas++; } }
            else { sLeve += PASSO; }
            antes = f;
        }
        var dormido = sProf + sLeve + sRem;
        if (dormido < 3600) { return null; }

        // médias da noite
        var somaH = 0; var cH = 0; var minH = 300; var maxH = 0;
        var somaE = 0; var cE = 0;
        for (var i = mIni; i < mFim; i++) {
            if (hrG[i] != null) { somaH += hrG[i]; cH++; if (hrG[i] < minH) { minH = hrG[i]; } if (hrG[i] > maxH) { maxH = hrG[i]; } }
            if (esG[i] != null && esG[i] >= 0) { somaE += esG[i]; cE++; }
        }
        var bbIni = em(bb, tIni);
        var bbFim = em(bb, tFim);

        var noite = {
            "dia" => diaDe(tFim),
            "ini" => tIni,
            "fim" => tFim,
            "tot" => dormido,
            "pro" => sProf,
            "lev" => sLeve,
            "rem" => sRem,
            "aco" => sAco,
            "acn" => acordadas,
            "fc" => cH > 0 ? somaH / cH : null,
            "fcm" => cH > 0 ? minH : null,
            "fcx" => cH > 0 ? maxH : null,
            "fcr" => rest,
            "est" => cE > 0 ? somaE / cE : null,
            "bb0" => bbIni,
            "bb1" => bbFim,
            "fases" => fases,
            "fcs" => recortar(hrG, mIni, mFim),
            "ess" => recortar(esG, mIni, mFim)
        };
        noite["nota"] = nota(noite);
        return noite;
    }

    // Recorta a grade completa deixando só a janela em que a pessoa dormiu.
    function recortar(g, a, b) {
        var r = new [b - a];
        for (var i = a; i < b; i++) { r[i - a] = g[i]; }
        return r;
    }

    // Tira ruído: trechos de um único bloco de 5 min viram o estágio do vizinho.
    function suavizar(f) {
        var n = f.size();
        if (n < 3) { return f; }
        var s = new [n];
        for (var i = 0; i < n; i++) { s[i] = f[i]; }
        for (var i = 1; i < n - 1; i++) {
            if (f[i] != f[i - 1] && f[i - 1] == f[i + 1] && f[i] != ACORDADO) { s[i] = f[i - 1]; }
        }
        return s;
    }

    function ordenar(a) {
        // insertion sort: listas aqui têm poucas dezenas de itens
        for (var i = 1; i < a.size(); i++) {
            var v = a[i]; var j = i - 1;
            while (j >= 0 && a[j] > v) { a[j + 1] = a[j]; j--; }
            a[j + 1] = v;
        }
        return a;
    }

    function diaDe(t) {
        var h = Gregorian.info(new Time.Moment(t), Time.FORMAT_SHORT);
        return h.year * 10000 + h.month * 100 + h.day;
    }

    // ---------- pontuação (o que o FR55 não tem de fábrica) ----------

    function faixa(v, ini, fim, pontos) {
        if (v >= ini && v <= fim) { return pontos * 1.0; }
        var dist = v < ini ? (ini - v) : (v - fim);
        var larg = (fim - ini) * 1.4;
        if (larg < 1) { larg = 1.0; }
        var r = pontos * (1.0 - dist / larg);
        return r < 0 ? 0.0 : r;
    }

    // Necessidade de sono: o padrão adulto de 8 h (o FR55 não expõe a necessidade da Garmin).
    function necessidade() {
        var n = Application.Storage.getValue("meta");
        if (n != null && n >= 240 && n <= 720) { return n * 60; }
        return 28800;
    }

    function nota(x) {
        var tot = x["tot"];
        if (tot < 600) { return 0; }
        var p = faixa(tot * 100.0 / necessidade(), 92, 115, 45);
        p += faixa(x["pro"] * 100.0 / tot, 16, 33, 15);
        p += faixa(x["rem"] * 100.0 / tot, 21, 31, 15);
        p += faixa(x["aco"] * 100.0 / (tot + x["aco"]), 0, 6, 15);
        p += x["est"] != null ? faixa(x["est"], 0, 18, 10) : 7.0;
        var r = Math.round(p).toNumber();
        return r < 0 ? 0 : (r > 100 ? 100 : r);
    }

    // Body Battery neste momento (amostra mais recente do relógio).
    function bbAgora() {
        if (!(Toybox has :SensorHistory) || !(Toybox.SensorHistory has :getBodyBatteryHistory)) { return null; }
        var it = Toybox.SensorHistory.getBodyBatteryHistory({ :period => 1, :order => Toybox.SensorHistory.ORDER_NEWEST_FIRST });
        if (it == null) { return null; }
        var a = it.next();
        return (a != null && a.data != null) ? a.data.toNumber() : null;
    }

    // "Bom dia" / "Boa tarde" / "Boa noite", como o relatório matinal do Forerunner 165.
    function saudacao() {
        var h = Gregorian.info(Time.now(), Time.FORMAT_SHORT).hour;
        if (h < 12) { return "Bom dia"; }
        if (h < 18) { return "Boa tarde"; }
        return "Boa noite";
    }

    // Uma frase de recomendação a partir da noite que passou.
    function recado(n) {
        if (n == null) { return "Durma com o relógio\npara ver seu sono aqui."; }
        var nota = n["nota"];
        var h = Gregorian.info(Time.now(), Time.FORMAT_SHORT).hour;
        if (h >= 18) { return "Hora de desacelerar\npara dormir bem."; }
        if (nota >= 80) { return "Noite boa!\nAproveite o dia."; }
        if (nota >= 60) { return "Deu para descansar.\nTente dormir mais cedo."; }
        if (n["tot"] < 21600) { return "Você dormiu pouco.\nPegue leve hoje."; }
        return "Sono agitado.\nEvite esforço pesado.";
    }

    // Os 5 fatores que compõem a pontuação, cada um com os pontos que ganhou e o máximo possível.
    // É o mesmo detalhamento que o Forerunner 165 mostra na tela de sono.
    function fatores(x) {
        var tot = x["tot"];
        if (tot < 600) { return []; }
        return [
            ["Duração",    faixa(tot * 100.0 / necessidade(), 92, 115, 45), 45],
            ["Profundo",   faixa(x["pro"] * 100.0 / tot, 16, 33, 15), 15],
            ["REM",        faixa(x["rem"] * 100.0 / tot, 21, 31, 15), 15],
            ["Despertares", faixa(x["aco"] * 100.0 / (tot + x["aco"]), 0, 6, 15), 15],
            ["Estresse",   x["est"] != null ? faixa(x["est"], 0, 18, 10) : 7.0, 10]
        ];
    }

    // "Bom" / "Razoável" / "Ruim" para um fator, pela fatia do máximo que ele alcançou.
    function qualFator(p, max) {
        var f = p * 100.0 / max;
        if (f >= 80) { return "Bom"; }
        if (f >= 50) { return "Razoável"; }
        return "Ruim";
    }

    function qualidade(s) {
        if (s >= 90) { return "Excelente"; }
        if (s >= 80) { return "Bom"; }
        if (s >= 60) { return "Razoável"; }
        if (s > 0) { return "Ruim"; }
        return "—";
    }
}
