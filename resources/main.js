global.$ = $;

var cncserver = require('cncserver');
var barHeight = 40;
var isModal = false;
$subwindow = {}; // Placeholder for subwindow iframe

// Pull the list of available ports
cncserver.getPorts(function(ports) {
  for (var portID in ports){
    var o = $('<option>')
      .attr('value', ports[portID].comName)
      .attr('title', ports[portID].pnpId);
    o.text(ports[portID].comName);

    o.appendTo('select#ports');
  }
});

/**
 * Central home screen initialization function
 */
function initialize() {
  // Add the secondary page iFrame to the page
  $subwindow = $('<iframe>').attr({
    height: $(window).height()-barHeight,
    border: 0,
    id: 'subwindow'
  }).css('top', $(window).height());

  $subwindow.appendTo('body');

  // Prep the connection status overlay
  var $stat = $('body.home h1');

  var $opt = $('<div>').addClass('options')
        .text('What do you want to do?');
  $opt.append(
    $('<div>').append(
      $('<button>').addClass('continue').click(function(e){
        $stat.fadeOut('slow');
        cncserver.continueSimulation();
        cncserver.serialReadyInit();
        setModal(false);
      }).text('Continue in Simulation mode'),

      $('<button>').addClass('reconnect').click(function(e){
        // TODO: Reconnect!
        setSettingsWindow(true);
      }).text('Try to Reconnect')
    )
  );

  // Actually try to init the connection and handle the various callbacks
  cncserver.start({
    success: function() {
      $stat.text('Port found, connecting...');
    },
    error: function(err) {
      $stat.attr('class', 'warning')
        .text('Couldn\'t connect! - ' + err);
      $opt.appendTo($stat);
    },
    connect: function() {
      $stat.text('Connected!')
        .attr('class', 'success')
        .fadeOut('slow');
      setModal(false);
      $('body.home nav').fadeIn('slow');
    },
    disconnect: function() {
      setModal(true);
      $stat.show()
        .attr('class', 'error')
        .text('Bot Disconnected!');
      $opt.appendTo($stat);
    }
  });
}

// When the window is done loading, it will call this.
function fadeInWindow() {
  if ($subwindow.offset().top != barHeight) {
    $subwindow.hide().css('top', barHeight).fadeIn('slow');

    $(window).resize(function(){
      $subwindow.height($(window).height()-barHeight);
    });
  }
}

// Document Ready...
$(function() {
  initialize();

  // Bind links for home screen central links
  $('nav a').click(function(e) {
    // Start the iframe loading, stuck at the bottom of the window...
     $('#bar-' + e.target.id).click();
    return false;
  });

  // Bind links for toolbar
  $('#bar a').click(function(e) {
    var $target = $(e.target);
    var id = $target[0].id;

    // Don't do anything fi already selected
    if ($target.is('.selected')) {
      return false;
    }

    // Don't select settings (as it's a modal on top window)
    if (id !== 'bar-settings') {
      $('#bar a.selected').removeClass('selected');
      $target.addClass('selected');
    }

    switch (id) {
      case 'bar-home':
        $('iframe').fadeOut('slow');
        break;
      case 'bar-settings':
        setSettingsWindow(true);
        break
      default:
        $subwindow.attr('src', $target.attr('href'));
    }
    return false;
  });


  // Bind settings
  $('#settings-done').click(function(e) {
    setSettingsWindow(false);
  });
})

/* Settings Management */

$(window).keydown(function (e){
  if (isModal) {
    if (e.keyCode == 27) {
      $('#settings-done').click();
    }
  }

});

/**
 * Fade in/out settings modal window
 */
function setSettingsWindow(toggle) {
  if (toggle) {
    $('#settings').fadeIn('slow');
  } else {
    $('#settings').fadeOut('slow');
  }
  setModal(toggle);
}

function setModal(toggle){
  if (toggle) {
    $('#modalmask').fadeIn('slow');
  } else {
    $('#modalmask').fadeOut('slow');
  }

  isModal = toggle;
}
