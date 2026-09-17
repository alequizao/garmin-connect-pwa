/*
 * Omnitrix (app interativo Connect IQ) · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * Igual ao relógio do desenho: START abre o seletor, CIMA/BAIXO (ou deslizar) gira o
 * mostrador entre os aliens, START transforma. A transformação dura 10 minutos; depois
 * o Omnitrix fica vermelho recarregando por 1 minuto. VOLTAR destransforma.
 */
import Toybox.Application;
import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.Timer;
import Toybox.WatchUi;

class OmnitrixApp extends Application.AppBase {
    function initialize() { AppBase.initialize(); }
    function onStart(state) { }
    function onStop(state) { }
    function getInitialView() { var v = new OmnitrixView(); return [v, new OmnitrixDelegate(v)]; }
}

class OmnitrixView extends WatchUi.View {
    // <aliens>
    const NOMES = ["CHAMA", "BESTA", "DIAMANTE", "XLR8", "MASSA CINZENTA", "QUATRO BRAÇOS", "INSECTÓIDE", "AQUÁTICO", "ULTRA-T", "FANTASMÁTICO", "BALA DE CANHÃO", "CIPÓ SELVAGEM", "BLITZWOLFER", "SNARE-OH", "FRANKENSTRIKE", "GLUTÃO", "DITTO", "EYE GUY", "GIGANTE", "FOGO-FÁTUO", "ECO ECO", "HUMUNGOSSAURO", "ARRAIA-A-JATO", "FRIAGEM", "CROMASTONE", "BRAINSTORM", "MACACO-ARANHA", "GOSMA", "ALIEN X", "LODESTAR", "RATH", "NANOMECH", "WATER HAZARD", "AMPFIBIAN", "ARMODRILLO", "TERRASPIN", "NRG", "FASTTRACK", "CHAMALIEN", "CLOCKWORK", "EATLE", "JURYRIGG", "FEEDBACK", "BLOXX", "GRAVATTACK", "CRASHHOPPER", "BALL WEEVIL", "WALKATROUT", "PESKY DUST", "MOLE-STACHE", "THE WORST", "KICKIN HAWK", "TOEPICK", "ASTRODACTYL", "BULLFRAG", "ATOMIX", "GUTROT", "WHAMPIRE", "SHOCKSQUATCH"];
    const SERIES = ["CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "CLÁSSICO", "FORÇA ALIENÍGENA", "FORÇA ALIENÍGENA", "FORÇA ALIENÍGENA", "FORÇA ALIENÍGENA", "FORÇA ALIENÍGENA", "FORÇA ALIENÍGENA", "FORÇA ALIENÍGENA", "FORÇA ALIENÍGENA", "FORÇA ALIENÍGENA", "FORÇA ALIENÍGENA", "FORÇA ALIENÍGENA", "FORÇA ALIENÍGENA", "FORÇA ALIENÍGENA", "SUPREMACIA", "SUPREMACIA", "SUPREMACIA", "SUPREMACIA", "SUPREMACIA", "SUPREMACIA", "SUPREMACIA", "SUPREMACIA", "SUPREMACIA", "SUPREMACIA", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE", "OMNIVERSE"];
    const CORES = [0xFF5500, 0xFF8800, 0x00DDFF, 0x2288FF, 0xAAAAAA, 0xFF2222, 0xAAFF00, 0x00AAAA, 0x00FF55, 0xDDDDFF, 0xFFCC00, 0x33CC33, 0x8899AA, 0xCC9966, 0x66CC99, 0x66AA33, 0xFFFFFF, 0xFFDD55, 0xFF3333, 0x44BB22, 0xEEEEEE, 0xAA7744, 0xDD2222, 0x3399FF, 0xCC66FF, 0xFF8877, 0x3355DD, 0x77FF33, 0x222244, 0xAA3333, 0xFF9900, 0x88FF88, 0x3366AA, 0x66CCFF, 0xDDAA22, 0x99AA66, 0xFF4400, 0x3344AA, 0x9966CC, 0xCC9933, 0x664422, 0xFF3366, 0x2255FF, 0xFF5533, 0x886644, 0x77AA22, 0xDDBB33, 0x88BBAA, 0xFF99CC, 0xAA7755, 0xCCCC99, 0xCC5522, 0x553366, 0x33AA88, 0x44AA44, 0x99FF33, 0xAA8844, 0x6633AA, 0xEEEEFF];
    // </aliens>
    const PRONTO = 0, SELECAO = 1, TRANSFORMANDO = 2, ALIEN = 3, RECARGA = 4;
    const DURACAO = 600, RECARGA_S = 60;

