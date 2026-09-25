/*
 * Força Alequizão · contagem automática de repetições
 *
 * Lê o acelerômetro a 25 Hz e conta uma repetição a cada ciclo completo de
 * movimento (sobe e desce). Para não contar tremida ou ajuste de posição,
 * exige amplitude mínima e um tempo mínimo entre repetições. Também mede o
 * quanto o braço está se mexendo, para fechar a série sozinho quando a pessoa
 * para (descanso automático).
 */
import Toybox.Lang;
import Toybox.Math;
import Toybox.Sensor;
import Toybox.System;

module Contador {
    const TAXA = 25;              // Hz
    const MIN_MS = 400;           // tempo mínimo entre duas repetições
    const MAX_MS = 6000;          // acima disso o ciclo é descartado (não é repetição)
    const PARADO_SEG = 8;         // segundos parado para fechar a série sozinho

    var ligado = false;
    var base = null;              // média móvel da força (mg)
    var subiu = false;            // já passou do limiar de cima
    var ultimoRep = 0;            // System.getTimer() da última repetição
    var inicioCiclo = 0;
    var agitacao = 0;             // o quanto mexeu no último segundo (mg médios)
    var paradoSeg = 0;            // segundos seguidos parado
    var limiar = 220;             // amplitude mínima do movimento (mg)
    var sensivel = 1;             // 0 = pouco sensível, 1 = normal, 2 = muito
    var fecharPendente = false;   // a série acabou sozinha; quem fecha é o tique da tela

    function limiarAtual() {
        if (sensivel == 0) { return 340; }
        if (sensivel == 2) { return 140; }
        return 220;
    }

    function iniciar() {
        zerar();
        if (ligado) { return; }
        try {
            Sensor.registerSensorDataListener(method(:aoReceber), {
                :period => 1,
                :accelerometer => { :enabled => true, :sampleRate => TAXA }
            });
            ligado = true;
        } catch (e) {
            ligado = false;
        }
    }

    function zerar() {
        fecharPendente = false;
        base = null; subiu = false; ultimoRep = 0; inicioCiclo = 0;
        agitacao = 0; paradoSeg = 0; limiar = limiarAtual();
    }

    function pausar() { parar(); }

    function parar() {
        if (!ligado) { return; }
        try { Sensor.unregisterSensorDataListener(); } catch (e) { }
        ligado = false;
    }

    // Chamado uma vez por segundo com ~25 amostras do acelerômetro.
    function aoReceber(dados) {
        if (dados == null || dados.accelerometerData == null) { return; }
        var ax = dados.accelerometerData.x;
        var ay = dados.accelerometerData.y;
        var az = dados.accelerometerData.z;
        if (ax == null || ay == null) { return; }
        var n = ax.size();
        if (az != null && az.size() < n) { n = az.size(); }
        if (ay.size() < n) { n = ay.size(); }

        var soma = 0;
        var agora = System.getTimer();
        for (var i = 0; i < n; i++) {
            var x = ax[i]; var y = ay[i]; var z = (az == null) ? 0 : az[i];
            var m = Math.sqrt(1.0 * x * x + 1.0 * y * y + 1.0 * z * z);
            if (base == null) { base = m; }
            var dev = m - base;
            base = base + (m - base) / 20.0;    // média móvel lenta (tira a gravidade)
            if (dev < 0) { soma -= dev; } else { soma += dev; }

            // tempo estimado desta amostra dentro do segundo
            var t = agora - 1000 + (i * 1000) / n;

            if (!subiu) {
                if (dev > limiar) { subiu = true; inicioCiclo = t; }
            } else {
                if (dev < -limiar) {
                    var dt = t - ultimoRep;
                    var ciclo = t - inicioCiclo;
                    if (dt > MIN_MS && ciclo < MAX_MS) {
                        Forca.reps++;
                        ultimoRep = t;
                    }
                    subiu = false;
                }
                // ciclo longo demais: não era repetição
                if (t - inicioCiclo > MAX_MS) { subiu = false; }
            }
        }

        agitacao = soma / n;
        if (agitacao < 60) { paradoSeg++; } else { paradoSeg = 0; }

        // fecha a série sozinho depois de alguns segundos parado.
        // Só marca aqui: desligar o sensor dentro do callback dele mesmo trava o app.
        if (Forca.autoSerie && Forca.estado == Forca.SERIE && Forca.reps > 0 && paradoSeg >= PARADO_SEG) {
            fecharPendente = true;
        }
    }
}
