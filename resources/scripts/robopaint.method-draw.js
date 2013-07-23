/**
 * @file Holds all Robopaint specific overrides and JS modifications for Method
 * Draw. Any code here is executed in the space of the subwindow iframe that
 * Method Draw (SVG-edit) runs in.
 */

// Page load complete...
$(function() {
  parent.fadeInWindow(); // Trigger iframe window reposition / fade in
})
