//Script elaborado por Abner Jiménez - Coordinador Técnico Regional
//Coordinador Técnico Regional - Proyecto Paisajes Forestales y Comercio Sostenible REDD+Landscape III
//GIZ - Deutsche Gesellschaft für Internationale Zusammenarbeit GmbH
// Define tu región de interés (roi)

//ZONAS EN LAS QUE EN ALGUN MOMENTO ENTRE 1984-2020 SE DETECTO AGUA 
// Cargar la banda 'max_extent' del JRC Global Surface Water
var agua = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('max_extent');

// Crear una capa binaria: 1 donde el porcentaje de ocurrencia es mayor a 0 (agua alguna vez), 0 en otro caso
var aguaMask = agua.eq(1).selfMask().clip(roi); // Crea una mascara de zonas donde en algun momento se detecto agua cortada con el ROI

// Visualización
Map.addLayer(aguaMask, {palette: ['0000FF']}, 'Agua alguna vez (1984-2020)', false);

// ZONAS DE DYNAMIC WORLD QUE EN ALGUN MOMENTO SE DETECTO AGUA (Datos desde 2015-06-27).
var startDate = '2015-06-27'; // Ejemplo: comenzando desde 2017
var endDate = '2025-04-30';   // Ejemplo: hasta finales de 2023

// Cargar la colección Dynamic World y filtrar por ROI y fecha
var dwCollection = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
    .filterBounds(roi)
    .filterDate(startDate, endDate);
    
// Función para extraer la máscara de agua de cada imagen
// basada en la probabilidad de la banda 'water' > 0.X
var getWaterMaskFromProbability = function(image) {
    // Recortar la imagen individual a la ROI
  var imageClippedToRoi = image.clip(roi);
    // Seleccionar la banda de probabilidad 'water'
    var waterProbability = imageClippedToRoi.select('water');
  // Crear una máscara donde la probabilidad de agua es > 0.X
  var waterMask = waterProbability.gt(0.5); // .gt(0.X) devuelve 1 si es > 0.X, sino 0
  // Aplicar selfMask() para que los píxeles que no cumplen (0) se vuelvan transparentes
  return waterMask.selfMask().rename('water_prob_mask').copyProperties(image, ['system:time_start']);
};

// Aplicar la función a toda la colección
var waterMaskCollection = dwCollection.map(getWaterMaskFromProbability);

// Crear una imagen única donde los píxeles que alguna vez tuvieron probabilidad de agua > 0.X son 1
// Usamos un reductor .max(). Si un píxel cumplió la condición (1) en CUALQUIER imagen, el máximo será 1.
var everWaterHighProb = waterMaskCollection.reduce(ee.Reducer.max());

// Recortar la máscara a tu ROI
var everWaterHighProbRoi = everWaterHighProb.clip(roi);

// Visualización

Map.addLayer(
  everWaterHighProbRoi.select('water_prob_mask_max'),
  {palette: ['#1affd6']},
  'Agua (Dynamic World)', false
);


// ------------------------------------------------------------------
// LÍNEAS PARA INTEGRAR AMBAS MÁSCARAS DE AGUA
// ------------------------------------------------------------------
// 1. Convertir ambas máscaras a valores 0 o 1 y aplicar clip para garantizar que coincidan espacialmente
var aguaMaskBin = aguaMask.unmask(0).clip(roi);
var everWaterBin = everWaterHighProbRoi.select('water_prob_mask_max').unmask(0).clip(roi);

// 2. Combinar máscaras con OR lógico (máximo pixel a pixel)
var combinedWaterMask = aguaMaskBin.max(everWaterBin).selfMask();

// 3. Visualizar máscara combinada
Map.addLayer(combinedWaterMask, {palette: ['#8a8cff']}, 'Agua combinada (GSW + Dynamic World)',false);
Map.setOptions('SATELLITE');

// ------------------------------------------------------------------
// MAPEAR CAUCES DE AGUA (HydroSHEDS FreeFlowingRivers) CON BUFFER
// ------------------------------------------------------------------

// 1. Define tu región de interés (roi)

// 2. Cargar la colección de ríos de flujo libre (HydroSHEDS)
var freeFlowingRivers = ee.FeatureCollection('WWF/HydroSHEDS/v1/FreeFlowingRivers');

// 3. Filtrar los ríos que intersectan la ROI
var riosEnRoi = freeFlowingRivers.filterBounds(roi);

