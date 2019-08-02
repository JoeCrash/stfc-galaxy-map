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
        /*makePathKey = function(a, b) {
            function clean(val) {
                return val.toLowerCase().replace(/\s/g, '').replace("'", '')
            }
            a = clean(a);
            b = clean(b);
            return (a > b) ? b + a : a + b
        },*/
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
        },
        cleanName = function(name) {
            return name.replace(/[^a-zA-Z0-9]/, "").replace(/\s+/, "").toLowerCase();
        },
        getUrlParameter = function(name) {
            name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
            let regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
            let results = regex.exec(location.search);
            return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
        },
        getStringFromURL = function() {
            let path = window.location.pathname;
            if(path === undefined || path === '/'){
                path = getUrlParameter('s');
            }
            if(snapMode){
                $("body").addClass("fixed-size");
                $("#map-wrapper").addClass("fixed-size");
                $("#map").addClass("fixed-size");
                $(".leaflet-top").hide();
            }
            console.log("path output", path);
            return cleanName(path);
        },
        systemNameToID = function(sysname) {
            //scan for an name and return relevant ID
            let cleanedname = cleanName(sysname);
            let sys = galaxy[cleanedname];
            if(sys !== undefined){
                if(sys.hasOwnProperty('systemID')){
                    return sys.systemID;
                }
            }
            return undefined;
        },
        systemIDToName = function(sysID) {
            //scan for an name and return relevant ID
            let cleanedID = cleanName(sysID);
            return systemIds[cleanedID];
        };

    L.Map = L.Map.extend({
        openPopup: function(popup) {
            this._popup = popup;
            return this.addLayer(popup).fire('popupopen', {
                popup: this._popup
            });
        }
    });

    //parameters to adjust
    const xMin = -6458;
    const xWidth = 4100;
    const xMax = xMin + xWidth;
    const yMin = 1462;
    const yHeight = 3700;
    const yMax = yMin - yHeight;
    const bounds = [xy(xMin, yMin), xy(xMax, yMax)];
    const startingZoom = 1.5;
    const minZoom = -2;
    const maxZoom = 6;
    let startingCoords = xy(-4979, -1853);

    //containers
    let galaxy = {}; //contains all systems information.
    let layers = {}; //contains all layer groups, for easy access
    let baseLayers; //the maps group
    let layerControl; //the layerControl object itself. filled with controlLayers
    let controlLayers; //this gets set with all the menu layers and then gets added into layerControl
    let systemIds = {}; //holds the systemname/id key values for easy searching (id/name combination)
    let systemNodes = {}; //holds the system nodes all events get bound to. (events on nodes)
    let systemPopups = {}; //holds the system popups, since they won't load via url.
    let systemnames = []; //holds all the system names for typeahead (simple array with just the names)
    let systemTokens = []; //holds system names in a tag format for typeahead (typeahead tags formatted object)
    let systemsGroup = []; //temp array to hold the system nodes for layerControl (layers.systems)
    let minesGroup = {}; //temp array to hold the system nodes for layerControl (layers.systems)
    let icons; //icons

    //debugger/editor assistance
    let showLayer = {
        'systems': true,
        'paths': false,
        'grid': false,
        'shipTypes': false,
        'editor': false
    };

    let startOnSystem = undefined; //the systemID or name to focus on (grabbed from URL)
    let snapMode = false;
    let map;

    let init = function() {
        //use custom crs if needed, for now we skip
        let canvas = false;
        snapMode = getUrlParameter('snap') === '1';
        if(snapMode){
            canvas = true;
            console.log("render set to canvas mode");
        }
        map = L.map('map', {
            //crs: crs,
            crs: L.CRS.Simple,
            zoomControl: true,
            minZoom: minZoom,
            maxZoom: maxZoom,
            zoomSnap: 0.5,
            zoomDelta: 0.5,
            wheelPxPerZoomLevel: 100,
            maxBoundsViscosity: 1.0,
            preferCanvas: canvas
        }).on('load', function(){
            window.status = 'maploaded';
            //console.log("win status", window.status);
        });

        //hash = new L.Hash(map); //todo? generate hash urls
        let systemsJson = "assets/json/systems.json";
        let iconsJson = "assets/json/icons.json";
        //initial systems load
        loadFile(iconsJson, initIcons); //load the icons
        loadFile(systemsJson, initSystems);
    };

    let initSystems = function(_galaxy) {
        systemsGroup = [];
        minesGroup = {};
        let systems = _galaxy.features[0];
        let count = systems.length;
        for (let i = 0; i < count; i++) {
            let system = systems[i];
            let properties = system.properties;
            let name = cleanName(properties.name);
            let id = properties.systemID;
            let sysNode = makeSystemNode(system);
            //sysNode.addTo(map);
            let yx = system.geometry.coordinates;
            //cache data for later
            sysNode.on("click", function(){flyToSystem(name)}); //allow flyto on clicked system
            systemIds[id] = name;
            systemNodes[name] = sysNode;
            galaxy[name] = properties;
            galaxy[name].yx = yx;
            systemsGroup.push(sysNode); //add a system node to the layergroup

            let mines = properties.mines;
            setMines(yx, mines, minesGroup); //set the mines object
        }
        initMap();
    };

    let initMap = function() {
        map.attributionControl.setPrefix(setAttributions());
        let myRenderer = L.canvas({ padding: 0.5 });

        layers["Map"] = L.imageOverlay('assets/baked-map.gif', bounds, {id: 'wall-grid', renderer:myRenderer}); //background image
        layers.Map.addTo(map);

        toggleSystemLabel(map.getZoom()); //set text visibility

        //attach events
        map.on("zoomend", function() {
            zoomUIUpdate();
        });

        startOnSystem = cleanName(getStringFromURL());
        let flyTo = false;
        let tmpZoom = startingZoom;
        if(startOnSystem !== undefined) {
            let cleanIdentifier = cleanName(startOnSystem);
            let id = systemNameToID(cleanIdentifier);
            if(id === undefined){
                cleanIdentifier = systemIDToName(cleanIdentifier);
                if(cleanIdentifier === undefined){
                    startOnSystem = cleanName('Kepler-018');
                    tmpZoom = 2;
                }else{
                    startOnSystem = cleanIdentifier;
                    flyTo = true;
                }
            }else{
                flyTo = true;
            }
            startingCoords = galaxy[startOnSystem].yx;
        }
        map.setView(startingCoords, tmpZoom);
        if(flyTo) flyToSystem(startOnSystem, true);

        layers.System = L.layerGroup(systemsGroup);
        layers.System.addTo(map);
        layers.mines = {}; //start this empty to add in the groups later

        //convert each mine type into its own layerGroup
        for (let resource in minesGroup) {
            if(minesGroup.hasOwnProperty(resource)) layers.mines[resource] = L.layerGroup(minesGroup[resource]); //group the mines by key
        }

        if(layerControl) layerControl.remove();
        baseLayers = {
            "Map": layers.Map
        };
        controlLayers = {
            "Mines": setGroups(layers.mines)
        };
        layerControl = L.control.groupedLayers(null, controlLayers, {groupCheckboxes: true, /*exclusiveGroups: ["Mines"]*/});
        //layerControl = L.control.layers(null, controlLayers, {groupCheckboxes: true});
        layerControl.addTo(map);

        zoomUIUpdate();

    };

    let zoomUIUpdate = function(){
        let zoom = map.getZoom();
        toggleSystems(zoom);
        toggleSystemLabel(zoom);
        //toggleTravelPaths(zoom); //unused for now, travel paths may be added later.
        console.log("zoom", zoom);
    };

    let toggleSystems = function(zoom) {
        if(zoom < 1) {
            $(".system").css("visibility", "hidden");
        } else {
            $(".system").css("visibility", "visible");
        }
    };

    let toggleSystemLabel = function(zoom) {
        if(zoom < 1.5) {
            $(".leaflet-tooltip").css("visibility", "hidden");
        } else {
            $(".leaflet-tooltip").css("visibility", "visible");
        }
    };

    let makeSystemNode = function(sys) {
        //todo style the systems with radius and icon
        let coords = sys.geometry.coordinates;
        let properties = sys.properties;
        let sysName = properties.name;
        let sysLabel = sysName + ' (' + properties.systemLevel + ')';
        let popupTemplate = makeSystemPopup(properties);
        let radius = properties.radius !== undefined && properties.radius !== '' ? parseInt(properties.radius) : 3;
        let node = makeCircle(coords, {className:'system '+cleanName(sysName), id: sysName, radius: radius, color: 'white', fillOpacity: 1, stroke: true})
            .bindTooltip(sysLabel, {permanent: true, direction: 'right', offset: [2, -2], className: 'system-label'});
        let popup = node.bindPopup(popupTemplate);
        systemNodes[sysName] = node; //cache the node for events
        systemPopups[sysName] = popup; //cache the popup for events
        return node;
    };
    let initIcons = function(iconsData) {
        //console.log("loading icons");
        icons = {};
        for (let type in iconsData) {
            if(iconsData.hasOwnProperty(type)) {
                if(icons[type] === undefined) icons[type] = {};
                for (let objKey in iconsData[type]) {
                    //console.log("init icons", objKey);
                    if(iconsData[type].hasOwnProperty(objKey)) {
                        icons[type][objKey] = new L.Icon(iconsData[type][objKey]);
                    }
                }
            }
        }
    };

    let setGroups = function(layers) {
        //filters out internal properties
        let groups = {};
        for (let name in layers) {
            if(layers.hasOwnProperty(name)) groups[name] = layers[name];
        }
        return groups;
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
                let iconObj = icons.mines[resource];
                let options = {icon: iconObj, interactive:false};
                if(!group.hasOwnProperty(resource)) group[resource] = []; //init the resource group if its not an array
                group[resource].push(makeMarker(yx, options));
            }
        }
    };

    let makeCircle = function(yx, options) {
        return L.circle(yx, options);
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

    /* To be added later */
    let initTypeahead = function() {
        let sysNames = new Bloodhound({
            datumTokenizer: Bloodhound.tokenizers.whitespace,
            queryTokenizer: Bloodhound.tokenizers.whitespace,
            local: systemnames
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
    let initFlyToSystem = function() {
        $('#fly-to').on('keypress', function(e) {
            if(e.which === 13) {
                flyToSystem();
            }
        });
        $("body").on('keydown', function(e) {
            //console.log("pressed something", e);
            let fly = $('#fly-to');
            let moveSys = $('#move-this-system');

            //console.log("is tab?", e.keyCode === 9, fly.is(":focus"));
            if(e.keyCode === 9) {
                if(!fly.is(":focus") && !moveSys.is(":focus")) {
                    e.preventDefault();
                    fly.val("");
                    fly.focus();
                }
            }
        });

        $("#fly-to-system").on("click", function(e) {
            flyToSystem();
            //e.stopPropagation();
            //e.preventDefault();
        });
    };
    let flyToSystem = function(system, openPopup) {
        let sys;
        if(system === undefined) {
            sys = $("#fly-to").val();
        } else {
            sys = system;
        }
        if(galaxy[sys] === undefined) return false;
        console.log("flying to", sys, system);
        let yx = galaxy[sys].yx;
        map.panTo(yx, 2);
        //console.log("openPopup", openPopup);
        if(openPopup) {
            console.log('sys', sys);
            console.log('sysnode', systemNodes[sys]);
            console.log('popups', systemPopups[sys]);
            //[sys];
            //systemNodes[sys];
        }else{
            console.log("openPopupNO", openPopup);
        }
    };
    /*let initBringNearSystem = function() {
        $('#bring-to-system').on('click', function() {
            bringNearSystem();
        });
    };*/
    /*let initClearPathsFromSystem = function() {
        $("#clear-linked-system").on("click", function() {
            let system = $("#clear-linked").val();
            if(system === '') return false;
            clearSystemLinkedPaths(system);
        });
    };*/
    /*let clearSystemLinkedPaths = function(system) {
        let mainSysLinks = galaxy[system]["Linked Systems"];
        let linkedArr = strToArray(mainSysLinks);
        let updatedSystemnames = [system]; //hold the names that got updated, starting with the main system
        for (let i in linkedArr) {
            let linkedSysname = linkedArr[i];
            let linkedSysInfo = galaxy[linkedSysname]["Linked Systems"];
            let linkedSysArr = strToArray(linkedSysInfo);
            let hasLink = linkedSysArr.indexOf(system);
            if(hasLink >= 0) {
                let pathKey = makePathKey(system, linkedSysname);
                removePathAndRefresh(pathKey);
                linkedSysArr.splice(hasLink, 1);
                galaxy[linkedSysname]["Linked Systems"] = arrToStr(linkedSysArr); //update the linked system string
                updatedSystemnames.push(linkedSysname);
            }
        }
        galaxy[system]["Linked Systems"] = ''; //remove all entries from main system
        saveLinkedSystemsToDb(updatedSystemnames);
    };*/
    /*let bringNearSystem = function() {
        let move = $('#move-this-system').val();
        let near = $('#near-this-system').val();
        if(move === '' || near === '') return false;
        if(move === near) return false;
        //get near coords
        let nearCoords = galaxy[near].yx;
        let x = nearCoords.lng + Math.floor(Math.random() * 51) - 25;
        let y = nearCoords.lat + Math.floor(Math.random() * 51) - 25;
        let newCoords = xy(x, y);
        console.log("move", move, "near", near);
        console.log("x", y, "y", y, "new", newCoords);
        console.log("nearCoords", nearCoords);

        systemNodes[move].setLatLng(newCoords);
        galaxy[move].yx = newCoords;
        flyToSystem(move);
    };*/

    let makeSystemPopup = function(p) {
        let name = p.name;
        let id = p.systemID;
        let systemLevel = p.systemLevel;
        let faction = p.faction;
        let hostiles = p.hostiles;
        let icon = p.icon;
        let linkedSystems = p.linkedSystems;
        let mines = p.mines;
        let planets = p.planets;
        let shipLevel = p.shipLevel;
        let shipTypes = p.shipTypes;
        let stationHub = p.stationHub;
        let warpRequired = p.warpRequired;
        let zone = p.zone;
        let divOpen = "<div>";
        let divClose = "</div>";
        let info = ` 
        <br>System: ${name} [${systemLevel}]
        <br>ID: ${id}
        <br>Faction: ${faction}
        <br>Hostiles: ${hostiles}
        <br>Hostiles Range: ${shipLevel}
        <br>Ship Types: ${shipTypes}
        <br>Warp Range: ${warpRequired}
        <br>Mines: ${mines}
        <br>Station Hubs: ${stationHub}
        <br>Linked Systems: ${linkedSystems}`;
        let cleanedName = cleanName(p["name"]);
        let domain = '';
        let img = "<img src='" + domain + "assets/img/" + cleanedName + ".png' width='175px' />";
        return  divOpen + info + divClose + divOpen + divClose;
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
    let setAttributions = function(info) {
        let mapLink = "<a href='https://stfcpro.com' title='Star Trek Fleet Command Galaxy Map'>";
        let authLink = "<a href='https://github.com/joeycrash135/' title='joeycrash135 @ Github'>";
        let close = "</a>";
        let serverInfo = '[16] Solari'; //info.serverInfo
        let mapName = 'Star Trek Fleet Command Galaxy Map'; //info.mapName
        let version = '1.1'; //info.version
        let author = 'joeycrash135'; //info.author
        return mapLink + mapName + close + " v" + version + "<br>" + "By: " + authLink + author + close + " Server: " + serverInfo;
    };

    return { // public interface
        init: function() {
            init();
        }
    };


})();
STFCmap.init();