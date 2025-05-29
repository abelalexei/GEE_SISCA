// =====================================================================================
// === Aplicación GEE: Análisis de Índice Espectral en Teselas                   ===
// === Desarrollada como parte del proceso de capacitación del Cluster Urbano Copernicus Centroamérica ===                    ===
// =====================================================================================

// =====================================================================================
// === SECCIÓN DE CONFIGURACIÓN PARA EL DESARROLLADOR DE LA APP                      ===
// =====================================================================================
var NOMBRE_AUTOR_APP = '[TU NOMBRE AQUÍ O INSTITUCIÓN]';

var NOMBRE_INDICE_USUARIO = 'NDVI';
var DESCRIPCION_CORTA_INDICE = 'Índice de Vegetación';
var UNIDADES_VALOR_INDICE = '(valores de -1 a 1)';
var NOMBRE_BANDA_CALCULADA = 'valor_indice_calculado';

function calcularIndicePersonalizado(imagenS2escalada) {
  return imagenS2escalada.normalizedDifference(['B8', 'B4']).rename(NOMBRE_BANDA_CALCULADA);
}

var ID_COLECCION_IMAGENES_SATELITALES = 'COPERNICUS/S2_SR_HARMONIZED';
var FACTOR_ESCALA_REFLECTANCIA_IMG = 10000;
var ESCALA_NATIVA_INDICE_METROS = 10;
var BANDAS_REQUERIDAS_COLECCION = ["B2", "B3", "B4", "B8", "QA60", "SCL"];

var TIPO_TESELA_DEFAULT = 'Rectangular';
var TAMANO_LADO_TESELA_KM_DEFAULT = '0.25';
var MAX_ERROR_GEOMETRIA_METROS = 1;

var NUMERO_CLASES_VISUALIZACION = 5;
var PALETAS_INDICE_DISPONIBLES = {
  'Estándar (Rojo-Yel-Grn-Blu)': ['#d7191c', '#fdae61', '#ffffbf', '#abdda4', '#2b83ba'],
  'Solo Verdes (Vegetación)': ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#006d2c', '#00441b'].slice(0, NUMERO_CLASES_VISUALIZACION),
  'Solo Rojos (Estrés/Suelo)': ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'].slice(0, NUMERO_CLASES_VISUALIZACION).reverse(),
  'Azules (Agua)': ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'].slice(0, NUMERO_CLASES_VISUALIZACION)
};
var NOMBRE_PALETA_INDICE_DEFAULT = Object.keys(PALETAS_INDICE_DISPONIBLES)[0];

var ZOOM_MAPA_INICIAL = 7;
var LON_MAPA_INICIAL = -88.8;
var LAT_MAPA_INICIAL = 13.7;
var ZOOM_AL_AOI = 13;

var paqueteHexagonos = null;
try {
  paqueteHexagonos = require('users/gena/packages:grid');
} catch (e) {
  print('Advertencia: No se pudo cargar el paquete de Gena para hexágonos. La opción hexagonal usará rectángulos.', e);
}
// =====================================================================================
// === FIN DE SECCIÓN DE CONFIGURACIÓN ===
// =====================================================================================

// =====================================================================================
// === 1. Interfaz de Usuario (UI) ===
// =====================================================================================
ui.root.clear();
var panelPrincipal = ui.Panel({style: {width: '380px', padding: '12px', backgroundColor: '#F9F9F9'}});
var mapa = ui.Map();
mapa.setOptions('HYBRID');
mapa.style().set('cursor', 'crosshair');
mapa.setControlVisibility({
  all: false, layerList: true, zoomControl: true, scaleControl: true,
  mapTypeControl: true, drawingToolsControl: true
});

var drawingTools = mapa.drawingTools();
drawingTools.setShown(true); drawingTools.setLinked(false);
drawingTools.setDrawModes(['polygon', 'rectangle']);

var panelResultados = ui.Panel({style: {margin: '10px 0'}});
var etiquetaEstado = ui.Label('Listo.', {fontSize: '12px', color: '#0056b3', margin: '10px 0', fontWeight: 'bold', padding: '5px', backgroundColor: '#E6F7FF'});

