# Política de generación de imágenes

Este archivo define **cuándo** el agente genera una imagen y **cómo** debe pedirla.
Se inyecta literalmente en el system prompt en cada turno del chat: editalo y el
comportamiento cambia en el siguiente mensaje, sin tocar código ni reiniciar nada.

---

## Regla general

Generá una imagen cuando el slide **gana** con ella. No ilustres por ilustrar
(un carrusel donde cada slide tiene una imagen decorativa se ve genérico), pero
tampoco entregues ocho slides de texto plano cuando el tema pedía una imagen.

Como referencia: en un carrusel de 8 slides, **entre 1 y 4 imágenes** suele ser lo
correcto. Menos de 1 solo si el tema es puramente tipográfico (citas, listas,
datos). Más de 4 solo si el usuario pidió un carrusel visual o de portfolio.

Priorizá, en este orden:

1. El slide del hook, si una imagen refuerza el gancho.
2. Los slides donde una idea abstracta se entiende mejor mostrada que descrita.
3. El slide de cierre o CTA, si necesita peso visual.

## Generá una imagen (raster) cuando el elemento es

- Fotografía o algo que deba parecerlo.
- Ilustración, dibujo, personaje, escena.
- Textura, papel, grano, acuarela, ruido, degradado orgánico.
- Fondo con atmósfera (no un degradado plano — eso es CSS).
- Recorte de producto u objeto con fondo transparente.
- **Cualquier cosa dibujada a mano o con aspecto imperfecto**: flecha zigzag
  trazada a mano, subrayado de marcador, círculo hecho a mano alrededor de una
  palabra, tachado, garabato, asterisco irregular.
- **Formas orgánicas**: blobs, manchas, salpicaduras, siluetas irregulares.
- Burbujas de diálogo con estilo (cómic, manga, sticker), no un rectángulo redondeado.
- Iconografía ilustrada con estilo propio, cuando no exista ya en el carrusel.
- Collage, composición de elementos, superposición con perspectiva o profundidad.

## No generes imagen; hacelo en HTML/CSS o SVG inline cuando el elemento es

- Geometría plana simple: línea recta, rectángulo, círculo, triángulo, chevron.
- Degradados lineales o radiales limpios.
- Bordes, divisores, marcos, esquinas.
- Grillas, puntos, rayas, patrones repetitivos regulares.
- Barras de progreso, indicadores de paso, numeración.
- Sombras, glow, desenfoques.
- Texto de cualquier tipo. **Nunca pidas que la imagen contenga texto** — el
  modelo lo deforma y no podés editarlo después. El texto va siempre en HTML.

> Esta sección contradice a propósito la política por defecto de la herramienta,
> que desaconseja raster para todo lo expresable en HTML/CSS. Acá la excepción
> son los elementos *hechos a mano y orgánicos* de la lista de arriba: en CSS
> salen rígidos y falsos, y ese es justamente el punto de generarlos.

## Cómo pedir la imagen

**Fondo transparente por defecto** para cualquier elemento que se superponga al
slide (flechas, blobs, recortes, burbujas, iconos). Fondo opaco solo para fondos
de slide completos y fotos.

Incluí siempre en el prompt de la imagen:

1. Qué es, en una frase concreta.
2. El estilo, alineado a la marca (los `styleKeywords` de la marca activa).
3. La paleta: nombrá los colores de marca en hexadecimal.
4. `fondo transparente` (o el fondo explícito si va opaco).
5. `sin texto, sin letras, sin marca de agua`.

**Tamaños.** Pedí la imagen con dimensiones cercanas a su uso final, nunca más
chica:

| Uso | Tamaño |
|---|---|
| Fondo de slide completo 4:5 | 1080x1350 |
| Fondo de slide completo 1:1 | 1080x1080 |
| Fondo de slide completo 9:16 | 1080x1920 |
| Elemento superpuesto (flecha, blob, icono) | 1024x1024 |
| Recorte de producto / figura | 1024x1536 o 1536x1024 según orientación |

## Consistencia dentro del carrusel

Todas las imágenes de un mismo carrusel comparten estilo, paleta y tratamiento.
Repetí las mismas palabras de estilo en cada prompt. Si el carrusel ya tiene una
imagen generada, describila en el prompt de la siguiente para que peguen entre sí.

## Coste

Cada generación tarda entre 15 y 60 segundos y consume cuota de la suscripción.
No generes variantes especulativas: pedí una, mirá cómo queda en el slide, y
regenerá solo si no sirve.
