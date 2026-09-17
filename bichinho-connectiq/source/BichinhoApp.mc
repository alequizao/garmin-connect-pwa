/*
 * Bichinho Virtual (app Connect IQ no estilo dos bichinhos virtuais de 1996)
 * Desenvolvido por Alequizao <alequizao.dev@gmail.com> · https://github.com/alequizao · © 2026 Alequizao
 *
 * Regras no espírito do original: 1 dia real = 1 ano de vida. O ovo choca em 5 minutos, vira bebê
 * (1 hora), criança (até 3 anos), adolescente (até 6 anos) e adulto. O adulto que sai depende dos
 * ERROS DE CUIDADO (fome ou felicidade zeradas por 15 min, luz acesa na hora de dormir) e dos
 * ERROS DE DISCIPLINA (não dar bronca quando ele chama de birra). Cocô acumulado adoece, remédio
 * cura com 2 doses, e ele morre de fome, de doença ou de velhice.
 *
 * Botões: CIMA/BAIXO escolhem o ícone, START usa, VOLTAR cancela.
 */
import Toybox.Application;
import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

class BichinhoApp extends Application.AppBase {
    var view = null;
    function initialize() { AppBase.initialize(); }
    function onStart(state) { }
    function onStop(state) { if (view != null) { view.salvar(); } }
    function getInitialView() { view = new BichinhoView(); return [view, new BichinhoDelegate(view)]; }
}

class BichinhoView extends WatchUi.View {
    // personagens
    const OVO = 0, BEBE = 1, CRIANCA = 2, TEEN_A = 3, TEEN_B = 4,
          GATO = 5, ROBO = 6, MASCARA = 7, PATO = 8, MINHOCA = 9, GOSMA = 10, VEIO = 11, MORTO = 12;
    // telas
    const PRINCIPAL = 0, COMER = 1, STATUS = 2, JOGO = 3, ANIM = 4;
    const LCD = 0xA8B58A, PIXEL = 0x243018, APAGADO = 0x8C9A70, CASCA = 0xE84A8A;

    // estado salvo
    var per = OVO, nasc = 0, ultimo = 0, idade = 0;          // idade em minutos de vida (depois de chocar)
    var fome = 2, feliz = 2, peso = 5, coco = 0, doente = 0, doses = 0, luz = 1, disc = 0, somLig = 1;
    var erroC = 0, erroD = 0, erroCrianca = 0, birra = 0;
    var aFome = 0, aFeliz = 0, aCoco = 0, tZero = 0, tFome0 = 0, tDoente = 0, tLuz = 0, tBir = 0;
    // tela
    var tela = PRINCIPAL, sel = -1, sub = 0, q = 0, posX = 8, dirX = 1, anim = "", animQ = 0, animTxt = "";
    var jogoRod = 0, jogoAcertos = 0, jogoLado = 0, jogoEscolha = 0, jogoMostra = 0;
    var chamava = false, timer;

    function initialize() {
        View.initialize();
        var d = Application.Storage.getValue("pet2");
        if (d instanceof Dictionary && d["ver"] != null) {
            per = n(d, "per", per); nasc = n(d, "nasc", nasc); ultimo = n(d, "ultimo", ultimo); idade = n(d, "idade", idade);
            fome = n(d, "fome", fome); feliz = n(d, "feliz", feliz); peso = n(d, "peso", peso); coco = n(d, "coco", coco); doente = n(d, "doente", doente);
            doses = n(d, "doses", doses); luz = n(d, "luz", luz); disc = n(d, "disc", disc); somLig = n(d, "somLig", somLig);
            erroC = n(d, "erroC", erroC); erroD = n(d, "erroD", erroD); erroCrianca = n(d, "erroCrianca", erroCrianca); birra = n(d, "birra", birra);
            aFome = n(d, "aFome", aFome); aFeliz = n(d, "aFeliz", aFeliz); aCoco = n(d, "aCoco", aCoco);
            tFome0 = n(d, "tFome0", tFome0); tDoente = n(d, "tDoente", tDoente); tLuz = n(d, "tLuz", tLuz); tBir = n(d, "tBir", tBir); tZero = n(d, "tZero", tZero);
        } else { novoOvo(); }
        timer = new Timer.Timer();
    }

    // lê um campo do save; se faltar (save antigo), fica com o valor padrão
    function n(d, chave, padrao) {
        var v = d[chave];
        return v instanceof Number ? v : padrao;
    }