// 4. Visualizar resultados
Map.addLayer(riosEnRoi.style({color: '00BFFF', width: 1}), {}, 'Ríos en ROI',false);

// ------------------------------------------------------
// GENERAR RÁSTER DE DISTANCIA A RÍOS
// ------------------------------------------------------

// 5. Calcular la distancia a los ríos.
//    El resultado es una imagen donde cada píxel es la distancia (en metros) al río más cercano.
var distanciaARiosGlobal = riosEnRoi.distance({
  searchRadius: 50000, // Radio de búsqueda máximo en metros (ej. 50 km)
  maxError: 50         // Error máximo permitido en metros para la transformación de distancia
});

// 5b. Recortar el ráster de distancia a la ROI
var distanciaARiosRecortada = distanciaARiosGlobal.clip(roi);

// 6. Visualizar el ráster de distancia RECORTADO
//    Usamos una paleta para ver cómo varía la distancia.


Map.addLayer(distanciaARiosRecortada, { 
  min: 0,        // Distancia mínima (sobre el río)
  max: 5000,     // Distancia máxima a visualizar (ej. 5 km), ajusta según tu ROI
  palette: ['0000FF', '00FFFF', 'FFFF00', 'FF0000'] // Azul (cerca) -> Cian -> Amarillo -> Rojo (lejos)
}, 'Distancia a Ríos (Recortada)',false);

// ------------------------------------------------------------------------------------
// BLOQUE: DISTANCIA A ZONAS INUNDADAS COMBINADAS (CONVIRTIENDO A VECTORES PRIMERO)
// ------------------------------------------------------------------------------------

// 1. Convertir la 'combinedWaterMask' (raster) a una FeatureCollection (polígonos).
var waterFeatures = combinedWaterMask.reduceToVectors({
  geometry: roi,      // Define el área para la vectorización.
  scale: 30,          // Escala en metros para la vectorización. Ajusta según la resolución de tus datos (ej. 10 o 30).
  geometryType: 'polygon', // Queremos polígonos de las áreas de agua.
  eightConnected: true,    // Considerar píxeles conectados diagonalmente.
  labelProperty: 'water',  // Nombre de la propiedad que almacenará el valor del raster (será 1).
  // reducer: ee.Reducer.first(), // Por defecto usa ee.Reducer.first() si la imagen tiene una banda.
  maxPixels: 1e10      // Aumentar si es necesario para ROIs grandes o escalas finas.
});

// 2. Calcular la distancia a estas nuevas geometrías vectoriales de zonas inundadas.
var distanciaAZonasInundadasVec = waterFeatures.distance({
  searchRadius: 50000, // Radio de búsqueda máximo en metros (ej. 50 km).
  maxError: 50         // Error máximo permitido en metros para la transformación de distancia.
});

// 3. Recortar el ráster de distancia resultante a la Región de Interés (ROI).
var distanciaAZonasInundadasVecRecortada = distanciaAZonasInundadasVec.clip(roi);


// 4. Visualizar el ráster de distancia a las zonas inundadas.
Map.addLayer(distanciaAZonasInundadasVecRecortada, {
  min: 0,        // Distancia mínima (sobre la zona inundada).
  max: 10000,    // Distancia máxima a visualizar (ej. 10 km), ajustar.
  palette: ['#1A237E', '#5C6BC0', '#AED581', '#FFF59D'] // Paleta: cerca (azul oscuro) a lejos (amarillo).
}, 'Distancia a Zonas Inundadas (Vect.)'),false;

//  Visualizar las zonas inundadas vectorizadas para verificar.
Map.addLayer(waterFeatures.style({color: '00000000', fillColor: '8a8cff80'}), {}, 'Zonas Inundadas Vectorizadas', false);

// ------------------------------------------------------------------
// NUEVO BLOQUE: MÁSCARA DE MASAS DE AGUA (WBM) DE COPERNICUS DEM
// ------------------------------------------------------------------
// 0. Cargar la colección de imágenes del MDE de Copernicus GLO-30 y crear un mosaico.
var demCopernicusCol = ee.ImageCollection("COPERNICUS/DEM/GLO30");
var demCopernicusMosaico = demCopernicusCol.filterBounds(roi).mosaic(); // Mosaico inicial

// 1. Seleccionar la banda de la Máscara de Masas de Agua (WBM) del mosaico del DEM.
//    Valores de WBM: 0=No Agua, 1=Océano, 2=Lago, 3=Río.
var wbmOriginal = demCopernicusMosaico.select('WBM');

