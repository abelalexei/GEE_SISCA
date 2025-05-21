// Script de Google Earth Engine para identificar áreas vulnerables a inundación
// utilizando imágenes SAR y datos de elevación (pendiente).

// =================================
// 1. Definición del Área de Interés (AOI)
// =================================
// Dibujar polígono de interés, no es necesario renombrarlo.
var aoi = geometry

Map.centerObject(aoi, 9);
Map.addLayer(aoi, {color: 'FF0000'}, 'Área de Interés (AOI)', false);

// =================================
// 2. Definición de los Periodos de Tiempo
// =================================
// Periodo 1 (ej. antes de una temporada de lluvias o un evento)
var fechaInicioPeriodo1 = '2020-01-01';
var fechaFinPeriodo1 = '2020-03-31';

// Periodo 2 (ej. durante o después de una temporada de lluvias o un evento)
var fechaInicioPeriodo2 = '2020-04-01';
var fechaFinPeriodo2 = '2020-06-30';

// =================================
// 3. Carga y Preprocesamiento de Imágenes SAR (Sentinel-1)
// =================================
// Usaremos la colección Sentinel-1 GRD.
// Filtraremos por polarización VV, que es sensible al agua.
// También puedes usar VH o una combinación.

function cargarYProcesarS1(fechaInicio, fechaFin, aoi) {
  var coleccionS1 = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(aoi)
    .filterDate(ee.Date(fechaInicio), ee.Date(fechaFin))
    // Filtra por los modos de adquisición más comunes
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    // Selecciona la banda VV
    .select(['VV']);

  // Manejo de colección vacía para evitar error en .mean()
  var procesado = ee.Algorithms.If(
    coleccionS1.size().gt(0),
    coleccionS1.mean().clip(aoi), // Procesa si hay imágenes
    ee.Image().rename('VV').clip(aoi) // Devuelve una imagen vacía con la banda esperada si no hay imágenes
                                      // Esto evita errores, pero las capas SAR podrían estar vacías.
                                      // Considera añadir una notificación o manejo de error más robusto si esto ocurre.
  );
  return ee.Image(procesado);
}

var s1Periodo1 = cargarYProcesarS1(fechaInicioPeriodo1, fechaFinPeriodo1, aoi);
var s1Periodo2 = cargarYProcesarS1(fechaInicioPeriodo2, fechaFinPeriodo2, aoi);

Map.addLayer(s1Periodo1, {min: -25, max: 0}, 'SAR Periodo 1 (VV)', false);
Map.addLayer(s1Periodo2, {min: -25, max: 0}, 'SAR Periodo 2 (VV)', false);

// =================================
// 4. Análisis del Terreno: Pendiente
// =================================
// Cargamos un Modelo Digital de Elevación (DEM), por ejemplo SRTM.
var dem = ee.Image('USGS/SRTMGL1_003');
var pendiente = ee.Terrain.slope(dem).clip(aoi); // Pendiente en grados

Map.addLayer(pendiente, {min: 0, max: 30, palette: ['green', 'yellow', 'red']}, 'Pendiente del Terreno', false);

// =================================
// 5. Definición de Umbrales
// =================================
// Umbral de pendiente para definir "áreas planas" (planicies).
// Ajusta este valor según las características de tu área de estudio.
var umbralPendiente = 5; // Grados. Áreas con pendiente < 5 grados se consideran planas.

// Umbral de retrodispersión SAR para identificar posible agua/humedad.
// Valores más bajos de retrodispersión (más oscuros en la imagen VV) suelen indicar agua.
// Este valor es empírico y puede necesitar ajuste.
var umbralSARAgua = -16; // dB. Valores de VV < -16 dB podrían ser agua.

// =================================
// 6. Identificación de Áreas Vulnerables
// =================================

// 6.1. Identificar áreas planas (baja pendiente)
var areasPlanas = pendiente.lte(umbralPendiente); // lte = Less Than or Equal
areasPlanas = areasPlanas.updateMask(areasPlanas.eq(1)); // Mascara para mostrar solo áreas planas

Map.addLayer(areasPlanas, {palette: '0000FF'}, 'Áreas Planas (Pendiente < ' + umbralPendiente + '°)', false);