    function salvar() {
        Application.Storage.setValue("pet2", {"ver" => 2,"per" => per, "nasc" => nasc, "ultimo" => ultimo, "idade" => idade,
            "fome" => fome, "feliz" => feliz, "peso" => peso, "coco" => coco, "doente" => doente, "doses" => doses,
            "luz" => luz, "disc" => disc, "somLig" => somLig, "erroC" => erroC, "erroD" => erroD, "erroCrianca" => erroCrianca,
            "birra" => birra, "aFome" => aFome, "aFeliz" => aFeliz, "aCoco" => aCoco, "tFome0" => tFome0,
            "tDoente" => tDoente, "tLuz" => tLuz, "tBir" => tBir, "tZero" => tZero});
    }

    function novoOvo() {
        per = OVO; nasc = Time.now().value(); ultimo = nasc; idade = 0;
        fome = 2; feliz = 2; peso = 5; coco = 0; doente = 0; doses = 0; luz = 1; disc = 0; somLig = 1;
        erroC = 0; erroD = 0; erroCrianca = 0; birra = 0;
        aFome = 0; aFeliz = 0; aCoco = 0; tFome0 = 0; tDoente = 0; tLuz = 0; tBir = 0; tZero = 0;
    }

    function onShow() { simular(); chamava = chamando(); timer.start(method(:tique), 250, true); }
    function onHide() { timer.stop(); salvar(); }

    // ---------- tabela dos personagens ----------
    const NOMES = ["OVO", "BOLINHA", "REDONDO", "PONTINHAS", "BIQUINHO", "GATINHO", "ROBOZINHO",
                   "MASCARADO", "PATINHO", "MINHOCA", "GOSMINHA", "VEIO", "ANJINHO"];
    const DORMIR = [22, 20, 20, 21, 21, 22, 22, 23, 22, 22, 22, 22, 22];
    const ACORDAR = [9, 9, 9, 9, 9, 9, 9, 11, 9, 9, 10, 9, 9];
    const PESO_MIN = [5, 5, 10, 20, 20, 30, 30, 30, 30, 10, 30, 30, 5];
    const R_FOME = [70, 30, 45, 60, 60, 70, 70, 45, 70, 60, 45, 70, 70];
    const R_FELIZ = [60, 25, 40, 55, 55, 65, 65, 40, 65, 55, 40, 65, 65];
    const R_COCO = [180, 45, 90, 150, 150, 180, 180, 120, 180, 150, 120, 180, 180];

    function nome() { return NOMES[per]; }
    function horaDormir() { return DORMIR[per]; }
    function horaAcordar() { return ACORDAR[per]; }
    function pesoMinimo() { return PESO_MIN[per]; }
    function ritmoFome() { return R_FOME[per]; }
    function ritmoFeliz() { return R_FELIZ[per]; }
    function ritmoCoco() { return R_COCO[per]; }

    const SPR_PET = [Spr.EGG, Spr.BEBETCHI, Spr.MARUTCHI, Spr.ESPINHO, Spr.BICOTCHI, Spr.GATOTCHI, Spr.ROBOTCHI,
                     Spr.MASCARATCHI, Spr.PATOTCHI, Spr.VERMETCHI, Spr.BLOBTCHI, Spr.VELHOTCHI, Spr.FANTASMA];
    function sprPet() { return SPR_PET[per]; }

    // ---------- tempo ----------
    function hora(t) { return ((t + System.getClockTime().timeZoneOffset) % 86400) / 3600; }
    function dormindo(t) {
        if (per == OVO || per == MORTO) { return false; }
        var h = hora(t), d = horaDormir(), a = horaAcordar();
        return d > a ? (h >= d || h < a) : (h >= d && h < a);
    }

    function simular() {
        var agora = Time.now().value();
        if (per == OVO) {
            if (agora - nasc < 300) { ultimo = agora; return; }
            per = BEBE; idade = 0; ultimo = nasc + 300; som([1047, 120, 1319, 120, 1568, 120, 2093, 300]); vibrar(60, 300); luzTela();
        }
        if (per == MORTO) { ultimo = agora; return; }
        if (agora - ultimo > 7 * 86400) { ultimo = agora - 7 * 86400; }
        var antes = per;
        while (agora - ultimo >= 300 && per != MORTO) { ultimo += 300; passo(ultimo); }
        if (per == MORTO) { som([784, 300, 659, 300, 523, 300, 392, 700]); vibrar(80, 800); }
        else if (per != antes) { som([523, 100, 659, 100, 784, 100, 1047, 250]); iniciaAnim("feliz", 12, "CRESCEU!"); }
    }

