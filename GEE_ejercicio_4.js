// --- PASO 0: Definir la Región de Interés (Opcional, para visualización y ejemplo) ---

Map.centerObject(roi, 10); // Centra el mapa en la región de interés

// --- PASO 1: Cargar o Definir las Capas de Amenaza ---

// Muestra las capas originales clasificadas (0-4)
Map.addLayer(inundacion_original.clip(roi), {min: 0, max: 4, palette: ['#ffffff', '#ffffcc', '#fed976', '#fd8d3c', '#e31a1c']}, 'Amenaza Inundación Original (0-4)');
Map.addLayer(deslizamientos_original.clip(roi), {min: 0, max: 4, palette: ['#ffffff', '#ccffcc', '#78c679', '#31a354', '#006837']}, 'Amenaza Deslizamientos Original (0-4)');

// --- PASO 2: Normalizar las Capas de Amenaza a una escala de 0 a 1 ---
// Los valores de entrada son 1 (Baja), 2 (Moderada), 3 (Alta), 4 (Muy alta).
// El valor mínimo original es 1, y el máximo es 4.
// Fórmula: (valor_original - min_original) / (max_original - min_original)
// En este caso: (valor_original - 0) / (4 - 0) = valor_original / 4

var inundacion_normalizada = inundacion_original.divide(4.0).rename('inundacion_norm'); // Divide por el valor máximo (4)
var deslizamientos_normalizada = deslizamientos_original.divide(4.0).rename('deslizamientos_norm'); // Divide por el valor máximo (4)

// Muestra las capas normalizadas (0-1)
Map.addLayer(inundacion_normalizada.clip(roi), {min: 0, max: 1, palette: ['#f7fcf0', '#ccebc5', '#7bccc4', '#43a2ca', '#0868ac']}, 'Amenaza Inundación Normalizada (0-1)');
Map.addLayer(deslizamientos_normalizada.clip(roi), {min: 0, max: 1, palette: ['#f7fcf0', '#ccebc5', '#7bccc4', '#43a2ca', '#0868ac']}, 'Amenaza Deslizamientos Normalizada (0-1)');

// --- PASO 3: Definir Pesos para cada Amenaza ---
// La suma de los pesos debe ser 1.0
// Ajusta estos pesos según la importancia relativa de cada amenaza.
var peso_inundacion = 0.5;
var peso_deslizamientos = 0.5;

if (peso_inundacion + peso_deslizamientos !== 1.0) {
  print("ALERTA: La suma de los pesos no es igual a 1.0. Por favor, ajústalos.");
  // Podrías agregar lógica para detener el script o normalizar los pesos aquí.
}

// --- PASO 4: Calcular el Índice de Multiamenaza por Superposición Ponderada ---
// Índice = (Capa1_Normalizada * Peso1) + (Capa2_Normalizada * Peso2) + ...

var indice_multiamenaza = inundacion_normalizada.multiply(peso_inundacion)
                            .add(deslizamientos_normalizada.multiply(peso_deslizamientos))
                            .rename('indice_multiamenaza');

// --- PASO 5: Visualizar el Índice de Multiamenaza ---
// El índice resultante estará en una escala de 0 (amenaza nula) a 1 (máxima amenaza).
var paleta_multiamenaza = ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725']; // Paleta de Viridis para buena percepción
// Otra opción de paleta: Verde (bajo) a Rojo (alto)
// var paleta_multiamenaza = ['#00ff00', '#ffff00', '#ffcc00', '#ff9900', '#ff6600', '#ff0000'];


Map.addLayer(
  indice_multiamenaza.clip(roi),
  {min: 0, max: 1, palette: paleta_multiamenaza},
  'Índice de Multiamenaza (0-1)'
);

// Imprime información sobre las imágenes para verificar
print('Imagen de Inundación Original:', inundacion_original);
print('Imagen de Inundación Normalizada:', inundacion_normalizada);
print('Índice de Multiamenaza:', indice_multiamenaza);

// --- (Opcional) PASO 6: Exportar el Resultado ---
// Descomenta y ajusta las siguientes líneas si deseas exportar la imagen.
/*
Export.image.toAsset({
  image: indice_multiamenaza.toFloat(), // Asegura que el tipo de dato sea flotante
  description: 'Indice_Multiamenaza_Calculado',
  assetId: 'users/tu_usuario/Indice_Multiamenaza_Calculado', // Cambia a tu ruta de Asset
  scale: 1000, // Define la resolución de salida en metros (ajusta según tus necesidades)
  region: regionDeInteres, // Define la región de exportación
  maxPixels: 1e13 // Permite exportaciones grandes
});

// También se puede exportar a Google Drive
Export.image.toDrive({
  image: indice_multiamenaza.toFloat(),
  description: 'Indice_Multiamenaza_Drive',
  folder: 'GEE_Exports', // Nombre de la carpeta en tu Google Drive
  fileNamePrefix: 'indice_multiamenaza',
  scale: 1000,
  region: regionDeInteres,
  maxPixels: 1e13
});
*/
