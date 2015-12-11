//-------------------------------------
//-- Scripts
//-------------------------------------
'use strict';

let _         = require('lodash');
let yaml      = require('js-yaml');
let fs        = require('fs');
let exec      = require('child_process').exec;
let async     = require('async');
let merge     = require('merge-stream');
let gulp      = require('gulp');
let gulpif    = require('gulp-if');
let cache     = require('gulp-cached');
let include   = require('gulp-nwayo-include');
let uglify    = require('gulp-uglify');
let jshint    = require('gulp-jshint');
let stylish   = require('jshint-stylish');
let modernizr = require('modernizr');
//let debug = require('gulp-debug');

const PATH = global.nwayo.path;
const ENV  = global.nwayo.env;
const Util = global.nwayo.util;

let vendorCached = false;



//-- Lint JS
gulp.task('scripts-lint', () => {
	return gulp.src(PATH.files.scriptsLint)
		.pipe( cache('scripts', {optimizeMemory:true}) )

		.pipe( jshint() )

		.pipe( jshint.reporter({
			reporter: (files) => {
				files.forEach( file => delete cache.caches.scripts[file.file] );
			}
		}))
		.pipe( jshint.reporter(stylish) )
		.pipe( jshint.reporter('fail') )
	;
});


//-- Convert constants to JS
gulp.task('scripts-constants', () => {
	let streams = [];

	for (let name of Object.keys(ENV.bundles)) {
		let data = {
			nwayo:   ENV.pkg.nwayo.version,
			project: ENV.pkg.name,
			bundle:  name,
			konstan: Util.parseKonstan('scripts', name, ENV.bundles[name].output.url)
		};

		streams.push(
			Util.vinylStream(PATH.filename.konstanScripts, `var konstan = ${JSON.stringify(data, null, '\t')};`)
				.pipe( gulp.dest(`${PATH.dir.cacheScripts}/${name}`))
		);
	}

	return merge.apply(null, streams);
});


//-- Generate vendor libraries
gulp.task('scripts-vendors', (cb) => {

	let done = () => {
		vendorCached = true;
		cb();
	};

	// Run once on 'watch'
	if (!vendorCached) {

		async.parallel([

			// Modernizr
			(callback) => {
				modernizr.build(yaml.safeLoad(fs.readFileSync(PATH.config.modernizr, 'utf8')), function (result) {
					fs.writeFileSync(`${PATH.dir.cacheScripts}/${PATH.filename.modernizr}.${PATH.ext.scripts}`, result);
					callback(null);
				});
			},

			// lodash
			(callback) => {
				//let config = JSON.parse(fs.readFileSync(PATH.config.lodashPackage, 'utf8'));
				let bin = 'bin/lodash';
				let options = 'compact';

				exec(`${PATH.config.lodashRoot}/${bin} ${options} --development --output ${PATH.dir.cacheScripts}/${PATH.filename.lodash}.${PATH.ext.scripts}`, (error, stdout, stderr) => {
					if (error !== null) {
						console.log(stderr);
					}
					callback(null);
				});
			}

		], () => { done(); });

	} else {
		done();
	}
});



//-- Compile
gulp.task('scripts-compile', ['scripts-lint', 'scripts-constants', 'scripts-vendors'], () => {
	let streams = [];

	for (let name of Object.keys(ENV.bundles)) {
		let bundle = ENV.bundles[name];

		// For each collection
		for (let collection of Object.keys(bundle.scripts.collections)) {
			let list = _.cloneDeep(bundle.scripts.collections[collection]);

			// Resolve real filepaths
			let replacements = {
				konstan:   `${PATH.dir.cacheScripts}/${name}/${PATH.filename.konstan}`,
				lodash:    `${PATH.dir.cacheScripts}/${PATH.filename.lodash}`,
				modernizr: `${PATH.dir.cacheScripts}/${PATH.filename.modernizr}`
			};
			for (let name of Object.keys(replacements)) {
				let pos = list.indexOf(`~${name}`);
				if (pos !== -1) {
					list[pos] = replacements[name];
				}
			}

			// Require each file
			list.forEach((file, i) => {
				list[i] = `//= require ${file}`;
 			});

			let source = `${Util.getGeneratedBanner(name)} (function(global, undefined) { \n\t${list.join('\n')}\n })(typeof window !== 'undefined' ? window : this);\n`;

			streams.push(
				Util.vinylStream(`${collection}.${PATH.ext.scripts}`, source)
					.pipe( include({
						basePath: './',
						autoExtension: true,
						partialPrefix: true,
						fileProcess: Util.babelProcess
					}))
					.pipe( gulpif( bundle.scripts.options.minify && !ENV.watching, uglify({preserveComments:'some'})) )
					.pipe( gulp.dest(`${bundle.output.build}/${PATH.build.scripts}`) )
			);
		}
	}

	return merge.apply(null, streams)
		.on('end', () => Util.watchableTaskCompleted('Scripts compilation') )
	;
});


//-- Rebuild
gulp.task('scripts', cb => {
	Util.taskGrouper({ cb,
		tasks:       ['scripts-compile'],
		cleanBundle: (name, bundle) => {
			return [`${bundle.output.build}/${PATH.build.scripts}`, `${PATH.dir.cacheScripts}/${name}`];
		}
	});
});
