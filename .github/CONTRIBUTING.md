# Contributing to RoboPaint

Welcome, and thank you for helping us make this little project the best it can
be!

When contributing to this repository, please first discuss the change you wish
to make via an issue, or on [Gitter chat](https://gitter.im/evil-mad/robopaint) before
jumping straight in to making a change that you wish to be part of the project.

Please note we have a code of conduct (at the bottom of this document), please
follow it in all your interactions with the project.

## Issues:
RoboPaint in its latest iteration is actually a tight grouping of smaller
projects called "modes". Outside of modes, RoboPaint provides the shared APIs
used by modes for automatic painting, settings management, robot selection,
color management, and of course the management of the CNCServer API. If your
problem or fix effects any of the above, it's likely to be found in RoboPaint,
but if not, or you're not sure, it might just be for an individual mode.

Each mode has its own issue tracker. If this is an issue with a mode please file
the issue in the mode's repository. You can find a listing of the modes and
their associated repositories in
[the projects section of the readme](https://github.com/evil-mad/robopaint#projects).

Before filling an issue or PR, please check if the bug or feature request
already exists in the central
[issue list](https://github.com/evil-mad/robopaint/issues).

## Reporting bugs:

### How to get version number:
<div style="text-align: center;"><img src="https://cloud.githubusercontent.com/assets/320747/18774445/2742ce00-810e-11e6-85f4-d222da447309.png"></div>
To the bottom right of the RoboPaint text in the top middle of the window you
should see the version in parentheses starting with `v`. This will be hidden
if your window size is too small.

## Pull Requests
We only have a few rules for PRs:
1. Make sure your code is clean, well documented, and matches our 2 space tabs
and jshint linting.
2. Make sure it doesn't break anything else, and that you've tested it!

## Contributor Code of Conduct

As contributors and maintainers of this project, and in the interest of
fostering an open and welcoming community, we pledge to respect all people who
contribute through reporting issues, posting feature requests, updating
documentation, submitting pull requests or patches, and other activities.

We are committed to making participation in this project a harassment-free
experience for everyone, regardless of level of experience, gender, gender
identity and expression, sexual orientation, disability, personal appearance,
body size, race, ethnicity, age, religion, or nationality.

Examples of unacceptable behavior by participants include:

* The use of sexualized language or imagery
* Personal attacks
* Trolling or insulting/derogatory comments
* Public or private harassment
* Publishing other's private information, such as physical or electronic
addresses, without explicit permission
* Other unethical or unprofessional conduct

Project maintainers have the right and responsibility to remove, edit, or reject
comments, commits, code, wiki edits, issues, and other contributions that are
not aligned to this Code of Conduct. By adopting this Code of Conduct, project
maintainers commit themselves to fairly and consistently applying these
principles to every aspect of managing this project. Project maintainers who do
not follow or enforce the Code of Conduct may be permanently removed from the
project team.

This code of conduct applies both within project spaces and in public spaces
when an individual is representing the project or its community.

Instances of abusive, harassing, or otherwise unacceptable behavior may be
reported by opening an issue or contacting one or more of the project
maintainers directly.

This Code of Conduct is adapted from the
[Contributor Covenant](http://contributor-covenant.org), version 1.2.0,
available at
[http://contributor-covenant.org/version/1/2/0/](http://contributor-covenant.org/version/1/2/0/)
