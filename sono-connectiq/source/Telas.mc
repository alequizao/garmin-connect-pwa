/*
 * Sono Alequizão (Connect IQ) · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * Telas do app. Cima/Baixo troca de página, OK recalcula, Voltar sai.
 * As cores usam só a paleta de 8 cores do Forerunner 55, para ficar igual nos dois relógios.
 */
import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

module Cor {
    const FUNDO = Graphics.COLOR_BLACK;
    const TEXTO = Graphics.COLOR_WHITE;
    const PROFUNDO = Graphics.COLOR_BLUE;
    const LEVE = 0x00FFFF;          // ciano (está na paleta de 8 cores do FR55)
    const REM = 0xFF00FF;           // magenta
    const ACORDADO = Graphics.COLOR_RED;
    const BOM = Graphics.COLOR_GREEN;
    const MEDIO = Graphics.COLOR_YELLOW;

    function daFase(f) {
        if (f == Analise.PROFUNDO) { return PROFUNDO; }
        if (f == Analise.REM) { return REM; }
        if (f == Analise.ACORDADO) { return ACORDADO; }
        return LEVE;
    }

    function daNota(n) {
        if (n >= 80) { return BOM; }
        if (n >= 60) { return MEDIO; }
        return ACORDADO;
    }
}

const PAGINAS = 10;

class TelaView extends WatchUi.View {
    var pagina = 0;
    var rolagem = 0;    // usada só na tela Sobre, que tem mais linhas do que cabem

    function initialize() { View.initialize(); }

    function onUpdate(dc) {
        dc.setColor(Cor.TEXTO, Cor.FUNDO);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();

        if (Sono.noite == null && pagina != 0 && pagina != 8 && pagina != 9) {
            semDados(dc, w, h);
            return;
        }
        if (pagina == 0) { pRelatorio(dc, w, h); }
        else if (pagina == 1) { pPontuacao(dc, w, h); }
        else if (pagina == 2) { pFatores(dc, w, h); }
        else if (pagina == 3) { pEstagios(dc, w, h); }
        else if (pagina == 4) { pHipnograma(dc, w, h); }
        else if (pagina == 5) { pCardiaca(dc, w, h); }
        else if (pagina == 6) { pEstresse(dc, w, h); }
        else if (pagina == 7) { pBodyBattery(dc, w, h); }
        else if (pagina == 8) { pHistorico(dc, w, h); }
        else { pSobre(dc, w, h); }
        pontinhos(dc, w, h);
    }

    // ---------- enfeites comuns ----------

