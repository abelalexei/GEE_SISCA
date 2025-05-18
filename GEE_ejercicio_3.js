// ----------------------------------------------------------------------------------
// Sección 1: DEFINICIÓN DE PARÁMETROS POR EL USUARIO
// ----------------------------------------------------------------------------------

// 1.1: Región de Interés (ROI)
// ¡ACCIÓN REQUERIDA! Dibuja un polígono en el mapa y renómbralo a 'roi' en la pestaña "Imports".
var regionDeInteres;
if (typeof roi !== 'undefined') {
  regionDeInteres = roi;
} else {
  print("ADVERTENCIA: La variable 'roi' no fue encontrada en Imports. Usando un polígono de ejemplo. " +
        "Por favor, dibuja tu ROI y nómbrala 'roi'.");
  regionDeInteres = ee.Geometry.Polygon([[
    [-89.30, 13.80], [-89.10, 13.80], [-89.10, 13.60], [-89.30, 13.60], [-89.30, 13.80]
  ]]);
}

// 1.2: Áreas de Referencia (Anteriormente "Semillas de Entrenamiento")
// ¡ACCIÓN REQUERIDA! Dibuja geometrías (puntos o polígonos) para áreas conocidas.
// Estas se usarán para INTERPRETAR los clústeres, no para entrenar K-Means.
// Importa cada conjunto de geometrías como una variable separada
// (ej. 'agua_referencia', 'vegetacion_referencia', 'urbano_referencia').

var geometriasAgua = typeof agua_referencia !== 'undefined' ? agua_referencia : ee.FeatureCollection([]);
var geometriasVegetacion = typeof vegetacion_referencia !== 'undefined' ? vegetacion_referencia : ee.FeatureCollection([]);
var geometriasUrbano = typeof urbano_referencia !== 'undefined' ? urbano_referencia : ee.FeatureCollection([]);
// var geometriasSueloDesnudo = typeof suelo_desnudo_referencia !== 'undefined' ? suelo_desnudo_referencia : ee.FeatureCollection([]);

// 1.3: Parámetros de la Imagen y Clasificación
var FECHA_INICIO = '2023-01-01';
var FECHA_FIN = '2023-12-31';
var PORCENTAJE_NUBES_MAX = 10;
var BANDAS_CLASIFICACION = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12']; // Bandas Sentinel-2
var ESCALA_MUESTREO_ENTRENAMIENTO_KMEANS = 30; // Escala para muestrear píxeles para entrenar K-Means
var NUMERO_PIXELES_ENTRENAMIENTO_KMEANS = 5000; // Número de píxeles para entrenar K-Means
var NUMERO_DE_CLUSTERS = 5; // Número de clústeres que K-Means intentará identificar.

// ----------------------------------------------------------------------------------
// Sección 2: PREPARACIÓN DE ÁREAS DE REFERENCIA (Para visualización e interpretación)
// ----------------------------------------------------------------------------------

// Fusiona todas las geometrías de referencia en una sola FeatureCollection para visualizarlas.
// No se les asigna una propiedad de clase para el entrenamiento de K-Means.
var coleccionReferencia = ee.FeatureCollection([
  geometriasAgua,
  geometriasVegetacion,
  geometriasUrbano
  // geometriasSueloDesnudo // Añade si tienes más clases de referencia
]).flatten();

print('Número total de geometrías de referencia dibujadas:', coleccionReferencia.size());

// ----------------------------------------------------------------------------------
// Sección 3: CARGA Y PREPROCESAMIENTO DE IMAGEN
// ----------------------------------------------------------------------------------

var coleccionS2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(FECHA_INICIO, FECHA_FIN)
    .filterBounds(regionDeInteres)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', PORCENTAJE_NUBES_MAX));

print('Número de imágenes Sentinel-2 encontradas:', coleccionS2.size());

var imagen = coleccionS2.median().select(BANDAS_CLASIFICACION);
var imagenRecortada = imagen.clip(regionDeInteres);

// ----------------------------------------------------------------------------------
// Sección 4: PREPARACIÓN DE DATOS PARA ENTRENAR K-MEANS
// ----------------------------------------------------------------------------------

// K-Means se entrena con una muestra de los píxeles de la imagen.
var datosParaEntrenamientoKMeans = imagenRecortada.sample({
  region: regionDeInteres,
  scale: ESCALA_MUESTREO_ENTRENAMIENTO_KMEANS,
  numPixels: NUMERO_PIXELES_ENTRENAMIENTO_KMEANS,
  tileScale: 4 // Puede ayudar con cómputos grandes
});

print('Tamaño de la muestra de píxeles para entrenar K-Means:', datosParaEntrenamientoKMeans.size());
// Comprobar si hay suficientes datos para entrenar
if (datosParaEntrenamientoKMeans.size().getInfo() === 0) {
  print("ERROR: No se muestrearon píxeles para entrenar K-Means. " +
        "Verifica tu ROI, rango de fechas, o si la imagen tiene datos válidos.");
  // Detener el script o manejar el error como se prefiera.
}

// ----------------------------------------------------------------------------------
// Sección 5: ENTRENAMIENTO DEL CLUSTERER K-MEANS
// ----------------------------------------------------------------------------------

var clusterer = ee.Clusterer.wekaKMeans({
  nClusters: NUMERO_DE_CLUSTERS,
  seed: 0 // Semilla para reproducibilidad
}).train(datosParaEntrenamientoKMeans); // Entrenar con la muestra de píxeles de la imagen

// ----------------------------------------------------------------------------------
// Sección 6: AGRUPAMIENTO (CLUSTERING) DE LA IMAGEN
// ----------------------------------------------------------------------------------