    function passo(t) {
        idade += 5;
        evoluir();
        if (dormindo(t)) {
            if (luz == 1) { tLuz += 5; if (tLuz % 15 == 0) { erroC++; } } else { tLuz = 0; }
            tFome0 = fome == 0 ? tFome0 + 5 : 0;
            tDoente = doente == 1 ? tDoente + 5 : 0;
            if (tFome0 >= 720 || tDoente >= 1440) { per = MORTO; }
            return;
        }
        tLuz = 0;
        aFome += 5; if (aFome >= ritmoFome()) { aFome = 0; if (fome > 0) { fome--; } }
        aFeliz += 5; if (aFeliz >= ritmoFeliz()) { aFeliz = 0; if (feliz > 0) { feliz--; } }
        aCoco += 5; if (aCoco >= ritmoCoco()) { aCoco = 0; if (coco < 4) { coco++; } }
        // birra: ele chama com os corações cheios; a resposta certa é a bronca
        if (birra == 0 && fome > 0 && feliz > 0 && doente == 0 && Math.rand() % 36 == 0) { birra = 1; tBir = 0; }
        if (birra == 1) { tBir += 5; if (tBir >= 15) { erroD++; birra = 0; tBir = 0; } }
        // erro de cuidado: coração zerado sem atendimento por 15 min
        if (fome == 0 || feliz == 0) { tZero += 5; if (tZero % 15 == 0) { erroC++; } } else { tZero = 0; }
        tFome0 = fome == 0 ? tFome0 + 5 : 0;
        // doença: cocô acumulado, fome longa ou obesidade
        if (doente == 0 && (coco >= 4 || tFome0 >= 360 || peso >= 90)) { doente = 1; doses = 2; }
        tDoente = doente == 1 ? tDoente + 5 : 0;
        // morte: fome, doença ou velhice (quanto mais erros, menos tempo de vida)
        var limite = 25 - erroC - 2 * erroD; if (limite < 12) { limite = 12; }
        if (tFome0 >= 720 || tDoente >= 1440 || idade / 1440 >= limite) { per = MORTO; }
    }

    function evoluir() {
        var antesPer = per;
        evoluirFase();
        if (per != antesPer && peso < pesoMinimo()) { peso = pesoMinimo(); }
    }

    function evoluirFase() {
        if (per == BEBE && idade >= 65) { per = CRIANCA; erroCrianca = erroC; }
        else if (per == CRIANCA && idade >= 3 * 1440) { per = (erroC - erroCrianca) <= 2 ? TEEN_A : TEEN_B; erroCrianca = erroC; }
        else if ((per == TEEN_A || per == TEEN_B) && idade >= 6 * 1440) {
            if (per == TEEN_A && erroC <= 2) { per = erroD == 0 ? GATO : (erroD == 1 ? ROBO : MASCARA); }
            else { per = erroD <= 1 ? PATO : (erroD <= 3 ? MINHOCA : GOSMA); }
        }
        else if (per == MASCARA && disc == 0 && erroC <= 3 && idade >= 10 * 1440) { per = VEIO; }
    }

    // o ícone de atenção acende por fome, tristeza, birra ou luz acesa na hora de dormir
    // (como no original, a doença não avisa: fique de olho na caveira)
    function chamando() {
        if (per == OVO || per == MORTO) { return false; }
        if (dormindo(Time.now().value())) { return luz == 1; }
        return fome == 0 || feliz == 0 || birra == 1;
    }

    function tique() as Void {
        q++;
        if (q % 240 == 0 || (per == OVO && Time.now().value() - nasc >= 300)) { simular(); salvar(); }
        if (animQ > 0) { animQ--; if (animQ == 0) { fimAnim(); } }
        if (q % 4 == 0 && tela == PRINCIPAL) {
            var maxX = coco == 0 ? 16 : (coco <= 2 ? 8 : 0);
            if (Math.rand() % 3 == 0) { dirX = -dirX; }
            posX += dirX * 2; if (posX < 0) { posX = 0; dirX = 1; } if (posX > maxX) { posX = maxX; dirX = -1; }
            var p = chamando();
            if (p && !chamava) { som([2400, 80, 0, 60, 2400, 80, 0, 60, 2400, 80]); vibrar(50, 200); luzTela(); }
            chamava = p;
        }
        if (tela == JOGO && jogoMostra > 0) { jogoMostra--; if (jogoMostra == 0) { proximaRodada(); } }
        WatchUi.requestUpdate();
    }

