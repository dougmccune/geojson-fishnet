var extent = require('geojson-extent');
var turf = require('turf');
var progress = require('progress');
var clipper = require("clipper-lib");

module.exports.square = square;
module.exports.hexagon = hexagon;
module.exports.triangle = triangle;
module.exports.intersect = intersect;
module.exports.difference = difference;

function square(geojson, targetDivisions, callback) {
	fishnet(geojson, targetDivisions, turf.squareGrid, callback);
}

function hexagon(geojson, targetDivisions, callback) {
	fishnet(geojson, targetDivisions, turf.hexGrid, callback);
}

function triangle(geojson, targetDivisions, callback) {
	fishnet(geojson, targetDivisions, turf.triangleGrid, callback);
}

function fishnet(geojsonA, targetDivisions, fishnetFunc, callback) {

	alert = console.log;

	var bbox = geojsonA.bbox;

	if(bbox == null) {
		bbox = extent(geojsonA);
	}

	var maxSide = Math.max(Math.abs(bbox[1] - bbox[0]), Math.abs(bbox[3] - bbox[2]));

	var geojsonB = fishnetFunc(bbox, maxSide/(targetDivisions*10), 'degrees');

	var bar = new progress(
		'fishnetting ' + geojsonA.features.length + ' features into ' + geojsonB.features.length + ' cells [:bar] :percent (:eta seconds remaining)', 
		{ 
			width:20, 
			incomplete: ' ', 
			complete: '=', 
			total: geojsonB.features.length * geojsonA.features.length 
		});

	var result = intersect(geojsonA, geojsonB, function() { bar.tick() });

	callback(null, result);
}

function intersect(geojsonA, geojsonB, progressCallback) {
	var scale = 200000;

	var newFeatures = [];

	geojsonB.features.forEach(function(bFeature) {
	
		var bPoly = convertFeatureToClipperPoly(bFeature, scale);
		
		geojsonA.features.forEach(function(aFeature) {
			
			if(progressCallback)
				progressCallback();

			var aPoly = convertFeatureToClipperPoly(aFeature, scale);

			var clipperProcess = new clipper.Clipper();

			clipperProcess.AddPaths(aPoly, clipper.PolyType.ptSubject, true);
			clipperProcess.AddPaths(bPoly, clipper.PolyType.ptClip, true);

			var solution_polytree = new clipper.PolyTree();

			clipperProcess.Execute(clipper.ClipType.ctIntersection, solution_polytree, clipper.PolyFillType.pftNonZero, clipper.PolyFillType.pftNonZero);

			var solution_expolygons = clipper.JS.PolyTreeToExPolygons(solution_polytree);
			
			solution_expolygons.forEach(function(exPoly) {
				var newFeature = convertClipperExPolyToFeature(exPoly, aFeature.properties, scale);
				newFeatures.push(newFeature);
			});

		});
	});

	return turf.featurecollection(newFeatures);
}


function difference(geojsonA, geojsonB) {
	var scale = 300000;

	var newFeatures = [];

	geojsonA.features.forEach(function(aFeature) {

		var aPoly = convertFeatureToClipperPoly(aFeature, scale);

		var clipperProcess = new clipper.Clipper();
		clipperProcess.AddPaths(aPoly, clipper.PolyType.ptSubject, true);


		geojsonB.features.forEach(function(bFeature) {
			var bPoly = convertFeatureToClipperPoly(bFeature, scale);
			clipperProcess.AddPaths(bPoly, clipper.PolyType.ptClip, true);
		});

		var solution_polytree = new clipper.PolyTree();

		clipperProcess.Execute(clipper.ClipType.ctDifference, solution_polytree, clipper.PolyFillType.pftNonZero, clipper.PolyFillType.pftNonZero);

		var solution_expolygons = clipper.JS.PolyTreeToExPolygons(solution_polytree);
	
		solution_expolygons.forEach(function(exPoly) {
			var newFeature = convertClipperExPolyToFeature(exPoly, aFeature.properties, scale);
			newFeatures.push(newFeature);
		});
	});


	return turf.featurecollection(newFeatures);
}

function convertFeatureToClipperPoly(feature, scale) {
		
    var clipperPoly = feature.geometry.coordinates.map(function(coords) {
    	var points = coords.map(function(coord) {
    		return {X: coord[0] , Y:coord[1] };
    	});

    	return points;
    });

    clipper.JS.ScaleUpPaths(clipperPoly, scale);
    
    return clipperPoly;
}

function convertClipperExPolyToFeature(exPoly, props, scale) {
	
	var allPolys = [exPoly.outer].concat(exPoly.holes);

	var rings = allPolys.map(function(poly) {
					
		var coords = poly.map(function(polyCoord) { 
			return [polyCoord.X/scale, polyCoord.Y/scale]
		});

		coords.push([coords[0][0], coords[0][1]]);

		return coords;
	});

	return turf.polygon(rings, props);
}


