/**
 * @file Holds all RoboPaint manual/auto painting mode specific code
 */

// Initialize the RoboPaint canvas Paper.js extensions & layer management.
canvas.paperInit(paper);
rpRequire('paper_utils')(paper);
rpRequire('auto_stroke')(paper);
rpRequire('auto_fill')(paper);

// Init defaults & settings
paper.settings.handleSize = 10;

// Reset Everything on non-mainLayer and vars
paper.resetAll = function() {
  // Stop all Fill and trace spooling (if running)
  paper.stroke.shutdown();
  paper.fill.shutdown();

  paper.canvas.mainLayer.opacity = 1;

  paper.canvas.tempLayer.removeChildren();
  paper.canvas.actionLayer.removeChildren();
}

// Animation frame callback
function onFrame(event) {
  canvas.onFrame(event);
  paper.stroke.onFrameStep();
  paper.fill.onFrameStep();
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
      paper.utils.ungroupAllGroups(paper.canvas.mainLayer);
    } else {
      paper.canvas.mainLayer.opacity = 0.2;
      paper.stroke.setup({path: event.item});
    }
  }

}

// Render the "action" layer, this is actually what will become the motion path
// sent to the bot.
paper.renderMotionPaths = function (callback) {
  paper.canvas.mainLayer.opacity = 0.1;
  paper.canvas.tempLayer.opacity = 0.3;

  paper.stroke.setup(function() {
    paper.fill.setup(function(){
      if (_.isFunction(callback)) callback();
    });
  });
};
