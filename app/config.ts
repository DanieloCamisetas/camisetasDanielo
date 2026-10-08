/**
 * Configuración editable de la app.
 * Cambia aquí los valores y vuelve a desplegar.
 */

/**
 * Número de WhatsApp al que se envía la hoja de pedido.
 * Formato internacional SIN "+", espacios ni guiones: prefijo de país + número.
 * Ejemplo España: "34600111222". Déjalo vacío ("") para elegir el contacto
 * en cada envío.
 */
export const WHATSAPP_NUMBER = '34600000000';

/** Texto que acompaña al chat de WhatsApp cuando se abre en ordenador. */
export const WHATSAPP_MESSAGE = 'Hola, te paso la hoja de pedido 👕';

/**
 * Nombres bonitos para los parches de la carpeta /public.
 * La clave es el nombre del archivo sin extensión. Cualquier imagen nueva que
 * metas en /public aparece sola en el selector; si no está aquí, se muestra
 * con su nombre de archivo.
 */
export const PATCH_LABELS: Record<string, string> = {
  campeonesmundial: 'Campeones del Mundo',
  champions0: 'Champions',
  liga: 'Liga',
  mundialblanco: 'Camiseta Oscura',
  mundialdorado: 'Camiseta Clara',
  parchechampions: 'Parche Champions',
  parchechampions2: 'Parche Champions 2',
};

/** Tallas disponibles (pedido e inventario), en el orden en que se muestran. */
export const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '16', '18', '20', '22', '24', '26', '28', '30'];

/* ------------------------------------------------------------------ */
/*  Listas del inventario (las mismas que la hoja LISTAS del Excel).   */
/*  Puedes añadir o quitar valores; en la app también se puede escribir */
/*  cualquier otro a mano.                                             */
/* ------------------------------------------------------------------ */

export const INV_TEAMS = [
  'Real Madrid',
  'Barcelona',
  'Atlético de Madrid',
  'Manchester City',
  'Manchester United',
  'Liverpool',
  'Arsenal',
  'Chelsea',
  'Bayern',
  'PSG',
  'Juventus',
  'Inter',
  'AC Milan',
];

export const INV_SEASONS = ['26/27', '25/26', '24/25', '23/24', '22/23'];

export const INV_KITS = ['Home', 'Away', 'Third', 'Training', 'Portero', 'Especial'];

export const INV_LOCATIONS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3'];

/** Parches sin imagen en /public (los de /public salen solos con su foto). */
export const INV_EXTRA_PATCHES = [
  'Premier League',
  'Bundesliga',
  'Serie A',
  'Ligue 1',
  'Mundial de Clubes',
];

/* ------------------------------------------------------------------ */
/*  Precios, avisos y catálogo                                          */
/* ------------------------------------------------------------------ */

/** Suplemento sobre el PVP si la camiseta lleva nombre y/o dorsal (€). */
export const PRICE_EXTRA_NAME = 5;

/** Suplemento por cada parche (€). */
export const PRICE_EXTRA_PATCH = 3;

/** «Reponer»: modelos con ventas en los últimos 30 días y este stock o menos. */
export const LOW_STOCK = 2;

/** «Paradas»: camisetas con stock que no se venden desde hace estos días. */
export const STALE_DAYS = 60;

/** Título del catálogo público (/catalogo). */
export const CATALOG_TITLE = 'Camisetas de fútbol';

/** Texto inicial del WhatsApp que manda el cliente desde el catálogo. */
export const CATALOG_MESSAGE = 'Hola! Me interesan estas camisetas del catálogo:';
