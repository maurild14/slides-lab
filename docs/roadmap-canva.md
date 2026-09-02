# Slides Lab → editor tipo Canva

> **Read this when** you want the history behind the Canva-style editor: what was
> asked for, in what order, and what was left out. It is an **archived plan**, all
> phases shipped — for how the editor works today read [canvas.md](canvas.md), and
> for why it is built this way read [decisions.md](decisions.md).

Roadmap conceptual por fases. Descripción de requerimientos y funcionalidad, no de implementación.

---

## Contexto

Slides Lab hoy es un generador de carruseles conducido por chat: escribís un pedido, un CLI de IA (Claude o Codex) escribe el HTML de cada slide, y vos exportás PNGs a medida de Instagram. Sobre eso ya existe una capa de edición manual embrionaria —arrastrar imágenes, redimensionar con handles, guías de alineación, un inspector con tipografía y color— pero está escondida detrás de un **botón "Edit"** que hay que activar, se rompe, y cuya sola existencia degrada la experiencia: al alternar el modo se remonta el iframe entero y se pierde el contexto visual.

El objetivo es convertirlo en un híbrido: **conserva todo lo que hace hoy** (generación por IA, marca, plantillas, export) y suma encima **la manipulación directa de Canva**: siempre editable, todo clickeable, cuadraditos de selección permanentes, rail de herramientas, formas, texto, capas, efectos.

Tres problemas concretos motivan el trabajo, en palabras del usuario:

1. **"Sacá el modo editar, encima se bugea"** — la app debe estar siempre en modo edición.
2. **"Los menús no andan"** — no hay ningún menú roto porque *no existe ninguno*: sólo tres `<select>` nativos con `appearance-none` a 28px de alto y 12px de texto, más botones que sólo aparecen en `:hover`. El problema real es que los controles son invisibles o imposibles de acertar.
3. **"Todo es muy chiquito"** — la voz tipográfica del editor entero es `text-xs` (12px) con etiquetas de `text-[10px]`/`text-[11px]` y controles de `h-7` (28px). No es un caso aislado: son 53 apariciones de `text-xs` en 24 archivos y 25 de `text-[10px]`/`text-[11px]`.

Resultado esperado: una herramienta que se siente como Canva, con la IA como una pestaña más del rail en vez de como la única forma de trabajar.

---

## Decisiones ya tomadas

| Decisión | Elección |
|---|---|
| **Modelo de datos** | El HTML sigue siendo la fuente de verdad. El DOM del iframe *es* el árbol de capas. |
| **Layout** | Rail de iconos a la izquierda (Diseño / Elementos / Texto / Imágenes / Marca / IA) que abre un panel. El chat vive dentro de la pestaña IA. |
| **Controles** | Toolbar contextual flotante sobre el canvas para lo frecuente; panel derecho para lo avanzado. |
| **Escala** | Base 15px, etiquetas 13px, secciones 14px, controles de 36px, primarios de 40px. |
| **Responsive** | Sólo escritorio, ≥1024px. |
| **IA vs edición** | Se guardan los cambios pendientes antes de que el agente escriba; el slide que está escribiendo queda bloqueado; los demás siguen editables. |
| **Alcance visual** | Toda la app, no sólo el editor. |
| **Entrega** | Por fases, con revisión entre cada una. |

---

## Fundamentos de arquitectura

Todo lo que sigue descansa sobre cinco decisiones estructurales. Se describen una vez acá porque atraviesan varias fases.

### El DOM es el árbol de capas

Los slides se guardan como HTML de nivel body: un `<div>` raíz de 1080×H con hijos posicionados en absoluto. Eso ya es un árbol de capas; no hace falta un modelo JSON paralelo. Lo que sí hace falta es **un contrato explícito** sobre ese DOM, para que el editor visual y el agente de IA hablen el mismo idioma:

- Cada elemento manipulable se identifica por su **tipo** (texto, imagen, forma, icono, grupo).
- Cada elemento puede llevar un **nombre legible** para el panel de capas; si no lo tiene, se deriva (su texto recortado, "Imagen", "Rectángulo").
- Cada elemento puede estar **bloqueado**: no se selecciona desde el lienzo, sólo desde el panel de capas.
- El orden de apilamiento es el orden en el DOM, reforzado con `z-index`.
- La rotación vive en el propio elemento como una transformación CSS.

Todo esto se expresa con atributos `data-*`, que el navegador ignora, el export atraviesa sin tocarlos, y el agente de IA puede escribir.

**Por qué importa:** el export por Puppeteer, el preview y la generación por IA funcionan hoy sobre HTML. Un modelo de objetos obligaría a reescribir los tres y a pedirle a la IA que genere JSON, que hace peor que HTML. Se confirmó además que el pipeline de export es una caja negra sin sanitización: `filter`, `transform: rotate`, degradados y `<svg>` inline ya funcionan sin tocar una línea del exportador.

### Siempre editable

Hoy el modo edición controla tres cosas a la vez: si el iframe permite leer su documento, si recibe clics, y si el inspector muestra algo. Al desaparecer el modo:

- El iframe se crea una sola vez por slide, ya preparado para editar. Desaparece el remontaje completo —y la recarga de fuentes— que hoy ocurre en cada toggle.
- El inspector deja de tener un estado "el modo edición está apagado".
- La capa de manipulación directa está siempre activa: seleccionás con un clic, siempre.

**El punto delicado:** hoy el único momento en que se garantiza que los cambios llegan al servidor es al *salir* del modo edición. Sin ese evento hay que crear puntos de guardado nuevos y explícitos: al cambiar de slide, al cerrar o abandonar la página, antes de exportar, y antes de que la IA escriba. El guardado con retardo que ya existe se mantiene, pero deja de ser la única red.

