let env = (window.location.hostname === "joeycrash135.github.io") ? 'live' : 'local';
let STFCMap;
STFCMap = (function() {
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
            let path = window.location.pathname; //get the path
            let index = path.lastIndexOf("/"); //get the index of the last text
            let result = path.substr(index + 1); //pluck the last bit of text
            if(result === '' || path === '/') {
                path = getUrlParameter('s');
            }
            if(snapMode) {
                $("body").addClass("fixed-size");
                $("#map-wrapper").addClass("fixed-size");
                $("#map").addClass("fixed-size");
                $(".leaflet-top").hide();
            }
            return result || path;
        },
        systemNameToID = function(sysname) {
            //scan for an name and return relevant ID
            let cleanedname = cleanName(sysname);
            let sys = galaxy[cleanedname];
            if(sys !== undefined) {
                if(sys.hasOwnProperty('systemID')) {
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

    //popup for leaflet
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
    const maxZoom = 4;
    let startingCoords = xy(-4979, -1853); //kepler-018, center

    //containers
    let galaxy = {}; //contains all systems information.
    let layers = {}; //contains all layer groups, for easy access
    let baseLayers; //the maps group
    let layerControl; //the layerControl object itself. filled with controlLayers
    let controlLayers; //this gets set with all the menu layers and then gets added into layerControl
    let systemIds = {}; //holds the [id:name] key:values for easy searching - systemIds[2038174376] = Rosec
    let systemNames = []; //holds all the system names for typeahead
    let cleanedNames = []; //holds all the cleaned system names for quick validation of search input
    let systemNodes = {}; //holds the system nodes all events get bound to. (events on nodes)
    let systemPopups = {}; //holds the system popups

    let systemsGroup = []; //temp array to hold the system nodes for layerControl (layers.systems)
    let minesGroup = {}; //temp array to hold the system nodes for layerControl (layers.systems)
    let icons; //icons
    let iconsLoaded = false;//will flag true once loaded

    //debugger/editor assistance
    let showLayer = {
        'systems': true,
        'paths': false,
        'grid': false,
        'shipTypes': false,
        'editor': false
    };
    let activeSystem;
    let startOnSystem = undefined; //the systemID or name to focus on (grabbed from URL)
    let snapMode = false;
    let showDetail = false;
    let map;

    let init = function() {
        //use custom crs if needed, for now we skip
        let canvas = false;
        /** Forces snapshot view for screenshots: crops width, removes ui **/
        snapMode = getUrlParameter('snap') === '1';


        if(snapMode) {
            canvas = true;
            console.log("render set to canvas mode");
        }


        map = L.map('map', {
            //crs: crs,
            crs: L.CRS.Simple,
            zoomControl: true,
            minZoom: minZoom,
            maxZoom: maxZoom,
            zoomDelta: 0.5,
            zoomSnap: 0.5,
            /*wheelPxPerZoomLevel: 100,*/
            maxBoundsViscosity: 1.0,
            preferCanvas: canvas
        }).on('load', function() {
            window.status = 'maploaded';
            //console.log("win status", window.status);
        });

        //hash = new L.Hash(map); //todo? generate hash urls
        let systemsJson = "assets/json/systems.json";
        let iconsJson = "assets/json/icons.json";
        //initial systems load
        loadFile(iconsJson, initIcons); //load the icons
        loadFile(systemsJson, initSystems);

        /** RASTER LOADER **/
        let myRenderer = L.canvas({padding: 0.5});
        layers["Map"] = L.imageOverlay('./assets/baked-map.png', bounds, {id: 'wall-grid', renderer: myRenderer}); //background image
        layers.Map.addTo(map);

        /** VECTOR LOADER - OPTION B (NOT AVAILABLE YET)**/
        /*let travelPathsJson = "assets/json/travel-paths.geojson";
        let fedJson = "assets/json/fed-territory.geojson";
        let augJson = "assets/json/aug-territory.geojson";
        let kliJson = "assets/json/kli-territory.geojson";
        let romJson = "assets/json/rom-territory.geojson";
        loadFile(travelPathsJson, initTerritory);
        loadFile(fedJson, initTerritory);
        loadFile(augJson, initTerritory);
        loadFile(kliJson, initTerritory);
        loadFile(romJson, initTerritory);
        L.imageOverlay('assets/nopaths-map-optimized.png', bounds, {id: 'wall-grid'}).addTo(map);
        */
    };

    let initTerritory = function(geoJson) {
        L.geoJSON(geoJson).addTo(map);
    }

    let initSystems = function(_galaxy) {
        //ensure icons are loaded before starting
        console.log("icons loaded? ", iconsLoaded);
        if(iconsLoaded === false) {
            setTimeout(function() {
                initSystems(_galaxy)
            }, 500);
            return false;
        }

        console.log("initSystems");
        systemsGroup = [];
        minesGroup = {};
        let systems = _galaxy.features[0];
        let count = systems.length;
        for (let i = 0; i < count; i++) {
            let system = systems[i];
            let properties = system.properties;
            let name = properties.name;
            let cleaned = cleanName(properties.name);
            let id = properties.systemID;
            let sysNode = makeSystemNode(system);
            //sysNode.addTo(map);
            let yx = system.geometry.coordinates;
            //cache data for later
            sysNode.on("click", function() {
                flyToSystem(cleaned, true);
            }); //allow flyto on clicked system
            systemIds[id] = name;
            systemNodes[cleaned] = sysNode;
            galaxy[cleaned] = properties;
            galaxy[cleaned].yx = yx;
            systemsGroup.push(sysNode); //add a system node to the layergroup
            let mines = properties.mines;
            setMines(yx, mines, minesGroup); //set the mines object
            //let cleaned = properties.name.toString(); // todo setup with cleanName function and maybe a key/val pair with full name.
            systemNames.push(name); //holds all the system names for typeahead
            cleanedNames.push(cleaned); //holds all the system names for typeahead
        }
        initMap();

    };

    let initMap = function() {
        map.attributionControl.setPrefix(setAttributions());

        /*layers["Map"] = L.tileLayer('assets/tiles/{z}/{x}/{y}.png', {
            minZoom: 0,
            maxZoom: 22,
            tms: false
        })*/


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
            if(id === undefined) {
                cleanIdentifier = systemIDToName(cleanIdentifier);
                if(cleanIdentifier === undefined) {
                    startOnSystem = cleanName('Kepler-018');
                    tmpZoom = 2;
                } else {
                    startOnSystem = cleanName(cleanIdentifier);
                    flyTo = true;
                }
            } else {
                flyTo = true;
            }
            console.log("IS GALAXY SET", galaxy, startOnSystem);
            startingCoords = galaxy[startOnSystem].yx;

            showDetail = getUrlParameter('detail') === '1';
            if(showDetail) {
                console.log("details of", galaxy[startOnSystem]);
                //$("<div></div>").addClass("detail")
            }

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

        console.log("check", typeof STFCUI, typeof STFCUI === undefined, typeof STFCUI === 'undefined');
        if(typeof STFCUI !== 'undefined') {
            STFCUI.init(map);
        }
        zoomUIUpdate();

    };

    let zoomUIUpdate = function() {
        let zoom = map.getZoom();
        //todo restore later, checking to ensure tiles work
        //toggleSystems(zoom);
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
        let cleaned = cleanName(sysName);
        let sysLabel = sysName + ' (' + properties.systemLevel + ')';
        let popupTemplate = makeSystemPopup(properties);
        let radius = properties.radius !== undefined && properties.radius !== '' ? parseInt(properties.radius) : 3;
        let node = makeCircle(coords, {className: 'system ' + cleanName(sysName), id: sysName, radius: radius, color: 'white', fillOpacity: 1, stroke: true})
            .bindTooltip(sysLabel, {permanent: true, direction: 'right', offset: [2, -2], className: 'system-label'});
        let popup = node.bindPopup(popupTemplate, {maxWidth: "auto"});
        systemNodes[cleaned] = node; //cache the node for events
        systemPopups[cleaned] = popup; //cache the popup for events
        //console.log("sysName", sysName);
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
        iconsLoaded = true;
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
                let options = {icon: iconObj, interactive: false};
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

    let flyToSystem = function(system, openPopup) {
        if(system === activeSystem) {
            return false;
        }
        console.log("wanna fly", system);
        let sys;
        if(system === undefined) {
            sys = $("#fly-to").val();
        } else {
            sys = system;
        }
        sys = cleanName(sys);
        if(galaxy[sys] === undefined) return false;

        let yx = galaxy[sys].yx
        map.flyTo(yx);
        activeSystem = sys;
        if(openPopup) {

            map.once('moveend', function() {
                console.log("I finished moving");
                console.log("open popup");
                systemPopups[sys].openPopup();
            })
        }
    };

    let makeSystemPopup = function(p) {
        console.log("makeSystemPopup", p);
        let popupClass;
        let name = p.name[0].toUpperCase() + p.name.slice(1) || ''; //capitalize 1st letter
        let systemLevel = p.systemLevel || '';
        let id = p.systemID || '';
        let warpRequired = p.warpRequired || 'N/A';
        //zone setup
        let zone = p.zone.toUpperCase() || '';
        let event = p.event.toUpperCase() || '';
        switch (zone) {
            case "INDEPENDENT":
                popupClass = (event === 'SWARM') ? 'swa' : 'ind';
                break;
            case "FEDERATION":
                popupClass = 'fed';
                break;
            case "KLINGON":
                popupClass = 'kli';
                break;
            case "ROMULAN":
                popupClass = 'rom';
                break;
            case "AUGMENT":
                popupClass = 'aug';
                break;
        }
        if(event !== '') event = '- ' + event;
        //console.log("icons", icons.mines);
        //mines setup
        let mines = p.mines;
        let mineSize = p.mineSize > 0 ? ` <code>(${p.mineSize})</code>` : '';
        let minesArr = p.mines.split(",");
        let minesHTML = '';
        if(mines !== 'undefined' && mines !== 'None' && mines !== '') {
            for (let index in minesArr) {
                if(minesArr.hasOwnProperty(index)) {
                    let nodeType = minesArr[index].trim();
                    let iconUrl = icons.mines[nodeType].options.iconUrl;
                    let img = `
                    <div class="tooltip">
                        <img class="node-icon" src="${iconUrl}" />
                      <span class="tooltiptext">${nodeType}</span>
                    </div>
                    `;
                    minesHTML += img;
                    if(!icons.mines[minesArr[index].trim()].options.iconUrl) {
                        console.warn("need to check, why no options?", name, nodeType, icons.mines[nodeType]);
                    }
                }
            }
        }
        mines = minesHTML || '';

        let shipTypes = p.shipTypes;
        let shipTypesArr = p.shipTypes.split(",");
        let shipTypesHTML = '';
        if(shipTypes !== 'undefined' && shipTypes !== 'None' && shipTypes !== '') {
            for (let index in shipTypesArr) {
                if(shipTypesArr.hasOwnProperty(index)) {
                    let nodeType = shipTypesArr[index].trim();
                    let iconUrl = icons.ship_types[nodeType].options.iconUrl;
                    let img = `
                    <div class="tooltip">
                        <img class="ship-icon" src="${iconUrl}" />
                      <span class="tooltiptext">${nodeType}</span>
                    </div>
                    `;
                    shipTypesHTML += img;
                    if(!iconUrl) {
                        console.warn("need to check, why no options?", name, nodeType, iconUrl);
                    }
                }
            }
        }
        shipTypes = shipTypesHTML || '';

        let planets = p.planets;
        let shipLevel = p.shipLevel;
        let hostiles = p.hostiles || '';
        let stationHub = p.stationHub;
        //<div>Station Hubs: ${stationHub}</div>
        let divOpen = `<div class='popup-${popupClass}'>`;
        let divClose = "</div>";
        let info =
            `<div id="system-zone">${zone} <span id="system-event">${event}</span> </div>
             <div id="system-name">${name} [${systemLevel}]</div>
             <div id="system-id"><span>S:</span>${id}</div>
             <div class="system-detail-panel">
                 <div><span>Hostiles:</span> <code>${hostiles}</code> </div>
                 <div><span>Level Range:</span> <code>${shipLevel}</code></div>
                 <div class="half-size">
                     <div><span>Hostile Types:</span></div>
                     <div>${shipTypes}</div>
                 </div>
                 <div class="half-size">
                     <div><span>Mines:</span>${mineSize}</div>
                     <div>${mines}</div>
                 </div> 
             </div>
            `;
        /*let name = p.name;
        let id = p.systemID;
        let systemLevel = p.systemLevel;
        let faction = p.faction;
        let hostiles = p.hostiles;
        let icon = p.icon;
        let linkedSystems = p.linkedSystems;




        let zone = p.zone;

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
        let img = "<img src='" + domain + "assets/img/" + cleanedName + ".png' width='175px' />";*/
        return divOpen + info + divClose;
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
        let discLink = "<a href='https://discord.gg/fKThyH2' title='STFC Pro Official'>";
        let close = "</a>";
        let serverInfo = '[16] Solari'; //info.serverInfo
        let mapName = 'Star Trek Fleet Command Galaxy Map'; //info.mapName
        let version = '1.2'; //info.version
        let author = 'joeycrash135'; //info.author
        return mapLink + mapName + close + " v" + version + "<br>" + "By: " + authLink + author + close + " Server: " + serverInfo + "<br>" + discLink + "STFC Pro Discord" + close;
    };


    let highlightSearch = function() {
        console.log('buttonClicked');
        //show search

    }

    return { //public interface
        init: function() {
            init();
        },
        //
        getMap: function() {
            return map;
        },
        getSystemNames: function() {
            return systemNames;
        },
        getCleanedNames: function() {
            return cleanedNames;
        },
        getSystemNodes: function() {
            return systemNodes;
        },
        getGalaxy: function() {
            return galaxy;
        },
        flyToSystem: function(system, openPopup) {
            flyToSystem(system, openPopup);
        },
        // utils
        xy: function(x, y) {
            return xy(x, y);
        },
        strToArray: function(s) {
            return strToArray(s);
        },
        arrToStr: function(a) {
            return arrToStr(a);
        },
        copyToClipboard: function(c) {
            return copyToClipboard(c);
        },
        isNumeric: function(s) {
            return isNumeric(s);
        },
        cleanName: function(name) {
            return cleanName(name);
        },
        getUrlParameter: function(name) {
            return getUrlParameter(name);
        },
        getStringFromURL: function() {
            return getStringFromURL();
        },
        systemNameToID: function(sysname) {
            return systemNameToID(sysname);
        },
        systemIDToName: function(sysID) {
            return systemIDToName(sysID);
        }
    };
})();
