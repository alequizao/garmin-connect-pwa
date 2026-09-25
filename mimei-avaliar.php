<?php
/*
 * Garmin Connect PWA · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * ME MIMEI 1.15.0+: o relógio abre esta página no celular (menu → Avaliar na loja).
 * Quando o app tiver endereço fixo na Connect IQ Store, troque MIMEI_LOJA_URL.
 */
const MIMEI_LOJA_URL = 'https://apps.garmin.com/search?keywords=ME%20MIMEI';
header('Location: ' . MIMEI_LOJA_URL, true, 302);