### Historial de deshacer real

El servidor guarda cinco versiones por slide y sólo sabe retroceder: una vez que sacaste una versión de la pila, se perdió, y no hay forma de volver adelante. Eso no alcanza para un editor donde cada arrastre, cada cambio de color y cada tecla es un paso.

Se necesita un **historial en memoria por slide**, con cursor: una lista de estados y una posición dentro de ella. Deshacer mueve el cursor hacia atrás, rehacer hacia adelante, y una acción nueva descarta lo que quedaba adelante. Se registra un estado **al cerrar cada gesto**, no durante: arrastrar un elemento de un lado al otro del slide es un paso, no doscientos.

El historial del servidor queda como respaldo entre sesiones. El local se pierde al recargar, igual que en Canva.

### Zoom, paneo y rotación

El slide se dibuja hoy a su tamaño real (1080px de ancho) y se achica con una transformación CSS para que entre en el contenedor. Toda la matemática de selección deriva de medir el rectángulo del iframe en pantalla, así que **el zoom y el paneo salen casi gratis**: se agregan como factores sobre esa misma escala y el resto de las conversiones siguen siendo correctas.

La rotación sí es trabajo genuino. Cuando un elemento está rotado:

- El recuadro de selección y los ocho handles tienen que dibujarse **rotados con él**, no como una caja alineada a los ejes.
- Al redimensionar, el movimiento del puntero tiene que proyectarse sobre los ejes propios del elemento: si arrastrás el handle derecho de un elemento girado 30°, el elemento crece en *su* dirección derecha, no hacia la derecha de la pantalla.
- El ajuste magnético a guías se calcula sobre la caja sin rotar. Es una aproximación deliberada: alinear cajas rotadas contra guías rectas no tiene una respuesta correcta única y Canva tampoco lo hace.

Esta es la parte más frágil de todo el trabajo y la que necesita verificación automática.

### Menús: infraestructura que no existe

No hay ni un popover, ni un dropdown, ni un menú contextual en toda la app. Hay tres `<select>` nativos y dos overlays a mano. Un editor tipo Canva necesita menús constantemente: selector de fuente, paleta de color, menú de efectos, clic derecho sobre un elemento.

Se incorporan primitivas de la misma familia que ya está en el proyecto (Radix, del que ya se usa el diálogo), para popover, menú desplegable y menú contextual. **No se agregan tooltips**: en el rail, las etiquetas de texto van visibles debajo de cada icono. Un icono sin etiqueta es exactamente el problema que el usuario está reportando.

---

## Fase 0 — Base visual y primitivas ✅

**Objetivo:** que exista un vocabulario visual antes de construir nada encima. Sin esto, cada componente vuelve a inventar sus propios tamaños, que es precisamente cómo se llegó al estado actual.

### Qué se construye

**Sistema de tokens.** Hoy el archivo de estilos globales define diez colores y tres curvas de animación. No define ni una sola medida: ni radios, ni tamaños de texto, ni alturas de control. Cada componente elige a mano. Se agrega:

- **Escala tipográfica** con nombres semánticos, no números sueltos: texto de sección, etiqueta de campo, valor de campo, cuerpo, título. Piso duro: nada por debajo de 12px en toda la app, y 13px como mínimo para cualquier cosa que sea una etiqueta.
- **Alturas de control**: compacto (32px, sólo para controles agrupados dentro de una fila), estándar (36px), primario (40px). Ningún control interactivo por debajo de 32px, y área de clic efectiva de 40px aunque el control se vea más chico.
- **Radios concéntricos**: el radio exterior de un contenedor es el radio interior más el espaciado. Es la regla que hace que las cosas anidadas no se vean "pellizcadas".
- **Elevación por sombras**, no por bordes: se define una escala corta (reposo, flotante, modal). Los bordes se reservan para separar estructura y para marcar estado, no para fingir profundidad.
- **Capas de z-index** nombradas: lienzo, overlay de selección, chrome pegajoso, popover, modal. Un editor con overlays flotantes sin una escala declarada termina con menús debajo del canvas.
- **Anillo de foco** visible y consistente, con la misma forma en toda la app.
- **Tokens propios del lienzo**: fondo del área de trabajo, color de las guías de alineación, color y grosor del recuadro de selección, tamaño de los handles.

**Paleta.** Se conserva la actual: neutros más un único acento. Es la decisión correcta para una herramienta de diseño —el chrome tiene que desaparecer para que lo único con color en pantalla sea el slide del usuario— y coincide con lo que recomienda el análisis de estilo para herramientas profesionales. Lo que se corrige es el contraste: varios grises actuales no llegan al mínimo de legibilidad.

**Primitivas nuevas:**

- *Popover* — base de selector de color, selector de fuente, menús de efectos.
- *Menú desplegable* — para los "más" de las toolbars, con navegación por teclado.
- *Menú contextual* — clic derecho sobre un elemento del lienzo.
- *Campo* — la pareja etiqueta + control, con la etiqueta siempre visible (nunca sólo el placeholder) y espacio reservado para el mensaje de error, para que nada salte cuando aparece.
- *Botón de icono* — con etiqueta accesible obligatoria y área de clic garantizada. Hoy cada botón de icono elige su propio tamaño: hay de 20, 24, 28 y 40px.
- *Segmentado* — la fila de opciones excluyentes (alineación de texto, por ejemplo), reemplazo del actual con texto de 11px.
- *Deslizador* — para opacidad, tamaño de fuente, intensidad de filtros. No existe ninguno hoy.
- *Entrada de color* — muestra de color más campo hexadecimal más popover con la paleta de marca. Hoy es un cuadrito de 16px.

