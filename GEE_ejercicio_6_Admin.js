//División administrativa
//var admin = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM0');//Pais
//var admin = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM1');//Departamento
//var admin = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM2');//Municipio

Map.setCenter(-100.0, 38.5, 4);

var styleParams = {
  fillColor: 'b5ffb4',
  color: '00909F',
  width: 1.0,
};
admin = admin.style(styleParams);
Map.addLayer(admin, {}, 'ADM2 Boundaries');