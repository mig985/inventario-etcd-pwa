# Web para GitHub Pages

Esta carpeta es la parte que va a GitHub.

GitHub Pages sirve solo archivos estaticos, por eso la arquitectura queda asi:

```text
GitHub Pages
  index.html
  styles.css
  app.js
  manifest.webmanifest
  sw.js
  icon.svg
  icon-192.png
  icon-512.png
  apple-touch-icon.png

Google Apps Script
  Code.gs
  Google Sheet
  Telegram
```

## Pasos

1. Crear un repositorio en GitHub.
2. Subir los archivos de esta carpeta a la raiz del repo.
3. Ir a `Settings > Pages`.
4. Elegir `Deploy from a branch`.
5. Elegir la rama `main` y carpeta `/root`.
6. Pegar la URL publicada en el celular.

## Backend

Antes, en Google Apps Script:

1. Pegar la version actualizada de `Code.gs`.
2. Crear una Script Property:

```text
APP_SHARED_SECRET = una clave larga inventada por vos
```

3. Implementar como aplicacion web:

```text
Implementar > Nueva implementacion > Aplicacion web
Ejecutar como: Yo
Quien tiene acceso: Cualquier usuario con el enlace
```

4. Copiar la URL que termina en `/exec`.

## Primer uso

Al abrir la web de GitHub Pages, la app se conecta automaticamente al Apps Script configurado en `app.js`. No hay que cargar URL ni clave en el celular.

Si cambias la implementacion de Apps Script y se genera una URL nueva, actualiza la constante `APP_CONFIG.apiUrl` en `app.js`. Para evitar eso, conviene editar la implementacion web existente en Apps Script en vez de crear una nueva.

## Instalar en el celular

La web ya tiene manifest, service worker e icono de app.

En Android/Chrome, abrir la web y tocar el icono de descarga en la cabecera. Si el navegador ya ofrece instalacion nativa, aparece el dialogo de instalar.

En iPhone/Safari, tocar el icono de descarga para ver el recordatorio y despues usar:

```text
Compartir > Agregar a pantalla de inicio
```

## Nota importante

Apps Script no funciona como una API CORS normal. Por eso esta web usa JSONP: es una tecnica vieja, pero muy practica para una app privada y estatica en GitHub Pages.