**Primitivas existentes que se corrigen:** el botón (variantes de tamaño nuevas, y que la variante de icono deje de ser sobreescrita a mano en todos lados), la entrada de texto, la insignia, y los dos diálogos, que hoy usan tamaños distintos entre sí para lo mismo.

### Criterios de aceptación

- Ningún texto por debajo de 12px en toda la app; ninguna etiqueta por debajo de 13px.
- Ningún control interactivo con área de clic menor a 40×40px.
- Todo par texto/fondo pasa el mínimo de contraste; los textos secundarios también.
- Todo elemento interactivo tiene un estado de foco visible por teclado.
- Cada primitiva nueva funciona con teclado sola, sin mouse.

### Riesgo

Cambiar los tokens toca visualmente toda la app de golpe. Se hace primero y se revisa en pantalla antes de construir nada encima; es la fase más barata de corregir y la más cara de arrastrar mal.

---

## Fase 1 — Motor del lienzo ✅

**Objetivo:** que el lienzo se comporte como el de Canva. Es el corazón del pedido y la fase con la lógica más delicada.

### Qué se construye

**Desaparece el modo edición.** Se elimina el botón, el estado que lo respalda, y las tres formas en que se propaga hacia abajo. El iframe queda permanentemente preparado para editar. Como efecto secundario positivo, desaparece la recarga completa del slide que hoy ocurre cada vez que se alterna.

**Guardado sin red rota.** Al desaparecer el evento "salir del modo edición", se crean puntos de guardado explícitos: al cambiar de slide, al abandonar la página, antes de exportar, y antes de que el agente de IA escriba. El guardado con retardo se mantiene para el trabajo continuo.

**Zoom y paneo.** Controles de zoom (25% a 400%), ajustar a pantalla, tamaño real. Rueda con Ctrl para acercar sobre el puntero, barra espaciadora más arrastre para desplazar, y también arrastre con el botón del medio. El nivel de zoom se muestra siempre y es clickeable para elegir un valor.

**Rotación.** Un handle dedicado sobre el borde superior de la selección. Rota libremente, y con Shift salta de a 15°. El ángulo se muestra mientras rotás. El recuadro de selección acompaña la rotación.

**Selección múltiple.** Shift más clic suma o quita elementos. Arrastrar sobre área vacía dibuja un rectángulo de selección que toma todo lo que toca. Con varios elementos seleccionados aparece una caja envolvente común: moverla mueve todo el conjunto, redimensionarla escala el conjunto.

**Deshacer y rehacer.** Ctrl+Z y Ctrl+Shift+Z, con historial por slide y un paso por gesto. Botones visibles en la barra superior, deshabilitados cuando no hay nada que deshacer —deshabilitados de verdad, no sólo grises.

**Duplicar, copiar y pegar.** Ctrl+D duplica en el lugar con un pequeño desplazamiento. Ctrl+C / Ctrl+V copian y pegan, **también entre slides distintos**. Alt más arrastre duplica mientras movés. Se soporta además pegar una imagen desde el portapapeles del sistema operativo, que se sube y se inserta.

**Alinear y distribuir.** Seis acciones de alineación (izquierda, centro horizontal, derecha, arriba, centro vertical, abajo) más dos de distribución (horizontal y vertical). Con un solo elemento seleccionado, alinea respecto del slide; con varios, respecto de la selección.

**Orden de capas.** Traer al frente, traer adelante, enviar atrás, enviar al fondo, con atajos de teclado. Hoy sólo hay un campo numérico de z-index.

**Bloquear y agrupar.** Un elemento bloqueado no se selecciona desde el lienzo —sólo desde el panel de capas— y no se mueve ni se borra por accidente. Agrupar toma varios elementos y los trata como uno solo para mover, escalar y rotar; desagrupar revierte, conservando las posiciones.

**Menú contextual.** Clic derecho sobre un elemento: duplicar, copiar, pegar, copiar estilo, pegar estilo, orden de capa, bloquear, agrupar, eliminar. Clic derecho sobre área vacía: pegar, seleccionar todo, fondo del slide.

**Teclado completo.** Flechas para mover de a 1px, con Shift de a 10px. Escape deselecciona. Ctrl+A selecciona todo. Supr elimina. Tab recorre elementos. Un panel de atajos accesible desde la barra superior.

**Retroalimentación visual permanente.** Es el punto que más pesa en el pedido — "que los cursores no desaparezcan, que pueda clickear algo siempre":

- Al pasar por encima de un elemento, contorno tenue; al seleccionarlo, contorno sólido más handles.
- El cursor cambia según lo que hay debajo: mover, redimensionar según el eje, rotar, texto.
- Las guías de alineación aparecen mientras arrastrás, junto con las distancias respecto de los márgenes seguros.
- Durante un arrastre, un indicador con la posición y el tamaño en píxeles.
- Nada de esto depende de `:hover` para existir: los estados también aparecen con foco de teclado.

**Bloqueo durante la generación.** Cuando el agente de IA arranca a escribir, primero se guarda lo pendiente. Después, los slides que el agente está modificando muestran un estado "generando" y no aceptan gestos; los demás siguen editables. Al terminar, los slides afectados se recargan con lo nuevo. Como los cambios locales se guardaron antes de empezar, quedan en el historial del servidor y son recuperables.

### Criterios de aceptación