    var estado = PRONTO;
    var atual = 0;
    var quadro = 0;          // animação (abrir, girar, transformar)
    var giro = 0;            // -1 / 1 durante a troca
    var fimEm = 0;           // segundos (Time.now) em que acaba a transformação ou a recarga
    var bmp = null, bmpIdx = -1;
    var timer;

    // <rez>
    function imagem(i) {
        var r = [Rez.Drawables.a0, Rez.Drawables.a1, Rez.Drawables.a2, Rez.Drawables.a3, Rez.Drawables.a4, Rez.Drawables.a5, Rez.Drawables.a6, Rez.Drawables.a7, Rez.Drawables.a8, Rez.Drawables.a9, Rez.Drawables.a10, Rez.Drawables.a11, Rez.Drawables.a12, Rez.Drawables.a13, Rez.Drawables.a14, Rez.Drawables.a15, Rez.Drawables.a16, Rez.Drawables.a17, Rez.Drawables.a18, Rez.Drawables.a19, Rez.Drawables.a20, Rez.Drawables.a21, Rez.Drawables.a22, Rez.Drawables.a23, Rez.Drawables.a24, Rez.Drawables.a25, Rez.Drawables.a26, Rez.Drawables.a27, Rez.Drawables.a28, Rez.Drawables.a29, Rez.Drawables.a30, Rez.Drawables.a31, Rez.Drawables.a32, Rez.Drawables.a33, Rez.Drawables.a34, Rez.Drawables.a35, Rez.Drawables.a36, Rez.Drawables.a37, Rez.Drawables.a38, Rez.Drawables.a39, Rez.Drawables.a40, Rez.Drawables.a41, Rez.Drawables.a42, Rez.Drawables.a43, Rez.Drawables.a44, Rez.Drawables.a45, Rez.Drawables.a46, Rez.Drawables.a47, Rez.Drawables.a48, Rez.Drawables.a49, Rez.Drawables.a50, Rez.Drawables.a51, Rez.Drawables.a52, Rez.Drawables.a53, Rez.Drawables.a54, Rez.Drawables.a55, Rez.Drawables.a56, Rez.Drawables.a57, Rez.Drawables.a58];
        return WatchUi.loadResource(r[i]);
    }
    // </rez>

    function initialize() {
        View.initialize();
        var s = Application.Storage.getValue("alien");
        if (s != null && s >= 0 && s < NOMES.size()) { atual = s; }
        timer = new Timer.Timer();
    }

    function onShow() { timer.start(method(:tique), 50, true); }
    function onHide() { timer.stop(); }

    var t = 0;               // relógio da animação (1 = 50 ms)
    var avisou = -1;

    function tique() as Void {
        var agora = Time.now().value();
        t++;
        if (estado != PRONTO && t % 2 == 0) { WatchUi.requestUpdate(); }
        if (estado == PRONTO && t % 4 == 0) { WatchUi.requestUpdate(); }
        // últimos 10 s: bipe e piscar da tela, como o Omnitrix ficando sem energia
        if (estado == ALIEN && fimEm - agora <= 10 && fimEm - agora != avisou) {
            avisou = fimEm - agora; som([2600, 90]); luz(true);
        }
        if (quadro > 0) { quadro--; WatchUi.requestUpdate(); }
        if (estado == TRANSFORMANDO && quadro == 0) { estado = ALIEN; fimEm = agora + DURACAO; som([220, 120, 160, 250]); }
        if (estado == ALIEN && agora >= fimEm) { acabouTempo(); }
        if (estado == RECARGA && agora >= fimEm) { estado = PRONTO; vibrar(40, 150); som([1200, 80, 0, 40, 1800, 140]); luz(true); }
        if (quadro == 0 && (System.getClockTime().sec != ultimoSeg)) { ultimoSeg = System.getClockTime().sec; WatchUi.requestUpdate(); }
    }
    var ultimoSeg = -1;

    // ---------- som e luz ----------
    function som(notas) {
        if (!(Attention has :playTone) || !(Attention has :ToneProfile)) { return; }
        var p = [];
        for (var i = 0; i < notas.size(); i += 2) { p.add(new Attention.ToneProfile(notas[i], notas[i + 1])); }
        try { Attention.playTone({:toneProfile => p}); } catch (e) { }
    }
    function luz(liga) {
        if (Attention has :backlight) { try { Attention.backlight(liga); } catch (e) { } }
    }

