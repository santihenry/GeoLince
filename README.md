# GeoLince

> [!CAUTION]
> **Esto es una herramienta de cheat, y no recomendamos usarla para jugar.**
> Va contra los términos de servicio de GeoGuessr, le arruina la partida a los demás y
> puede terminar en la suspensión de tu cuenta. Se publica como ejercicio técnico, no
> como una forma de ganar: leé el código, probalo en partidas privadas. Lo que hagas
> con esto corre por tu cuenta.

Userscript (Tampermonkey) para GeoGuessr que muestra en pantalla las coordenadas reales
de la ronda, las abre en un mapa aparte y — en la versión completa — automatiza el juego
en modo Streaks.

Vienen **dos versiones**, y se instala **una sola**:

| | Para qué | Instalá esto |
|---|---|---|
| **Lite** | Jugar vos, en partidas simples o multiplayer, viendo en vivo coordenadas, calle, ciudad, provincia y país, con el mapa en otra ventana. No toca el DOM de GeoGuessr ni hace clicks. | [`geolince-lite.user.js`](geolince-lite.user.js) |
| **Completa** | Todo lo anterior **más** el AutoPlay (marca, adivina, pasa de ronda y arranca partida nueva en modo Streaks) y el AFK multiplayer (encadena duelos sin jugarlos). | [`geolince.user.js`](geolince.user.js) |

Las dos son la versión 0.7, corren en `https://www.geoguessr.com/*` y no tienen
dependencias (solo la API de geocoding de OpenCage).

Si dudas, empezá por la **Lite**: es la mitad de código, no depende de los selectores de
GeoGuessr (que cambian en cada deploy del sitio) y hace todo lo que sirve para jugar vos.

---

## Índice