- Se puede seleccionar, mover, rotar, escalar y borrar un elemento sin tocar ningún botón de modo.
- Deshacer recupera exactamente el estado anterior a cada gesto, no un estado intermedio.
- Copiar en el slide 1 y pegar en el slide 3 funciona.
- Con zoom al 400% y el lienzo desplazado, la selección sigue cayendo exactamente sobre el elemento clickeado.
- Un elemento rotado 45° se redimensiona en sus propios ejes.
- Nada de lo anterior se pierde al cambiar de slide o cerrar la pestaña.

### Verificación automática

El proyecto ya tiene un patrón de auto-chequeo sin framework de testing: funciones puras en las librerías y un script de aserciones que se corre por npm. Se extiende con los cálculos nuevos: proyección del redimensionado bajo rotación, ajuste magnético con rotación, caja envolvente de una selección múltiple, avance y retroceso del cursor del historial, y el factor de escala del cambio de proporción. Es el chequeo más barato posible y falla ruidosamente si la geometría se rompe.

### Riesgos

**Geometría.** La rotación combinada con zoom, paneo y selección múltiple es donde se acumulan los errores sutiles: todo "casi funciona" y se nota recién con un elemento rotado, con zoom, cerca de un borde. De ahí la insistencia en el auto-chequeo.

**Escrituras que se pisan.** Encontrado durante la exploración, no reportado por el usuario: el almacenamiento serializa las escrituras pero no el ciclo completo de leer-modificar-escribir. Dos operaciones simultáneas sobre el mismo carrusel pueden leer el mismo estado previo y escribir una encima de la otra, perdiendo una de las dos. Hoy casi no se nota porque hay pocas escrituras; este trabajo multiplica su frecuencia —cada gesto guarda— y encima suma al agente de IA escribiendo en paralelo. Se corrige en esta fase extendiendo el bloqueo a todo el ciclo, no sólo a la escritura. Es barato ahora y muy caro de diagnosticar después, porque el síntoma es "se me perdió un cambio" sin ningún error visible.

---

## Fase 2 — Rail de herramientas y paneles ✅

**Objetivo:** que haya de dónde sacar cosas. Hoy sólo se pueden arrastrar imágenes, y desde un panel escondido dentro del inspector.

### Qué se construye

**El rail.** Columna fija a la izquierda, de ancho suficiente para icono más etiqueta de texto debajo. Seis destinos: Diseño, Elementos, Texto, Imágenes, Marca, IA. El destino activo se marca de forma inequívoca —no sólo por color—. Al elegir uno se abre el panel correspondiente; volver a tocarlo lo cierra y devuelve el espacio al lienzo.

**Panel Diseño.** Plantillas guardadas y presets de estilo, que hoy existen en el modelo de datos pero apenas tienen superficie. Aplicar una plantilla al carrusel, un preset de estilo al slide. Fondo del slide: color sólido, degradado, o imagen.

**Panel Elementos.** El que más cambia la sensación del producto.

- **Formas básicas** — rectángulo, rectángulo redondeado, círculo, píldora, triángulo, rombo, estrella, polígonos. Las que se pueden hacer con un contenedor y un radio se hacen así, porque se redimensionan sin deformar el trazo; las que necesitan vectores se dibujan como tales.
- **Líneas y flechas** — recta, con punta, punteada, con grosor ajustable.
- **Iconos** — la biblioteca de iconos que ya usa la app se expone como catálogo buscable y se inserta en el slide. Son unos 1500 iconos vectoriales sin agregar ninguna dependencia nueva.
- **Buscador** que filtra sobre todo el panel.
- Cada elemento se arrastra al lienzo o se hace clic para insertarlo centrado. Ambas rutas siempre disponibles: obligar a arrastrar es lo que hace que una herramienta "no ande".
- El arrastre captura el puntero al apretar. Sin eso muere al cruzar al iframe, porque los eventos de puntero pasan al realm del slide y el documento padre —donde escucha el soltar— no vuelve a enterarse de nada.

**Panel Texto.** Presets arrastrables —Título, Subtítulo, Cuerpo, Cita, Etiqueta— que llegan al slide ya con la tipografía y el peso de la marca. Combinaciones tipográficas guardadas: un par de fuentes que se aplica de una.

**Panel Imágenes.** Se muda acá lo que hoy vive dentro del inspector, y crece: subir archivos (con zona de arrastre), generar con IA a partir de un texto, y una galería de todo lo generado y subido, con búsqueda. Cada imagen se arrastra al slide o reemplaza la imagen seleccionada.

**Panel Marca.** Colores de la marca como muestras clickeables que aplican al elemento seleccionado, fuentes, logo. Hoy la configuración de marca es una pantalla aparte; acá se vuelve una herramienta de trabajo.

**Panel IA.** El chat completo se muda a esta pestaña: mensajes, entrada, selector de motor, imágenes de referencia. Suma un modo nuevo: con un elemento seleccionado, pedirle a la IA que lo modifique, mandándole ese elemento como contexto en vez de tener que describirlo con palabras.

**Panel de capas.** Vive a la derecha, no en el rail, porque se consulta mientras trabajás. Lista los elementos del slide activo en orden de apilamiento, cada uno con su icono de tipo, su nombre editable, y dos interruptores: visible y bloqueado. Se reordena arrastrando. Seleccionar en la lista selecciona en el lienzo y viceversa. Los grupos se pliegan y despliegan.

### Criterios de aceptación

- Todo lo que se puede arrastrar también se puede insertar con un clic.
- Ningún panel depende de `:hover` para revelar una acción.
- El rail se navega entero con teclado y el destino activo se anuncia.
- El panel de capas y el lienzo nunca muestran selecciones distintas.

### Cómo quedó

