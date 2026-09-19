# MultiView Embedded

Esta versión usa Electron + BrowserView, por lo que cada panel es un navegador Chromium independiente.

## Qué resuelve
- Las páginas no dependen de `<iframe>`.
- Formula-Timer puede cargarse aunque el sitio bloquee `frame-ancestors`/iframes.
- Para TVLibre (`tvlibreonline.me`), el programa busca el elemento `<video>` y oculta el resto de la página, dejando el reproductor ocupando todo el rectángulo del panel.
- El video usa `object-fit: contain`, por lo que se mantiene completo sin recortarlo.
- Cada panel tiene URL, recargar y limpiar.
- Se puede arrastrar una URL/enlace a un panel.

## Ejecutar para probar
1. Instalar Node.js LTS.
2. Abrir una terminal en esta carpeta.
3. Ejecutar `npm install`
4. Ejecutar `npm start`

## Importante
Este ZIP es el proyecto fuente. No es un EXE ya compilado.
Para distribuirlo como EXE portátil habría que empaquetarlo con Electron/Forge/Builder en Windows.
