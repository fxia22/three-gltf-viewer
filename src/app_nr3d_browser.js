import {WEBGL} from 'three/examples/jsm/WebGL.js';
import {Viewer} from './viewer.js';
import {SimpleDropzone} from 'simple-dropzone';
import {ValidationController} from './validation-controller.js';
import queryString from 'query-string';

if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
    console.error('The File APIs are not fully supported in this browser.');
} else if (!WEBGL.isWebGLAvailable()) {
    console.error('WebGL is not supported in this browser.');
}


class App {

    /**
     * @param  {Element} el
     * @param  {Location} location
     */
    constructor(el, location) {

        const hash = location.hash ? queryString.parse(location.hash) : {};

        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);

        // Get the scan_id from the browser
        this.scene_id = urlParams.get('scan');

        // Read the nr3d data
        this.nr3d = require('../assets/nr3d_nested.json');

        // Read the bounding boxes information
        this.bboxes = require('../assets/test.json');

        // Required for further preview
        this.selected_instance_label = null;
        this.selected_object_id = null;

        // Set up some options
        this.options = {
            kiosk: Boolean(hash.kiosk),
            model: 'assets/scene/' + this.scene_id + '_vh_clean_2_blender_uv.glb',
            preset: hash.preset || '',
            cameraPosition: hash.cameraPosition
                ? hash.cameraPosition.split(',').map(Number)
                : null,
            all_bboxes: this.bboxes,
            app_: this
        };

        this.el = el;
        console.log(el.clientHeight, el.clientWidth)
        this.viewer = null;
        this.viewerEl = null;
        this.spinnerEl = el.querySelector('.spinner');
        this.legendEl = el.querySelector('.legend');
        this.dropEl = el.querySelector('.scan_viewer');
        this.inputEl = el.querySelector('#file-input');
        this.validationCtrl = new ValidationController(el);

        const options = this.options;
        console.log('loading model', options.model);

        if (options.kiosk) {
            const headerEl = document.querySelector('header');
            headerEl.style.display = 'none';
        }

        if (options.model) {
            this.view(options.model, '', new Map());
        }