- **Rail** con las seis pestañas, icono más etiqueta visible, y estado activo marcado por color *y* por `aria-pressed`. Volver a tocar la pestaña activa cierra el panel.
- **Elementos**: 12 formas (contenedor con radio o `clip-path`), 6 líneas y flechas, y los 1695 iconos de Lucide, buscables. El catálogo de iconos se congela en `public/icon-catalog.json` con `npm run build:icons`: una descarga que el navegador cachea, en vez de 1695 componentes React en el bundle.
- **Texto**: 7 presets que nacen con la tipografía y el color de la marca, más 6 combinaciones tipográficas que reescriben la marca.
- **Imágenes**: se mudó fuera del inspector y ganó zona de arrastre para subir, generación por IA, buscador y "Reemplazar" sobre la imagen seleccionada.
- **Marca**: los colores se aplican a relleno, texto o borde según un selector explícito; las fuentes y el logo también.
- **Diseño**: fondo del slide (color sólido o seis degradados derivados de la marca), plantillas del mismo formato aplicables al slide actual, y estilos guardados.
- **IA**: el chat se mudó a la pestaña y suma contexto de selección — con un elemento seleccionado, el pedido viaja con su HTML y la UI lo muestra como "Sobre: …".
- **Capas**: lista en orden de apilamiento (arriba primero), reordenable arrastrando, con nombre editable a doble clic, y visible/bloqueado siempre a la vista (no aparecen sólo con `:hover`). La selección va en los dos sentidos.

**Simplificaciones deliberadas de esta fase**

- Las flechas son SVG con `viewBox`: un redimensionado no proporcional estira la punta junto con el cuerpo. Shift mantiene la proporción.
- Sólo se ofrecen plantillas del mismo formato que el carrusel; el re-maquetado entre proporciones es de la Fase 4.
- Aplicar un estilo guardado cambia la paleta y las fuentes de la marca; su slide de ejemplo se aplica aparte, para que un preset nunca borre tu trabajo sin que lo pidas.
- Las combinaciones tipográficas son una lista corta a mano, no una matriz generada.

---

## Fase 3 — Toolbar contextual y panel avanzado ✅

**Objetivo:** que editar las propiedades de un elemento sea inmediato y no un viaje a un panel de 280px con texto de 11px.

### Qué se construye

**La toolbar contextual.** Barra horizontal fija arriba del lienzo, que **cambia según el tipo** de lo seleccionado:

- *Texto* — familia, tamaño, negrita/cursiva/subrayado, color, alineación, espaciado, lista, efectos, posición, transparencia.
- *Imagen* — recortar, filtros, transparencia, bordes, sombra, reemplazar, posición.
- *Forma* — relleno, borde, radio, transparencia, posición.
- *Varios elementos* — alinear, distribuir, agrupar, posición.
- *Nada seleccionado* — fondo del slide, notas del slide, tamaño.

Lo frecuente se ve directo; lo demás abre un popover o el panel derecho. La barra nunca tapa la selección porque no está encima de ella.

**Panel avanzado (derecho).** Secciones plegables, y sólo aparece cuando la pedís desde la toolbar:

- **Efectos de texto** — sombra, contorno, resaltado, neón, eco. Todos se construyen con propiedades de texto nativas, que el exportador ya atraviesa sin problema.
- **Filtros de imagen** — brillo, contraste, saturación, desenfoque, escala de grises, sepia, giro de tono, más duotono. Con presets nombrados además de los deslizadores, y un botón de restablecer. También son filtros CSS nativos: cero trabajo en el exportador.
- **Recorte y marcos** — recortar arrastrando dentro de la imagen; marcos con forma (círculo, arco, estrella, blob) que enmascaran la imagen. Espejar horizontal y vertical.
- **Bordes y sombra** — para imágenes y formas.
- **Espaciado y posición** — relleno interno, coordenadas exactas, tamaño exacto, ángulo, con la opción de mantener proporción.

**Edición de texto en el lienzo.** Doble clic sobre un texto y escribís ahí mismo, con el cursor donde tocaste. Hoy hay que ir a un área de texto en el inspector. La lógica que preserva el formato de las palabras individuales al reescribir ya existe y se reutiliza.

### Criterios de aceptación

- Cambiar la fuente de un título son dos clics, no cinco.
- Cada control muestra el valor real del elemento seleccionado, incluso si vino del HTML generado por la IA.
- Todo cambio es un paso de deshacer.
- Los efectos y filtros se ven idénticos en el preview y en el PNG exportado.

### Cómo quedó

**La barra contextual** (`ContextToolbar.tsx`) es una fila fija arriba del lienzo, no una burbuja que sigue a la selección: una burbuja tapa los elementos que están cerca del borde superior y mueve cada control de lugar entre un clic y el siguiente. La fila conserva su altura aunque no haya nada seleccionado, así el lienzo —y su zoom— nunca se corren. Cuatro variantes: texto (fuente, tamaño, B/I/S, alineación, color, Efectos), imagen (Reemplazar, Recortar, Filtros, Marco), forma o icono (relleno, radio, borde) y selección múltiple (alinear, distribuir, agrupar). Todas terminan igual: opacidad, posición exacta, duplicar, eliminar.

**El panel avanzado** es el inspector, reescrito como compositor sobre tres archivos de secciones y traducido entero al castellano. Suma Efectos de texto (6, con vista previa y color propio), Filtros (8 presets con miniatura de la imagen real + 7 deslizadores + restablecer), Encuadre (recorte arrastrando, ajuste, espejar), Marco (6 recortes) y Borde y sombra. La barra le pide una sección con un contador, no con un booleano, para que pedir dos veces la misma la vuelva a abrir.

