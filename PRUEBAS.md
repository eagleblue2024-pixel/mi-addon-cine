# Validación de la entrega

Fecha: 24 de octubre de 2026.

## Verificado en este entorno

- Node.js 20.20.1: 38 pruebas aprobadas, 0 fallidas.
- Una prueba levanta un servidor HTTP real y consulta manifiesto y streams.
- Comprobaciones de catálogo, búsqueda parcial y alias, paginación, meta, episodios, CORS y entradas inválidas.
- MP4 de demostración: respuesta HTTPS 200; tipo video/mp4; admite solicitudes por rangos.
- FFprobe: video H.264, 1280 × 720; audio AAC; duración aproximada 596,47 segundos.
- FFmpeg: tres segundos decodificados sin errores.
- Portada remota: respuesta HTTPS 200; tipo image/jpeg.

## No verificado

- Despliegue real en Vercel, incluida la aplicación de sus reescrituras.
- Instalación o reproducción en el Nuvio del usuario, Android o TV.
- Reproducción completa, estabilidad prolongada y acceso desde la conexión del usuario.

Los tests usan datos sintéticos identificados como pruebas internas para comprobar código. No son películas reales ni forman parte del catálogo de demostración. La base de series está implementada, pero no se afirma haber validado series reales en el dispositivo.
