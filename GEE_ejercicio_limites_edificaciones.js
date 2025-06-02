//Script elaborado por Abner Jiménez
//Coordinador Técnico Regional - Proyecto Paisajes Forestales y Comercio Sostenible REDD+Landscape III
//GIZ - Deutsche Gesellschaft für Internationale Zusammenarbeit GmbH
// --- INICIO DEL SCRIPT ---
// alert('El proceso iniciará cuando haga clic en ACEPTAR. Una vez iniciado, puede demorar hasta que se muestre el resultado...');
 
// --- INICIO: Configuración de Notificaciones Dinámicas en UI ---
// Crear una etiqueta (Label) para mostrar los mensajes de estado.
var etiquetaDeEstado = ui.Label();
// Crear un panel (Panel) para contener la etiqueta de estado.
var panelDeEstado = ui.Panel({
  widgets: [etiquetaDeEstado],
  style: {
    position: 'bottom-left',
    padding: '10px 15px',
    margin: '0 0 10px 10px',
 //   backgroundColor: 'rgba(60, 60, 60, 0.75)',
    color: 'black',
    fontSize: '13px',
    border: '1px solid #333333',
    whiteSpace: 'pre-wrap'
  }
});
// Añadir el panel de estado al mapa INMEDIATAMENTE.
Map.add(panelDeEstado);
// Actualizar la etiqueta una vez que el panel está (o debería estar) añadido.
etiquetaDeEstado.setValue('Análisis iniciado, por favor espere..');

// --- Función para Actualizar el Mensaje de Estado ---
function actualizarEstado(mensaje) {
  etiquetaDeEstado.setValue(mensaje);
  // print('Estado UI: ' + mensaje); // Descomenta para depuración si es necesario
}
// --- INICIO DE LA FUNCIÓN DE NOTIFICACIÓn (EVALUATE) ---
ee.Number(1).evaluate(function() {
  
// --- INICIO DEL SCRIPT PRINCIPAL (DENTRO DE EVALUATE) ---
//actualizarEstado('Proceso principal iniciado. Cargando datos...');

// Cargar el asset de imagen
var AssetIndiceMultiAmenaza = 'users/SU NOMBRE DE USUARIO/Score_Multiamenaza_Ponderado';
var imagenAmenaza = ee.Image(AssetIndiceMultiAmenaza);

// Obtener la geometría de la imagen para usarla como región de reducción
var roi = imagenAmenaza.geometry();
Map.addLayer(roi, {palette: ['blue']}, 'Geometría del Asset', true);
actualizarEstado('Assets cargados. Obteniendo huellas de edificios...');


// Calcular el mínimo y máximo valor
var minMaxValores = imagenAmenaza.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: roi,
  scale: 30, // Ajusta esto a la resolución de tu imagen (e.g., 30 metros)
  maxPixels: 1e13, // Puede ser necesario aumentar si la imagen es muy grande
  bestEffort: true // Usa bestEffort si la región es muy grande y quieres una aproximación más rápida
});

// Imprimir los resultados del Raster
//print('Valores Mínimo y Máximo del Ráster:', minMaxValores);

  actualizarEstado('Assets cargados. Obteniendo huellas de edificios...');
// Cargar las huellas de los edificios (FeatureCollection)
var edificiosGlobal = ee.FeatureCollection('GOOGLE/Research/open-buildings/v3/polygons');

// Filtrar edificios al ROI definido a partir del raster de amenaza
var edificiosObjetivo = edificiosGlobal.filterBounds(roi);
//Map.addLayer(edificiosObjetivo, {color: 'CCCCCC'}, 'Huellas de Edificios en ROI', false);
actualizarEstado('Edificios filtrados. Calculando amenaza por edificio...');

// Asignar el valor del índice multiamenaza 
var edificiosConAmenaza = imagenAmenaza.reduceRegions({
  collection: edificiosObjetivo, 
  reducer: ee.Reducer.mean(),   
  scale: 30, // Escala del raster de amenaza. AJUSTA si es diferente (ej. 10 o 30).
});

//Obtener valores minimos y máximos de los edificios con amenazas
// 1. Calcular el diccionario de mínimo/máximo y traerlo al cliente
var minMaxInfoEdificios = edificiosConAmenaza.reduceColumns({
  reducer: ee.Reducer.minMax(),
  selectors: ['mean'] 
}).getInfo();

// 2. Extraer los valores mínimo y máximo en variables separadas
var MinEdif = minMaxInfoEdificios.min;
var MaxEdif = minMaxInfoEdificios.max;