**Una sola lectura del elemento** (`use-element-style.ts`) alimenta la barra y el panel, así nunca se contradicen. Todo lo que se escribe pasa por `setStyle`, que es un solo paso de deshacer.

**Escribir en el slide**: doble clic sobre un texto y escribís ahí, con el cursor donde tocaste. Escape o un clic afuera lo cierra.

Simplificaciones deliberadas:

- El panel avanzado vive siempre en la columna derecha en vez de aparecer bajo demanda: la columna ya existe para las capas, y un panel que aparece y desaparece mueve cada control debajo del cursor. La barra contextual sigue el mismo criterio.
- El recorte es `object-fit: cover` + `object-position`, no un recorte destructivo. Es el que sobrevive al export sin tocar nada; uno destructivo pediría un pase por canvas y un archivo nuevo.
- El duotono es una pila de filtros nativos, no un mapeo real de dos colores (eso necesita `feComponentTransfer` en SVG).
- El color del efecto de texto no se vuelve a leer del CSS: se siembra de la marca y se reaplica al cambiarlo.
- "Resaltado" quedó afuera de los efectos: un texto con fondo es un relleno, y Relleno ya lo hace.

---

## Fase 4 — Páginas, estilos y exportación ✅

**Objetivo:** cerrar el ciclo de trabajo sobre el carrusel completo, no sobre un slide aislado.

### Qué se construye

**Duplicar slide.** No existe hoy a ningún nivel: ni en la librería de datos, ni como ruta de API, ni en la interfaz. Se agrega siguiendo el mismo patrón que ya usa la duplicación de carruseles.

**Aplicar a todas las páginas.** Fondo, pie, o un elemento concreto, propagado a todos los slides del carrusel, con confirmación previa porque no es trivial de revertir.

**Copiar y pegar estilo.** Tomás el aspecto de un elemento —tipografía, color, relleno, radio, efectos— y se lo aplicás a otro sin tocar su contenido ni su posición.

**Cambio de proporción con re-maquetado.** Hoy cambiar de 4:5 a 9:16 sólo cambia un número: el contenido queda donde estaba, mal encuadrado. Se agrega el reescalado real de todas las medidas del slide al nuevo lienzo. Es una operación aproximada por naturaleza —ningún reflow automático da un resultado perfecto—, así que se ofrece siempre con vista previa y es un paso de deshacer.

**Formatos de exportación.** Hoy sólo PNG en un ZIP. Se suma JPG con calidad ajustable, PDF de todo el carrusel, PNG con fondo transparente, y exportar un solo slide en vez del carrusel completo. El motor de renderizado ya soporta todo esto; es superficie, no motor.

**El prompt del agente se actualiza.** El agente hoy no sabe nada de formas, SVG, rotación, filtros ni convenciones de capas: si genera algo así es por casualidad. Se le documentan las convenciones nuevas para que lo que escribe sea seleccionable y editable con las mismas herramientas que lo hecho a mano. Sin esto quedan dos mundos: lo que hace la IA y lo que hacés vos.

### Criterios de aceptación

- Un carrusel de 4:5 pasado a 9:16 queda encuadrado y sin desbordes.
- Los slides generados por la IA después del cambio de prompt se seleccionan y editan igual que los hechos a mano.
- Cada formato de exportación produce un archivo que abre correctamente en su visor.

### Cómo quedó

- **Duplicar slide** ya existía en la librería de datos; faltaba la ruta (`POST .../slides/{id}/duplicate`) y el botón, que vive en la miniatura junto a deshacer y eliminar. Después de duplicar el editor salta a la copia, no al último slide: `fetchCarousel` acepta un `focusSlideId` que desactiva la regla de "seguir al slide más nuevo", que es para cuando el agente agrega slides al final.
- **Aplicar a todas** vive en el menú contextual (el elemento seleccionado, o el fondo si hacés clic derecho en vacío) y como botón en la barra contextual. Reescribe el HTML guardado de los otros slides con `DOMParser`, sin montar sus iframes; el slide activo se saltea a propósito, porque ya tiene el cambio en pantalla y reenviarlo recargaría su iframe y perdería la selección.
- **Copiar y pegar estilo** es un pincel: `Ctrl Alt C` / `Ctrl Alt V`, o los dos botones de la barra. `STYLE_COPY_PROPS` deja afuera posición, tamaño, rotación y capa, y limpia todas las propiedades copiables antes de aplicar, para que un neón no sobreviva debajo de un estilo plano.
- **Cambio de proporción**: como todo formato de Instagram mide 1080 de ancho, escalar x e y por separado sólo deformaría; se usa un factor uniforme `min(sx, sy)` y se vuelve a centrar el contenido. El diálogo ofrece las dos salidas — "Reajustar el contenido" y "Solo cambiar el lienzo" — y cada slide conserva su versión anterior en el servidor.
- **Exportación**: PNG, JPG, PNG sin fondo (`omitBackground`) y PDF, todo el carrusel o un solo slide. Un archivo solo se descarga solo; varios van en ZIP. El PDF se arma con los PNG ya rasterizados en vez de imprimir el documento vivo: imprimir vuelve a maquetar bajo `media print` y cualquier unidad de viewport se corre de lugar.
- **El prompt del agente** ahora documenta las convenciones del lienzo: un hijo absoluto por cosa clickeable, `data-oc-name`, `z-index`, rotación en el propio `transform`, formas con `border-radius` o SVG, efectos con CSS nativo, y no tocar `data-oc-lock` / `data-oc-group` / `data-oc-hidden`.

**Simplificaciones deliberadas.**