var clasificacionKMeans = imagenRecortada.cluster(clusterer);

// ----------------------------------------------------------------------------------
// Sección 7: VISUALIZACIÓN
// ----------------------------------------------------------------------------------

// Define una paleta de colores para los clústeres.
// El número de colores debe coincidir con NUMERO_DE_CLUSTERS.
// Deberás interpretar qué representa cada clúster (color).
//https://colorbrewer2.org/ es útil para seleccionar colores
var paletaColoresClusters = [
  'FF0000', // Clúster 0 (Rojo)
  '00FF00', // Clúster 1 (Verde)
  '0000FF', // Clúster 2 (Azul)
  'FFFF00', // Clúster 3 (Amarillo)
  'FF00FF', // Clúster 4 (Magenta)
  // Añade más colores si NUMERO_DE_CLUSTERS es mayor
];
// Asegurar que la paleta tenga suficientes colores
if (paletaColoresClusters.length < NUMERO_DE_CLUSTERS) {
    for (var i = paletaColoresClusters.length; i < NUMERO_DE_CLUSTERS; i++) {
        // Generar colores aleatorios o añadir colores por defecto
        paletaColoresClusters.push(ee.Number(Math.random()).multiply(0xFFFFFF).int().format('%06x'));
    }
}


Map.centerObject(regionDeInteres, 10);
Map.addLayer(imagenRecortada, {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000, gamma: 1.2}, 'Imagen Sentinel-2 (RGB)');
Map.addLayer(clasificacionKMeans, {min: 0, max: NUMERO_DE_CLUSTERS - 1, palette: paletaColoresClusters.slice(0, NUMERO_DE_CLUSTERS)}, 'Clasificación K-Means');

// Añadir las geometrías de referencia al mapa para ayudar a la interpretación de los clústeres
var estiloReferencia = {
  color: 'FFFFFF', // Blanco para que destaque sobre los colores de los clústeres
  fillColor: 'FFFFFF22' // Blanco semi-transparente
};
Map.addLayer(coleccionReferencia.style(estiloReferencia), {}, 'Áreas de Referencia');

//Sección 8 Reclasificación
var imagenOriginal = clasificacionKMeans;
// 2. Definir los valores a reclasificar y los nuevos valores
// Lista de valores originales que queremos cambiar
var valoresOriginales = [0, 1, 2, 3, 4]; // Los valores que existen en tu imagenOriginal
var nuevosValores = [0, 1, 2, 3, 4];
// 3. Aplicar la función remap()
// La función remap toma tres argumentos:
// - La lista de valores 'desde' (valoresOriginales)
// - La lista de valores 'hacia' (nuevosValores)
// - (Opcional) Un valor por defecto para los píxeles que no están en la lista 'desde'.
// - (Opcional) El nombre de la banda a la que aplicar el remap si la imagen tiene múltiples bandas.
//   Si tu imagen tiene una sola banda (como en este ejemplo), no necesitas especificarlo.
var imagenReclasificada = imagenOriginal.remap({
  from: valoresOriginales,
  to: nuevosValores,
});
// Parámetros de visualización para la imagen reclasificada
var visParamsReclasificada = {
  min: 0, // Mínimo de tus nuevosValores
  max: 4, // Máximo de tus nuevosValores
  palette: ['#FFC0CB', '#ADD8E6', '#90EE90', '#A9A9A9'] 
  // Rosa, Azul claro, Verde claro, Gris oscuro, (para 0, 1, 2, 3, 4) https://colorbrewer2.org/
};
Map.addLayer(imagenReclasificada, visParamsReclasificada, 'Imagen Reclasificada');
print('--- RECLASIFICACIÓN COMPLETADA ---');
print('Valores originales:', valoresOriginales);
print('Valores nuevos:', nuevosValores);var imagenOriginal = clasificacionKMeans;
// ----------------------------------------------------------------------------------
// Sección 9: EXPORTACIÓN (Opcional)
// ----------------------------------------------------------------------------------
/* //Eliminar /* para eliminar comentario del bloque de exportación
Export.image.toDrive({
  image: imagenReclasificada, // La imagen con clústeres
  description: 'reclasificacion_kmeans_mi_area',
  folder: 'GEE_Exports',
  fileNamePrefix: 'clasificacion_KMeans_mi_area',
  region: regionDeInteres,
  scale: ESCALA_MUESTREO_ENTRENAMIENTO_KMEANS, // O la escala deseada para el producto final (ej. 10)
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});
*/ //Eliminar /* para eliminar comentario del bloque de exportación

print('--- PROCESO DE CLASIFICACIÓN K-MEANS COMPLETADO ---');
print('INSTRUCCIONES IMPORTANTES:');
print('1. REGIÓN DE INTERÉS (ROI): Dibuja un polígono y renómbralo a "roi" en "Imports".');
print('2. ÁREAS DE REFERENCIA: Dibuja geometrías para áreas conocidas (agua, vegetación, etc.) ' +
      'e impórtalas como "agua_referencia", "vegetacion_referencia", etc. ' +
      'Estas te ayudarán a INTERPRETAR los clústeres que K-Means identifica.');
print('3. AJUSTA PARÁMETROS: Modifica `NUMERO_DE_CLUSTERS` en la Sección 1.3 según necesites.');
print('4. INTERPRETA LOS CLÚSTERES: Observa la capa "Clasificación K-Means" y compárala con la imagen RGB ' +
      'y tus "Áreas de Referencia" para entender qué cobertura del suelo representa cada color/clúster.');
print('5. VERIFICA LA CONSOLA: Revisa mensajes de error o advertencias.');