// 2. Recortar la máscara de masas de agua a tu Región de Interés (ROI).
var wbmRecortada = wbmOriginal.clip(roi);

// 3. Crear una máscara binaria: Píxeles con valor > 0 en 'wbmRecortada' se consideran agua (valor 1).
//    El resto (valor 0, que es "No Agua") se convierte en 0.
var mascaraAguaBinariaWBM = wbmRecortada.gt(0); // Agua = 1, No Agua = 0.

// 4. Aplicar selfMask() a la máscara binaria.
//    Esto hará que los píxeles con valor 0 (No Agua) se vuelvan transparentes.
//    Solo los píxeles con valor 1 (Agua) permanecerán visibles.
var aguaDetectadaWBM = mascaraAguaBinariaWBM.selfMask();

// 5. Definir los parámetros de visualización para el agua detectada (solo se mostrará el valor 1).
var visParamsAguaWBM = {
  palette: ['#0077BE'] // Un solo color (ej. azul intenso) para todas las áreas de agua.
};

// 6. Añadir la capa de agua detectada por WBM (recortada y binaria) al mapa.
Map.addLayer(aguaDetectadaWBM, visParamsAguaWBM, 'Agua Copernicus WBM (0/1)'),false;


// ------------------------------------------------------------------
// VISUALIZAR EL MODELO DIGITAL DE ELEVACIÓN (MDE) RECORTADO
// ------------------------------------------------------------------

// 1. Seleccionar la banda de elevación 'DEM' del mosaico.
var elevacionParaVisualizar = demCopernicusMosaico.select('DEM');

// 2. Recortar la imagen de elevación a la Región de Interés (ROI).
var dem = elevacionParaVisualizar.clip(roi);

// 3. Definir parámetros de visualización para el MDE.
//    Ajusta 'min' y 'max' según el rango de elevaciones de tu ROI.
//    Para El Salvador, las elevaciones van desde el nivel del mar hasta ~2730m (El Pital).
var visParamsMDE = {
  min: 0,       // Elevación mínima en metros.
  max: 2800,    // Elevación máxima en metros.
  palette: [    // Paleta de colores hipsométrica (de bajas a altas elevaciones)
    '#006633',  // Verde oscuro (bajas elevaciones, bosques)
    '#E5FFCC',  // Verde muy claro
    '#CDA73D',  // Ocre / Marrón claro (zonas intermedias)
    '#C97231',  // Marrón
    '#B24A1F',  // Marrón rojizo
    '#99331F',  // Marrón oscuro
    '#A6A6A6',  // Gris (altas elevaciones, roca)
    '#FFFFFF'   // Blanco (picos muy altos, nieve si aplicara)
  ]
};

// 4. Añadir la capa del MDE recortado al mapa.
Map.addLayer(dem, visParamsMDE, 'MDE Copernicus (Elevación)', false); 


// ------------------------------------------------------------------
// BLOQUE: CALCULO DE LA PENDIENTE
// ------------------------------------------------------------------

// Seleccionar la banda de elevación 'DEM' del mosaico.
//var elevacion = demCopernicusMosaico.select('DEM');
var elevacion = ee.Image ('JAXA/ALOS/AW3D30_V1_1');

// Recortar la imagen de elevación a la Región de Interés (ROI).
var demRecortado = elevacion.clip(roi);

// Calcular pendiente en GRADOS desde el MDE preparado.
var pendienteGrados = ee.Terrain.slope(demRecortado);

Map.addLayer (pendienteGrados,{
  min: 0.0,
  max: 90.0,
  palette:['3ae237', 'b5e22e', 'd6e21f', 'fff705', 'ffd611', 'ffb613', 
  'ff8b13', 'ff6e08', 'ff500d', 'ff0000', 'de0101', 'c21301', '0602ff', 
  '235cb1', '307ef3', '269db1', '30c8e2', '32d3ef', '3be285', '3ff38f', 
  '86e26f']},'Pendientes'),false;
  
 // --- CONVERTIR PENDIENTE A PORCENTAJE ---
var pendientePorcentaje = pendienteGrados.multiply(Math.PI/180).tan().multiply(100);
Map.addLayer(pendientePorcentaje, {
  min: 0,
  max: 100, // 100% = 45 grados. Ajusta el max según tu área.
  palette: ['#33FF33', '#FFFF00', '#FF9900', '#FF0000', '#990000']
}, 'Pendientes en Porcentaje (%)');