    // ---------- som, vibração e luz ----------
    function som(notas) {
        if (somLig == 0 || !(Attention has :playTone) || !(Attention has :ToneProfile)) { return; }
        var p = [];
        for (var i = 0; i < notas.size(); i += 2) { p.add(new Attention.ToneProfile(notas[i], notas[i + 1])); }
        try { Attention.playTone({:toneProfile => p}); } catch (e) { }
    }
    function bip() { som([2000, 30]); }
    function vibrar(forca, ms) { if (Attention has :vibrate) { Attention.vibrate([new Attention.VibeProfile(forca, ms)]); } }
    function luzTela() { if (Attention has :backlight) { try { Attention.backlight(true); } catch (e) { } } }

    // ---------- ações ----------
    function iniciaAnim(tipoAnim, quadros, txt) { tela = ANIM; anim = tipoAnim; animQ = quadros; animTxt = txt; }
    function fimAnim() { tela = PRINCIPAL; anim = ""; salvar(); }

    function botao(b) {
        bip();
        if (tela == ANIM) { return true; }
        if (per == MORTO) {
            if (b.equals("start")) { novoOvo(); tela = PRINCIPAL; sel = -1; som([1568, 80, 2093, 160]); salvar(); return true; }
            return b.equals("back") ? false : true;
        }
        if (tela == STATUS) {
            if (b.equals("back")) { tela = PRINCIPAL; }
            else if (b.equals("start") && sub == 4) { somLig = 1 - somLig; salvar(); }
            else if (b.equals("cima")) { sub = (sub + 4) % 5; } else { sub = (sub + 1) % 5; }
            return true;
        }
        if (tela == COMER) {
            if (b.equals("back")) { tela = PRINCIPAL; }
            else if (b.equals("cima") || b.equals("baixo")) { sub = 1 - sub; }
            else { comer(sub); }
            return true;
        }
        if (tela == JOGO) {
            if (b.equals("back")) { tela = PRINCIPAL; jogoMostra = 0; return true; }
            if (jogoMostra > 0) { return true; }
            if (b.equals("cima")) { jogar(-1); } else if (b.equals("baixo")) { jogar(1); }
            return true;
        }
        if (b.equals("back")) { if (sel >= 0) { sel = -1; return true; } salvar(); return false; }
        if (b.equals("cima")) { sel = sel <= 0 ? 6 : sel - 1; return true; }
        if (b.equals("baixo")) { sel = sel >= 6 ? 0 : sel + 1; return true; }
        if (sel < 0) { sel = 0; return true; }
        usar(sel);
        return true;
    }

    // 0 comer · 1 luz · 2 brincar · 3 remédio · 4 limpar · 5 bronca · 6 status
    function usar(i) {
        var dorme = dormindo(Time.now().value());
        if (i == 6) { tela = STATUS; sub = 0; return; }
        if (per == OVO) { som([400, 120]); return; }
        if (i == 1) { luz = 1 - luz; tLuz = 0; salvar(); return; }
        if (luz == 0) { som([400, 120]); return; }
        if (i == 5) {   // bronca
            if (birra == 1) { birra = 0; tBir = 0; if (disc < 100) { disc += 25; } iniciaAnim("bronca", 10, "DISCIPLINA " + disc + "%"); som([300, 90, 0, 60, 300, 90]); }
            else { if (feliz > 0) { feliz--; } iniciaAnim("triste", 10, "SEM MOTIVO"); som([300, 200]); }
            salvar(); return;
        }
        if (dorme && (i == 0 || i == 2)) { iniciaAnim("dorme", 8, "ZZZ..."); som([300, 200]); return; }
        if (i == 0) { tela = COMER; sub = 0; return; }
        if (i == 2) {
            if (doente == 1) { iniciaAnim("triste", 8, "DOENTE"); som([300, 200]); return; }
            tela = JOGO; jogoRod = 0; jogoAcertos = 0; proximaRodada(); return;
        }
        if (i == 3) {
            if (doente == 1) {
                doses--;
                if (doses <= 0) { doente = 0; tDoente = 0; doses = 0; iniciaAnim("remedio", 10, "CUROU!"); som([880, 80, 1175, 80, 1760, 200]); }
                else { iniciaAnim("remedio", 10, "FALTA " + doses); som([880, 80, 1175, 120]); }
            } else { iniciaAnim("triste", 8, "NÃO PRECISA"); som([300, 200]); }
            salvar(); return;
        }
        if (i == 4) {
            if (coco > 0) { coco = 0; iniciaAnim("limpar", 12, ""); som([1500, 40, 1700, 40, 1900, 40, 2100, 80]); salvar(); }
            else { som([400, 120]); }
        }
    }

