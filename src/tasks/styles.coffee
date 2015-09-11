#debug  = require 'gulp-debug'
gulp   = require 'gulp'
rename = require 'gulp-rename'

util = require './_util'
path = util.path

cache_path       = "#{path.dir.cache}/#{path.build.styles}"
konstan_filename = 'konstan'


#-- Inline images optimization
gulp.task 'styles_images', ->
	imagemin = require 'gulp-imagemin'

	return gulp.src path.files.inline, base:path.dir.root
		.pipe imagemin util.imagemin_params()
		.pipe rename (path) -> path.dirname = util.assets_rename path.dirname; return
		.pipe gulp.dest path.dir.cache



#-- Lint SCSS
gulp.task 'styles_lint', ->
	scsslint = require 'gulp-scss-lint'

	return gulp.src path.files.styles_lint
		.pipe scsslint({
			config: path.config.scsslint
		})
		.pipe scsslint.failReporter()



#-- Convert constants to SCSS
gulp.task 'styles_constants', ->
	jsonsass = require 'gulp-json-sass'
	merge    = require 'merge-stream'

	streams = []
	for bname, bundle of util.bundles
		streams.push(
			util.vinyl_stream "#{konstan_filename}.json", JSON.stringify konstan: util.parse_konstan('styles', bundle.output.url)
				.pipe jsonsass()
				.pipe gulp.dest "#{cache_path}/#{bname}"
		)

	return merge.apply null, streams



#-- Compile
gulp.task 'styles_compile', ['styles_lint', 'styles_constants'], ->
	fs           = require 'fs-extra'
	merge        = require 'merge-stream'
	sass         = require 'gulp-ruby-sass'
	autoprefixer = require 'gulp-autoprefixer'
	replace      = require 'gulp-replace'
	gulpif       = require 'gulp-if'
	minifycss    = require 'gulp-minify-css'

	streams = []
	for bname, bundle of util.bundles

		# for each collection
		for collection, list of bundle.styles.collections

			# add konstan
			list.unshift "#{cache_path}/#{bname}/#{konstan_filename}"

			# require each file
			list[i] = "@import '#{item}';" for item, i in list

			fs.outputFileSync "#{cache_path}/#{bname}/collections/#{collection}.scss", """
				/*!\n * Generated by nwayo #{util.pkg.nwayo.version} for #{util.pkg.name}:#{bname}\n */\n
				#{list.join '\n'}
			"""

		# process all collections from this bundle
		streams.push(
			sass "#{cache_path}/#{bname}/collections/*.scss", {
					loadPath:      path.dir.root
					cacheLocation: path.dir.cache_sass
					compass:       true
					trace:         true
					sourcemap:     false
				}
				.pipe autoprefixer browsers: bundle.styles.options.autoprefixer
				.pipe gulpif( bundle.styles.options.minify, minifycss() )
				.pipe gulp.dest "#{bundle.output.build}/#{path.build.styles}"
		)

	return merge.apply null, streams



#-- Rebuild
gulp.task 'styles', (cb) ->
	del         = require 'del'
	runsequence = require 'run-sequence'

	list = [path.dir.cache_inline, path.dir.cache_sass]
	list.push "#{bundle.output.build}/#{path.build.styles}", "#{cache_path}/#{bname}" for bname, bundle of util.bundles

	del list, force:true, ->
		runsequence 'styles_images', 'styles_compile', cb
