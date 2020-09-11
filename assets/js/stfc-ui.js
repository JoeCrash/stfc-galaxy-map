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
        initTypeahead();
    };
    let systemSearchTool = L.Control.extend({
        options: {
            position: 'topleft'
            //control position - allowed: 'topleft', 'topright', 'bottomleft', 'bottomright'
        },
        onAdd: function(map) {
            let container = L.DomUtil.create('div', 'leaflet-control leaflet-control-custom');
            const closeIcon = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="Capa_1" x="0px" y="0px" viewBox="0 0 455.111 455.111" style="enable-background:new 0 0 455.111 455.111;" xml:space="preserve">
                                <circle style="fill:#E24C4B;" cx="227.556" cy="227.556" r="227.556"/>
                                <path style="fill:#D1403F;" d="M455.111,227.556c0,125.156-102.4,227.556-227.556,227.556c-72.533,0-136.533-32.711-177.778-85.333  c38.4,31.289,88.178,49.778,142.222,49.778c125.156,0,227.556-102.4,227.556-227.556c0-54.044-18.489-103.822-49.778-142.222  C422.4,91.022,455.111,155.022,455.111,227.556z"/>
                                <path style="fill:#FFFFFF;" d="M331.378,331.378c-8.533,8.533-22.756,8.533-31.289,0l-72.533-72.533l-72.533,72.533  c-8.533,8.533-22.756,8.533-31.289,0c-8.533-8.533-8.533-22.756,0-31.289l72.533-72.533l-72.533-72.533  c-8.533-8.533-8.533-22.756,0-31.289c8.533-8.533,22.756-8.533,31.289,0l72.533,72.533l72.533-72.533  c8.533-8.533,22.756-8.533,31.289,0c8.533,8.533,8.533,22.756,0,31.289l-72.533,72.533l72.533,72.533  C339.911,308.622,339.911,322.844,331.378,331.378z"/>
                                </svg>`;
            const searchIcon = `<svg id="Capa_1" enable-background="new 0 0 512 512" height="20" viewBox="0 0 512 512" width="20" xmlns="http://www.w3.org/2000/svg"><g id="_x34_3_search"><path d="m146.03 264.907h52.162v149.964h-52.162z" fill="#8d9ca8" transform="matrix(.707 .707 -.707 .707 290.748 -22.15)"/><path d="m12.986 499.014c-17.315-17.315-17.315-45.388 0-62.703l118.645-118.645c6.451-6.451 16.909-6.451 23.36 0l39.343 39.343c6.451 6.451 6.451 16.909 0 23.36l-118.644 118.645c-17.315 17.315-45.389 17.315-62.704 0z" fill="#fe646f"/><circle cx="333.761" cy="178.239" fill="#9facba" r="178.239"/><circle cx="333.761" cy="178.239" fill="#d8ecfe" r="127.646"/><path d="m459.795 52.205c-4.17-4.17-8.499-8.083-12.96-11.753 57.597 70.016 53.684 173.671-11.753 239.108s-169.091 69.35-239.108 11.753c3.67 4.462 7.583 8.79 11.753 12.96 69.607 69.607 182.461 69.607 252.068 0s69.607-182.462 0-252.068z" fill="#8d9ca8"/><path d="m194.334 357.009-24.713-24.713c6.451 6.451 6.451 16.909 0 23.36l-118.644 118.645c-12.927 12.927-31.848 16.198-47.814 9.823 2.164 5.42 5.435 10.501 9.824 14.889 17.315 17.315 45.388 17.315 62.703 0l118.645-118.645c6.45-6.45 6.45-16.908-.001-23.359z" fill="#fd4755"/><path d="m424.021 87.979c-3.388-3.388-6.924-6.536-10.581-9.463 40.068 50.072 36.919 123.556-9.463 169.938-46.381 46.381-119.866 49.53-169.938 9.463 2.926 3.657 6.075 7.194 9.463 10.581 49.769 49.769 130.75 49.769 180.519 0s49.769-130.75 0-180.519z" fill="#c4e2ff"/></g></svg>`;
            container.innerHTML =
                `<div id="search-tool">
                  <input type="text" class="typeahead" id="search-input" name="search-systems" placeholder="Search Systems">
                  <button id="search-submit" type="submit" class="btn btn-search">
                    ${searchIcon}
                  </button>
                  <button id="search-reset" type="reset" class="btn btn-reset">${closeIcon}</button>
                </div>`;
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
    let initTypeahead = function(){
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
    let closeSuggestions = function(){};
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

    return { // public interface
        init: function(map) {
            init(map);
        }
    };
})();