function limpiarTodo() {
  mapa.layers().reset();
  drawingTools.layers().reset(); // Limpia todas las geometrías de las herramientas de dibujo
  drawingTools.setShape(null);   // Deselecciona cualquier modo de dibujo activo
  if (panelResultados) {
    panelResultados.clear();
  }
  actualizarEstadoUI('Listo para un nuevo análisis. Dibuja un AOI.', false);
  mapa.setCenter(LON_MAPA_INICIAL, LAT_MAPA_INICIAL, ZOOM_MAPA_INICIAL);
}

var botonLimpiar = ui.Button({
  label: 'Limpiar Análisis / Nuevo AOI',
  onClick: limpiarTodo,
  style: {fontSize: '13px', stretch: 'horizontal', margin: '10px 0 5px 0', backgroundColor: '#6c757d', color: 'white', border: '1px solid #5a6268'}
});

function limpiarGeometriasDibujadasYResultadosOnDraw() {
  var dtLayers = drawingTools.layers();
  while (dtLayers.length() > 1) { 
    drawingTools.layers().remove(dtLayers.get(0));
  }
  mapa.layers().reset(); 
  if (panelResultados) {
    panelResultados.clear();
  }
  actualizarEstadoUI('AOI dibujada/modificada. Ajusta parámetros y Ejecuta.', false);
}
drawingTools.onEdit(ui.util.debounce(limpiarGeometriasDibujadasYResultadosOnDraw, 400));
drawingTools.onDraw(ui.util.debounce(limpiarGeometriasDibujadasYResultadosOnDraw, 400));
drawingTools.onErase(ui.util.debounce(limpiarTodo, 400));

panelPrincipal.add(ui.Label('Análisis de ' + NOMBRE_INDICE_USUARIO + ' en Teselas', {fontWeight: 'bold', fontSize: '20px', margin: '0 0 10px 0', color: '#333333'}));
panelPrincipal.add(ui.Label('Calcula ' + DESCRIPCION_CORTA_INDICE + ' para un año y AOI, lo agrega a teselas y clasifica.', {fontSize: '12px', color: '#555555'}));
panelPrincipal.add(ui.Label('Desarrollada para: Cluster Urbano Copernicus Centroamérica', {fontSize: '10px', color: 'gray', margin: '5px 0'}));
panelPrincipal.add(ui.Label('Autor: ' + NOMBRE_AUTOR_APP, {fontSize: '10px', color: 'gray', margin: '0 0 10px 0'}));
panelPrincipal.add(ui.Label('Instrucciones de Uso:', {fontWeight: 'bold', fontSize: '14px', margin: '15px 0 5px 0', color: '#0056b3'}));
var instrucciones =
    '1. En el mapa, usa las herramientas de dibujo (arriba a la izq.) para trazar un Área de Interés (AOI).\n' +
    '2. Selecciona el tipo de tesela (Rectangular preferido).\n' +
    '3. Define el tamaño (lado en km) para las teselas.\n' +
    '4. Especifica el año para las imágenes.\n' +
    '5. Selecciona una paleta de colores para el ' + NOMBRE_INDICE_USUARIO + '.\n' +
    '6. Haz clic en "Ejecutar Análisis".\n' +
    '7. Usa "Limpiar Análisis" para reiniciar.';
panelPrincipal.add(ui.Label(instrucciones, {fontSize: '12px', whiteSpace: 'pre-line', margin: '0 0 15px 0', color: '#444444'}));

panelPrincipal.add(ui.Label('Parámetros de Entrada:', {fontWeight: 'bold', fontSize: '14px', margin: '10px 0 5px 0', color: '#0056b3'}));
var estiloEtiquetaInput = {fontSize: '12px', margin: '0px 5px 2px 0', color: '#333333'};
var estiloTextboxInput = {fontSize: '12px', width: '100px', color: '#333333', margin: '0px 0px 2px 0'};
var panelHorizontalStyle = {margin: '0 0 5px 0'};

