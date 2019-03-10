let env = (window.location.hostname === "joeycrash135.github.io") ? 'live' : 'local';
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
    }, /**
     * takes an array and turns into a string representation
     * @param a
     * @returns {s}
     */
    arrToStr = function(a) {
        return a.join(", ") || "";
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
    },
    /**
     * check if the string has any digits included.
     * @string s = the string to check.
     */
    isNumeric = function(s) {
        return s.toString().match(/\d+/g);
    };

    //set the map boundaries, coordinates, zoom, coords
    let map;
    const xMin = -6458;
    const xWidth = 4100;
    const xMax = xMin+xWidth;
    const yMin = 1462;
    const yWidth = 3700;
    const yMax = yMin-yWidth;
    const bounds = [xy(xMin, yMin), xy(xMax, yMax)];
    const startingZoom = 1;
    const minZoom = -3;
    const maxZoom = 7;
    let startingCoords = xy(-4979, -1853);
    //containers
    let galaxy = {}; //contains all systems information.
    let pathLatLngs = {}; //contains the paths coordinates
    //let pathKeys = {}; //contains the internal leaflet id's for easy access. -- pathKeys[uniquePathName] = matching _leaflet_id
    let pathRefs = {}; //holds the actual path references, access just like pathKeys (may remove later)
    let icons; //icons
    let layers = {}; //contains all layer groups, for easy access
    let baseMaps; //the maps group
    let layerControl; //the controls group
    let controlLayers; //holds the menu object, update this when removing paths
    let skippedSystems = []; //contains a list of systems without coordinates
    let systemNames = []; //holds all the system names for typeahead
    let systemTokens = []; //holds system names in a tag format for typeahead
    let systemNodes = {}; //holds the system nodes events get bound to.
    //debugger/editor assistance
    let showLayer = {
        'systems': true,
        'paths': true,
        'grid': true,
        'shipTypes': true,
        'editor': true
    };
    let saveEnabled = true; //disable saving of changes to the db
    let debugMode = (env === 'local'); //auto start debug mode locally
    let editorLoaded = false; //enables extra functionality for map management
    let startOnSystem;
    //let reloadOnChange = false;

    let tmpSystem; //system while moving.
    let tmpPath; //temporary paths for draw
    let attributions; //shameless promotions

    let init = function() {
        //console.log("STFC map init");
        //create the map
        map = L.map('map', {
            crs: L.CRS.Simple,
            minZoom: minZoom,
            maxZoom: maxZoom,
            zoomSnap: 0.5,
            zoomDelta: 0.5,
            maxBounds: bounds,
            maxBoundsViscosity: 1.0,
            preferCanvas: true,
        });
        let galaxyFile = (env === 'live') ? "assets/json/galaxy.json" : 'resources/db-json.php'; //only works for me, for now...
        loadFile(galaxyFile, initMapData); //load the galaxy and extra info
        loadFile("assets/json/icons.json", initIcons); //load the icons

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
    /*let initGalaxy = function(g) {
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
    };*/
    let initGalaxy = function(g) {
        for (let i in g) {
            let sys = g[i];
            let name = sys.Name;
            let x = sys.X;
            let y = sys.Y;
            let adjX = sys.AdjX;
            let adjY = sys.AdjY;
            let gotCoords = false;

            if(isNumeric(x) && isNumeric(y)) {
                sys["yx"] = xy(x, y);
                sys["Coordinates"] = x + ", " + y;
                gotCoords = true;
            }

            if(isNumeric(adjX) && isNumeric(adjY)) {
                sys["yx"] = xy(adjX, adjY);
                gotCoords = true;
            }

            if(!gotCoords) {
                skippedSystems.push(sys);
            } else {
                galaxy[name] = sys;
                let linkedSysObject = {"id": sys.id, "name": name, "faction": sys.Zone};
                systemTokens.push(linkedSysObject);
                systemNames.push(name);
            }
        }

        initMap();
    };
    let initMap = function() {
        //console.log("initMap");
        //set boundaries and load map img
        //layers["Map"] = L.imageOverlay('assets/wall_grid1024x128.png', bounds, {id: 'wall-grid', attribution: attributions});
        //layers["Map"] = L.imageOverlay('assets/wall_grid.png', bounds, {id: 'wall-grid', attribution: attributions});
        layers["Map"] = L.imageOverlay('assets/mapped-grid.png', bounds, {id: 'wall-grid', attribution: attributions});

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
                setTravelPathsToGroup(systemKey, linkedSystems, pathLatLngs); //setup the linked systems paths
                setPathsWithKey(pathLatLngs, pathsGroup); //add the path to the index & map
                setMines(sys["yx"], mines, minesGroup); //set the mines object
            }
        }

        if(debugMode) {
            layers["DebugLines"] = makeDebugLines();
            layers["DebugPoints"] = makeDebugPoints();
        }

        //setup all the groups separately to keep reference.
        layers["Paths"] = L.featureGroup(pathsGroup);
        layers["Grid"] = makeGridLines(); //grid lines are 50 spaced until I figure out the correct spacing. think in coordinates, not pixels
        layers["System"] = L.layerGroup(systemsGroup); //group the systems
        layers["Mines"] = {}; //start this empty to add in the groups later
        for (let resource in minesGroup) {
            if(minesGroup.hasOwnProperty(resource)) layers.Mines[resource] = L.layerGroup(minesGroup[resource]); //group the mines by key
        }

        if(startOnSystem === undefined){
            startOnSystem = localStorage.getItem('startOnSystem');
            if(startOnSystem === null || startOnSystem === ''){
                startOnSystem = "Kepler-018"; //start around the middle if the user hadn't visited a system before.
            }
        }

        startingCoords = galaxy[startOnSystem].yx;

        map.layers = layers;
        map.setView(startingCoords, startingZoom);

        layers.Map.addTo(map);

        //temp flags for limiting features while developing
        if(showLayer.grid) layers.Grid.addTo(map);
        if(showLayer.paths) layers.Paths.addTo(map);
        if(showLayer.systems) layers.System.addTo(map);

        setControlLayer();
        initTypeahead();
        initFlyToSystem();

        if(debugMode) {
            initLinkedSystemsTags(); //load tagging
            //addLegend();
            initBringNearSystem();
            initClearPathsFromSystem();
            map.on('click', onMapClick);
            map.on("contextmenu", function() {
                return false;
            });
        }
        //addLegend(); //maybe later, try icons in controllayer 1st.
        //set events
    };
    let setGroups = function(layers) {
        //let resourceNames = Object.keys(layers);
        let groups = {};
        for (let name in layers) {
            if(layers.hasOwnProperty(name)) groups[name] = layers[name];
        }
        return groups;
    };
    let setControlLayer = function() {
        if(layerControl) layerControl.remove();
        baseMaps = {
            "Map": layers.Map
        };
        controlLayers = {
            "Base": {
                "Grid": layers.Grid,
                "System": layers.System,
                "Travel Paths": layers.Paths
            },
            "Mines": setGroups(layers["Mines"])
        };
        if(debugMode) {
            controlLayers["Debug"] = {"Grid": layers["DebugLines"], "Points": layers["DebugPoints"]}
        }
        layerControl = L.control.groupedLayers(baseMaps, controlLayers, {groupCheckboxes: true});
        layerControl.addTo(map);
    };
    let setTravelPathsToGroup = function(systemName, linkedSystems, pathContainer) {
        //console.log("linkedSystems are", linkedSystems);
        let linked = strToArray(linkedSystems); //make array of linked systems
        for (let i in linked) {
            if(linked.hasOwnProperty(i)) {
                let nameA = systemName; //the current system name
                let nameB = linked[i]; //one of the linked system's name
                if(galaxy[nameA] === undefined || galaxy[nameB] === undefined) return true;
                //console.log("check A", nameA, galaxy[nameA], galaxy[nameA] !== undefined);
                //console.log("check B", nameB, galaxy[nameB], galaxy[nameB] !== undefined);
                let A = galaxy[nameA].yx; //get the latLngs made earlier.
                let B = galaxy[nameB].yx; //get the latLngs made earlier.
                let key = makePathKey(nameA, nameB); //concat the names into a unique key
                pathContainer[key] = [A, B]; //store the path latLngs in the container
                //console.log("setting Path", "a:",nameA, "b:",nameB, "key",key);
            }
        }
    };
    let setPathsWithKey = function(paths, pathsGroup, options) {
        //let myRenderer = L.canvas({ padding: 0.5 });
        for (let label in paths) {
            if(paths.hasOwnProperty(label)) {
                pathRefs[label] = makeLine(paths[label], options || {color: "blue", className: "line " + label, id: label});
                pathsGroup.push(pathRefs[label]);
            }
        }
    };
    let createPath = function(paths, opts) {
        let arr = [];
        for (let pathKey in paths) {
            if(paths.hasOwnProperty(pathKey)) {
                arr.push(paths[pathKey]);
            }
        }
        if(opts === undefined) opts = {className: 'line', weight: 1, opacity: 0.5};
        console.log("createPath", paths, opts, opts === undefined);
        return L.polyline(arr, opts);//return the new path
    };
    let setMines = function(yx, mines, group) {
        if(mines === "None") return false;
        if(group === undefined || group.length > 1) {
            console.warn("setMines expects the group to be defined, but empty. Make sure you are passing in a container object");
        }
        mines = strToArray(mines);
        for (let resourceKey in mines) {
            if(mines.hasOwnProperty(resourceKey)) {
                let resource = mines[resourceKey];
                let iconObj = icons.Mines[resource];
                let options = {icon: iconObj};
                if(!group.hasOwnProperty(resource)) group[resource] = []; //init the resource group if its not an array
                group[resource].push(makeMarker(yx, options));
            }
        }
    };
    let makeSystemNode = function(sys) {
        //let sys = systemData;
        let template = makeSystemPopup(sys);
        let name = sys["Name"];
        let isPrimarySystem = sys["Primary System"] === "Yes";
        let iconKey = isPrimarySystem ? "Primary" : "System";
        let icon = icons.Systems[iconKey];
        let opts = {icon: icon, draggable: debugMode, id: sys["Name"]};
        let node = makeMarker(sys.yx, opts).bindTooltip(sys["Name"]);
        if(debugMode) {
            initSystemDebugMode(node);
            map.on("contextmenu", destroyTmpPath);
            node.on("mouseup", testClicks);
        }

        node.bindPopup(template);

        systemNodes[name] = node;
        return node;
    };
    let makeMarker = function(yx, options) {
        return L.marker(yx, options);
    };
    let makeLine = function(yx, options) {
        return L.polyline(yx, options);
    };
    let makeGroup = function(group) {
        return L.layerGroup(group);
    };
    let testClicks = function(e) {
        let which = e.originalEvent.which;
        if(which === 1) {
            if(tmpSystem !== undefined) {
                destroyTmpPath();
                return false;
            } else {
                let sysName = e.sourceTarget.options.id;
                let leafID = e.sourceTarget._leaflet_id;
                console.log("left clicked - open system editor", e, sysName, leafID);
                console.log("clicked galaxy data", galaxy[sysName]);

                localStorage.setItem("startOnSystem", sysName); //save the last selected system to local storage to pick up where left off
            }
        } else if(which === 2) {
            let name = e.sourceTarget.options.id;
            console.log("mid clicked - Clear Adj Coordinates", e);
            console.log("name", name);
            saveAdjXY(name, '', '');
        } else if(which === 3) {
            console.log("right clicked - makePath", e);
            generateTmpPath(e);
        }
        return false;
    };
    let onMapClick = function(e) {
        //console.clear();
        if(tmpPath !== undefined) {
            console.log("cancelling path", e);
            destroyTmpPath();
        }
        console.log("You clicked the map at x:", e.latlng.lng, "y:", e.latlng.lat);
    };

    /*let addLegend = function() {
        var legend = L.control({position: 'bottomright'});
        legend.onAdd = function(map) {
            var div = L.DomUtil.create('div', 'Legend');
            div.innerHTML = getDebugPanel();
            return div;
        };
        legend.addTo(map);
    };*/
    /*let getDebugPanel = function(){
        let panel = $("<div class=''></div>");
        let input = "<input id='fly-to'></input>";
        let submit = `<button class="btn btn-default" id="fly-to-system">FlyTo</button>`;
        return panel.html();
    };*/

    let initTypeahead = function(){
        let sysNames = new Bloodhound({
            datumTokenizer: Bloodhound.tokenizers.whitespace,
            queryTokenizer: Bloodhound.tokenizers.whitespace,
            local: systemNames
        });
        sysNames.initialize();
        $('.typeahead').typeahead({
                hint: true,
                highlight: true,
                minLength: 1
            },
            {
                name: 'systems',
                source: sysNames.ttAdapter()
            });
    };
    let initFlyToSystem = function(){
        $('#fly-to').on('keypress',function(e) {
                if(e.which === 13) {
                    flyToSystem();
                }
            });
        $("body").on('keydown',function(e) {
            //console.log("pressed something", e);
            let fly = $('#fly-to');
            let moveSys = $('#move-this-system');

            //console.log("is tab?", e.keyCode === 9, fly.is(":focus"));
            if(e.keyCode === 9) {
                if(!fly.is(":focus") && !moveSys.is(":focus")){
                    e.preventDefault();
                    fly.val("");
                    fly.focus();
                }
            }
        });

        $("#fly-to-system").on("click", function(){
            flyToSystem();
        });
    };
    let flyToSystem = function(system){
        let sys;
        if(system === undefined){
            sys = $("#fly-to").val();
        }else{
            sys = system;
        }
        if(galaxy[sys] === undefined) return false;
        console.log("flying to", sys, galaxy);
        console.log("check sys", galaxy[sys]);
        let yx = galaxy[sys].yx;
        map.flyTo(yx);
        systemNodes[sys].openTooltip();
    };
    let initBringNearSystem = function(){
        $('#bring-to-system').on('click', function(){
            bringNearSystem();
        });
    };
    let initClearPathsFromSystem = function(){
        $("#clear-linked-system").on("click", function(){
            let system = $("#clear-linked").val();
            if(system === '') return false;
            clearSystemLinkedPaths(system);
        });
    };
    let clearSystemLinkedPaths = function(system){
        let mainSysLinks = galaxy[system]["Linked Systems"];
        let linkedArr = strToArray(mainSysLinks);
        let updatedSystemNames = [system]; //hold the names that got updated, starting with the main system
        for(let i in linkedArr){
            let linkedSysName = linkedArr[i];
            let linkedSysInfo = galaxy[linkedSysName]["Linked Systems"];
            let linkedSysArr = strToArray(linkedSysInfo);
            let hasLink = linkedSysArr.indexOf(system);
            if(hasLink >= 0){
                let pathKey = makePathKey(system, linkedSysName);
                removePathAndRefresh(pathKey);
                linkedSysArr.splice(hasLink, 1);
                galaxy[linkedSysName]["Linked Systems"] = arrToStr(linkedSysArr); //update the linked system string
                updatedSystemNames.push(linkedSysName);
            }
        }
        galaxy[system]["Linked Systems"] = ''; //remove all entries from main system
        saveLinkedSystemsToDb(updatedSystemNames);
    };
    let bringNearSystem = function(){
        let move = $('#move-this-system').val();
        let near = $('#near-this-system').val();
        if(move === '' || near === '') return false;
        if(move === near) return false;
        //get near coords
        let nearCoords = galaxy[near].yx;
        let x = nearCoords.lng + Math.floor(Math.random() * 51) - 25;
        let y = nearCoords.lat + Math.floor(Math.random() * 51) - 25;
        let newCoords = xy(x,y);
        console.log("move", move, "near", near);
        console.log("x", y, "y", y, "new", newCoords);
        console.log("nearCoords", nearCoords);

        systemNodes[move].setLatLng(newCoords);
        galaxy[move].yx = newCoords;
        flyToSystem(move);
    };

    let makeSystemPopup = function(sys) {
        let adjustedCoords = '';
        let divOpen = "<div>";
        let divClose = "</div>";
        if(isNumeric(sys["AdjX"]) && isNumeric(sys["AdjY"])) {
            adjustedCoords = `Override Coords: ${sys["AdjX"]}, ${sys["AdjY"]}`;
        }
        let info = `${sys["Name"]} [${sys["System Level"]}]
        <br>System ${sys["SystemID"]}: ${sys["Coordinates"]}
        <br>Faction: ${sys["Faction"]}
        <br>Hostiles: ${sys["Hostiles"]}
        <br>Hostiles Range: ${sys["Ship Levels"]}
        <br>Ship Types: ${sys["Ship Type"]}
        <br>Warp Range: ${sys["Warp Required"]}
        <br>Mines: ${sys["Mines"]}
        <br>Station Hubs: ${sys["Station Hub"]}
        <br>Linked Systems: ${sys["Linked Systems"]}
        <br>` + adjustedCoords;
        let cleanedName = cleanName(sys["Name"]);
        //let editButton = debugMode ? makeEditButton() : '';
        let editButton =  makeEditButton();
        let domain = (env === 'live') ? 'https://raw.githubusercontent.com/joeycrash135/stfc-galaxy-map/master/' : '';
        let img = "<img src='" + domain + "assets/img/" + cleanedName + ".png' width='175px' />";
        return divOpen + img + divClose + divOpen + info + divClose + divOpen + editButton + divClose;
    };
    let cleanName = function(name) {
        return name.replace(/[^a-zA-Z]/, "").replace(/\s+/, "").toLowerCase();
    };
    let makeGridLines = function(spacing) {
        let lines = [];
        let xOffset = 0;
        let yOffset = 50;
        let x = xMin + xOffset;
        let y = yMin + yOffset;
        let _spacing = spacing || 50; //define the spacing between lines
        if(_spacing < 1) _spacing = 1; //lines will not spread if spacing is set to 0
        //let myRenderer = L.canvas({ padding: 0.5 });
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

    let loadFile = function(file, callback) {
        $.getJSON(file, function() {
            //console.log("loading " + file);
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
        let shoutoutMyAlliance = "Pit Vipers [VIP]";
        let close = "</a>";
        return mapLink + data.name + close + " v" + data.version + "<br>" + "By: " + authLink + data.author + close + " Alliance:" + shoutoutMyAlliance;
    };

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    ///////   LAYER MANAGEMENT   ///////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    let removePathAndRefresh = function(pathKey){
        let removeRef = pathRefs[pathKey];
        if(layers.Paths.hasLayer(removeRef)){
            delete pathLatLngs[pathKey];
            layers.Paths.removeFrom(map);
        }
        let newPathsGroup = [];
        setPathsWithKey(pathLatLngs, newPathsGroup);
        layers.Paths = L.featureGroup(newPathsGroup);
        layers.Paths.addTo(map);
        setControlLayer();
    };

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    ///////   MAP EDITOR   /////////////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    let initSystemDebugMode = function(node) {
        let oldPaths = []; //placeholder paths for old lines
        let oldPathsGroup = []; //old paths group made from old paths
        let linkedSystems; //linked systems names
        let linkedSystemNames; //linked systems names array
        let linkedKeys; //names of travel path keys attached to system
        let linkCoords = []; //hold the coordinates of linked systems
        let movePathsGroup = []; //temp paths of linked systems while moving
        let _movePaths = []; //temp paths of linked systems while moving
        let moveCount = 0;
        let draggedSystemName;

        node.on("dragstart", function(e) {
            draggedSystemName = e.target.options.id;
            console.warn("dragstart", e, movePathsGroup);
            let node = galaxy[draggedSystemName];
            linkedSystems = node["Linked Systems"];
            console.log("node linked drag", linkedSystems);
            if(linkedSystems) {
                //add an old line to the map
                let options = {className: "oldLine", color: 'yellow', weight: 1, opacity: 1};
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
                        console.log("debugme", systemName, galaxy[systemName]);
                        let yx = galaxy[systemName].yx; //grab the yx to save
                        linkCoords.push(yx); //save just the latLng to reattach later
                    }
                }
            }
        });

        node.on("drag", function(e) {
            //console.log("node moving", e);
            map.removeLayer(movePathsGroup);
            let draggedyx = e.latlng; //get the moving coords
            let options = {className: "tmpLine", color: 'green', weight: 2, opacity: 1};
            _movePaths = []; //movePaths group
            for (let i in linkCoords) {
                let tmpPath = makeLine([draggedyx, linkCoords[i]], options); //make a temp line
                _movePaths.push(tmpPath);  //add to movePathsGroup
            }
            movePathsGroup = makeGroup(_movePaths);
            movePathsGroup.addTo(map); //convert to pathGroup and add to map
        });

        node.on("dragend", function(e) {
            console.log("end", e);
            let nodeID = e.target["_leaflet_id"];
            let endX = Math.round(e.target._latlng.lng);
            let endY = Math.round(e.target._latlng.lat);
            //update the galaxy node for the map reload
            galaxy[draggedSystemName]["Coordinates"] = endX + ", " + endY;
            galaxy[draggedSystemName]["x"] = endX;
            galaxy[draggedSystemName]["y"] = endY;
            galaxy[draggedSystemName]["yx"] = xy(endX, endY);
            layers["System"].getLayer(nodeID).setLatLng(xy(endX, endY));

            movePathsGroup.clearLayers();
            map.removeLayer(oldPathsGroup);
            map.removeLayer(movePathsGroup);
            $(".tmpLines").remove();
            //console.log("check movePaths empty", movePathsGroup);
            //console.log("see map", map);

            if(linkedSystems) {
            //rewrite changed path latLngs
                for (let name in linkedSystemNames) {
                    if(linkedSystemNames.hasOwnProperty(name)) {
                        let A = linkedSystemNames[name];
                        let B = draggedSystemName;
                        updateLinkedSystemsInfo(A, B);
                        let yx = galaxy[A].yx; //grab the yx to save
                        let yx2 = xy(endX, endY); //new yx
                        let pathKey = makePathKey(A, B);
                        pathLatLngs[pathKey] = [yx, yx2];
                    }
                }

                //layers["System"].getLayer(nodeID).moveTo(galaxy[draggedSystemName]["yx"]);
                systemNodes[draggedSystemName].setLatLng(galaxy[draggedSystemName]["yx"]);
                //remove all the paths
                layers.Paths.remove();
                let newPathsGroup = [];
                setPathsWithKey(pathLatLngs, newPathsGroup);
                layers.Paths = makeGroup(newPathsGroup);
                layers.Paths.addTo(map);
                setControlLayer();
                //copyToClipboard(galaxy[draggedSystemName]);
            }

            //save updated coordinates to db
            if(debugMode && env === 'local'){
                let systemName = e.target.options.id;
                //console.log("SAVING XY", nodeID, systemName, endX, endY);
                saveAdjXY(systemName, endX, endY);
            }

        });
    };

    //Cartography Helper (local editor stuff) - NOT AVAILABLE ON LIVE JUST YET
    let initLinkedSystemsTags = function() {
        console.log("init tags");
        let sysTokens = new Bloodhound({
            datumTokenizer: Bloodhound.tokenizers.obj.whitespace('name'),
            queryTokenizer: Bloodhound.tokenizers.whitespace,
            local: systemTokens
        });
        sysTokens.initialize();
        let elt = $('#LinkedSystems', 'body');
        elt.tagsinput({
            tagClass: function(item) {
                switch (item.faction) {
                    case 'INDEPENDENT'   :
                        return 'badge badge-secondary';
                    case 'FEDERATION'  :
                        return 'badge badge-primary';
                    case 'KLINGON':
                        return 'badge badge-danger';
                    case 'ROMULAN'   :
                        return 'badge badge-success';
                }
            },
            itemValue: 'id',
            itemText: 'name',
            typeaheadjs: {
                name: 'name',
                displayKey: 'name',
                source: sysTokens.ttAdapter()
            }
        });
        console.log("thisgal", galaxy);
        $(".twitter-typeahead").css('display', 'inline');
    };
    let generateTmpPath = function(e) {
        let clickedSystemName = e.sourceTarget.options.id;
        let yx;
        //let options = {className: "tmpPath", color: 'orange', weight: 1, opacity: .6};
        if(tmpSystem === undefined) {
            //if not defined, start a temp path
            tmpSystem = clickedSystemName;
            yx = galaxy[clickedSystemName].yx;
            //tmpPath = makeLine([yx, xy(-2626,-20)], options);
            //tmpPath.addTo(map);
            console.log("system", galaxy[clickedSystemName]);
            map.on("mousemove", updateTmpPath);
            return false;
        } else if(tmpSystem === clickedSystemName) {
            //if the same system was clicked, cancel the path
            console.log("clicked same system, cancelling line.");
        } else {
            //if tmpSystem is defined and clickedSystem is different, make a real path
            makeNewPathAndUpdateSystems(tmpSystem, clickedSystemName);
            updateLinkedSystemsInfo(tmpSystem, clickedSystemName);
        }
        destroyTmpPath();
    };
    let updateLinkedSystemsInfo = function(A, B) {
        if(galaxy[A] === undefined || galaxy[B] === undefined) return false;
        let linkedA = galaxy[A]["Linked Systems"];
        let linkedB = galaxy[B]["Linked Systems"];
        let arrA = strToArray(linkedA);
        let arrB = strToArray(linkedB);
        arrB.push(A);
        arrA.push(B);
        galaxy[A]["Linked Systems"] = arrToStr(unique(arrA));
        galaxy[B]["Linked Systems"] = arrToStr(unique(arrB));

        function unique(a) {
            return $.grep(a, function(e, i) {
                return i === $.inArray(e, a);
            });
        }
        console.warn("updating Linked sys (", A, ") - (", B,")");
        if(debugMode && env === 'local'){
            let updatedSysNames = [A,B];
            saveLinkedSystemsToDb(updatedSysNames);
        }
    };

    let makeNewPathAndUpdateSystems = function(A, B) {
        let yx = galaxy[A].yx; //grab the yx to save
        let yx2 = galaxy[B].yx; //new yx
        let pathKey = makePathKey(A, B); //make unique path name
        pathLatLngs[pathKey] = [yx, yx2]; //update the paths with the correct latlng
        pathRefs[pathKey] = pathLatLngs[pathKey]; //update the pathRef
        let newPath = makeLine(pathLatLngs[pathKey], {color: "teal", className: "line " + pathKey, id: pathKey});
        newPath.addTo(layers.Paths);
    };
    let destroyTmpPath = function() {
        if(map.hasLayer(tmpPath)) {
            tmpPath.removeFrom(map);
            tmpSystem = tmpPath = undefined;
            map.off("mousemove", updateTmpPath);
        }
        return false;
    };
    let updateTmpPath = function(e) {
        if(map.hasLayer(tmpPath)) tmpPath.removeFrom(map);
        let sysYX = galaxy[tmpSystem].yx;
        let mouseYX = e.latlng;
        let options = {className: "tmpPath", color: 'orange', weight: 1, opacity: .6};
        tmpPath = makeLine([sysYX, mouseYX], options);
        tmpPath.addTo(map);
    };

    //override multiselect chooser
    $('option').mousedown(function(e) {
        e.preventDefault();
        $(this).toggleClass('selected');
        $(this).prop('selected', !$(this).prop('selected'));
        return false;
    });

    let makeEditButton = function() {
        if(!showLayer['editor']) return '';
        return '<button type="button" class="btn btn-warning" data-toggle="modal" data-target="#edit-system-data">Edit</button>'
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
    let getSystemLinkedPathKeys = function(system, linkedSystems) {
        let keys = [];
        let linked = (!Array.isArray(linkedSystems)) ? strToArray(linkedSystems) : linkedSystems;
        for (let i in linked) {
            if(linked.hasOwnProperty(i)) {
                let nameA = system;
                let nameB = linked[i];
                let line = makePathKey(nameA, nameB);
                keys.push(line);
            }
        }
        return keys;
    };

    //update system data
    let saveAdjXY = function(system, adjX, adjY){
        if(!saveEnabled) return false;
        console.log("saveAdjXY");
        let sysData = galaxy[system];
        let data = {id:sysData.id, AdjX:adjX, AdjY:adjY};
        $.ajax({
            url: "resources/update-adj-coords.php",
            type: "POST",
            data: data,
            dataType: "html",
            cache: false,
            success: function(data) {
                console.log("success saving adjusted XY", data);
                //if(reloadOnChange) location.reload();
            },
            error: function(xhr, ajaxOptions, thrownError) {
                console.warn("saveAdjXY", xhr.status + " -- " + thrownError);
            }
        });
        //console.warn("saveAdjXY", data);
    };
    let saveLinkedSystemsToDb = function(systems){
        if(!saveEnabled) return false;
        console.log("saveLinkedSystemsToDb");
        let data = {};
        if(typeof systems === 'string') systems = strToArray(systems);
        for(let sysIndex in systems){
            if(systems.hasOwnProperty(sysIndex)){
                let sysName = systems[sysIndex];
                let sysData = galaxy[sysName];
                data[sysData.id] = sysData["Linked Systems"];
            }
        }
        $.ajax({
            url: "resources/update-travel-path.php",
            type: "POST",
            data: data,
            dataType: "html",
            cache: false,
            success: function(data) {
                console.log("Linked Systems update success", data);
            },
            error: function(xhr, ajaxOptions, thrownError) {
                console.warn("saveLinkedSystemsToDb", xhr.status + " -- " + thrownError);
            }
        });
        //console.warn("saving data", data);
    };

    $('#local-update-submit').on("click", function(e) {
        if(!saveEnabled) return false;
        let data = {};
        $.ajax({
            url: "resources/update-system-data.php",
            type: "POST",
            data: data,
            dataType: "html",
            cache: false,
            success: function(data) {
                let r = $.parseJSON(data);
                console.log(e, r);
            },
            error: function(xhr, ajaxOptions, thrownError) {
                console.warn("#local-update-submit click event", xhr.status + " -- " + thrownError);
            }
        });
    });


    return { // public interface
        init: function() {
            init();
        }
    };
})();
STFCmap.init();