        this.showSpinner();
    }

    /**
     * Sets up the drag-and-drop controller.
     */
    createDropzone() {
        const dropCtrl = new SimpleDropzone(this.dropEl, this.inputEl);
        dropCtrl.on('drop', ({files}) => this.load(files));
    }

    /**
     * Sets up the view manager.
     * @return {Viewer}
     */
    createViewer() {
        this.viewerEl = document.createElement('div');
        this.viewerEl.classList.add('viewer');
        this.viewerEl.classList.add('container');
        this.dropEl.innerHTML = '';
        this.dropEl.appendChild(this.viewerEl);
        this.viewer = new Viewer(this.viewerEl, this.options);
        return this.viewer;
    }

    /**
     * Loads a fileset provided by user action.
     * @param  {Map<string, File>} fileMap
     */
    load(fileMap) {
        let rootFile;
        let rootPath;
        Array.from(fileMap).forEach(([path, file]) => {
            if (file.name.match(/\.(gltf|glb)$/)) {
                rootFile = file;
                rootPath = path.replace(file.name, '');
            }
        });

        if (!rootFile) {
            this.onError('No .gltf or .glb asset found.');
        }

        this.view(rootFile, rootPath, fileMap);
    }

    /**
     * Passes a model to the viewer, given file and resources.
     * @param  {File|string} rootFile
     * @param  {string} rootPath
     * @param  {Map<string, File>} fileMap
     */
    view(rootFile, rootPath, fileMap) {

        if (this.viewer) this.viewer.clear();

        const viewer = this.viewer || this.createViewer();

        const fileURL = typeof rootFile === 'string'
            ? rootFile
            : URL.createObjectURL(rootFile);

        const cleanup = () => {
            if (typeof rootFile === 'object') URL.revokeObjectURL(fileURL);
        };

        viewer
            .load(fileURL, rootPath, fileMap)
            .catch((e) => this.onError(e))
            .then((gltf) => {
                if (!this.options.kiosk) {
                    this.validationCtrl.validate(fileURL, rootPath, fileMap, gltf);
                }
                cleanup();
                this.hideSpinner();
                this.showLegend();

                app_instance = this.options.app_;

                // Populate the nr3d stuff
                this.options.app_.populateNr3d();
            });

    }

    /**
     * @param {String} HTML representing a single element
     * @return {Element}
     */
    htmlToElement(html) {
        var template = document.createElement('template');
        html = html.trim(); // Never return a text node of whitespace as the result
        template.innerHTML = html;
        return template.content.firstChild;
    }

    /**
     * Populate the Nr3d data into the interface.
     */
    populateNr3d() {
        // Populate the instance labels
        var instance_labels_list = document.getElementById('instance_labels_list');

        var instance_labels = this.nr3d[this.scene_id];

        var first_object_el = -1;
        for (const instance_label in instance_labels) {
            var st = '<button type="button" class="list-group-item list-group-item-action" id="' + instance_label + '"' + '>' + instance_label + '</button>'
            var el = this.htmlToElement(st)
            el.addEventListener("click", this.populateObjectsList, false)
            instance_labels_list.appendChild(el);

            if (first_object_el === -1) {
                app_instance.prePopulateObjectsList(instance_label);
                first_object_el = 0;
            }
        }
    }

    /**
     * @param  {Error} error
     */
    onError(error) {
        let message = (error || {}).message || error.toString();
        if (message.match(/ProgressEvent/)) {
            message = 'Unable to retrieve this file. Check JS console and browser network tab.';
        } else if (message.match(/Unexpected token/)) {
            message = `Unable to parse file content. Verify that this file is valid. Error: "${message}"`;
        } else if (error && error.target && error.target instanceof Image) {
            message = 'Missing texture: ' + error.target.src.split('/').pop();
        }
        window.alert(message);
        console.error(error);
    }

    populateObjectsList() {
        // Remove any previous bounding boxes
        app_instance.viewer.removeCubes()

        // Unselect previously selected (if applicable)
        app_instance.unselectButtons(true);

        // Remove any previous utterances
        app_instance.clearObjectsAndUtterances(true);

        // Populate the objects
        var objects_list = document.getElementById('objects_list');

        app_instance.selected_instance_label = this.id;
        app_instance.selectButton(this.id);

        var first_object_el = -1;
        for (const object_id in app_instance.nr3d[app_instance.scene_id][this.innerHTML]) {
            var st = '<button type="button" class="list-group-item list-group-item-action" id="' + object_id + '"' + '>' + object_id + '</button>'
            var el = app_instance.htmlToElement(st)
            el.addEventListener("click", app_instance.showObjectUtterances, false)

            // if (first_object_el === -1) {
            //     el.showObjectUtterances();
            //     first_object_el = 2;
            // }

            objects_list.appendChild(el)
        }
    }

    prePopulateObjectsList(id) {
        // Remove any previous bounding boxes
        app_instance.viewer.removeCubes()

        // Unselect previously selected (if applicable)
        app_instance.unselectButtons(true);

        // Remove any previous utterances
        app_instance.clearObjectsAndUtterances(true);

        // Populate the objects
        var objects_list = document.getElementById('objects_list');

        app_instance.selected_instance_label = id;
        app_instance.selectButton(id);

        var first_object = -1;
        for (const object_id in app_instance.nr3d[app_instance.scene_id][id]) {
            var st = '<button type="button" class="list-group-item list-group-item-action" id="' + object_id + '"' + '>' + object_id + '</button>'
            var el = app_instance.htmlToElement(st)
            el.addEventListener("click", app_instance.showObjectUtterances, false);
            objects_list.appendChild(el);

            if (first_object === -1) {
                app_instance.preselectObjectUtterances(object_id);
                first_object = 0;
            }


        }
    }

    showObjectUtterances() {
        // remove any previous utterances
        app_instance.clearObjectsAndUtterances(false);

        // Display the Object utterances
        var object_utterances_list = document.getElementById("object_utterances");

        // Unselect previously selected (if applicable)
        app_instance.unselectButtons(false);

        // Show the bouding boxes
        app_instance.viewer.removeCubes();
        app_instance.selected_object_id = this.id;
        app_instance.selectButton(this.id);

        app_instance.viewer.options.sti = app_instance.bboxes[app_instance.selected_object_id];
        app_instance.viewer.load_cubes();

        var utterances = app_instance.nr3d[app_instance.scene_id][app_instance.selected_instance_label][this.id]
        for (var i = 0; i < utterances.length; i++) {
            // Add the new utterances (in case of using table)
            // var row = el.insertRow(0);
            // var cell = row.insertCell(0);
            // cell.innerHTML = utterances[i]

            var st = '<li class="list-group-item ">"' + utterances[i] + '"</li>';
            var el = app_instance.htmlToElement(st);
            object_utterances_list.appendChild(el);

        }

    }

    preselectObjectUtterances(id) {
        // remove any previous utterances
        app_instance.clearObjectsAndUtterances(false);

        // Display the Object utterances
        var object_utterances_list = document.getElementById("object_utterances");

        // Unselect previously selected (if applicable)
        app_instance.unselectButtons(false);

        // Show the bouding boxes
        app_instance.viewer.removeCubes();
        app_instance.selected_object_id = id;
        app_instance.selectButton(id);

        app_instance.viewer.options.sti = app_instance.bboxes[app_instance.selected_object_id];
        app_instance.viewer.load_cubes();

        var utterances = app_instance.nr3d[app_instance.scene_id][app_instance.selected_instance_label][id]
        for (var i = 0; i < utterances.length; i++) {
            // Add the new utterances (in case of using table)
            // var row = el.insertRow(0);
            // var cell = row.insertCell(0);
            // cell.innerHTML = utterances[i]

            var st = '<li class="list-group-item ">"' + utterances[i] + '"</li>';
            var el = app_instance.htmlToElement(st);
            object_utterances_list.appendChild(el);

        }

    }

    clearObjectsAndUtterances(clear_objects_list = false) {
        var el = document.getElementById("object_utterances");
        el.innerHTML = '';
        // var head_row = app_instance.htmlToElement('<thead><tr><th>Utterances</th></tr></thead>')
        // el.appendChild(head_row);

        if (clear_objects_list) {
            el = document.getElementById('objects_list');
            el.innerHTML = '';
            app_instance.selected_object_id = null;
        }

    }

    unselectButtons(clear_all = false) {
        if (app_instance.selected_object_id != null) {
            var el = document.getElementById(app_instance.selected_object_id);
            el.className = el.className.replace('active', '');
        }
        if (clear_all && app_instance.selected_instance_label != null) {
            var el = document.getElementById(app_instance.selected_instance_label);
            el.className = el.className.replace('active', '');
        }
    }

    selectButton(element_id) {
        var el = document.getElementById(element_id);
        el.className = el.className.replace('active', '');
        el.className += ' active';
    }

    showSpinner () {
        this.spinnerEl.style.display = '';
    }

    hideSpinner () {
        this.spinnerEl.style.display = 'none';
    };

    showLegend() {
        this.legendEl.style.visibility='visible';
    };

}

// A crime and I am sorry about it
var app_instance;

document.addEventListener('DOMContentLoaded', () => {

    var app = new App(document.body, location);
    app_instance = app;
});



