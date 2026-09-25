/*
 * Força Alequizão · telas
 *
 * Só usa a paleta de 8 cores do Forerunner 55, para ficar igual nos dois relógios.
 * Tela inicial: START começa o treino, MENU abre as opções.
 * No treino: START fecha a série, CIMA/BAIXO corrigem as repetições,
 * MENU abre o menu do treino e VOLTAR pausa.
 */
import Toybox.Activity;
import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

module Cor {
    const FUNDO = Graphics.COLOR_BLACK;
    const TEXTO = Graphics.COLOR_WHITE;
    const DESTAQUE = 0x00FFFF;          // ciano
    const BOM = Graphics.COLOR_GREEN;
    const ATENCAO = Graphics.COLOR_YELLOW;
    const FORTE = Graphics.COLOR_RED;
    const SUAVE = Graphics.COLOR_BLUE;
}

function grande(dc) { return dc.getWidth() > 260; }

// escreve um texto cortando no tamanho que cabe na tela
function texto(dc, x, y, fonte, txt, just) {
    dc.drawText(x, y, fonte, txt, just);
}

// ---------------------------------------------------------------- tela inicial
class InicioView extends WatchUi.View {
    function initialize() { View.initialize(); }

    function onUpdate(dc) {
        dc.setColor(Cor.TEXTO, Cor.FUNDO);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var g = grande(dc);

        dc.setColor(Cor.DESTAQUE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, g ? 34 : 22, g ? Graphics.FONT_MEDIUM : Graphics.FONT_SMALL, "FORÇA", Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, g ? 76 : 54, Graphics.FONT_XTINY, Forca.nomeEx(), Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Cor.ATENCAO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, g ? 102 : 76, Graphics.FONT_XTINY, Forca.peso.format("%d") + " kg · descanso " + Forca.descansoSeg.format("%d") + "s", Graphics.TEXT_JUSTIFY_CENTER);

        if (Forca.hist.size() > 0 && Forca.hist[0] instanceof Lang.Dictionary && Forca.hist[0]["reps"] != null) {
            var u = Forca.hist[0];
            dc.setColor(Cor.SUAVE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, g ? 132 : 100, Graphics.FONT_XTINY, "Último " + Forca.dataCurta(u["dia"]), Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, g ? 154 : 118, Graphics.FONT_XTINY,
                u["series"].format("%d") + " séries · " + u["reps"].format("%d") + " reps", Graphics.TEXT_JUSTIFY_CENTER);
        }

        dc.setColor(Cor.BOM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h - (g ? 64 : 48), Graphics.FONT_XTINY, "START para começar", Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h - (g ? 42 : 30), Graphics.FONT_XTINY, "MENU = opções", Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class InicioDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }

    function onSelect() {
        Forca.iniciar();
        WatchUi.pushView(new TreinoView(), new TreinoDelegate(), WatchUi.SLIDE_LEFT);
        return true;
    }

    function onMenu() {
        WatchUi.pushView(menuPrincipal(), new MenuPrincipalDelegate(), WatchUi.SLIDE_UP);
        return true;
    }
}

// ---------------------------------------------------------------- menu inicial
function menuPrincipal() {
    var m = new WatchUi.Menu2({ :title => "Força" });
    m.addItem(new WatchUi.MenuItem("Iniciar treino", null, :iniciar, {}));
    m.addItem(new WatchUi.MenuItem("Exercício", Forca.nomeEx(), :exercicio, {}));
    m.addItem(new WatchUi.MenuItem("Peso", Forca.peso.format("%d") + " kg", :peso, {}));
    m.addItem(new WatchUi.MenuItem("Descanso", Forca.descansoSeg.format("%d") + " s", :descanso, {}));
    m.addItem(new WatchUi.MenuItem("Série automática", Forca.autoSerie ? "ligada" : "desligada", :auto, {}));
    m.addItem(new WatchUi.MenuItem("Sensibilidade", ["baixa", "normal", "alta"][Contador.sensivel], :sens, {}));
    m.addItem(new WatchUi.MenuItem("Vibrar", Forca.vibrar ? "sim" : "não", :vibrar, {}));
    m.addItem(new WatchUi.MenuItem("Histórico", Forca.hist.size().format("%d") + " treinos", :hist, {}));
    m.addItem(new WatchUi.MenuItem("Sobre", null, :sobre, {}));
    return m;
}

class MenuPrincipalDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() { Menu2InputDelegate.initialize(); }

