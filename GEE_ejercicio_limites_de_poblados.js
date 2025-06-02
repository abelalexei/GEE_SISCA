//Script elaborado por Abner Jiménez
//Coordinador Técnico Regional - Proyecto Paisajes Forestales y Comercio Sostenible REDD+Landscape III
//GIZ - Deutsche Gesellschaft für Internationale Zusammenarbeit GmbH
// =====================================================================================
// Script para generar límites de poblados (método RASTER)
// =====================================================================================

// 2. Cargar los assets
var imagenAmenaza = ee.Image('users/SU NOMBRE DE USUARIO/Score_Multiamenaza_Ponderado');
var edificiosGlobales = ee.FeatureCollection('GOOGLE/Research/open-buildings/v3/polygons');

// 3. Definir el Área de Interés (AOI) (igual que antes)
var aoi = imagenAmenaza.geometry();
Map.addLayer(aoi, {color: 'grey'}, 'Área de Interés (AOI)', false);

// 4. Filtrar las huellas de edificios al AOI (igual que antes)
var edificiosEnAOI = edificiosGlobales.filterBounds(aoi);
Map.addLayer(edificiosEnAOI, {color: 'FFA500'}, 'Edificios en AOI (Originales)', false);

// 5. Crear un buffer de 25 metros alrededor de cada edificio filtrado (igual que antes)
var edificiosConBuffer = edificiosEnAOI.map(function(feature) {
  return feature.buffer(25);
});
Map.addLayer(edificiosConBuffer, {color: 'FF0000'}, 'Buffers de Edificios (Vector)', false);

// 6. Rasterizar los buffers de los edificios
var escalaRasterizacion = 10; 

//    Crear una imagen base (ej. con valor 0) y "pintar" los buffers con valor 1.
//    La imagen resultante tendrá una banda (por defecto llamada 'constant' si pintas un número, o el nombre de la propiedad si usas una).
//    Es mejor renombrar la banda para claridad.
var imagenBuffersRaster = ee.Image(0) // Imagen base con valor 0
    .paint({
      featureCollection: edificiosConBuffer, // Los polígonos de buffer
      color: 1                         // "Quemar" el valor 1 en los píxeles cubiertos por los buffers
    })
    .rename('zonas_buffer') // Renombrar la banda
    .reproject({ // Asegurar la proyección y escala deseadas para la rasterización
      crs: imagenAmenaza.projection(),
      scale: escalaRasterizacion
    });

//    Ahora, queremos vectorizar solo las áreas que son '1' (buffers).
//    Para ello, enmascaramos los píxeles que son '0' (el fondo).
var imagenBuffersParaVectorizar = imagenBuffersRaster.updateMask(
  imagenBuffersRaster.eq(1) // Mantener solo los píxeles con valor 1
);

Map.addLayer(imagenBuffersParaVectorizar,
             {min: 1, max: 1, palette: ['0000FF']}, // Píxeles de buffer en azul
             'Buffers Rasterizados (Valor 1)', false);

// 7. Convertir el raster de buffers de nuevo a polígonos
//    Esto agrupará píxeles conectados con el mismo valor (en nuestro caso, valor 1) en polígonos.
var limitesPobladosFcDesdeRaster = imagenBuffersParaVectorizar
    .reduceToVectors({
      reducer: ee.Reducer.countEvery(), // Se necesita un reducer, countEvery() es común.
      geometry: aoi,                 // Procesar dentro del AOI
      scale: escalaRasterizacion,    // Debe ser la misma escala de la rasterización
      geometryType: 'polygon',
      eightConnected: true,          // Conectar píxeles que se tocan en 8 direcciones (incluyendo diagonales)
      labelProperty: 'valor_raster', // Nombre de la propiedad que tendrá el valor del píxel (será 1)
      maxPixels: 1e12
    });

//    La salida de reduceToVectors contendrá polígonos para las áreas con valor 1.
Map.addLayer(limitesPobladosFcDesdeRaster,
             {color: '00FF00', fillColor: '00FF0050'}, // Verde con relleno semitransparente
             'Límites de Poblados (Desde Raster)');

// 9. Contar y mostrar el número de features (límites de poblados) generados
//var numeroDePoblados = limitesPobladosFcDesdeRaster.size();
//print('Total de poblados generados:', numeroDePoblados);