//Grafica histograma
var histogramaAmenazaEdificios = ui.Chart.feature.histogram({
  features: edificiosConAmenaza,
  property: 'mean',
  maxBuckets: 30 
}).setOptions({
  title: 'Distribución de Scores de Multiamenaza en Edificios',
  //hAxis: {title: 'Score de Multiamenaza (promedio por edificio)', viewWindow: {min:0, max:1}},
  hAxis: {
    title: 'Nivel de Amenaza (mean)',
    minValue: MinEdif, 
    maxValue: MaxEdif   
  },
  vAxis: {title: 'Número de Edificios'}
});
//print(histogramaAmenazaEdificios);

//Definir clases de los valores de amenazas de los edificios

// 3. Calcular el rango y el tamaño del intervalo para 5 clases
var rangoAmenaza = ee.Number(MaxEdif).subtract(MinEdif);
var intervaloClase = rangoAmenaza.divide(5);

// 4. Definir los límites superiores de cada clase.
var limiteClase1 = ee.Number(MinEdif).add(intervaloClase);      // Límite para Muy Bajo
var limiteClase2 = ee.Number(MinEdif).add(intervaloClase.multiply(2)); // Límite для Bajo
var limiteClase3 = ee.Number(MinEdif).add(intervaloClase.multiply(3)); // Límite para Medio
var limiteClase4 = ee.Number(MinEdif).add(intervaloClase.multiply(4)); // Límite para Alto

// 5. Crear una función para clasificar cada edificio 
var clasificarAmenazaEdificio = function(feature) {
  var valorAmenazaRaw = feature.get('mean'); // Obtener el valor 'mean' SIN convertirlo aún a ee.Number

  // Primero, definir la lógica de clasificación para cuando SÍ HAY un valor
  var logicaClasificacionConValor = ee.String(
    ee.Algorithms.If(rangoAmenaza.eq(0), 'Medio', // Caso especial: si todos los valores son iguales (rango es 0)
      ee.Algorithms.If(ee.Number(valorAmenazaRaw).lte(limiteClase1), 'Muy Bajo',
        ee.Algorithms.If(ee.Number(valorAmenazaRaw).lte(limiteClase2), 'Bajo',
          ee.Algorithms.If(ee.Number(valorAmenazaRaw).lte(limiteClase3), 'Medio',
            ee.Algorithms.If(ee.Number(valorAmenazaRaw).lte(limiteClase4), 'Alto',
              'Muy Alto') // Por defecto, si es mayor que limiteClase4
          )
        )
      )
    )
  );

  // Ahora, usar ee.Algorithms.If para verificar si valorAmenazaRaw es null
  // ee.Algorithms.IsEqual(valorAmenazaRaw, null) es la forma correcta de verificar null en el servidor
  var clase = ee.String(ee.Algorithms.If(
    ee.Algorithms.IsEqual(valorAmenazaRaw, null), // Condición: ¿Es el valor de amenaza nulo?
    'Sin Dato',                                   // Valor si es VERDADERO (es nulo): asignar "Sin Dato"
    logicaClasificacionConValor                   // Valor si es FALSO (no es nulo): aplicar la lógica de clasificación normal
  ));

  return feature.set('clase_amenaza_texto', clase); // Añadir la nueva propiedad con la clase
};

// 6. Aplicar la función de clasificación a la FeatureCollection
var edificiosConClase = edificiosConAmenaza.map(clasificarAmenazaEdificio);

// Imprimir algunos ejemplos para verificar
//print('Primeros 5 edificios con su clase de amenaza:', edificiosConClase.limit(5));

// 7. Contar cuántos edificios hay en cada clase de amenaza para graficar
// Esto crea un diccionario donde la clave 'histogram' contiene un objeto
// con las clases como claves y los conteos como valores.
var conteoPorClase = edificiosConClase.reduceColumns({
  selectors: ['clase_amenaza_texto'],
  reducer: ee.Reducer.frequencyHistogram() 
});

//GENERAR GRAFICO
// Para usar en ui.Chart, necesitarás .getInfo() y luego acceder a la propiedad 'histogram'.
var infoConteo = conteoPorClase.getInfo();
print('Conteo para gráfico (cliente):', infoConteo);
var datosDelHistograma = infoConteo.histogram; // Acceder al objeto del histograma, ej: {'Muy Bajo': 50, 'Bajo': 120, ...}

// 1. Definir el orden deseado para las clases en el gráfico
var ordenDeClases = ['Muy Bajo', 'Bajo', 'Medio', 'Alto', 'Muy Alto'];

// 2. Preparar los datos para el gráfico en el orden especificado
var datosParaGrafico = [['Clase', 'Cantidad']]; // Cabecera de la tabla

