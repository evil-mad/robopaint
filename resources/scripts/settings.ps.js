/**
 * @file Holds all RoboPaint settings paper autofill/stroke preview code.
 */
/* globals rpRequire, paper, project, view */

rpRequire('paper_utils')(paper);
rpRequire('auto_stroke')(paper);
rpRequire('auto_fill')(paper);

paper.settings.handleSize = 8;

paper.utils.setupLayers();

paper.canvas.mainLayer.activate();

paper.canvas.mainLayer.opacity = 0.1;
paper.canvas.tempLayer.opacity = 0.3;


// Refresh/re-simulate the build.
paper.refreshPreview = function() {
  if (!robopaint.media.sets) return; // Don't run too early

  paper.canvas.tempLayer.removeChildren();
  paper.canvas.actionLayer.removeChildren();

  paper.fill.shutdown();
  paper.stroke.shutdown();

  paper.stroke.setup(paper.fill.setup);
};


// Go get the preview image
paper.canvas.mainLayer.activate();
project.importSVG(fs.readFileSync('resources/images/settings_preview.svg', 'utf-8').toString(), {
  applyMatrix: true,
  expandShapes: true,
  onLoad: function(){
    // Size it to fit
    var group = paper.canvas.mainLayer.children[0];
    view.zoom = 0.5; // Zoom to 50%
    group.fitBounds(view.bounds);
    group.scale(0.95); // Make it a little smaller
  }
});


// Animation frame callback
function onFrame(event) {
  paper.stroke.onFrameStep();
  paper.fill.onFrameStep();
}

// Refresh on click
function onMouseDown() {
  paper.refreshPreview();
}


// Show preview paths
function onMouseMove(event)  {
  project.deselectAll();

  if (event.item && !event.item.children) {
    event.item.selected = true;
  }
}
