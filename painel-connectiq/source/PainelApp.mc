/*
 * PAINEL TOTAL (mostrador Connect IQ) · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * Réplica de um painel "infográfico": hora grande no centro e, em volta, frequência
 * cardíaca com zona, calorias, bateria, passos, distância, pisos, subida, estresse,
 * minutos de intensidade, Body Battery, clima com máxima/mínima, GPS, nascer e pôr do
 * sol, notificações, alarmes e os ícones de estado.
 *
 * Todas as posições, tamanhos de letra e marcas do aro foram MEDIDOS na arte de
 * referência (1254 px) e convertidos para a tela de 390 px — daí os números quebrados.
 * Os ícones são bitmaps recortados da própria arte e as letras usam fontes bitmap
 * próprias: a menor fonte do sistema no FR165 tem 26 px, grande demais para esta
 * densidade de informação.
 */
import Toybox.Activity;
import Toybox.ActivityMonitor;
import Toybox.Application;
import Toybox.Complications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Position;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.UserProfile;
import Toybox.WatchUi;
import Toybox.Weather;

class PainelApp extends Application.AppBase {
    var view;
    function initialize() { AppBase.initialize(); }
    function onStart(state as Dictionary?) as Void { }
    function onStop(state as Dictionary?) as Void { }
    function getInitialView() { view = new PainelView(); return [view]; }
    function onSettingsChanged() as Void {
        if (view != null) { view.lerConfig(); }
        WatchUi.requestUpdate();
    }
}

class PainelView extends WatchUi.WatchFace {

    // ---------- paleta ----------
    const BRANCO   = 0xFFFFFF;
    const PRETO    = 0x000000;
    const VERMELHO = 0xFF0000;
    const CINZA    = 0x555555;
    const CINZA_C  = 0xAAAAAA;
    const LINHA    = 0x333333;
    const VERDE    = 0x00CC00;
    const AZUL     = 0x00AAFF;
    const LARANJA  = 0xFF8800;
    const AMARELO  = 0xFFCC00;

    const DIAS  = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    // minutos em que a arte traz marca vermelha comprida (o resto é marca clara curta)
    const MARCAS_V = [4, 10, 11, 14, 15, 19, 20, 40, 41, 45, 46, 49, 50, 56];

    // ---------- estado ----------
    var w = 390, h = 390, cx = 195, cy = 195, raio = 195;
    var k = 1.0;
    var queimaTela = false;
    var dormindo = false;
    var corDestaque = VERMELHO;
    var mostrarSegundos = true;
    var unidadeMetrica = true;
    var fZ, fU, fR, fT, fV, fC, fN, fH;      // fontes bitmap
    var ic = null;                            // ícones (bitmaps)

    function initialize() {
        WatchFace.initialize();
        var ds = System.getDeviceSettings();
        if (ds has :requiresBurnInProtection && ds.requiresBurnInProtection != null) {
            queimaTela = ds.requiresBurnInProtection;
        }
        if (ds has :distanceUnits) { unidadeMetrica = (ds.distanceUnits == System.UNIT_METRIC); }
        lerConfig();
    }

    function lerConfig() as Void {
        try {
            var c = Application.Properties.getValue("corDestaque");
            if (c != null) {
                var cores = [VERMELHO, 0xFF8800, 0x00AAFF, 0x00CC00, 0xFFCC00, 0xFFFFFF];
                if (c >= 0 && c < cores.size()) { corDestaque = cores[c]; }
            }
            var s = Application.Properties.getValue("segundos");
            if (s != null) { mostrarSegundos = s; }
        } catch (e) { }
    }

