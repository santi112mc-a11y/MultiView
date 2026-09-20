# MultiView v11

Esta versión mantiene un `<webview>` independiente por panel, pero mueve el bloqueo de navegación/publicidad al proceso principal de Electron.

Cambios clave:
- Cada panel usa una partición persistente distinta.
- Se bloquean popups/ventanas nuevas desde los paneles.
- El bloqueo de publicidad se aplica a la sesión de cada webview.
- Las redirecciones publicitarias se bloquean desde `webContents.will-navigate` y `will-frame-navigate`.
- TVLibre no puede sacar la navegación principal del panel hacia otro dominio.
- Se conserva el zoom individual y Formula Timer al 55% inicial.
- `author` está incluido para que Squirrel pueda generar el instalador.