// --- INICIO: Contar edificaciones por poblado y clasificar ---

// Paso 1: Unir espacialmente las edificaciones a los límites de los poblados.
// Esto identificará qué edificaciones están contenidas o se intersectan con cada poblado.
var filtroEspacialInterseccion = ee.Filter.intersects({
  leftField: '.geo',  // Geometría del poblado (colección primaria)
  rightField: '.geo', // Geometría de la edificación (colección secundaria)
  maxError: 1         // Error máximo permitido en metros para la operación de intersección
});

// Usaremos un 'saveAll' join, que guardará todas las edificaciones coincidentes
// en una nueva propiedad del feature del poblado.
var joinParaConteo = ee.Join.saveAll({
  matchesKey: 'edificaciones_intersectantes', // Nombre de la propiedad que contendrá la lista de edificaciones
});

// Aplicar el join.
var pobladosConEdificacionesVinculadas = joinParaConteo.apply({
  primary: limitesPobladosFcDesdeRaster,
  secondary: edificiosEnAOI,
  condition: filtroEspacialInterseccion
});

// Paso 2: Mapear sobre la colección resultante para contar las edificaciones y añadir la propiedad.
var pobladosConConteo = pobladosConEdificacionesVinculadas.map(function(featurePoblado) {
  // Obtener la lista de edificaciones que se guardó en la propiedad 'edificaciones_intersectantes'.
  var listaEdificacionesCoincidentes = ee.List(featurePoblado.get('edificaciones_intersectantes'));

  // Contar el número de elementos en la lista.
  // Usamos ee.Algorithms.If para manejar el caso de que la lista sea null (conteo = 0).
  var numeroDeEdificaciones = ee.Algorithms.If(
    listaEdificacionesCoincidentes,         // Condición: ¿Existe la lista?
    listaEdificacionesCoincidentes.size(),  // Si es true: obtener el tamaño (conteo)
    0                                       // Si es false (lista es null): el conteo es 0
  );

  // Añadir el conteo como una nueva propiedad y eliminar la lista de geometrías vinculadas
  // para hacer el feature más ligero para operaciones futuras.
  return featurePoblado.set('num_edificios', numeroDeEdificaciones)
                       .set('edificaciones_intersectantes', null); // Eliminar la lista para aligerar
});


// Paso 3: Clasificar los poblados basados en el número de edificaciones.
// La cantidad de 900 huellas de edificaciones representa aproximadamente 450 vivienda habitadas (1 vivienda por cada 2 edificaciones)
// Lo que a su vez considerando un promedio de 4.5 habitantes por vivienda, equivale a cerca de 2,000 habitantes
// Para fines de este análisis se considerann urbano consolidado los poblados con más de 2,000 habitantes
var umbralEdificaciones = 900; // Umbral para la clasificación

var pobladosClasificados = pobladosConConteo.map(function(featurePoblado) {
  var conteoActual = ee.Number(featurePoblado.get('num_edificios'));

  // Asignar la clasificación usando ee.Algorithms.If
  var clasificacion = ee.Algorithms.If(
    conteoActual.gte(umbralEdificaciones), // Condición: num_edificios >= 900 (>= 2,000 ha)
    'urbano consolidado',                 // Valor si la condición es verdadera
    'urbano no consolidado'               // Valor si la condición es falsa (< 900) (< 2,000 ha)
  );

  return featurePoblado.set('clasificacion_urbana', clasificacion);
});

// Opcional: Añadir las capas clasificadas al mapa con diferentes estilos
Map.addLayer(pobladosClasificados.filter(ee.Filter.eq('clasificacion_urbana', 'urbano consolidado')),
             {color: 'A020F0', fillColor: 'A020F070'}, // Morado
             'Poblados Urbanos Consolidados >= 2,000 hab (>= ' + umbralEdificaciones + ' edif.)', false);

Map.addLayer(pobladosClasificados.filter(ee.Filter.eq('clasificacion_urbana', 'urbano no consolidado')),
             {color: 'FFD700', fillColor: 'FFD70070'}, // Dorado/Amarillo oscuro
             'Poblados No Consolidados < 2,000 hab (< ' + umbralEdificaciones + ' edif.)', false);