    function onLayout(dc as Dc) as Void {
        w = dc.getWidth();
        h = dc.getHeight();
        cx = w / 2;
        cy = h / 2;
        raio = (w < h ? w : h) / 2;
        k = w / 390.0;
        fZ = WatchUi.loadResource(Rez.Fonts.pnZ);
        fU = WatchUi.loadResource(Rez.Fonts.pnU);
        fR = WatchUi.loadResource(Rez.Fonts.pnR);
        fT = WatchUi.loadResource(Rez.Fonts.pnT);
        fV = WatchUi.loadResource(Rez.Fonts.pnV);
        fC = WatchUi.loadResource(Rez.Fonts.pnC);
        fN = WatchUi.loadResource(Rez.Fonts.pnN);
        fH = WatchUi.loadResource(Rez.Fonts.pnH);
        ic = {
            :coracao   => WatchUi.loadResource(Rez.Drawables.icCoracao),
            :chama     => WatchUi.loadResource(Rez.Drawables.icChama),
            :bateria   => WatchUi.loadResource(Rez.Drawables.icBateria),
            :pegadas   => WatchUi.loadResource(Rez.Drawables.icPegadas),
            :estrada   => WatchUi.loadResource(Rez.Drawables.icEstrada),
            :montanha  => WatchUi.loadResource(Rez.Drawables.icMontanha),
            :subida    => WatchUi.loadResource(Rez.Drawables.icSubida),
            :estresse  => WatchUi.loadResource(Rez.Drawables.icEstresse),
            :corredor  => WatchUi.loadResource(Rez.Drawables.icCorredor),
            :raio      => WatchUi.loadResource(Rez.Drawables.icRaio),
            :pino      => WatchUi.loadResource(Rez.Drawables.icPino),
            :sinal     => WatchUi.loadResource(Rez.Drawables.icSinal),
            :clima     => WatchUi.loadResource(Rez.Drawables.icClima),
            :nascer    => WatchUi.loadResource(Rez.Drawables.icNascer),
            :porsol    => WatchUi.loadResource(Rez.Drawables.icPorsol),
            :mensagem  => WatchUi.loadResource(Rez.Drawables.icMensagem),
            :alarme    => WatchUi.loadResource(Rez.Drawables.icAlarme),
            :bluetooth => WatchUi.loadResource(Rez.Drawables.icBluetooth),
            :celular   => WatchUi.loadResource(Rez.Drawables.icCelular),
            :lua       => WatchUi.loadResource(Rez.Drawables.icLua)
        };
    }

    function px(v) { return (v * k + 0.5).toNumber(); }

    function onShow() as Void { }
    function onExitSleep() as Void { dormindo = false; WatchUi.requestUpdate(); }
    function onEnterSleep() as Void { dormindo = true; WatchUi.requestUpdate(); }

    // ======================================================================
    function onUpdate(dc as Dc) as Void {
        if (dc has :clearClip) { dc.clearClip(); }
        dc.setColor(PRETO, PRETO);
        dc.clear();

        var agora = Gregorian.info(Time.now(), Time.FORMAT_MEDIUM);
        var am = null;
        try { am = ActivityMonitor.getInfo(); } catch (e) { }
        var eco = (dormindo && queimaTela);

        aro(dc, eco);
        if (!eco) { grade(dc); }

        blocoFC(dc, eco);
        blocoCalorias(dc, am);
        blocoBateria(dc, eco);
        blocoPassos(dc, am, eco);
        blocoDistancia(dc, am, eco);
        data(dc, agora);
        blocoPisos(dc, am, eco);
        blocoSubida(dc, am, eco);
        hora(dc, agora);
        blocoEstresse(dc, am, eco);
        blocoIntensidade(dc, am, eco);
        if (!eco) {
            blocoClima(dc);
            blocoBodyBattery(dc);
            blocoGps(dc);
            blocoSol(dc);
            blocoRodape(dc);
        }
        if (mostrarSegundos && !dormindo) { segundos(dc, agora.sec); }
    }

    // segundos redesenhados sem repintar a tela toda
    function onPartialUpdate(dc as Dc) as Void {
        if (!mostrarSegundos || queimaTela) { return; }
        var sec = Gregorian.info(Time.now(), Time.FORMAT_SHORT).sec;
        var x = px(260), y = px(222), lg = px(30), al = px(22);
        if (dc has :setClip) { dc.setClip(x, y, lg, al); }
        dc.setColor(PRETO, PRETO);
        dc.clear();
        segundos(dc, sec);
        if (dc has :clearClip) { dc.clearClip(); }
    }