// -------------------------------------------------------------------------------
// BLOQUE: RECLASIFICAR LA PENDIENTE EN PORCENTAJE EN 4 CLASES
// -------------------------------------------------------------------------------

//CLASIFICACION DE PENDIENTE INUNDACIONES
// 1. Definir las condiciones para cada clase con fines de amenaza a inundaciones.
var pendienteInunda = ee.Image(0) // Imagen base, píxeles no clasificados serían 0.
    .where(pendientePorcentaje.lt(2.5), 4)  
    .where(pendientePorcentaje.gte(2.5).and(pendientePorcentaje.lt(5)), 3) 
    .where(pendientePorcentaje.gte(5).and(pendientePorcentaje.lt(15)), 2) 
    .where(pendientePorcentaje.gte(15), 1); 

// 2. (Opcional) Enmascarar los píxeles que quedaron como 0 (si los hubiera y no los quieres ver).
var pendienteInundaMasked = pendienteInunda.updateMask(pendienteInunda.neq(0));

//CLASIFICACION DE PENDIENTE DESLIZAMIENTOS
// 1. Definir las condiciones para cada clase con fines de amenaza a inundaciones.
var pendienteDesliza = ee.Image(0) // Imagen base, píxeles no clasificados serían 0.
    .where(pendientePorcentaje.lt(15), 1)  
    .where(pendientePorcentaje.gte(15).and(pendientePorcentaje.lt(30)), 2) 
    .where(pendientePorcentaje.gte(30).and(pendientePorcentaje.lt(45)), 3) 
    .where(pendientePorcentaje.gte(45), 4); 

// 2. (Opcional) Enmascarar los píxeles que quedaron como 0 (si los hubiera y no los quieres ver).
var pendienteDeslizaMasked = pendienteDesliza.updateMask(pendienteDesliza.neq(0));


//VISUALIZACIÓN
// 3. Definir parámetros de visualización para las clases de pendiente.
var visParamsPendienteClasificada = {
  min: 1, // Clase mínima.
  max: 4, // Clase máxima.
  palette: ['#4CAF50', '#FFEB3B', '#FF9800', '#F44336'] 
         //Inundaciones Verde (4), Amarillo (3), Naranja (2), Rojo (1)
         //Deslizamientos Verde (1), Amarillo (2), Naranja (3), Rojo (4)
};

// 4. Añadir la capa de pendientes reclasificadas al mapa.
Map.addLayer(pendienteInundaMasked, visParamsPendienteClasificada, 'Clases Pendiente Inundaciones'),false;
Map.addLayer(pendienteDeslizaMasked, visParamsPendienteClasificada, 'Clases Pendiente Deslizamientos'),false;


// ------------------------------------------------------------------
// BLOQUE: CÁLCULO DEL ÍNDICE MULTIAMENAZA
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// PARTE I: CÁLCULO DEL ÍNDICE DE AMENAZA POR INUNDACIÓN (floodHazardIndex)
// ------------------------------------------------------------------

// 1. Scores base para Inundación

var wbmScore = ee.Image(0).where(aguaDetectadaWBM.eq(1), 10)
                          .unmask(0).toFloat().rename('wbm_score').clip(roi);
Map.addLayer(wbmScore, {min:0, max:10, palette:['#ffffff', '#0077BE']}, 'Score WBM (Inundación)', false);

var combinedWaterScore = ee.Image(0).where(combinedWaterMask.eq(1), 8)
                               .unmask(0).toFloat().rename('combined_water_score').clip(roi);
Map.addLayer(combinedWaterScore, {min:0, max:8, palette:['#ffffff', '#8a8cff']}, 'Score Agua Combinada (Inundación)', false);

// 2. Reclasificación de Pendientes para Inundaciones
var slopeFloodScore = ee.Image(0).toFloat().rename('slope_flood_score');
slopeFloodScore = slopeFloodScore
    .where(pendienteInundaMasked.eq(1), 0)  // Clase original 1 -> score 0
    .where(pendienteInundaMasked.eq(2), 2)  // Clase original 2 -> score 2
    .where(pendienteInundaMasked.eq(3), 4)  // Clase original 3 -> score 4
    .where(pendienteInundaMasked.eq(4), 6); // Clase original 4 -> score 6
slopeFloodScore = slopeFloodScore.unmask(0).clip(roi);
Map.addLayer(slopeFloodScore, {min:0, max:6, palette: ['#ffffff', '#FFFF00', '#FFA500', '#FF0000']}, 'Score Pendiente (Inundación)', false);

