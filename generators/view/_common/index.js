'use strict';
var path = require('path');
var globby = require('globby');
var Promise = require('bluebird');
var pathIsAbsolute = require('path-is-absolute');
var fs = require('fs-extra');
var _ = require('lodash');
var generators = require('yeoman-generator');

Promise.promisifyAll(fs);

module.exports = generators.Base.extend({

    /**
     * Re-read the content because a composed generator might modify it.
     * @returns {*}
     * @private
     */
    _readPkg: function () {
        return _.merge(this.fs.readJSON(this.destinationPath('package.json'), {
            name: _.camelCase(this.appname),
            version: '0.0.0',
            scripts: {},
            dependencies: {},
            devDependencies: {}
        }), {
            dependencies: {
                debug: '^2.2.0',
                jquery: '^3.1.1',
                picturefill: '^3.0.2',
                svg4everybody: '^2.1.0'
            }
        });
    },

    /**
     * Let's extend package.json so we're not overwriting user previous fields
     *
     * @private
     */
    _writePkg: function (pkg) {
        this.fs.writeJSON(this.destinationPath('package.json'), pkg);
    },

    _readBower: function () {
        var dependencies = {
            picturefill: '~3.0.1',
            modernizr: '~3.3.1',
            jquery: '~3.1.1'
        };

        return _.merge(this.fs.readJSON(this.destinationPath('bower.json'), {
            name: _.snakeCase(this.appname),
            private: true,
            dependencies: {}
        }), {dependencies: dependencies});
    },

    _writeBower: function (bower) {
        this.fs.writeJSON(this.destinationPath('bower.json'), bower);
    },

    addNpmDependencies: function (deps) {
        var pkg = _.merge(this._readPkg(), {
            dependencies: deps
        });

        return this._writePkg(pkg);
    },

    addBowerDependencies: function (deps) {
        var bower = _.merge(this._readBower(), {
            dependencies: deps
        });

        return this._writeBower(bower);
    },

    constructor: function () {
        generators.Base.apply(this, arguments);

        this.option('base', {
            type: String,
            desc: 'Base path',
            default: 'app/Resources/public'
        });

        this.props = _.merge({
            symfony: this.env.symfony || {commit: '3.1.5', version: 3.1},
            safeAppame: _.camelCase(this.appname)
        }, this.options);
    },

    commonTemplatePath: function () {
        var filepath = path.join.apply(path, arguments);

        if (!pathIsAbsolute(filepath)) {
            filepath = path.join(path.join(__dirname, 'templates'), filepath);
        }

        return filepath;
    },

    commonTemplate: function (source, dest, data, options) {
        if (typeof dest !== 'string') {
            options = data;
            data = dest;
            dest = source;
        }

        this.fs.copyTpl(
            path.join(this.commonTemplatePath(), source),
            this.destinationPath(dest),
            data || this,
            options
        );
        return this;
    },

    /**
     * Saving configurations and configure the project (creating .editorconfig files and other metadata files)
     */
    addConfigFiles: function () {
        this.commonTemplate('editorconfig', '.editorconfig');
        this.commonTemplate('eslintrc', '.eslintrc');
        this.commonTemplate('jscsrc', '.jscsrc');
        this.commonTemplate('babelrc', '.babelrc');

        if (!this.props.noBower) {
            this.commonTemplate('bowerrc', '.bowerrc');
        }
    },

    /**
     * Add Service worker config
     */
    addServiceWorker: function () {
        this.commonTemplate('public/service-worker.js', path.join(this.props.base, 'service-worker.js'));
        this.commonTemplate('public/appcache-loader.html', path.join(this.props.base, 'appcache-loader.html'));
    },

    /**
     * Add Favicon
     */
    addFavicon: function () {
        this.commonTemplate('public/browserconfig.xml', path.join(this.props.base, 'browserconfig.xml'));
        this.commonTemplate('public/favicon.ico', path.join(this.props.base, 'favicon.ico'));
        this.commonTemplate('public/manifest.json', path.join(this.props.base, 'manifest.json'));
        this.commonTemplate('public/manifest.webapp', path.join(this.props.base, 'manifest.webapp'));

        return fs.copyAsync(this.commonTemplatePath('img', 'touch'), path.join(this.props.base, 'img/touch'));
    },

    addStyles: function () {
        var filesMap = {};
        filesMap.sass = '**/*.scss';
        filesMap.less = '**/*.less';
        filesMap.stylus = '**/*.styl';
        filesMap.none = '**/*.css';

        var roots = [
            path.join(this.commonTemplatePath('styles'), filesMap[this.props.preprocessor]),
            path.join(this.templatePath('styles'), filesMap[this.props.preprocessor])
        ];

        globby(roots).then(_.bind(function (paths) {
            _.forEach(paths, _.bind(function (file) {
                this.fs.copyTpl(
                    file,
                    this.destinationPath(path.join(this.props.base, 'styles', file.replace(/^.*styles\//, ''))),
                    this
                );
            }, this));
        }, this));

        return this;
    },

    /**
     * Add scripts from instance
     */
    addScripts: function () {
        var roots = [
            path.join(this.commonTemplatePath('scripts'), this.props.loader, '**/*.js'),
            path.join(this.templatePath('scripts'), this.props.loader, '**/*.js')
        ];

        globby(roots).then(_.bind(function (paths) {
            _.forEach(paths, _.bind(function (file) {
                this.fs.copyTpl(
                    file,
                    this.destinationPath(path.join(this.props.base, 'scripts', file.replace(/^.*scripts\/[^/]+\//, ''))),
                    this
                );
            }, this));
        }, this));

        var file = path.join('scripts', 'sw', 'runtime-caching.js');
        this.commonTemplate(file, path.join(this.props.base, file));

        // testfiles
        var dest = 'tests/Frontend';
        if (this.props.loader === 'jspm') {
            fs.copySync(
                this.commonTemplatePath(path.join('test', 'jspm')),
                this.destinationPath(dest)
            );
        } else if (this.props.loader === 'webpack') {
            fs.copySync(
                this.commonTemplatePath(path.join('test', 'webpack')),
                this.destinationPath(dest)
            );
        } else if (this.props.loader === 'browserify') {
            fs.copySync(
                this.commonTemplatePath(path.join('test', 'browserify')),
                this.destinationPath(dest)
            );
        }

        return this;
    },

    addTemplates: function () {
        fs.removeSync(this.destinationPath('app/Resources/views'));
        fs.mkdirsSync(this.destinationPath('app/Resources/views/controller/default'));

        // copy base template
        this.commonTemplate('base.html.twig', path.join(this.props.base, '..', 'views', 'base.html.twig'));

        // copy default action template
        this.template('index.html.twig', path.join(this.props.base, '..', 'views', 'controller', 'default', 'index.html.twig'));

        fs.copySync(this.commonTemplatePath('img'), path.join(this.props.base, 'img'));
    },

    addFonts: function () {
        var dest = this.destinationPath('app/Resources/public/fonts');
        fs.mkdirsSync(dest);

        var src = this.destinationPath(this.props.noBower ? 'node_modules' : 'bower_components');

        var fontpath = '-';

        if (this.props.view === 'bootstrap' && this.props.preprocessor === 'sass') {
            fontpath = path.join(src, this.props.noBower ? 'bootstrap-sass' : 'bootstrap-sass-official', 'assets', 'fonts');
        } else if (this.props.view === 'bootstrap' && this.props.preprocessor === 'stylus') {
            fontpath = path.join(src, 'bootstrap-stylus', 'fonts');
        } else if (this.props.view === 'uikit') {
            fontpath = path.join(src, 'uikit', 'fonts');
        }

        if (fs.existsSync(fontpath)) {
            fs.copySync(fontpath, dest);
        }
    }

});