var selectTipoTesela = ui.Select({items: ['Rectangular', 'Hexagonal'], value: TIPO_TESELA_DEFAULT, style: estiloTextboxInput});
panelPrincipal.add(ui.Panel([ui.Label('Tipo de Tesela:', estiloEtiquetaInput), selectTipoTesela], ui.Panel.Layout.Flow('horizontal'), panelHorizontalStyle));
var etiquetaTamanoTesela = ui.Label('Tamaño tesela (lado km):', estiloEtiquetaInput);
var textboxTamanoTesela = ui.Textbox({placeholder: 'Ej: 0.25', value: TAMANO_LADO_TESELA_KM_DEFAULT, style: estiloTextboxInput});
panelPrincipal.add(ui.Panel([etiquetaTamanoTesela, textboxTamanoTesela], ui.Panel.Layout.Flow('horizontal'), panelHorizontalStyle));
var etiquetaAno = ui.Label('Año (' + (new Date().getFullYear() - 8) + '-' + new Date().getFullYear() +'):', estiloEtiquetaInput);
var textboxAno = ui.Textbox({placeholder: 'Ej: ' + (new Date().getFullYear() -1) , value: String(new Date().getFullYear() -1), style: estiloTextboxInput});
panelPrincipal.add(ui.Panel([etiquetaAno, textboxAno], ui.Panel.Layout.Flow('horizontal'), panelHorizontalStyle));
var etiquetaPaleta = ui.Label('Paleta de colores ' + NOMBRE_INDICE_USUARIO + ':', estiloEtiquetaInput);
var selectPaleta = ui.Select({
  items: Object.keys(PALETAS_INDICE_DISPONIBLES), value: NOMBRE_PALETA_INDICE_DEFAULT,
  style: {fontSize: '12px', width: '200px', color: '#333333', margin: '0px 0px 2px 0'}
});
panelPrincipal.add(ui.Panel([etiquetaPaleta, selectPaleta], ui.Panel.Layout.Flow('horizontal'), panelHorizontalStyle));

var botonEjecutar = ui.Button({
  label: 'Ejecutar Análisis',
  style: {fontSize: '14px', fontWeight: 'bold', stretch: 'horizontal', margin: '20px 0 5px 0', backgroundColor: '#007bff', color: 'white', border: '1px solid #0069d9'}
});
panelPrincipal.add(botonEjecutar);
panelPrincipal.add(botonLimpiar); // Botón Limpiar añadido
panelPrincipal.add(panelResultados);
panelPrincipal.add(etiquetaEstado);

var panelDivisor = ui.SplitPanel({firstPanel: panelPrincipal, secondPanel: mapa, orientation: 'horizontal', wipe: false, style: {stretch: 'both'}});
ui.root.add(panelDivisor);

// =====================================================================================
// === 2. Funciones Auxiliares (sin cambios significativos, excepto la máscara de nubes) ===
// =====================================================================================
function actualizarEstadoUI(mensaje, esError) {
  esError = typeof esError !== 'undefined' ? esError : false;
  etiquetaEstado.setValue(mensaje);
  etiquetaEstado.style().set('color', esError ? '#D8000C' : '#0056b3').set('backgroundColor', esError ? '#FFD2D2' : '#D9EDF7');
  if (esError) print('Error App:', mensaje);
}

function mascaraNubesS2(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var scl = image.select('SCL');
  var unwantedSCL = [3, 8, 9, 10, 11]; 

  var maskQA = qa.bitwiseAnd(cloudBitMask).eq(0).and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  var maskSCL = scl.remap(unwantedSCL, ee.List.repeat(0, unwantedSCL.length), 1).eq(1); 

  return image.updateMask(maskQA).updateMask(maskSCL)
      .divide(FACTOR_ESCALA_REFLECTANCIA_IMG)
      .select(BANDAS_REQUERIDAS_COLECCION)
      .copyProperties(image, ["system:time_start"]);
}

// calcularIndicePersonalizado está en la sección de configuración