// 3. Reclasificación de Distancias para Inundaciones con Umbrales Fijos
var distRiosImg = distanciaARiosRecortada;
var distRiosScore = ee.Image(0).toFloat().rename('dist_rios_score');
distRiosScore = distRiosScore
    .where(distRiosImg.gt(500).and(distRiosImg.lte(1000)), 2)
    .where(distRiosImg.gt(250).and(distRiosImg.lte(500)),  4)
    .where(distRiosImg.gt(100).and(distRiosImg.lte(250)),  6)
    .where(distRiosImg.gt(50).and(distRiosImg.lte(100)),   8)
    .where(distRiosImg.lte(50),                             10);
distRiosScore = distRiosScore.unmask(0).clip(roi);
Map.addLayer(distRiosScore, {min:0, max:10, palette:['#f0f0f0', '#00FF00', '#FFFF00', '#FF0000', '#800080', '#4B0082']}, 'Score Dist. Ríos (Inundación)', false);

var distInundImg = distanciaAZonasInundadasVecRecortada;
var distInundScore = ee.Image(0).toFloat().rename('dist_inund_score');
distInundScore = distInundScore
    .where(distInundImg.gt(500).and(distInundImg.lte(1000)), 2)
    .where(distInundImg.gt(250).and(distInundImg.lte(500)),  4)
    .where(distInundImg.gt(100).and(distInundImg.lte(250)),  6)
    .where(distInundImg.gt(50).and(distInundImg.lte(100)),   8)
    .where(distInundImg.lte(50),                             10);
distInundScore = distInundScore.unmask(0).clip(roi);
Map.addLayer(distInundScore, {min:0, max:10, palette:['#f0f0f0', '#00FF00', '#FFFF00', '#FF0000', '#800080', '#4B0082']}, 'Score Dist. Zonas Inund. (Inundación)', false);

// 4. Score Crudo Total de Inundación (CORREGIDO - usando .add() y .toFloat())

var totalRawFloodHazardScore = wbmScore.toFloat()
    .add(combinedWaterScore.toFloat())
    .add(slopeFloodScore.toFloat()) 
    .add(distRiosScore.toFloat())   
    .add(distInundScore.toFloat())  
    .rename('total_raw_flood_hazard')
    .clip(roi);
Map.addLayer(totalRawFloodHazardScore, {min: 0, max: 44, palette: ['#FFFFFF', '#FFFF00', '#FFA500', '#FF0000', '#800000']}, 'Total Raw Flood Hazard Score', false);

// 5. Clasificar para obtener el Índice de Amenaza por Inundación (Clases 0-5)
// ¡¡IMPORTANTE!! Ajusta estos umbrales según tu criterio. Rango de entrada: ~0-44.
var floodHazardIndex = ee.Image(0).toFloat().rename('flood_hazard_index');
floodHazardIndex = floodHazardIndex 
    .where(totalRawFloodHazardScore.gte(1).and(totalRawFloodHazardScore.lt(5)),  0) // Muy Baja
    .where(totalRawFloodHazardScore.gte(5).and(totalRawFloodHazardScore.lt(14)),  1) // Baja
    .where(totalRawFloodHazardScore.gte(14).and(totalRawFloodHazardScore.lt(23)), 2) // Media
    .where(totalRawFloodHazardScore.gte(23).and(totalRawFloodHazardScore.lt(32)), 3) // Alta
    .where(totalRawFloodHazardScore.gte(32).and(totalRawFloodHazardScore.lt(40)), 4) // Muy Alta
    .where(totalRawFloodHazardScore.gte(40),                                 5); // Extrema
floodHazardIndex = floodHazardIndex.unmask(0).clip(roi); // unmask(0) para asegurar que las áreas fuera de los umbrales definidos también tengan un valor (0) si es necesario.

Map.addLayer(floodHazardIndex.selfMask(), {min:0, max:5, palette: ['#ADFF2F','#FFFF00','#FFA500','#FF6347','#FF0000','#8B0000']}, 'Índice de Amenaza por Inundación (0-5)', false);

// ------------------------------------------------------------------
// PARTE II: CÁLCULO DEL ÍNDICE DE AMENAZA POR DESLIZAMIENTO (landslideHazardIndex)
// (Basado únicamente en la pendienteDeslizaMasked, reclasificación directa)
// ------------------------------------------------------------------

// Reclasificar 'pendienteDeslizaMasked' (clases 1-4) directamente a Índice de Deslizamiento (clases 0-3)
var landslideHazardIndex = ee.Image(0).toFloat().rename('landslide_hazard_index'); // Clase base por defecto 0