    // ---------- aro de marcas (posições medidas na arte) ----------
    function aro(dc as Dc, eco) as Void {
        for (var i = 0; i < 60; i++) {
            if (i == 0 || i == 30) { continue; }          // ali ficam as setas
            var vermelha = false;
            for (var j = 0; j < MARCAS_V.size(); j++) {
                if (MARCAS_V[j] == i) { vermelha = true; break; }
            }
            var cor = vermelha ? corDestaque : CINZA_C;
            var r1 = vermelha ? px(181) : px(186);
            var grossa = vermelha ? px(5) : px(3);
            if (eco) { cor = CINZA; r1 = px(186); grossa = px(2); }
            var ang = (i * 6 - 90) * Math.PI / 180.0;
            var co = Math.cos(ang);
            var se = Math.sin(ang);
            dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(grossa);
            dc.drawLine(cx + r1 * co, cy + r1 * se, cx + px(194) * co, cy + px(194) * se);
        }
        dc.setPenWidth(1);
        dc.setColor(eco ? CINZA : corDestaque, Graphics.COLOR_TRANSPARENT);
        var t = px(10);
        dc.fillPolygon([[cx - t, cy - px(193)], [cx + t, cy - px(193)], [cx, cy - px(173)]]);
        dc.fillPolygon([[cx - t, cy + px(193)], [cx + t, cy + px(193)], [cx, cy + px(173)]]);
    }