- El re-maquetado no tiene vista previa en vivo: el diálogo explica qué va a pasar y el historial del servidor deshace por slide. Una previa real necesita renderizar los N slides al lienzo nuevo antes de escribir nada.
- El reflow es un factor uniforme más una traslación, sin anclajes por elemento. Si deja de alcanzar, el paso siguiente es declarar el anclaje (arriba / abajo / centro) en un `data-*`.
- El PDF sale rasterizado. Si alguna vez hace falta texto seleccionable, hay que imprimir el documento vivo y aceptar el re-maquetado.
- El duotono y "aplicar a todas" no diferencian pie de página de un elemento cualquiera: se copia lo que tengas seleccionado, arriba de todo.

---

## Fase 5 — Resto de la app y repaso final ✅

**Objetivo:** que no haya un salto visible entre el editor nuevo y el resto de la aplicación, y verificar el conjunto.

### Qué se construye

**Restyle del resto:** el dashboard de carruseles, la configuración de marca, la galería de plantillas y los diálogos. La mayor parte se propaga sola desde los tokens de la Fase 0; lo que queda son ajustes puntuales de tamaño y espaciado. Se aprovecha para migrar los dos overlays hechos a mano —la configuración de marca y el visor de imágenes de referencia— a la primitiva de diálogo que ya existe, en vez de dejarlos como implementaciones paralelas.

**Estados vacíos y de error.** Un editor tiene muchos: carrusel sin slides, slide sin elementos, panel de imágenes vacío, generación fallida, exportación fallida. Cada uno con un mensaje que explique qué pasó y qué hacer, no un espacio en blanco.

**Repaso transversal** con las disciplinas correspondientes: accesibilidad (foco, teclado, lectores de pantalla, movimiento reducido), maquetación (agrupación, orden de lectura, jerarquía), redacción de interfaz (etiquetas, errores, estados vacíos), tipografía, color y pulido visual. Se revisa la interfaz terminada, no cada pieza por separado.

### Criterios de aceptación

- La app entera se opera con teclado.
- Se respeta la preferencia de movimiento reducido del sistema.
- Ningún estado vacío es un espacio en blanco.
- No hay dos componentes que resuelvan lo mismo de dos maneras distintas.

### Cómo quedó

- **Un bug real de la Fase 0, encontrado acá**: `cn()` usaba `twMerge` sin configurar, así que leía `text-body` como `text-{color}` y borraba el color que venía antes. Todo botón `bg-foreground` quedaba con texto casi negro sobre relleno casi negro — literalmente ilegible, y no se veía hasta abrir un diálogo. `src/lib/utils.ts` ahora registra la escala tipográfica como grupo `font-size`. **Cualquier token nuevo de la escala hay que agregarlo ahí también.**
- **Dashboard** reescrito: castellano, tokens, tarjetas con *stretched link* (el título es el enlace y su `::after` cubre la tarjeta) en vez de un `div` con `onClick`, así se navega con Tab y los dos botones de acción conservan su propia parada de foco. Duplicar y eliminar dejaron de aparecer sólo con `:hover`. Pestañas con `role="tablist"` y flechas.
- **Estados de error de verdad**: el dashboard y la galería distinguen "no hay nada" de "no pudimos cargar", con botón de reintentar. Crear, duplicar, eliminar, subir y "guardar como plantilla" avisan cuando fallan; antes fallaban en silencio.
- **`EmptyState`** es la única primitiva de estado vacío/error (`tone="error"`). Reemplaza tres copias con iconos y escalas distintas.
- **Los dos overlays a mano murieron**: la configuración de marca y el visor de imágenes de referencia usan `DialogShell`. Ganan foco atrapado, Escape y la misma animación que el resto.
- **Miniaturas diferidas**: los iframes de sólo lectura llevan `loading="lazy"`. El dashboard montaba un documento completo por tarjeta.
- **Movimiento reducido** también apaga los esqueletos que laten y frena los spinners.
- **`lang="es"`** en el documento: la interfaz está en castellano y se anunciaba como inglesa.

**Simplificaciones deliberadas de esta fase**

- El re-maquetado de proporción sigue sin vista previa en vivo; el diálogo explica la operación y el historial por slide del servidor la deshace.
- No hay sistema de toasts: los errores se muestran en el lugar donde ocurrieron (`role="alert"`), que es donde el usuario está mirando. Vale agregar toasts si aparece una acción que termine fuera de la vista.
- Los valores guardados de `styleKeywords` siguen en inglés — los lee el agente; sólo se tradujeron las etiquetas.

---

## Archivos que se tocan

No es una lista exhaustiva; es el mapa de dónde vive cada cosa.

**Se reescriben a fondo**
- `src/app/globals.css` — tokens (Fase 0).
- `src/app/carousel/[id]/page.tsx` — hoy concentra estado, layout y guardado; se reparte y se le saca el modo edición.
- `src/components/editor/SlideCanvas.tsx` — el motor de manipulación; crece con rotación, multi-selección, agrupación.
- `src/lib/canvas-utils.ts` — geometría; se le suma rotación, cajas envolventes y escalado.
- `src/components/editor/inspector/` — se disuelve en la toolbar contextual más el panel avanzado.

**Se ajustan**
- `src/components/editor/SlideRenderer.tsx` — el iframe queda siempre editable; se le agrega zoom y paneo.
- `src/components/editor/SlideFilmstrip.tsx` — duplicar, estado "generando", acciones que no dependan de `:hover`.
- `src/components/layout/TopBar.tsx` — deshacer/rehacer, zoom, atajos.
- `src/components/ui/*` — primitivas existentes y nuevas.
- `src/lib/carousels.ts` — duplicar slide.
- `src/lib/export-slides.ts` — formatos nuevos.
- `src/lib/chat-system-prompt.ts` — convenciones de elementos nuevas.
- `scripts/check-canvas.ts` — aserciones nuevas.