landslideHazardIndex = landslideHazardIndex
    .where(pendienteDeslizaMasked.eq(1), 0)  // Clase original 1 -> Clase de Índice 0 (Muy Baja)
    .where(pendienteDeslizaMasked.eq(2), 1)  // Clase original 2 -> Clase de Índice 1 (Baja/Moderada)
    .where(pendienteDeslizaMasked.eq(3), 2)  // Clase original 3 -> Clase de Índice 2 (Alta)
    .where(pendienteDeslizaMasked.eq(4), 3); // Clase original 4 -> Clase de Índice 3 (Muy Alta)
landslideHazardIndex = landslideHazardIndex.unmask(0).clip(roi); 

Map.addLayer(landslideHazardIndex.selfMask(), {min:0, max:3, palette: ['#ADFF2F','#FFFF00','#FFA500','#FF0000']}, 'Índice de Amenaza por Deslizamiento (0-3)', false);

// ------------------------------------------------------------------
// PARTE III: CÁLCULO DEL ÍNDICE MULTIAMENAZA
// ------------------------------------------------------------------
// 1. Sumar los índices de amenaza clasificados
var summedMultiHazardScore = floodHazardIndex.add(landslideHazardIndex).rename('summed_multi_hazard_score');
// Rango teórico: 0 (0+0) a 8 (5+3)

Map.addLayer(summedMultiHazardScore, {min:0, max:8, palette: ['#440154FF', '#404387FF', '#29788EFF', '#22A784FF', '#79D151FF', '#FDE725FF']}, 'Score Sumado Multiamenaza (0-8)', false); // Usé una paleta secuencial de ejemplo (viridis)

// 2. Clasificar el score sumado en 5 clases finales de multiamenaza
// Rango de entrada: summedMultiHazardScore (0 a 8)
// Clases de salida: 0 (Muy Baja) a 4 (Muy Alta/Extrema)
var finalMultiHazardIndex = ee.Image(0).toFloat().rename('final_multi_hazard_index'); // Clase base por defecto 0

finalMultiHazardIndex = finalMultiHazardIndex
    .where(summedMultiHazardScore.gte(0).and(summedMultiHazardScore.lte(1)), 0) // Muy Baja
    .where(summedMultiHazardScore.gt(1).and(summedMultiHazardScore.lte(3)),  1) // Baja
    .where(summedMultiHazardScore.gt(3).and(summedMultiHazardScore.lte(5)),  2) // Media
    .where(summedMultiHazardScore.gt(5).and(summedMultiHazardScore.lte(7)),  3) // Alta
    .where(summedMultiHazardScore.gt(7),                                    4); // Muy Alta/Extrema (hasta 8)
finalMultiHazardIndex = finalMultiHazardIndex.unmask(0).clip(roi);

var visParamsMultiHazard = {
  min: 0, 
  max: 4, // Ajustado a 5 clases (0, 1, 2, 3, 4)
  palette: [ // Paleta para 5 clases
    '#ADFF2F', // 0 (Muy Baja - verde claro)
    '#FFFF00', // 1 (Baja - amarillo)
    '#FFA500', // 2 (Media - naranja)
    '#FF0000', // 3 (Alta - rojo)
    '#8B0000'  // 4 (Muy Alta/Extrema - rojo oscuro)
  ]
};
Map.addLayer(finalMultiHazardIndex.selfMask(), visParamsMultiHazard, 'Índice Multiamenaza Final (0-4)',false);

//------------------------------------------------------------------
// LÍNEAS ESPECÍFICAS PARA NORMALIZAR totalRawFloodHazardScore
//------------------------------------------------------------------

// Asumimos que 'totalRawFloodHazardScore' ya está calculado y disponible en tu script.
// Ejemplo de cómo podría estar definido previamente:
// var totalRawFloodHazardScore = ee.ImageCollection([
//     wbmScore, combinedWaterScore, slopeFloodScore, distRiosScore, distInundScore
// ]).sum().rename('total_raw_flood_hazard').clip(roi);
// Map.addLayer(totalRawFloodHazardScore, {min: 0, max: 44, palette: ['#FFFFFF', '#FFFF00', '#FFA500', '#FF0000', '#800000']}, 'Total Raw Flood Hazard Score', false);