    // bolinhas laterais mostrando em que página está
    function pontinhos(dc, w, h) {
        var r = w > 260 ? 4 : 3;
        var esp = w > 260 ? 14 : 10;
        var y0 = h / 2 - (PAGINAS - 1) * esp / 2;
        for (var i = 0; i < PAGINAS; i++) {
            dc.setColor(i == pagina ? Cor.TEXTO : Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(w - r - 3, y0 + i * esp, i == pagina ? r : r - 1);
        }
    }

    function titulo(dc, w, txt) {
        dc.setColor(Cor.LEVE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, w > 260 ? 22 : 12, Graphics.FONT_XTINY, txt, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function semDados(dc, w, h) {
        dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h / 2, Graphics.FONT_XTINY,
            Sono.erro != null ? Sono.erro : "Sem dados", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // ---------- 0. relatório matinal (o "Bom dia" que o FR55 não tem) ----------
    function pRelatorio(dc, w, h) {
        var n = Sono.noite;
        var g = w > 260;
        dc.setColor(Cor.LEVE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, g ? 30 : 16, g ? Graphics.FONT_SMALL : Graphics.FONT_XTINY,
            Analise.saudacao(), Graphics.TEXT_JUSTIFY_CENTER);
        var y = g ? 70 : 40;
        if (n != null) {
            dc.setColor(Cor.daNota(n["nota"]), Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, y, Graphics.FONT_NUMBER_MEDIUM, n["nota"].format("%d"), Graphics.TEXT_JUSTIFY_CENTER);
            var yl = y + (g ? 76 : 44);
            dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, yl, g ? Graphics.FONT_SMALL : Graphics.FONT_XTINY,
                Sono.hm(n["tot"]) + " de sono", Graphics.TEXT_JUSTIFY_CENTER);
            var bb = Analise.bbAgora();
            if (bb != null) {
                dc.setColor(Cor.BOM, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, yl + (g ? 30 : 18), Graphics.FONT_XTINY,
                    "Body Battery " + bb.format("%d"), Graphics.TEXT_JUSTIFY_CENTER);
            }
            dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, yl + (g ? 62 : 38), Graphics.FONT_XTINY,
                Analise.recado(n), Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h / 2, Graphics.FONT_XTINY, Analise.recado(null),
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    // ---------- 1. pontuação ----------
    function pPontuacao(dc, w, h) {
        var n = Sono.noite;
        // o arco fecha por cima, então o centro desce um pouco e a data vai para a
        // abertura de baixo — assim nada fica escrito por trás do arco
        var raio = (w < h ? w : h) / 2 - (w > 260 ? 30 : 18);
        var cx = w / 2;
        var cy = h / 2 + (w > 260 ? 16 : 9);
        var esp = w > 260 ? 16 : 9;
        dc.setPenWidth(esp);
        // trilho
        dc.setColor(Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.drawArc(cx, cy, raio, Graphics.ARC_CLOCKWISE, 210, 330);
        // preenchido conforme a nota
        var grau = 240 * n["nota"] / 100;
        if (grau > 0) {
            dc.setColor(Cor.daNota(n["nota"]), Graphics.COLOR_TRANSPARENT);
            dc.drawArc(cx, cy, raio, Graphics.ARC_CLOCKWISE, 210, 210 - grau + 360);
        }
        dc.setPenWidth(1);

        dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy - (w > 260 ? 66 : 38), Graphics.FONT_NUMBER_MEDIUM, n["nota"].format("%d"), Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Cor.daNota(n["nota"]), Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + (w > 260 ? 12 : 6), Graphics.FONT_XTINY, Analise.qualidade(n["nota"]), Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + (w > 260 ? 44 : 26), Graphics.FONT_SMALL, Sono.hm(n["tot"]), Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Cor.LEVE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + (w > 260 ? 74 : 46), Graphics.FONT_XTINY,
            Sono.hora(n["ini"]) + " - " + Sono.hora(n["fim"]), Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + (w > 260 ? 104 : 64), Graphics.FONT_XTINY,
            Sono.dataCurta(n["dia"]), Graphics.TEXT_JUSTIFY_CENTER);
    }

    // ---------- 2. fatores da pontuação (igual ao detalhamento do FR165) ----------
    function pFatores(dc, w, h) {
        var n = Sono.noite;
        titulo(dc, w, "Fatores");
        var fs = Analise.fatores(n);
        var g = w > 260;
        var m = g ? 34 : 16;
        var y = g ? 60 : 34;
        var lh = g ? 44 : 26;
        var larg = w - 2 * m;
        for (var i = 0; i < fs.size(); i++) {
            var nome = fs[i][0];
            var p = fs[i][1];
            var mx = fs[i][2];
            var q = Analise.qualFator(p, mx);
            var c = q.equals("Bom") ? Cor.BOM : (q.equals("Razoável") ? Cor.MEDIO : Cor.ACORDADO);
            dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(m, y + i * lh, Graphics.FONT_XTINY, nome, Graphics.TEXT_JUSTIFY_LEFT);
            dc.setColor(c, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w - m, y + i * lh, Graphics.FONT_XTINY, q, Graphics.TEXT_JUSTIFY_RIGHT);
            // barrinha do quanto rendeu
            var bw = (larg * p / mx).toNumber();
            if (bw < 1) { bw = 1; }
            dc.fillRectangle(m, y + i * lh + (g ? 26 : 15), bw, g ? 5 : 3);
            dc.setColor(Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(m + bw, y + i * lh + (g ? 26 : 15), larg - bw, g ? 5 : 3);
        }
    }

    // ---------- 2. estágios ----------
    function pEstagios(dc, w, h) {
        var n = Sono.noite;
        titulo(dc, w, "Estágios");
        var m = w > 260 ? 40 : 22;
        var y = w > 260 ? 58 : 32;
        var alt = w > 260 ? 26 : 16;
        var larg = w - 2 * m;
        var tot = n["tot"] + n["aco"];
        // barra empilhada
        var x = m;
        var partes = [[n["pro"], Cor.PROFUNDO], [n["lev"], Cor.LEVE], [n["rem"], Cor.REM], [n["aco"], Cor.ACORDADO]];
        for (var i = 0; i < 4; i++) {
            var p = larg * partes[i][0] / tot;
            if (p > 0) {
                dc.setColor(partes[i][1], Graphics.COLOR_TRANSPARENT);
                dc.fillRectangle(x, y, p, alt);
                x += p;
            }
        }
        // lista
        var nomes = ["Profundo", "Leve", "REM", "Acordado"];
        var ly = y + alt + (w > 260 ? 16 : 8);
        var lh = w > 260 ? 34 : 20;
        var fonte = w > 260 ? Graphics.FONT_SMALL : Graphics.FONT_XTINY;
        for (var i = 0; i < 4; i++) {
            dc.setColor(partes[i][1], Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(m, ly + i * lh + (w > 260 ? 10 : 5), w > 260 ? 14 : 8, w > 260 ? 14 : 8);
            dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(m + (w > 260 ? 22 : 13), ly + i * lh, fonte, nomes[i], Graphics.TEXT_JUSTIFY_LEFT);
            dc.drawText(w - m, ly + i * lh, fonte,
                Sono.hm(partes[i][0]) + "  " + Sono.pct(partes[i][0], tot).format("%d") + "%", Graphics.TEXT_JUSTIFY_RIGHT);
        }
    }

    // ---------- 3. hipnograma ----------
    function pHipnograma(dc, w, h) {
        var n = Sono.noite;
        titulo(dc, w, "A noite");
        var f = n["fases"];
        var m = w > 260 ? 34 : 16;
        var larg = w - 2 * m;
        var topo = w > 260 ? 66 : 38;
        var alt = w > 260 ? 34 : 20;       // altura de cada faixa
        var ordem = [Analise.ACORDADO, Analise.REM, Analise.LEVE, Analise.PROFUNDO];
        var nomes = ["Acor", "REM", "Leve", "Prof"];
        var fonteP = Graphics.FONT_XTINY;
        // linhas de base
        for (var l = 0; l < 4; l++) {
            dc.setColor(Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
            dc.drawLine(m, topo + l * alt + alt - 1, w - m, topo + l * alt + alt - 1);
        }
        // blocos
        if (f != null && f.size() > 0) {
            var pw = larg * 1.0 / f.size();
            for (var i = 0; i < f.size(); i++) {
                var l = 0;
                for (var k = 0; k < 4; k++) { if (ordem[k] == f[i]) { l = k; } }
                dc.setColor(Cor.daFase(f[i]), Graphics.COLOR_TRANSPARENT);
                var x = m + (i * pw).toNumber();
                var lw = ((i + 1) * pw).toNumber() - (i * pw).toNumber();
                if (lw < 1) { lw = 1; }
                dc.fillRectangle(x, topo + l * alt + 3, lw, alt - 5);
            }
        }
        // rótulos das faixas
        dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        for (var l = 0; l < 4; l++) {
            dc.drawText(m - 2, topo + l * alt - 2, fonteP, nomes[l], Graphics.TEXT_JUSTIFY_RIGHT);
        }
        dc.setColor(Cor.LEVE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(m, topo + 4 * alt + 2, fonteP, Sono.hora(n["ini"]), Graphics.TEXT_JUSTIFY_LEFT);
        dc.drawText(w - m, topo + 4 * alt + 2, fonteP, Sono.hora(n["fim"]), Graphics.TEXT_JUSTIFY_RIGHT);
    }

    // ---------- gráficos de série ----------
    // Desenha o gráfico de uma grandeza ao longo da noite, reconstruída a partir das fases.
    function grafico(dc, w, h, tit, serie, cor, minY, maxY, rodape) {
        titulo(dc, w, tit);
        var m = w > 260 ? 34 : 16;
        var larg = w - 2 * m;
        var topo = w > 260 ? 70 : 40;
        var alt = w > 260 ? 130 : 78;
        dc.setColor(Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(m, topo + alt, w - m, topo + alt);
        if (serie == null || serie.size() < 2 || maxY <= minY) {
            dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, topo + alt / 2, Graphics.FONT_XTINY, "sem dados", Graphics.TEXT_JUSTIFY_CENTER);
            return;
        }
        dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
        var pw = larg * 1.0 / serie.size();
        for (var i = 0; i < serie.size(); i++) {
            if (serie[i] == null) { continue; }
            var v = serie[i];
            if (v < minY) { v = minY; }
            if (v > maxY) { v = maxY; }
            var bh = ((v - minY) * alt / (maxY - minY)).toNumber();
            if (bh < 1) { bh = 1; }
            var x = m + (i * pw).toNumber();
            var lw = ((i + 1) * pw).toNumber() - (i * pw).toNumber();
            if (lw < 1) { lw = 1; }
            dc.fillRectangle(x, topo + alt - bh, lw, bh);
        }
        dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, topo + alt + (w > 260 ? 8 : 4), w > 260 ? Graphics.FONT_SMALL : Graphics.FONT_XTINY,
            rodape, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function pCardiaca(dc, w, h) {
        var n = Sono.noite;
        var s = Sono.serieNoite("fc");
        var rod = "méd " + (n["fc"] != null ? n["fc"].format("%d") : "--") + "  mín " +
                  (n["fcm"] != null ? n["fcm"].format("%d") : "--") + " bpm";
        grafico(dc, w, h, "Frequência cardíaca", s, Cor.ACORDADO,
                n["fcm"] != null ? n["fcm"] - 4 : 40, n["fcx"] != null ? n["fcx"] + 2 : 100, rod);
        dc.setColor(Cor.LEVE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h - (w > 260 ? 44 : 26), Graphics.FONT_XTINY,
            "repouso " + (n["fcr"] != null ? n["fcr"].format("%d") : "--"), Graphics.TEXT_JUSTIFY_CENTER);
    }

    function pEstresse(dc, w, h) {
        var n = Sono.noite;
        var rod = "média " + (n["est"] != null ? n["est"].format("%d") : "--");
        grafico(dc, w, h, "Estresse", Sono.serieNoite("est"), Cor.MEDIO, 0, 60, rod);
    }

    function pBodyBattery(dc, w, h) {
        var n = Sono.noite;
        titulo(dc, w, "Body Battery");
        var ganho = (n["bb0"] != null && n["bb1"] != null) ? n["bb1"] - n["bb0"] : null;
        var cy = h / 2;
        dc.setColor(ganho != null && ganho > 0 ? Cor.BOM : Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, cy - (w > 260 ? 50 : 30), Graphics.FONT_NUMBER_MEDIUM,
            ganho == null ? "--" : (ganho > 0 ? "+" : "") + ganho.format("%d"), Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, cy + (w > 260 ? 18 : 10), Graphics.FONT_XTINY, "recarga da noite", Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Cor.LEVE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, cy + (w > 260 ? 50 : 30), Graphics.FONT_XTINY,
            (n["bb0"] != null ? n["bb0"].format("%d") : "--") + " → " + (n["bb1"] != null ? n["bb1"].format("%d") : "--"),
            Graphics.TEXT_JUSTIFY_CENTER);
    }

    // ---------- 7. histórico ----------
    function pHistorico(dc, w, h) {
        titulo(dc, w, "Últimos dias");
        var hs = Sono.hist;
        if (hs.size() == 0) {
            dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h / 2, Graphics.FONT_XTINY, "ainda sem histórico", Graphics.TEXT_JUSTIFY_CENTER);
            return;
        }
        var qt = hs.size() < 7 ? hs.size() : 7;
        var m = w > 260 ? 40 : 20;
        var larg = w - 2 * m;
        var topo = w > 260 ? 66 : 38;
        var alt = w > 260 ? 110 : 66;
        var bw = larg / qt;
        var alvo = Analise.necessidade();
        // linha da meta
        var ym = topo + alt - alt * 3 / 4;
        dc.setColor(Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(m, ym, w - m, ym);
        for (var i = 0; i < qt; i++) {
            var x = hs[qt - 1 - i];     // mais antigo à esquerda
            var frac = x["tot"] * 1.0 / (alvo * 4.0 / 3.0);
            if (frac > 1.0) { frac = 1.0; }
            var bh = (alt * frac).toNumber();
            if (bh < 2) { bh = 2; }
            dc.setColor(Cor.daNota(x["nota"]), Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(m + i * bw + 2, topo + alt - bh, bw - 4, bh);
            dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(m + i * bw + bw / 2, topo + alt + 2, Graphics.FONT_XTINY,
                ((x["dia"] % 100)).format("%d"), Graphics.TEXT_JUSTIFY_CENTER);
        }
        var mn = Sono.mediaNota();
        var mt = Sono.mediaTotal();
        dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h - (w > 260 ? 60 : 36), w > 260 ? Graphics.FONT_SMALL : Graphics.FONT_XTINY,
            "média " + Sono.hm(mt) + " · " + (mn != null ? mn.format("%d") : "--"), Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Cor.LEVE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h - (w > 260 ? 34 : 20), Graphics.FONT_XTINY,
            hs.size().format("%d") + " noites guardadas", Graphics.TEXT_JUSTIFY_CENTER);
    }

    // ---------- 8. sobre ----------
    function pSobre(dc, w, h) {
        titulo(dc, w, "Sono " + Sono.VERSAO);
        var fonte = Graphics.FONT_XTINY;
        var y = w > 260 ? 88 : 52;
        var lh = w > 260 ? 26 : 16;
        var linhas = ["100% offline", "O relógio lê e calcula", "sozinho, sem internet.",
                      "", "Cima/Baixo: páginas", "OK: recalcular", "",
                      "Desenvolvedor", "Alequizao", "@alequizao", "+55 82 98871-7072", "alequizao.dev@gmail.com", "alequizao.com", "github.com/alequizao", "© 2026 Alequizao"];
        // a lista não cabe numa tela só: rola com as páginas de baixo
        var cabem = ((h - y - lh) / lh).toNumber();
        if (cabem < 3) { cabem = 3; }
        if (rolagem > linhas.size() - cabem) { rolagem = 0; }
        if (rolagem < 0) { rolagem = 0; }
        dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        for (var i = 0; i < cabem && (i + rolagem) < linhas.size(); i++) {
            var t = linhas[i + rolagem];
            dc.setColor(t.equals("Desenvolvedor") ? Cor.LEVE : Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, y + i * lh, fonte, t, Graphics.TEXT_JUSTIFY_CENTER);
        }
        if (rolagem + cabem < linhas.size()) {
            dc.setColor(Cor.LEVE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h - lh - 2, fonte, "OK ↓", Graphics.TEXT_JUSTIFY_CENTER);
        }
    }
}

class TelaDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }

    function trocar(d) {
        var v = WatchUi.getCurrentView()[0];
        if (v instanceof TelaView) {
            v.pagina = (v.pagina + d + PAGINAS) % PAGINAS;
            v.rolagem = 0;
            WatchUi.requestUpdate();
        }
        return true;
    }

    function onNextPage() { return trocar(1); }
    function onPreviousPage() { return trocar(-1); }

    function onSelect() {
        var v = WatchUi.getCurrentView()[0];
        if (v instanceof TelaView && v.pagina == PAGINAS - 1) {
            v.rolagem += 3;            // na tela Sobre, OK rola o texto
        } else {
            Sono.analisar();
        }
        WatchUi.requestUpdate();
        return true;
    }
}