    function vibrar(forca, ms) {
        if (Attention has :vibrate) { Attention.vibrate([new Attention.VibeProfile(forca, ms)]); }
    }

    // ---------- ações ----------
    function apertar() {
        if (estado == PRONTO) { estado = SELECAO; quadro = 6; vibrar(30, 60); luz(true); som([900, 40, 1300, 40, 1900, 70]); }
        else if (estado == RECARGA) { som([300, 150]); vibrar(50, 100); }
        else if (estado == SELECAO) {
            estado = TRANSFORMANDO; quadro = 20; luz(true);
            som([500, 60, 700, 60, 900, 60, 1200, 60, 1500, 60, 1900, 70, 2400, 80, 3000, 260]); Application.Storage.setValue("alien", atual);
            if (Attention has :vibrate) { Attention.vibrate([new Attention.VibeProfile(60, 120), new Attention.VibeProfile(0, 80), new Attention.VibeProfile(100, 400)]); }
        }
        WatchUi.requestUpdate();
    }
    function girar(dir) {
        if (estado == PRONTO) { estado = SELECAO; quadro = 6; }
        if (estado != SELECAO) { return; }
        atual = (atual + dir + NOMES.size()) % NOMES.size(); giro = dir; quadro = 4; vibrar(20, 30); som([2200, 18]);
        WatchUi.requestUpdate();
    }
    function voltar() {
        if (estado == SELECAO) { estado = PRONTO; som([1600, 40, 1000, 60]); WatchUi.requestUpdate(); return true; }
        if (estado == ALIEN || estado == TRANSFORMANDO) { acabouTempo(); return true; }
        return false;
    }
    function acabouTempo() {
        estado = RECARGA; fimEm = Time.now().value() + RECARGA_S; quadro = 0; avisou = -1; luz(true);
        som([1400, 120, 0, 60, 1400, 120, 0, 60, 900, 120, 600, 160, 350, 300]);
        if (Attention has :vibrate) { Attention.vibrate([new Attention.VibeProfile(80, 200), new Attention.VibeProfile(0, 150), new Attention.VibeProfile(80, 200)]); }
        WatchUi.requestUpdate();
    }

    // ---------- desenho ----------
    function silhueta(i) {
        if (bmpIdx != i) { bmp = null; bmp = imagem(i); bmpIdx = i; }
        return bmp;
    }

