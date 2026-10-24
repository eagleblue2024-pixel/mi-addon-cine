# Mi Addon para Nuvio

Base nueva e independiente con catálogo, búsqueda y reproducción directa. El nombre es provisional y no se modifica ningún addon anterior.

## Incluido

- Catálogo de películas y búsqueda por nombre y alias, con normalización de mayúsculas y acentos.
- Metadatos propios; no necesita una clave de TMDB.
- Una película de demostración: Big Buck Bunny, con enlace MP4 HTTPS.
- Estructura para series y episodios; el catálogo de series está vacío hasta añadir contenido.
- Página de instalación con enlace al manifiesto y botón para copiarlo.
- Servidor Node.js sin dependencias externas y configuración para Vercel.
- 38 pruebas automatizadas.

No integra ninguna web de películas ni genera enlaces para títulos que no estén configurados. No incluye proxy, torrents, descargas ni extracción de reproductores.

## Archivos importantes

| Archivo | Uso |
|---|---|
| `config.json` | Nombre, descripción, versión e identidad |
| `data/catalog.json` | Títulos, portadas y enlaces de reproducción |
| `lib/addon.js` | Protocolo y lógica del addon |
| `lib/home.html` | Página de instalación |
| `api/index.js` | Entrada para Vercel |
| `server.js` | Servidor local o para un hosting Node |
| `vercel.json` | Rutas para el despliegue |
| `test/addon.test.js` | Pruebas internas |

## Publicar desde Android

1. Descarga y extrae el ZIP con el administrador de archivos del teléfono.
2. Crea un repositorio nuevo en GitHub. Puede ser privado; no reutilices los proyectos anteriores.
3. Sube el contenido de la carpeta del proyecto. `package.json`, `config.json`, `vercel.json` y las carpetas deben quedar en la raíz del repositorio, no dentro de otra carpeta adicional. Si el navegador no permite subir carpetas, crea las rutas desde el editor de GitHub, archivo por archivo. Para este flujo no es obligatorio subir `.gitignore` ni `.env.example`.
4. En Vercel elige crear un proyecto e importa ese repositorio. Selecciona el preset **Other**, sin comando de compilación, y el directorio de salida **public**. La configuración incluida ya declara ese directorio. Usa Node.js 22.x.
5. Publica y abre el dominio permanente de producción que Vercel te asigne. No uses un enlace temporal de vista previa.
6. Comprueba `/manifest.json` en una pestaña privada sin sesión iniciada. Debe mostrar JSON, no un acceso a Vercel. Mantén protegidas las vistas previas si quieres; el dominio de producción del addon debe ser accesible para Nuvio.
7. En Nuvio busca la sección de addons, elige añadir mediante URL y pega el enlace que termina en `/manifest.json`. Los nombres de los controles varían según la edición.
8. Abre el catálogo del addon, selecciona Big Buck Bunny y prueba la fuente de reproducción.

El proyecto no está desplegado automáticamente. No se ha creado ni publicado un repositorio en tu cuenta y todavía no existe una URL de instalación real para este proyecto.

## Personalizar la identidad

Edita `config.json`: cambia `name`, `description` e `id`. Si cambias `idPrefix`, actualiza también los IDs de todos los títulos y episodios en `data/catalog.json`. Para cambiar la etiqueta de la fuente que verá Nuvio, edita `streams[].name` y `streams[].title` en ese archivo: no se renombran automáticamente desde la configuración.

La página de instalación usa el nombre configurado. Antes de una identidad definitiva también puedes adaptar el texto de `lib/home.html`. Al distribuir actualizaciones conserva el mismo `id` e incrementa `version`.

## Añadir películas

Duplica el objeto de Big Buck Bunny dentro del array `data/catalog.json` y modifica:

- `id`: identificador único que empiece con el prefijo configurado.
- `type`: `movie`.
- `name`, `description`, `poster`, `releaseInfo` y `genres`: datos de tu película.
- `aliases`: títulos alternativos verificados para el buscador.
- `streams`: enlaces HTTPS directos de reproducción, no enlaces a una página HTML.

Usa videos propios, autorizados o con una licencia compatible. Un catálogo o una ficha de película no proporciona automáticamente un video reproducible.

Las fuentes pueden tener `name`, `title` y `url`. La base no añade cabeceras, cookies ni credenciales. El video debe poder reproducirse directamente desde el dispositivo.

## Añadir series

Crea un objeto `type: "series"`, con un `id` propio y un array `videos`. Cada episodio necesita `id`, `title`, `released` en ISO 8601, `season`, `episode` y `streams`.

El ID de un episodio debe comenzar con el ID de la serie seguido de `:`. La ruta de metadatos usa el ID de la serie, mientras que la ruta de reproducción usa el del episodio. No se incluyen episodios ficticios en el catálogo publicado; las series de prueba viven únicamente en el archivo de tests.

## Ejecutar en Node

Se recomienda Node.js 22. Las pruebas de esta entrega se ejecutaron con Node.js 20.20.1.

```sh
npm test
npm start
```

El puerto local predeterminado es 7000. Para otro puerto configura `PORT` en el entorno de ejecución. `.env.example` solo es una referencia: el servidor no carga archivos `.env` automáticamente.

## Comprobaciones manuales

Abre estas rutas después del despliegue:

- `/manifest.json`
- `/catalog/movie/peliculas.json`
- `/catalog/movie/peliculas/search=bunny.json`
- `/meta/movie/miaddon:big-buck-bunny.json`
- `/stream/movie/miaddon:big-buck-bunny.json`
- `/health`

Estos últimos IDs corresponden al prefijo original; ajústalos si lo cambias.

Un JSON correcto no confirma reproducción en Android o TV. Es necesario comprobar instalación, catálogo, búsqueda, carga de la ficha, imagen, audio y avance del video en la versión concreta de Nuvio.

## Créditos

Big Buck Bunny: © 2008 Blender Foundation / www.bigbuckbunny.org. CC BY 3.0: https://creativecommons.org/licenses/by/3.0/. Información oficial: https://peach.blender.org/about/.

El MP4 completo con créditos usa un espejo externo listado en https://github.com/video-commander/public-test-streams. La portada procede de https://en.wikipedia.org/wiki/File:Big_buck_bunny_poster_big.jpg y se atribuye a Blender Institute / Blender Foundation bajo CC BY 3.0. No se redistribuye el video dentro del ZIP; los archivos remotos pueden cambiar o dejar de estar disponibles.