function crearLeyendaClasificadaUI(titulo, paletaHexCliente, etiquetasClases, unidades) {
  var leyendaPanel = ui.Panel({style: {padding: '6px 8px', margin: '0 0 8px 0'},layout: ui.Panel.Layout.flow('vertical')});
  leyendaPanel.add(ui.Label(titulo, {fontWeight: 'bold', fontSize: '13px', margin: '0 0 6px 0'}));
  var nColores = paletaHexCliente.length;
  if (etiquetasClases.length !== nColores) {
    print('Advertencia Leyenda Clasificada: # colores ('+nColores+') != # etiquetas ('+etiquetasClases.length+').');
    if (etiquetasClases.length > nColores) etiquetasClases = etiquetasClases.slice(0, nColores);
    while (etiquetasClases.length < nColores) etiquetasClases.push('Clase ' + (etiquetasClases.length + 1));
  }
  for (var i = 0; i < nColores; i++) {
    var colorHex = paletaHexCliente[i];
    if (colorHex.charAt(0) !== '#') colorHex = '#' + colorHex;
    var cajaColor = ui.Label('', {backgroundColor: colorHex, padding: '8px', margin: '0 0 4px 0', border: '1px solid #AAAAAA'});
    var descripcion = etiquetasClases[i] + (unidades ? ' ' + unidades : '');
    var fila = ui.Panel([cajaColor, ui.Label(descripcion, {margin: '0 0 4px 6px', fontSize: '11px'})], ui.Panel.Layout.Flow('horizontal'));
    leyendaPanel.add(fila);
  }
  return leyendaPanel;
}

function crearLeyendaContinuaUI(titulo, paletaHexCliente, minValorLeyenda, maxValorLeyenda, unidades) {
  var leyendaPanel = ui.Panel({style: {padding: '6px 8px', margin: '0 0 8px 0'},layout: ui.Panel.Layout.flow('vertical')});
  leyendaPanel.add(ui.Label(titulo, {fontWeight: 'bold', fontSize: '13px', margin: '0 0 4px 0'}));

  var panelBarraColores = ui.Panel({layout: ui.Panel.Layout.Flow('horizontal')});
  for (var i = 0; i < paletaHexCliente.length; i++) {
    var colorHex = paletaHexCliente[i];
    if (colorHex.charAt(0) !== '#') colorHex = '#' + colorHex;
    panelBarraColores.add(ui.Label('', {
      backgroundColor: colorHex, padding: '10px 6px', margin: '0'
    }));
  }
  leyendaPanel.add(panelBarraColores);

  var formatoMin = minValorLeyenda.toFixed(2);
  var formatoMax = maxValorLeyenda.toFixed(2);
  var unidadesTexto = unidades ? ' ' + unidades : '';

  var panelEtiquetasMinMax = ui.Panel({
    widgets: [
      ui.Label(formatoMin, {fontSize: '11px', margin: '0 0 0 0'}),
      ui.Label(unidadesTexto, {fontSize: '11px', margin: '0 auto 0 auto', color: '#555555'}),
      ui.Label(formatoMax, {fontSize: '11px', margin: '0 0 0 auto'})
    ],
    layout: ui.Panel.Layout.Flow('horizontal'),
    style: {stretch: 'horizontal', margin: '4px 2px 0 2px'}
  });
  leyendaPanel.add(panelEtiquetasMinMax);
  return leyendaPanel;
}