// --- INICIO: Calcular estimaciones de viviendas, población y densidad ---

var pobladosConDatosDemograficos = pobladosClasificados.map(function(featurePoblado) {
  // Obtener el número de edificaciones del feature actual
  var numEdificios = ee.Number(featurePoblado.get('num_edificios'));

  // 1. Calcular la cantidad estimada de viviendas
  // Especificación: 900 edificaciones ~ 450 viviendas => 1 vivienda por cada 2 edificaciones.
  var relacionEdificiosVivienda = 2;
  var cantidadViviendasEst = numEdificios.divide(relacionEdificiosVivienda);

  // 2. Calcular la población total estimada
  // Especificación: 4.5 habitantes por vivienda.
  var habitantesPorVivienda = 4.5;
  var poblacionTotalEst = cantidadViviendasEst.multiply(habitantesPorVivienda);

  // 3. Calcular la densidad poblacional
  // 3a. Obtener el área del polígono del poblado en metros cuadrados.
  // Se recomienda un 'maxError' para la precisión del cálculo del área.
  var areaEnM2 = featurePoblado.area({'maxError': 1}); // Error máximo de 1 metro

  // 3b. Convertir el área a kilómetros cuadrados (1 km² = 1,000,000 m²)
  var areaEnKm2 = areaEnM2.divide(1000000);

  // 3c. Calcular la densidad poblacional (habitantes por km²)
  // Se maneja el caso de que el área sea cero para evitar errores de división.
  var densidadPoblacionalEst = ee.Algorithms.If(
    areaEnKm2.gt(0),                               // Condición: si el área es mayor que cero
    poblacionTotalEst.divide(areaEnKm2),           // Entonces: calcular densidad
    0                                              // Si no (área es 0): densidad es 0
  );

  // Añadir las nuevas propiedades al feature del poblado
  return featurePoblado.set({
    'viviendas_estimadas': cantidadViviendasEst,
    'poblacion_estimada': poblacionTotalEst,
    'area_km2': areaEnKm2,
    'densidad_pobl_est_hab_km2': densidadPoblacionalEst
  });
});

// --- INICIO: Visualizar Población y Densidad Estimada en el Mapa ---

// --- 1. Visualización de Población Estimada ---

// 1a. Calcular Min y Max de 'poblacion_estimada' para la rampa de color (lado servidor)
var minMaxPoblacion = pobladosConDatosDemograficos
  .filter(ee.Filter.notNull(['poblacion_estimada'])) // Ignorar features con población nula para el cálculo de min/max
  .reduceColumns({
    reducer: ee.Reducer.minMax(),
    selectors: ['poblacion_estimada']
  });

// Obtener los valores min y max como ee.Number. Proveer defaults si no se encuentran.
var minPopServ = ee.Number(ee.Algorithms.If(minMaxPoblacion.get('min'), minMaxPoblacion.get('min'), 0));
var maxPopServ = ee.Number(ee.Algorithms.If(minMaxPoblacion.get('max'), minMaxPoblacion.get('max'), 1));

// Ajustar maxPopServ si min y max son iguales para evitar división por cero en la normalización
var rangoPop = maxPopServ.subtract(minPopServ);
maxPopServ = ee.Number(ee.Algorithms.If(rangoPop.eq(0), minPopServ.add(1), maxPopServ));

// 1b. Definir paleta de colores para población (ej. de azul claro a azul oscuro)
var paletaPoblacion = ee.List(['#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594']); // 7 clases

// 1c. Función para estilizar cada feature según su población estimada
var estilizarPorPoblacion = function(feature) {
  var poblacion = feature.get('poblacion_estimada');
  var colorPorDefecto = 'CCCCCC'; // Gris para valores nulos o fuera de rango si no se manejan

  var colorRelleno = ee.Algorithms.If(
    ee.Algorithms.IsEqual(poblacion, null), // Si la población es nula
    colorPorDefecto,
    // Else, calcular color basado en valor normalizado
    paletaPoblacion.get( // Obtener color de la paleta
      ee.Number(poblacion).subtract(minPopServ) // (valor - min)
        .divide(maxPopServ.subtract(minPopServ)) // / (max - min) -> normalizado 0-1
        .clamp(0, 0.999) // Asegurar que esté en [0, ~1) para el índice de la paleta
        .multiply(paletaPoblacion.size()) // Multiplicar por el número de colores
        .floor() // Obtener el índice entero
        .int()   // Convertir a entero
    )
  );

  return feature.set('style', {
    fillColor: ee.String(colorRelleno), // Asegurar que es un string de color
    color: '00000033', // Borde muy sutil y transparente
    strokeWidth: 0.5
  });
};