// 6.2. Identificar posible presencia de agua/humedad con SAR para cada periodo
// Asegurarse de que s1Periodo1 y s1Periodo2 son imágenes válidas antes de operar sobre ellas
var posibleAguaPeriodo1 = ee.Image().byte(); // Imagen vacía por defecto
if (s1Periodo1.bandNames().length().gt(0)) { // Comprueba si la imagen tiene bandas
    posibleAguaPeriodo1 = s1Periodo1.select('VV').lte(umbralSARAgua);
    posibleAguaPeriodo1 = posibleAguaPeriodo1.updateMask(posibleAguaPeriodo1.eq(1));
}

var posibleAguaPeriodo2 = ee.Image().byte(); // Imagen vacía por defecto
if (s1Periodo2.bandNames().length().gt(0)) { // Comprueba si la imagen tiene bandas
    posibleAguaPeriodo2 = s1Periodo2.select('VV').lte(umbralSARAgua);
    posibleAguaPeriodo2 = posibleAguaPeriodo2.updateMask(posibleAguaPeriodo2.eq(1));
}


Map.addLayer(posibleAguaPeriodo1, {palette: '00FFFF'}, 'Posible Agua SAR P1 (VV < ' + umbralSARAgua + 'dB)', false);
Map.addLayer(posibleAguaPeriodo2, {palette: '00AAFF'}, 'Posible Agua SAR P2 (VV < ' + umbralSARAgua + 'dB)', false);

// 6.3. Combinar planicie con indicación de agua/humedad SAR
// Se consideran vulnerables las áreas planas que muestran indicios de agua/humedad
// en al menos uno de los periodos.

// Opción A: Vulnerabilidad si es plano Y hay agua en Periodo 1 O en Periodo 2
// Corrección: .And() -> .and(); .Or() -> .or()
var areasVulnerablesOptA = areasPlanas.and(posibleAguaPeriodo1.or(posibleAguaPeriodo2));
areasVulnerablesOptA = areasVulnerablesOptA.updateMask(areasVulnerablesOptA.eq(1));

// Opción B: Vulnerabilidad si es plano Y hay agua específicamente en Periodo 2 (potencial inundación reciente)
// Corrección: .And() -> .and()
var areasVulnerablesOptB = areasPlanas.and(posibleAguaPeriodo2);
areasVulnerablesOptB = areasVulnerablesOptB.updateMask(areasVulnerablesOptB.eq(1));

// Opción C: Vulnerabilidad si es plano Y hubo un AUMENTO de agua (agua en P2 pero no en P1)
// Esto requiere que s1Periodo1 y s1Periodo2 no tengan nulos en las mismas áreas para una comparación directa.
// Para simplificar, nos enfocaremos en OptA y OptB. Si necesitas OptC, el manejo de máscaras
// y datos faltantes debe ser más cuidadoso.
// var aumentoAgua = posibleAguaPeriodo2.and(posibleAguaPeriodo1.not()); // Corrección: .And() -> .and(); .Not() -> .not()
// var areasVulnerablesOptC = areasPlanas.and(aumentoAgua);
// areasVulnerablesOptC = areasVulnerablesOptC.updateMask(areasVulnerablesOptC.eq(1));


// =================================
// 7. Visualización de Resultados
// =================================
Map.addLayer(areasVulnerablesOptA, {palette: 'FF00FF'}, 'Áreas Vulnerables (Planas y con Agua P1 o P2)', true);
Map.addLayer(areasVulnerablesOptB, {palette: 'FFA500'}, 'Áreas Vulnerables (Planas y con Agua P2)', false);
// Map.addLayer(areasVulnerablesOptC, {palette: 'FFFF00'}, 'Áreas Vulnerables (Planas y Aumento de Agua P1->P2)', false);


// =================================
// 8. Exportación (Opcional)
// =================================
// Export.image.toDrive({
//   image: areasVulnerablesOptA,
//   description: 'areas_vulnerables_inundacion_OptA',
//   scale: 30, // Escala en metros, ajusta según S1 y DEM
//   region: aoi,
//   maxPixels: 1e10
// });

// Export.image.toDrive({
//   image: areasVulnerablesOptB,
//   description: 'areas_vulnerables_inundacion_OptB',
//   scale: 30,
//   region: aoi,
//   maxPixels: 1e10
// });

print("Script finalizado. Revise las capas en el mapa.");
print("Recuerde ajustar los umbrales de pendiente y SAR según su área de estudio.");
print("Considere que si no hay imágenes SAR para los periodos definidos, las capas de 'Posible Agua' y 'Áreas Vulnerables' podrían estar vacías.");
