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