// 1d. Aplicar el estilo y añadir al mapa
var pobladosEstiloPoblacion = pobladosConDatosDemograficos.map(estilizarPorPoblacion);
Map.addLayer(pobladosEstiloPoblacion.style({styleProperty: 'style'}),
             {}, // No se necesitan visParams aquí porque el estilo está en los features
             'Población Estimada por Poblado', false); // No visible por defecto

// --- 2. Visualización de Densidad Poblacional Estimada ---

// 2a. Calcular Min y Max de 'densidad_pobl_est_hab_km2' (lado servidor)
var minMaxDensidad = pobladosConDatosDemograficos
  .filter(ee.Filter.notNull(['densidad_pobl_est_hab_km2']))
  .reduceColumns({
    reducer: ee.Reducer.minMax(),
    selectors: ['densidad_pobl_est_hab_km2']
  });

var minDenServ = ee.Number(ee.Algorithms.If(minMaxDensidad.get('min'), minMaxDensidad.get('min'), 0));
var maxDenServ = ee.Number(ee.Algorithms.If(minMaxDensidad.get('max'), minMaxDensidad.get('max'), 1));
var rangoDen = maxDenServ.subtract(minDenServ);
maxDenServ = ee.Number(ee.Algorithms.If(rangoDen.eq(0), minDenServ.add(1), maxDenServ));

