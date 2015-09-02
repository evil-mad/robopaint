# RoboPaint Modules
A RoboPaint module is a standard CommonJS standard node module only made for use
in RoboPaint, by RoboPaint modes & other code. All modes will have access to
`rpRequire()` to load these modules in by their shortcut name, returning their
module.exports, or loaded as a DOM script added to the page's `<head>` tag.