    function comer(tipoComida) {
        if (tipoComida == 0) {
            if (fome >= 4) { iniciaAnim("triste", 8, "CHEIO!"); som([300, 200]); return; }
            fome++; peso++;
        } else { if (feliz < 4) { feliz++; } peso += 2; }
        if (peso > 99) { peso = 99; }
        if (fome > 0 && feliz > 0) { tZero = 0; }
        iniciaAnim(tipoComida == 0 ? "comida" : "doce", 12, ""); som([1200, 60, 0, 120, 1200, 60, 0, 120, 1200, 60]);
        salvar();
    }

    function proximaRodada() {
        if (jogoRod >= 5) {
            if (peso > pesoMinimo()) { peso--; }
            if (jogoAcertos >= 3) { if (feliz < 4) { feliz++; } if (fome > 0 && feliz > 0) { tZero = 0; } iniciaAnim("feliz", 12, jogoAcertos + "/5 GANHOU"); som([1047, 100, 1319, 100, 1568, 250]); }
            else { iniciaAnim("triste", 10, jogoAcertos + "/5 PERDEU"); som([523, 150, 392, 300]); }
            salvar(); return;
        }
        jogoRod++; jogoLado = Math.rand() % 2 == 0 ? -1 : 1; jogoEscolha = 0;
    }

    function jogar(lado) {
        jogoEscolha = lado; jogoMostra = 5;
        if (lado == jogoLado) { jogoAcertos++; som([1568, 60, 2093, 100]); } else { som([392, 150]); }
    }

    // ---------- desenho ----------
    function spr(dc, linhas, larg, x0, y0, p, espelha) {
        var g = p >= 4 ? 1 : 0;
        for (var y = 0; y < linhas.size(); y++) {
            var l = linhas[y];
            if (l == 0) { continue; }
            for (var x = 0; x < larg; x++) {
                if ((l >> (larg - 1 - x)) & 1) {
                    var xx = espelha ? larg - 1 - x : x;
                    dc.fillRectangle(x0 + xx * p, y0 + y * p, p - g, p - g);
                }
            }
        }
    }