**Se crean**
- El rail y sus paneles.
- El panel de capas.
- La toolbar contextual.
- El historial de deshacer/rehacer.
- El catálogo de formas e iconos.
- Ruta de API para duplicar slide.

**Se reutiliza en vez de reescribir:** la geometría de conversión pantalla↔slide y el ajuste magnético que ya existen; la inserción de imágenes flotantes; la preservación de formato al reescribir texto; el envoltorio de HTML compartido entre preview y export; el almacenamiento con bloqueo y escritura atómica; el sistema de animaciones y las curvas de movimiento que ya están definidas.

---

## Subagentes y modelos

Criterio: **razonamiento alto donde un error es sutil y caro de encontrar; capacidad media donde el trabajo está bien especificado y se verifica de un vistazo.** Nada de modelos chicos: todo esto es código de producción.

| Trabajo | Quién | Por qué |
|---|---|---|
| Tokens y primitivas (Fase 0) | Hilo principal, Opus | Define el vocabulario que consume todo lo demás; tiene que existir antes de repartir trabajo. |
| Motor del lienzo (Fase 1) | Hilo principal, Opus | Geometría, eventos de puntero, DOM entre realms, historial. Los errores acá son invisibles hasta que no lo son. |
| Rail + paneles Elementos y Texto (Fase 2) | Subagente, Sonnet | Archivos nuevos y autocontenidos, contrato de inserción ya definido en la Fase 1. Composición de interfaz bien especificada. |
| Paneles Imágenes, Marca, IA y Capas (Fase 2) | Subagente, Sonnet | Ídem, y en paralelo con el anterior porque no comparten archivos. |
| Toolbar contextual y panel avanzado (Fase 3) | Subagente, Opus | Toca la ruta de escritura de estilos sobre el DOM del slide; un error acá corrompe slides guardados. |
| Duplicar slide, formatos de export, prompt (Fase 4) | Subagente, Sonnet | Backend y rutas, patrón existente que se replica, verificable ejecutando. |
| Restyle del resto de la app (Fase 5) | Subagente, Sonnet | Aplicación mecánica de tokens ya definidos. |
| Repaso transversal (Fase 5) | Hilo principal, Opus | Criterio de conjunto sobre la interfaz terminada. |

El paralelismo se reparte **por propiedad de archivos**, nunca dos agentes sobre el mismo archivo. El hilo principal se queda con la integración —el archivo de la página del editor es el punto de encuentro de todo— y con las dos partes donde la calidad es más frágil.

---

## Verificación

**Automática, en cada fase**
- Compilación y linter limpios.
- El auto-chequeo de geometría, ampliado: redimensionado con rotación, ajuste magnético, caja envolvente de selección múltiple, cursor del historial, factor de escala del cambio de proporción.

**Manual, guiada, al cierre de cada fase** (en `localhost:3000`)
- Fase 0 — recorrer la app y confirmar que nada quedó ilegible ni sin foco visible.
- Fase 1 — con un carrusel real: seleccionar, mover, rotar, escalar, agrupar, deshacer veinte pasos, copiar entre slides, con zoom y el lienzo desplazado. Recargar y confirmar que se guardó.
- Fase 2 — insertar cada tipo de elemento por las dos rutas (arrastre y clic), reordenar capas, bloquear, ocultar.
- Fase 3 — aplicar cada efecto y cada filtro, y confirmar que el PNG exportado coincide con lo que se ve en pantalla.
- Fase 4 — duplicar, aplicar a todas, cambiar de proporción, exportar en los cuatro formatos y abrirlos.
- Fase 5 — recorrido completo con teclado, sin mouse.

**Prueba de no-regresión, en cada fase:** pedirle algo al agente de IA por chat y confirmar que sigue generando slides correctos, que se guardan, que no pisan ediciones manuales, y que lo que produce es seleccionable con las herramientas nuevas. Es la funcionalidad original del producto y no puede degradarse en ningún momento.

---

## Simplificaciones deliberadas

Lo que se deja afuera a propósito, y cuándo valdría la pena agregarlo.

| Se omite | Por qué | Cuándo agregarlo |
|---|---|---|
| Modo oscuro | Nadie lo pidió y duplica el trabajo de contraste. Canva es claro. | Si aparece la molestia real de trabajar de noche. |
| Colaboración, comentarios, links compartidos | App local mono-usuario que exporta PNGs. Superficie sin usuario. | Si alguna vez hay más de una persona editando. |
| Video, audio, animaciones | El entregable es un PNG estático. | Si el producto pasa a exportar Reels. |
| Fotos de stock de terceros | Requiere claves de API y un acuerdo de licencia. La generación por IA ya cubre la necesidad. | Si la generación resulta insuficiente. |
| Tooltips | El rail lleva etiquetas de texto visibles. Un tooltip que explica un icono es un icono mal elegido. | Nunca, para navegación. Sí para atajos de teclado en la toolbar. |
| Miniaturas en el panel de capas | Renderizar miniatura por elemento es caro y aporta poco frente a un icono de tipo más el nombre. | Si con muchos elementos cuesta identificarlos. |
| Curvar texto | Requiere vectores y hace que el texto deje de ser editable en el lienzo. | Si aparece la necesidad concreta. |
| Quitar fondo de imágenes | No hay forma local: necesita un modelo o un servicio externo. | Si se acepta una dependencia externa. |
| Ajuste magnético sobre cajas rotadas | No tiene una respuesta correcta única; Canva tampoco lo hace. | Nunca, probablemente. |