- [Por qué existe esto](#por-qué-existe-esto)
- [Qué hace](#qué-hace)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [El panel](#el-panel)
- [Atajos de teclado](#atajos-de-teclado)
- [AutoPlay (Streaks)](#autoplay-streaks)
- [AFK multiplayer](#afk-multiplayer)
- [Cómo funciona por dentro](#cómo-funciona-por-dentro)
- [Datos guardados (localStorage)](#datos-guardados-localstorage)
- [Problemas frecuentes](#problemas-frecuentes)
- [Estructura del repo](#estructura-del-repo)
- [Historial de versiones](#historial-de-versiones)
- [Licencia](#licencia)

---

## Por qué existe esto

GeoLince nació como un experimento técnico, no como una forma de ganar partidas. Lo que
tiene de interesante está en cómo funciona por dentro:

- Interceptar `XMLHttpRequest` y `fetch` para leer el tráfico de Street View sin tocar la
  página.
- Encontrar la latitud y longitud reales dentro de un JSON anidado y sin documentar.
- Llegar al estado interno de un componente de React desde el DOM, por la key
  `__reactFiber$…`, para reproducir una interacción que un click sintético no logra.
- Sostener selectores contra un sitio que cambia sus clases CSS en cada deploy.

Todo eso está explicado en [Cómo funciona por dentro](#cómo-funciona-por-dentro), que es
la parte del documento que vale la pena leer.

**Ahora, la otra cara.** Un juego de adivinar dónde estás *sin* la respuesta es el juego;
con la respuesta en pantalla no queda nada. Y en partidas públicas, ranked o multiplayer,
el que pierde no es GeoGuessr: es la persona del otro lado, que sí está jugando en serio.

Así que la recomendación honesta:

| | |
|---|---|
| **Sí** | Leer el código, correrlo en partidas privadas o en singleplayer contra vos mismo, usarlo para aprender cómo se arma un userscript. |
| **No** | Partidas competitivas, ranked, multiplayer con desconocidos, torneos. |
| **Nunca** | Presentar los resultados como propios en una tabla de posiciones o para ganarle a alguien. |

Si te gusta GeoGuessr, jugá sin esto. Es mejor juego.

---

## Qué hace

| Función | Detalle |
|---|---|
| **Coordenadas reales** | Intercepta el tráfico de Street View de la página y saca la latitud/longitud exacta del panorama actual. No hace falta apretar nada: se actualizan solas al cambiar de ronda. |
| **Información del lugar** | Geocoding inverso con [OpenCage](https://opencagedata.com/): calle, barrio, ciudad, provincia y país. |
| **Mapa en ventana aparte** | Abre la posición en Google Maps o OpenStreetMap en una ventana separada, con control de zoom. Ideal para un segundo monitor. |
| **Marcador automático** *(solo completa)* | Coloca el pin en el mapa de guess de GeoGuessr en las coordenadas reales (con desvío configurable), hablándole directamente al mapa vía React Fiber. |
| **AutoPlay (Streaks)** *(solo completa)* | Juega solo: marca, adivina, pasa de ronda y arranca partida nueva, con una cadena de reintentos cuando no logra detectar coordenadas. |
| **AFK multiplayer** *(solo completa)* | Encadena duelos sin jugarlos: entra a la cola, deja correr las rondas sin marcar el mapa (girando la vista para no quedar duro), toca **Continuar** al terminar y vuelve a tocar **Jugar**. |
| **Panel plegable** | Tres bloques que se muestran/ocultan por separado, y opción de sacar todo el panel a su propia ventana. |

---

## Instalación

1. Instalá [Tampermonkey](https://www.tampermonkey.net/) en Chrome, Edge, Firefox o Brave.
2. Abrí el panel de Tampermonkey → **Crear un script nuevo…**
3. Borrá el contenido del editor y pegá todo
   [`geolince-lite.user.js`](geolince-lite.user.js) **o** [`geolince.user.js`](geolince.user.js),
   según la versión que quieras (ver la tabla de arriba).
4. Guardá (`Ctrl + S`).
5. Entrá a `https://www.geoguessr.com/` y apretá **`Ctrl + Q`** para mostrar el panel.

No instales las dos a la vez: se pisan entre ellas (los dos paneles y los dos juegos de
atajos corren sobre la misma página).

La cabecera del script ya trae lo necesario, no hay que tocarla:

```js
// @match        https://www.geoguessr.com/*
// @grant        none
```

El panel arranca oculto: si no ves nada después de instalarlo, es normal — apretá `Ctrl + Q`.

---

## Configuración

### API key de OpenCage (obligatorio)

El geocoding (calle / barrio / ciudad / provincia / país) usa
[OpenCage](https://opencagedata.com/) — 2.500 consultas por día gratis. **En el repo la
constante va vacía** a propósito, para no publicar la key: cada uno pone la suya en su
copia instalada.

1. Sacá tu key en [opencagedata.com](https://opencagedata.com/).
2. Guardala en `config/opencage.key.txt` (ese archivo está en `.gitignore`; hay una
   plantilla en [`config/opencage.key.example.txt`](config/opencage.key.example.txt)).
3. Pegala en la constante del script, en **tu copia instalada en Tampermonkey**:

```js
const OPENCAGE_API_KEY = 'tu_api_key';
```

> Ojo al actualizar: si volvés a pegar `geolince.user.js` del repo en Tampermonkey, la constante
> vuelve a quedar vacía y hay que poner la key de nuevo (por eso conviene tenerla a mano
> en `config/opencage.key.txt`). Y si editás el archivo del repo, dejá la constante vacía
> antes de commitear.

Sin key el panel sigue funcionando (coordenadas, mapa, atajos, AutoPlay), pero los datos
del lugar salen todos en `Unknown`. Cuando falta, el script lo avisa de dos formas: un
cartel arriba de la pantalla —con un botón para sacar la key y otro para cerrarlo— y un
`[GeoLince] Falta la API key…` en la consola.

### Ventanas emergentes

El mapa y el panel en modo ventana usan `window.open`. Permití las ventanas emergentes
para `geoguessr.com` en tu navegador; si no, el mapa no abre y el panel se queda dentro
de la página.

---

## El panel

El panel es el mismo en las dos versiones; la completa agrega el bloque **AUTOPLAY**.
De arriba hacia abajo: la **cabecera** (arrastrable, con los botones de ventana y
minimizar), las tres **pestañas**, y los bloques de contenido. Los datos de las capturas
son de ejemplo.

| Versión completa | Versión Lite |
|---|---|
| <img src="docs/img/panel-completo.png" width="260" alt="Panel de la versión completa, con el bloque AutoPlay"> | <img src="docs/img/panel-lite.png" width="260" alt="Panel de la versión Lite, sin AutoPlay"> |

### Cabecera

| Control | Qué hace |
|---|---|
| Título | Arrastrá desde acá para mover el panel. La posición queda guardada. |
| **⧉** | Abre el panel en una ventana aparte. Estando afuera cambia a **⤓**, que lo devuelve a la página. Equivale a `ALT + P`. |
| **−** / **+** | Minimiza el panel a solo la barra de título, o lo vuelve a abrir con los bloques que tenías. |

Minimizado con **−** ocupa solo esto, y sigue siendo arrastrable:

<img src="docs/img/panel-minimizado.png" width="284" alt="Panel minimizado: solo la barra de título">

### Pestañas

Cada pestaña muestra u oculta su bloque de forma independiente. Encendida = violeta,
apagada = gris. Por ejemplo, con **COORDS** y **ATAJOS** apagadas queda solo el zoom:

<img src="docs/img/panel-solo-zoom.png" width="284" alt="Panel con solo el bloque de zoom visible">


| Pestaña | Bloque |
|---|---|
| **ZOOM** | Botones de zoom del mapa y nivel actual. |
| **COORDS** | Coordenadas en grados/minutos/segundos y datos del lugar. |
| **ATAJOS** | Lista de teclas, y el estado del AutoPlay y del AFK multiplayer en la versión completa. |

`Ctrl + E` cicla las vistas sin usar el mouse:

**todo → sin atajos → solo zoom → cerrado → todo**

Si el panel está oculto (`Ctrl + Q`), `Ctrl + E` lo muestra con la última combinación que
tenías abierta.

### Bloque AutoPlay *(solo versión completa)*

| Línea | Significado |
|---|---|
| `● ACTIVO / DETENIDO · Partida n/N · XP` | Estado del bucle, número de partida y XP acumulada estimada. |
| `● Map ● Guess ● Next` | Punto verde = ese paso se completó en la ronda actual. |
| `Ronda: n` | Ronda dentro del streak. |
| `● Fallos: n ● Marca · LoadMap: bool` | Timeouts al buscar botones, si se colocó el marcador, y si el geocoding respondió. |
| `Cords → Country → State → City` | Métodos intentados en la ronda. Verde = el que funcionó, rojo = los que fallaron. |

### Ventana aparte

Con **⧉** o `ALT + P` el panel se muda a su propia ventana del navegador (290×640), útil
para no tapar la pantalla del juego:

<img src="docs/img/panel-ventana.png" width="290" alt="El panel abierto en su propia ventana del navegador">

Ahí dentro:

- Los atajos de teclado siguen funcionando aunque el foco esté en esa ventana.
- Si cerrás la ventana a mano, el panel vuelve solo a la página.
- Al recargar GeoGuessr la ventana se reabre sola (si el navegador no bloquea el pop-up).

---

## Atajos de teclado

### Generales

| Tecla | Acción |
|---|---|
| `Z` | Abre o actualiza el mapa con las coordenadas actuales. |
| `X` | Zoom +2 y actualiza el mapa. |
| `C` | Zoom −2 y actualiza el mapa. |
| `N` | Refresca coordenadas e información del lugar (llama al geocoding). |
| `M` | Alterna el proveedor de mapa: Google Maps ↔ OpenStreetMap. |
| `*` | Detiene el AutoPlay y el AFK multiplayer. |
| `Ctrl + Q` | Muestra/oculta el panel. |
| `Ctrl + E` | Cicla las vistas del panel (todo / sin atajos / solo zoom / cerrado). |
| `Alt + P` | Saca el panel a una ventana aparte o lo devuelve a la página. |

> Los botones de zoom del panel dicen `Reset (r)`, `Max (v)` y `Min (b)`, pero esas tres
> letras **no están asignadas** en el manejador de teclado: por ahora funcionan solo con
> el botón. `+ (x)` y `− (c)` sí tienen su tecla.

### AutoPlay y marcador *(solo versión completa)*

| Tecla | Acción |
|---|---|
| `Alt + 1` | Click en el botón de jugar / empezar partida. |
| `Alt + 2` | Coloca el marcador cerca de las coordenadas reales (desvío mínimo de la tabla, ~0.005°). |
| `Alt + 3` | Click en **Guess**. |
| `Alt + 4` | Click en **Next round**. |
| `Alt + 5` | Click en **Ver resultados**. |
| `Alt + 6` | Click en **Jugar de nuevo**. |
| `Alt + 7` | AutoPlay Streaks: 50 partidas de 5 rondas. |
| `Alt + 8` | AutoPlay Streaks: 50 partidas de 25 rondas. |
| `Alt + 9` | Marca a ~0.00035° del punto real (5.000 puntos). |
| `Alt + 0` | Enciende/apaga el **AFK multiplayer**. |
| `Alt + M` | Cambia entre **paseando** y **quieto**. |
| `Alt + G` / `H` / `J` / `K` / `L` | Pruebas sueltas: giro por API, paso, giro por tecla, zoom, mirar arriba. |
| `Alt + *` | Detiene el AutoPlay y el AFK multiplayer. |

---

## AutoPlay (Streaks)

> Todo lo de esta sección existe solo en [`geolince.user.js`](geolince.user.js).

`Alt + 7` / `Alt + 8` arrancan el bucle `AutoPlayStreaks(partidas, rondas)`. Por cada ronda:

1. Coloca el marcador con las coordenadas capturadas.
2. Si las coordenadas **no cambiaron** respecto de la ronda anterior (señal de que no se
   capturó el panorama nuevo), entra en una cadena de reintentos:

   | Intento | Qué marca |
   |---|---|
   | `Cords` | Las coordenadas capturadas del Street View. |
   | `Country` | El centro del país geocodificado. |
   | `State` | El centro de la provincia/estado. |
   | `City` | El centro de la ciudad. |
   | `Cuba` | Último recurso: ninguno funcionó, corta el streak y pasa a la partida siguiente. |

   El panel muestra la cadena de intentos con el que funcionó en verde.
3. Click en **Guess**, espera, click en **Next round**.
4. Al terminar el streak: marca un punto fijo, adivina y arranca partida nueva con
   **Jugar de nuevo**.

Se detiene con `*` (o `Alt + *`). El estado se ve en vivo en el bloque AUTOPLAY del panel.

Los clicks no son de un solo intento: `clickAndWait()` hace polling hasta 6–8 segundos
esperando que el botón exista, sea visible y esté habilitado, y suma al contador
`Fallos` cuando se queda sin tiempo.

---

## AFK multiplayer

> También existe solo en [`geolince.user.js`](geolince.user.js).

Sirve para dejar la cuenta sumando partidas de duelos sin jugarlas: el rival juega solo y
nosotros no marcamos nunca el mapa. Se enciende con `Alt + 0` o con el botón
**Activar AFK** del bloque MULTIPLAYER AFK del panel.

El bucle revisa la pantalla cada 1,2 s y hace una sola cosa por vuelta:

| Estado | Qué hace |
|---|---|
| Lobby de duelos (`/multiplayer/duels`) | Click en **Jugar**. |
| Buscando rival | Nada: volver a tocar **Jugar** cancelaría la cola. Si pasan 3 minutos, reintenta. |
| En partida | **No marca, no adivina, no pasa de ronda**: las rondas se vencen solas por tiempo. Lo único que hace es pasear por la calle, y solo si está en modo Paseando. |
| Pantalla final (y los carteles de ascenso) | Click en **Continuar**. |
| Cualquier otra página | Vuelve al lobby a los 8 segundos. |

### Moverse sin jugar

Hay dos formas de estar AFK, y se cambia con el botón del panel o con `ALT + M`:

| Modo | Qué hace |
|---|---|
| **Quieto** | No toca absolutamente nada en toda la partida. |
| **Paseando** *(por defecto)* | Recorre la calle mientras corre la ronda. |

La elección queda guardada en `gg_afkQuieto`.

**El paseo no es un manojo de movimientos sueltos.** Con `ArrowUp` se avanza hacia donde se
está mirando, así que girar mucho entre paso y paso da el ida y vuelta típico: dos adelante,
giro, dos atrás. Por eso camina derecho y los giros grandes quedan para las pausas:

| Momento | Qué manda |
|---|---|
| **Caminata** | 3 a 7 toques de `ArrowUp`, uno cada 0,6-1,3 s, **sin giros grandes**: así recorre la cuadra. |
| **Corrección** | Entre paso y paso, si la calle dobló, gira para ese lado (ver abajo). |
| **Pausa** (1-4 s) | 30% de las veces dobla (giro de 60° a 130°, como agarrar otra calle). El resto, mira alrededor sin perder el rumbo (15° a 50°), a veces levantando la vista o cambiando el zoom. |

#### Seguir la calle

Avanzar sin girar nunca se nota: en una calle con curva quedarías caminando de costado. Para
girar hacia donde va la calle hay que saber hacia dónde fue el paso, y eso el script **ya lo
sabe**: captura las coordenadas de cada panorama (es lo que hace para mostrarlas).

Entonces, antes de cada paso compara el tramo recién caminado con el anterior:

1. Rumbo del tramo anterior, con la fórmula de rumbo entre dos puntos.
2. Rumbo del tramo nuevo.
3. Si la diferencia pasa los 6°, la calle dobló: gira esa misma cantidad (hasta 70°) y recién
   después da el paso siguiente.

Un salto de más de 0,01° es una ronda nueva, no una curva, así que ahí se descarta la
referencia en vez de pegar un volantazo.

Girar es `ArrowLeft` / `ArrowRight` **mantenidas**: `keydown`, repetido cada 50 ms como hace
un teclado de verdad, y `keyup` a los 200-1100 ms según los grados.

| Tecla | ¿La ata GeoGuessr? |
|---|---|
| `ArrowUp` (avanzar) | Sí |
| `ArrowLeft` / `ArrowRight` mantenidas (girar) | Sí |
| `+` / `-` (zoom) | Sí |
| `PageUp` / `PageDown` (mirar arriba y abajo) | **No** |

O sea que mirar arriba y abajo no se puede por teclado. La llamada sigue en el paseo (no
molesta: manda una tecla que nadie atiende) por si alguna vez la atan. Lo único que la hace
hoy es `ALT + L`, que avisa que no pasó nada.

Las teclas se mandan al contenedor del panorama **y** a `document`, porque el que las
atiende es GeoGuessr, no Google.

**Lo que no funciona, probado:** simular el mouse. Contra un `StreetViewPanorama` real del
Maps JS API (el mismo que embebe GeoGuessr), un arrastre de verdad giró 108° y el mismo
arrastre despachado por código, 0° — en seis variantes (sobre el canvas, sobre
`elementFromPoint`, solo `MouseEvent`, solo `PointerEvent`, con `movementX`, con la captura
de puntero anulada, en `window`, y con tiempo real entre pasos). Google ignora los eventos
sintéticos para el paneo. Las teclas, en cambio, sí llegan, porque las maneja GeoGuessr.

### Y el modo de la partida

Que todo salga por teclado es lo que hace que **el modo se respete solo**: las teclas pasan
por el juego, que ya sabe si esa partida deja moverse, girar o hacer zoom.

| Modo | Qué pasa |
|---|---|
| **Moving** | Camina, dobla y mira. |
| **No move** | Gira y hace zoom; `ArrowUp` no hace nada. |
| **NMPZ** | No se mueve nada: ninguna tecla hace nada. |

Además, si el JSON de la partida pasa por el interceptor que el script ya tiene para las
coordenadas, se leen `forbidRotating` / `forbidMoving` y directamente no se mandan teclas
que no corresponden (`GeoLinceAFK.reglas()`). Es un refuerzo, no la defensa principal.

`pano.setPov()` **no se usa en el bucle**: giraría igual donde el modo no deja, y encima en
GeoGuessr el panorama no se alcanza por el fiber de React. Queda solo en la prueba manual
`ALT + G`. `setPano()` no se usa en ningún lado, y el test lo verifica.

### Probar a mano

En plena ronda, con el resultado escrito en el panel (no hace falta la consola). Cada
prueba mide si la pantalla cambió de verdad y dice `FUNCIONA` o `no pasó nada`:

| Atajo | Qué manda |
|---|---|
| `ALT + G` | Giro por `setPov()` (en GeoGuessr: *no encontré el panorama*). |
| `ALT + H` | Un toque de `ArrowUp`. |
| `ALT + J` | Giro con la flecha mantenida. |
| `ALT + K` | Zoom. **Anda.** |
| `ALT + L` | Mirar hacia arriba. **No anda**: GeoGuessr no ata `PageUp`. |

Lo mismo desde la consola: `GeoLinceAFK.probarPaso()`, `.probarGiroTecla()`, `.probarZoom()`,
`.probarMirar()` y `.probarGiro()`.

Detalles:

- Solo clickea **Jugar** y **Continuar**, buscados por texto visible
  (`findVisibleButtonByText`), igual que el resto del script. Mira `button`, `a`,
  `[role="button"]` y divs con clase de botón, porque el **Jugar** del lobby no siempre
  es un `<button>`, y se queda con el elemento más interno. Nunca toca el mapa de guess.
- Entre click y click deja 3,5 s, y entre dos **Jugar** al menos 45 s.
- Reconoce la ruta con y sin prefijo de idioma (`/es/multiplayer/duels`).
- En duelos la URL **no cambia** entre el lobby y la partida, así que la partida se
  reconoce por pantalla: el mapa de guess (`[class*="guess-map_"]`, el mismo selector que
  usa `findMapCanvasElement()`), que en el lobby no existe. Si además hay un **Jugar** a
  la vista, manda el lobby: nunca da por empezada una partida que no empezó.
- El estado queda en `gg_afkMp`, así el modo sobrevive a las recargas de GeoGuessr.
  Si la última señal de vida tiene más de 10 minutos, no se reanuda solo.
- AutoPlay y AFK no corren juntos: arrancar uno apaga el otro.
- Si pasan 10 minutos dentro de una partida sin avanzar (señal de que no reconoció el
  botón de la pantalla final), lo avisa por consola con todo lo clickeable que había
  y lo deja marcado en el panel.
- Para depurar desde la consola: `GeoLinceAFK.estado()`, `GeoLinceAFK.clickeables()`,
  `GeoLinceAFK.on()`, `GeoLinceAFK.off()`, `GeoLinceAFK.movimiento(false)`,
  `GeoLinceAFK.reglas()`, `GeoLinceAFK.probarGiro()` y `GeoLinceAFK.probarPaso()`.

Se detiene con `Alt + 0`, con `*` o con el mismo botón del panel.

El bloque del panel muestra:

| Línea | Significado |
|---|---|
| `● ACTIVO / APAGADO · Partidas n` | Si el bucle corre, y cuántas partidas terminó desde que se encendió. |
| Texto de estado | `buscando rival`, `en partida, paseando`, `en partida, quieto`, `en la cola, esperando`, `cerrando resultados`, `volviendo al lobby`, `trabado, mira la consola`, `error, mira la consola`… |

---

## Cómo funciona por dentro

### 1. Captura de coordenadas

El script parchea `XMLHttpRequest.prototype.open/send` y `window.fetch` para reenviar cada
respuesta con `window.postMessage`. Un listener parsea el JSON de Street View y saca la
latitud/longitud del panorama:

```js
lat = arr[1][0][5][0][1][0][2];
lng = arr[1][0][5][0][1][0][3];
```

Con un camino alternativo (`arr[1][5][0][1][0][2/3]`) para los payloads que vienen con otra
forma. Mientras no haya capturado nada, las coordenadas valen `999`.

### 2. Información del lugar

`fetchLocation()` consulta OpenCage con esas coordenadas y guarda calle, barrio, ciudad,
provincia y país. `cordsFromName()` hace el camino inverso
(nombre → coordenadas) para la cadena de reintentos del AutoPlay.

### 3. Mapa en ventana aparte

`loadMapGM()` (Google Maps) y `loadMapOSM()` (OpenStreetMap) arman la URL con las
coordenadas y el zoom, y reutilizan siempre la misma ventana con nombre `mapWindow`.
`M` alterna entre los dos proveedores.

### 4. Marcador en el mapa de guess *(solo versión completa)*

`findMapCanvasElement()` busca el canvas del mapa (con selectores distintos para Streaks y
clásico). `placeMarker()` y `placeMarker5K()` eligen el punto, y `clickMapAt()` saca del
nodo la key `__reactFiber$…` para llegar a los handlers de click del mapa de Google y
llamarlos con las coordenadas elegidas:

```js
element[reactKey].return.return.memoizedProps.map.__e3_.click
```

Es decir, no simula un click en pantalla: le habla al mapa directamente, así que el pin cae
exactamente donde se le pide.

### 5. Selectores de GeoGuessr *(solo versión completa)*

GeoGuessr usa CSS Modules con un hash que cambia en cada deploy
(`guess-map_guessButton__iZNh5`). Por eso el script busca los botones **por texto visible**
primero (`findButtonByText('guess', 'adivina', …)`) y usa selectores por prefijo
(`[class^="guess-map_guessButton__"]`) como refuerzo.

---

## Datos guardados (localStorage)

| Clave | Contenido |
|---|---|
| `zoomLevel` | Último nivel de zoom del mapa. |
| `mapWindowOpen` | Si había una ventana de mapa abierta, para reengancharla al recargar. |
| `gg_panelPos` | Posición del panel dentro de la página (`{left, top}`). |
| `gg_panelState` | Qué bloques están visibles y si el panel está minimizado (`{parts:[bool,bool,bool], closed}`). |
| `gg_panelPopout` | Si el panel estaba en su ventana aparte. |
| `gg_afkMp` | Estado del AFK multiplayer (`{on, ts, games}`), para seguir después de una recarga. |
| `gg_panelMode`, `gg_panelCollapsed` | Formatos viejos del estado del panel; se migran solos y ya no se escriben. |

Para resetear el panel a como viene de fábrica, borrá las claves `gg_*` desde la consola:

```js
Object.keys(localStorage).filter(k => k.startsWith('gg_')).forEach(k => localStorage.removeItem(k));
```

---

## Problemas frecuentes

| Síntoma | Causa probable / solución |
|---|---|
| No aparece el panel | Arranca oculto: apretá `Ctrl + Q`. Si igual no aparece, revisá que Tampermonkey tenga el script activo en `geoguessr.com`. |
| `Coordinates: press 6` no cambia nunca | Todavía no se capturó ningún panorama. Movete dentro de la ronda y apretá `N`. |
| El mapa no abre | Ventanas emergentes bloqueadas para `geoguessr.com`. |
| El panel no se reabre en su ventana al recargar | Igual que arriba: la reapertura automática no viene de un click, y el navegador la bloquea. El panel queda dentro de la página. |
| Datos del lugar en `Unknown` | Falta cargar la API key de OpenCage, o se acabó su cupo diario. Revisá la consola: si dice `[GeoLince] Falta la API key…`, cargala como explica [Configuración](#configuración). |

### Solo del AutoPlay

Estos dos **no pasan en uso manual**. Ver las coordenadas, el panel y el mapa en partidas
simples o multiplayer no depende de los selectores de GeoGuessr; los que dependen son el
AutoPlay (Streaks y Clásico) y los clicks automáticos de `Alt + 1…6`.

| Síntoma | Causa probable / solución |
|---|---|
| `Fallos` sube y no clickea nada | Cambiaron los botones de GeoGuessr. En la consola quedan los logs `[GeoLince] Botones visibles al fallar…` con el texto y las clases reales para actualizar los selectores. |
| `Mapa no encontrado` | Mismo caso con el canvas del mapa de guess: mirá `[GeoLince] No se encontró el canvas del mapa` en la consola. |

---

## Estructura del repo

| Archivo | Qué es |
|---|---|
| `geolince.user.js` | Versión completa (v0.7): info en vivo + AutoPlay + AFK multiplayer. |
| `geolince-lite.user.js` | Versión liviana (v0.7): solo la info en vivo y el mapa. |
| `loct` | Archivo suelto con una URL de mapa de ejemplo. |
| `config/opencage.key.example.txt` | Plantilla para tu API key. Copiala como `config/opencage.key.txt` (ignorado por git). |
| `docs/img/` | Capturas del panel usadas en este documento. |
| `README.md` | Este documento. |
| `LICENSE` | MIT. |

---

## Historial de versiones

| Versión | Cambios principales |
|---|---|
| **0.7** | Se parte en dos archivos: `geolince-lite.user.js` (solo info en vivo) y `geolince.user.js` (con AutoPlay). Cambio de nombre a **GeoLince** (antes "GG" / "Geo Pro Player"). La API key de OpenCage salió del código: va vacía en el repo, con copia local en `config/` ignorada por git, y avisa con un cartel en pantalla si falta. |
| **0.6** | Selectores por prefijo (sin el hash de CSS Modules) y búsqueda de botones por texto. Panel dividido en tres bloques plegables con pestañas, y opción de abrirlo en una ventana aparte. |
| **0.5** | Logs `[GeoLince]` para diagnosticar botones y canvas que no aparecen. |
| **0.4** | Se sacó todo el AutoPlay clásico y las listas de mapas que ya no se usaban. |
| **0.3** | Rediseño oscuro del panel, panel arrastrable con posición guardada y botón de colapsar. |
| **0.2** | Correcciones varias (zoom, marcadores, detección de modo Streaks) y clicks con polling. |

---

## Licencia

[MIT](LICENSE) — © 2025 Santiago Henry.
