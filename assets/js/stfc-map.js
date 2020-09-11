let env = (window.location.hostname === "stfcpro.com") ? 'live' : 'dev';
let editOverride = typeof isEditor !== 'undefined';
if(!editOverride) {
    isEditor = false;
}
let STFCMap;
STFCMap = (function() {
    //helpers
    const
        /**
         * takes a comma separated string and converts to array
         * @param s
         * @returns {Array}
         */
        strToArray = function(s) {
            return s.split(",").reduce((t, s) => ((s = s.trim()).length > 0 && t.push(s), t), [])
        },
        /**
         * converts x,y coordinates into y,x LatLng object for leaflet
         * @param x = xCoordinate
         * @param y = yCoordinate
         * @returns {LatLng}
         */
        xy = function(x, y) {
            let n = L.latLng;
            return L.Util.isArray(x) ? n(x[1], x[0]) : n(y, x)
        }, /**
         * takes an array and turns it into a string representation
         * @param a
         * @returns {s}
         */
        arrToStr = function(a) {
            return a.join(", ") || "";
        },
        /**
         * copies output to the clipboard for pasting elsewhere. It does not work with objects containing non-string values.
         * @string c = the content you want to copy.
         */
        copyToClipboard = function(c) {
            let e = JSON.stringify(c), n = $("<input>").val(e).appendTo("body").select();
            document.execCommand("copy");
            n.remove();
        },
        /**
         * check if the string has any digits included.
         * @string s = the string to check.
         */
        isNumeric = function(s) {
            return s.toString().match(/\d+/g);
        },
        /**
         * removes capitalization, spaces and non-alphanumeric symbols
         * @string name = the string to clean.
         * returns {string}
         */
        cleanName = function(name) {
            return name.toString().replace(/[^a-zA-Z0-9]/, "").replace(/\s+/, "").toLowerCase();
        },
        /**
         * grabs a param value from the url
         * @string name = the key to get the value for.
         * returns {results} = the value provided
         */
        getUrlParameter = function(name) {
            name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
            let regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
            let results = regex.exec(location.search);
            return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
        },
        /**
         * grabs the entire param string after the page part of the url
         * @string name = the key to get the value for.
         * returns {results} = the value provided
         */
        getStringFromURL = function() {
            let path = window.location.pathname; //get the path
            let index = path.lastIndexOf("/"); //get the index of the last text
            let result = path.substr(index + 1); //pluck the last bit of text
            if(result === '' || path === '/') {
                path = getUrlParameter('s'); //check if s param was used to pass in a system
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
            let cleanedID = cleanName(sysID);
            return systemIds[cleanedID];
        },
        /**
         * determines the correct angle of rotation from point a to b
         * @string cx, cy = the x and y of point a.
         * @string ex, ey = the x and y of point b.
         * returns {theta2} = the rotation required to aim at point b
         */
        angle = function(cx, cy, ex, ey) {
            const dy = ey - cy;
            const dx = ex - cx;
            let theta = Math.atan2(dy, dx); // range (-PI, PI]
            theta *= 180 / Math.PI; // rads to degs, range (-180, 180]
            let theta2 = (360 + theta) % 360;
            if(theta < 0) theta = 360 + theta; // range [0, 360)
            return theta2;
        };

    //TODO update/restore popup for systems
    /*L.Map = L.Map.extend({
        openPopup: function(popup) {
            console.log("open popup", popup);
            this._popup = popup;
            return this.addLayer(popup).fire('popupopen', {
                popup: this._popup
            });
        }
    });*/
    /*Galaxy button for system view*/
    /*L.Control.GalaxyBtn = L.Control.extend({
        onAdd: function(map) {
            this.img = L.DomUtil.create('img');
            this.img.src = 'assets/img/ui/galaxy-btn.png';
            this.img.style.width = '100px';
            L.DomEvent.addListener(this.img, 'click', this.returnToGalaxy, this);
            //disable pass through clicks and double clicks to map
            this.img.addEventListener("click", function(e) {
                e.stopPropagation();
            });
            return this.img;
        },
        returnToGalaxy: function(e){
            hideSystemMap();
        },
        onRemove: function(map) {
            // Nothing to do here
        }
    });
    L.control.galaxyBtn = function(opts) {
        return new L.Control.GalaxyBtn(opts);
    };*/

    //parameters to adjust
    const xMin = -6357;
    const xWidth = 4400;
    const xMax = xMin + xWidth;
    const yMin = 1764;
    const yHeight = 3700;
    const yMax = yMin - yHeight;
    const bounds = [xy(xMin, yMin), xy(xMax, yMax)];
    const startingZoom = 1.5;
    const minZoom = -1;
    const maxZoom = 4;
    const myRenderer = L.canvas({padding: 0.5});
    //let startingCoords = xy(-4979, -1853); //rator, upper center
    let startingCoords = xy(-4679, -426); //kepler-018, lower center

    //containers
    let galaxy = {}; //contains all systems information.
    let territories = {}; //holds the territory geojson objects for the editor
    let layers = {}; //contains all layer groups, for easy access
    let baseLayers; //the maps group base layers
    let layerControl; //the layerControl object itself. filled with controlLayers
    let controlLayers; //this gets set with all the menu layers and then gets added into layerControl
    let systemIds = {}; //holds the [id:name] key:values for easy searching - systemIds[2038174376] = Rosec
    let systemNames = []; //holds all the system names for typeahead
    let cleanedNames = []; //holds all the cleaned system names for quick validation of search input
    let systemNodes = {}; //holds the system nodes all events get bound to. (events on nodes)
    let systemPopups = {}; //holds the system popups
    let systemCount = 0; //holds the current count of systems added to the map
    let systemsGroup = []; //temp array to hold the system nodes for layerControl (layers.systems)
    let pathsGroup = []; //temp array to hold the path lines for layerControl (layers.paths)
    let basesGroup = []; //temp array to hold the base nodes for layerControl (layers.bases)
    let minesGroup = {}; //temp array to hold the system nodes for layerControl (layers.mines)
    let eventsGroup = {}; //temp array to hold the system nodes for layerControl (layers.events)
    let icons; //all the icons from the json file
    let iconsLoaded = false;//will flag true once loaded
    let pathsLoaded = false;//will flag true once loaded
    let draggableSystems = false; //defaults to false, sets true for editor mode (unavailable on github)
    let activeSystem; //the current system selected
    let startOnSystem = undefined; //the systemID or name to focus on (grabbed from URL)
    let snapMode = false; //picture mode
    let rasterMap = false; //old raster map
    let showDetail = false; //i forgot.
    let canvasMode = false; //draws entire map in canvas for ss
    let drawControl = false; //used in private editor mode, enables leaflet draw controls
    let map; //the galaxy map
    let sysmap; //the system map
    let sysmapGroup; //holds the system markers
    let tacticalMode = false; //upcoming strategic map

    let init = function() {
        //use custom crs if needed, for now we skip
        let canvas = false;
        /** Forces snapshot view for screenshots: crops width, removes ui **/
        snapMode = getUrlParameter('snap') === '1';
        rasterMap = getUrlParameter('raster') === '1';
        //tacticalMode = getUrlParameter('tact') === '1';
        canvasMode = getUrlParameter('canvas') === '1';

        if(snapMode || canvasMode) {
            canvas = true;
            console.warn("Rendering set to canvas");
        }
        map = L.map('map', {
            //crs: crs,
            crs: L.CRS.Simple,
            zoomControl: true,
            zoomAnimation: 0.25,
            minZoom: minZoom,
            maxZoom: maxZoom,
            zoomDelta: 0.25,
            zoomSnap: 0.25,
            /*wheelPxPerZoomLevel: 100,*/
            maxBounds: bounds,
            maxBoundsViscosity: 0.5,
            preferCanvas: canvas,
            drawControl: drawControl,
        }).on('load', function() {
            //if you need to know when the map is finished loading, check window status.
            window.status = 'maploaded';
        }).on('popupopen', function() {
            $('#system-id').click(function(e) {
                let sysName = `${this.dataset.systemName} System`;
                if (sysName.length > 25) {  //game limit on bookmark names
                    sysName = sysName.substring(0, sysName.length - 1) + '…';
                }
                let str = `[${sysName} S:${this.dataset.systemId}]`;
                copyToClipboard(str);
                alert(`Copied "${str}" to the clipboard. Paste it in your game!`);
            });
        });;
        map.setView(startingCoords, startingZoom);
        map.on("zoomend", function() {
            zoomUIUpdate();
        });
        map.on("click", function(e){
            console.log("XY check map", e.latlng);
        });
        map.createPane('hubsystem').style.zIndex = 475;
        map.createPane('hublabel').style.zIndex = 475;
        map.createPane('pathmarker').style.zIndex = 450;
        map.createPane('systems').style.zIndex = 475;
        map.createPane('highlight').style.zIndex = 500;
        map.createPane('events').style.zIndex = 525;
        map.createPane('custommarker').style.zIndex = 650;

        //hash = new L.Hash(map); //todo - generate hash urls
        let systemsJson = "assets/json/systems.geojson"; //the galaxy data is here.
        let iconsJson = "assets/json/icons.json"; //the icon information is here
        let travelPathsJson = "assets/json/travel-paths.geojson";
        let territoriesJson = "assets/json/territories.geojson";

        loadFile(iconsJson, initIcons); //load the icons
        let swarmCloudUrl = 'assets/img/swarm-clouds.png';
        let swarmCloudBounds = [xy(-5185, -592), xy(-4135, -112)];
        L.imageOverlay(swarmCloudUrl, swarmCloudBounds, {opacity: 0.5, renderer:myRenderer, pane:'tilePane'}).addTo(map).bringToFront(); //add the swarm clouds to the map
        let borgCubeUrl = 'assets/img/borg-cube.gif';
        const borgXMin = -5904;
        const borgYMin = -360;
        const borgXMax = borgXMin + 90;
        const borgYMax = borgYMin + 90;
        let borgCubeBounds = [xy(borgXMin, borgYMin), xy(borgXMax, borgYMax)];
        L.imageOverlay(borgCubeUrl, borgCubeBounds, {opacity: 0.7, renderer:myRenderer, pane:'tilePane'}).addTo(map).bringToFront(); //add the swarm clouds to the map
        if(!isEditor) {
            loadFile(territoriesJson, initTerritory);
            loadFile(travelPathsJson, initTravelPaths);
            loadFile(systemsJson, initSystems); //load the systems
        }

    };
    let initTerritory = function(geoJson) {
        console.log("initTerritory");
        return L.geoJson(geoJson, {
            onEachFeature: function(feature, layer) {
                let properties = feature.properties; //bring in the colors and other properties
                //console.log("pt", properties.popupContent);
                properties.className = 'territory'; //give the polygon the className for future use
                properties.pane = 'shadowPane';
                L.geoJSON(feature, properties).addTo(map); //add the territory to the map
            }
        });
    };
    let initTravelPaths = function(geoJson) {
        console.log("initTravelPaths");
        if(iconsLoaded === false) {
            setTimeout(function() {
                initTravelPaths(geoJson);
            }, 500);
            return false;
        }

        L.geoJSON(geoJson, {
            onEachFeature: function(feature, layer) {
                const className = feature.properties.className === '' ? 'path' : feature.properties.className;
                const coords = feature.geometry.coordinates;
                const yx = [xy(coords[0]), xy(coords[1])];
                feature.properties.className = className;
                feature.properties.pane = 'overlayPane';
                //feature.properties.renderer = myRenderer;
                const path = L.polyline(yx, feature.properties);
                pathsGroup.push(path);
                makePathMarker(path);
            }
        });
        pathsLoaded = true;
    };
    let makePathMarker = function(path) {
        const yx = path._latlngs;
        //console.log("path", yx, path);
        const aX = yx[0].lng;
        const aY = yx[0].lat;
        const bX = yx[1].lng;
        const bY = yx[1].lat;
        const pathClass = path.options.className;
        const centerOfLine = getCoordsAlongPath(path, 50);
        let pathIcon;
        let showDirection = false;
        if(pathClass !== '' && pathClass !== 'path') {
            pathIcon = icons.travel_paths[pathClass];
            if(pathClass.includes('transwarp') || pathClass.includes('borg') || pathClass === 'arena') {
                showDirection = true;
            }
        }
        if(showDirection) {
            const _angle = angle(aX, aY, bX, bY) * -1;
            //console.log("center", centerOfLine, "angle", _angle);
            let arrowIcon = L.divIcon({className: 'path-arrow'});
            makeMarker(centerOfLine, {icon: arrowIcon, rotationAngle: _angle, rotationOrigin: 'center center', pane:'pathmarker'}).addTo(map);
        }
        if(pathIcon) makeMarker(centerOfLine, {icon: pathIcon, pane:'pathmarker'}).addTo(map);
    };
    let getCoordsAlongPath = function(pathRef, pct) {
        const latLngs = pathRef._latlngs || pathRef;
        if(!latLngs) {
            console.warn("getCoordsAlongPath() - could not get the latLngs from the path", pathRef);
            return;
        };
        if(pct === undefined) {
            console.warn("getCoordsAlongPath()- must pass in a percentage integer", pct);
            return;
        };
        const _pct = pct * 0.01;
        const ax = latLngs[0].lng, ay = latLngs[0].lat, bx = latLngs[1].lng, by = latLngs[1].lat;
        const xDist = ax > bx ? ax - bx : bx - ax;
        const yDist = ay > by ? ay - by : by - ay;
        const xFinal = ax > bx ? ax - (xDist * _pct) : ax + (xDist * _pct);
        const yFinal = ay > by ? ay - (yDist * _pct) : ay + (yDist * _pct);
        return xy(xFinal, yFinal);
    };
    let getDistance = function(pathRef) {
        const latLngs = pathRef._latlngs || pathRef;
        const ax = latLngs[0].lng, ay = latLngs[0].lat, bx = latLngs[1].lng, by = latLngs[1].lat;
        const xDist = ax > bx ? ax - bx : bx - ax;
        const yDist = ay > by ? ay - by : by - ay;
        const x2 = xDist * xDist;
        const y2 = yDist * yDist;
        return Math.sqrt(x2 + y2);
    };
    let initSystems = function(_galaxy) {
        /*if(pathsLoaded === false) {
            //ensure icons are loaded before starting
            //checks twice a second until loaded.
            setTimeout(function() {
                initSystems(_galaxy)
            }, 500);
            return false;
        }*/
        console.log("initSystems");

        systemsGroup = [];
        basesGroup = [];
        minesGroup = {};
        eventsGroup = {};
        let systems = _galaxy.features;
        let count = systems.length;
        for (let i = 0; i < count; i++) {
            let system = systems[i];
            let properties = system.properties;
            let name = properties.name;
            let event = properties.event;
            let cleaned = cleanName(properties.name);
            let id = properties.systemID;
            let sysNode = makeSystemNode(system);
            let yx = system.geometry.coordinates;
            systemsGroup.push(sysNode);
            //setup the mine markers
            let mines = properties.mines;
            setMines(yx, mines, minesGroup, properties);
            //setup the event markers
            let eventData = {
                swarm: properties.swarm,
                armadas: properties.armadas,
                uncommon: properties.uncommonArmadaRange,
                rare: properties.rareArmadaRange,
                epic: properties.epicArmadaRange,
            };
            setEvents(yx, event, eventsGroup, eventData); //set the events object
            setBases(yx, basesGroup, properties);
            //cache data for later
            systemIds[id] = name;
            systemNodes[cleaned] = sysNode;
            galaxy[cleaned] = properties; //set the properties from the json
            galaxy[cleaned].yx = yx; //append the latLng coordinate
            systemNames.push(name); //store the system name for typeahead
            cleanedNames.push(cleaned); //store the cleaned system name for typeahead
        }
        startOnSystem = cleanName(getStringFromURL());
        let flyTo = false;
        if(startOnSystem !== undefined) {
            let cleanIdentifier = cleanName(startOnSystem);
            let id = systemNameToID(cleanIdentifier);
            if(id === undefined) {
                cleanIdentifier = systemIDToName(cleanIdentifier);
                if(cleanIdentifier === undefined) {
                    startOnSystem = cleanName('Kepler-018'); //defaults to upper center
                } else {
                    startOnSystem = cleanName(cleanIdentifier);
                    flyTo = true;
                }
            } else {
                flyTo = true;
            }

            startingCoords = galaxy[startOnSystem].yx;
            showDetail = getUrlParameter('detail') === '1';
            if(showDetail) {
                console.log("details of", galaxy[startOnSystem]);
            }
        }

        if(flyTo) flyToSystem(startOnSystem, true);
        initMap(); //start the map!
    };
    let setBases = function(yx, group, system) {
        let stationHub = system["stationHub"];
        if(stationHub === 0) return false;
        let iconObj = icons.misc["Station Hub"];
        let options = {icon: iconObj, interactive: false};
        //if(!group.hasOwnProperty(resource)) group[resource] = []; //init the resource group if its not an array
        let marker = makeMarker(yx, options);
        group.push(marker);
    };
    let setMines = function(yx, mines, group, system) {
        if(mines === "None") return false;
        if(group === undefined || group.length > 1) {
            console.warn("setMines expects the group to be defined, but empty. Make sure you are passing in a container object");
        }
        mines = strToArray(mines);
        let offset = 0;

        for (let resourceKey in mines) {
            if(mines.hasOwnProperty(resourceKey)) {
                let resource = mines[resourceKey];
                let iconObj = icons.mines[resource];
                let interactive = false;
                let title = undefined;
                let warpReq = parseInt(system.warpRequired) || 1;
                let color = 'green';
                let options = {icon: iconObj, interactive: interactive, renderer:myRenderer};
                let x = yx[1] + offset;
                let y = yx[0];
                if(!group.hasOwnProperty(resource)) group[resource] = []; //init the resource group if its not an array
                let marker = makeMarker(xy(x, y), options);
                group[resource].push(marker);
            }

        }
    };
    let setEvents = function(yx, events, group, eventData) {
        if(events === "None") return false;
        if(group === undefined || group.length > 1) {
            console.warn("setEvents expects the group to be defined, but empty. Make sure you are passing in a container object");
        }
        events = strToArray(events);
        for (let resourceKey in events) {
            if(events.hasOwnProperty(resourceKey)) {
                let resource = events[resourceKey];
                let armadaType = resource.replace("Armada", "").toLowerCase().trim();
                armadaType = armadaType === '' ? 'normal' : armadaType;
                if(resource.includes('Armada')) {
                    let str = strToArray(eventData.armadas);
                    let count = str.length;
                    //check if uncommon, rare, epic
                    let offset = count > 1 ? 4 : 0;
                    let x = yx[1] - (offset / 2);
                    let y = yx[0] + (offset / 2);
                    for (let rank in str) {
                        rank = str[rank];
                        let iconObj = icons.armada[armadaType][rank + ' Armada'];
                        let options = {icon: iconObj, interactive: false, pane:"events"};
                        let title = eventData[rank.toLowerCase()];
                        let color = rank === 'Uncommon' ? '#39D239' : rank === 'Rare' ? '#72DCEF' : rank === 'Epic' ? '#C475EC' : 'white';
                        if(!group.hasOwnProperty(resource)) group[resource] = []; //init the resource group if its not an array
                        let marker = makeMarker(xy(x, y), options);
                        let circle = makeCircle(xy(x, y), {className: 'armada-circle ', radius: 3, color: color, fillOpacity: 1, stroke: true, pane:"highlight"});
                        if(title !== '' && title.length > 0) {
                            marker.bindTooltip(title, {permanent: true, direction: 'right', offset: [10, 0], className: 'arm-label ' + rank.toLowerCase()});
                        }
                        group[resource].push(circle);
                        group[resource].push(marker);
                        y = y - offset;
                    }
                } else {
                    let swapNames = resource.toLowerCase() === 'borg' ? 'Inert Nanoprobe' : resource;
                    let iconObj = icons.other_rss[swapNames];
                    let options = {icon: iconObj, interactive: false, pane:"events"};
                    if(!group.hasOwnProperty(resource)) group[resource] = []; //init the resource group if its not an array
                    group[resource].push(makeMarker(yx, options));
                }
            }
        }

    };
    let initMap = function() {
        map.attributionControl.setPrefix(setAttributions()); //developer credits
        toggleUIElements(map.getZoom()); //set text visibility
        layers.events = {};
        layers.Paths = L.layerGroup(pathsGroup).addTo(map);
        layers.System = L.layerGroup(systemsGroup).addTo(map);
        layers.Bases = L.layerGroup(basesGroup);
        map.removeLayer(layers.Paths);
        map.addLayer(layers.Paths);
        layers.mines = {}; //start this empty to add in the groups later
        //convert each mine type into its own layerGroup
        for (let resource in minesGroup) {
            //console.log("resource", minesGroup[resource]);
            if(minesGroup.hasOwnProperty(resource)) layers.mines[resource] = L.layerGroup(minesGroup[resource]); //group the mines by key
        }//convert each event type into its own layerGroup
        for (let resource in eventsGroup) {
            if(eventsGroup.hasOwnProperty(resource)) layers.events[resource] = L.layerGroup(eventsGroup[resource]); //group the mines by key
        }

        if(layerControl) layerControl.remove();

        controlLayers = {
            "": {"Station Hubs": layers.Bases},
            "Mines": setGroups(layers.mines),
            "Events": setGroups(layers.events),
        };

        layerControl = L.control.groupedLayers(null, controlLayers, {groupCheckboxes: true, /*exclusiveGroups: ["Mines"]*/});
        layerControl.addTo(map);

        //console.log("check", typeof STFCUI, typeof STFCUI === undefined, typeof STFCUI === 'undefined');
        if(typeof STFCUI !== 'undefined') {
            STFCUI.init(map);
        }
        if(typeof STFCMapEditor !== 'undefined') {
            STFCMapEditor.init();
        }
        zoomUIUpdate();
        $(".hub-label").css("visibility", "visible"); //set capital system labels visible

    };

    let zoomUIUpdate = function() {
        let zoom = map.getZoom();
        toggleSystems(zoom);
        toggleUIElements(zoom);
    };
    let toggleSystems = function(zoom) {
        let hub = $(".hub");
        let capital = $(".capital");
        if(zoom < 0.9) {
            hub.addClass("hub-1").removeClass("hub-2 hub-3");
            capital.addClass("capital-1").removeClass("capital-2");
        } else if(zoom < 2.1) {
            hub.addClass("hub-2").removeClass("hub-1 hub-3");
            capital.addClass("capital-2").removeClass("capital-1");
        } else {
            hub.addClass("hub-3").removeClass("hub-1 hub-2");
            capital.addClass("capital-2").removeClass("capital-1");
        }
    };
    let toggleUIElements = function(zoom) {
        //path markers
        if(zoom < 1.1){
            $(".leaflet-pathmarker-pane").addClass("fade");
        }else{
            $(".leaflet-pathmarker-pane").removeClass("fade");
        }

        if(zoom < 0) {
            $(".leaflet-marker-pane").addClass("dim");
            if(!isEditor) {
                $(".leaflet-overlay-pane").addClass("fade");
            }
        } else if(zoom < 0.25) {
            if(!isEditor) {
                $(".leaflet-overlay-pane").addClass("fade");
            }
            $(".leaflet-marker-pane").addClass("dim");
        } else {
            $(".leaflet-overlay-pane").removeClass("fade");
            $(".leaflet-marker-pane").removeClass("dim");
        }

        if(zoom < 0.9) {
            $(".leaflet-tooltip-pane").addClass("fade");
            $(".arm-label").addClass("fade");
        } else {
            $(".leaflet-tooltip-pane").removeClass("fade");
            $(".arm-label").removeClass("fade");
        }
    };
    let makeSystemNode = function(sys) {
        let coords = sys.geometry.coordinates;
        let properties = sys.properties;
        let sysName = properties.name;
        let cleaned = cleanName(sysName);
        let sysLabel = sysName + ' (' + properties.systemLevel + ')';
        let popupTemplate = isEditor ? null : makeSystemPopup(properties);
        let radius = properties.radius !== undefined && properties.radius !== '' ? parseInt(properties.radius) : 1;
        let iconType = properties.icon;
        let node;

        let labelClassName = (iconType === 'capital' || iconType === 'hub') ? 'hub-label' : 'system-label';
        let labelOptions = {permanent: true, direction: 'right', offset: [2, -2], opacity: null, className: labelClassName};
        if(iconType === '') {
            node = makeCircle(coords, {
                className: 'system ' + cleanName(sysName),
                id: sysName,
                radius: radius,
                color: '#fcf8e5',
                fillOpacity: 1,
                stroke: true,
                draggable: draggableSystems,
                pane:"systems"
            });

        } else {
            let icon = makeDivIcon({
                className: `${iconType} ${iconType}-${Math.round(startingZoom)}`,
                id: sysName,
                iconSize: null/*, radius: radius, color: '#fcf8e5', fillOpacity: 1, stroke: true*/
            });
            node = makeMarker(coords, {icon: icon, className: iconType + ' system ' + cleanName(sysName), draggable: draggableSystems, pane:"hubsystem", id: sysName});
            labelOptions.pane = 'hublabel';
        }

        node.bindTooltip(sysLabel, labelOptions);
        L.DomEvent.addListener(node, 'click', function(e) {
            flyToSystem(cleaned, true); //allow flyto on clicked system
            const sysName = e.target.options.id;
            const sysId = systemNameToID(sysName);
        }, this);
        systemNodes[cleaned] = node; //cache the node for events
        return node;
    };

    let initIcons = function(iconsData) {
        console.log("initIcons");
        icons = {};
        for (let category in iconsData) {
            if(iconsData.hasOwnProperty(category)) {
                if(icons[category] === undefined) icons[category] = {};
                if(category === 'armada'){
                    for (let eventType in iconsData[category]) {
                        let armadaGroup = iconsData[category][eventType];
                        for (let rank in armadaGroup) {
                            if(icons[category][eventType] === undefined) icons[category][eventType] = {};
                            if(armadaGroup.hasOwnProperty(rank)) {
                                icons[category][eventType][rank] = new L.Icon(armadaGroup[rank]);
                            }
                        }
                    }
                }else{
                    for (let objKey in iconsData[category]) {
                        if(iconsData[category].hasOwnProperty(objKey)) {
                            icons[category][objKey] = new L.Icon(iconsData[category][objKey]);
                        }
                    }
                }
            }
        }
        iconsLoaded = true;
    };
    let setGroups = function(layers) {
        //console.log("layers setGroups", layers);
        //filters out internal properties
        let groups = {};
        for (let name in layers) {
            if(layers.hasOwnProperty(name)) groups[name] = layers[name];
        }
        return groups;
    };
    let makeCircle = function(yx, options) {
        return L.circle(yx, options);
    };
    let makeCircleMarker = function(yx, options) {
        return L.circleMarker(yx, options);
    };
    let makeMarker = function(yx, options) {
        return L.marker(yx, options);
    };
    let makeDivIcon = function(yx, options) {
        return L.divIcon(yx, options);
    };
    let flyToSystem = function(system, openPopup) {
        if(system === activeSystem) {
            return false;
        }
        let sys;
        if(system === undefined) {
            sys = $("#fly-to").val();
        } else {
            sys = system;
        }
        sys = cleanName(sys);
        if(galaxy[sys] === undefined) return false;

        let yx = galaxy[sys].yx;
        let systemID = galaxy[sys].systemId;
        map.flyTo(yx, 2.5, {
            animate: false,
            duration: 0.1
        });
        activeSystem = sys;
        if(openPopup) {
            map.once('moveend', function() {
                if(systemPopups[sys] !== undefined) systemPopups[sys].openPopup();
            })
        }
    };
    let makeSystemPopup = function(p) {
        let popupClass;
        let name = p.name[0].toUpperCase() + p.name.slice(1) || ''; //capitalize 1st letter
        let systemLevel = p.systemLevel || '';
        let id = p.systemID || '';
        let warpRequired = p.warpRequired || 'N/A';
        //zone setup
        let zone = p.zone || '';
        zone = zone.toUpperCase();
        let event = p.event.trim() || '';
        event = event.toUpperCase();
        switch (zone) {
            case "INDEPENDENT":
            case "NEUTRAL":
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

        //mines setup
        let mines = p.mines;
        let mineSize = p.mineSize > 0 ? ` <code>(${p.mineSize})</code>` : '';
        let minesArr = p.mines.split(", ");
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
        if(shipTypes !== '' && shipTypes !== undefined){
            let shipTypesArr = p.shipTypes.split(", ");
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
                            console.warn("need to check, why no options? name:", name, "nodeType:", nodeType, "iconUrl:", iconUrl);
                        }
                    }
                }
            }
            shipTypes = shipTypesHTML || '';
        }
        let eventHTML = '';
        if(event === 'ARMADA') {
            //TODO update this to accomodate all 3 armada types
            let uncIconUrl = icons.other_rss['Uncommon Armada'].options.iconUrl;
            let rareIconUrl = icons.other_rss['Rare Armada'].options.iconUrl;
            let epicIconUrl = icons.other_rss['Epic Armada'].options.iconUrl;
            let img = `
                    <div class="tooltip">
                        <img class="ship-icon" src="${uncIconUrl}" />
                      <span class="tooltiptext">Uncommon Armada</span>
                    </div>
                    `;
            eventHTML += img;
        }

        if(event !== '') event = '- ' + event;
        let planets = p.planets;
        let shipLevel = p.shipLevel;
        //let warpRequired = p.warpRequired;
        let hostiles = p.hostiles || '';
        let stationHub = p.stationHub;
        //<div>Station Hubs: ${stationHub}</div>
        let divOpen = `<div class='popup-${popupClass}' data-systemid='${id}'>`;
        let divClose = "</div>";
        let info =
            `<div id="system-zone">${zone} <span id="system-event">${event}</span> </div>
             <div id="system-name">${name} [${systemLevel}]</div>
             <div id="system-id" class="clickable" data-system-id="${id}" data-system-name="${name}"><span>S:</span>${id}</div>
             <div class="system-detail-panel">
                 <div><span>Hostiles:</span> <code>${hostiles}</code> </div>
                 <div class="half-size">
                     <div><span>Warp Required:</span></div>
                     <div>${warpRequired}</div>
                 </div>
                 <div class="half-size">
                     <div><span>Armadas:</span>${mineSize}</div>
                     <div>${eventHTML}</div>
                 </div>
                 <div class="half-size">
                     <div><span>Hostile Types:</span></div>
                     <div>${shipTypes}</div>
                 </div>
                 <div class="half-size">
                     <div><span>Mines:</span>${mineSize}</div>
                     <div>${mines}</div>
                 </div>
             </div>`;
        return divOpen + info + divClose;
    }
    let loadFile = async function(file, callback) {
        $.getJSON(file, function() {
        }).done(function(d) {
            if(typeof callback === 'function') {
                callback(d);
            } else {
                return d;
            }
        }).fail(function(d, e, f) {
            console.warn(file + " had a problem loading. Sorry!");
            console.warn(d, e, f);
        }).always(function() {
        });
    };
    let setAttributions = function(info) {
        let mapLink = "<a href='https://stfcpro.com' title='Star Trek Fleet Command Galaxy Map'>";
        let discLinkA = "<a href='https://discord.com/invite/fKThyH2' title='STFC Pro Discord'>";
        let discLinkB = "<a href='https://discord.com/invite/fjFYQhM' title='Star Trek Fleet Command Official Discord'>";
        let close = "</a>";
        let serverInfo = '[16] Baryon'; //info.serverInfo
        let mapName = 'Star Trek Fleet Command Galaxy Map'; //info.mapName
        let version = '2.21'; //info.version
        let author = 'JoeCrash'; //info.author
        return mapLink + mapName + close + " v" + version + "<br>" + "By: <strong>" + author + "</strong> - Server: <strong>" + serverInfo + "</strong><br>" + discLinkA + "STFCPro Bot/Map Discord" + close;
    };
    return { //public interface
        init: function() {
            init();
        },
        systemCount,
        startingZoom: function() {
            return startingZoom
        },
        getLayers: function() {
            return layers;
        },
        getBounds: function() {
            return bounds
        },
        getMap: function() {
            return map;
        },
        getTerritories: function() {
            return territories;
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
        getIcons: function() {
            return icons;
        },
        getGalaxy: function() {
            return galaxy;
        },
        flyToSystem: function(system, openPopup) {
            flyToSystem(system, openPopup);
        },
        loadFile: async function(file, callback) {
            return await loadFile(file, callback);
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
        },
        angle,
        // generators
        makeCircle: function(yx, options) {
            return makeCircle(yx, options)
        },
        makeCircleMarker: function(yx, options) {
            return makeCircleMarker(yx, options)
        },
        makeMarker: function(yx, options) {
            return makeMarker(yx, options)
        },
        makeDivIcon: function(yx, options) {
            return makeDivIcon(yx, options)
        }
    };
})();