// =====================================================================================
// === 3. Lógica Principal de la Aplicación ===
// =====================================================================================
botonEjecutar.onClick(function() {
  mapa.layers().reset(); // Limpiar capas de datos ANTERIORES
  if (panelResultados) { panelResultados.clear(); }
  actualizarEstadoUI('Iniciando análisis...', false);

  var drawingLayers = mapa.drawingTools().layers();
  if (drawingLayers.length() === 0 || !drawingLayers.get(drawingLayers.length() - 1).getEeObject()) {
    actualizarEstadoUI('Error: Dibuja un Área de Interés (AOI) válida.', true); return;
  }
  var aoi = drawingLayers.get(drawingLayers.length() - 1).getEeObject();

  var tamanoTeselaKmCliente = parseFloat(textboxTamanoTesela.getValue());
  if (isNaN(tamanoTeselaKmCliente) || tamanoTeselaKmCliente <= 0) {
    actualizarEstadoUI('Error: Tamaño de tesela debe ser un número positivo.', true); return;
  }
  var anoCliente = parseInt(textboxAno.getValue());
  var currentYear = new Date().getFullYear();
  if (isNaN(anoCliente) || anoCliente < 2015 || anoCliente > currentYear) {
    actualizarEstadoUI('Error: Año no válido (ej. 2015-' + currentYear + ').', true); return;
  }
  var paletaSeleccionadaNombre = selectPaleta.getValue();
  var paletaColoresClienteJS = PALETAS_INDICE_DISPONIBLES[paletaSeleccionadaNombre];

  mapa.centerObject(aoi, ZOOM_AL_AOI);
  // Añadir la AOI usada para este análisis, inicialmente no visible
  mapa.addLayer(aoi, {color: '808080', fillColor: '80808010'}, 'AOI Analizada', false); // MODIFICADO: visibilidad inicial false

  // Después de usar el AOI para el análisis, limpiar las geometrías del panel de dibujo
  // para evitar confusión con la capa 'AOI Analizada' que se añade arriba.
  // El usuario puede dibujar una nueva si quiere otro análisis.
  mapa.drawingTools().clear(); // Limpia las geometrías del panel de dibujo
  // Si se limpió, y la capa de AOI dibujada era la única, puede que desaparezca.
  // Por eso añadimos 'AOI Analizada' arriba.
  // Para volver a habilitar el dibujo si se desea:
  // drawingTools.setShape(null); // Deselecciona herramienta
  // drawingTools.setDrawModes(['polygon', 'rectangle']); // Re-habilita modos

  var tipoTeselaSeleccionado = selectTipoTesela.getValue();
  actualizarEstadoUI('Generando teselas (' + tipoTeselaSeleccionado + ')...', false);
  
  var rejilla;
  var boundsAOI = aoi.bounds();
  
  if (tipoTeselaSeleccionado === 'Hexagonal' && paqueteHexagonos) {
    try { rejilla = paqueteHexagonos.hexGrid(boundsAOI, tamanoTeselaKmCliente, false); }
    catch (e) {
      actualizarEstadoUI('Error generando hexágonos. Usando rectángulos.', true);
      rejilla = boundsAOI.coveringGrid(ee.Projection('EPSG:3857'), tamanoTeselaKmCliente * 1000);
    }
  } else {
    if (tipoTeselaSeleccionado === 'Hexagonal' && !paqueteHexagonos) {
        actualizarEstadoUI('Advertencia: Paquete de hexágonos no disponible. Usando rectángulos.', false);
    }
    var proyeccionParaRejillaMetros = ee.Projection('EPSG:3857');
    rejilla = boundsAOI.coveringGrid({proj: proyeccionParaRejillaMetros, scale: tamanoTeselaKmCliente * 1000});
  }

  var teselasRecortadas = rejilla.map(function(feature) {
    var intersectedGeometry = feature.geometry(ee.ErrorMargin(MAX_ERROR_GEOMETRIA_METROS)) 
                                  .intersection(aoi, ee.ErrorMargin(MAX_ERROR_GEOMETRIA_METROS));
    return ee.Feature(intersectedGeometry).copyProperties(feature, feature.propertyNames());
  }).filter(ee.Filter.neq('.geo', null));

  teselasRecortadas.size().evaluate(function(size, error) {
    if (error) { actualizarEstadoUI('Error evaluando tamaño de teselas: ' + error, true); return; }
    if (size === 0) { actualizarEstadoUI('Error: No se generaron teselas válidas en el AOI.', true); return; }
    actualizarEstadoUI('Teselas generadas ('+ size +'). Cargando imágenes '+ (ID_COLECCION_IMAGENES_SATELITALES.split('/')[1] || 'satelitales') +'...', false);

    var fechaInicio = ee.Date.fromYMD(anoCliente, 1, 1);
    var fechaFin = ee.Date.fromYMD(anoCliente, 12, 31);
    var coleccionImagenes = ee.ImageCollection(ID_COLECCION_IMAGENES_SATELITALES)
                        .filterBounds(aoi)
                        .filterDate(fechaInicio, fechaFin)
                        .map(mascaraNubesS2);

    coleccionImagenes.size().evaluate(function(imgSize, errorImg) {
      if (errorImg) { actualizarEstadoUI('Error evaluando # imágenes: ' + errorImg, true); return; }
      if (imgSize === 0) { actualizarEstadoUI('Error: No hay imágenes para el año/AOI después del filtrado.', true); return; }
      actualizarEstadoUI(imgSize + ' imágenes encontradas. Creando compuesto y calculando ' + NOMBRE_INDICE_USUARIO + '...', false);
      
      var imagenCompuesta = coleccionImagenes.median();
      var indiceCalculado = calcularIndicePersonalizado(imagenCompuesta);
      
      indiceCalculado.bandNames().evaluate(function(bandas, errorBandas) {
          if (errorBandas || !bandas || bandas.length === 0 || bandas.indexOf(NOMBRE_BANDA_CALCULADA) === -1) {
            actualizarEstadoUI('Error: El cálculo del índice no produjo la banda esperada ('+NOMBRE_BANDA_CALCULADA+'). Revise la función.', true);
            print('Detalle del índice calculado:', indiceCalculado, 'Nombres de bandas:', bandas); return;
          }
          
          // --- Visualización de Imagen Satelital Compuesta (Recortada) ---
          var visParamsS2compuesta = {bands: ['B4', 'B3', 'B2'], min: 0.0, max: 0.3}; // Ajusta max si es necesario
          mapa.addLayer(imagenCompuesta.select(['B4', 'B3', 'B2']).clip(aoi), visParamsS2compuesta, 'Imagen Satelital Compuesta (AOI)', false);


          indiceCalculado.select(NOMBRE_BANDA_CALCULADA).reduceRegion({
              reducer: ee.Reducer.minMax(), geometry: aoi, scale: ESCALA_NATIVA_INDICE_METROS * 3, maxPixels: 1e10, bestEffort: true
          }).evaluate(function(rangoIndiceRaster, errorRangoRaster) {
              var minIndiceRasterCliente, maxIndiceRasterCliente;
              if (errorRangoRaster || !rangoIndiceRaster || 
                  rangoIndiceRaster[NOMBRE_BANDA_CALCULADA+'_min'] === null || rangoIndiceRaster[NOMBRE_BANDA_CALCULADA+'_max'] === null) {
                  actualizarEstadoUI('Advertencia: No se pudo obtener min/max para la imagen del índice. Usando defaults.', false);
                  minIndiceRasterCliente = (NOMBRE_INDICE_USUARIO.indexOf('NDVI') > -1 || NOMBRE_INDICE_USUARIO.indexOf('EVI') > -1) ? -0.2 : 0;
                  maxIndiceRasterCliente = (NOMBRE_INDICE_USUARIO.indexOf('NDVI') > -1 || NOMBRE_INDICE_USUARIO.indexOf('EVI') > -1) ? 0.9 : 1;
              } else {
                  minIndiceRasterCliente = rangoIndiceRaster[NOMBRE_BANDA_CALCULADA+'_min'];
                  maxIndiceRasterCliente = rangoIndiceRaster[NOMBRE_BANDA_CALCULADA+'_max'];
              }
              if (minIndiceRasterCliente === maxIndiceRasterCliente) { maxIndiceRasterCliente = minIndiceRasterCliente + ( (Math.abs(minIndiceRasterCliente) < 0.001 && Math.abs(maxIndiceRasterCliente) < 0.001) ? 0.1 : Math.abs(minIndiceRasterCliente * 0.1) || 0.1) ;}
              if (minIndiceRasterCliente > maxIndiceRasterCliente) { var tmp_swap = minIndiceRasterCliente; minIndiceRasterCliente = maxIndiceRasterCliente; maxIndiceRasterCliente = tmp_swap; if (minIndiceRasterCliente === maxIndiceRasterCliente) maxIndiceRasterCliente = minIndiceRasterCliente + ( (Math.abs(minIndiceRasterCliente) < 0.001 && Math.abs(maxIndiceRasterCliente) < 0.001) ? 0.1 : Math.abs(minIndiceRasterCliente * 0.1) || 0.1) ;}

              // Añadir capa de índice RASTER (Recortada) con visibilidad inicial DESACTIVADA
              mapa.addLayer(indiceCalculado.select(NOMBRE_BANDA_CALCULADA).clip(aoi), { // <-- CLIP AÑADIDO
                  min: minIndiceRasterCliente, max: maxIndiceRasterCliente, palette: paletaColoresClienteJS
              }, NOMBRE_INDICE_USUARIO + ' (Raster Recortado)', false);

              var leyendaRasterIndice = crearLeyendaContinuaUI(
                  NOMBRE_INDICE_USUARIO + ' (Raster)', paletaColoresClienteJS,
                  minIndiceRasterCliente, maxIndiceRasterCliente, UNIDADES_VALOR_INDICE
              );
              panelResultados.add(leyendaRasterIndice);

              actualizarEstadoUI('Calculando estadísticas del ' + NOMBRE_INDICE_USUARIO + ' por tesela...', false);
              var propiedadEstadistica_NOMBRE = NOMBRE_BANDA_CALCULADA + '_max'; 
              var reductorEstadisticas = ee.Reducer.max().setOutputs([propiedadEstadistica_NOMBRE]);
              
              var teselasConStats = indiceCalculado.select(NOMBRE_BANDA_CALCULADA).reduceRegions({
                collection: teselasRecortadas, reducer: reductorEstadisticas, scale: ESCALA_NATIVA_INDICE_METROS
              }).filter(ee.Filter.notNull([propiedadEstadistica_NOMBRE]));
              
              teselasConStats.size().evaluate(function(numTeselasConStats, errorStats) {
                if (errorStats) { actualizarEstadoUI('Error evaluando # teselas con stats: ' + errorStats, true); return; }
                if (numTeselasConStats === 0) {
                  actualizarEstadoUI('Error: No se pudo calcular ' + NOMBRE_INDICE_USUARIO + ' para las teselas.', true); return;
                }
                actualizarEstadoUI(numTeselasConStats + ' teselas con ' + NOMBRE_INDICE_USUARIO + '. Definiendo clases...', false);
                
                teselasConStats.select([propiedadEstadistica_NOMBRE])
                  .reduceColumns(ee.Reducer.minMax(), [propiedadEstadistica_NOMBRE])
                  .evaluate(function(rangoGlobalTeselas, errorRangoTeselas) {
                    if (errorRangoTeselas || !rangoGlobalTeselas || rangoGlobalTeselas.min === null || rangoGlobalTeselas.max === null) {
                      actualizarEstadoUI('Error obteniendo rango de ' + NOMBRE_INDICE_USUARIO + ' para clases de teselas.', true); return;
                    }
                    var indiceMinTeselasCliente = rangoGlobalTeselas.min;
                    var indiceMaxTeselasCliente = rangoGlobalTeselas.max;
                    
                    if (indiceMinTeselasCliente === indiceMaxTeselasCliente) { indiceMaxTeselasCliente = indiceMinTeselasCliente + ( (Math.abs(indiceMinTeselasCliente) < 0.001 && Math.abs(indiceMaxTeselasCliente) < 0.001) ? 0.1 : Math.abs(indiceMinTeselasCliente * 0.1) || 0.1); }
                    if (indiceMinTeselasCliente > indiceMaxTeselasCliente) { var tmp_swap2 = indiceMinTeselasCliente; indiceMinTeselasCliente = indiceMaxTeselasCliente; indiceMaxTeselasCliente = tmp_swap2; if (indiceMinTeselasCliente === indiceMaxTeselasCliente) indiceMaxTeselasCliente = indiceMinTeselasCliente + ( (Math.abs(indiceMinTeselasCliente) < 0.001 && Math.abs(indiceMaxTeselasCliente) < 0.001) ? 0.1 : Math.abs(indiceMinTeselasCliente * 0.1) || 0.1); }

                    var intervaloClasif = (indiceMaxTeselasCliente - indiceMinTeselasCliente) / NUMERO_CLASES_VISUALIZACION;
                    var umbralesClasifCliente = [];
                    var etiquetasLeyendaTeselas = [];

                    for (var k = 0; k < NUMERO_CLASES_VISUALIZACION; k++) {
                      var minClase = indiceMinTeselasCliente + (k * intervaloClasif);
                      var maxClase = indiceMinTeselasCliente + ((k + 1) * intervaloClasif);
                      umbralesClasifCliente.push(maxClase);
                      if (k === 0 && NUMERO_CLASES_VISUALIZACION > 1) etiquetasLeyendaTeselas.push('≤ ' + maxClase.toFixed(2));
                      else if (k === NUMERO_CLASES_VISUALIZACION - 1 && NUMERO_CLASES_VISUALIZACION > 1) etiquetasLeyendaTeselas.push('> ' + minClase.toFixed(2));
                      else if (NUMERO_CLASES_VISUALIZACION === 1) etiquetasLeyendaTeselas.push(minClase.toFixed(2) + ' - ' + maxClase.toFixed(2));
                      else etiquetasLeyendaTeselas.push(minClase.toFixed(2) + ' - ' + maxClase.toFixed(2));
                    }
                    
                    var teselasClasificadas = teselasConStats.map(function(feature) {
                      var valorIndiceTesela = ee.Number(feature.get(propiedadEstadistica_NOMBRE)); 
                      var claseIdResultadoIf; 
                      var indiceMaximoPaleta = paletaColoresClienteJS.length - 1;
                      
                      var tempClaseId = ee.Number(NUMERO_CLASES_VISUALIZACION - 1); 
                      for (var j = NUMERO_CLASES_VISUALIZACION - 2; j >= 0; j--) {
                          tempClaseId = ee.Number(ee.Algorithms.If(valorIndiceTesela.lte(umbralesClasifCliente[j]), j, tempClaseId));
                      }
                      claseIdResultadoIf = tempClaseId;
                      if (NUMERO_CLASES_VISUALIZACION === 1) claseIdResultadoIf = ee.Number(0);
                      
                      var claseIdFinal = ee.Number(claseIdResultadoIf).min(indiceMaximoPaleta);

                      var color = ee.String(ee.List(paletaColoresClienteJS).get(claseIdFinal));
                      var etiquetaDeClase = ee.String(ee.List(etiquetasLeyendaTeselas).get(claseIdFinal)); 
                                                                                                       
                      return feature.set('style', {fillColor: color, color: '00000044', strokeWidth: 0.6})
                                    .set('indice_clase_etiqueta', etiquetaDeClase)
                                    .set('indice_clase_id', claseIdFinal);
                    }); 

                    mapa.addLayer(teselasClasificadas.style({styleProperty: 'style'}), {}, 'Teselas por ' + NOMBRE_INDICE_USUARIO + ' (' + propiedadEstadistica_NOMBRE.split('_').pop() + ')');
                    var leyendaTeselas = crearLeyendaClasificadaUI(
                        NOMBRE_INDICE_USUARIO + ' en Teselas (' + propiedadEstadistica_NOMBRE.split('_').pop() +')',
                        paletaColoresClienteJS, 
                        etiquetasLeyendaTeselas, 
                        UNIDADES_VALOR_INDICE
                    );
                    panelResultados.add(leyendaTeselas);
                    actualizarEstadoUI('Análisis completado.', false);
                  }); 
              }); 
          }); 
        }); 
    }); 
  }); 
}); 

// --- Inicialización del Mapa ---
mapa.setCenter(LON_MAPA_INICIAL, LAT_MAPA_INICIAL, ZOOM_MAPA_INICIAL);
actualizarEstadoUI('Listo. Dibuja un AOI, configura parámetros y haz clic en "Ejecutar Análisis".', false);