    function onSelect(item) {
        var id = item.getId();
        if (id == :iniciar) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            Forca.iniciar();
            WatchUi.pushView(new TreinoView(), new TreinoDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :exercicio) {
            WatchUi.pushView(menuExercicios(), new MenuExerciciosDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :peso) {
            WatchUi.pushView(new NumeroView("Peso", "kg", Forca.peso, 1, 0, 300, :peso), new NumeroDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :descanso) {
            WatchUi.pushView(new NumeroView("Descanso", "s", Forca.descansoSeg, 15, 0, 600, :descanso), new NumeroDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :auto) {
            Forca.autoSerie = !Forca.autoSerie;
            item.setSubLabel(Forca.autoSerie ? "ligada" : "desligada");
            Forca.salvarAjustes();
            WatchUi.requestUpdate();
        } else if (id == :sens) {
            Contador.sensivel = (Contador.sensivel + 1) % 3;
            Contador.limiar = Contador.limiarAtual();
            Application.Storage.setValue("sens", Contador.sensivel);
            item.setSubLabel(["baixa", "normal", "alta"][Contador.sensivel]);
            WatchUi.requestUpdate();
        } else if (id == :vibrar) {
            Forca.vibrar = !Forca.vibrar;
            item.setSubLabel(Forca.vibrar ? "sim" : "não");
            Forca.salvarAjustes();
            WatchUi.requestUpdate();
        } else if (id == :hist) {
            WatchUi.pushView(new HistoricoView(), new HistoricoDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :sobre) {
            WatchUi.pushView(new SobreView(), new SobreDelegate(), WatchUi.SLIDE_LEFT);
        }
        return true;
    }
}

// ------------------------------------------------------------ menu exercícios
function menuExercicios() {
    var m = new WatchUi.Menu2({ :title => "Exercício" });
    for (var i = 0; i < Forca.EXERCICIOS.size(); i++) {
        m.addItem(new WatchUi.MenuItem(Forca.EXERCICIOS[i], i == Forca.exercicio ? "atual" : null, i, {}));
    }
    return m;
}

class MenuExerciciosDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() { Menu2InputDelegate.initialize(); }

    function onSelect(item) {
        Forca.exercicio = item.getId();
        Forca.salvarAjustes();
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        WatchUi.requestUpdate();
        return true;
    }
}

// ----------------------------------------------------------- escolher número
class NumeroView extends WatchUi.View {
    var titulo; var unidade; var valor; var passo; var minimo; var maximo; var alvo;

    function initialize(t, u, v, p, mi, ma, a) {
        View.initialize();
        titulo = t; unidade = u; valor = v; passo = p; minimo = mi; maximo = ma; alvo = a;
        Vista.numero = self;
    }

    function mais() { valor += passo; if (valor > maximo) { valor = maximo; } WatchUi.requestUpdate(); }
    function menos() { valor -= passo; if (valor < minimo) { valor = minimo; } WatchUi.requestUpdate(); }

    function aplicar() {
        if (alvo == :peso) { Forca.peso = valor; }
        else if (alvo == :descanso) { Forca.descansoSeg = valor; }
        else if (alvo == :reps) { Forca.reps = valor; }
        Forca.salvarAjustes();
    }

    function onUpdate(dc) {
        dc.setColor(Cor.TEXTO, Cor.FUNDO);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var g = grande(dc);
        dc.setColor(Cor.DESTAQUE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, g ? 40 : 26, Graphics.FONT_XTINY, titulo, Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h / 2, Graphics.FONT_NUMBER_MEDIUM, valor.format("%d"),
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText(w / 2, h / 2 + (g ? 56 : 42), Graphics.FONT_XTINY, unidade, Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Cor.BOM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h - (g ? 46 : 34), Graphics.FONT_XTINY, "↑ ↓ ajusta · START salva", Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class NumeroDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }

    function onKey(evt) {
        var k = evt.getKey();
        var v = Vista.numero;
        if (v == null) { return false; }
        if (k == WatchUi.KEY_UP) { v.mais(); return true; }
        if (k == WatchUi.KEY_DOWN) { v.menos(); return true; }
        return false;
    }

    function onNextPage() { if (Vista.numero != null) { Vista.numero.menos(); } return true; }
    function onPreviousPage() { if (Vista.numero != null) { Vista.numero.mais(); } return true; }

    function onSelect() {
        if (Vista.numero != null) { Vista.numero.aplicar(); }
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        WatchUi.requestUpdate();
        return true;
    }
}

// guarda a tela de número que está aberta (o delegate precisa dela)
module Vista {
    var numero = null;
    var hist = null;
}

// ---------------------------------------------------------------- tela do treino
class TreinoView extends WatchUi.View {
    var tempo1s = null;

    function initialize() { View.initialize(); }

    function onShow() {
        if (tempo1s == null) {
            tempo1s = new Timer.Timer();
            tempo1s.start(method(:tique), 1000, true);
        }
    }

    function onHide() {
        if (tempo1s != null) { tempo1s.stop(); tempo1s = null; }
    }

    function tique() {
        if (Contador.fecharPendente && Forca.estado == Forca.SERIE) {
            Contador.fecharPendente = false;
            Forca.fecharSerie();
        }
        if (Forca.estado == Forca.DESCANSO) {
            Forca.descansoResta--;
            if (Forca.descansoResta <= 0) {
                Forca.aviso(4);
                Forca.proximaSerie(false);
            }
        }
        WatchUi.requestUpdate();
    }

    function onUpdate(dc) {
        dc.setColor(Cor.TEXTO, Cor.FUNDO);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var g = grande(dc);

        // exercício e número da série
        dc.setColor(Cor.DESTAQUE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, g ? 24 : 14, Graphics.FONT_XTINY, Forca.nomeEx(), Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, g ? 48 : 34, Graphics.FONT_XTINY,
            "Série " + (Forca.serieNum + 1).format("%d") + " · " + Forca.peso.format("%d") + " kg",
            Graphics.TEXT_JUSTIFY_CENTER);

        if (Forca.estado == Forca.DESCANSO) {
            dc.setColor(Cor.ATENCAO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h / 2 - (g ? 6 : 4), Graphics.FONT_NUMBER_MEDIUM, Forca.tempo(Forca.descansoResta),
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h / 2 + (g ? 52 : 38), Graphics.FONT_XTINY, "DESCANSO", Graphics.TEXT_JUSTIFY_CENTER);
            arco(dc, w, h, Forca.descansoSeg > 0 ? 100 * Forca.descansoResta / Forca.descansoSeg : 0, Cor.ATENCAO);
        } else if (Forca.estado == Forca.PAUSADO) {
            dc.setColor(Cor.FORTE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h / 2, Graphics.FONT_MEDIUM, "PAUSADO",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h / 2 + (g ? 48 : 34), Graphics.FONT_XTINY, "START retoma", Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            dc.setColor(Cor.BOM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h / 2 - (g ? 6 : 4), Graphics.FONT_NUMBER_HOT, Forca.reps.format("%d"),
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h / 2 + (g ? 56 : 40), Graphics.FONT_XTINY, "repetições", Graphics.TEXT_JUSTIFY_CENTER);
        }

        // rodapé: FC · tempo · total de reps
        var f = Forca.fc();
        dc.setColor(Cor.FORTE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2 - (g ? 68 : 52), h - (g ? 44 : 32), Graphics.FONT_XTINY,
            f == null ? "--" : f.format("%d"), Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h - (g ? 44 : 32), Graphics.FONT_XTINY, Forca.tempo(Forca.duracao()), Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Cor.DESTAQUE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2 + (g ? 68 : 52), h - (g ? 44 : 32), Graphics.FONT_XTINY,
            Forca.totalReps.format("%d"), Graphics.TEXT_JUSTIFY_CENTER);
    }

    // anel de progresso do descanso
    function arco(dc, w, h, pct, cor) {
        if (pct < 0) { pct = 0; }
        if (pct > 100) { pct = 100; }
        dc.setPenWidth(6);
        dc.setColor(Cor.SUAVE, Graphics.COLOR_TRANSPARENT);
        dc.drawCircle(w / 2, h / 2, w / 2 - 5);
        if (pct > 0) {
            dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
            dc.drawArc(w / 2, h / 2, w / 2 - 5, Graphics.ARC_CLOCKWISE, 90, 90 - (359 * pct / 100));
        }
        dc.setPenWidth(1);
    }
}

class TreinoDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }

    // START: fecha a série, pula o descanso ou retoma a pausa
    function onSelect() {
        if (Forca.estado == Forca.SERIE) { Forca.fecharSerie(); }
        else if (Forca.estado == Forca.DESCANSO) { Forca.proximaSerie(true); }
        else if (Forca.estado == Forca.PAUSADO) { Forca.retomar(); }
        WatchUi.requestUpdate();
        return true;
    }

    function onNextPage() { return ajusta(-1); }
    function onPreviousPage() { return ajusta(1); }

    function onKey(evt) {
        var k = evt.getKey();
        if (k == WatchUi.KEY_UP) { return ajusta(1); }
        if (k == WatchUi.KEY_DOWN) { return ajusta(-1); }
        return false;
    }

    // corrige a contagem na mão, ou muda o tempo de descanso
    function ajusta(d) {
        if (Forca.estado == Forca.DESCANSO) {
            Forca.descansoResta += d * 15;
            if (Forca.descansoResta < 1) { Forca.descansoResta = 1; }
        } else {
            Forca.reps += d;
            if (Forca.reps < 0) { Forca.reps = 0; }
        }
        WatchUi.requestUpdate();
        return true;
    }

    function onMenu() {
        WatchUi.pushView(menuTreino(), new MenuTreinoDelegate(), WatchUi.SLIDE_UP);
        return true;
    }

    // VOLTAR pausa; pausado, VOLTAR abre o menu para encerrar
    function onBack() {
        if (Forca.estado == Forca.SERIE || Forca.estado == Forca.DESCANSO) {
            Forca.pausar();
            WatchUi.requestUpdate();
        } else {
            WatchUi.pushView(menuTreino(), new MenuTreinoDelegate(), WatchUi.SLIDE_UP);
        }
        return true;
    }
}

// ------------------------------------------------------------- menu do treino
function menuTreino() {
    var m = new WatchUi.Menu2({ :title => "Treino" });
    m.addItem(new WatchUi.MenuItem("Voltar ao treino", null, :voltar, {}));
    m.addItem(new WatchUi.MenuItem("Trocar exercício", Forca.nomeEx(), :exercicio, {}));
    m.addItem(new WatchUi.MenuItem("Peso", Forca.peso.format("%d") + " kg", :peso, {}));
    m.addItem(new WatchUi.MenuItem("Repetições", Forca.reps.format("%d"), :reps, {}));
    m.addItem(new WatchUi.MenuItem("Descanso", Forca.descansoSeg.format("%d") + " s", :descanso, {}));
    m.addItem(new WatchUi.MenuItem("Salvar e encerrar", null, :salvar, {}));
    m.addItem(new WatchUi.MenuItem("Descartar treino", null, :descartar, {}));
    return m;
}

class MenuTreinoDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() { Menu2InputDelegate.initialize(); }

    function onSelect(item) {
        var id = item.getId();
        if (id == :voltar) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
        } else if (id == :exercicio) {
            WatchUi.pushView(menuExercicios(), new MenuExerciciosDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :peso) {
            WatchUi.pushView(new NumeroView("Peso", "kg", Forca.peso, 1, 0, 300, :peso), new NumeroDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :reps) {
            WatchUi.pushView(new NumeroView("Repetições", "reps", Forca.reps, 1, 0, 200, :reps), new NumeroDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :descanso) {
            WatchUi.pushView(new NumeroView("Descanso", "s", Forca.descansoSeg, 15, 0, 600, :descanso), new NumeroDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :salvar || id == :descartar) {
            Forca.encerrar(id == :salvar);
            WatchUi.popView(WatchUi.SLIDE_DOWN);       // fecha o menu
            WatchUi.switchToView(new ResumoView(id == :salvar), new ResumoDelegate(), WatchUi.SLIDE_LEFT);
        }
        return true;
    }
}

// -------------------------------------------------------------------- resumo
class ResumoView extends WatchUi.View {
    var salvou;

    function initialize(s) { View.initialize(); salvou = s; }

    function onUpdate(dc) {
        dc.setColor(Cor.TEXTO, Cor.FUNDO);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var g = grande(dc);
        dc.setColor(salvou ? Cor.BOM : Cor.FORTE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, g ? 28 : 16, Graphics.FONT_XTINY, salvou ? "Treino salvo" : "Treino descartado", Graphics.TEXT_JUSTIFY_CENTER);

        var y = g ? 62 : 42;
        var dy = g ? 30 : 24;
        var linhas = [
            ["Séries", Forca.series.size().format("%d")],
            ["Repetições", Forca.totalReps.format("%d")],
            ["Volume", Forca.volume.format("%d") + " kg"],
            ["Tempo", Forca.tempo(Forca.duracao())]
        ];
        var kcal = Forca.calorias();
        if (kcal != null) { linhas.add(["Calorias", kcal.format("%d") + " kcal"]); }
        for (var i = 0; i < linhas.size(); i++) {
            dc.setColor(Cor.SUAVE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2 - 6, y + i * dy, Graphics.FONT_XTINY, linhas[i][0], Graphics.TEXT_JUSTIFY_RIGHT);
            dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2 + 6, y + i * dy, Graphics.FONT_XTINY, linhas[i][1], Graphics.TEXT_JUSTIFY_LEFT);
        }
        dc.setColor(Cor.ATENCAO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h - (g ? 40 : 28), Graphics.FONT_XTINY, "START volta ao início", Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class ResumoDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }

    function onSelect() {
        Forca.estado = Forca.PARADO;
        WatchUi.switchToView(new InicioView(), new InicioDelegate(), WatchUi.SLIDE_RIGHT);
        return true;
    }

    function onBack() { return onSelect(); }
}

// ----------------------------------------------------------------- histórico
class HistoricoView extends WatchUi.View {
    var pos = 0;

    function initialize() { View.initialize(); Vista.hist = self; }

    function desce() { if (pos < Forca.hist.size() - 1) { pos++; WatchUi.requestUpdate(); } }
    function sobe() { if (pos > 0) { pos--; WatchUi.requestUpdate(); } }

    function onUpdate(dc) {
        dc.setColor(Cor.TEXTO, Cor.FUNDO);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var g = grande(dc);
        dc.setColor(Cor.DESTAQUE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, g ? 22 : 12, Graphics.FONT_XTINY, "Histórico", Graphics.TEXT_JUSTIFY_CENTER);

        if (Forca.hist.size() == 0) {
            dc.setColor(Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h / 2, Graphics.FONT_XTINY, "Nenhum treino ainda",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }

        var cabe = g ? 5 : 4;
        var y = g ? 52 : 36;
        var dy = g ? 30 : 26;
        for (var i = 0; i < cabe && pos + i < Forca.hist.size(); i++) {
            var t = Forca.hist[pos + i];
            dc.setColor(i == 0 ? Cor.BOM : Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(6, y + i * dy, Graphics.FONT_XTINY, Forca.dataCurta(t["dia"]), Graphics.TEXT_JUSTIFY_LEFT);
            dc.drawText(w - 6, y + i * dy, Graphics.FONT_XTINY,
                t["series"].format("%d") + "x · " + t["reps"].format("%d") + " reps", Graphics.TEXT_JUSTIFY_RIGHT);
        }
        var u = Forca.hist[pos];
        dc.setColor(Cor.SUAVE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h - (g ? 44 : 32), Graphics.FONT_XTINY,
            "vol " + u["vol"].format("%d") + " kg · " + Forca.tempo(u["seg"]), Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class HistoricoDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }

    function onNextPage() { if (Vista.hist != null) { Vista.hist.desce(); } return true; }
    function onPreviousPage() { if (Vista.hist != null) { Vista.hist.sobe(); } return true; }

    function onKey(evt) {
        var k = evt.getKey();
        if (k == WatchUi.KEY_DOWN) { return onNextPage(); }
        if (k == WatchUi.KEY_UP) { return onPreviousPage(); }
        return false;
    }
}

// --------------------------------------------------------------------- sobre
class SobreView extends WatchUi.View {
    function initialize() { View.initialize(); }

    function onUpdate(dc) {
        dc.setColor(Cor.TEXTO, Cor.FUNDO);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var g = grande(dc);
        var linhas = [
            "Força " + Forca.VERSAO,
            "Treino de força para",
            "o Forerunner 55",
            "",
            "Alequizao",
            "alequizao.dev@gmail.com",
            "alequizao.com/garmin"
        ];
        var dy = g ? 26 : 22;
        var y = h / 2 - (linhas.size() * dy) / 2;
        for (var i = 0; i < linhas.size(); i++) {
            dc.setColor(i == 0 ? Cor.DESTAQUE : Cor.TEXTO, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, y + i * dy, Graphics.FONT_XTINY, linhas[i], Graphics.TEXT_JUSTIFY_CENTER);
        }
    }
}

class SobreDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }
}
