# MultiView v13

Esta versión cambia la arquitectura de los paneles: ya no usa `BrowserView`, `WebContentsView` ni `<webview>` para el contenido remoto. Cada panel es un `<iframe>` real dentro del layout HTML.

Objetivo principal:
- cada panel mantiene su propio contenido sin tapar a los demás;
- ningún contenido remoto puede quedar flotando sobre la pantalla de configuración;
- los iframes están sandboxeados sin permiso de popups ni navegación superior;
- se bloquean endpoints publicitarios conocidos;
- se retiran restricciones de `X-Frame-Options`/CSP para los subframes embebidos desde la sesión Electron;
- Formula Timer arranca con zoom del 55%;
- TVLibre intenta reducirse al reproductor de video dentro de su panel.