    // ---------- linhas que formam os painéis ----------
    function grade(dc as Dc) as Void {
        dc.setColor(LINHA, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(px(2));
        var linhas = [
            [ 88,  84, 104,  66], [104,  66, 140,  66],
            [250,  66, 286,  66], [286,  66, 302,  84],
            [136,  90, 150, 108], [150, 108, 240, 108], [240, 108, 254,  90],
            [ 30, 145, 132, 145], [132, 145, 148, 128],
            [242, 128, 258, 145], [258, 145, 360, 145],
            [ 26, 188, 118, 188], [118, 188, 132, 172],
            [258, 172, 272, 188], [272, 188, 364, 188],
            [ 30, 240, 124, 240], [124, 240, 138, 224],
            [252, 224, 266, 240], [266, 240, 360, 240],
            [ 36, 292, 132, 292], [132, 292, 146, 276],
            [244, 276, 258, 292], [258, 292, 354, 292],
            [ 92, 338, 116, 338], [116, 338, 130, 322],
            [260, 322, 274, 338], [274, 338, 298, 338],
            [148, 112, 148, 142], [242, 112, 242, 142],
            [122, 190, 122, 236], [268, 190, 268, 236],
            [142, 296, 142, 334], [248, 296, 248, 334]
        ];
        for (var i = 0; i < linhas.size(); i++) {
            var l = linhas[i];
            dc.drawLine(px(l[0]), px(l[1]), px(l[2]), px(l[3]));
        }
        dc.setPenWidth(1);
    }

    // ======================================================================
    //  BLOCOS  (x/y = centro do elemento, medidos na arte)
    // ======================================================================
    function blocoFC(dc as Dc, eco) as Void {
        var fc = fcAtual();
        var zona = 0;
        var zonas = null;
        try { zonas = UserProfile.getHeartRateZones(UserProfile.HR_ZONE_SPORT_GENERIC); } catch (e) { }
        if (fc != null && zonas != null) {
            for (var i = 1; i < zonas.size(); i++) {
                if (fc >= zonas[i - 1]) { zona = i; }
            }
        }
        icone(dc, :coracao, 195, 33);
        texto(dc, 195, 68, fN, fc == null ? "--" : fc.toString(), BRANCO, Graphics.TEXT_JUSTIFY_CENTER);
        texto(dc, 195, 99, fZ, zona > 0 ? ("Z" + zona.toString()) : "Z-", BRANCO, Graphics.TEXT_JUSTIFY_CENTER);
        if (eco) { return; }
        var lg = px(5);
        var esp = px(2);
        var x0 = px(150);
        var acesos = zona * 2;
        for (var i = 0; i < 12; i++) {
            dc.setColor(i < acesos ? corDestaque : CINZA, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(x0 + i * (lg + esp), px(118), lg, px(7));
        }
    }

    function fcAtual() {
        try {
            var ai = Activity.getActivityInfo();
            if (ai != null && ai.currentHeartRate != null) { return ai.currentHeartRate; }
        } catch (e) { }
        try {
            var it = ActivityMonitor.getHeartRateHistory(1, true);
            if (it != null) {
                var a = it.next();
                if (a != null && a.heartRate != null && a.heartRate != ActivityMonitor.INVALID_HR_SAMPLE) {
                    return a.heartRate;
                }
            }
        } catch (e) { }
        return null;
    }

    function blocoCalorias(dc as Dc, am) as Void {
        var cal = (am != null && am.calories != null) ? am.calories : 0;
        icone(dc, :chama, 120, 44);
        texto(dc, 116, 68, fR, "CAL", BRANCO, Graphics.TEXT_JUSTIFY_CENTER);
        texto(dc, 112, 87, fV, cal.toString(), BRANCO, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function blocoBateria(dc as Dc, eco) as Void {
        var pct = System.getSystemStats().battery.toNumber();
        icone(dc, :bateria, 269, 52);
        if (!eco && pct < 96) {
            // apaga a parte vazia da pilha (o ícone vem cheio da arte)
            dc.setColor(PRETO, PRETO);
            var lg = px(21);
            var x = px(258);
            var vazio = (lg * (100 - pct) / 100.0).toNumber();
            if (vazio > 0) { dc.fillRectangle(x + lg - vazio, px(46), vazio, px(12)); }
        }
        texto(dc, 281, 84, fV, pct.toString() + "%", BRANCO, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function blocoPassos(dc as Dc, am, eco) as Void {
        var passos = (am != null && am.steps != null) ? am.steps : 0;
        var meta = (am != null && am.stepGoal != null && am.stepGoal > 0) ? am.stepGoal : 10000;
        icone(dc, :pegadas, 48, 104);
        texto(dc, 62, 95, fR, "PASSOS", BRANCO, Graphics.TEXT_JUSTIFY_LEFT);
        texto(dc, 55, 112, fV, passos.toString(), BRANCO, Graphics.TEXT_JUSTIFY_LEFT);
        texto(dc, 60, 128, fU, "/ " + meta.toString(), CINZA_C, Graphics.TEXT_JUSTIFY_LEFT);
        if (!eco) { barra(dc, 38, 140, 86, 6, passos.toFloat() / meta, corDestaque); }
    }

    function blocoDistancia(dc as Dc, am, eco) as Void {
        var m = (am != null && am.distance != null) ? am.distance / 100.0 : 0.0;
        var val = unidadeMetrica ? (m / 1000.0) : (m / 1609.34);
        icone(dc, :estrada, 292, 103);
        texto(dc, 359, 95, fR, "DISTÂNCIA", BRANCO, Graphics.TEXT_JUSTIFY_RIGHT);
        texto(dc, 359, 112, fV, val.format("%.1f"), BRANCO, Graphics.TEXT_JUSTIFY_RIGHT);
        texto(dc, 310, 128, fU, unidadeMetrica ? "km" : "mi", CINZA_C, Graphics.TEXT_JUSTIFY_LEFT);
        if (!eco) { barra(dc, 266, 140, 86, 6, val / 10.0, corDestaque); }
    }

    function data(dc as Dc, agora) as Void {
        var txt = DIAS[agora.day_of_week - 1] + ", " + agora.day.toString() + " de " + MESES[agora.month - 1];
        texto(dc, 197, 132, fT, txt, BRANCO, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function blocoPisos(dc as Dc, am, eco) as Void {
        var p = (am != null && am.floorsClimbed != null) ? am.floorsClimbed : 0;
        var meta = (am != null && am.floorsClimbedGoal != null && am.floorsClimbedGoal > 0) ? am.floorsClimbedGoal : 10;
        icone(dc, :montanha, 37, 154);
        texto(dc, 55, 149, fR, "PISOS", BRANCO, Graphics.TEXT_JUSTIFY_LEFT);
        texto(dc, 50, 166, fV, p.toString(), BRANCO, Graphics.TEXT_JUSTIFY_LEFT);
        if (!eco) { barra(dc, 46, 180, 64, 6, p.toFloat() / meta, corDestaque); }
    }

    function blocoSubida(dc as Dc, am, eco) as Void {
        var mts = 0;
        if (am != null && am.metersClimbed != null) { mts = am.metersClimbed.toNumber(); }
        icone(dc, :subida, 324, 154);
        texto(dc, 359, 149, fR, "SUBIDA", BRANCO, Graphics.TEXT_JUSTIFY_RIGHT);
        texto(dc, 359, 166, fV, mts.toString(), BRANCO, Graphics.TEXT_JUSTIFY_RIGHT);
        texto(dc, 339, 180, fU, unidadeMetrica ? "m" : "ft", CINZA_C, Graphics.TEXT_JUSTIFY_LEFT);
        if (!eco) { barra(dc, 280, 180, 64, 6, mts / 500.0, corDestaque); }
    }

    function hora(dc as Dc, agora) as Void {
        var hh = agora.hour;
        var ds = System.getDeviceSettings();
        if (!ds.is24Hour) {
            hh = hh % 12;
            if (hh == 0) { hh = 12; }
        }
        var txt = (ds.is24Hour ? hh.format("%02d") : hh.format("%d")) + ":" + agora.min.format("%02d");
        texto(dc, 195, 177, fH, txt, BRANCO, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function segundos(dc as Dc, sec) as Void {
        texto(dc, 274, 233, fT, sec.format("%02d"), CINZA_C, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function blocoEstresse(dc as Dc, am, eco) as Void {
        var s = null;
        if (am != null && am has :stressScore && am.stressScore != null) { s = am.stressScore; }
        icone(dc, :estresse, 30, 205);
        texto(dc, 50, 197, fR, "ESTRESSE", BRANCO, Graphics.TEXT_JUSTIFY_LEFT);
        texto(dc, 50, 214, fV, s == null ? "--" : s.toString(), BRANCO, Graphics.TEXT_JUSTIFY_LEFT);
        if (eco) { return; }
        var cores = [VERDE, AMARELO, LARANJA, corDestaque];
        var nivel = (s == null) ? -1 : ((s >= 76) ? 3 : ((s >= 51) ? 2 : ((s >= 26) ? 1 : 0)));
        var x = px(46);
        var lg = px(15);
        for (var i = 0; i < 4; i++) {
            dc.setColor(i <= nivel ? cores[i] : CINZA, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(x + i * (lg + px(1)), px(229), lg, px(6));
        }
    }

    function blocoIntensidade(dc as Dc, am, eco) as Void {
        var min = 0;
        var meta = 150;
        if (am != null && am.activeMinutesWeek != null && am.activeMinutesWeek.total != null) {
            min = am.activeMinutesWeek.total;
        }
        if (am != null && am.activeMinutesWeekGoal != null && am.activeMinutesWeekGoal > 0) {
            meta = am.activeMinutesWeekGoal;
        }
        icone(dc, :corredor, 323, 209);
        texto(dc, 359, 197, fR, "INTENSIDADE", BRANCO, Graphics.TEXT_JUSTIFY_RIGHT);
        texto(dc, 359, 214, fV, min.toString(), BRANCO, Graphics.TEXT_JUSTIFY_RIGHT);
        texto(dc, 341, 228, fU, "min", CINZA_C, Graphics.TEXT_JUSTIFY_LEFT);
        if (!eco) { barra(dc, 280, 229, 64, 6, min.toFloat() / meta, LARANJA); }
    }

    function blocoClima(dc as Dc) as Void {
        var cc = null;
        try { cc = Weather.getCurrentConditions(); } catch (e) { }
        var temp = null;
        var tmax = null;
        var tmin = null;
        var cond = null;
        if (cc != null) {
            temp = cc.temperature;
            if (cc has :highTemperature) { tmax = cc.highTemperature; }
            if (cc has :lowTemperature) { tmin = cc.lowTemperature; }
            cond = cc.condition;
        }
        if (!unidadeMetrica) {
            if (temp != null) { temp = (temp * 9 / 5.0 + 32).toNumber(); }
            if (tmax != null) { tmax = (tmax * 9 / 5.0 + 32).toNumber(); }
            if (tmin != null) { tmin = (tmin * 9 / 5.0 + 32).toNumber(); }
        }
        icone(dc, :clima, 149, 253);
        texto(dc, 176, 253, fC, (temp == null ? "--" : temp.toNumber().toString()) + "°",
              BRANCO, Graphics.TEXT_JUSTIFY_LEFT);
        dc.setColor(corDestaque, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon([[px(244), px(249)], [px(256), px(249)], [px(250), px(238)]]);
        texto(dc, 262, 244, fU, (tmax == null ? "--" : tmax.toNumber().toString()) + "°",
              BRANCO, Graphics.TEXT_JUSTIFY_LEFT);
        dc.setColor(AZUL, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon([[px(244), px(255)], [px(256), px(255)], [px(250), px(266)]]);
        texto(dc, 262, 260, fU, (tmin == null ? "--" : tmin.toNumber().toString()) + "°",
              BRANCO, Graphics.TEXT_JUSTIFY_LEFT);
        texto(dc, 199, 274, fU, nomeCondicao(cond), BRANCO, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function nomeCondicao(c) {
        if (c == null) { return "Sem previsão"; }
        if (c == Weather.CONDITION_CLEAR) { return "Céu limpo"; }
        if (c == Weather.CONDITION_PARTLY_CLOUDY || c == Weather.CONDITION_MOSTLY_CLEAR ||
            c == Weather.CONDITION_THIN_CLOUDS) { return "Parcialmente nublado"; }
        if (c == Weather.CONDITION_MOSTLY_CLOUDY || c == Weather.CONDITION_CLOUDY) { return "Nublado"; }
        if (c == Weather.CONDITION_RAIN || c == Weather.CONDITION_LIGHT_RAIN ||
            c == Weather.CONDITION_SCATTERED_SHOWERS || c == Weather.CONDITION_SHOWERS) { return "Chuva"; }
        if (c == Weather.CONDITION_HEAVY_RAIN || c == Weather.CONDITION_HEAVY_SHOWERS) { return "Chuva forte"; }
        if (c == Weather.CONDITION_THUNDERSTORMS || c == Weather.CONDITION_SCATTERED_THUNDERSTORMS) { return "Tempestade"; }
        if (c == Weather.CONDITION_SNOW || c == Weather.CONDITION_LIGHT_SNOW ||
            c == Weather.CONDITION_HEAVY_SNOW) { return "Neve"; }
        if (c == Weather.CONDITION_FOG || c == Weather.CONDITION_HAZY || c == Weather.CONDITION_MIST) { return "Névoa"; }
        if (c == Weather.CONDITION_WINDY) { return "Ventando"; }
        return "Tempo instável";
    }

    function blocoBodyBattery(dc as Dc) as Void {
        var bb = bodyBattery();
        icone(dc, :raio, 44, 262);
        texto(dc, 60, 247, fR, "BODY", BRANCO, Graphics.TEXT_JUSTIFY_LEFT);
        texto(dc, 60, 261, fR, "BATTERY", BRANCO, Graphics.TEXT_JUSTIFY_LEFT);
        texto(dc, 60, 278, fV, bb == null ? "--" : bb.toString(), BRANCO, Graphics.TEXT_JUSTIFY_LEFT);
        barra(dc, 46, 290, 64, 6, bb == null ? 0 : bb / 100.0, AZUL);
    }

    function bodyBattery() {
        try {
            if (Toybox has :Complications) {
                var id = new Complications.Id(Complications.COMPLICATION_TYPE_BODY_BATTERY);
                var c = Complications.getComplication(id);
                if (c != null && c.value != null) { return c.value.toNumber(); }
            }
        } catch (e) { }
        return null;
    }

    function blocoGps(dc as Dc) as Void {
        icone(dc, :pino, 307, 263);
        texto(dc, 322, 253, fR, "GPS", BRANCO, Graphics.TEXT_JUSTIFY_LEFT);
        icone(dc, :sinal, 337, 270);
        var nivel = 0;
        try {
            var info = Position.getInfo();
            if (info != null && info.accuracy != null) {
                if (info.accuracy == Position.QUALITY_GOOD) { nivel = 4; }
                else if (info.accuracy == Position.QUALITY_USABLE) { nivel = 3; }
                else if (info.accuracy == Position.QUALITY_POOR) { nivel = 2; }
            }
        } catch (e) { }
        if (nivel < 4) {
            // apaga as barrinhas sem sinal (o ícone vem cheio da arte) e redesenha em cinza
            dc.setColor(PRETO, PRETO);
            dc.fillRectangle(px(325) + nivel * px(6), px(258), px(26) - nivel * px(6), px(24));
            dc.setColor(CINZA, Graphics.COLOR_TRANSPARENT);
            for (var i = nivel; i < 4; i++) {
                var al = px(5 + i * 4);
                dc.fillRectangle(px(325) + i * px(6), px(282) - al, px(5), al);
            }
        }
    }

    function blocoSol(dc as Dc) as Void {
        var nasce = null;
        var poe = null;
        try {
            var info = Position.getInfo();
            if (info != null && info.position != null) {
                var hoje = Time.now();
                nasce = Weather.getSunrise(info.position, hoje);
                poe = Weather.getSunset(info.position, hoje);
            }
        } catch (e) { }
        icone(dc, :nascer, 106, 301);
        texto(dc, 115, 310, fU, "NASCER", BRANCO, Graphics.TEXT_JUSTIFY_CENTER);
        texto(dc, 112, 326, fV, hhmm(nasce), BRANCO, Graphics.TEXT_JUSTIFY_CENTER);
        icone(dc, :porsol, 283, 301);
        texto(dc, 284, 310, fU, "PÔR DO SOL", BRANCO, Graphics.TEXT_JUSTIFY_CENTER);
        texto(dc, 278, 326, fV, hhmm(poe), BRANCO, Graphics.TEXT_JUSTIFY_CENTER);

        var ds = System.getDeviceSettings();
        icone(dc, :mensagem, 172, 312);
        var n = (ds.notificationCount != null) ? ds.notificationCount : 0;
        if (n > 0) {
            dc.setColor(corDestaque, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(px(183), px(303), px(8));
            texto(dc, 183, 303, fZ, n > 9 ? "9+" : n.toString(), BRANCO, Graphics.TEXT_JUSTIFY_CENTER);
        }
        icone(dc, :alarme, 224, 306);
        var a = (ds.alarmCount != null) ? ds.alarmCount : 0;
        texto(dc, 223, 322, fV, a > 0 ? a.toString() : "--", BRANCO, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function hhmm(momento) {
        if (momento == null) { return "--:--"; }
        var i = Gregorian.info(momento, Time.FORMAT_SHORT);
        return i.hour.format("%02d") + ":" + i.min.format("%02d");
    }

    function blocoRodape(dc as Dc) as Void {
        var ds = System.getDeviceSettings();
        var conectado = (ds.phoneConnected != null) ? ds.phoneConnected : false;
        if (conectado) {
            icone(dc, :bluetooth, 166, 356);
            icone(dc, :celular, 195, 356);
        }
        var dnd = (ds has :doNotDisturb && ds.doNotDisturb != null) ? ds.doNotDisturb : false;
        if (dnd) { icone(dc, :lua, 222, 356); }
    }

    // ======================================================================
    //  PRIMITIVAS
    // ======================================================================
    function icone(dc as Dc, nome, x, y) as Void {
        if (ic == null) { return; }
        var b = ic[nome];
        if (b == null) { return; }
        dc.drawBitmap(px(x) - b.getWidth() / 2, px(y) - b.getHeight() / 2, b);
    }

    function texto(dc as Dc, x, y, fonte, txt, cor, just) as Void {
        dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(px(x), px(y), fonte, txt, just | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    function barra(dc as Dc, x, y, lg, al, frac, cor) as Void {
        if (frac == null || frac < 0) { frac = 0; }
        if (frac > 1) { frac = 1; }
        var X = px(x);
        var Y = px(y);
        var L = px(lg);
        var A = px(al);
        dc.setColor(CINZA, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(X, Y, L, A, A / 2);
        if (frac > 0) {
            dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
            var c = (L * frac).toNumber();
            if (c < A) { c = A; }
            dc.fillRoundedRectangle(X, Y, c, A, A / 2);
        }
    }
}