// 1. Define el mínimo y máximo teórico o conocido de tu totalRawFloodHazardScore.
//    AJUSTA ESTOS VALORES al rango real o teórico de tu 'totalRawFloodHazardScore'.
//    Por ejemplo, si los scores individuales suman un máximo de 44 y un mínimo de 0:
var minTeoricoFloodScore = ee.Number(0);
var maxTeoricoFloodScore = ee.Number(44);

// 2. Calcula el rango.
var floodScoreRange = maxTeoricoFloodScore.subtract(minTeoricoFloodScore);

// 3. Aplica la normalización Min-Max: (X - min) / (max - min)
//    Se añade un manejo para el caso de que el rango sea cero.
var normalizedTotalFloodScore = ee.Image(ee.Algorithms.If(
    floodScoreRange.gt(0), // Solo normaliza si hay un rango (max > min)
    totalRawFloodHazardScore.subtract(minTeoricoFloodScore).divide(floodScoreRange),
    // Si min = max (rango es 0), asigna un valor:
    // 0 si el valor constante es igual al mínimo, 1 si es igual al máximo (improbable),
    // o 0.5 si quieres un valor medio. Aquí asumimos 0 si no hay rango.
    ee.Image(0) 
)).toFloat().rename('normalized_total_flood_score');

// 4. (Opcional pero recomendado) Asegurar que los valores estén entre 0 y 1.
normalizedTotalFloodScore = normalizedTotalFloodScore.clamp(0, 1);

// 5. Visualizar la capa normalizada.
Map.addLayer(normalizedTotalFloodScore, {min:0, max:1, palette: ['#00FF00', '#FFFF00', '#FF0000']}, 'Normalized Total Flood Score (0-1)'), false;

//------------------------------------------------------------------
// LÍNEAS ESPECÍFICAS PARA NORMALIZAR 'pendienteDeslizaMasked'
//------------------------------------------------------------------

// 1. Define el mínimo y máximo conocido de tu capa 'pendienteDeslizaMasked'.
var minPendienteDesliza = ee.Number(1);
var maxPendienteDesliza = ee.Number(4);

// 2. Calcula el rango.
var pendienteDeslizaRange = maxPendienteDesliza.subtract(minPendienteDesliza);

// 3. Aplica la normalización Min-Max: (X - min) / (max - min)
//    Se añade un manejo para el caso de que el rango sea cero (aunque aquí es fijo y no será cero).
var normalizedPendienteDesliza = ee.Image(ee.Algorithms.If(
    pendienteDeslizaRange.gt(0), // Solo normaliza si hay un rango (max > min)
    pendienteDeslizaMasked.subtract(minPendienteDesliza).divide(pendienteDeslizaRange),
    // Si min = max (rango es 0), lo cual no debería pasar aquí con min=1, max=4.
    // Se asignaría 0 si el valor constante es igual al mínimo.
    ee.Image(0) 
)).toFloat().rename('normalized_pendiente_desliza');

// 4. (Opcional pero buena práctica) Asegurar que los valores estén entre 0 y 1.
//    Con valores de entrada 1,2,3,4 y min=1, max=4, esto ya se cumple.
normalizedPendienteDesliza = normalizedPendienteDesliza.clamp(0, 1);

// 5. (Opcional) Si 'pendienteDeslizaMasked' tenía áreas enmascaradas (donde no era 1,2,3 o 4),
//    la normalización mantendrá esas áreas enmascaradas. Si quieres darles un valor (ej. 0),
//    puedes desenmascarar.
// normalizedPendienteDesliza = normalizedPendienteDesliza.unmask(0);

// Aplicar el clip al ROI si no se hizo antes o para asegurar.
normalizedPendienteDesliza = normalizedPendienteDesliza.clip(roi);

// 6. Visualizar la capa normalizada.
Map.addLayer(normalizedPendienteDesliza, {min:0, max:1, palette: ['#FFFFCC', '#A1DAB4', '#41B6C4', '#225EA8']}, 'Normalized Pendiente Deslizamientos (0-1)'),false;

//------------------------------------------------------------------
// LÍNEAS PARA LA SUMA PONDERADA DE CAPAS NORMALIZADAS Y CREACIÓN DE ÍNDICE MULTIAMENAZA
//------------------------------------------------------------------

// 1. Define los pesos para cada amenaza normalizada.
//    ¡¡IMPORTANTE!! AJUSTA ESTOS PESOS SEGÚN TU ANÁLISIS Y CRITERIO EXPERTO.
//    La suma de los pesos puede ser 1 para mantener el resultado en un rango 0-1.
var weightFlood = ee.Number(0.6);       // Ejemplo: 60% de peso para inundación
var weightLandslide = ee.Number(0.4);   // Ejemplo: 40% de peso para deslizamiento por pendiente