ordenDeClases.forEach(function(nombreClase) {
  var conteo = 0; // Por defecto, si la clase no existe en el histograma, su conteo es 0
  if (datosDelHistograma[nombreClase] !== undefined) {
    conteo = datosDelHistograma[nombreClase];
  }
  datosParaGrafico.push([nombreClase, conteo]);
});

// 3. (Opcional) Añadir la clase 'Sin Dato' al final si existe y tiene conteo
if (datosDelHistograma['Sin Dato'] !== undefined && datosDelHistograma['Sin Dato'] > 0) {
  datosParaGrafico.push(['Sin Dato', datosDelHistograma['Sin Dato']]);
}

// 4. Crear el gráfico (el resto de este código es como lo tenías, con la corrección anterior)
var graficoClases = new ui.Chart()
  .setDataTable(datosParaGrafico)
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Número de Edificios por Clase de Amenaza',
    hAxis: {
        title: 'Clase de Amenaza',
        slantedText: true, // Ayuda a que no se solapen los nombres
        slantedTextAngle: 30 // Ángulo de inclinación
    },
    vAxis: {
        title: 'Número de Edificios',
        viewWindow: {min: 0} // Asegurar que el eje Y comience en 0
    },
    legend: {position: 'none'}, // Ocultar leyenda si solo hay una serie
    bar: { groupWidth: '80%' } // Ajustar el ancho de las barras si se desea
  });

print(graficoClases);

// --- INICIO DE LÍNEAS ADICIONALES PARA ESTILIZAR CAPA Y CREAR LEYENDA ---

// 1. Definir la función para asignar estilo (color) a cada edificio (CORREGIDA)
var asignarEstilosAmenaza = function(feature) {
  var clase = feature.get('clase_amenaza_texto'); // Obtener la clase de amenaza del feature

  // Definir el mapeo de clase a color como un ee.Dictionary
  var mapaDeColores = ee.Dictionary({
    'Muy Alto': '8B4513', // Café (SaddleBrown)
    'Alto':     'FF0000', // Rojo
    'Medio':    'FFA500', // Naranja
    'Bajo':     'FFFF00', // Amarillo
    'Muy Bajo': 'FFFFE0', // Amarillo Claro (LightYellow)
    'Sin Dato': '808080'  // Gris
  });

  // Obtener el color del diccionario.
  // El segundo argumento de .get() es un valor por defecto si la clave (clase) no se encuentra.
  var colorRelleno = ee.String(mapaDeColores.get(clase, '000000')); // '000000' (negro) como color por defecto

  // Retornar el feature con una nueva propiedad 'style'
  return feature.set('style', {
    fillColor: colorRelleno,    // Color de relleno del polígono
    color: 'FFFFFF00',          // Color del borde: Blanco totalmente TRANSPARENTE (FF FF FF para blanco, 00 para alfa)
                                // También podrías usar '00000000' para negro transparente.
    strokeWidth: 0              // Mantener el ancho del borde en 0 o un valor muy pequeño.
  });
};

// 2. Aplicar la función de estilo a la colección de edificios con clase
var edificiosEstilizados = edificiosConClase.map(asignarEstilosAmenaza);

// 3. Añadir la capa de edificios estilizados al mapa
// Usamos .style({styleProperty: 'style'}) para que GEE aplique los estilos definidos
Map.addLayer(edificiosEstilizados.style({styleProperty: 'style'}), {}, 'Edificios por Nivel de Amenaza');

// 4. Crear y añadir la leyenda al mapa (código del lado del cliente)

// -- Configuración de la Leyenda --
var tituloLeyenda = 'Nivel de Amenaza';
// Los nombres deben coincidir con tus clases, y los colores con los asignados arriba
var nombresCategoriasLeyenda = ['Muy Alto', 'Alto', 'Medio', 'Bajo', 'Muy Bajo', 'Sin Dato'];
var coloresHexLeyenda = ['8B4513', 'FF0000', 'FFA500', 'FFFF00', 'FFFFE0', '808080'];

// -- Crear el Panel de la Leyenda --
var leyenda = ui.Panel({
  style: {
    position: 'bottom-left', // Posición en el mapa
    padding: '10px 15px',
    backgroundColor: 'rgba(255, 255, 255, 0.9)', // Fondo blanco semi-transparente
    border: '1px solid #CCCCCC' // Borde ligero
  }
});

