// Este archivo ya no se usa y se puede borrar.
//
// Antes, un proceso nocturno creaba las notificaciones de vencimiento y, en el mismo
// paso de limpieza, las volvía a borrar (por eso nunca aparecían). Ahora las
// notificaciones se calculan en el momento, en utils/notifications.js, a partir de
// los socios: siempre están al día y no dependen de que el servidor esté prendido a medianoche.
export async function runNotificationCronJob() {}
