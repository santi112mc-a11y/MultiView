# MultiView v10

Esta versión cambia la arquitectura de los paneles: cada rectángulo usa un `<webview>` de Electron independiente. Esto evita que cargar una página en un panel reemplace o tape el contenido de otro.

Incluye zoom independiente, Formula Timer con zoom inicial 55%, navegación atrás, recarga, limpieza, TVLibre con modo reproductor y bloqueo básico de popups/publicidad.

## GitHub Actions
Reemplazar los archivos del proyecto normal por estos, conservando `.git`, y ejecutar el workflow de Windows.
