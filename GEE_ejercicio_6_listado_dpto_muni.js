// --- Configuración del País de Interés ---
// Modifica estas variables para cambiar el país
//https://es.wikipedia.org/wiki/ISO_3166-1_alfa-3
var codigoISOPais = 'GTM'; // Código ISO 3166-1 alpha-3 del país (ej. 'SLV' para El Salvador, 'HND' para Honduras)
var nombrePais = 'Guatemala'; // Nombre del país (para los mensajes en la consola)
// --- Fin de Configuración ---

// Cargar la colección de límites administrativos de nivel 1 (departamentos/estados)
var adm1Collection = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM2');

// Filtrar para obtener todas las unidades ADM1 del país de interés
var paisADM1 = adm1Collection.filter(ee.Filter.eq('shapeGroup', codigoISOPais));

// Obtener la lista de nombres de las unidades ADM1 (propiedad 'shapeName')
// Usamos .aggregate_array() para obtener una lista de todos los valores de esa propiedad.
// Luego .getInfo() para traer esa lista del servidor al cliente (la consola).
// Es importante manejar el caso en que no se encuentren unidades para el país especificado.
var nombresADM1 = null;
var numeroADM1 = 0;

// Comprobar si se encontraron unidades ADM1 para el país
if (paisADM1.size().getInfo() > 0) {
  nombresADM1 = paisADM1.aggregate_array('shapeName').getInfo();
  numeroADM1 = paisADM1.size().getInfo(); // Obtener el número de unidades ADM1
} else {
  print('Advertencia: No se encontraron unidades ADM1 para el país con código ISO: ' + codigoISOPais);
}

// Imprimir la lista de nombres en la consola si se encontraron
if (nombresADM1) {
  print('Unidades ADM1 de ' + nombrePais + ':', nombresADM1);
}

// Imprimir el número de unidades ADM1
print('Número de unidades ADM1 en ' + nombrePais + ':', numeroADM1);

// Opcional: Visualizar los límites ADM1 del país de interés en el mapa
if (numeroADM1 > 0) {
  Map.centerObject(paisADM1, 6); // Centrar el mapa en la colección de ADM1 con un zoom general
  Map.addLayer(paisADM1, {color: '00909F', fillColor: 'b5ffb4AA'}, 'Límites ADM1 de ' + nombrePais);
} else {
  print('No se añadirán límites al mapa porque no se encontraron unidades ADM1.');
}