// 2b. Definir paleta de colores para densidad (ej. de amarillo claro a rojo oscuro)
var paletaDensidad = ee.List(['#feedde', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#8c2d04']); // 7 clases

// 2c. Función para estilizar cada feature según su densidad poblacional
var estilizarPorDensidad = function(feature) {
  var densidad = feature.get('densidad_pobl_est_hab_km2');
  var colorPorDefecto = 'CCCCCC'; // Gris

  var colorRelleno = ee.Algorithms.If(
    ee.Algorithms.IsEqual(densidad, null),
    colorPorDefecto,
    paletaDensidad.get(
      ee.Number(densidad).subtract(minDenServ)
        .divide(maxDenServ.subtract(minDenServ))
        .clamp(0, 0.999)
        .multiply(paletaDensidad.size())
        .floor()
        .int()
    )
  );

  return feature.set('style', {
    fillColor: ee.String(colorRelleno),
    color: '00000033',
    strokeWidth: 0.5
  });
};

// 2d. Aplicar el estilo y añadir al mapa
var pobladosEstiloDensidad = pobladosConDatosDemograficos.map(estilizarPorDensidad);
Map.addLayer(pobladosEstiloDensidad.style({styleProperty: 'style'}),
             {},
             'Densidad Poblacional Estimada (hab/km²)', false); // No visible por defecto

// --- INICIO: Creación de Leyendas Agrupadas a la Izquierda ---

// Prerrequisitos: Asumimos que las siguientes variables con las paletas
// (como arrays de JavaScript del lado del cliente) y los colores para las categorías
// ya están definidos o los defines aquí, coincidiendo con tu visualización.

// Colores para Tipo de Poblado (de tu visualización anterior)
var colorConsolidado = 'A020F0'; // Morado
var colorNoConsolidado = 'FFD700'; // Dorado/Amarillo oscuro

// Paletas para Población y Densidad (de tu visualización anterior, como arrays JS)
var paletaJsPoblacion = ['#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594'];
var paletaJsDensidad = ['#feedde', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#8c2d04'];

// --- Panel Contenedor Principal para Todas las Leyendas ---
var panelContenedorLeyendas = ui.Panel({
  style: {
    position: 'bottom-left', // Posiciona el grupo de leyendas abajo a la izquierda
    padding: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.85)', // Fondo para el contenedor general
    border: '1px solid #CCCCCC',
    margin: '10px' // Margen del contenedor respecto al borde del mapa
  },
  layout: ui.Panel.Layout.flow('vertical', true) // true para 'filled', o simplemente 'vertical'
                                                 // 'true' para filled puede ayudar con el ancho.
                                                 // Opcional: puedes agregar un maxWidth: '200px' o similar si lo necesitas.
});


// --- 1. Leyenda para Tipo de Poblado (Categórica) ---
// Esta leyenda ya no necesita su propia 'position', 'backgroundColor' o 'border'
// ya que estará contenida en 'panelContenedorLeyendas'.
var leyendaTipoPoblado = ui.Panel({ style: {margin: '0 0 10px 0'} }); // Margen inferior para separar de la siguiente leyenda

var tituloTipoPoblado = ui.Label('Tipo de Poblado', {fontWeight: 'bold', fontSize: '13px', margin: '0 0 6px 0'});
leyendaTipoPoblado.add(tituloTipoPoblado);

var anadirFilaCategorica = function(panel, colorHex, nombre) {
  var cajaColor = ui.Label({style: {backgroundColor: '#' + colorHex, padding: '8px', margin: '0 0 4px 0', border: '1px solid #505050'}});
  var descripcion = ui.Label(nombre, {margin: '0 0 4px 6px', fontSize: '12px'});
  panel.add(ui.Panel([cajaColor, descripcion], ui.Panel.Layout.Flow('horizontal')));
};

anadirFilaCategorica(leyendaTipoPoblado, colorConsolidado, 'Urbano Consolidado');
anadirFilaCategorica(leyendaTipoPoblado, colorNoConsolidado, 'Urbano No Consolidado');
// Se añade al panel contenedor, no directamente al mapa
panelContenedorLeyendas.add(leyendaTipoPoblado);


// --- 2. Función para crear Leyendas Continuas (Población y Densidad) ---
function crearLeyendaContinua(titulo, paletaColoresHexCliente, minValorLeyenda, maxValorLeyenda, unidades) {
  // El panel de esta leyenda tampoco necesita 'position', 'backgroundColor', etc.
  // Solo un margen si es necesario para separarlo dentro del contenedor.
  var panelLeyendaIndividual = ui.Panel({style: {margin: '0 0 10px 0'}}); // Margen inferior
  panelLeyendaIndividual.add(ui.Label(titulo, {fontWeight: 'bold', fontSize: '13px', margin: '0 0 6px 0'}));

  var nPasos = paletaColoresHexCliente.length;
  var panelBarraColores = ui.Panel({layout: ui.Panel.Layout.Flow('horizontal')});

  for (var i = 0; i < nPasos; i++) {
    panelBarraColores.add(ui.Label('', {
      backgroundColor: paletaColoresHexCliente[i],
      padding: '10px 6px',
      margin: '0'
    }));
  }
  panelLeyendaIndividual.add(panelBarraColores);
  
  var formatoMin = (titulo.toLowerCase().indexOf('población') > -1) ? minValorLeyenda.toFixed(0) : minValorLeyenda.toFixed(1);
  var formatoMax = (titulo.toLowerCase().indexOf('población') > -1) ? maxValorLeyenda.toFixed(0) : maxValorLeyenda.toFixed(1);

  var panelEtiquetasMinMax = ui.Panel({
    widgets: [
      ui.Label(formatoMin, {fontSize: '11px', margin: '0 0 0 0'}),
      ui.Label(unidades, {fontSize: '11px', margin: '0 auto 0 auto', color: '#555555'}),
      ui.Label(formatoMax, {fontSize: '11px', margin: '0 0 0 auto'})
    ],
    layout: ui.Panel.Layout.Flow('horizontal'),
    style: {stretch: 'horizontal', margin: '4px 2px 0 2px'}
  });
  panelLeyendaIndividual.add(panelEtiquetasMinMax);
  return panelLeyendaIndividual;
}

// --- 3. Crear y Añadir Leyenda para Población Estimada ---
// !!! IMPORTANTE: Reemplaza minPopCliente y maxPopCliente con los valores numéricos
//     que corresponden a cómo se está visualizando tu capa de población.
var minPopCliente = 0;     // EJEMPLO - REEMPLAZAR
var maxPopCliente = 1; // EJEMPLO - REEMPLAZAR

var leyendaPoblacion = crearLeyendaContinua(
  'Población Estimada',
  paletaJsPoblacion,
  minPopCliente,
  maxPopCliente,
  'hab.'
);
panelContenedorLeyendas.add(leyendaPoblacion);

// --- 4. Crear y Añadir Leyenda para Densidad Poblacional Estimada ---
// !!! IMPORTANTE: Reemplaza minDenCliente y maxDenCliente con los valores numéricos
//     que corresponden a cómo se está visualizando tu capa de densidad.
var minDenCliente = 0;    // EJEMPLO - REEMPLAZAR
var maxDenCliente = 1; // EJEMPLO - REEMPLAZAR

var leyendaDensidad = crearLeyendaContinua(
  'Densidad Poblacional',
  paletaJsDensidad,
  minDenCliente,
  maxDenCliente,
  'hab/km²'
);
// La leyenda de densidad será la última en el panel, no necesita margen inferior extra.
// Si quieres un estilo diferente para el último elemento, puedes hacerlo.
panelContenedorLeyendas.add(leyendaDensidad);

// --- 5. Añadir el Panel Contenedor Principal al Mapa ---
Map.add(panelContenedorLeyendas);

///////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////

// --- INICIO: Calcular, Visualizar y Crear Leyenda para Amenaza Media por Poblado ---

// 1. Calcular la amenaza media para cada poblado
//    Usamos reduceRegions. La nueva propiedad se llamará 'mean' por defecto.
var escalaAmenaza = 30; // Ajusta esta escala a la resolución de tu imagenAmenaza o deseada
var pobladosConAmenaza = imagenAmenaza.reduceRegions({
  collection: pobladosConDatosDemograficos,
  reducer: ee.Reducer.mean(), // Calcula la media de los píxeles de imagenAmenaza
  scale: escalaAmenaza
});
// 'pobladosConAmenaza' ahora tiene todas las propiedades originales más una nueva llamada 'mean'.

// 2. Preparar Visualización (Estilo Vectorial)

// 2a. Calcular Min y Max de la propiedad 'mean' (amenaza media) para la rampa de color (lado servidor)
var minMaxAmenazaServidor = pobladosConAmenaza
  .filter(ee.Filter.notNull(['mean'])) // Ignorar features con 'mean' nulo para el cálculo
  .reduceColumns({
    reducer: ee.Reducer.minMax(),
    selectors: ['mean'] // La propiedad donde está la amenaza media
  });

// Obtener los valores min y max como ee.Number. Proveer defaults si no se encuentran.
var minAmenazaServ = ee.Number(ee.Algorithms.If(minMaxAmenazaServidor.get('min'), minMaxAmenazaServidor.get('min'), 0));
var maxAmenazaServ = ee.Number(ee.Algorithms.If(minMaxAmenazaServidor.get('max'), minMaxAmenazaServidor.get('max'), 1));

// Ajustar maxAmenazaServ si min y max son iguales para evitar división por cero
var rangoAmenazaCalc = maxAmenazaServ.subtract(minAmenazaServ);
maxAmenazaServ = ee.Number(ee.Algorithms.If(rangoAmenazaCalc.eq(0), minAmenazaServ.add(1), maxAmenazaServ));

// 2b. Definir paleta de colores para amenaza (ej. verde -> amarillo -> rojo)
var paletaAmenazaServidor = ee.List([
  '#00FF00', // Verde (Bajo)
  '#ADFF2F', // Verde-Amarillo
  '#FFFF00', // Amarillo (Medio)
  '#FFA500', // Naranja
  '#FF0000'  // Rojo (Alto)
]);

// 2c. Función para estilizar cada feature según su amenaza media (propiedad 'mean')
var estilizarPorAmenaza = function(feature) {
  var valorAmenaza = feature.get('mean'); // La propiedad se llama 'mean'
  var colorPorDefecto = 'BBBBBB'; // Gris para valores nulos

  var colorRelleno = ee.Algorithms.If(
    ee.Algorithms.IsEqual(valorAmenaza, null), // Si la amenaza es nula
    colorPorDefecto,
    // Else, calcular color basado en valor normalizado
    paletaAmenazaServidor.get( // Obtener color de la paleta
      ee.Number(valorAmenaza).subtract(minAmenazaServ) // (valor - min)
        .divide(maxAmenazaServ.subtract(minAmenazaServ)) // / (max - min) -> normalizado 0-1
        .clamp(0, 0.999) // Asegurar que esté en [0, ~1) para el índice de la paleta
        .multiply(paletaAmenazaServidor.size()) // Multiplicar por el número de colores
        .floor() // Obtener el índice entero
        .int()   // Convertir a entero
    )
  );

  return feature.set('style', { // Earth Engine usará esta propiedad 'style' para dibujar
    fillColor: ee.String(colorRelleno),
    color: '00000022', // Borde muy sutil y transparente
    strokeWidth: 0.5
  });
};

// 2d. Aplicar el estilo a la colección de poblados con amenaza
var pobladosEstiloAmenaza = pobladosConAmenaza.map(estilizarPorAmenaza);

// 3. Añadir la capa de amenaza media estilizada al mapa
Map.addLayer(pobladosEstiloAmenaza.style({styleProperty: 'style'}),
             {}, // No se necesitan visParams aquí porque el estilo está en los features
             'Amenaza Media por Poblado', false); // No visible por defecto

// 4. Crear y Añadir Leyenda para Amenaza Media
//    Usa la función 'crearLeyendaContinua' que definimos anteriormente.

//    Paleta de colores para la leyenda (debe ser un array JavaScript)
var jsPaletaAmenaza = ['#00FF00', '#ADFF2F', '#FFFF00', '#FFA500', '#FF0000'];

//    !!! IMPORTANTE: Reemplaza minAmeCliente y maxAmeCliente con los valores numéricos
//        que corresponden a cómo se está visualizando tu capa de amenaza media.
//        Puedes basarte en los valores impresos por 'Min/Max para Amenaza Media (cálculo servidor)'
//        o usar valores representativos que conozcas para tu índice de amenaza.
print('Min/Max para Amenaza Media (cálculo servidor):', minAmenazaServ, maxAmenazaServ); // Para depuración
var minAmeCliente = 0; // EJEMPLO - REEMPLAZAR (ej. el valor de minAmenazaServ que se imprimió)
var maxAmeCliente = 1; // EJEMPLO - REEMPLAZAR (ej. el valor de maxAmenazaServ que se imprimió)
//    Si tu índice de amenaza tiene un rango conocido (ej. 0 a 5, o 0 a 100), usa esos límites.

var leyendaAmenazaMedia = crearLeyendaContinua(
  'Amenaza Media (Índice)', // Título de la leyenda
  jsPaletaAmenaza,
  minAmeCliente,
  maxAmeCliente,
  '' // Unidades, si aplica (ej. "índice", o dejar vacío)
);

// Posicionar esta nueva leyenda. Ajusta 'position' para que no se solape con otras.
// Si estás usando 'panelContenedorLeyendas' de la respuesta anterior:
if (typeof panelContenedorLeyendas !== 'undefined') {
    leyendaAmenazaMedia.style().set('margin', '10px 0 0 0'); // Añadir margen superior si es necesario
    panelContenedorLeyendas.add(leyendaAmenazaMedia);
} else {
    // Si no hay un panel contenedor, la añadimos directamente al mapa (ajusta posición)
    leyendaAmenazaMedia.style().set('position', 'top-right'); // O cualquier otra posición
    Map.add(leyendaAmenazaMedia);
}

// --- FIN ---

// --- ExportarGoogle Drive ---

// Definir los parámetros de la exportación
Export.table.toDrive({
  collection: pobladosConAmenaza, // La FeatureCollection que quieres exportar
  description: 'Poblados_Analisis_Amenaza', // Nombre de la tarea y del archivo por defecto
  folder: 'GEE_Exports', // (Opcional) Nombre de la carpeta en tu Google Drive donde se guardará
  fileNamePrefix: 'Poblados_Analisis_Amenaza', // (Opcional) Prefijo para el nombre del archivo
  fileFormat: 'SHP' // Formato del archivo. Otros comunes: 'GeoJSON', 'KML', 'CSV' (CSV solo exporta atributos)
});

// --- FIN: Exportar capa ---
