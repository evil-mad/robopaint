# WaterColorBot Paint colorsets
Everything you need to know to make your own!

## First Steps
So you've got a new set of watercolor paint that RoboPaint doesn't know about?
First you've got to paint a swatch!

All colors shown in the application aren't meant to be the colors as they look
in the set, but **how they look painted on white paper**. That way the
auto-coloring algorithm can be as close as possible when matching drawings to
what they might look like painted.

So, what are you waiting for? Wet your brush, get some nice bright white paper,
and make a swatch of all the colors, with each brush stroke about 2 inches long.
Once that's dried, you're ready for the next step.

## File Structure
RoboPaint for WaterColorBot colorsets consist of a minimum of two files per
colorset with a given machine name (EG "my_colorset"), in a folder with that
same name. The whole structure might look like this, inside of this
`resources/colorsets/` folder:

```
 |- my_colorset/
 |-- my_colorset.css
 |-- my_colorset.json
```

We recommend simply copying the [classic_crayola](classic_crayola) colorset that
came with RoboPaint, and renaming the folder and the two files.

## File Format: JSON
The format for the JSON file is incredibly simple, even if you've never touched
a JSON file before. Just use the existing file, and swap out the name, css file
name, and a simplified version for the baseClass with underscores replaced with
dashes. EG:

```javascript
[{
  "type": "Custom",
  "name": "My Colorset",
  "media": "watercolor",
  "weight" : 10,
  "description": "My custom color set! Isn't it great?"
  "styles" : {
    "src" : "my_colorset.css",
    "baseClass": "my-colorset"
  },
  "colors": [
    {"Periwinkle": "#a3b4aa"},
    {"Puce": "#bb39b9"},
    {"Purple": "#abcdef"},
    {"Pink": "#12ab34"},
    {"Pugnatious Pug": "#34AB12"},
    {"Pale Parnsip": "#694236"},
    {"Piquent Panda": "#444"},
    {"Pumpkin": "#aabbcc"}
  ]
}]
```

You can include as many colorsets as you want by adding another object to the
enclosing array. Make sure you have *only* 8 colors listed, with everything
surrounded by double quotes. Once complete, be sure and run your finished JSON
text through [JSON Lint](http://jsonlint.org) to make sure it's valid, otherwise
the app will silently fail.

## File Format: CSS
Following
[simple CSS formatting rules](http://www.w3schools.com/css/css_syntax.asp),
add in each color in the order they are placed on the physical paint set.

Fill in the css color hex code for each one using your keen eyeballs and a
[color picker](http://www.colorpicker.com/), or take a picture in sunlight, and
pick the colors with an eyedropper tool in a
[photo editor](http://www.gimp.org/). You can then add any other fancy rules
you'd like, even gradients. The actual color will be taken directly from the
JSON file, so it doesn't matter how crazy the colorset can be.

## You're done!
Just reload the program and your new colorset should show up, selectable
immediately in the Settings -> installed paint set dropdown.

Wasn't that easy? Here's a pat on the back and a chocolate chip cookie. Good job!
:cookie:

If you'd like to get ***your*** colorset back into the RoboPaint project,
just follow the instructions for contributing back with a pull request at the
bottom of [the main project readme](https://github.com/evil-mad/robopaint).