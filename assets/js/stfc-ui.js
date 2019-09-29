let STFCUI;
STFCUI = (function() {
    //helpers
    let systemNames = []; //holds all the system names for typeahead (simple array with just the names)
    let cleanedNames = []; //holds all the system names for typeahead (simple array with just the names)
    let systemTokens = []; //holds system names in a tag format for typeahead (typeahead tags formatted object)

    let init = function(map) {
        console.log("STFCUI init");

        //initFlyToSystem();
        //initBringNearSystem();
        //initClearPathsFromSystem();
        map.addControl(new systemSearchTool());
        initTypeaheadB();
    };

    let systemSearchTool = L.Control.extend({
        options: {
            position: 'topleft'
            //control position - allowed: 'topleft', 'topright', 'bottomleft', 'bottomright'
        },
        onAdd: function(map) {
            let container = L.DomUtil.create('div', 'leaflet-control leaflet-control-custom');
            /*container.style.backgroundColor = 'white';
            container.style.width = '30px';
            container.style.height = '30px';*/
            /*container.innerHTML = '' +
                '<a class="" href="#" title="Search Systems" role="button" aria-label="Search Systems"><img id="search-icon" src="assets/img/ui/mg.png"></a>'+
                '<input id="search-input" type="text" class="inline typeahead">';*/
            /*container.innerHTML =
                `<div class="search">
                <input type="text" name="search" placeholder="Warp To System..">
                </div>`;*/
            container.innerHTML =
                `<div id="search-tool">
                  <input type="text" class="typeahead" id="search-input" name="search" placeholder="Search Systems">
                  <button id="search-submit" type="submit" class="btn btn-search">
                    <i class="fa fa-search"></i>
                  </button>
                  <button id="search-reset" type="reset" class="btn btn-reset fa fa-times"></button>
                </div>`;
            /*container.innerHTML =
                `<input type="text" class="typeahead" id="search-input" name="search" placeholder="Search Systems">
                  `;*/

            let _searchWrapper = $("#search-tool", container);
            let _input = $("#search-input", container);
            let _submit = $("#search-submit", container);
            let _reset = $("#search-reset", container);

            _submit.on("click", function(){
                if(!_searchWrapper.hasClass("focus")){
                    _searchWrapper.addClass("focus");
                    _input.select();
                }else{
                    submit();
                }
            });

            //override close on losing focus
            _input.bind('typeahead:beforeclose',
                function (e) {
                    e.preventDefault();
                }
            );
            /*_input.bind('typeahead:change',
                function (e,i) {
                    e.preventDefault();
                    console.log("changed", e,i);
                }
            );*/
            /*_input.bind('typeahead:selected', function(e,i) {
                // do what you want with the item here
                console.log("selected", e,i);
            })*/

            _input.on("click", function(){
                $(this).focus();
                _searchWrapper.addClass("focus");
                console.log("input focused");
                if(_input.val() !== ''){
                    _input.select();
                }
            });

            _input.on("focusout", function(e){
                console.log("input losing focus:", e, $(".typeahead").typeahead("val"));
                if($(".typeahead").typeahead("val") === ''){
                    //_input
                    _searchWrapper.removeClass("focus");
                    console.log("input lost focus");
                }
            });
            _reset.on("click", function(){
                if(_input.val() === ""){
                    _searchWrapper.removeClass("focus");
                    console.log("input empty, no reset");
                }else{
                    _input.val("");
                    console.log("input reset");
                }
            });
            function submit(){
                cleanedNames = STFCMap.getCleanedNames();
                let name = _input.val();
                let cleaned = STFCMap.cleanName(name);
                if(cleanedNames.indexOf(cleaned) >= 0){
                    STFCMap.flyToSystem(cleaned, true);
                }
                _searchWrapper.removeClass("focus");
                _input.typeahead('val', '');
            }
            return container;
        },
    });

    let initTypeahead = function() {
        systemNames = STFCMap.getSystemNames();
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

        console.log("typeahead", typeof systemNames, systemNames[0]);

    };

    let initTypeaheadB = function(){
        systemNames = STFCMap.getSystemNames();
        let sysNames = new Bloodhound({
            datumTokenizer: Bloodhound.tokenizers.whitespace,
            queryTokenizer: Bloodhound.tokenizers.whitespace,
            local: systemNames
        });
        sysNames.initialize();

        $(".typeahead").typeahead({
            minLength: 1,
            hint: true,
            highlight: true
        }, {
            name: 'systems',
            /*displayKey: 'value',*/
            /*templates: {
                suggestion: function(data) {
                    var str = '';
                    if (data.suggest.Type === 'Customer') {
                        str += '<i class="icon-1">' + data.suggest.Type + '</i>';
                    } else if (data.suggest.Type === 'Product') {
                        str += '<i class="icon-2">' + data.suggest.Type + '</i>';
                    }
                    str += '<div>' + data.value + '</div>';
                    return str;
                }
            },*/
            source: sysNames.ttAdapter()
        })
            .on('typeahead:opened', onOpened)
            .on('typeahead:selected', onSelected)
            .on('typeahead:checked', onChecked)
            .on('typeahead:autocompleted', onAutocompleted);

    };

    function onOpened($e) {
        //console.log('opened');
    }
    function onChecked(e, i) {
        //console.log('checked', e, i);
    }

    function onAutocompleted($e, datum) {
        //console.log('autocompleted', datum);
    }

    function onSelected($e, datum) {
        console.log('selected', $e, datum);
        $(".tt-menu").css("display", "none");
        $("#search-submit").trigger('click');
    }

    let closeSuggestions = function(){

    };

    let substringMatcher = function(strs) {
        return function findMatches(q, cb) {
            let matches, substringRegex;
            // an array that will be populated with substring matches
            matches = [];

            // regex used to determine if a string contains the substring `q`
            let substrRegex = new RegExp(q, 'i');

            // iterate through the pool of strings and for any string that
            // contains the substring `q`, add it to the `matches` array
            $.each(strs, function(i, str) {
                if (substrRegex.test(str)) {
                    matches.push(str);
                }
            });

            cb(matches);
        };
    };

    /*let initFlyToSystem = function() {
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
    };*/
    /*let initBringNearSystem = function() {
        $('#bring-to-system').on('click', function() {
            bringNearSystem();
        });
    };
    let initClearPathsFromSystem = function() {
        $("#clear-linked-system").on("click", function() {
            let system = $("#clear-linked").val();
            if(system === '') return false;
            clearSystemLinkedPaths(system);
        });
    };
    let clearSystemLinkedPaths = function(system) {
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
    };
    let bringNearSystem = function() {
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

    return { // public interface
        init: function(map) {
            init(map);
        }
    };
})();