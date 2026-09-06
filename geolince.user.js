// ==UserScript==
// @name         GeoLince
// @namespace    https://github.com/santihenry/GeoLince
// @version      0.7
// @description  Muestra las coordenadas reales de la ronda, las abre en un mapa aparte y automatiza el modo Streaks.
// @author       Santiago Henry
// @match        https://www.geoguessr.com/*
// @grant        none
// ==/UserScript==

// Notas para quien lea el codigo:
//
// - GeoGuessr genera sus clases CSS con un hash que cambia en cada deploy
//   (ej. "guess-map_guessButton__iZNh5"). Por eso los botones se buscan primero
//   por texto visible (findButtonByText) y despues por prefijo de clase
//   [class^="..."], nunca por la clase completa.
// - Cuando un boton o el canvas del mapa no aparecen, los logs [GeoLince]
//   vuelcan lo que si hay en pantalla, para ajustar los selectores sin adivinar.
// - El historial de cambios esta en los commits del repo.

(function() {
    'use strict';

    // API key de OpenCage: pegá la tuya acá, en tu copia instalada en Tampermonkey.
    // En el repo va vacía a propósito, para no publicarla. Tu key está guardada en
    // config/opencage.key.txt (ignorado por git).
    const OPENCAGE_API_KEY = '';

    if (!OPENCAGE_API_KEY) {
        console.warn('[GeoLince] Falta la API key de OpenCage: los datos del lugar van a salir en Unknown.',
                     '\nPegala en la constante OPENCAGE_API_KEY (copia en config/opencage.key.txt).');
    }

    let mapWindow = null;
    let panelWindow = null;   // ventana aparte del panel (pop-out)
    let zoomLevel = parseInt(localStorage.getItem('zoomLevel')) || 5;
    let lat = 999;
    let lng = 999;
    const maxZoom = 20;
    const minZoom = 3;
    let zoomLevelDisplay;
    let menuVisible = false;
    let cyclePanelMode = () => {};
    let controlDiv;
    let cordsDisplay;
    let infoDisplay;
    let useGM = true;
    let aPDisplay;

    let chekFail = 0;
    let TypeMethodChek = 0;

    let globalCoordinates = { // keep this stored globally, and we'll keep updating it for each API call.
        lat: 0,
        lng: 0
    }

    // Definir los rangos de distancia como un objeto
    const distanceRanges = [
        0.005,
        0.02,
        0.052,
        0.0985,
        0.35,
        0.6,
        2,
        4,
        6,
        8,
        15,
        25,
        30,
        40,
    ];

    let partidaNum = 0;
    let rondaNum = 1;
    let stopPlay;
    let cantPartidas = 0;
    let countryy = "";
    let statee = "";
    let cityy = "";
    let mark = false;
    let oldLat = 999;
    let oldLng = 999;
    let loadMapTest = false;


    if (localStorage.getItem('mapWindowOpen') === 'true') {
        mapWindow = window.open('', 'mapWindow');
        if (mapWindow && !mapWindow.closed) {
            mapWindow.focus();
        } else {
            localStorage.removeItem('mapWindowOpen');
        }
    }

    (function (xhr) {
        var XHR = XMLHttpRequest.prototype;
        var open = XHR.open;
        var send = XHR.send;

        XHR.open = function (method, url) {
            this._method = method;
            this._url = url;
            return open.apply(this, arguments);
        };

        XHR.send = function (postData) {
            this.addEventListener('load', function () {
                try {
                    window.postMessage({ type: 'xhr', data: this.response }, '*');
                } catch {
                    return;
                }
            });
            return send.apply(this, arguments);
        };
    })(XMLHttpRequest);

    const { fetch: origFetch } = window;
    window.fetch = async (...args) => {
        const response = await origFetch(...args);
        const clonedResponse = await response.clone().blob();
        window.postMessage({ type: 'fetch', data: clonedResponse }, '*');
        return response;
    };

    window.addEventListener('message', async function (e) {
        const msg = e.data.data;
        if (msg) {
            try {
                const arr = JSON.parse(msg);
                let foundCoords = false;
                try {
                    lat = arr[1][0][5][0][1][0][2];
                    lng = arr[1][0][5][0][1][0][3];
                    foundCoords = true;
                } catch (e) { }

                if (!foundCoords) {
                    try {
                        if (isDecimal(arr[1][5][0][1][0][2]) && isDecimal(arr[1][5][0][1][0][3])) {
                            lat = arr[1][5][0][1][0][2];
                            lng = arr[1][5][0][1][0][3];
                        }
                    } catch (e) { }
                }
            } catch {
                return;
            }
        }
    });

    function isDecimal(str) {
        str = String(str);
        return !isNaN(str) && str.includes('.') && !isNaN(parseFloat(str));
    }

    function convertToDMS(decimal) {
        const degrees = Math.floor(decimal);
        const minutes = Math.floor((decimal - degrees) * 60);
        const seconds = ((decimal - degrees - minutes / 60) * 3600).toFixed(1);
        return `${degrees}°${minutes}'${seconds}"`;
    }

    function getLatLongDirections() {
        return {
            latDir: lat >= 0 ? 'N' : 'S',
            longDir: lng >= 0 ? 'E' : 'W'
        };
    }

    const UNKNOWN_LOCATION = { city: 'Unknown', province: 'Unknown', country: 'Unknown', street: 'Unknown', neighborhood: 'Unknown' };

    async function fetchLocation() {
        if (!OPENCAGE_API_KEY) return UNKNOWN_LOCATION;

        const response = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${lat},${lng}&key=${OPENCAGE_API_KEY}`);
        const data = await response.json();
        loadMapTest = Boolean(data.results && data.results.length);

        if (data.results && data.results.length > 0) {
            const city = data.results[0].components.city || data.results[0].components.town || data.results[0].components.village || 'Unknown';
            const province = data.results[0].components.state || data.results[0].components.province || 'Unknown';
            const country = data.results[0].components.country || 'Unknown';
            const street = data.results[0].components.road || 'Unknown';
            const neighborhood = data.results[0].components.suburb || data.results[0].components.neighbourhood || 'Unknown';
            countryy =  data.results[0].components.country || 'Unknown';
            statee =  data.results[0].components.state || 'Unknown';
            cityy =  data.results[0].components.city || 'Unknown';
            return { city, province, country, street, neighborhood };
        }
        return UNKNOWN_LOCATION;
    }

    async function locationInfo() {
        const { latDir, longDir } = getLatLongDirections();
        const latDMS = convertToDMS(lat);
        const longDMS = convertToDMS(lng);
        const location = await fetchLocation();
        cordsDisplay = `Latitude: ${latDMS} ${latDir} Longitude: ${longDMS} ${longDir}\n Street: ${location.street}\n Neighborhood: ${location.neighborhood} \n City: ${location.city}\n Province: ${location.province}\n Country: ${location.country}`;
        infoDisplay.innerText = `Coordinates: ${cordsDisplay}`;
    }

    function clampZoom() {
        zoomLevel = Math.min(Math.max(zoomLevel, minZoom), maxZoom);
    }

    // Abre el mapa, siempre en la misma ventana (la reusa por nombre).
    function openMapWindow(url) {
        localStorage.setItem('zoomLevel', zoomLevel);

        if (mapWindow && !mapWindow.closed) {
            mapWindow.location.href = url;
            mapWindow.focus();
            return;
        }

        const width = 800;
        const height = 600;
        const left = 2 * screen.width + 1000 + width;
        const top = 100;

        mapWindow = window.open(url, 'mapWindow', `width=${width},height=${height},top=${top},left=${left}`);
        localStorage.setItem('mapWindowOpen', 'true');
        if (mapWindow) mapWindow.focus();
    }

    function loadMapGM(zoomAdjustment = 0) {
        if (lat === 999 || lng === 999) return;

        zoomLevel += zoomAdjustment;
        clampZoom();
        openMapWindow(`https://www.google.com/maps?q=${lat},${lng}&hl=es&z=${zoomLevel}&output=embed`);
    }

    function loadMapOSM(zoomAdjustment = 0) {
        if (lat === 999 || lng === 999) return;

        zoomLevel += zoomAdjustment;
        clampZoom();
        openMapWindow(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoomLevel}/${lat}/${lng}&layers=P`);
    }

    function toggleMenu() {
        if (controlDiv) {
            menuVisible = !menuVisible;
            controlDiv.style.display = menuVisible ? 'flex' : 'none';
        }
    }

    function updateMap() {
        if (useGM) {
            loadMapGM();
        } else {
            loadMapOSM();
        }
        zoomLevelDisplay.innerText = `Zoom Level: ${zoomLevel}`;
    }

    function toggleMpProvider() {
        useGM = !useGM;
    }

    // =============================================
    // AUTO PLAY FUNCTIONS
    // =============================================

    let xpAcum = 0;
    let markMapCheck = false;
    let guessBtnCheck = false;
    let nextBtnCheck = false;

    async function AutoPlayStreaks(cant = 10, cantStraks = 10){
        let i = 0;
        stopPlay = true;
        cantPartidas = cant;

        while (stopPlay && i < cant) {
            i++;
            partidaNum = i;
            updateApDisplay();

            if (!stopPlay) break;

            startGame();
            await sleep(1500);
            TypeMethodChek = 0;

            for (let Streak = 0; Streak <= cantStraks; Streak++) {
                window.attemptedThisRound = [];

                placeMarker(0);
                await sleep(100);

                if(oldLat != lat && oldLng != lng){
                    oldLat = lat;
                    oldLng = lng;
                    TypeMethodChek = 0;
                    window.attemptedThisRound = [0];
                }else{

                    await locationInfo();
                    await sleep(500);

                    // Caso 2: Falló Cords → probamos Country → State → City → Cuba
                    let metodo = 1;

                    while (metodo <= 4 && oldLat === lat && oldLng === lng) {
                        window.attemptedThisRound.push(metodo);
                        updateApDisplay();
                        TypeMethodChek = metodo;

                        if (metodo === 1) await cordsFromName(countryy, 'Country');
                        if (metodo === 2) await cordsFromName(statee, 'State');
                        if (metodo === 3) await cordsFromName(cityy, 'City');
                        if (metodo === 4) {
                            Streak = cantStraks + 1; // Forzamos fin del streak
                            break;
                        }

                        Streak--;
                        await sleep(300);
                        updateApDisplay();

                        // Si después del método cambió la ubicación → éxito
                        if (oldLat !== lat || oldLng !== lng) {
                            oldLat = lat;
                            oldLng = lng;
                            break;
                        }

                        metodo++;
                    }
                }

                updateApDisplay();
                await sleep(500);
                await guessButton();
                await sleep(500);

                await nextButton();

                rondaNum = Streak;
                updateApDisplay();
                await sleep(1000);

            }

            placeMarker(0, true, true);
            await sleep(500);
            await guessButton();
            markMapCheck = false;
            guessBtnCheck = false;
            nextBtnCheck = false;
            await sleep(500);
            await playAgainButton();
            await sleep(3500);

        }
    }

    // Busca un boton visible cuyo texto contenga alguna de las variantes dadas,
    // sin importar mayusculas ni lo que haya alrededor. Es la forma que no se
    // rompe cuando GeoGuessr cambia el hash de sus clases.
    function findButtonByText(...variantes) {
        const variantesLower = variantes.map(v => v.toLowerCase());
        return Array.from(document.querySelectorAll('button')).find(b => {
            const texto = b.innerText.trim().toLowerCase();
            return texto.length > 0 && variantesLower.some(v => texto.includes(v));
        });
    }

    async function startGame(){
        const playButton = findButtonByText('jugar', 'play')
                        || document.querySelector('[class^="button_button__"]') // clase genérica de Button, último recurso
                        || document.querySelector('[class^="button_label__"]')?.closest('button');

        if (playButton) {
            playButton.click();
            console.log("¡Juego iniciado!");
            await new Promise(r => setTimeout(r, 2000));
        } else {
            console.error("Botón no encontrado. Revisa la consola para debug.");
        }
    }

    async function guessButton(){
        const clicked = await clickAndWait(() =>
            findButtonByText('adivina', 'guess')
            || document.querySelector('[class^="guess-map_guessButton__"] button')
        , 'guessButton', 6000);

        if (clicked) {
            guessBtnCheck = true;
            await sleep(500);
        }
        return clicked;
    }

    async function nextButton(){
        const clicked = await clickAndWait(() =>
            document.querySelector('[class^="round-result_actions__"] button')
            || findButtonByText('next round', 'siguiente', 'next')
            || document.querySelector('[class^="button_variantPrimary__"]') // genéricos, último recurso
            || document.querySelector('[class^="button_button__"]')
        , 'nextButton', 6000);

        if (clicked) {
            nextBtnCheck = true;
            rondaNum += 1;
        }
        return clicked;
    }

    async function viewResultsButton(){
        const clicked = await clickAndWait(() =>
            document.querySelector('[class^="round-result_actions__"] button')
            || findButtonByText('view results', 'ver resultados', 'resultados')
        , 'viewResultsButton', 6000);

        if (clicked) {
            await sleep(500);
        }
        return clicked;
    }

    async function playAgainButton(){
        const clicked = await clickAndWait(() =>
            document.querySelector('[class^="function-lock_blurWrapper__"] button')
            || findButtonByText('play again', 'jugar de nuevo', 'jugar otra vez')
        , 'playAgainButton', 6000);

        if (clicked) {
            xpAcum += 175;
            rondaNum = 1;
            await sleep(500);
        }
        return clicked;
    }

    // Detecta si estamos en modo Streaks (usa otros selectores que el clasico).
    function detectStreaksMode() {
        return Boolean(
            window.location.pathname.includes('/streak') ||
            document.querySelector('[class*="streak"], [class*="region-map"]') ||
            document.body.classList.contains('streak-mode')
        );
    }

    // Canvas del mapa de guess, con selectores propios para Streaks y clasico.
    function findMapCanvasElement() {
        const isStreaksMode = detectStreaksMode();
        console.log(`Modo detectado: ${isStreaksMode ? 'Streaks' : 'Clásico'}`);

        let element;

        if (isStreaksMode) {
            // SELECTORES ESPECÍFICOS PARA STREAKS (funcionan en 2025)
            element = document.querySelectorAll('[class^="streak-map_canvas__"], [class^="region-map_mapCanvas__"], [class*="streak-map"], canvas[data-testid="map-canvas"]')[0];
            if (!element) {
                element = document.querySelector('[class^="guess-map_canvas__"]'); // Fallback a clásico
                console.log('Usando fallback clásico en Streaks');
            }
        } else {
            // SELECTOR CORRECTO #1 (principal en GeoGuessr 2025)
            element = document.querySelectorAll('[class^="guess-map_canvas__"]')[0];

            // FALLBACK #2 (para modos alternos o updates)
            if (!element) {
                element = document.querySelector('[class*="mapCanvas"], [class^="region-map_mapCanvas__"], canvas');
                console.log('Usando fallback selector');
            }
        }

        if (!element) {
            // Diagnóstico: si ninguno de los selectores conocidos matcheó, volcamos
            // los candidatos que sí hay en pantalla para poder actualizar los
            // selectores (GeoGuessr hashea sus clases y las cambia con cada deploy).
            try {
                const candidatos = Array.from(document.querySelectorAll('canvas, [class*="map" i], [class*="canvas" i]'))
                    .slice(0, 15)
                    .map(el => ({ tag: el.tagName, clase: el.className }));
                console.warn('[GeoLince] No se encontró el canvas del mapa. Candidatos en pantalla:', candidatos);
            } catch (e) { /* noop */ }
        }

        return element || null;
    }

    // Desplaza el punto una distancia fija, en una direccion al azar.
    function applyRandomOffset(dist) {
        globalCoordinates.lat += Math.random() > 0.5 ? dist : -dist;
        globalCoordinates.lng += Math.random() > 0.5 ? dist : -dist;
    }

    // No simula un click en pantalla: saca del canvas los handlers de click del
    // mapa de Google (via React Fiber) y los llama con las coordenadas dadas.
    function clickMapAt(element, latitude, longitude) {
        const latLngFns = { latLng: { lat: () => latitude, lng: () => longitude } };

        const reactKey = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
        if (!reactKey) throw new Error('React Fiber no encontrado');

        const mapElementClick = element[reactKey].return.return.memoizedProps.map.__e3_.click;

        // Itera todas las claves: la que sirve no siempre es la primera.
        for (const clickKey of Object.keys(mapElementClick)) {
            const mapClickProps = mapElementClick[clickKey];
            for (const propKey of Object.keys(mapClickProps)) {
                if (typeof mapClickProps[propKey] === 'function') {
                    mapClickProps[propKey](latLngFns);
                }
            }
        }
    }

    // Marca globalCoordinates en el mapa de guess. Si el mapa todavia no esta
    // en pantalla, reintenta en 1s con `retry`.
    function markOnMap(retry) {
        const element = findMapCanvasElement();

        if (!element) {
            console.error('Mapa no encontrado. Espera a que cargue el juego.');
            loadMapTest = false;
            chekFail++;
            updateApDisplay();
            setTimeout(retry, 1000);
            return;
        }

        loadMapTest = true;
        console.log('Elemento mapa encontrado:', element.className);

        try {
            clickMapAt(element, globalCoordinates.lat, globalCoordinates.lng);
            mark = true;
            markMapCheck = true;
            console.log('✅ Marcador colocado en GeoGuessr!');
        } catch (error) {
            console.error('Error al colocar marcador:', error);
        }
    }

    // indx = -1 elige al azar una distancia de distanceRanges.
    // cuba marca las antipodas del punto real; strek marca un punto fijo.
    function placeMarker(indx = -1, cuba = false, strek = false) {
        globalCoordinates.lat = lat;
        globalCoordinates.lng = lng;

        if (cuba) {
            globalCoordinates.lat = -globalCoordinates.lat;
            globalCoordinates.lng = ((globalCoordinates.lng + 180) % 360 + 360) % 360; // a [0, 360)
            globalCoordinates.lng = globalCoordinates.lng > 180 ? globalCoordinates.lng - 360 : globalCoordinates.lng;
        }

        if (strek) {
            globalCoordinates.lat = 38.89770118220984;
            globalCoordinates.lng = -77.0365562397799;
            rondaNum = 0;
        }

        console.log(`---> lat: ${globalCoordinates.lat} -> lng: ${globalCoordinates.lng}`);

        if (globalCoordinates.lat === 999 || globalCoordinates.lng === 999) {
            console.error('Coordenadas no disponibles');
            return;
        }

        const newIndex = indx === -1 ? Math.floor(Math.random() * distanceRanges.length) : indx;
        applyRandomOffset(distanceRanges[newIndex]);

        markOnMap(() => placeMarker(indx, cuba, strek));
    }

    // Marca a ~40 metros del punto real: 5000 puntos.
    function placeMarker5K() {
        globalCoordinates.lat = lat;
        globalCoordinates.lng = lng;

        if (globalCoordinates.lat === 999 || globalCoordinates.lng === 999) {
            console.error('Coordenadas no disponibles');
            return;
        }

        applyRandomOffset(0.00035);

        markOnMap(placeMarker5K);
    }

    // Reemplaza lat/lng por el centro geocodificado de un nombre de lugar.
    async function cordsFromName(nombre, etiqueta) {
        console.log(`   --> ${etiqueta} -> ${nombre}`);

        if (!OPENCAGE_API_KEY) {
            lat = null;
            lng = null;
            return;
        }

        const response = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(nombre)}&key=${OPENCAGE_API_KEY}`);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            lat = data.results[0].geometry.lat;
            lng = data.results[0].geometry.lng;
        } else {
            lat = null;
            lng = null;
        }
    }

    // --------------------------------------------------------------------------

    // Puntito de estado verde/gris/rojo para el panel de AutoPlay
    function glDot(ok, isFail = false) {
        const cls = isFail ? 'gl-dot-fail' : (ok ? 'gl-dot-on' : 'gl-dot-off');
        return `<span class="gl-dot ${cls}"></span>`;
    }

    function updateApDisplay() {
        if (!aPDisplay) return;

        const nombres = {
            0: 'Cords',
            1: 'Country',
            2: 'State',
            3: 'City',
            4: 'Cuba'
        };

        let typeHTML = '<span style="color:#7d7d8c;">—</span>';

        if (window.attemptedThisRound && window.attemptedThisRound.length > 0) {
            typeHTML = window.attemptedThisRound
                .map(id => {
                    const name = nombres[id] || '???';
                    if (id === TypeMethodChek) {
                        // ÉXITO → Verde
                        return `<span style="color:#3ddc71; font-weight:600;">${name}</span>`;
                    } else {
                        // FALLÓ → Rojo
                        return `<span style="color:#e5726f;">${name}</span>`;
                    }
                })
                .join('<span style="color:#5c5c6e;"> → </span>');
        }

        aPDisplay.innerHTML = `
            <div class="gl-status-line">${glDot(stopPlay)}<b>${stopPlay ? 'ACTIVO' : 'DETENIDO'}</b> · Partida ${partidaNum}/${cantPartidas} · XP ${xpAcum}</div>
            <div class="gl-status-line">${glDot(markMapCheck)}Map ${glDot(guessBtnCheck)}Guess ${glDot(nextBtnCheck)}Next</div>
            <div>Ronda: ${rondaNum}</div>
            <div class="gl-status-line">${glDot(chekFail === 0, chekFail > 0)}Fallos: ${chekFail} &nbsp;${glDot(mark)}Marca &nbsp;·&nbsp; LoadMap: ${loadMapTest}</div>
            <div>${typeHTML}</div>
        `;
    }

    const PANEL_STYLES = `
                .gl-panel {
                    position: fixed;
                    z-index: 999999;
                    width: 250px;
                    background: rgba(18, 18, 28, 0.92);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 10px;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.45);
                    color: #e8e8ef;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 11px;
                    overflow: hidden;
                    user-select: none;
                }
                .gl-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 10px;
                    background: rgba(255,255,255,0.05);
                    cursor: move;
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                }
                .gl-title {
                    font-size: 12px; font-weight: 600; letter-spacing: .2px;
                    flex: 1 1 auto; min-width: 0; overflow: hidden;
                    text-overflow: ellipsis; white-space: nowrap;
                }
                .gl-collapse-btn {
                    width: 17px; height: 17px; border-radius: 4px; border: none; flex: 0 0 auto;
                    background: rgba(255,255,255,0.1); color: #e8e8ef; cursor: pointer;
                    font-size: 12px; line-height: 1; display: flex; align-items: center; justify-content: center;
                }
                .gl-collapse-btn:hover { background: rgba(255,255,255,0.2); }
                .gl-header-btns { display: flex; align-items: center; gap: 3px; flex: 0 0 auto; }
                .gl-tabs { display: flex; gap: 4px; padding: 7px 10px 0; }
                .gl-tab {
                    flex: 1 1 0; padding: 4px 2px; border: none; border-radius: 5px;
                    background: #4c3d8f; color: #ffffff; cursor: pointer;
                    font-size: 9px; font-weight: 600; letter-spacing: .05em;
                    text-transform: uppercase; white-space: nowrap;
                }
                .gl-tab:hover { background: #5c4aa8; }
                .gl-tab.gl-off { background: rgba(255,255,255,0.07); color: #82829a; }
                .gl-part { display: flex; flex-direction: column; gap: 8px; }
                .gl-part.gl-hidden { display: none; }
                .gl-collapse-btn.gl-off { opacity: 0.4; }
                .gl-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
                .gl-section-label {
                    font-size: 9px; text-transform: uppercase; letter-spacing: .06em;
                    color: #9a9aab; margin-bottom: 4px;
                }
                .gl-zoom-row { display: flex; flex-wrap: wrap; gap: 4px; }
                .gl-btn {
                    flex: 1 1 auto;
                    padding: 5px 6px;
                    border: none;
                    border-radius: 5px;
                    background: #4c3d8f;
                    color: white;
                    font-size: 9.5px;
                    cursor: pointer;
                    white-space: nowrap;
                }
                .gl-btn:hover { background: #5c4aa8; }
                .gl-mono {
                    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                    font-size: 10px; white-space: pre-line; color: #c9c9d6; line-height: 1.4;
                }
                .gl-keys { font-size: 9px; color: #82829a; line-height: 1.5; white-space: pre-line; }
                .gl-status-line { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
                .gl-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
                .gl-dot-on { background: #3ddc71; box-shadow: 0 0 4px #3ddc71aa; }
                .gl-dot-off { background: #4a4a58; }
                .gl-dot-fail { background: #e5544f; box-shadow: 0 0 4px #e5544f88; }
                .gl-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 2px 0; }

                /* --- Aviso flotante (falta la API key) --- */
                .gl-toast {
                    position: fixed;
                    z-index: 1000000;
                    top: 16px; left: 50%; transform: translateX(-50%);
                    width: 340px; padding: 12px 14px;
                    background: rgba(18, 18, 28, 0.97);
                    border: 1px solid rgba(229, 165, 79, 0.55);
                    border-radius: 10px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    color: #e8e8ef;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 11px; line-height: 1.55;
                }
                .gl-toast-title { font-size: 12px; font-weight: 700; color: #e5a54f; margin-bottom: 6px; }
                .gl-toast code {
                    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                    background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 3px;
                }
                .gl-toast-actions { display: flex; gap: 6px; margin-top: 10px; }
                .gl-toast .gl-btn { padding: 6px; text-align: center; text-decoration: none; }

                /* --- Panel abierto en otra ventana (pop-out) --- */
                body.gl-popout-body { margin: 0; background: rgb(18, 18, 28); }
                .gl-panel.gl-popout {
                    position: static; width: auto; height: 100vh;
                    border: none; border-radius: 0; box-shadow: none;
                }
                .gl-panel.gl-popout .gl-header { cursor: default; }
                .gl-panel.gl-popout .gl-body { overflow-y: auto; }
    `;

    // Aviso visible (no solo en consola) cuando falta la API key de OpenCage.
    function showMissingKeyToast() {
        if (document.querySelector('.gl-toast')) return;
        injectPanelStyles(document);

        const toast = document.createElement('div');
        toast.className = 'gl-toast';
        toast.innerHTML = `
            <div class="gl-toast-title">⚠️ GeoLince: falta la API key de OpenCage</div>
            <div>
                Sin la key no se pueden mostrar calle, barrio, ciudad, provincia ni país:
                todo sale como <b>Unknown</b>. El resto del panel funciona igual.<br><br>
                Pegá tu key en la constante <code>OPENCAGE_API_KEY</code>, arriba de todo en el script.
            </div>
            <div class="gl-toast-actions">
                <a class="gl-btn" id="glToastLink" href="https://opencagedata.com/" target="_blank" rel="noopener noreferrer">Conseguir una key</a>
                <button class="gl-btn" id="glToastClose">Entendido</button>
            </div>
        `;

        document.body.appendChild(toast);
        toast.querySelector('#glToastClose').onclick = () => toast.remove();
    }

    function injectPanelStyles(doc) {
        if (doc.getElementById('gl-styles')) return;
        const styleTag = doc.createElement('style');
        styleTag.id = 'gl-styles';
        styleTag.textContent = PANEL_STYLES;
        (doc.head || doc.documentElement).appendChild(styleTag);
    }

    // --- Ventana aparte del panel -------------------------------------------
    // Mismo enfoque que el mapa: una ventana con nombre fijo que se reutiliza.

    function openPanelWindow(silent = false) {
        if (panelWindow && !panelWindow.closed) {
            panelWindow.focus();
            return true;
        }

        const width = 290;
        const height = 640;
        const left = Math.max(0, (screen.availWidth || screen.width) - width - 40);
        const top = 60;

        const win = window.open('', 'glPanel', `width=${width},height=${height},left=${left},top=${top}`);
        if (!win) {
            if (!silent) alert('El navegador bloqueó la ventana del panel. Permití las ventanas emergentes para geoguessr.com.');
            return false;
        }

        panelWindow = win;

        win.document.open();
        win.document.write('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
                           '<title>GeoLince</title></head><body class="gl-popout-body"></body></html>');
        win.document.close();

        // Los atajos siguen funcionando aunque el foco esté en esta ventana
        win.document.addEventListener('keydown', onGlobalKeyDown);

        // Si la cerrás a mano, el panel vuelve a la página
        win.addEventListener('beforeunload', () => {
            if (panelWindow !== win) return;   // la estamos cerrando nosotros
            panelWindow = null;
            localStorage.setItem('gg_panelPopout', 'false');
            setTimeout(() => {
                if (controlDiv) controlDiv.remove();
                createZoomControls(document);
            }, 0);
        });

        return true;
    }

    function closePanelWindow() {
        const win = panelWindow;
        panelWindow = null;
        if (win && !win.closed) win.close();
    }

    // popout = true  -> el panel se muda a su propia ventana
    // popout = false -> el panel vuelve a la página
    function setPanelPopout(popout, silent = false) {
        if (popout) {
            if (!openPanelWindow(silent)) return false;
            menuVisible = true;
            if (controlDiv) controlDiv.remove();
            createZoomControls(panelWindow.document);
            localStorage.setItem('gg_panelPopout', 'true');
            panelWindow.focus();
        } else {
            closePanelWindow();
            localStorage.setItem('gg_panelPopout', 'false');
            menuVisible = true;
            if (controlDiv) controlDiv.remove();
            createZoomControls(document);
        }
        return true;
    }

    function togglePanelPopout() {
        setPanelPopout(!(panelWindow && !panelWindow.closed));
    }

    // Al recargar la página la ventana vieja queda muerta (sus botones apuntan
    // al script anterior), así que la cerramos y se reabre sola al cargar.
    window.addEventListener('beforeunload', () => {
        if (panelWindow && !panelWindow.closed) {
            const win = panelWindow;
            panelWindow = null;
            win.close();
        }
    });

    // Crea el panel dentro de `doc`: la página (por defecto) o la ventana aparte
    function createZoomControls(doc = document) {
        const popout = doc !== document;
        injectPanelStyles(doc);

        controlDiv = doc.createElement('div');
        controlDiv.className = popout ? 'gl-panel gl-popout' : 'gl-panel';
        controlDiv.style.display = menuVisible ? 'flex' : 'none';
        controlDiv.style.flexDirection = 'column';

        if (!popout) {
            // Posición guardada (arrastrable) o posición por defecto
            const savedPos = JSON.parse(localStorage.getItem('gg_panelPos') || 'null');
            const defaultLeft = Math.max(10, window.innerWidth - 260);
            controlDiv.style.left = (savedPos?.left ?? defaultLeft) + 'px';
            controlDiv.style.top = (savedPos?.top ?? 10) + 'px';
        }

        controlDiv.innerHTML = `
            <div class="gl-header" id="glHeader">
                <span class="gl-title">🐆 GeoLince v0.7</span>
                <div class="gl-header-btns">
                    <button class="gl-collapse-btn" id="glPopoutBtn"></button>
                    <button class="gl-collapse-btn" id="glCollapseBtn" title="Minimizar / expandir (CTRL+E cicla vistas)">−</button>
                </div>
            </div>
            <div class="gl-tabs" id="glTabs">
                <button class="gl-tab" id="glPart1Btn" title="Mostrar / ocultar Zoom">Zoom</button>
                <button class="gl-tab" id="glPart2Btn" title="Mostrar / ocultar Coordenadas">Coords</button>
                <button class="gl-tab" id="glPart3Btn" title="Mostrar / ocultar Atajos + AutoPlay">Atajos</button>
            </div>
            <div class="gl-body" id="glBody">
                <div class="gl-part" id="glPart1">
                    <div>
                        <div class="gl-section-label">Zoom</div>
                        <div class="gl-zoom-row">
                            <button class="gl-btn" id="glZoomIn">+ (x)</button>
                            <button class="gl-btn" id="glZoomOut">− (c)</button>
                            <button class="gl-btn" id="glZoomReset">Reset (r)</button>
                            <button class="gl-btn" id="glZoomMax">Max (v)</button>
                            <button class="gl-btn" id="glZoomMin">Min (b)</button>
                        </div>
                        <div class="gl-mono" id="glZoomLevel">Zoom Level: ${zoomLevel}</div>
                    </div>
                </div>
                <div class="gl-divider gl-part-divider" data-for="2"></div>
                <div class="gl-part" id="glPart2">
                    <div>
                        <div class="gl-section-label">Coordenadas</div>
                        <div class="gl-mono" id="glInfo">Coordinates: press 6</div>
                    </div>
                </div>
                <div class="gl-divider gl-part-divider" data-for="3"></div>
                <div class="gl-part" id="glPart3">
                    <div>
                        <div class="gl-section-label">Atajos</div>
                        <div class="gl-keys">Z ver mapa · X zoom+2 · C zoom−2 · N coords · M mapa · CTRL+Q panel · CTRL+E vistas · ALT+P ventana · * detener
ALT 1 jugar · 2 marcar · 3 guess · 4 next · 5 resultados · 6 de nuevo
ALT 7 streak×5 · 8 streak×25 · 9 marca 5K</div>
                    </div>
                    <div class="gl-divider"></div>
                    <div>
                        <div class="gl-section-label">AutoPlay</div>
                        <div class="gl-mono" id="glApDisplay"></div>
                    </div>
                </div>
            </div>
        `;

        doc.body.appendChild(controlDiv);

        // Botón abrir en otra ventana / devolver a la página
        const popoutBtn = controlDiv.querySelector('#glPopoutBtn');
        popoutBtn.textContent = popout ? '⤓' : '⧉';
        popoutBtn.title = popout
            ? 'Devolver el panel a la página (ALT+P)'
            : 'Abrir el panel en otra ventana (ALT+P)';
        popoutBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        popoutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setPanelPopout(!popout);
        });

        // Referencias a los elementos dinámicos (mismas variables que usa el resto del script)
        zoomLevelDisplay = controlDiv.querySelector('#glZoomLevel');
        infoDisplay = controlDiv.querySelector('#glInfo');
        aPDisplay = controlDiv.querySelector('#glApDisplay');
        updateApDisplay();

        // Botones de zoom
        controlDiv.querySelector('#glZoomIn').onclick = () => {
            zoomLevel++;
            zoomLevelDisplay.innerText = `Zoom Level: ${zoomLevel}`;
            updateMap();
        };
        controlDiv.querySelector('#glZoomOut').onclick = () => {
            zoomLevel--;
            zoomLevelDisplay.innerText = `Zoom Level: ${zoomLevel}`;
            updateMap();
        };
        controlDiv.querySelector('#glZoomReset').onclick = () => {
            zoomLevel = 10;
            zoomLevelDisplay.innerText = `Zoom Level: ${zoomLevel}`;
            updateMap();
        };
        controlDiv.querySelector('#glZoomMax').onclick = () => {
            zoomLevel = maxZoom;
            zoomLevelDisplay.innerText = `Zoom Level: ${zoomLevel}`;
            updateMap();
        };
        controlDiv.querySelector('#glZoomMin').onclick = () => {
            zoomLevel = minZoom;
            zoomLevelDisplay.innerText = `Zoom Level: ${zoomLevel}`;
            updateMap();
        };

        // --- Colapsar/expandir (además de CTRL+Q, que oculta todo el panel) ---
        const header = controlDiv.querySelector('#glHeader');
        const body = controlDiv.querySelector('#glBody');
        const collapseBtn = controlDiv.querySelector('#glCollapseBtn');
        const partsDividers = Array.from(controlDiv.querySelectorAll('.gl-part-divider'));
        const tabsBar = controlDiv.querySelector('#glTabs');

        // Cada bloque se muestra/oculta por separado; 'closed' deja solo la cabecera.
        // 1 = Zoom · 2 = Coordenadas · 3 = Atajos + AutoPlay
        const parts = [1, 2, 3].map(n => ({
            box: controlDiv.querySelector('#glPart' + n),
            btn: controlDiv.querySelector('#glPart' + n + 'Btn'),
            visible: true
        }));
        let panelClosed = false;

        const savedState = JSON.parse(localStorage.getItem('gg_panelState') || 'null');
        if (savedState) {
            if (Array.isArray(savedState.parts)) {
                parts.forEach((p, i) => { p.visible = savedState.parts[i] !== false; });
            } else {
                // Migracion: antes la parte 1 era Zoom + Coordenadas juntas
                parts[0].visible = savedState.p1 !== false;
                parts[1].visible = savedState.p1 !== false;
                parts[2].visible = savedState.p2 !== false;
            }
            panelClosed = savedState.closed === true;
        } else {
            const oldMode = localStorage.getItem('gg_panelMode');
            if (oldMode === 'half') {
                parts[2].visible = false;
            } else if (oldMode === 'closed' || localStorage.getItem('gg_panelCollapsed') === 'true') {
                panelClosed = true;
            }
        }

        // Ultima combinacion abierta, para que '+' restaure lo que estabas viendo
        let lastOpen = parts.map(p => p.visible);
        if (!lastOpen.some(Boolean)) lastOpen = [true, true, true];

        function applyPanelState() {
            const emptyBody = !parts.some(p => p.visible);
            const hidden = panelClosed || emptyBody;

            body.style.display = hidden ? 'none' : 'flex';
            tabsBar.style.display = panelClosed ? 'none' : 'flex';
            parts.forEach(p => {
                p.box.classList.toggle('gl-hidden', !p.visible);
                p.btn.classList.toggle('gl-off', !p.visible);
            });

            // Un separador solo si hay algo visible antes y despues de el
            partsDividers.forEach(div => {
                const idx = parseInt(div.dataset.for, 10) - 1;
                const before = parts.slice(0, idx).some(p => p.visible);
                div.style.display = (before && parts[idx].visible) ? '' : 'none';
            });

            collapseBtn.textContent = hidden ? '+' : '−';

            localStorage.setItem('gg_panelState', JSON.stringify({
                parts: parts.map(p => p.visible), closed: panelClosed
            }));
        }
        applyPanelState();

        function setPanelState(visibles, closed) {
            parts.forEach((p, i) => { p.visible = visibles[i]; });
            panelClosed = closed;
            if (!closed && visibles.some(Boolean)) lastOpen = visibles.slice();
            applyPanelState();
        }

        function togglePart(n) {
            const i = n - 1;
            // Al tocar un bloque con el panel cerrado, se reabre mostrando solo ese bloque
            if (panelClosed) {
                setPanelState(parts.map((_, k) => k === i), false);
                return;
            }
            setPanelState(parts.map((p, k) => k === i ? !p.visible : p.visible), false);
        }

        // CTRL+E: todo → sin atajos → solo zoom → cerrado → todo
        const PANEL_CYCLE = [
            { parts: [true, true, true],    closed: false },
            { parts: [true, true, false],   closed: false },
            { parts: [true, false, false],  closed: false },
            { parts: [false, false, false], closed: true  }
        ];

        cyclePanelMode = () => {
            if (!menuVisible) {
                toggleMenu();
                if (panelClosed || !parts.some(p => p.visible)) setPanelState(lastOpen.slice(), false);
                return;
            }
            const i = PANEL_CYCLE.findIndex(m =>
                m.closed === panelClosed && m.parts.every((v, k) => v === parts[k].visible));
            const next = PANEL_CYCLE[(i + 1) % PANEL_CYCLE.length];
            setPanelState(next.parts.slice(), next.closed);
        };

        collapseBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (panelClosed || !parts.some(p => p.visible)) {
                setPanelState(lastOpen.slice(), false);
            } else {
                setPanelState(parts.map(p => p.visible), true);
            }
        });

        parts.forEach((p, i) => {
            p.btn.addEventListener('mousedown', (e) => e.stopPropagation());
            p.btn.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePart(i + 1);
            });
        });

        // --- Panel arrastrable (agarrando el header) ---
        // En la ventana aparte no hace falta: se mueve la ventana en sí.
        if (!popout) {
            let isDragging = false;
            let dragOffsetX = 0;
            let dragOffsetY = 0;

            header.addEventListener('mousedown', (e) => {
                isDragging = true;
                const rect = controlDiv.getBoundingClientRect();
                dragOffsetX = e.clientX - rect.left;
                dragOffsetY = e.clientY - rect.top;
            });

            doc.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const newLeft = Math.min(Math.max(0, e.clientX - dragOffsetX), window.innerWidth - 40);
                const newTop = Math.min(Math.max(0, e.clientY - dragOffsetY), window.innerHeight - 40);
                controlDiv.style.left = `${newLeft}px`;
                controlDiv.style.top = `${newTop}px`;
            });

            doc.addEventListener('mouseup', () => {
                if (!isDragging) return;
                isDragging = false;
                localStorage.setItem('gg_panelPos', JSON.stringify({
                    left: parseInt(controlDiv.style.left, 10),
                    top: parseInt(controlDiv.style.top, 10)
                }));
            });
        }
    }

    // Si la sesión anterior tenía el panel en otra ventana, se reabre solo.
    // Si el navegador bloquea la ventana emergente, queda dentro de la página.
    if (localStorage.getItem('gg_panelPopout') === 'true' && openPanelWindow(true)) {
        menuVisible = true;   // una ventana con el panel oculto no tendria sentido
        createZoomControls(panelWindow.document);
    } else {
        createZoomControls();
    }

    if (!OPENCAGE_API_KEY) showMissingKeyToast();

    function onGlobalKeyDown(event) {

        const key = event.key.toLowerCase();

        // Normal
        switch (key) {
            case 'z':
                event.stopImmediatePropagation();
                updateMap();
                break;
            case 'x':
                event.stopImmediatePropagation();
                zoomLevel+=2;
                updateMap();
                break;
            case 'c':
                event.stopImmediatePropagation();
                zoomLevel-=2;
                updateMap();
                break;
            case 'n':
                event.stopImmediatePropagation();
                locationInfo();
                break;
            case 'q':
                if (event.ctrlKey) {
                    toggleMenu();
                }
                break;
            case 'e':
                if (event.ctrlKey) {
                    event.stopImmediatePropagation();
                    cyclePanelMode();
                }
                break;
            case 'm':
                event.stopImmediatePropagation();
                toggleMpProvider();
                break;
            case '*':
                event.stopImmediatePropagation();
                stopPlay = false;
                break;

        }

        if(event.altKey){
            switch (key){
                case '1':
                    event.stopImmediatePropagation();
                    startGame();
                    break;
                case '2':
                    event.stopImmediatePropagation();
                    placeMarker(0);
                    break;
                case '3':
                    event.stopImmediatePropagation();
                    guessButton();
                    break;
                case '4':
                    event.stopImmediatePropagation();
                    nextButton();
                    break;
                case '5':
                    event.stopImmediatePropagation();
                    viewResultsButton();
                    break;
                case '6':
                    event.stopImmediatePropagation();
                    playAgainButton();
                    break;
                case '7':
                    event.stopImmediatePropagation();
                    AutoPlayStreaks(50,5);
                    break;
                case '8':
                    event.stopImmediatePropagation();
                    AutoPlayStreaks(50,25);
                    break;
                case '9':
                    event.stopImmediatePropagation();
                    placeMarker5K();
                    break;
                case '*':
                    event.stopImmediatePropagation();
                    stopPlay = false;
                    break;
                case 'p':
                    event.stopImmediatePropagation();
                    event.preventDefault();
                    togglePanelPopout();
                    break;
            }
        }
    }

    document.addEventListener('keydown', onGlobalKeyDown);

    // =============================================
    // UTILIDADES
    // =============================================

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // Busca un boton haciendo polling (con findFn) y lo clickea apenas esta
    // visible y habilitado, en vez de un solo intento tras un sleep fijo.
    async function clickAndWait(findFn, nombre, maxWait = 8000) {
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            try {
                const btn = findFn();
                if (btn) {
                    const style = window.getComputedStyle(btn);
                    const oculto = style.opacity === '0' || style.display === 'none' || style.visibility === 'hidden';
                    if (!oculto && !btn.disabled) {
                        btn.click();
                        return true;
                    }
                }
            } catch (e) { /* ignoramos errores temporales mientras cambia el DOM */ }
            await sleep(150); // 150 ms es más que suficiente en el 99% de casos
        }
        chekFail++;
        updateApDisplay();
        console.warn(`Timeout esperando: ${nombre}`);

        // Diagnóstico: volcamos los botones visibles en pantalla al momento del
        // timeout, para poder ajustar los selectores cuando GeoGuessr los cambia.
        try {
            const visibles = Array.from(document.querySelectorAll('button')).filter(b => {
                const st = window.getComputedStyle(b);
                return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
            }).map(b => ({ texto: b.innerText.trim().slice(0, 30), clase: b.className, disabled: b.disabled }));
            console.warn(`[GeoLince] Botones visibles al fallar "${nombre}":`, visibles);
        } catch (e) { /* noop */ }

        return false;
    }


})();