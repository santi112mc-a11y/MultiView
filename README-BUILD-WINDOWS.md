# MultiView — compilación automática para Windows

Este proyecto está preparado para que GitHub Actions compile MultiView en un servidor Windows.

## Importante

El usuario final NO necesita instalar Node.js, Electron, Python ni Chrome.
Esas herramientas se utilizan únicamente en el servidor de compilación.

El ejecutable generado incluye Electron/Chromium y puede ejecutarse como aplicación de Windows.

## Cómo generar el EXE

1. Crear un repositorio en GitHub.
2. Subir TODO el contenido de esta carpeta al repositorio.
3. Abrir la pestaña **Actions**.
4. Entrar en **Build MultiView for Windows**.
5. Pulsar **Run workflow**.
6. Esperar a que termine la compilación.
7. Abrir la ejecución terminada.
8. En **Artifacts**, descargar **MultiView-Windows**.
9. Dentro estará el instalador `.exe`.

También se puede iniciar automáticamente creando un tag como `v1.0.0`.

## Qué conserva MultiView

- Hasta 30 paneles.
- Distribución automática o de 1 a 6 columnas.
- Navegación web mediante BrowserView/Chromium real.
- Formula-Timer sin depender de iframe.
- Tratamiento especial de TVLibre para mostrar únicamente el vídeo dentro del panel.
- Ajuste del vídeo dentro del rectángulo sin salir a fullscreen.