// -- Añadir el Título a la Leyenda --
var etiquetaTituloLeyenda = ui.Label({
  value: tituloLeyenda,
  style: {
    fontWeight: 'bold',
    fontSize: '14px',
    margin: '0 0 6px 0',
    padding: '0'
  }
});
leyenda.add(etiquetaTituloLeyenda);

// -- Función para crear cada fila de la leyenda (color + nombre) --
var anadirFilaALeyenda = function(colorHex, nombreCategoria) {
  // Crear la caja de color
  var cajaColor = ui.Label({
    style: {
      backgroundColor: '#' + colorHex, // El # es necesario para CSS
      padding: '8px',
      margin: '0 0 4px 0',
      border: '1px solid #505050' // Borde para la caja de color
    }
  });

  // Crear la etiqueta con el nombre de la categoría
  var etiquetaNombre = ui.Label({
    value: nombreCategoria,
    style: {
      margin: '0 0 4px 8px', // Margen a la izquierda de la caja de color
      fontSize: '12px'
    }
  });

  // Añadir la fila (panel horizontal con caja y etiqueta) a la leyenda
  leyenda.add(ui.Panel([cajaColor, etiquetaNombre], ui.Panel.Layout.Flow('horizontal')));
};

// -- Generar las filas para cada categoría en la leyenda --
for (var i = 0; i < nombresCategoriasLeyenda.length; i++) {
  anadirFilaALeyenda(coloresHexLeyenda[i], nombresCategoriasLeyenda[i]);
}

// -- Añadir la leyenda completa al mapa --
Map.add(leyenda);
Map.setOptions('SATELLITE');

// --- INICIO DE LÍNEAS PARA CLASIFICAR Y VISUALIZAR LA IMAGEN DE AMENAZA ---

// 1. Clasificar la imagen 'imagenAmenaza' usando los umbrales de los edificios.
// Se asignarán valores de 0 a 4 para las clases (Muy Bajo a Muy Alto).
var imagenAmenazaClasificada = ee.Image(0) // Imagen base, se sobrescribirá
    .where(imagenAmenaza.lte(limiteClase1), 0) // Clase 0: Muy Bajo
    .where(imagenAmenaza.gt(limiteClase1).and(imagenAmenaza.lte(limiteClase2)), 1) // Clase 1: Bajo
    .where(imagenAmenaza.gt(limiteClase2).and(imagenAmenaza.lte(limiteClase3)), 2) // Clase 2: Medio
    .where(imagenAmenaza.gt(limiteClase3).and(imagenAmenaza.lte(limiteClase4)), 3) // Clase 3: Alto
    .where(imagenAmenaza.gt(limiteClase4), 4); // Clase 4: Muy Alto

// 2. Definir los parámetros de visualización para la imagen clasificada.
// Los colores deben corresponder al orden de las clases (0 a 4).
// Muy Bajo (0) -> Amarillo Claro, Bajo (1) -> Amarillo, Medio (2) -> Naranja, Alto (3) -> Rojo, Muy Alto (4) -> Café
var visParamsImagenAmenaza = {
  min: 0,
  max: 4,
  palette: [
    'FFFFE0', // Muy Bajo (Amarillo Claro)
    'FFFF00', // Bajo (Amarillo)
    'FFA500', // Medio (Naranja)
    'FF0000', // Alto (Rojo)
    '8B4513'  // Muy Alto (Café - SaddleBrown)
  ]
};

// 3. Añadir la imagen clasificada al mapa.
Map.addLayer(imagenAmenazaClasificada.clip(roi), visParamsImagenAmenaza, 'Imagen de Multi-Amenaza Clasificada', false);

// --- EXPORTAR ---

Export.table.toDrive({
  collection: edificiosConClase,
  description: 'Edificios_Con_Amenaza', // Nombre de la tarea y del archivo por defecto
  folder: 'GEE_Exports',        // (Opcional) Carpeta en tu Google Drive
  fileNamePrefix: 'Edificios_Con_Amenaza', // (Opcional) Prefijo del nombre de archivo (sin la extensión)
  fileFormat: 'geojson'                      // Especifica el formato GeoJSON - Shapefile da error
  // selectors: ['lista', 'de', 'propiedades'] // (Opcional) Si solo quieres un subconjunto de atributos.
                                              // Si se omite, GEE exportará todos los atributos.
});


///-----

  // --- FINAL DEL SCRIPT PRINCIPAL (DENTRO DE EVALUATE) ---
  actualizarEstado('Proceso completado.');
  // Considera que si hay más .getInfo() o procesos largos después de esta línea DENTRO de evaluate,
  // este mensaje aparecerá antes de que esos terminen. Colócalo estratégicamente.

}); // Fin de ee.Number(1).evaluate()

