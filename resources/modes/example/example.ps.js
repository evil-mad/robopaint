/**
 * @file Holds all RoboPaint manual/auto painting mode specific code
 */

// Initialize the RoboPaint canvas Paper.js extensions & layer management.
rpRequire('paper_utils')(paper);
rpRequire('paper_hershey')(paper);

// Init defaults & settings
paper.settings.handleSize = 10;

// Animation frame callback
function onFrame(event) {
  canvas.onFrame(event);
}

// Show preview paths
function onMouseMove(event)  {
  project.deselectAll();

  if (event.item) {
    event.item.selected = true;
  }
}

function onMouseDown(event)  {
  if (event.item && event.item.parent === paper.actionLayer) {
    paper.runPath(event.item);
  }

  // Delete specific items for debugging
  if (event.item) {
    if (event.item.children) {
      paper.utils.ungroupAllGroups(event.item.parent);
    } else {
      event.item.remove();
    }
  }

}

canvas.paperInit(paper);