// 2. Calcular la suma ponderada.
// Formula: (CapaA * PesoA) + (CapaB * PesoB)
var weightedMultiHazardScore = normalizedTotalFloodScore.multiply(weightFlood)
    .add(normalizedPendienteDesliza.multiply(weightLandslide))
    .rename('weighted_multi_hazard_score');

// El resultado 'weightedMultiHazardScore' estará en un rango de 0 a 1 si los pesos suman 1.
Map.addLayer(weightedMultiHazardScore, {min:0, max:1, palette: ['#440154', '#3B528B', '#21908C', '#5DC863', '#FDE725']}, 'Score Multiamenaza Ponderado (0-1)'),false;

// 3. (Opcional pero recomendado) Clasificar el 'weightedMultiHazardScore' en clases finales.
//    Ajusta los umbrales y el número de clases según tus necesidades para el rango 0-1.
//    Ejemplo con 5 clases (0-4):

var finalWeightedMultiHazardIndex = ee.Image(0).toFloat().rename('final_weighted_multi_hazard_index');

finalWeightedMultiHazardIndex = finalWeightedMultiHazardIndex
    .where(weightedMultiHazardScore.gt(0)    .and(weightedMultiHazardScore.lte(0.2)), 0) // Muy Baja
    .where(weightedMultiHazardScore.gt(0.2)  .and(weightedMultiHazardScore.lte(0.4)), 1) // Baja
    .where(weightedMultiHazardScore.gt(0.4)  .and(weightedMultiHazardScore.lte(0.6)), 2) // Media
    .where(weightedMultiHazardScore.gt(0.6)  .and(weightedMultiHazardScore.lte(0.8)), 3) // Alta
    .where(weightedMultiHazardScore.gt(0.8),                                      4); // Muy Alta/Extrema
finalWeightedMultiHazardIndex = finalWeightedMultiHazardIndex.unmask(0).clip(roi);

var visParamsWeightedMultiHazard = {
  min: 0, 
  max: 4, // 5 clases (0, 1, 2, 3, 4)
  palette: [ // Paleta para 5 clases
    '#ADFF2F', // 0 (Muy Baja - verde claro)
    '#FFFF00', // 1 (Baja - amarillo)
    '#FFA500', // 2 (Media - naranja)
    '#FF0000', // 3 (Alta - rojo)
    '#8B0000'  // 4 (Muy Alta/Extrema - rojo oscuro)
  ]
};
Map.addLayer(finalWeightedMultiHazardIndex.selfMask(), visParamsWeightedMultiHazard, 'Índice Multiamenaza Ponderado Final (0-4)'), false;


//------------------------------------------------------------------
// EXPORTAR EL SCORE MULTIAMENAZA PONDERADO (RANGO 0-1)
//------------------------------------------------------------------

// 1. Exportar a Google Earth Engine Assets
Export.image.toAsset({
  image: weightedMultiHazardScore.toFloat(), // Asegurar que sea float para el asset
  description: 'Score_Multiamenaza_Ponderado_Asset', // Nombre descriptivo para la tarea de exportación
  assetId: 'users/TU_USUARIO_GEE/Score_Multiamenaza_Ponderado', // CAMBIA ESTO: Reemplaza TU_USUARIO_GEE y elige un nombre de asset
  scale: 30, // Escala en metros (ajusta según la resolución de tus datos o deseada)
  region: roi,
  maxPixels: 1e13 // Aumentar si la región es muy grande o la escala muy fina
});

// 2. Exportar a Google Drive
Export.image.toDrive({
  image: weightedMultiHazardScore.toFloat(), // Asegurar que sea float para el archivo GeoTIFF
  description: 'Score_Multiamenaza_Ponderado_Drive', // Nombre descriptivo para la tarea de exportación
  folder: 'GEE_Exports', // (Opcional) Nombre de la carpeta en tu Google Drive
  fileNamePrefix: 'score_multiamenaza_ponderado', // Nombre del archivo
  scale: 30, // Escala en metros (ajusta según la resolución de tus datos o deseada)
  region: roi,
  maxPixels: 1e13, // Aumentar si la región es muy grande o la escala muy fina
  fileFormat: 'GeoTIFF' // (Opcional) Formato del archivo, GeoTIFF es común
});
