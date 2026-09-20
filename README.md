# MultiView v9

Correcciones adicionales sobre v7: bloqueo de recursos publicitarios comunes, bloqueo de navegaciones publicitarias también dentro de iframes, limpieza visual de anuncios TVLibre, controles de zoom por panel y campo para elegir un porcentaje exacto.

Reemplazar los archivos del proyecto manteniendo `.git` y ejecutar el workflow de Windows.


### Cambio principal de v9
Cada panel usa un `WebContentsView` independiente en lugar de `BrowserView`. Esto evita que al cargar una URL en otro panel el contenido del panel anterior sea reemplazado o quede tapado por la vista nueva.
