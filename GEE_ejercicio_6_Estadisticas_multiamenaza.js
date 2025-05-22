// =====================================================================================
// SCRIPT PARA SELECCIÓN FLEXIBLE DE LÍMITES ADMINISTRATIVOS (ADM0, ADM1, ADM2),
// CORTE DE RASTER "MULTIAMENAZA" Y CÁLCULO DE ESTADÍSTICAS ZONALES
// =====================================================================================

// --- 1. CONFIGURACIÓN DEL USUARIO ---
// Instrucciones:
// a. DESCOMENTE UNA de las tres variables de configuración: CONFIG_PAIS, CONFIG_DPTO, o CONFIG_MUNI.
// b. CONFIGURE las propiedades dentro de la variable descomentada.
//    - pais_iso: Código ISO 3166-1 alpha-3 del país (ej. 'SLV' para El Salvador, 'HND' para Honduras, 'USA' para Estados Unidos).
//    - nombre_admX: Nombre exacto de la unidad administrativa como aparece en geoBoundaries.
// c. Asegúrese de que las otras dos variables de configuración permanezcan COMENTADAS.
// Códigos de pais https://es.wikipedia.org/wiki/ISO_3166-1_alfa-3
 //Ejemplo para PAÍS (ADM0):
//var CONFIG_PAIS = {
//  pais_iso: 'SLV',        // Código ISO del país
//  nombre_adm0: 'El Salvador' // Nombre del país (para geoBoundaries ADM0, shapeName suele ser el nombre del país)
// };

// Ejemplo para DEPARTAMENTO/ESTADO (ADM1):
var CONFIG_DPTO = {
  pais_iso: 'SLV',        // Código ISO del país al que pertenece el departamento
  nombre_adm1: 'Departamento de San Salvador' // Nombre del departamento/estado
};

//Ejemplo para MUNICIPIO/CONDADO (ADM2) - CONFIGURACIÓN ACTIVA POR DEFECTO:
//var CONFIG_MUNI = {
//  pais_iso: 'SLV',        // Código ISO del país al que pertenece el municipio
//  nombre_adm2: 'Soyapango'  // Nombre del municipio/condado
//};
// --- Fin de Configuración del Usuario ---


// --- 2. LÓGICA INTERNA PARA DETERMINAR LA SELECCIÓN ---
var nivelAdministrativo;
var paisISO;
var nombreUnidadAdm; // Para ADM1 y ADM2, este será el 'shapeName'

if (typeof CONFIG_PAIS !== 'undefined' && CONFIG_PAIS !== null) {
    nivelAdministrativo = 'ADM0';
    paisISO = CONFIG_PAIS.pais_iso;
    nombreUnidadAdm = CONFIG_PAIS.nombre_adm0; // Usado para el nombre de la capa y referencia
    print("Configuración activa: PAÍS (ADM0)");
} else if (typeof CONFIG_DPTO !== 'undefined' && CONFIG_DPTO !== null) {
    nivelAdministrativo = 'ADM1';
    paisISO = CONFIG_DPTO.pais_iso;
    nombreUnidadAdm = CONFIG_DPTO.nombre_adm1;
    print("Configuración activa: DEPARTAMENTO/ESTADO (ADM1)");
} else if (typeof CONFIG_MUNI !== 'undefined' && CONFIG_MUNI !== null) {
    nivelAdministrativo = 'ADM2';
    paisISO = CONFIG_MUNI.pais_iso;
    nombreUnidadAdm = CONFIG_MUNI.nombre_adm2;
    print("Configuración activa: MUNICIPIO/CONDADO (ADM2)");
} else {
    print("Error Crítico: Ninguna configuración de nivel (CONFIG_PAIS, CONFIG_DPTO, o CONFIG_MUNI) está activa.");
    print("Por favor, descomente y configure UNA de estas variables en la sección 'CONFIGURACIÓN DEL USUARIO'.");
    throw new Error("Configuración de nivel administrativo faltante. El script se detendrá.");
}
print("  País ISO seleccionado: " + paisISO);
if (nivelAdministrativo !== 'ADM0') {
  print("  Nombre de Unidad Administrativa: " + nombreUnidadAdm);
}
// --- Fin Lógica Interna ---


// --- 3. CARGAR Y FILTRAR LÍMITES ADMINISTRATIVOS ---
var coleccionGeoBoundaries;
var filtroPrincipal;

if (nivelAdministrativo === 'ADM0') {
  coleccionGeoBoundaries = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM0');
  filtroPrincipal = ee.Filter.and(
    ee.Filter.eq('shapeGroup', paisISO),
    ee.Filter.eq('shapeName', nombreUnidadAdm)
  );
} else if (nivelAdministrativo === 'ADM1') {
  coleccionGeoBoundaries = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM1');
  filtroPrincipal = ee.Filter.and(
    ee.Filter.eq('shapeGroup', paisISO), 
    ee.Filter.eq('shapeName', nombreUnidadAdm) 
  );
} else { // ADM2
  coleccionGeoBoundaries = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM2');
  filtroPrincipal = ee.Filter.and(
    ee.Filter.eq('shapeGroup', paisISO), 
    ee.Filter.eq('shapeName', nombreUnidadAdm) 
  );
}

var limiteSeleccionadoElement = coleccionGeoBoundaries.filter(filtroPrincipal).first(); // Podría ser ee.Element o null

// --- 4. VISUALIZACIÓN DEL LÍMITE ---
if (!limiteSeleccionadoElement) {
  print("Error: No se encontró la unidad administrativa especificada.");
  print("  Nivel: " + nivelAdministrativo);
  print("  País ISO: " + paisISO);
  print("  Nombre Unidad: " + (nombreUnidadAdm || 'N/A para ADM0 global'));
  print("Verifique los parámetros de configuración y la disponibilidad en geoBoundaries.");
  throw new Error("Unidad administrativa no encontrada. El script se detendrá.");
}