    function onUpdate(dc) {
        var w = dc.getWidth(), h = dc.getHeight(), cx = w / 2, cy = h / 2;
        var r = (w < h ? w : h) / 2;
        dc.setColor(CASCA, CASCA); dc.clear();
        dc.setColor(0xF27BAE, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx - r * 0.55, cy - r * 0.62, r * 0.10);
        var lw = (r * 1.36).toNumber(), lh = (r * 1.10).toNumber(), lx = cx - lw / 2, ly = cy - lh / 2;
        var chama = chamando() && q % 4 < 2;
        dc.setColor(chama ? 0xFFE14D : 0x7A1F48, Graphics.COLOR_TRANSPARENT); dc.fillRoundedRectangle(lx - 6, ly - 6, lw + 12, lh + 12, 16);
        dc.setColor(LCD, LCD); dc.fillRoundedRectangle(lx, ly, lw, lh, 10);

        var ip = lw / 76; if (ip < 2) { ip = 2; }
        var faixa = ip * 11;
        var areaH = lh - 2 * faixa;
        var p = lw / 34; if (areaH / 17 < p) { p = areaH / 17; } if (p < 2) { p = 2; }
        var ay = ly + faixa + (areaH - 16 * p) / 2;

        // 8 ícones: 4 em cima (comer, luz, brincar, remédio) e 4 embaixo (limpar, bronca, status, atenção)
        var icones = [Spr.I_COMER, Spr.I_LUZ, Spr.I_BRINCAR, Spr.I_REMEDIO, Spr.I_LIMPAR, Spr.I_DISCIPLINA, Spr.I_STATUS, Spr.I_ATENCAO];
        for (var i = 0; i < 8; i++) {
            var col = i % 4, lin = i / 4;
            var pad = lw / 14, ix = lx + pad + (lw - 2 * pad - 8 * ip) * col / 3, iy = lin == 0 ? ly + ip * 2 : ly + lh - ip * 10;
            var aceso = i == 7 ? chama : i == sel;
            dc.setColor(aceso ? PIXEL : APAGADO, Graphics.COLOR_TRANSPARENT);
            spr(dc, icones[i], 8, ix, iy, ip, false);
            if (i == sel && i != 7) { dc.fillRectangle(ix, lin == 0 ? iy + ip * 9 : iy - ip - 2, ip * 8, 2); }
        }

        dc.setColor(PIXEL, Graphics.COLOR_TRANSPARENT);
        var fn = Graphics.FONT_XTINY, hf = Graphics.getFontHeight(fn);
        var yTopo = ly + faixa - hf / 2 - 2;
        var yRodape = ly + lh - faixa - hf / 2 - 2;
        var agora = Time.now().value();
        var meio = p / 2 > 1 ? p / 2 : 2;
        var quadro = q % 2;

        if (per == MORTO) {
            spr(dc, Spr.FANTASMA, 16, cx - 14 * p, ay - (q / 4 % 2) * p, p, false);
            spr(dc, Spr.TUMBA, 16, cx + 1 * p, ay, p, false);
            dc.drawText(cx, yRodape, fn, "START: NOVO OVO", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }

        if (tela == STATUS) {
            var titulo = ["IDADE " + (idade / 1440), "FOME", "FELIZ", "DISCIPLINA", nome()][sub];
            dc.drawText(cx, ay + 3 * p, fn, titulo, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            if (sub == 0) { dc.drawText(cx, ay + 11 * p, fn, "PESO " + peso + "g", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER); }
            else if (sub == 3) { dc.drawText(cx, ay + 11 * p, fn, disc + "%", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER); }
            else if (sub == 4) { dc.drawText(cx, ay + 11 * p, fn, somLig == 1 ? "SOM: SIM" : "SOM: NAO", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER); }
            else {
                var n = sub == 1 ? fome : feliz, hp = p * 3 / 4; if (hp < 2) { hp = 2; }
                for (var k = 0; k < 4; k++) { spr(dc, k < n ? Spr.CORACAO : Spr.CORACAO_V, 8, cx - 16 * p + k * 8 * p + 2 * p, ay + 8 * p, hp, false); }
            }
            dc.drawText(cx, yTopo, fn, (sub + 1) + "/5", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }

        if (tela == COMER) {
            dc.drawText(cx, ay + 4 * p, fn, (sub == 0 ? "> " : "  ") + "REFEIÇÃO", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.drawText(cx, ay + 12 * p, fn, (sub == 1 ? "> " : "  ") + "DOCE", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }

        if (luz == 0) {
            dc.setColor(PIXEL, Graphics.COLOR_TRANSPARENT); dc.fillRectangle(lx + 4, ay - p, lw - 8, 18 * p);
            if (dormindo(agora)) { dc.setColor(LCD, Graphics.COLOR_TRANSPARENT); spr(dc, Spr.ZZZ, 8, cx + 6 * p, ay + (q / 4 % 2) * p, p, false); }
            return;
        }

        if (tela == JOGO) {
            var lado = jogoMostra > 0 ? jogoLado : 0;
            spr(dc, sprPet(), 16, cx - 8 * p + lado * 6 * p, ay, p, lado < 0);
            dc.drawText(lx + 8, yTopo, fn, jogoRod + "/5", Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.drawText(cx, yRodape, fn, jogoMostra > 0 ? (jogoEscolha == jogoLado ? "ACERTOU!" : "ERROU") : "↑ ESQ   ↓ DIR", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }

        if (tela == ANIM) {
            if (anim.equals("comida") || anim.equals("doce")) {
                var etapa = (12 - animQ) / 4, linhas = anim.equals("comida") ? Spr.COMIDA : Spr.DOCE, corte = [];
                for (var k2 = 0; k2 < 8; k2++) { corte.add(k2 < etapa * 3 ? 0 : linhas[k2]); }
                spr(dc, corte, 8, cx - 16 * p, ay + 8 * p, p, false);
                spr(dc, sprPet(), 16, cx - 6 * p, ay + quadro * p, p, true);
            } else if (anim.equals("limpar")) {
                var lx2 = (12 - animQ) * 3;
                spr(dc, sprPet(), 16, cx - 16 * p, ay, p, false);
                for (var yy = 0; yy < 16; yy++) { dc.fillRectangle(cx - 16 * p + lx2 * p, ay + yy * p, p - 1, p - 1); }
            } else if (anim.equals("remedio")) {
                spr(dc, sprPet(), 16, cx - 4 * p, ay, p, false);
                spr(dc, Spr.I_REMEDIO, 8, cx - 16 * p + quadro * p, ay + 4 * p, p, true);
            } else if (anim.equals("feliz")) {
                spr(dc, sprPet(), 16, cx - 8 * p, ay + (quadro == 0 ? p : -p), p, false);
                if (quadro == 0) { spr(dc, Spr.CORACAO, 8, cx + 8 * p, ay - p, meio, false); spr(dc, Spr.CORACAO, 8, cx - 12 * p, ay, meio, false); }
            } else if (anim.equals("bronca")) {
                spr(dc, sprPet(), 16, cx - 8 * p + (quadro == 0 ? -p : p), ay, p, quadro == 1);
                spr(dc, Spr.I_ATENCAO, 8, cx + 9 * p, ay, meio, false);
            } else if (anim.equals("dorme")) {
                spr(dc, sprPet(), 16, cx - 12 * p, ay, p, false);
                spr(dc, Spr.ZZZ, 8, cx + 5 * p, ay - quadro * p, p, false);
            } else {
                spr(dc, sprPet(), 16, cx - 8 * p, ay, p, quadro == 1);
            }
            if (animTxt.length() > 0) { dc.setColor(PIXEL, Graphics.COLOR_TRANSPARENT); dc.drawText(cx, yTopo, fn, animTxt, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER); }
            return;
        }

        // tela principal
        if (per == OVO) {
            spr(dc, Spr.EGG, 16, cx - 8 * p + (q / 4 % 2 == 0 ? -p : p), ay, p, false);
            var falta = 300 - (agora - nasc); if (falta < 0) { falta = 0; }
            dc.drawText(lx + lw - 8, yTopo, fn, (falta / 60) + ":" + (falta % 60).format("%02d"), Graphics.TEXT_JUSTIFY_RIGHT | Graphics.TEXT_JUSTIFY_VCENTER);

        } else if (dormindo(agora)) {
            spr(dc, sprPet(), 16, cx - 12 * p, ay, p, false);
            spr(dc, Spr.ZZZ, 8, cx + 5 * p, ay - (q / 4 % 2) * p, p, false);
        } else {
            spr(dc, sprPet(), 16, cx - 16 * p + posX * p, ay + ((q / 4) % 2) * p / 2, p, dirX < 0);
            if (doente == 1 && q % 8 < 5) { spr(dc, Spr.CAVEIRA, 8, cx - 16 * p, ay - p, meio, false); }
            if (birra == 1 && q % 4 < 2) { spr(dc, Spr.I_ATENCAO, 8, cx + 11 * p, ay - p, meio, false); }
        }
        if (per != OVO) {
            for (var c = 0; c < coco; c++) {
                var cxp = cx + 16 * p - 8 * p * (c / 2 + 1), cyp = ay + (c % 2 == 0 ? 8 : 0) * p;
                spr(dc, Spr.COCO, 8, cxp + ((q / 4 + c) % 2) * meio, cyp, p, false);
            }
        }
    }
}

class BichinhoDelegate extends WatchUi.BehaviorDelegate {
    var v;
    function initialize(view) { BehaviorDelegate.initialize(); v = view; }
    function onSelect() { return v.botao("start"); }
    function onTap(evt) { return v.botao("start"); }
    function onNextPage() { return v.botao("baixo"); }
    function onPreviousPage() { return v.botao("cima"); }
    function onSwipe(evt) {
        var d = evt.getDirection();
        if (d == WatchUi.SWIPE_LEFT || d == WatchUi.SWIPE_UP) { return v.botao("baixo"); }
        if (d == WatchUi.SWIPE_RIGHT || d == WatchUi.SWIPE_DOWN) { return v.botao("cima"); }
        return false;
    }
    function onBack() { return v.botao("back"); }
}