    function aro(dc, cx, cy, r, cor) {
        dc.setColor(0x555555, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, cy, r);
        dc.setColor(0x222222, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, cy, r * 0.86);
        dc.setColor(0x999999, Graphics.COLOR_TRANSPARENT);
        for (var k = 0; k < 4; k++) {
            var ang = Math.PI / 4 + k * Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang);
            var tx = -sa, ty = ca, rin = r * 0.87, rout = r * 0.99, lw = r * 0.07;
            dc.fillPolygon([[cx + ca * rin + tx * lw, cy + sa * rin + ty * lw], [cx + ca * rout + tx * lw, cy + sa * rout + ty * lw],
                            [cx + ca * rout - tx * lw, cy + sa * rout - ty * lw], [cx + ca * rin - tx * lw, cy + sa * rin - ty * lw]]);
        }
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, cy, r * 0.82);
        dc.setColor(cor, Graphics.COLOR_TRANSPARENT); dc.setPenWidth(r > 180 ? 3 : 2); dc.drawCircle(cx, cy, r * 0.82); dc.setPenWidth(1);
    }

    // brilho: anéis concêntricos que pulsam (escurecendo a cor para simular luz difusa)
    function escurece(cor, f) {
        var rr = ((cor >> 16) & 0xFF) * f, gg = ((cor >> 8) & 0xFF) * f, bb = (cor & 0xFF) * f;
        return (rr.toNumber() << 16) | (gg.toNumber() << 8) | bb.toNumber();
    }
    function halo(dc, cx, cy, r0, larg, cor, forca) {
        dc.setPenWidth(2);
        for (var k = 4; k >= 1; k--) {
            dc.setColor(escurece(cor, forca * (5 - k) / 6.0), Graphics.COLOR_TRANSPARENT);
            dc.drawCircle(cx, cy, r0 + larg * k / 4.0);
        }
        dc.setPenWidth(1);
    }
    function pulso(periodo) { return 0.55 + 0.45 * Math.sin(t * 2 * Math.PI / periodo); }

    function ampulheta(dc, cx, cy, r, cor, esc) {
        var a = r * 0.50 * esc, b = r * 0.58 * esc, cin = r * 0.07 * esc;
        dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon([[cx - a, cy - b], [cx + a, cy - b], [cx + cin, cy], [cx + a, cy + b], [cx - a, cy + b], [cx - cin, cy]]);
    }

    // escreve centralizado; se não couber na largura, tenta fonte menor e depois quebra por palavra
    function texto(dc, x, y, larg, txt, cor, fontes) {
        dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
        for (var i = 0; i < fontes.size(); i++) {
            if (dc.getTextWidthInPixels(txt, fontes[i]) <= larg) {
                dc.drawText(x, y, fontes[i], txt, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER); return;
            }
        }
        var f = fontes[fontes.size() - 1], sp = txt.find(" ");
        if (sp == null) { dc.drawText(x, y, f, txt, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER); return; }
        var hL = Graphics.getFontHeight(f) * 0.5;
        dc.drawText(x, y - hL, f, txt.substring(0, sp), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText(x, y + hL, f, txt.substring(sp + 1, txt.length()), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    function corda(r, dy) { var v = r * r - dy * dy; return v > 0 ? 2 * Math.sqrt(v) * 0.92 : 0; }

    function mmss(s) { return (s / 60).format("%d") + ":" + (s % 60).format("%02d"); }

    function onUpdate(dc) {
        var w = dc.getWidth(), h = dc.getHeight(), cx = w / 2, cy = h / 2;
        var r = (w < h ? w : h) / 2;
        if (dc has :setAntiAlias) { dc.setAntiAlias(true); }
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK); dc.clear();
        var verde = 0x22FF44, agora = Time.now().value();
        var ct = System.getClockTime();
        var hora = ct.hour.format("%02d") + ":" + ct.min.format("%02d");
        var fn = [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY];

        if (estado == PRONTO || estado == RECARGA) {
            var cor = estado == RECARGA ? 0xFF2200 : verde;
            aro(dc, cx, cy, r, cor);
            var pp = estado == RECARGA ? (t % 10 < 5 ? 1.0 : 0.35) : pulso(40);
            halo(dc, cx, cy, r * 0.62, r * 0.18, cor, pp);
            ampulheta(dc, cx, cy, r, escurece(cor, 0.6 + 0.4 * pp), 1.0);
            texto(dc, cx, cy - r * 0.34, r * 0.6, ct.hour.format("%02d"), Graphics.COLOR_BLACK, [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_LARGE]);
            texto(dc, cx, cy + r * 0.34, r * 0.6, ct.min.format("%02d"), Graphics.COLOR_BLACK, [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_LARGE]);
            if (estado == RECARGA) {
                texto(dc, cx, cy - r * 0.70, corda(r * 0.82, r * 0.70), "RECARREGANDO", 0xFF2200, fn);
                texto(dc, cx, cy + r * 0.70, corda(r * 0.82, r * 0.70), mmss(fimEm - agora > 0 ? fimEm - agora : 0), 0xFF2200, fn);
            } else {
                texto(dc, cx, cy - r * 0.70, corda(r * 0.82, r * 0.70), NOMES[atual], CORES[atual], fn);
                texto(dc, cx, cy + r * 0.70, corda(r * 0.82, r * 0.70), "START ESCOLHE", 0xBBBBBB, fn);
            }
            return;
        }

        if (estado == TRANSFORMANDO) {
            // clarão verde crescendo a partir do centro
            var p = (20 - quadro) / 20.0;
            if (p > 0.8) { dc.setColor(0xFFFFFF, 0xFFFFFF); dc.clear(); return; }
            dc.setColor(escurece(verde, 0.35), Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, cy, r * 1.4 * p);
            // raios girando
            dc.setColor(verde, Graphics.COLOR_TRANSPARENT);
            for (var k = 0; k < 12; k++) {
                var ang = k * Math.PI / 6 + p * 3, ca = Math.cos(ang), sa = Math.sin(ang), lw = r * 0.05;
                var r1 = r * 0.12, r2 = r * (0.3 + 1.2 * p);
                dc.fillPolygon([[cx + ca * r1, cy + sa * r1], [cx + ca * r2 - sa * lw, cy + sa * r2 + ca * lw], [cx + ca * r2 + sa * lw, cy + sa * r2 - ca * lw]]);
            }
            halo(dc, cx, cy, r * 0.9 * p, r * 0.25, verde, 1.0);
            dc.setColor(0xFFFFFF, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, cy, r * 0.10 + r * 0.6 * p);
            return;
        }

        if (estado == SELECAO) {
            var abre = 1.0 - quadro / 6.0;
            if (giro == 0 || quadro == 0) { abre = quadro > 0 && giro == 0 ? 1.0 - quadro / 6.0 : 1.0; }
            aro(dc, cx, cy, r, verde);
            // marcas do mostrador girando: posição do alien atual
            var n = NOMES.size();
            for (var i = 0; i < 24; i++) {
                var ang = -Math.PI / 2 + (i * 2 * Math.PI / 24) - (atual * 2 * Math.PI / n);
                dc.setColor(i == 0 ? verde : 0x226633, Graphics.COLOR_TRANSPARENT);
                dc.fillCircle(cx + Math.cos(ang) * r * 0.76, cy + Math.sin(ang) * r * 0.76, i == 0 ? r * 0.035 : r * 0.018);
            }
            var rd = r * 0.52 * (giro == 0 ? abre : 1.0);
            halo(dc, cx, cy - r * 0.04, rd, r * 0.10, verde, pulso(20));
            dc.setColor(verde, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, cy - r * 0.04, rd);
            if (quadro == 0 || giro != 0) {
                var img = silhueta(atual);
                var dx = giro != 0 ? giro * quadro * r * 0.10 : 0;
                dc.drawBitmap(cx - img.getWidth() / 2 + dx, cy - r * 0.04 - img.getHeight() / 2, img);
                // linha de varredura do holograma
                var yv = cy - r * 0.04 - rd + ((t * 6) % (2 * rd).toNumber());
                dc.setColor(0xAAFFBB, Graphics.COLOR_TRANSPARENT); dc.drawLine(cx - corda(rd, yv - cy + r * 0.04) / 2, yv, cx + corda(rd, yv - cy + r * 0.04) / 2, yv);
            }
            if (quadro == 0) { giro = 0; }
            var yN = cy + r * 0.60;
            texto(dc, cx, yN, corda(r * 0.82, r * 0.60), NOMES[atual], CORES[atual], fn);
            texto(dc, cx, cy - r * 0.66, corda(r * 0.82, r * 0.66), (atual + 1) + " DE " + n, 0xBBBBBB, [Graphics.FONT_XTINY]);
            return;
        }

        // ALIEN transformado
        var cor2 = CORES[atual], resta0 = fimEm - agora;
        if (resta0 <= 10 && t % 10 < 5) { cor2 = 0xFF2200; }
        dc.setColor(cor2, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, cy, r);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, cy, r * 0.93);
        dc.setColor(0x111111, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, cy - r * 0.05, r * 0.50);
        dc.setColor(cor2, Graphics.COLOR_TRANSPARENT); dc.setPenWidth(r > 180 ? 3 : 2); dc.drawCircle(cx, cy - r * 0.05, r * 0.50); dc.setPenWidth(1);
        var im2 = silhueta(atual);
        // silhueta preta sobre disco na cor do alien
        halo(dc, cx, cy - r * 0.05, r * 0.50, r * 0.14, cor2, pulso(30));
        dc.setColor(cor2, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, cy - r * 0.05, r * 0.48);
        dc.drawBitmap(cx - im2.getWidth() / 2, cy - r * 0.05 - im2.getHeight() / 2, im2);
        texto(dc, cx, cy - r * 0.72, corda(r * 0.93, r * 0.72), hora, Graphics.COLOR_WHITE, [Graphics.FONT_TINY, Graphics.FONT_XTINY]);
        texto(dc, cx, cy + r * 0.56, corda(r * 0.93, r * 0.56), NOMES[atual], CORES[atual], fn);
        var resta = fimEm - agora; if (resta < 0) { resta = 0; }
        texto(dc, cx, cy + r * 0.78, corda(r * 0.93, r * 0.78), mmss(resta), resta <= 30 ? 0xFF2200 : 0xBBBBBB, [Graphics.FONT_XTINY]);
    }
}

class OmnitrixDelegate extends WatchUi.BehaviorDelegate {
    var v;
    function initialize(view) { BehaviorDelegate.initialize(); v = view; }
    function onSelect() { v.apertar(); return true; }
    function onTap(evt) { v.apertar(); return true; }
    function onNextPage() { v.girar(1); return true; }
    function onPreviousPage() { v.girar(-1); return true; }
    function onSwipe(evt) {
        var d = evt.getDirection();
        if (d == WatchUi.SWIPE_LEFT || d == WatchUi.SWIPE_UP) { v.girar(1); return true; }
        if (d == WatchUi.SWIPE_RIGHT || d == WatchUi.SWIPE_DOWN) { v.girar(-1); return true; }
        return false;
    }
    function onBack() { return v.voltar(); }
}