// Intentar obtener el nombre de la capa.
var nombreCapaLimite = "Nombre no definido"; // Valor por defecto
try {
    // Asegurarse de que getInfo() se llama sobre un ee.String derivado de una propiedad existente.
    var shapeNameProperty = limiteSeleccionadoElement.get('shapeName');
    if (shapeNameProperty === null || typeof shapeNameProperty === 'undefined') {
        print('Advertencia: La propiedad "shapeName" es nula o indefinida para el límite seleccionado.');
        nombreCapaLimite = nivelAdministrativo + ': (Nombre Desconocido)' + ' (' + paisISO + ')';
    } else {
        nombreCapaLimite = nivelAdministrativo + ': ' + ee.String(shapeNameProperty).getInfo() + ' (' + paisISO + ')';
    }
    print('Debug: nombreCapaLimite definido como: ' + nombreCapaLimite);
} catch (e) {
    print('Error al definir nombreCapaLimite: ' + e.message);
    print('Debug: limiteSeleccionadoElement en el momento del error de getInfo():', limiteSeleccionadoElement);
    nombreCapaLimite = nivelAdministrativo + ': (Error al obtener nombre)' + ' (' + paisISO + ')';
}

// --- Depuración y Preparación del Límite (Sin Estilo Personalizado) ---
print('Debug: limiteSeleccionadoElement (antes de ee.Feature cast):', limiteSeleccionadoElement);
print('Debug: GEE Object Type of limiteSeleccionadoElement (server-side):', ee.Algorithms.ObjectType(limiteSeleccionadoElement));

// Convertir explícitamente a ee.Feature
var featureToStyle = ee.Feature(limiteSeleccionadoElement);
print('Debug: featureToStyle (después de ee.Feature cast):', featureToStyle);
print('Debug: GEE Object Type of featureToStyle (server-side):', ee.Algorithms.ObjectType(featureToStyle));

// Ya no se aplica estilo personalizado. Se usará el estilo por defecto de GEE para Features.
Map.centerObject(featureToStyle, nivelAdministrativo === 'ADM0' ? 6 : (nivelAdministrativo === 'ADM0' ? 9 : 11));
Map.addLayer(featureToStyle, {}, nombreCapaLimite); // Añadir directamente el feature, sin parámetros de estilo explícitos
print("Límite '" + nombreCapaLimite + "' añadido al mapa con estilo por defecto.");

// --- 5. CARGAR RASTER "MULTIAMENAZA" (EJEMPLO) ---
var rasterMultiamenaza = multiamenaza; 
var nombreRasterAnalizado = 'Multiamenaza recortado';
var escalaNativaRaster = 30; 

var visParamsRasterEjemplo = {
  min: 0,
  max: 3000,
  palette: ['blue', 'green', 'yellow', 'orange', 'red']
};
Map.addLayer(rasterMultiamenaza, visParamsRasterEjemplo, nombreRasterAnalizado + ' (Global)', false); 

// --- 6. CORTAR EL RASTER "MULTIAMENAZA" ---
// Usar la geometría del featureToStyle para el clip
var rasterCortado = rasterMultiamenaza.clip(featureToStyle.geometry()); 
Map.addLayer(rasterCortado, visParamsRasterEjemplo, 'Cortado: ' + nombreRasterAnalizado + ' en ' + nombreCapaLimite);
print("Raster cortado y añadido al mapa.");

// --- 7. CALCULAR ESTADÍSTICAS ZONALES ---
var reductores = ee.Reducer.mean()
  .combine(ee.Reducer.median(), '', true) 
  .combine(ee.Reducer.minMax(), '', true)
  .combine(ee.Reducer.stdDev(), '', true)
  .combine(ee.Reducer.count(), '', true) 
  .combine(ee.Reducer.sum(), '', true);   

print("Calculando estadísticas zonales para '" + nombreCapaLimite + "'...");
var estadisticas = rasterCortado.reduceRegion({
  reducer: reductores,
  geometry: featureToStyle.geometry(), // Usar la geometría del featureToStyle
  scale: escalaNativaRaster, 
  maxPixels: 1e12 
});

// --- 8. IMPRIMIR RESULTADOS DE ESTADÍSTICAS ---
print("Estadísticas del raster '" + nombreRasterAnalizado + "' para la zona '" + nombreCapaLimite + "':");
var statsInfo = estadisticas.getInfo();

// DEBUG: Comprobar si Number.isInteger está definido
print("Debug: typeof Number.isInteger = " + typeof Number.isInteger);

if (statsInfo) {
  for (var key in statsInfo) {
    if (statsInfo.hasOwnProperty(key)) {
      var value = statsInfo[key];
      // Loguear el valor y su tipo antes de procesarlo
      print("Debug: Procesando clave = " + key + ", valor = " + value + ", typeof valor = " + typeof value); 

      if (typeof value === 'number') { // Primero comprobar si es un número
        if (Number.isInteger && !Number.isInteger(value)) { // Luego comprobar si NO es un entero (y que Number.isInteger exista)
          try {
            value = value.toFixed(4);
          } catch (e_toFixed) {
            print("Error aplicando .toFixed(4) al valor: " + value + " para la clave: " + key + ". Error: " + e_toFixed.message);
          }
        }
      } else {
        print("Debug: El valor para la clave '" + key + "' no es un número. Tipo: " + typeof value + ". Valor: " + value);
      }
      print('  ' + key + ': ' + value);
    }
  }
} else {
  print("No se pudieron calcular las estadísticas. Verifique la capa raster, el área de interés y los parámetros de 'reduceRegion'.");
}

print('--- Fin del Script ---');