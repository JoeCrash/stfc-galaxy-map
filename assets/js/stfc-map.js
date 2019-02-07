let STFCmap;
STFCmap = (function() {
    //helpers
    /**
     * converts x,y coordinates into y,x LatLng object for leaflet
     * @param x = xCoordinate
     * @param y = yCoordinate
     * @returns {LatLng}
     */
    const xy = function(x, y) {
            let n = L.latLng;
            return L.Util.isArray(x) ? n(x[1], x[0]) : n(y, x)
        },
        /**
         * takes a comma separated string and converts to array
         * @param s
         * @returns {Array}
         */
        strToArray = function(s) {
            return s.split(",").reduce((t, s) => ((s = s.trim()).length > 0 && t.push(s), t), [])
        },
        /**
         * cleans, sorts alphabetically, concatenates into 1 string
         * @string a - first value
         * @string b = second value
         * @returns {string}, alpha sorted, cleaned and concatenated
         */
        makePathKey = function(a, b) {
            function clean(val) {
                return val.toLowerCase().replace(/\s/g, '').replace("'", '')
            }

            a = clean(a);
            b = clean(b);
            return (a > b) ? b + a : a + b
        },
        /**
         * copies output to the clipboard for pasting elsewhere. It does not work with objects containing non-string values.
         * @string c = the content you want to copy.
         */
        copyToClipboard = function(c) {
            let e = JSON.stringify(c), n = $("<input>").val(e).appendTo("body").select();
            document.execCommand("copy"), n.remove()
        };

    //set the map boundaries, coordinates, zoom, coords
    let map;
    const xMin = -8000;
    const yMin = 2000;
    const xMax = -2000;
    const yMax = -2000;
    const startingZoom = 0;
    const minZoom = -3;
    const maxZoom = 7;
    let startingCoords = xy(-2878, 13);

    //containers
    let galaxy = {}; //contains all systems information.
    let paths = {}; //contains the paths coordinates
    let pathKeys = {}; //contains the internal leaflet id's for easy access.
    let pathRefs = {};
    let icons; //icons
    let layers = {}; //contains all layer groups, for easy access
    let baseMaps; //the maps group
    let layerControl; //the controls group
    let controlLayers; //holds the menu object, update this when removing paths
    let skippedSystems = []; //contains a list of systems without coordinates

    //draw/edit mode
    let debugMode = true;
    let testLine;

    //shameless promotions
    let attributions;

    let init = function() {
        console.log("STFC map init");
        //create the map
        map = L.map('map', {
            crs: L.CRS.Simple,
            minZoom: minZoom,
            maxZoom: maxZoom,
            zoomSnap: 0.5,
            zoomDelta: 0.5
        });

        loadFile("assets/json/map.json", initMapData);
        loadFile("assets/json/icons.json", initIcons);
    };

    let initIcons = function(iconsData) {
        icons = {};
        for (let type in iconsData) {
            if(iconsData.hasOwnProperty(type)) {
                if(icons[type] === undefined) icons[type] = {};
                for (let objKey in iconsData[type]) {
                    if(iconsData[type].hasOwnProperty(objKey)) {
                        icons[type][objKey] = new L.Icon(iconsData[type][objKey]);
                    }
                }
            }
        }
    };

    let initMapData = function(data) {
        attributions = setAttributions(data["info"]);
        initGalaxy(data["galaxy"]);
    };

    let initGalaxy = function(g) {
        for (let i in g) {
            let sys = g[i];
            let name = sys.Name;
            let coord = sys.Coordinates.split(",");
            if(coord[0] !== "" && coord[1] !== "") {
                let x = coord[0].trim();
                let y = coord[1].trim();
                //set the data to the galaxy obj
                sys["x"] = x;
                sys["y"] = y;
                sys["yx"] = xy(x, y);
                galaxy[name] = sys;
            } else {
                skippedSystems.push(name);
            }
        }
        initMap();
    };

    let initMap = function() {
        console.log("initMap");
        //set boundaries and load map img
        let bounds = [xy(xMin, yMin), xy(xMax, yMax)];
        layers["Map"] = L.imageOverlay('assets/wall_grid.png', bounds, {id: 'wall-grid', attribution: attributions});

        //setup the groupArrays
        let systemsGroup = [];
        let pathsGroup = [];
        let minesGroup = {}; //subcategories, make object instead

        //loop through the galaxy properties
        for (let systemKey in galaxy) {
            if(galaxy.hasOwnProperty(systemKey)) {
                let sys = galaxy[systemKey];
                let mines = sys["Mines"];
                let linkedSystems = sys["Linked Systems"];

                systemsGroup.push(makeSystemNode(sys)); //add a system node
                setTravelPathsToGroup(systemKey, linkedSystems, paths); //setup the linked systems paths
                addPathsWithKey(paths, pathsGroup); //add the path to the index & map
                setMines(sys["yx"], mines, minesGroup); //set the mines object
            }
        }

        if(debugMode) {
            layers["DebugLines"] = makeDebugLines();
            layers["DebugPoints"] = makeDebugPoints();
        }

        //setup all the groups separately to keep reference.
        layers["Paths"] = L.featureGroup(pathsGroup);
        layers["Grid"] = makeGridLines(); //grid lines are 100 spaced until I figure out the correct spacing. think in coordinates, not pixels
        layers["System"] = L.layerGroup(systemsGroup); //group the systems
        layers["Mines"] = {}; //start this empty to add in the groups later
        for(let resource in minesGroup) {
            layers.Mines[resource] = L.layerGroup(minesGroup[resource]); //group the mines by key
        }


        map.layers = layers;
        map.setView(startingCoords, startingZoom);

        layers.Map.addTo(map);
        layers.Grid.addTo(map);
        layers.Paths.addTo(map);
        layers.System.addTo(map);

        setControlLayer();

        //set events
        map.on('click', onMapClick);

    };

    let setGroups = function(layers){
        //let resourceNames = Object.keys(layers);
        let groups = {};
        for(let name in layers){
            groups[name] = layers[name];
        }
        return groups;
    };

    let setControlLayer = function(){
        if(layerControl) layerControl.remove();

        baseMaps = {
            "Map": layers.Grid
        };
        controlLayers = {
            "System": {
                "System": layers.System,
                "Travel Paths": layers.Paths
            },
            "Debug": {
                "Grid": layers["DebugLines"],
                "Points": layers["DebugPoints"]
            },
            "Mines": setGroups(layers["Mines"])
        };


        layerControl = L.control.groupedLayers(baseMaps, controlLayers, {groupCheckboxes: true});
        layerControl.addTo(map);
    };



    let setTravelPathsToGroup = function(systemName, linkedSystems, pathContainer) {
        let linked = strToArray(linkedSystems); //make array of linked systems
        for (let i in linked) {
            if(linked.hasOwnProperty(i)) {
                let nameA = systemName; //the current system name
                let nameB = linked[i]; //one of the linked system's name
                let A = galaxy[nameA].yx; //get the latLngs made earlier.
                let B = galaxy[nameB].yx; //get the latLngs made earlier.
                let key = makePathKey(nameA, nameB); //concat the names into a unique key
                pathContainer[key] = [A, B]; //store the path latLngs in the container
                console.log("setting Path", "a:",nameA, "b:",nameB, "key",key);
            }
        }
    };

    let addPathsWithKey = function(paths, pathsGroup, options){
        for(let label in paths){
            if(paths.hasOwnProperty(label)){
                pathRefs[label] = makeLine(paths[label], options || {color:"blue", className:"line "+label, id:label});
                pathsGroup.push(pathRefs[label]);
            }
        }
    };

    let createPath = function(paths, opts){
        let arr = [];
        for(let pathKey in paths){
            if(paths.hasOwnProperty(pathKey)){
                arr.push(paths[pathKey]);
            }
        }
        if(opts === undefined) opts = {className:'line', weight:1, opacity: 0.5};
        console.log("createPath", paths, opts, opts === undefined);
        return L.polyline(arr, opts);//return the new path

    };

    let setMines = function(yx, mines, group){
        if(mines === "None") return false;
        if(group === undefined || group.length > 1){
            console.warn("setMines expects the group to be defined, but empty. Make sure you are passing in a container object");
        }
        mines = strToArray(mines);
        for(let resourceKey in mines){
            if(mines.hasOwnProperty(resourceKey)){
                let resource = mines[resourceKey];
                let iconObj = icons.Mines[resource];
                let options = {icon: iconObj};
                if(!group.hasOwnProperty(resource)) group[resource] = []; //init the resource group if its not an array
                group[resource].push(makeMarker(yx, options));
            }
        }
    }

    let makeSystemNode = function(sys) {
        //let sys = systemData;
        let template = createSystemPopup(sys);
        let isPrimarySystem = sys["Primary System"] === "Yes";
        let iconKey = "System";
        if(isPrimarySystem) iconKey = "Primary";
        let icon = icons.Systems[iconKey];
        let opts = {icon: icon, draggable: debugMode, id: sys["Name"]};
        let node = makeMarker(sys.yx, opts).bindPopup(template).bindTooltip(sys["Name"]);
        if(debugMode) {
            initSystemDebugMode(node);
        }
        return node;
    };

    let makeMarker = function(yx, options) {
        return L.marker(yx, options);
    };
    let makeLine = function(yx, options) {
        return L.polyline(yx, options);
    };
    let makeGroup = function(group){
        return L.layerGroup(group);
    };

    let createSystemPopup = function(sys) {
        return `${sys["Name"]} [${sys["Planet Level"]}]<br>System ${sys["SystemID"]}: ${sys["Coordinates"]}
    <br>Faction: ${sys["Faction"]}<br>Hostiles: ${sys["Hostiles"]}<br>Hostiles Range: ${sys["Ship Levels"]}
    <br>Ship Types: ${sys["Ship Type"]}<br>Warp Range: ${sys["Warp Required"]}<br>Mines: ${sys["Mines"]}
    <br>Station Hubs: ${sys["Station Hub"]}<br>`;
    };

    let makeGridLines = function(spacing) {
        let lines = [];
        let x = xMin;
        let y = yMin;
        let _spacing = spacing || 100; //define the spacing between lines, both x and y
        if(_spacing < 1) _spacing = 1; //lines will not spread if spacing is set to 0
        let gridLineOptions = {color: 'white', weight: 0.5, opacity: 0.3, className: 'gridLines'};

        while (x <= xMax) {
            lines.push([xy(x, yMin), xy(x, yMax)]); //vertical lines
            x = x + _spacing;
        }
        while (y >= yMax) {
            lines.push([xy(xMin, y), xy(xMax, y)]); //horizontal lines
            y = y - _spacing;
        }

        return makeLine(lines, gridLineOptions);
    };

    let makeDebugPoints = function(spacing) {
        let points = [];
        let x = xMin;
        let y = yMin;
        let _spacing = spacing || 100;
        while (x <= xMax) {
            while (y >= yMax) {
                let point = L.circle(xy(x, y), {radius: 3, opacity: 0.25, color: 'yellow'}).bindPopup("X: " + x + "<br> Y: " + y);
                points.push(point);
                y = y - _spacing;
            }
            x = x + _spacing;
            y = yMin;
        }
        return L.layerGroup(points);
    };

    let makeDebugLines = function() {
        let lines = [];
        let x = xMin, y = yMin;
        let spacing = 5;
        while (x <= xMax) {
            lines.push([xy(x, yMin), xy(x, yMax)]);
            x = x + spacing;
        }
        while (y >= yMax) {
            lines.push([xy(xMin, y), xy(xMax, y)]);
            y = y - spacing;
        }
        return L.polyline(lines, {color: 'green', weight: 1, opacity: 0.75, className: 'debug'});
    };

    let initSystemDebugMode = function(node) {
        let oldPaths = []; //placeholder paths for old lines
        let oldPathsGroup = []; //old paths group made from old paths
        let linkedSystems; //linked systems names
        let linkedSystemNames; //linked systems names array
        let linkedKeys; //names of path keys attached to system
        let linkCoords = []; //hold the coordinates of linked systems
        let movePaths = []; //temp paths while moving
        let moveCount = 0;
        let draggedSystemName;
        node.on("dragstart", function(e) {
            draggedSystemName = e.target.options.id;
            let node = galaxy[draggedSystemName];
            linkedSystems = node["Linked Systems"];
            if(linkedSystems) {
                //add an old line to the map
                let options = {className: "oldLine", color: 'red', weight: 2, opacity: 1};
                linkedKeys = getSystemLinkedPathKeys(draggedSystemName, linkedSystems); //get the unique names of the paths
                linkedSystemNames = strToArray(linkedSystems); //add the linked systems to an array

                setTravelPathsToGroup(draggedSystemName, linkedSystems, oldPaths); //setup the paths coords and drop em in oldPaths
                oldPathsGroup = createPath(oldPaths, options); //make a group from paths
                oldPathsGroup.addTo(map); //add the old lines to maps

                for (let key in linkedKeys) {
                    if(linkedKeys.hasOwnProperty(key)) {
                        let pathName = linkedKeys[key]; //get the unique pathName
                        //let pathToRemove = pathRefs[pathName]; //path ref

                        //console.log("test", pathToRemove);

                        $("." + pathName).remove(); //brute removal, need to remove from map memory also.
                        $(".tmpLine").remove(); //brute removal, need to remove from map memory also.
                    }
                }

                //save the linked coords for tempLines
                for (let name in linkedSystemNames) {
                    if(linkedSystemNames.hasOwnProperty(name)) {
                        let systemName = linkedSystemNames[name];
                        let yx = galaxy[systemName].yx; //grab the yx to save
                        linkCoords.push(yx); //save just the latLng to reattach later
                    }
                }
            }
        });

        node.on("move", function(e) {
            if(moveCount > 0) movePaths.remove(); //clear any movePaths
            moveCount++;
            let draggedyx = e.latlng; //get the moving coords
            let options = {className: "tmpLine", color: 'green', weight: 2, opacity: 1};
            let movePathsGroup = []; //movePaths group
            for (let i in linkCoords) {
                let tmpPath = makeLine([draggedyx, linkCoords[i]], options); //make a temp line
                movePathsGroup.push(tmpPath);  //add to movePathsGroup
            }
            movePaths = makeGroup(movePathsGroup).addTo(map); //convert to pathGroup and add to map
        });

        node.on("dragend", function(e) {
            if(linkedSystems) {
                //reset the count for the next drag
                moveCount = 0;
                //get the new lat/lng
                let endX = Math.round(e.target._latlng.lng);
                let endY = Math.round(e.target._latlng.lat);

                //e.target._latlng.lng = endX;
                //e.target._latlng.lat = endY;

                //remove the drag paths
                oldPathsGroup.removeFrom(map);
                movePaths.removeFrom(map);
                $(".tmpLines").remove();

                //update the galaxy node for the map reload
                galaxy[draggedSystemName]["Coordinates"] = endX + ", " + endY;
                galaxy[draggedSystemName]["x"] = endX;
                galaxy[draggedSystemName]["y"] = endY;
                galaxy[draggedSystemName]["yx"] = xy(endX, endY);

                let nodeID = e.target["_leaflet_id"];

                console.log("paths", paths, galaxy[draggedSystemName].yx);
                console.log("nodeID", nodeID);
                //snap to coordinates
                layers["System"].getLayer(nodeID).setLatLng(xy(endX, endY));

                //rewrite changed path latLngs
                for (let name in linkedSystemNames) {
                    if(linkedSystemNames.hasOwnProperty(name)) {
                        let A = linkedSystemNames[name];
                        let B = draggedSystemName;
                        let yx = galaxy[A].yx; //grab the yx to save
                        let yx2 = xy(endX, endY); //new yx
                        let pathKey = makePathKey(A, B);
                        paths[pathKey] = [yx, yx2];
                    }
                }

                //remove all the paths
                layers.Paths.remove();

                let newPathsGroup = [];
                addPathsWithKey(paths, newPathsGroup);
                let groupLayer = makeGroup(newPathsGroup);
                layers.Paths = groupLayer;
                layers.Paths.addTo(map);
                setControlLayer();

                //set the json to the clipboard
                copyToClipboard(galaxy[draggedSystemName]);
            }
        });
    }

    let getSystemLinkedPathKeys = function(system, linkedSystems){
        let keys = [];
        let linked = (!Array.isArray(linkedSystems)) ? strToArray(linkedSystems) : linkedSystems;
        for(let i in linked){
            if(linked.hasOwnProperty(i)){
                let nameA = system;
                let nameB = linked[i];
                let line = makePathKey(nameA, nameB);
                keys.push(line);
            }
        }
        return keys;
    };

    let toggle = 0;
    let lineID;
    let onMapClick = function(e) {
        //console.clear();
        console.log("You clicked the map at x:", e.latlng.lng, "y:", e.latlng.lat);

    };



    let loadFile = function(file, callback) {
        $.getJSON(file, function() {
            console.log("loading " + file);
        }).done(function(d) {
            callback(d);
        }).fail(function(d) {
            console.warn(file + " had a problem loading. Sorry!");
            console.warn(d);
        }).always(function() {
        });
    };

    let setAttributions = function(data) {
        let mapLink = "<a href='https://joeycrash135.github.io/stfc-galaxy-map/' title='Star Trek Fleet Command Galaxy Map' >";
        let authLink = "<a href='https://github.com/joeycrash135/' title='joeycrash135 @ Github'>";
        let shoutoutMyAlliance = "Viper Elite [VIP]";
        let close = "</a>";
        let attribs = mapLink + data.name + close + " v" + data.version + "<br>" + "By: " + authLink + data.author + close + " Alliance:" + shoutoutMyAlliance;
        return attribs;
    };

    return { // public interface
        init: function() {
            init();
        },
        pathRefs: pathRefs
    };
})();
STFCmap.init();